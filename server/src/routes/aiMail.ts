import { Router, type Request } from 'express';
import { z } from 'zod';
import type { MailTriage } from '@prisma/client';
import { prisma } from '../db.js';
import { requireMinRole, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, limiter, notFound, parse } from '../lib/http.js';
import { loadOwnMessage } from '../lib/mail/core.js';
import { getAiSettings, resolveApiKey } from '../lib/ai/settings.js';
import { checkLimits, limitMessage, type LimitReason } from '../lib/ai/limits.js';
import { requestLocale, sendAiFailure } from '../lib/aiWriting/common.js';
import {
  CATEGORIES,
  getTriageSettings,
  mailboxEnabled,
  saveTriageSettings,
  triageMessage,
  triageSettingsUpdateSchema,
  type TriageSettings,
} from '../lib/ai/features/mailTriage.js';
import { assignTriage, createLeadFromTriage, mailFactsOf, recordAction, summaryFor, type ExistingClientMatch, type TriageSummary } from '../lib/ai/features/mailTriageActions.js';

/**
 * AI triage of incoming mail — mounted at /api/ai-mail (STAFF+). Everything is a click:
 *   GET  /status                       is the feature usable for me (disabled / no key / limit reason + text)
 *   GET  /today?tz=                    "Inbox today" counts over my triage-enabled mailboxes
 *   GET  /staff                        staff picker
 *   GET  /messages/:id                 the triage card of one of MY messages (or null)
 *   POST /messages/:id/analyze         run (or re-run with { refresh: true }) the triage now
 *   POST /messages/:id/lead            create the Inquiry from the card (idempotent)
 *   POST /messages/:id/assign          { userId, mode: task | notify }
 *   POST /messages/:id/spam            record "marked as spam" (the client moves it with the mail action)
 *   POST /messages/:id/reply-used      record that the reply draft was opened
 *   POST /messages/:id/dismiss | /reopen
 *   GET|PUT /settings                  routing rules (SUPER_ADMIN)
 * Only the owner of the mailbox account can see or act on its messages (other staff get 404).
 */
export const aiMailRouter = Router();
aiMailRouter.use(requireMinRole('STAFF'));

const uid = (req: Request) => req.user!.id;
const id = z.string().trim().min(1).max(40);
const analyzeLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 40, keyGenerator: (req) => `aimail:${(req as Request).user?.id ?? 'anon'}` });

const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

const FEATURE_OFF_TEXT: Record<string, string> = {
  az: 'AI ilə e-poçt təhlili super admin tərəfindən söndürülüb.',
  de: 'Die KI-Analyse eingehender E-Mails ist vom Super-Admin ausgeschaltet.',
  en: 'AI mail triage is switched off by the super admin.',
  ru: 'AI-анализ входящих писем отключён супер-администратором.',
};

type Availability = { available: boolean; reason: LimitReason | 'FEATURE_OFF' | null; message: string | null };

const availability = async (req: Request, settings: TriageSettings): Promise<Availability> => {
  const locale = requestLocale(req);
  if (!settings.enabled) return { available: false, reason: 'FEATURE_OFF', message: FEATURE_OFF_TEXT[locale] ?? FEATURE_OFF_TEXT.en! };
  const ai = await getAiSettings();
  const key = resolveApiKey(ai);
  const reason = key
    ? await Promise.race([checkLimits({ id: uid(req) }, 'ADMIN', ai, key), new Promise<null>((r) => setTimeout(() => r(null), 3000))]).catch(() => null)
    : ('NO_API_KEY' as const);
  return reason ? { available: false, reason, message: limitMessage(reason, locale) } : { available: true, reason: null, message: null };
};

const person = (u: { id: string; firstName: string; lastName: string } | null | undefined) => (u ? { id: u.id, name: `${u.firstName} ${u.lastName}`.trim() } : null);

