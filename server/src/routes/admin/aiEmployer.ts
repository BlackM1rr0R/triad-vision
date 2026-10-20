import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, limiter, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { anonymisedName } from '../../lib/vacancies.js';
import { requestLocale, sendAiFailure } from '../../lib/aiWriting/common.js';
import { employerAiStatus, getEmployerTools, saveEmployerTools } from '../../lib/ai/features/employer/common.js';
import { PROFILE_LANGS, draftView, generateProfile, loadProfileTarget, profileContentSchema, scrubContent } from '../../lib/ai/features/employer/profile.js';
import { profilePdf } from '../../lib/ai/features/employer/pdf.js';
import { mountVacancyRoutes } from '../../lib/ai/features/employer/http.js';

/**
 * Staff AI tools for working with employers — mounted at /api/admin/ai/employer (STAFF+, ADMIN-scope AI cost):
 *   GET  /status                      can the AI buttons work right now (key, limits) + employer toggle
 *   PUT  /settings                    { companyEnabled } employers may use the vacancy writer (ADMIN+)
 *   POST /profile/generate            anonymised candidate (+ vacancy) → German / English profile draft (not saved)
 *   GET  /profile                     saved profile of an application (?applicationId) or candidate (?userId[&vacancyId])
 *   PUT  /profile                     saves the edited profile (audit AI_EMPLOYER_PROFILE_SAVED)
 *   POST /profile/propose             saves + shares it with the employer (audit AI_EMPLOYER_PROFILE_PROPOSED); the
 *                                     client then moves the application to PROPOSED with the existing status endpoint
 *   POST /profile/pdf                 PDF of the (possibly unsaved) profile card
 *   + the vacancy writer (lib/ai/features/employer/http.ts)
 */
export const adminAiEmployerRouter = Router();

const uid = (req: Request) => req.user!.id;
const genLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30, keyGenerator: (req) => `aiemp-p:${(req as Request).user?.id ?? 'anon'}` });

adminAiEmployerRouter.get('/status', async (req, res) => {
  const [status, tools] = await Promise.all([employerAiStatus(uid(req), 'ADMIN'), getEmployerTools()]);
  res.json({ ...status, companyEnabled: tools.companyEnabled });
});

adminAiEmployerRouter.put('/settings', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ companyEnabled: z.boolean() }).strict(), req.body);
  const value = await saveEmployerTools(body);
  await audit(req, 'AI_EMPLOYER_SETTINGS', 'setting:ai.employerTools', value);
  res.json(value);
});

// ─── Candidate profile ────────────────────────────────────────────────

const targetSchema = {
  applicationId: z.string().max(40).optional(),
  userId: z.string().max(40).optional(),
  vacancyId: z.string().max(40).optional(),
};
const hasTarget = (v: { applicationId?: string; userId?: string }) => !!(v.applicationId || v.userId);
const lang = z.enum(PROFILE_LANGS).default('de');

adminAiEmployerRouter.post('/profile/generate', genLimiter, async (req, res) => {
  const body = parse(z.object({ ...targetSchema, language: lang }).strict().refine(hasTarget, 'TARGET_REQUIRED'), req.body);
  const target = await loadProfileTarget(body);
  const r = await generateProfile(target, body.language, uid(req));
  if (!r.ok) return sendAiFailure(res, r.reason, requestLocale(req));
  res.json({ draft: { content: r.value, language: body.language, model: r.model, costUsd: r.costUsd }, name: anonymisedName(target.user) });
});

const findSaved = (t: { applicationId?: string | null; userId: string; vacancyId?: string | null }) =>
  t.applicationId
    ? prisma.candidateProfileDraft.findUnique({ where: { applicationId: t.applicationId } })
    : prisma.candidateProfileDraft.findFirst({ where: { userId: t.userId, applicationId: null, vacancyId: t.vacancyId ?? null }, orderBy: { updatedAt: 'desc' } });

adminAiEmployerRouter.get('/profile', async (req, res) => {
  const q = parse(z.object(targetSchema).refine(hasTarget, 'TARGET_REQUIRED'), req.query);
  const target = await loadProfileTarget(q);
  const saved = await findSaved({ applicationId: target.application?.id, userId: target.user.id, vacancyId: target.vacancy?.id });
  res.json({ profile: saved ? draftView(saved) : null, name: anonymisedName(target.user), applicationStatus: target.application?.status ?? null });
});

