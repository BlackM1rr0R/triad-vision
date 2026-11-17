import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { readSetting, writeSetting } from '../growth/settings.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { sendWhatsApp } from '../messaging/outbound.js';
import { createAutomationTask } from '../automation/tasks.js';
import { escapeHtml } from '../seo.js';
import { monthKey, monthRange } from '../surveys/nps.js';
import { GR_TEXTS, grLocale } from './texts.js';
import { INVITE_TEXTS, feedbackAppendix, inviteLocale, lowRatingTaskText, lowScoreHoldTaskText } from './inviteTexts.js';
import {
  GR_TRIGGERS,
  type GrTrigger,
  evaluateEligibility,
  eventDue,
  googleWriteReviewUrl,
  isLowRating,
  ratingDistribution,
  reminderDue,
} from './rules.js';

/**
 * Automatic Google review requests ("ask for feedback first", without review gating — see rules.ts for the
 * Google policy decision).
 *
 * Triggers (Admin → Rəylər → Google, each on/off with its own delay): visa approved (+3 days), arrival in
 * Germany confirmed (ArrivalFollowUp.arrivedAt, +14 days), case closed successfully (APPROVED + closedAt).
 * Only the main applicant, only with an e-mail address and service e-mails on, not opted out, at most once per
 * client per `cooldownDays` (180). A recent low satisfaction (NPS) score → staff follow-up task first, the request
 * goes out after `holdDays`; an open problem report → postponed until it is closed.
 *
 * The e-mail asks for a one-click 1–5 rating (/r/rate/:token?s=N) and also links Google directly. On the rating
 * page every client gets the Google button; 1–3 also get a private feedback form and create a staff task.
 * One reminder after `reminderDays` (7) when the rating page was never opened.
 *
 * Data: GoogleReviewInvite (one row per trigger event, unique dedupeKey → the job is idempotent). Opt-outs and the
 * legacy one-time request (before 2026-11) stay in ReminderLog: google-review-optout:<userId>,
 * google-review-sent:<userId>, google-review-click:<userId> (the old /r/review/:token links keep working).
 */

export const GOOGLE_REVIEW_KEY = 'googleReview';
const DAY = 24 * 60 * 60 * 1000;

const triggerSchema = (delayDays: number, enabled = true) =>
  z.object({ enabled: z.boolean().default(enabled), delayDays: z.number().int().min(0).max(90).default(delayDays) }).default({ enabled, delayDays });

const settingsObject = z.object({
  enabled: z.boolean().default(false),
  /** The Google Business Profile "write a review" link (https://g.page/r/…/review or search.google.com/local/writereview?placeid=…). */
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === '' || /^https:\/\/[^\s]+$/i.test(u), 'URL_INVALID')
    .default(''),
  /** Alternative to the URL: the Google Place ID (the link is built from it). */
  placeId: z
    .string()
    .trim()
    .max(200)
    .refine((p) => p === '' || /^[A-Za-z0-9_-]{10,200}$/.test(p), 'PLACE_ID_INVALID')
    .default(''),
  triggers: z
    .object({ APPROVED: triggerSchema(3), ARRIVAL: triggerSchema(14), CLOSED: triggerSchema(7) })
    .default({ APPROVED: { enabled: true, delayDays: 3 }, ARRIVAL: { enabled: true, delayDays: 14 }, CLOSED: { enabled: true, delayDays: 7 } }),
  /** One reminder this many days after sending when the rating page was never opened (0 = no reminder). */
  reminderDays: z.number().int().min(0).max(30).default(7),
  /** At most one request per client in this many days. */
  cooldownDays: z.number().int().min(30).max(730).default(180),
  channels: z.object({ inApp: z.boolean().default(true), whatsapp: z.boolean().default(false) }).default({ inApp: true, whatsapp: false }),
  /** Survey (NPS 0–10) score at or below this → staff follow-up first, request postponed by holdDays. */
  lowScoreMax: z.number().int().min(0).max(10).default(6),
  lowScoreLookbackDays: z.number().int().min(7).max(730).default(180),
  holdDays: z.number().int().min(1).max(90).default(21),
  /** Events older than this are not asked (no mail to old cases when switched on). */
  maxAgeDays: z.number().int().min(7).max(365).default(90),
});

