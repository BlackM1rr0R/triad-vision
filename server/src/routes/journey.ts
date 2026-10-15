import { Router } from 'express';
import { z } from 'zod';
import type { CaseStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { isStaff, requireAuth, requireMinRole, type AuthUser } from '../middleware/auth.js';
import { FINAL_STATUSES } from '../lib/caseFlow.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { forecastForCase } from '../lib/journey/forecast.js';
import { approvedCaseFor, onboardingForCase } from '../lib/journey/onboarding.js';
import { GERMAN_TEST_LEVELS, LANGUAGE_CERT_KEYS, LEVEL_RANK, pickBalanced, scoreTest, TEST_SIZE } from '../lib/journey/german.js';
import { addFamilyMember, familyGroup, RELATIONS, removeFamilyMember } from '../lib/journey/family.js';
import { audit } from '../lib/audit.js';

/**
 * Client journey — mounted at /api/journey. Everything a signed-in client needs around their case:
 * expected dates, the post-arrival checklist, German preparation and the family group. Staff may
 * read a case's forecast / family group too (the admin panel embeds them).
 */
export const journeyRouter = Router();
journeyRouter.use(requireAuth);

/** The case when the caller owns it or is staff; 404 otherwise (never reveals existence). */
const accessibleCase = async (caseId: string, user: AuthUser) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, status: true } });
  if (!c || (c.clientId !== user.id && !isStaff(user))) throw notFound('CASE_NOT_FOUND');
  return c;
};

const requireClient = (role: string) => {
  if (role !== 'CLIENT') throw forbidden('CLIENTS_ONLY');
};

// ─── Forecast ──────────────────────────────────────────────────────────

journeyRouter.get('/cases/:id/forecast', async (req, res) => {
  const c = await accessibleCase(String(req.params.id), req.user!);
  res.json({ forecast: await forecastForCase(c.id) });
});

// ─── Family group ──────────────────────────────────────────────────────

journeyRouter.get('/cases/:id/family', async (req, res) => {
  const c = await accessibleCase(String(req.params.id), req.user!);
  res.json(await familyGroup(c.id));
});

/** Staff add a family member: a new case for the same client under the main case. */
journeyRouter.post('/cases/:id/family', requireMinRole('STAFF'), async (req, res) => {
  const body = parse(
    z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      relation: z.enum(RELATIONS),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      email: z.string().trim().email().max(190).nullable().optional().or(z.literal('')),
      profession: z.string().trim().max(120).nullable().optional(),
    }),
    req.body ?? {},
  );
  const created = await addFamilyMember(String(req.params.id), req.user!.id, { ...body, email: body.email || null });
  await audit(req, 'FAMILY_MEMBER_ADDED', `case:${created.id}`, { parentCaseId: String(req.params.id), relation: body.relation });
  res.status(201).json({ case: created, ...(await familyGroup(String(req.params.id))) });
});

journeyRouter.delete('/cases/:id/family/:memberId', requireMinRole('STAFF'), async (req, res) => {
  await removeFamilyMember(String(req.params.id), String(req.params.memberId));
  await audit(req, 'FAMILY_MEMBER_REMOVED', `case:${String(req.params.memberId)}`, { parentCaseId: String(req.params.id) });
  res.json({ ok: true, ...(await familyGroup(String(req.params.id))) });
});

// ─── Post-arrival onboarding ───────────────────────────────────────────

journeyRouter.get('/onboarding', async (req, res) => {
  requireClient(req.user!.role);
  const { caseId } = parse(z.object({ caseId: z.string().optional() }), req.query);
  const c = await approvedCaseFor(req.user!.id, caseId);
  const data = await onboardingForCase(c);
  res.json({ case: c, ...data });
});

