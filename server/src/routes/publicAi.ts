import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Locale } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { aiComplete, CHEAP_MODEL } from '../lib/ai/complete.js';
import { getAiSettings } from '../lib/ai/settings.js';
import { monthSpentUsd } from '../lib/ai/limits.js';
import { rangesFor } from '../lib/journey/forecast.js';
import { pickL10n } from '../lib/jobsNotifications.js';
import { LANG_NAMES, str } from '../lib/aiWriting/common.js';
import { IP_PER_DAY, IP_PER_HOUR, LEADS_PER_HOUR, QUIZ_EXPLAIN_PER_HOUR, SESSION_TURNS, sessionTurns, takeHit, takeSessionTurn } from '../lib/publicAi/guard.js';
import { bookPublicUsage, publicUsageMonth, publicUsageToday } from '../lib/publicAi/usage.js';
import { retrieve } from '../lib/publicAi/knowledge.js';
import { INTENT_RE, MAX_TOKENS, OFFER_AFTER_TURNS, advisorInput, advisorSystem, chatSchema, chatSummary, detectLang, splitLead } from '../lib/publicAi/advisor.js';
import { PATH_LABEL_RE, answersSummary, eligibilityAnswersSchema, evaluateEligibility, weeksFromRanges, type PathResult } from '../lib/publicAi/eligibility.js';

/**
 * Public AI for visitors (no login) — mounted at /api/public-ai:
 *   GET  /status        { enabled, maxTurns }
 *   POST /chat          site advisor (JSON answer; 15/h and 40/day per IP, 12 turns per session, 400 tokens)
 *   POST /eligibility   deterministic quiz result + durations, optional AI explanation
 *   POST /lead          name + phone/e-mail with consent → Inquiry (source "AI advisor") + staff notification
 *   GET  /usage         super admin: today's / this month's anonymous usage
 * Costs are booked as aggregated daily totals (Setting `ai.publicUsage`); the global daily cap is
 * settings.publicDailyUsd, and the public spend also counts against the monthly budget.
 */
export const publicAiRouter = Router();

const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';

type Busy = 'DISABLED' | 'DAILY_CAP' | 'MONTHLY_BUDGET';

/** Null when anonymous AI may be used now. */
const publicBudget = async (): Promise<Busy | null> => {
  const s = await getAiSettings();
  if (!s.publicAdvisorEnabled) return 'DISABLED';
  const [today, month, spent] = await Promise.all([publicUsageToday(), publicUsageMonth(), monthSpentUsd()]);
  if (today.usd >= s.publicDailyUsd) return 'DAILY_CAP';
  if (spent + month.usd >= s.monthlyBudgetUsd) return 'MONTHLY_BUDGET';
  return null;
};

publicAiRouter.get('/status', async (_req, res) => {
  const s = await getAiSettings();
  res.json({ enabled: s.publicAdvisorEnabled, maxTurns: SESSION_TURNS });
});

// ─── Advisor chat ───────────────────────────────────────────────────────

const BOT_REPLY = 'Thank you! / Təşəkkür edirik!';

publicAiRouter.post('/chat', async (req, res) => {
  const body = parse(chatSchema, req.body);
  if (body.website) {
    // A bot filled the hidden field: answer like a success, spend nothing.
    res.json({ reply: BOT_REPLY, lang: body.lang, offerLead: false, turnsLeft: 0 });
    return;
  }
  const settings = await getAiSettings();
  if (!settings.publicAdvisorEnabled) {
    res.status(403).json({ error: 'PUBLIC_AI_DISABLED' });
    return;
  }
  const askedBefore = Math.max(sessionTurns(body.sessionId), body.history.filter((m) => m.role === 'user').length);
  if (askedBefore >= SESSION_TURNS) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', scope: 'session' });
    return;
  }
  const over = takeHit(`chat:${ipOf(req)}`, { hour: IP_PER_HOUR, day: IP_PER_DAY });
  if (over) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', scope: over });
    return;
  }
  const busy = await publicBudget();
  if (busy) {
    res.status(503).json({ error: busy === 'DISABLED' ? 'PUBLIC_AI_DISABLED' : 'PUBLIC_AI_BUSY', reason: busy });
    return;
  }
  const turns = Math.max(takeSessionTurn(body.sessionId), askedBefore + 1);
  const lang = detectLang(body.message, body.lang);
  const recentUser = body.history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');
  const { overview, excerpts } = await retrieve(lang, `${recentUser} ${body.message}`);
  const r = await aiComplete({
    userId: null,
    scope: 'CLIENT',
    purpose: 'public-advisor',
    model: CHEAP_MODEL,
    system: advisorSystem(lang, overview, excerpts),
    input: advisorInput(body.history, body.message),
    maxTokens: MAX_TOKENS,
    temperature: 0.3,
    timeoutMs: 25_000,
  });
  if (!r.ok) {
    const limit = r.reason !== 'TIMEOUT' && r.reason !== 'UPSTREAM' && r.reason !== 'BAD_OUTPUT';
    res.status(503).json({ error: limit ? 'PUBLIC_AI_BUSY' : 'AI_UNAVAILABLE', reason: r.reason });
    return;
  }
  void bookPublicUsage({ usd: r.costUsd, messages: 1 });
  const { reply, intent } = splitLead(r.text);
  res.json({
    reply: reply.slice(0, 2500),
    lang,
    offerLead: intent || INTENT_RE.test(body.message) || turns >= OFFER_AFTER_TURNS,
    turnsLeft: Math.max(0, SESSION_TURNS - turns),
  });
});

// ─── Eligibility quiz ───────────────────────────────────────────────────