const saveSchema = z
  .object({ ...targetSchema, language: lang, content: profileContentSchema, model: z.string().max(120).nullable().optional(), costUsd: z.number().min(0).max(100).optional() })
  .strict()
  .refine(hasTarget, 'TARGET_REQUIRED');

const saveProfile = async (req: Request, body: z.infer<typeof saveSchema>, share: boolean) => {
  const target = await loadProfileTarget(body);
  const app = target.application;
  const data = {
    language: body.language,
    content: scrubContent(body.content, [target.user.lastName]) as unknown as Prisma.InputJsonValue,
    ...(body.model !== undefined ? { model: body.model } : {}),
    ...(body.costUsd !== undefined ? { costMicros: Math.round(body.costUsd * 1e6) } : {}),
    createdById: uid(req),
    ...(share ? { sharedAt: new Date() } : {}),
  };
  const existing = await findSaved({ applicationId: app?.id, userId: target.user.id, vacancyId: target.vacancy?.id });
  const row = existing
    ? await prisma.candidateProfileDraft.update({ where: { id: existing.id }, data })
    : await prisma.candidateProfileDraft.create({ data: { ...data, applicationId: app?.id ?? null, userId: target.user.id, vacancyId: app?.vacancyId ?? target.vacancy?.id ?? null } });
  return { row, target };
};

adminAiEmployerRouter.put('/profile', async (req, res) => {
  const body = parse(saveSchema, req.body);
  const { row } = await saveProfile(req, body, false);
  await audit(req, 'AI_EMPLOYER_PROFILE_SAVED', row.applicationId ? `application:${row.applicationId}` : `user:${row.userId}`, { profileId: row.id, language: row.language });
  res.json({ profile: draftView(row) });
});

const SHAREABLE_FROM = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];

adminAiEmployerRouter.post('/profile/propose', async (req, res) => {
  const body = parse(saveSchema, req.body);
  if (!body.applicationId) throw badRequest('APPLICATION_REQUIRED');
  const app = await prisma.vacancyApplication.findUnique({
    where: { id: body.applicationId },
    select: { status: true, vacancy: { select: { companyId: true, company: { select: { status: true } } } } },
  });
  if (!app) throw notFound('APPLICATION_NOT_FOUND');
  if (!SHAREABLE_FROM.includes(app.status)) throw conflict('APPLICATION_WITHDRAWN');
  if (!app.vacancy.companyId) throw conflict('VACANCY_HAS_NO_COMPANY');
  if (app.vacancy.company?.status !== 'ACTIVE') throw conflict('COMPANY_NOT_ACTIVE');
  const { row } = await saveProfile(req, body, true);
  await audit(req, 'AI_EMPLOYER_PROFILE_PROPOSED', `application:${body.applicationId}`, { profileId: row.id, language: row.language, companyId: app.vacancy.companyId });
  res.json({ profile: draftView(row), needsStatusChange: !['PROPOSED', 'INTERVIEW', 'ACCEPTED'].includes(app.status) });
});

adminAiEmployerRouter.post('/profile/pdf', async (req, res) => {
  const body = parse(z.object({ ...targetSchema, language: lang, content: profileContentSchema }).strict().refine(hasTarget, 'TARGET_REQUIRED'), req.body);
  const target = await loadProfileTarget(body);
  const title = target.vacancy?.title as Record<string, string> | undefined;
  const name = anonymisedName(target.user);
  const pdf = await profilePdf({ content: scrubContent(body.content, [target.user.lastName]), lang: body.language, name, position: title ? (body.language === 'en' ? title.en : title.de) || title.de || null : null });
  const file = `Kandidatenprofil-${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/-+$/, '')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file)}`);
  res.send(pdf);
});

// ─── Vacancy writer (staff) ───────────────────────────────────────────

mountVacancyRoutes(adminAiEmployerRouter, {
  scope: 'ADMIN',
  guard: async () => {},
  company: () => null,
  ownVacancy: async (_req, _res, id) => {
    if (!(await prisma.vacancy.count({ where: { id } }))) throw notFound('VACANCY_NOT_FOUND');
  },
});