journeyRouter.put('/onboarding/:itemId', async (req, res) => {
  requireClient(req.user!.role);
  const body = parse(z.object({ done: z.boolean(), note: z.string().trim().max(1000).nullable().optional(), caseId: z.string().optional() }), req.body ?? {});
  const c = await approvedCaseFor(req.user!.id, body.caseId);
  if (!c) throw conflict('NO_APPROVED_CASE');
  const item = await prisma.onboardingItem.findUnique({ where: { id: String(req.params.itemId) } });
  if (!item || !item.published) throw notFound('ITEM_NOT_FOUND');
  const doneAt = body.done ? new Date() : null;
  const row = await prisma.caseOnboarding.upsert({
    where: { caseId_itemId: { caseId: c.id, itemId: item.id } },
    create: { caseId: c.id, itemId: item.id, doneAt, note: body.note ?? null },
    update: { doneAt, ...(body.note !== undefined ? { note: body.note } : {}) },
  });
  const data = await onboardingForCase(c);
  res.json({ item: { id: item.id, done: !!row.doneAt, doneAt: row.doneAt, note: row.note }, progress: data.progress });
});

// ─── German preparation ────────────────────────────────────────────────

/** Random, level-balanced test; the correct answers never leave the server. */
journeyRouter.get('/german/test', async (_req, res) => {
  const pool = await prisma.germanQuestion.findMany({ where: { published: true }, select: { id: true, level: true, question: true, options: true } });
  const questions = pickBalanced(pool, TEST_SIZE);
  res.json({ questions, size: questions.length, levels: GERMAN_TEST_LEVELS });
});

journeyRouter.post('/german/test', async (req, res) => {
  const { answers } = parse(z.object({ answers: z.record(z.string(), z.number().int().min(0).max(10)).refine((a) => Object.keys(a).length > 0, 'NO_ANSWERS') }), req.body ?? {});
  const ids = Object.keys(answers).slice(0, 100);
  const questions = await prisma.germanQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, level: true, answer: true } });
  if (!questions.length) throw badRequest('UNKNOWN_QUESTIONS');
  const score = scoreTest(questions, answers);
  res.json({ result: score, correct: Object.fromEntries(questions.map((q) => [q.id, q.answer])) });
});

/** The user confirms the level the test suggested (or picks one): stored on the profile. */
journeyRouter.put('/german/level', async (req, res) => {
  const { level } = parse(z.object({ level: z.enum(['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']) }), req.body ?? {});
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { germanLevel: level }, select: { germanLevel: true } });
  res.json({ germanLevel: user.germanLevel });
});

journeyRouter.get('/german/courses', async (_req, res) => {
  res.json({ items: await prisma.languageCourse.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } }) });
});

/** Required level, reached level and whether a language certificate is already on file. */
journeyRouter.get('/german/status', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { germanLevel: true } });
  const cases = await prisma.case.findMany({
    where: { clientId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      status: true,
      visaCategory: { select: { id: true, title: true, visaLabel: true, germanLevel: true } },
      requirements: {
        where: { key: { in: LANGUAGE_CERT_KEYS } },
        select: { id: true, key: true, stage: true, title: true, documents: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } } },
      },
    },
  });
  const active = cases.find((c) => !FINAL_STATUSES.includes(c.status as CaseStatus)) ?? cases[0] ?? null;
  const requirement = active?.requirements[0] ?? null;
  const latestDoc = requirement?.documents[0] ?? null;
  const certificate = requirement
    ? {
        caseId: active!.id,
        requirementId: requirement.id,
        stage: requirement.stage,
        title: requirement.title,
        status: requirement.documents.some((d) => d.status === 'ACCEPTED') ? 'accepted' : latestDoc ? (latestDoc.status === 'PENDING' ? 'pending' : 'rejected') : 'missing',
        uploadedAt: latestDoc?.createdAt ?? null,
        link: `/account/cases/${active!.id}#docs-${requirement.stage.toLowerCase()}`,
      }
    : null;
  const requiredLevel = active?.visaCategory?.germanLevel ?? null;
  const userLevel = user.germanLevel ?? null;
  res.json({
    userLevel,
    requiredLevel,
    meetsRequirement: requiredLevel ? (LEVEL_RANK[userLevel ?? 'none'] ?? 0) >= (LEVEL_RANK[requiredLevel] ?? 0) : null,
    case: active ? { id: active.id, number: active.number, status: active.status, visaCategory: active.visaCategory } : null,
    certificate,
  });
});