const eligibilitySchema = z
  .object({
    answers: eligibilityAnswersSchema,
    lang: z.enum(['az', 'de', 'en', 'ru']).catch('az'),
    explain: z.boolean().default(false),
    website: z.string().max(200).optional(),
  })
  .strict();

const withDurations = async (paths: PathResult[], lang: Locale) => {
  const cats = await prisma.visaCategory.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, visaLabel: true, title: true } });
  return Promise.all(
    paths.map(async (p) => {
      const cat = cats.find((c) => PATH_LABEL_RE[p.key].test(c.visaLabel)) ?? null;
      const { minWeeks, maxWeeks } = weeksFromRanges(await rangesFor(cat?.id ?? null, p.visaType));
      return { ...p, minWeeks, maxWeeks, visa: cat ? { slug: cat.slug, label: cat.visaLabel, title: pickL10n(cat.title, lang) } : null };
    }),
  );
};

const EXPLAIN_SYSTEM = (lang: Locale) => `You explain the result of an indicative eligibility check for Germany to a visitor of Triad Vision, in ${LANG_NAMES[lang]}.
Write 3–5 friendly sentences (max 90 words): which path fits best and why, what to improve first, and that the free consultation confirms the details.
Use only the given facts. No guarantees, no legal advice, no markdown.`;

publicAiRouter.post('/eligibility', async (req, res) => {
  const body = parse(eligibilitySchema, req.body);
  const over = takeHit(`quiz:${ipOf(req)}`, { hour: 30 });
  if (over) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', scope: over });
    return;
  }
  const paths = await withDurations(evaluateEligibility(body.answers), body.lang);
  let explanation: string | null = null;
  if (body.explain && !body.website && !takeHit(`quiz-ai:${ipOf(req)}`, { hour: QUIZ_EXPLAIN_PER_HOUR }) && !(await publicBudget())) {
    const facts = [
      `Answers: ${answersSummary(body.answers)}`,
      ...paths.map((p) => `Path ${p.key} (${p.visa?.label ?? p.visaType}): score ${p.score}, fit ${p.fit}, ${p.minWeeks}–${p.maxWeeks} weeks; reasons ${p.reasons.join(',') || '—'}; missing ${p.missing.map((m) => JSON.stringify(m)).join(',') || '—'}`),
    ].join('\n');
    const r = await aiComplete({ userId: null, scope: 'CLIENT', purpose: 'public-eligibility', model: CHEAP_MODEL, system: EXPLAIN_SYSTEM(body.lang), input: facts, maxTokens: 250, timeoutMs: 20_000 });
    if (r.ok) {
      explanation = str(r.text, 1200) || null;
      void bookPublicUsage({ usd: r.costUsd, quiz: 1 });
    }
  }
  if (!explanation) void bookPublicUsage({ quiz: 1 });
  res.json({ paths, explanation });
});

// ─── Lead → Inquiry ─────────────────────────────────────────────────────

const leadSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{6,30}$/)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    note: z.string().trim().max(600).optional(),
    consent: z.literal(true),
    source: z.enum(['advisor', 'quiz']),
    lang: z.enum(['az', 'de', 'en', 'ru']).catch('az'),
    transcript: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }).strict())
      .max(24)
      .default([]),
    answers: eligibilityAnswersSchema.optional(),
    website: z.string().max(200).optional(),
  })
  .strict()
  .refine((b) => !!b.email || !!b.phone, { message: 'CONTACT_REQUIRED', path: ['email'] });

publicAiRouter.post('/lead', async (req, res) => {
  const body = parse(leadSchema, req.body);
  if (body.website) {
    res.status(201).json({ ok: true });
    return;
  }
  if (takeHit(`lead:${ipOf(req)}`, { hour: LEADS_PER_HOUR })) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', scope: 'hour' });
    return;
  }
  const parts: string[] = [`[AI advisor · ${body.source === 'quiz' ? 'uygunluq testi' : 'sayt çatı'}]`];
  if (body.note) parts.push('', body.note);
  if (body.answers) {
    const top = evaluateEligibility(body.answers);
    parts.push('', `Test cavabları: ${answersSummary(body.answers)}`, `Uyğun yollar: ${top.map((p) => `${p.key} (${p.score})`).join(', ')}`);
  }
  const summary = chatSummary(body.transcript);
  if (summary) parts.push('', 'Ziyarətçinin sualları:', summary);
  const message = parts.join('\n').slice(0, 5000);
  const inquiry = await prisma.inquiry.create({
    data: { kind: 'contact', contactName: body.name, email: body.email ?? '', phone: body.phone ?? null, sector: 'AI advisor', message, locale: body.lang },
  });
  void bookPublicUsage({ leads: 1 });
  const lines = [
    'Növ: AI məsləhətçi (sayt)',
    `Ad: ${body.name}`,
    body.email ? `Email: ${body.email}` : null,
    body.phone ? `Telefon: ${body.phone}` : null,
    `Dil: ${body.lang}`,
    '',
    message,
  ].filter((l): l is string => l !== null);
  await notifyStaff(`Yeni AI məsləhətçi müraciəti: ${body.name}`, lines.join('\n'), { link: '/admin/inquiries' });
  res.status(201).json({ ok: true, id: inquiry.id });
});

// ─── Usage (super admin) ────────────────────────────────────────────────

publicAiRouter.get('/usage', requireRole('SUPER_ADMIN'), async (_req, res) => {
  const [s, today, month] = await Promise.all([getAiSettings(), publicUsageToday(), publicUsageMonth()]);
  res.json({ today, month, dailyCapUsd: s.publicDailyUsd, enabled: s.publicAdvisorEnabled });
});
