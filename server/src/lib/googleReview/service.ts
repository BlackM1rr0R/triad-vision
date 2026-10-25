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
import { GR_TEXTS, grLocale, internalTaskText } from './texts.js';

/**
 * Google review requests: each client gets ONE friendly request to review us on Google, a few days after
 * the visa approval (or after arriving in Germany), by e-mail, in-app and optionally WhatsApp (template
 * GOOGLE_REVIEW, see lib/messaging/outbound.ts).
 *
 * "Happy path → Google, unhappy → us": a client whose last answered satisfaction survey scored at or below
 * `lowScoreMax` (default 6, an NPS detractor) is never sent to Google; a staff task to follow up is created
 * instead.
 *
 * No schema change: the settings live in Setting `googleReview`, and every fact is a ReminderLog row:
 *   google-review:<userId>           claimed (unique → never processed twice, even by overlapping runs)
 *   google-review-sent:<userId>      the request went out (sentAt = when)
 *   google-review-internal:<userId>  routed to the team (low score)
 *   google-review-click:<userId>     first click on the tracked link (unique clicks per month)
 *   google-review-optout:<userId>    the client opted out → never asked
 * Total clicks are counted in AnalyticsDaily (metric google_review_click).
 *
 * The link token is HMAC(server secret, user id), so nothing secret is stored and /r/review/:token can
 * verify it without a lookup table.
 */

export const GOOGLE_REVIEW_KEY = 'googleReview';
const DAY = 24 * 60 * 60 * 1000;

export const googleReviewSchema = z.object({
  enabled: z.boolean().default(false),
  /** The Google Business Profile "write a review" link (https://g.page/r/…/review or search.google.com/local/writereview?placeid=…). */
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === '' || /^https:\/\/[^\s]+$/i.test(u), 'URL_INVALID')
    .default(''),
  trigger: z.enum(['APPROVED', 'ARRIVAL']).default('APPROVED'),
  delayDays: z.number().int().min(0).max(60).default(3),
  channels: z
    .object({ email: z.boolean().default(true), inApp: z.boolean().default(true), whatsapp: z.boolean().default(false) })
    .default({ email: true, inApp: true, whatsapp: false }),
  /** Last survey score at or below this → staff task instead of Google. */
  lowScoreMax: z.number().int().min(0).max(10).default(6),
  /** Approvals / arrivals older than this are not asked (no mail to old cases when switched on). */
  maxAgeDays: z.number().int().min(7).max(365).default(90),
});
export type GoogleReviewSettings = z.infer<typeof googleReviewSchema>;
export const GOOGLE_REVIEW_DEFAULTS: GoogleReviewSettings = googleReviewSchema.parse({});

export const getGoogleReviewSettings = () => readSetting(GOOGLE_REVIEW_KEY, googleReviewSchema, GOOGLE_REVIEW_DEFAULTS);
export const saveGoogleReviewSettings = (s: GoogleReviewSettings) => writeSetting(GOOGLE_REVIEW_KEY, s);

// ─── Tokens and links ───────────────────────────────────────────────────

export const GR_TOKEN_RE = /^[A-Za-z0-9]{6,40}\.[A-Za-z0-9_-]{22}$/;
const sig = (userId: string) => crypto.createHmac('sha256', config.jwtSecret).update(`google-review:${userId}`).digest('base64url').slice(0, 22);
export const reviewToken = (userId: string) => `${userId}.${sig(userId)}`;
/** The user id of a valid token, else null. */
export const userOfToken = (token: string) => {
  if (!GR_TOKEN_RE.test(token)) return null;
  const [userId, s] = token.split('.');
  const expected = sig(userId);
  return s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)) ? userId : null;
};
export const reviewLinkUrl = (token: string) => `${config.clientUrl}/r/review/${token}`;
export const optOutUrl = (token: string) => `${config.clientUrl}/r/review/${token}/optout`;

// ─── ReminderLog facts ──────────────────────────────────────────────────

const K = {
  claim: (u: string) => `google-review:${u}`,
  sent: (u: string) => `google-review-sent:${u}`,
  internal: (u: string) => `google-review-internal:${u}`,
  click: (u: string) => `google-review-click:${u}`,
  optout: (u: string) => `google-review-optout:${u}`,
};

