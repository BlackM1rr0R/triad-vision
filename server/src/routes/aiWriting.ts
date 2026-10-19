import { Router, type Request } from 'express';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { aiComplete, CHEAP_MODEL } from '../lib/ai/complete.js';
import { pickL10n } from '../lib/jobsNotifications.js';
import { openVacancyWhere } from '../lib/vacancies.js';
import { readCv } from '../lib/cv/schema.js';
import { cvProfileSelect } from '../lib/cv/load.js';
import { requestLocale, sendAiFailure } from '../lib/aiWriting/common.js';
import { CV_SYSTEM, cvDraftSchema, cvPrompt, toCvData } from '../lib/aiWriting/cv.js';
import { LETTER_SYSTEM, REWRITE_SYSTEM, letterDraftSchema, letterPrompt, letterRewriteSchema, toLetterDraft, type LetterJob } from '../lib/aiWriting/letter.js';
import { recommendationsFor } from '../lib/aiWriting/recommendations.js';

/**
 * AI writing helpers for clients — mounted at /api/ai-writing (CLIENT only, CLIENT-scope AI cost):
 *   POST /cv-draft          wizard answers → German CV entries (draft, not saved)
 *   POST /letter-draft      vacancy or company/position → German cover letter + explanation (draft)
 *   POST /letter-rewrite    shorter / more formal / more personal variant of a letter (draft)
 *   GET  /recommendations   top matching published vacancies, with AI "why" lines when available
 * AI failures: 403 AI_DISABLED, 429 AI_LIMIT { reason, message }, 503 AI_UNAVAILABLE.
 */
export const aiWritingRouter = Router();
aiWritingRouter.use(requireRole('CLIENT'));

// Bursts of drafts would burn the client's tiny daily budget in seconds; the AI limits still apply on top.
const draftLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 12, keyGenerator: (req) => `aiw:${(req as Request).user?.id ?? 'anon'}` });

const uid = (req: { user?: { id: string } }) => req.user!.id;

aiWritingRouter.post('/cv-draft', draftLimiter, async (req, res) => {
  const body = parse(cvDraftSchema, req.body);
  const locale = requestLocale(req);
  const [profile, row] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: uid(req) }, select: cvProfileSelect }),
    prisma.candidateCv.findUnique({ where: { userId: uid(req) }, select: { data: true } }),
  ]);
  const r = await aiComplete({
    userId: uid(req),
    scope: 'CLIENT',
    purpose: 'cv-draft',
    model: CHEAP_MODEL,
    system: CV_SYSTEM,
    input: cvPrompt(body, profile, readCv(row?.data)),
    maxTokens: 1100,
    json: true,
    timeoutMs: 45_000,
  });
  if (!r.ok || !r.json) return sendAiFailure(res, r.ok ? 'BAD_OUTPUT' : r.reason, locale);
  const draft = toCvData(r.json);
  if (!draft.headline && !draft.experience.length && !draft.education.length) return sendAiFailure(res, 'BAD_OUTPUT', locale);
  res.json({ draft });
});

/** Job facts for the letter: a published (or applied-to) vacancy, or what the client typed. */
const letterJob = async (userId: string, body: { vacancyId?: string; company?: string; position?: string; city?: string }): Promise<{ job: LetterJob; vacancyId: string | null }> => {
  if (!body.vacancyId) return { job: { position: body.position!, company: body.company, city: body.city }, vacancyId: null };
  const v = await prisma.vacancy.findFirst({
    where: { id: body.vacancyId, OR: [openVacancyWhere(), { applications: { some: { userId } } }, { cases: { some: { clientId: userId } } }] },
    select: { id: true, title: true, description: true, requirements: true, city: true, showCompany: true, company: { select: { name: true } } },
  });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  const reqs = v.requirements && typeof v.requirements === 'object' ? ((v.requirements as Record<string, unknown>).de ?? (v.requirements as Record<string, unknown>).en) : null;
  return {
    vacancyId: v.id,
    job: {
      position: body.position || pickL10n(v.title, 'de'),
      company: body.company || (v.showCompany ? (v.company?.name ?? null) : null),
      city: body.city || v.city,
      tasks: pickL10n(v.description, 'de'),
      requirements: Array.isArray(reqs) ? reqs.filter((x) => typeof x === 'string').join('; ') : null,
    },
  };
};

aiWritingRouter.post('/letter-draft', draftLimiter, async (req, res) => {
  const body = parse(letterDraftSchema, req.body);
  const locale = requestLocale(req);
  const explainLang = body.explainLang ?? locale;
  const { job, vacancyId } = await letterJob(uid(req), body);
  const [profile, row] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: uid(req) }, select: cvProfileSelect }),
    prisma.candidateCv.findUnique({ where: { userId: uid(req) }, select: { data: true } }),
  ]);
  const r = await aiComplete({
    userId: uid(req),
    scope: 'CLIENT',
    purpose: 'letter-draft',
    model: CHEAP_MODEL,
    system: LETTER_SYSTEM(explainLang),
    input: letterPrompt(job, profile, readCv(row?.data), body.notes),
    maxTokens: 900,
    json: true,
    timeoutMs: 45_000,
  });
  if (!r.ok || !r.json) return sendAiFailure(res, r.ok ? 'BAD_OUTPUT' : r.reason, locale);
  const draft = toLetterDraft(r.json, `Bewerbung als ${job.position}`);
  if (!draft) return sendAiFailure(res, 'BAD_OUTPUT', locale);
  res.json({ draft: { ...draft, vacancyId, company: job.company ?? null, position: job.position, city: job.city ?? null } });
});

aiWritingRouter.post('/letter-rewrite', draftLimiter, async (req, res) => {
  const body = parse(letterRewriteSchema, req.body);
  const locale = requestLocale(req);
  const explainLang = body.explainLang ?? locale;
  const r = await aiComplete({
    userId: uid(req),
    scope: 'CLIENT',
    purpose: 'letter-rewrite',
    model: CHEAP_MODEL,
    system: REWRITE_SYSTEM(explainLang, body.variant),
    input: `Subject: ${body.title}\n\n${body.body}`,
    maxTokens: 900,
    json: true,
    timeoutMs: 45_000,
  });
  if (!r.ok || !r.json) return sendAiFailure(res, r.ok ? 'BAD_OUTPUT' : r.reason, locale);
  const draft = toLetterDraft(r.json, body.title);
  if (!draft) return sendAiFailure(res, 'BAD_OUTPUT', locale);
  res.json({ draft: { ...draft, variant: body.variant } });
});

aiWritingRouter.get('/recommendations', async (req, res) => {
  res.json(await recommendationsFor(uid(req), requestLocale(req)));
});