const LIMIT_REASONS = new Set(['DISABLED', 'DAILY_MESSAGES', 'DAILY_COST', 'MONTHLY_BUDGET', 'KEY_CREDIT', 'NO_API_KEY']);

/** The card as the client renders it. */
const triageDto = async (t: MailTriage, locale: string) => {
  const ids = [t.suggestedAssigneeId, t.assignedToId].filter((x): x is string => !!x);
  const [people, lead, visa] = await Promise.all([
    ids.length ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
    t.leadInquiryId ? prisma.inquiry.findUnique({ where: { id: t.leadInquiryId }, select: { id: true, status: true, createdAt: true } }) : Promise.resolve(null),
    t.visaCategorySlug ? prisma.visaCategory.findUnique({ where: { slug: t.visaCategorySlug }, select: { slug: true, title: true, visaLabel: true } }) : Promise.resolve(null),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const summary = (t.summary ?? null) as TriageSummary | null;
  const existing = (t.existingClient ?? null) as ExistingClientMatch | null;
  const visaTitle = visa?.title && typeof visa.title === 'object' ? ((visa.title as Record<string, string>)[locale] ?? (visa.title as Record<string, string>).en ?? visa.slug) : null;
  return {
    id: t.id,
    messageId: t.messageId,
    status: t.status,
    category: t.category,
    urgency: t.urgency,
    language: t.language,
    summary: summary ? { lang: summary.lang ?? null, text: summary.text ?? '', en: summary.en ?? '', shown: summaryFor(summary, locale) } : null,
    contact: t.contact ?? null,
    intent: t.intent,
    visaCategory: visa ? { slug: visa.slug, title: visaTitle, label: visa.visaLabel } : null,
    assigneeRole: t.assigneeRole,
    existingClient: existing ? { userId: existing.userId, name: existing.name, role: existing.role, caseId: existing.caseId, caseNumber: existing.caseNumber, companyName: existing.companyName, matchedBy: existing.matchedBy } : null,
    suggestedAssignee: person(t.suggestedAssigneeId ? byId.get(t.suggestedAssigneeId) : null),
    assignedTo: person(t.assignedToId ? byId.get(t.assignedToId) : null),
    replyDraft: t.replyDraft ?? null,
    lead,
    actions: Array.isArray(t.actions) ? t.actions : [],
    skipReason: t.skipReason,
    error: t.error,
    errorMessage: t.error && LIMIT_REASONS.has(t.error) ? limitMessage(t.error as LimitReason, locale) : null,
    model: t.model,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
};

/** My message + its triage row (404 for other people's mailboxes). */
const ownTriage = async (req: Request) => {
  const m = await loadOwnMessage(String(req.params.id), uid(req));
  const t = await prisma.mailTriage.findUnique({ where: { messageId: m.id } });
  return { m, t };
};

const requireDone = (t: MailTriage | null): MailTriage => {
  if (!t || !t.category || !['NEW', 'ACTIONED', 'DISMISSED'].includes(t.status)) throw badRequest('NOT_TRIAGED');
  return t;
};

// ─── Status & widgets ────────────────────────────────────────────────

aiMailRouter.get('/status', async (req, res) => {
  const settings = await getTriageSettings();
  const accounts = await prisma.mailAccount.findMany({ where: { userId: uid(req) }, select: { id: true, email: true }, orderBy: { createdAt: 'asc' } });
  res.json({
    enabled: settings.enabled,
    ...(await availability(req, settings)),
    canConfigure: req.user!.role === 'SUPER_ADMIN',
    mailboxes: accounts.map((a) => ({ accountId: a.id, email: a.email, auto: mailboxEnabled(settings, a) })),
  });
});

aiMailRouter.get('/today', async (req, res) => {
  const q = parse(z.object({ tz: z.coerce.number().int().min(-900).max(900).optional() }), req.query);
  const settings = await getTriageSettings();
  const accounts = (await prisma.mailAccount.findMany({ where: { userId: uid(req) }, select: { id: true, email: true } })).filter((a) => mailboxEnabled(settings, a));
  // Start of the viewer's local day (tz = Date.getTimezoneOffset() in minutes).
  const offset = q.tz ?? 0;
  const local = new Date(Date.now() - offset * 60_000);
  const since = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offset * 60_000);
  const empty = { enabled: settings.enabled, mailboxes: accounts.map((a) => a.email), since, total: 0, analysed: 0, open: 0, urgent: 0, byCategory: {} as Record<string, number> };
  if (!accounts.length) return res.json(empty);
  const where = { accountId: { in: accounts.map((a) => a.id) }, isDraft: false, date: { gte: since }, folder: { role: { in: ['INBOX', 'JUNK'] as ('INBOX' | 'JUNK')[] } } };
  const [total, rows] = await Promise.all([
    prisma.mailMessage.count({ where: { ...where, folder: { role: 'INBOX' } } }),
    prisma.mailTriage.findMany({ where: { message: where, status: { in: ['NEW', 'ACTIONED', 'DISMISSED'] } }, select: { category: true, urgency: true, status: true } }),
  ]);
  const byCategory: Record<string, number> = {};
  for (const r of rows) if (r.category) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  res.json({
    ...empty,
    total,
    analysed: rows.length,
    open: rows.filter((r) => r.status === 'NEW').length,
    urgent: rows.filter((r) => r.urgency === 'URGENT' && r.status !== 'DISMISSED').length,
    byCategory,
  });
});

aiMailRouter.get('/staff', async (_req, res) => {
  const staff = await prisma.user.findMany({ where: { isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, firstName: true, lastName: true, role: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: 300 });
  res.json({ staff: staff.map((s) => ({ ...person(s)!, role: s.role })) });
});

// ─── One message ─────────────────────────────────────────────────────

aiMailRouter.get('/messages/:id', async (req, res) => {
  const { m, t } = await ownTriage(req);
  const settings = await getTriageSettings();
  const account = await prisma.mailAccount.findUnique({ where: { id: m.accountId }, select: { id: true, email: true } });
  res.json({ triage: t ? await triageDto(t, requestLocale(req)) : null, autoMailbox: account ? mailboxEnabled(settings, account) : false });
});

aiMailRouter.post('/messages/:id/analyze', analyzeLimiter, async (req, res) => {
  const body = parse(z.object({ refresh: z.boolean().optional() }).default({}), req.body ?? {});
  const { m } = await ownTriage(req);
  const locale = requestLocale(req);
  const r = await triageMessage(m.id, { manual: true, force: !!body.refresh, actorId: uid(req) });
  if (!r.ok) {
    if (r.reason === 'FEATURE_OFF') return res.status(403).json({ error: 'AI_DISABLED', reason: 'FEATURE_OFF', message: FEATURE_OFF_TEXT[locale] ?? FEATURE_OFF_TEXT.en });
    if (r.reason === 'NOT_FOUND') throw notFound('MAIL_MESSAGE_NOT_FOUND');
    return sendAiFailure(res, r.reason, locale);
  }
  await audit(req, 'AI_MAIL_ANALYZED', m.id, { triageId: r.triage.id, refresh: !!body.refresh, copied: !!r.copied });
  res.json({ triage: await triageDto(r.triage, locale) });
});

aiMailRouter.post('/messages/:id/lead', async (req, res) => {
  const { m, t } = await ownTriage(req);
  const triage = requireDone(t);
  const facts = await mailFactsOf(m.id);
  if (!facts) throw notFound('MAIL_MESSAGE_NOT_FOUND');
  const r = await createLeadFromTriage(triage, facts, { id: uid(req) }, req);
  res.status(r.created ? 201 : 200).json({ inquiry: { id: r.inquiry.id, status: r.inquiry.status }, created: r.created, triage: await triageDto(r.triage, requestLocale(req)) });
});

aiMailRouter.post('/messages/:id/assign', async (req, res) => {
  const body = parse(z.object({ userId: id, mode: z.enum(['task', 'notify']).default('task') }), req.body);
  const { m, t } = await ownTriage(req);
  const triage = requireDone(t);
  const assignee = await prisma.user.findFirst({ where: { id: body.userId, isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, locale: true } });
  if (!assignee) throw badRequest('ASSIGNEE_NOT_STAFF');
  const facts = await mailFactsOf(m.id);
  if (!facts) throw notFound('MAIL_MESSAGE_NOT_FOUND');
  const r = await assignTriage(triage, facts, assignee, body.mode, { id: uid(req), firstName: req.user!.firstName, lastName: req.user!.lastName }, req);
  res.json({ taskNumber: r.taskNumber, triage: await triageDto(r.triage, requestLocale(req)) });
});

const simple = (type: 'spam' | 'dismiss' | 'reopen' | 'reply-used') =>
  aiMailRouter.post(`/messages/:id/${type}`, async (req, res) => {
    const { m, t } = await ownTriage(req);
    const triage = type === 'spam' ? t : requireDone(t);
    if (!triage) {
      // Spam on a message that was never analysed: nothing to record, the mail action does the move.
      await audit(req, 'AI_MAIL_SPAM', m.id, { triaged: false });
      return res.json({ triage: null });
    }
    const status = type === 'dismiss' ? 'DISMISSED' : type === 'reopen' ? 'NEW' : type === 'spam' ? 'ACTIONED' : triage.status === 'NEW' ? 'ACTIONED' : triage.status;
    const row = await recordAction(triage, { type, by: uid(req) }, { status });
    if (type !== 'reply-used') await audit(req, type === 'spam' ? 'AI_MAIL_SPAM' : type === 'dismiss' ? 'AI_MAIL_DISMISSED' : 'AI_MAIL_REOPENED', m.id, { triageId: triage.id, category: triage.category });
    res.json({ triage: await triageDto(row, requestLocale(req)) });
  });
simple('spam');
simple('dismiss');
simple('reopen');
simple('reply-used');

// ─── Routing rules (super admin) ─────────────────────────────────────

aiMailRouter.get('/settings', requireRole('SUPER_ADMIN'), async (_req, res) => {
  const [settings, staff, accounts] = await Promise.all([
    getTriageSettings(),
    prisma.user.findMany({ where: { isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, firstName: true, lastName: true, role: true }, orderBy: [{ firstName: 'asc' }], take: 300 }),
    prisma.mailAccount.findMany({ select: { email: true, user: { select: { firstName: true, lastName: true } } }, orderBy: { email: 'asc' }, take: 500 }),
  ]);
  // Connected addresses (no content, no credentials) so the super admin can pick shared mailboxes.
  const byAddress = new Map<string, string[]>();
  for (const a of accounts) byAddress.set(a.email.toLowerCase(), [...(byAddress.get(a.email.toLowerCase()) ?? []), `${a.user.firstName} ${a.user.lastName}`.trim()]);
  res.json({
    settings,
    categories: CATEGORIES,
    staff: staff.map((s) => ({ ...person(s)!, role: s.role })),
    mailboxes: [...byAddress.entries()].map(([email, owners]) => ({ email, owners })),
  });
});

aiMailRouter.put('/settings', requireRole('SUPER_ADMIN'), async (req, res) => {
  const patch = parse(triageSettingsUpdateSchema, req.body);
  const ids = Object.values(patch.routing ?? {}).filter((x): x is string => !!x);
  if (ids.length) {
    const ok = await prisma.user.count({ where: { id: { in: [...new Set(ids)] }, isActive: true, role: { in: [...STAFF_ROLES] } } });
    if (ok !== new Set(ids).size) throw badRequest('ASSIGNEE_NOT_STAFF');
  }
  const settings = await saveTriageSettings(patch);
  await audit(req, 'AI_MAIL_SETTINGS_UPDATED', 'ai.mailTriage', patch as never);
  res.json({ settings });
});