/** Creates the fact; false when it already existed. */
const logOnce = async (key: string, at = new Date()) => {
  try {
    await prisma.reminderLog.create({ data: { key, sentAt: at } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};
const has = async (key: string) => !!(await prisma.reminderLog.findUnique({ where: { key }, select: { id: true } }));

export const isOptedOut = (userId: string) => has(K.optout(userId));
export const optOut = (userId: string) => logOnce(K.optout(userId));

/** Counts a click (unique per client + total for the day). Never throws. */
export const recordClick = async (userId: string, now = new Date()) => {
  try {
    await logOnce(K.click(userId), now);
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.analyticsDaily.upsert({
      where: { day_metric_source: { day, metric: 'google_review_click', source: '' } },
      create: { day, metric: 'google_review_click', source: '', count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    console.error('[google-review] click not recorded', err);
  }
};

// ─── Sending ────────────────────────────────────────────────────────────

const deliver = async (
  user: { id: string; firstName: string; email: string; locale: string; emailNotifications: boolean },
  s: GoogleReviewSettings,
  caseId: string | null,
) => {
  const tx = GR_TEXTS[grLocale(user.locale)];
  const token = reviewToken(user.id);
  const body = tx.body({ firstName: user.firstName, trigger: s.trigger });
  let channels = 0;
  if (s.channels.inApp) {
    await notifyUser(user.id, { type: 'GOOGLE_REVIEW', title: tx.title, body, link: `/r/review/${token}`, caseId: caseId ?? undefined, email: false });
    channels++;
  }
  if (s.channels.email && user.emailNotifications !== false) {
    const a = escapeHtml;
    const html = `<p style="margin:24px 0 8px"><a href="${a(reviewLinkUrl(token))}" style="background:#1565e8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${a(tx.cta)}</a></p>
<p style="margin:22px 0 0;font-size:12px;color:#5b6b88">${a(tx.optOut)} <a href="${a(optOutUrl(token))}" style="color:#5b6b88">${a(tx.optOutLink)}</a></p>`;
    void sendMail(user.email, `Triad Vision · ${tx.title}`, renderEmail(tx.title, body, undefined, { html }));
    channels++;
  }
  if (s.channels.whatsapp) {
    const sent = await sendWhatsApp({ userId: user.id, caseId, templateKey: 'GOOGLE_REVIEW' }, tx.whatsapp({ firstName: user.firstName, url: reviewLinkUrl(token) }));
    if (sent) channels++;
  }
  return channels;
};

interface Candidate {
  userId: string;
  caseId: string;
  number: string;
  staffId: string | null;
}

const candidates = async (s: GoogleReviewSettings, now: Date): Promise<Candidate[]> => {
  const window = { lte: new Date(now.getTime() - s.delayDays * DAY), gte: new Date(now.getTime() - s.maxAgeDays * DAY) };
  const client = { isActive: true, role: 'CLIENT' as const };
  const rows =
    s.trigger === 'ARRIVAL'
      ? (
          await prisma.arrivalFollowUp.findMany({
            where: { arrivedAt: window, case: { parentCaseId: null, client } },
            select: { case: { select: { id: true, number: true, clientId: true, assignedStaffId: true } } },
            orderBy: { arrivedAt: 'asc' },
            take: 500,
          })
        ).map((r) => r.case)
      : await prisma.case.findMany({
          where: { status: 'APPROVED', parentCaseId: null, decisionAt: window, client },
          select: { id: true, number: true, clientId: true, assignedStaffId: true },
          orderBy: { decisionAt: 'asc' },
          take: 500,
        });
  const seen = new Set<string>();
  return rows.flatMap((c) => {
    if (seen.has(c.clientId)) return [];
    seen.add(c.clientId);
    return [{ userId: c.clientId, caseId: c.id, number: c.number, staffId: c.assignedStaffId }];
  });
};

const adminIds = async () => (await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true }, take: 3 })).map((u) => u.id);

/**
 * The daily job. Each client is processed once (ReminderLog claim): opted-out clients and clients who
 * unsubscribed from our campaigns are skipped (not claimed, so nothing is recorded about them), unhappy
 * clients become a staff task, everyone else gets the request.
 */
export const runGoogleReviewRequests = async (now = new Date()) => {
  const s = await getGoogleReviewSettings();
  const result = { sent: 0, internal: 0, skipped: 0 };
  if (!s.enabled || !s.url) return result;
  const list = await candidates(s, now);
  if (!list.length) return result;
  const claimed = new Set(
    (await prisma.reminderLog.findMany({ where: { key: { in: list.map((c) => K.claim(c.userId)) } }, select: { key: true } })).map((r) => r.key),
  );
  for (const c of list) {
    if (claimed.has(K.claim(c.userId))) continue;
    const user = await prisma.user.findUnique({
      where: { id: c.userId },
      select: { id: true, firstName: true, lastName: true, email: true, locale: true, isActive: true, emailNotifications: true },
    });
    if (!user?.isActive) continue;
    // Opt-outs: our own opt-out link, or an unsubscribe from any campaign e-mail.
    if ((await isOptedOut(user.id)) || (await prisma.campaignRecipient.count({ where: { userId: user.id, unsubscribedAt: { not: null } } })) > 0) {
      result.skipped++;
      continue;
    }
    if (!(await logOnce(K.claim(user.id), now))) continue; // a parallel run took it
    const survey = await prisma.satisfactionSurvey.findFirst({
      where: { clientId: user.id, answeredAt: { not: null }, score: { not: null } },
      orderBy: { answeredAt: 'desc' },
      select: { score: true, comment: true, staffId: true },
    });
    if (survey && survey.score !== null && survey.score <= s.lowScoreMax) {
      const text = internalTaskText({ clientName: `${user.firstName} ${user.lastName}`.trim(), number: c.number, score: survey.score, comment: survey.comment });
      const staff = c.staffId ?? survey.staffId;
      await createAutomationTask({ ...text, assigneeIds: staff ? [staff] : await adminIds(), caseId: c.caseId, priority: 'HIGH', dueAt: new Date(now.getTime() + 2 * DAY) });
      await logOnce(K.internal(user.id), now);
      result.internal++;
      continue;
    }
    const channels = await deliver(user, s, c.caseId);
    if (channels > 0) {
      await logOnce(K.sent(user.id), now);
      result.sent++;
    } else result.skipped++;
  }
  return result;
};

// ─── Admin statistics ───────────────────────────────────────────────────

/** Sent / clicked / routed per month (last 12 months) + all-time totals. */
export const googleReviewStats = async (now = new Date()) => {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const [rows, totalsRaw, clicks] = await Promise.all([
    prisma.reminderLog.findMany({ where: { key: { startsWith: 'google-review-' }, sentAt: { gte: from } }, select: { key: true, sentAt: true } }),
    Promise.all(
      (['sent', 'click', 'internal', 'optout'] as const).map((k) => prisma.reminderLog.count({ where: { key: { startsWith: `google-review-${k}:` } } })),
    ),
    prisma.analyticsDaily.findMany({ where: { metric: 'google_review_click', day: { gte: from } }, select: { day: true, count: true } }),
  ]);
  const months = new Map(monthRange(from, now).map((m) => [m, { month: m, sent: 0, clicked: 0, internal: 0, clicks: 0 }]));
  for (const r of rows) {
    const b = months.get(monthKey(r.sentAt));
    if (!b) continue;
    const type = r.key.slice('google-review-'.length).split(':')[0];
    if (type === 'sent') b.sent++;
    else if (type === 'click') b.clicked++;
    else if (type === 'internal') b.internal++;
  }
  for (const c of clicks) {
    const b = months.get(monthKey(c.day));
    if (b) b.clicks += c.count;
  }
  const [sent, clicked, internal, optedOut] = totalsRaw;
  return {
    months: [...months.values()],
    totals: { sent, clicked, internal, optedOut, clickRate: sent ? Math.round((clicked / sent) * 1000) / 1000 : null },
  };
};