/** Settings saved before 2026-11 had one `trigger` + `delayDays`: map them onto the per-trigger switches. */
const fromLegacy = (v: unknown) => {
  if (!v || typeof v !== 'object' || 'triggers' in v || !('trigger' in v)) return v;
  const o = v as { trigger?: string; delayDays?: number };
  const d = typeof o.delayDays === 'number' ? o.delayDays : 3;
  return {
    ...o,
    triggers: { APPROVED: { enabled: o.trigger !== 'ARRIVAL', delayDays: o.trigger === 'ARRIVAL' ? 3 : d }, ARRIVAL: { enabled: o.trigger === 'ARRIVAL', delayDays: o.trigger === 'ARRIVAL' ? d : 14 }, CLOSED: { enabled: false, delayDays: 7 } },
  };
};
export const googleReviewSchema = z.preprocess(fromLegacy, settingsObject);
export type GoogleReviewSettings = z.infer<typeof settingsObject>;
export const GOOGLE_REVIEW_DEFAULTS: GoogleReviewSettings = settingsObject.parse({});

export const getGoogleReviewSettings = () => readSetting(GOOGLE_REVIEW_KEY, googleReviewSchema, GOOGLE_REVIEW_DEFAULTS) as Promise<GoogleReviewSettings>;
export const saveGoogleReviewSettings = (s: GoogleReviewSettings) => writeSetting(GOOGLE_REVIEW_KEY, s);
export const googleUrlOf = (s: GoogleReviewSettings) => googleWriteReviewUrl(s);

// ─── Tokens and links ───────────────────────────────────────────────────

/** Per-client token (opt-out page and the legacy one-time request links). */
export const GR_TOKEN_RE = /^[A-Za-z0-9]{6,40}\.[A-Za-z0-9_-]{22}$/;
const sig = (scope: string, id: string) => crypto.createHmac('sha256', config.jwtSecret).update(`${scope}:${id}`).digest('base64url').slice(0, 22);
const verify = (token: string, scope: string) => {
  if (!GR_TOKEN_RE.test(token)) return null;
  const [id, s] = token.split('.');
  const expected = sig(scope, id);
  return s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)) ? id : null;
};
export const reviewToken = (userId: string) => `${userId}.${sig('google-review', userId)}`;
/** The user id of a valid per-client token, else null. */
export const userOfToken = (token: string) => verify(token, 'google-review');
export const reviewLinkUrl = (token: string) => `${config.clientUrl}/r/review/${token}`;
export const optOutUrl = (token: string) => `${config.clientUrl}/r/review/${token}/optout`;

/** Per-invite token (rating page). "demo" = preview / test e-mails (the page shows a demo, nothing is stored). */
export const DEMO_TOKEN = 'demo';
export const inviteToken = (inviteId: string) => `${inviteId}.${sig('gr-invite', inviteId)}`;
export const inviteOfToken = (token: string) => verify(token, 'gr-invite');
export const rateUrl = (token: string, score?: number) => `${config.clientUrl}/r/rate/${token}${score ? `?s=${score}` : ''}`;
export const directGoogleUrl = (token: string) => `${config.clientUrl}/r/rate/${token}/google`;

// ─── ReminderLog facts (opt-out, legacy) ────────────────────────────────

const K = {
  sent: (u: string) => `google-review-sent:${u}`,
  click: (u: string) => `google-review-click:${u}`,
  optout: (u: string) => `google-review-optout:${u}`,
};

