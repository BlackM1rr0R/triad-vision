import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole, requireRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { caseReplyDraft, caseSummary, mailReplyDraft } from '../../lib/aiStaff/caseAi.js';
import { listRiskyCases } from '../../lib/aiStaff/risk.js';
import { isBriefingEnabled, sendBriefing, setBriefingEnabled } from '../../lib/aiStaff/briefing.js';
import { createPostDraft, improveParagraph } from '../../lib/aiStaff/postDraft.js';
import { asLocale } from '../../lib/aiStaff/texts.js';

/**
 * Staff and super-admin AI features — mounted at /api/admin/ai-staff (STAFF+, 2FA enforced by the admin router):
 *   GET/POST /cases/:id/summary        5-line case summary (GET = cached only, POST = generate when stale / refresh)
 *   POST     /cases/:id/reply-draft    reply draft for the client's latest message(s); never sent automatically
 *   POST     /mail/:messageId/reply-draft  same for a workspace e-mail linked to a case / client
 *   GET      /risks                    risky / stuck open cases (default: the caller's own)
 *   GET/PUT  /briefing                 daily briefing opt-in (ADMIN+); POST /briefing/test (SUPER_ADMIN)
 *   POST     /content/post-draft       blog post draft in 4 languages, saved unpublished (ADMIN+)
 *   POST     /content/improve          rewrites one paragraph (ADMIN+)
 * AI failures come back as `reason` (limits, timeout …) with HTTP 200 so the UI can explain them.
 */
export const adminAiStaffRouter = Router();

const localeBody = z.object({ locale: z.enum(['az', 'de', 'en', 'ru']).optional(), refresh: z.boolean().optional() });
const staffName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

const ensureCase = async (id: string) => {
  if (!(await prisma.case.count({ where: { id } }))) throw notFound('CASE_NOT_FOUND');
};

adminAiStaffRouter.get('/cases/:id/summary', async (req, res) => {
  await ensureCase(req.params.id);
  const locale = asLocale(typeof req.query.locale === 'string' ? req.query.locale : req.user!.locale);
  res.json(await caseSummary(req.params.id, { locale, userId: req.user!.id, generate: false }));
});

adminAiStaffRouter.post('/cases/:id/summary', async (req, res) => {
  await ensureCase(req.params.id);
  const body = parse(localeBody, req.body ?? {});
  const locale = asLocale(body.locale ?? req.user!.locale);
  res.json(await caseSummary(req.params.id, { locale, userId: req.user!.id, generate: true, refresh: body.refresh }));
});

const draftBody = z.object({ instructions: z.string().trim().max(300).optional(), refresh: z.boolean().optional() });

adminAiStaffRouter.post('/cases/:id/reply-draft', async (req, res) => {
  await ensureCase(req.params.id);
  const body = parse(draftBody, req.body ?? {});
  res.json(await caseReplyDraft(req.params.id, { userId: req.user!.id, staffName: staffName(req.user!), instructions: body.instructions || undefined, refresh: body.refresh }));
});

adminAiStaffRouter.post('/mail/:messageId/reply-draft', async (req, res) => {
  const body = parse(draftBody, req.body ?? {});
  res.json(await mailReplyDraft(req.params.messageId, { userId: req.user!.id, staffName: staffName(req.user!), instructions: body.instructions || undefined }));
});

adminAiStaffRouter.get('/risks', async (req, res) => {
  const q = parse(
    z.object({
      staffId: z.string().max(40).optional(), // "all", "none" (unassigned) or a user id; default: me
      minSeverity: z.enum(['high', 'medium', 'low']).optional(),
      locale: z.enum(['az', 'de', 'en', 'ru']).optional(),
    }),
    req.query,
  );
  const staffId = q.staffId === 'all' ? null : (q.staffId ?? req.user!.id);
  const [items, staff] = await Promise.all([
    listRiskyCases({ staffId, minSeverity: q.minSeverity ?? 'low', locale: asLocale(q.locale ?? req.user!.locale) }),
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
  ]);
  res.json({ items, staff: staff.map((s) => ({ id: s.id, name: staffName(s) })), staffId: staffId ?? 'all' });
});

adminAiStaffRouter.get('/briefing', requireMinRole('ADMIN'), async (req, res) => {
  res.json({ enabled: await isBriefingEnabled(req.user!.id), canTest: req.user!.role === 'SUPER_ADMIN' });
});

adminAiStaffRouter.put('/briefing', requireMinRole('ADMIN'), async (req, res) => {
  const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body ?? {});
  res.json({ enabled: await setBriefingEnabled(req.user!.id, enabled) });
});

adminAiStaffRouter.post('/briefing/test', requireRole('SUPER_ADMIN'), async (req, res) => {
  const u = req.user!;
  const r = await sendBriefing({ id: u.id, email: u.email, locale: asLocale(u.locale) }, { test: true });
  res.json(r);
});

adminAiStaffRouter.post('/content/post-draft', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      topic: z.string().trim().min(3).max(400),
      audience: z.enum(['candidates', 'employers', 'all']).default('all'),
      tone: z.enum(['friendly', 'professional', 'informative']).default('informative'),
      length: z.enum(['short', 'medium', 'long']).default('medium'),
      lang: z.enum(['az', 'de']).default('az'),
    }),
    req.body ?? {},
  );
  const r = await createPostDraft({ ...body, userId: req.user!.id });
  res.status(r.post ? 201 : 200).json(r);
});

adminAiStaffRouter.post('/content/improve', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ text: z.string().trim().min(3).max(3000), instruction: z.string().trim().max(200).optional() }), req.body ?? {});
  res.json(await improveParagraph({ ...body, userId: req.user!.id }));
});