const logOnce = async (key: string, at = new Date()) => {
  try {
    await prisma.reminderLog.create({ data: { key, sentAt: at } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

export const isOptedOut = async (userId: string) => !!(await prisma.reminderLog.findUnique({ where: { key: K.optout(userId) }, select: { id: true } }));
export const optOut = (userId: string) => logOnce(K.optout(userId));

const countDailyClick = async (now: Date) => {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  await prisma.analyticsDaily.upsert({
    where: { day_metric_source: { day, metric: 'google_review_click', source: '' } },
    create: { day, metric: 'google_review_click', source: '', count: 1 },
    update: { count: { increment: 1 } },
  });
};

/** Legacy link: counts a click (unique per client + total for the day). Never throws. */
export const recordClick = async (userId: string, now = new Date()) => {
  try {
    await logOnce(K.click(userId), now);
    await countDailyClick(now);
  } catch (err) {
    console.error('[google-review] click not recorded', err);
  }
};

// ─── E-mail ─────────────────────────────────────────────────────────────

const RATING_COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#7cb342', '#2e7d32'];

/** Subject + HTML of the request (or its reminder). Used by the job, the admin preview and the test e-mail. */
export const renderInviteEmail = (p: { locale: string; firstName: string; trigger: GrTrigger; kind: 'invite' | 'reminder'; token: string; optOutToken: string | null }) => {
  const tx = INVITE_TEXTS[inviteLocale(p.locale)];
  const a = escapeHtml;
  const title = p.kind === 'invite' ? tx.subject : tx.reminderSubject;
  const body = `${tx.greeting(p.firstName)}\n\n${p.kind === 'invite' ? tx.intro[p.trigger] : tx.reminderIntro}\n\n${tx.question}`;
  const cells = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<td align="center" style="padding:0 4px"><a href="${a(rateUrl(p.token, n))}" title="${a(`${n} — ${tx.ratingLabels[n - 1]}`)}" style="display:block;width:48px;height:48px;line-height:48px;border-radius:10px;background:${RATING_COLORS[n - 1]};color:#fff;font-size:20px;font-weight:700;text-decoration:none">${n}</a></td>`,
    )
    .join('');
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 6px"><tr>${cells}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:300px;margin:0 auto 18px;font-size:12px;color:#5b6b88"><tr><td align="left">${a(tx.scaleLow)}</td><td align="right">${a(tx.scaleHigh)}</td></tr></table>
<p style="margin:18px 0 6px;line-height:1.6">${a(tx.direct)} <a href="${a(directGoogleUrl(p.token))}" style="color:#1565e8;font-weight:600">${a(tx.directLink)}</a></p>
<p style="margin:14px 0 0;line-height:1.6">${a(tx.thanks)}</p>
${p.optOutToken ? `<p style="margin:22px 0 0;font-size:12px;color:#5b6b88">${a(tx.optOut)} <a href="${a(optOutUrl(p.optOutToken))}" style="color:#5b6b88">${a(tx.optOutLink)}</a></p>` : ''}`;
  return { subject: `Triad Vision · ${title}`, title, html: renderEmail(title, body, undefined, { html }) };
};

type InviteUser = { id: string; firstName: string; email: string; locale: string };

const deliver = async (user: InviteUser, s: GoogleReviewSettings, inv: { id: string; caseId: string | null; trigger: GrTrigger }, kind: 'invite' | 'reminder') => {
  const token = inviteToken(inv.id);
  const mail = renderInviteEmail({ locale: user.locale, firstName: user.firstName, trigger: inv.trigger, kind, token, optOutToken: reviewToken(user.id) });
  void sendMail(user.email, mail.subject, mail.html);
  if (kind === 'invite' && s.channels.inApp) {
    await notifyUser(user.id, { type: 'GOOGLE_REVIEW', title: mail.title, body: INVITE_TEXTS[inviteLocale(user.locale)].inApp, link: `/r/rate/${token}`, caseId: inv.caseId ?? undefined, email: false });
  }
  if (kind === 'invite' && s.channels.whatsapp) {
    await sendWhatsApp({ userId: user.id, caseId: inv.caseId, templateKey: 'GOOGLE_REVIEW' }, GR_TEXTS[grLocale(user.locale)].whatsapp({ firstName: user.firstName, url: rateUrl(token) }));
  }
};

/** Admin "send test": the e-mail with demo links (the rating page shows a demo, nothing is stored). */
export const sendTestInvite = async (to: string, p: { locale: string; trigger: GrTrigger; kind: 'invite' | 'reminder'; firstName: string }) => {
  const mail = renderInviteEmail({ ...p, token: DEMO_TOKEN, optOutToken: null });
  await sendMail(to, `[TEST] ${mail.subject}`, mail.html);
};

// ─── Candidates and eligibility ────────────────────────────────────────

interface Candidate {
  trigger: GrTrigger;
  caseId: string;
  number: string;
  userId: string;
  staffId: string | null;
  isMain: boolean;
}

const caseSelect = { id: true, number: true, clientId: true, assignedStaffId: true, parentCaseId: true } as const;
type CaseRow = { id: string; number: string; clientId: string; assignedStaffId: string | null; parentCaseId: string | null };
const toCandidate = (trigger: GrTrigger, c: CaseRow): Candidate => ({ trigger, caseId: c.id, number: c.number, userId: c.clientId, staffId: c.assignedStaffId, isMain: c.parentCaseId === null });

const candidates = async (s: GoogleReviewSettings, now: Date): Promise<Candidate[]> => {
  const window = (t: GrTrigger) => ({ lte: new Date(now.getTime() - s.triggers[t].delayDays * DAY), gte: new Date(now.getTime() - Math.max(s.maxAgeDays, s.triggers[t].delayDays) * DAY) });
  const client = { role: 'CLIENT' as const };
  const out: Candidate[] = [];
  if (s.triggers.APPROVED.enabled) {
    const rows = await prisma.case.findMany({ where: { status: 'APPROVED', decisionAt: window('APPROVED'), client }, select: { ...caseSelect, decisionAt: true }, orderBy: { decisionAt: 'asc' }, take: 500 });
    out.push(...rows.filter((r) => r.decisionAt && eventDue(r.decisionAt, s.triggers.APPROVED.delayDays, s.maxAgeDays, now)).map((r) => toCandidate('APPROVED', r)));
  }
  if (s.triggers.ARRIVAL.enabled) {
    const rows = await prisma.arrivalFollowUp.findMany({ where: { arrivedAt: window('ARRIVAL'), case: { client } }, select: { arrivedAt: true, case: { select: caseSelect } }, orderBy: { arrivedAt: 'asc' }, take: 500 });
    out.push(...rows.filter((r) => eventDue(r.arrivedAt, s.triggers.ARRIVAL.delayDays, s.maxAgeDays, now)).map((r) => toCandidate('ARRIVAL', r.case)));
  }
  if (s.triggers.CLOSED.enabled) {
    const rows = await prisma.case.findMany({ where: { status: 'APPROVED', closedAt: window('CLOSED'), client }, select: { ...caseSelect, closedAt: true }, orderBy: { closedAt: 'asc' }, take: 500 });
    out.push(...rows.filter((r) => r.closedAt && eventDue(r.closedAt, s.triggers.CLOSED.delayDays, s.maxAgeDays, now)).map((r) => toCandidate('CLOSED', r)));
  }
  return out;
};

const dedupeKey = (c: { trigger: GrTrigger; caseId: string }) => `${c.trigger}:${c.caseId}`;

/** Latest request this client got: new invites (sent or held) + the legacy one-time request. */
const lastInviteAt = async (userId: string, excludeId?: string) => {
  const [inv, legacy] = await Promise.all([
    prisma.googleReviewInvite.findMany({
      where: { userId, status: { in: ['SENT', 'HELD'] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { sentAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.reminderLog.findUnique({ where: { key: K.sent(userId) }, select: { sentAt: true } }),
  ]);
  const times = [...inv.map((i) => (i.sentAt ?? i.createdAt).getTime()), ...(legacy ? [legacy.sentAt.getTime()] : [])];
  return times.length ? new Date(Math.max(...times)) : null;
};

const loadUser = (userId: string) =>
  prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, email: true, locale: true, isActive: true, emailNotifications: true } });

const eligibilityFor = async (user: NonNullable<Awaited<ReturnType<typeof loadUser>>>, isMain: boolean, s: GoogleReviewSettings, now: Date, opts: { excludeInviteId?: string; ignoreSurvey?: boolean } = {}) => {
  const [optedOut, unsubscribed, last, survey, openProblems] = await Promise.all([
    isOptedOut(user.id),
    prisma.campaignRecipient.count({ where: { userId: user.id, unsubscribedAt: { not: null } } }),
    lastInviteAt(user.id, opts.excludeInviteId),
    opts.ignoreSurvey
      ? null
      : prisma.satisfactionSurvey.findFirst({
          where: { clientId: user.id, answeredAt: { not: null }, score: { not: null } },
          orderBy: { answeredAt: 'desc' },
          select: { score: true, comment: true, staffId: true, answeredAt: true },
        }),
    prisma.problemReport.count({ where: { userId: user.id, status: { in: ['NEW', 'IN_PROGRESS'] } } }),
  ]);
  const verdict = evaluateEligibility(
    {
      isMainApplicant: isMain,
      isActive: user.isActive,
      email: user.email,
      emailNotifications: user.emailNotifications !== false,
      optedOut: optedOut || unsubscribed > 0,
      lastInviteAt: last,
      lastSurveyScore: survey?.score ?? null,
      lastSurveyAt: survey?.answeredAt ?? null,
      hasOpenProblem: openProblems > 0,
      now,
    },
    s,
  );
  return { verdict, survey };
};

const adminIds = async () => (await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true }, take: 3 })).map((u) => u.id);

const createInvite = async (c: Candidate, user: { id: string; locale: string }, status: 'SENT' | 'HELD', now: Date, holdUntil: Date | null) => {
  try {
    return await prisma.googleReviewInvite.create({
      data: { userId: user.id, caseId: c.caseId, trigger: c.trigger, dedupeKey: dedupeKey(c), status, locale: inviteLocale(user.locale), sentAt: status === 'SENT' ? now : null, holdUntil },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null; // a parallel run took it
    throw err;
  }
};

export interface RunResult {
  sent: number;
  held: number;
  released: number;
  reminded: number;
  skipped: number;
}

/**
 * The daily job (idempotent: one invite per trigger event, unique dedupeKey; cooldown per client):
 *   1. HELD invites whose hold period is over are sent (re-checked: opt-out, e-mail, open problem);
 *   2. new trigger events → SEND / HOLD (staff task) / WAIT (open problem) / SKIP;
 *   3. one reminder for invites that were never opened.
 */
export const runGoogleReviewRequests = async (now = new Date()): Promise<RunResult> => {
  const s = await getGoogleReviewSettings();
  const result: RunResult = { sent: 0, held: 0, released: 0, reminded: 0, skipped: 0 };
  if (!s.enabled || !googleUrlOf(s)) return result;

  // 1. Release held invites.
  const held = await prisma.googleReviewInvite.findMany({ where: { status: 'HELD', holdUntil: { lte: now } }, take: 200 });
  for (const inv of held) {
    const user = await loadUser(inv.userId);
    if (!user) continue;
    const { verdict } = await eligibilityFor(user, true, s, now, { excludeInviteId: inv.id, ignoreSurvey: true });
    if (verdict.action === 'WAIT') continue;
    if (verdict.action === 'SKIP') {
      await prisma.googleReviewInvite.updateMany({ where: { id: inv.id, status: 'HELD' }, data: { status: 'CANCELLED' } });
      result.skipped++;
      continue;
    }
    const claimed = await prisma.googleReviewInvite.updateMany({ where: { id: inv.id, status: 'HELD' }, data: { status: 'SENT', sentAt: now } });
    if (!claimed.count) continue;
    await deliver(user, s, { id: inv.id, caseId: inv.caseId, trigger: inv.trigger as GrTrigger }, 'invite');
    result.released++;
  }

  // 2. New trigger events.
  const list = await candidates(s, now);
  if (list.length) {
    const known = new Set((await prisma.googleReviewInvite.findMany({ where: { dedupeKey: { in: list.map(dedupeKey) } }, select: { dedupeKey: true } })).map((r) => r.dedupeKey));
    for (const c of list) {
      if (known.has(dedupeKey(c))) continue;
      const user = await loadUser(c.userId);
      if (!user) continue;
      const { verdict, survey } = await eligibilityFor(user, c.isMain, s, now);
      if (verdict.action === 'SKIP' || verdict.action === 'WAIT') {
        result.skipped++;
        continue;
      }
      if (verdict.action === 'HOLD') {
        const inv = await createInvite(c, user, 'HELD', now, new Date(now.getTime() + s.holdDays * DAY));
        if (!inv) continue;
        known.add(inv.dedupeKey);
        const text = lowScoreHoldTaskText({ clientName: `${user.firstName} ${user.lastName}`.trim(), number: c.number, score: survey?.score ?? 0, comment: survey?.comment ?? null, holdDays: s.holdDays });
        const staff = c.staffId ?? survey?.staffId ?? null;
        const task = await createAutomationTask({ ...text, assigneeIds: staff ? [staff] : await adminIds(), caseId: c.caseId, priority: 'HIGH', dueAt: new Date(now.getTime() + 2 * DAY) });
        await prisma.googleReviewInvite.update({ where: { id: inv.id }, data: { staffTaskId: task.id } });
        result.held++;
        continue;
      }
      const inv = await createInvite(c, user, 'SENT', now, null);
      if (!inv) continue;
      known.add(inv.dedupeKey);
      await deliver(user, s, { id: inv.id, caseId: c.caseId, trigger: c.trigger }, 'invite');
      result.sent++;
    }
  }

  // 3. One reminder.
  if (s.reminderDays > 0) {
    const due = await prisma.googleReviewInvite.findMany({
      where: { status: 'SENT', remindedAt: null, openedAt: null, ratedAt: null, googleClickedAt: null, sentAt: { lte: new Date(now.getTime() - s.reminderDays * DAY), gte: new Date(now.getTime() - 60 * DAY) } },
      take: 300,
    });
    for (const inv of due) {
      if (!reminderDue(inv, s.reminderDays, now)) continue;
      const user = await loadUser(inv.userId);
      if (!user?.isActive || user.emailNotifications === false || (await isOptedOut(user.id))) continue;
      const claimed = await prisma.googleReviewInvite.updateMany({ where: { id: inv.id, remindedAt: null }, data: { remindedAt: now } });
      if (!claimed.count) continue;
      await deliver(user, s, { id: inv.id, caseId: inv.caseId, trigger: inv.trigger as GrTrigger }, 'reminder');
      result.reminded++;
    }
  }
  return result;
};

// ─── Rating page (public, token) ───────────────────────────────────────

const findInvite = async (token: string) => {
  const id = inviteOfToken(token);
  if (!id) return null;
  const inv = await prisma.googleReviewInvite.findUnique({ where: { id } });
  return inv && inv.status === 'SENT' ? inv : null;
};

/** Rating page data; the first visit counts as "opened". Null for an unknown / forged token. */
export const inviteInfo = async (token: string, now = new Date()) => {
  const inv = await findInvite(token);
  if (!inv) return null;
  if (!inv.openedAt) await prisma.googleReviewInvite.updateMany({ where: { id: inv.id, openedAt: null }, data: { openedAt: now } });
  const [user, s] = await Promise.all([prisma.user.findUnique({ where: { id: inv.userId }, select: { firstName: true } }), getGoogleReviewSettings()]);
  return {
    locale: inviteLocale(inv.locale),
    firstName: user?.firstName ?? '',
    rating: inv.rating,
    feedbackSent: !!inv.feedback,
    googleAvailable: !!googleUrlOf(s),
    optOutToken: reviewToken(inv.userId),
  };
};

/** Stores (or changes) the 1–5 rating. The first 1–3 rating creates the staff follow-up task. */
export const rateInvite = async (token: string, rating: number, now = new Date()) => {
  const inv = await findInvite(token);
  if (!inv) return null;
  await prisma.googleReviewInvite.update({ where: { id: inv.id }, data: { rating, ratedAt: now, openedAt: inv.openedAt ?? now } });
  if (isLowRating(rating) && !inv.staffTaskId) {
    // Claim first so a double click never creates two tasks.
    const claimed = await prisma.googleReviewInvite.updateMany({ where: { id: inv.id, staffTaskId: null }, data: { staffTaskId: 'pending' } });
    if (claimed.count) {
      const [user, c] = await Promise.all([
        prisma.user.findUnique({ where: { id: inv.userId }, select: { firstName: true, lastName: true } }),
        inv.caseId ? prisma.case.findUnique({ where: { id: inv.caseId }, select: { number: true, assignedStaffId: true } }) : null,
      ]);
      const text = lowRatingTaskText({ clientName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(), number: c?.number ?? null, rating, trigger: inv.trigger as GrTrigger, feedback: inv.feedback });
      const task = await createAutomationTask({ ...text, assigneeIds: c?.assignedStaffId ? [c.assignedStaffId] : await adminIds(), caseId: inv.caseId, priority: 'HIGH', dueAt: new Date(now.getTime() + 2 * DAY) });
      await prisma.googleReviewInvite.update({ where: { id: inv.id }, data: { staffTaskId: task.id } });
    }
  }
  return { rating, low: isLowRating(rating) };
};

/** Private feedback (shown to staff only); appended to the follow-up task when there is one. */
export const submitInviteFeedback = async (token: string, feedback: string, now = new Date()) => {
  const inv = await findInvite(token);
  if (!inv) return null;
  await prisma.googleReviewInvite.update({ where: { id: inv.id }, data: { feedback, feedbackAt: now } });
  if (inv.staffTaskId && inv.staffTaskId !== 'pending') {
    const task = await prisma.task.findUnique({ where: { id: inv.staffTaskId }, select: { id: true, description: true } });
    if (task) await prisma.task.update({ where: { id: task.id }, data: { description: `${task.description ?? ''}${feedbackAppendix(feedback)}`.slice(0, 8000) } });
  }
  return { ok: true };
};

/** Counts the Google click and returns the Google link ('' when not configured). */
export const inviteGoogleClick = async (token: string, now = new Date()) => {
  const s = await getGoogleReviewSettings();
  const url = googleUrlOf(s);
  const inv = await findInvite(token);
  if (inv) {
    try {
      await prisma.googleReviewInvite.update({
        where: { id: inv.id },
        data: { googleClicks: { increment: 1 }, googleClickedAt: inv.googleClickedAt ?? now, openedAt: inv.openedAt ?? now },
      });
      await countDailyClick(now);
    } catch (err) {
      console.error('[google-review] click not recorded', err);
    }
  }
  return { url, valid: !!inv };
};

// ─── Admin statistics ───────────────────────────────────────────────────

const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : null);

/** Funnel totals, rating distribution, per month (last 12) + the legacy one-time request totals. */
export const googleReviewStats = async (now = new Date()) => {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const [sent, reminded, opened, rated, googleClicked, clicksAgg, feedback, held, lowRatings, ratings, optedOut, legacySent, legacyClicked, rows] = await Promise.all([
    prisma.googleReviewInvite.count({ where: { status: 'SENT' } }),
    prisma.googleReviewInvite.count({ where: { remindedAt: { not: null } } }),
    prisma.googleReviewInvite.count({ where: { openedAt: { not: null } } }),
    prisma.googleReviewInvite.count({ where: { ratedAt: { not: null } } }),
    prisma.googleReviewInvite.count({ where: { googleClickedAt: { not: null } } }),
    prisma.googleReviewInvite.aggregate({ _sum: { googleClicks: true }, _avg: { rating: true } }),
    prisma.googleReviewInvite.count({ where: { feedbackAt: { not: null } } }),
    prisma.googleReviewInvite.count({ where: { status: 'HELD' } }),
    prisma.googleReviewInvite.count({ where: { rating: { gte: 1, lte: 3 } } }),
    prisma.googleReviewInvite.findMany({ where: { rating: { not: null } }, select: { rating: true } }),
    prisma.reminderLog.count({ where: { key: { startsWith: 'google-review-optout:' } } }),
    prisma.reminderLog.count({ where: { key: { startsWith: 'google-review-sent:' } } }),
    prisma.reminderLog.count({ where: { key: { startsWith: 'google-review-click:' } } }),
    prisma.googleReviewInvite.findMany({ where: { sentAt: { gte: from } }, select: { sentAt: true, openedAt: true, ratedAt: true, rating: true, googleClickedAt: true } }),
  ]);
  const months = new Map(monthRange(from, now).map((m) => [m, { month: m, sent: 0, opened: 0, rated: 0, low: 0, googleClicked: 0 }]));
  for (const r of rows) {
    const b = r.sentAt && months.get(monthKey(r.sentAt));
    if (!b) continue;
    b.sent++;
    if (r.openedAt) b.opened++;
    if (r.ratedAt) b.rated++;
    if (r.rating !== null && isLowRating(r.rating)) b.low++;
    if (r.googleClickedAt) b.googleClicked++;
  }
  const avg = clicksAgg._avg.rating;
  return {
    months: [...months.values()],
    totals: {
      sent,
      reminded,
      opened,
      rated,
      googleClicked,
      googleClicks: clicksAgg._sum.googleClicks ?? 0,
      feedback,
      held,
      lowRatings,
      optedOut,
      averageRating: avg === null ? null : Math.round(avg * 10) / 10,
      openRate: rate(opened, sent),
      clickRate: rate(googleClicked, sent),
    },
    distribution: ratingDistribution(ratings.map((r) => r.rating)),
    legacy: { sent: legacySent, clicked: legacyClicked },
  };
};

/** Recent invites for the admin list (newest first). */
export const recentInvites = async (take = 50) => {
  const rows = await prisma.googleReviewInvite.findMany({ orderBy: { createdAt: 'desc' }, take });
  const [users, cases] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.case.findMany({ where: { id: { in: rows.flatMap((r) => (r.caseId ? [r.caseId] : [])) } }, select: { id: true, number: true } }),
  ]);
  const u = new Map(users.map((x) => [x.id, x]));
  const c = new Map(cases.map((x) => [x.id, x]));
  return rows.map((r) => ({
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    locale: r.locale,
    client: u.get(r.userId) ?? null,
    case: r.caseId ? (c.get(r.caseId) ?? null) : null,
    createdAt: r.createdAt,
    holdUntil: r.holdUntil,
    sentAt: r.sentAt,
    remindedAt: r.remindedAt,
    openedAt: r.openedAt,
    rating: r.rating,
    feedback: r.feedback,
    googleClicks: r.googleClicks,
    staffTaskId: r.staffTaskId === 'pending' ? null : r.staffTaskId,
  }));
};

export { GR_TRIGGERS };
