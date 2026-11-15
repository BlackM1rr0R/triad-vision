import crypto from 'node:crypto';
import type { GermanyJobAlert, Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { escapeHtml, localizedPath } from '../seo.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { renderEmail, sendMail } from '../mailer.js';
import { hashToken, maskEmail } from '../jobAlerts/service.js';
import { arbeitnowMatches } from './arbeitnow.js';
import { careerjetAlertBudget, careerjetAlertSearch, type AlertSearchStatus } from './careerjet.js';
import { RADII, dedupeKey, type GermanyJob, type SearchQuery } from './common.js';
import { CONSENT_VERSION, GERMANY_ALERT_MAIL } from './alertTexts.js';
import { PROVIDERS } from './providers.js';

/**
 * Germany job alerts (model GermanyJobAlert): "notify me about new jobs like this" for a search on /jobs/germany
 * (keywords / profession, place + radius, job or Ausbildung, working time, remote, visa sponsorship), e-mailed
 * daily or weekly. Same rules as the job alerts for our own vacancies (lib/jobAlerts/service.ts):
 *
 *  - Visitors: double opt-in (nothing but the confirmation e-mail before the address is confirmed); unconfirmed
 *    alerts are deleted after 7 days. Signed-in clients: confirmed for their account address, digests follow the
 *    account's e-mail notification setting and go to the account's current address.
 *  - Every e-mail carries a manage and an unsubscribe link (token derived from the alert id with the server secret,
 *    only its SHA-256 is stored). Unsubscribed alerts are deleted 30 days later, with the account, or on an erasure.
 *  - At most MAX_ALERTS_PER_EMAIL active alerts per address / account.
 *
 * Matching (runGermanyJobAlerts, scheduler jobs/germanyJobs.ts every 30 min): due alerts are grouped by their
 * query, so one lookup serves every subscriber of the same search. Arbeitnow comes from the cached hourly feed (no
 * extra calls); Careerjet only within its alert budget (careerjet.ts, CAREERJET_ALERT_CALLS_PER_DAY) and skipped once
 * that is used up; Jooble / Adzuna are never called for alerts. Listing ids already e-mailed are kept per alert
 * (GermanyJobAlertSent), so a listing is never sent twice. The e-mail lists up to DIGEST_MAX_JOBS new listings, each
 * with an "Apply via Triad Vision" link back to our search page (which opens the apply form), never to the source.
 */

const DAY = 24 * 60 * 60 * 1000;
export const UNCONFIRMED_TTL_DAYS = 7;
export const UNSUBSCRIBED_TTL_DAYS = 30;
export const SENT_TTL_DAYS = 120;
export const MAX_ALERTS_PER_EMAIL = 5;
export const DIGEST_MAX_JOBS = 10;
/** A digest never lists listings posted before this (first digest stays about new jobs). */
const MAX_LOOKBACK_DAYS = 14;
/** The 30-minute scheduler may run a little early: an alert is due this much before its period is over. */
const DUE_SLACK_MS = 45 * 60 * 1000;
export const FREQUENCIES = ['daily', 'weekly'] as const;
export type AlertFrequency = (typeof FREQUENCIES)[number];
const PERIOD_MS: Record<AlertFrequency, number> = { daily: DAY, weekly: 7 * DAY };

export const alertToken = (alertId: string) => crypto.createHmac('sha256', config.jwtSecret).update(`germany-job-alert:${alertId}`).digest('base64url');

const siteLocale = (raw: unknown): SeoLocale => ((SEO_LOCALES as readonly string[]).includes(String(raw)) ? (raw as SeoLocale) : 'az');

const flag = z.preprocess((v) => (v === '1' || v === 'true' ? true : v === '0' || v === 'false' || v === '' ? false : v), z.boolean());

/** The search an alert is about (same fields and limits as GET /api/germany-jobs/search). */
export const alertSearchSchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  where: z.string().trim().max(100).optional().default(''),
  radius: z.coerce
    .number()
    .int()
    .refine((n) => (RADII as readonly number[]).includes(n), 'RADIUS')
    .optional()
    .default(25),
  type: z.enum(['job', 'ausbildung']).optional().default('job'),
  time: z.enum(['any', 'full', 'part']).optional().default('any'),
  remote: flag.optional().default(false),
  visa: flag.optional().default(false),
});
export type AlertSearch = z.infer<typeof alertSearchSchema>;

export const alertPrefsSchema = alertSearchSchema.extend({
  frequency: z.enum(FREQUENCIES).optional().default('daily'),
  lng: z.string().max(5).optional(),
});
export type AlertPrefs = z.infer<typeof alertPrefsSchema>;

/** Editable later (manage page / portal): frequency and language only; a different search is a new alert. */
export const alertUpdateSchema = z.object({ frequency: z.enum(FREQUENCIES).optional(), lng: z.string().max(5).optional() });

const searchData = (s: AlertSearch) => ({
  q: s.q.replace(/\s+/g, ' '),
  place: s.where.replace(/\s+/g, ' '),
  radius: s.radius,
  jobType: s.type,
  workTime: s.time,
  remote: s.remote,
  visa: s.visa,
});

type SearchRow = Pick<GermanyJobAlert, 'q' | 'place' | 'radius' | 'jobType' | 'workTime' | 'remote' | 'visa'>;

/** An alert's search as a provider query (newest first, page 1). */
export const alertQuery = (a: SearchRow): SearchQuery => ({
  q: a.q,
  where: a.place,
  radius: a.radius,
  type: a.jobType === 'ausbildung' ? 'ausbildung' : 'job',
  time: a.workTime === 'full' || a.workTime === 'part' ? a.workTime : 'any',
  remote: a.remote,
  visa: a.visa,
  sort: 'date',
  page: 1,
});

/** Grouping key: identical searches share one lookup. */
export const alertGroupKey = (a: SearchRow) =>
  JSON.stringify([a.q.trim().toLowerCase(), a.place.trim().toLowerCase(), a.place.trim() ? a.radius : 0, a.jobType, a.workTime, a.remote, a.visa]);

/** The page URL query of an alert's search (client lib/germanyJobs.ts searchToParams: defaults left out). */
export const alertSearchParams = (a: SearchRow) => {
  const p = new URLSearchParams();
  if (a.q) p.set('q', a.q);
  if (a.place) p.set('where', a.place);
  if (a.place && a.radius !== 25) p.set('radius', String(a.radius));
  if (a.jobType === 'ausbildung') p.set('type', 'ausbildung');
  if (a.workTime !== 'any') p.set('time', a.workTime);
  if (a.remote) p.set('remote', '1');
  if (a.visa) p.set('visa', '1');
  return p;
};

export const searchSummary = (a: SearchRow, lng: SeoLocale) => {
  const m = GERMANY_ALERT_MAIL[lng];
  const parts = [a.q ? `„${a.q}“` : m.anyJob];
  if (a.jobType === 'ausbildung') parts.push(m.ausbildung);
  if (a.place) parts.push(m.inPlace(a.place, a.radius));
  if (a.workTime === 'full') parts.push(m.fullTime);
  if (a.workTime === 'part') parts.push(m.partTime);
  if (a.remote) parts.push(m.remote);
  if (a.visa) parts.push(m.visa);
  return parts.join(', ');
};

const frequencyLabel = (f: string, lng: SeoLocale) => (f === 'weekly' ? GERMANY_ALERT_MAIL[lng].weekly : GERMANY_ALERT_MAIL[lng].daily);

export const manageUrl = (token: string, lng: SeoLocale, action?: 'confirm' | 'unsubscribe') =>
  `${config.clientUrl}/job-alert/germany?token=${encodeURIComponent(token)}&lng=${lng}${action ? `&action=${action}` : ''}`;

const searchPageUrl = (a: SearchRow, lng: SeoLocale, extra?: Record<string, string>) => {
  const p = alertSearchParams(a);
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
  p.set('utm_source', 'job-alert');
  p.set('utm_medium', 'email');
  return `${new URL(config.clientUrl).origin}${localizedPath('/jobs/germany/search', lng)}?${p.toString()}`;
};

/**
 * "Apply via Triad Vision" link of a listing: our search page with the listing's snapshot, which opens the apply
 * form there (client pages/jobs/GermanyJobs.tsx, `apply` params). The source URL travels as a parameter only.
 */
export const applyUrl = (a: SearchRow, j: GermanyJob, lng: SeoLocale) =>
  searchPageUrl(a, lng, {
    apply: j.id.slice(0, 160),
    at: j.title.slice(0, 200),
    ...(j.company ? { ac: j.company.slice(0, 120) } : {}),
    ...(j.location ? { al: j.location.slice(0, 120) } : {}),
    au: j.url,
  });

// ─── Create / confirm / manage ──────────────────────────────────────────

const createWithToken = async (data: Omit<Prisma.GermanyJobAlertUncheckedCreateInput, 'tokenHash'>) => {
  const created = await prisma.germanyJobAlert.create({ data: { ...data, tokenHash: hashToken(crypto.randomBytes(24).toString('base64url')) } });
  const token = alertToken(created.id);
  const alert = await prisma.germanyJobAlert.update({ where: { id: created.id }, data: { tokenHash: hashToken(token) } });
  return { alert, token };
};

export const sendConfirmMail = async (alert: GermanyJobAlert, token: string) => {
  const lng = siteLocale(alert.locale);
  const m = GERMANY_ALERT_MAIL[lng];
  const html = renderEmail(m.confirmSubject, m.confirmBody(searchSummary(alert, lng), frequencyLabel(alert.frequency, lng)), { label: m.confirmCta, url: manageUrl(token, lng, 'confirm') });
  await sendMail(alert.email, m.confirmSubject, html);
};

const activeWhere = (where: Prisma.GermanyJobAlertWhereInput): Prisma.GermanyJobAlertWhereInput => ({ ...where, unsubscribedAt: null });

export const createPublicAlert = async (input: { email: string; prefs: AlertPrefs; visitorId?: string | null }) => {
  const active = await prisma.germanyJobAlert.count({ where: activeWhere({ email: input.email }) });
  if (active >= MAX_ALERTS_PER_EMAIL) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  const { alert, token } = await createWithToken({
    email: input.email,
    locale: siteLocale(input.prefs.lng),
    ...searchData(input.prefs),
    frequency: input.prefs.frequency,
    consentVersion: CONSENT_VERSION,
    visitorId: input.visitorId ?? null,
  });
  await sendConfirmMail(alert, token);
  return { ok: true as const, alert };
};

export const createAccountAlert = async (user: { id: string; email: string; locale: string }, prefs: AlertPrefs) => {
  const active = await prisma.germanyJobAlert.count({ where: activeWhere({ userId: user.id }) });
  if (active >= MAX_ALERTS_PER_EMAIL) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  const { alert } = await createWithToken({
    email: user.email.toLowerCase(),
    userId: user.id,
    locale: prefs.lng ? siteLocale(prefs.lng) : siteLocale(user.locale),
    ...searchData(prefs),
    frequency: prefs.frequency,
    consentVersion: CONSENT_VERSION,
    confirmedAt: new Date(),
  });
  return { ok: true as const, alert };
};

export const findByToken = (token: unknown) =>
  typeof token === 'string' && token.length >= 20 && token.length <= 100
    ? prisma.germanyJobAlert.findUnique({ where: { tokenHash: hashToken(token) } })
    : Promise.resolve(null);

export const updateData = (u: z.infer<typeof alertUpdateSchema>): Prisma.GermanyJobAlertUpdateInput => ({
  ...(u.frequency ? { frequency: u.frequency } : {}),
  ...(u.lng ? { locale: siteLocale(u.lng) } : {}),
});

export const alertView = (a: GermanyJobAlert, opts: { maskedEmail?: boolean } = {}) => ({
  id: a.id,
  email: opts.maskedEmail ? maskEmail(a.email) : a.email,
  locale: a.locale,
  search: { q: a.q, where: a.place, radius: a.radius, type: a.jobType, time: a.workTime, remote: a.remote, visa: a.visa },
  summary: searchSummary(a, siteLocale(a.locale)),
  frequency: a.frequency,
  confirmed: !!a.confirmedAt,
  unsubscribed: !!a.unsubscribedAt,
  lastSentAt: a.lastSentAt,
  sentCount: a.sentCount,
  createdAt: a.createdAt,
});

// ─── Matching ────────────────────────────────────────────────────────────

const isDue = (a: Pick<GermanyJobAlert, 'frequency' | 'lastRunAt'>, now: Date) =>
  !a.lastRunAt || now.getTime() - a.lastRunAt.getTime() >= (PERIOD_MS[a.frequency as AlertFrequency] ?? DAY) - DUE_SLACK_MS;

/** Listings of a group: Arbeitnow (cached feed) + Careerjet (alert budget), merged newest first, duplicates removed. */
const groupListings = async (q: SearchQuery, now: Date): Promise<{ items: GermanyJob[]; careerjet: AlertSearchStatus }> => {
  const [an, cj] = await Promise.all([arbeitnowMatches(q).catch(() => [] as GermanyJob[]), careerjetAlertSearch(q, now)]);
  const seen = new Set<string>();
  const items = [...an, ...cj.items]
    .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''))
    .filter((j) => {
      const k = dedupeKey(j);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return { items, careerjet: cj.status };
};

const sourceName = (id: string) => PROVIDERS.find((p) => p.info.id === id)?.info.name ?? id;

const digestHtml = (alert: GermanyJobAlert, jobs: GermanyJob[], lng: SeoLocale) => {
  const m = GERMANY_ALERT_MAIL[lng];
  const rows = jobs
    .map((j) => {
      const meta = [j.company, j.location, m.via(sourceName(j.source))].filter(Boolean).join(' · ');
      const href = escapeHtml(applyUrl(alert, j, lng));
      return `<li style="margin:0 0 14px"><a href="${href}" style="color:#0b1f44;font-weight:600;text-decoration:none">${escapeHtml(j.title)}</a><br><span style="color:#5b6b88;font-size:13px">${escapeHtml(meta)}</span><br><a href="${href}" style="color:#1565e8;font-size:13px;font-weight:600">${escapeHtml(m.apply)} →</a></li>`;
    })
    .join('');
  return `<ul style="padding-left:18px;margin:0 0 8px">${rows}</ul>`;
};

const footerHtml = (alert: GermanyJobAlert, token: string, lng: SeoLocale) => {
  const m = GERMANY_ALERT_MAIL[lng];
  return `<p style="margin:22px 0 0;font-size:12px;color:#5b6b88;line-height:1.6">${escapeHtml(m.why(frequencyLabel(alert.frequency, lng)))}<br><a href="${escapeHtml(manageUrl(token, lng))}" style="color:#1565e8">${escapeHtml(m.manage)}</a> · <a href="${escapeHtml(manageUrl(token, lng, 'unsubscribe'))}" style="color:#1565e8">${escapeHtml(m.unsubscribe)}</a></p>`;
};

export interface AlertRunResult {
  due: number;
  groups: number;
  sent: number;
  careerjet: Partial<Record<AlertSearchStatus, number>>;
}

/**
 * Runs the due alerts once. Each alert is claimed with a conditional update on lastRunAt before anything is
 * sent, so overlapping runs never e-mail twice; listing ids go to GermanyJobAlertSent in the same step.
 */
export const runGermanyJobAlerts = async (now = new Date()): Promise<AlertRunResult> => {
  const result: AlertRunResult = { due: 0, groups: 0, sent: 0, careerjet: {} };
  const candidates = await prisma.germanyJobAlert.findMany({
    where: { confirmedAt: { not: null }, unsubscribedAt: null, OR: [{ lastRunAt: null }, { lastRunAt: { lte: new Date(now.getTime() - DAY + DUE_SLACK_MS) } }] },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });
  const due = candidates.filter((a) => isDue(a, now));
  if (!due.length) return result;

  // Account alerts: active account with e-mail notifications on; sent to the account's current address.
  const userIds = [...new Set(due.map((a) => a.userId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, isActive: true, emailNotifications: true } }) : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const alerts = due.filter((a) => !a.userId || (userById.get(a.userId)?.isActive && userById.get(a.userId)?.emailNotifications));
  result.due = alerts.length;

  // One lookup per distinct search; the most subscribed searches first (they get the Careerjet budget first).
  const groups = new Map<string, GermanyJobAlert[]>();
  for (const a of alerts) {
    const k = alertGroupKey(a);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const ordered = [...groups.values()].sort((x, y) => y.length - x.length);
  result.groups = ordered.length;
  const oldest = now.getTime() - MAX_LOOKBACK_DAYS * DAY;

  for (const members of ordered) {
    const { items, careerjet } = await groupListings(alertQuery(members[0]), now);
    result.careerjet[careerjet] = (result.careerjet[careerjet] ?? 0) + 1;
    for (const alert of members) {
      const since = Math.max(oldest, (alert.lastRunAt ?? alert.confirmedAt ?? now).getTime() - DAY);
      const fresh = items.filter((j) => !j.created || Date.parse(j.created) >= since);
      const already = fresh.length
        ? new Set((await prisma.germanyJobAlertSent.findMany({ where: { alertId: alert.id, listingId: { in: fresh.map((j) => j.id) } }, select: { listingId: true } })).map((r) => r.listingId))
        : new Set<string>();
      const jobs = fresh.filter((j) => !already.has(j.id)).slice(0, DIGEST_MAX_JOBS);
      // Claim the run (also when nothing is new: the next run is a full period later).
      const claimed = await prisma.germanyJobAlert.updateMany({
        where: { id: alert.id, lastRunAt: alert.lastRunAt, unsubscribedAt: null },
        data: jobs.length ? { lastRunAt: now, lastSentAt: now, sentCount: { increment: 1 } } : { lastRunAt: now },
      });
      if (!claimed.count || !jobs.length) continue;
      await prisma.germanyJobAlertSent.createMany({ data: jobs.map((j) => ({ alertId: alert.id, listingId: j.id.slice(0, 160), sentAt: now })), skipDuplicates: true });
      const lng = siteLocale(alert.locale);
      const m = GERMANY_ALERT_MAIL[lng];
      const subject = m.digestSubject(jobs.length);
      const html = renderEmail(subject, m.digestIntro(searchSummary(alert, lng)), { label: m.allResults, url: searchPageUrl(alert, lng) }, {
        html: digestHtml(alert, jobs, lng) + footerHtml(alert, alertToken(alert.id), lng),
      });
      const to = alert.userId ? (userById.get(alert.userId)?.email ?? alert.email) : alert.email;
      await sendMail(to, subject, html);
      result.sent++;
    }
  }
  return result;
};

/** DSGVO housekeeping: unconfirmed alerts after 7 days, unsubscribed ones 30 days later, sent-listing ids after 120 days. */
export const purgeGermanyJobAlerts = async (now = new Date()) => {
  const a = await prisma.germanyJobAlert.deleteMany({ where: { confirmedAt: null, createdAt: { lt: new Date(now.getTime() - UNCONFIRMED_TTL_DAYS * DAY) } } });
  const b = await prisma.germanyJobAlert.deleteMany({ where: { unsubscribedAt: { lt: new Date(now.getTime() - UNSUBSCRIBED_TTL_DAYS * DAY) } } });
  await prisma.germanyJobAlertSent.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - SENT_TTL_DAYS * DAY) } } });
  return a.count + b.count;
};

// ─── Privacy (Art. 15 / 17) ─────────────────────────────────────────────

const personWhere = (email: string, userId?: string | null): Prisma.GermanyJobAlertWhereInput => ({
  OR: [{ email: email.trim().toLowerCase() }, ...(userId ? [{ userId }] : [])],
});

/** Art. 15: the alerts of an address / account (no token hash). */
export const exportGermanyJobAlerts = async (email: string, userId?: string | null) =>
  (await prisma.germanyJobAlert.findMany({ where: personWhere(email, userId), orderBy: { createdAt: 'asc' } })).map((a) => ({
    ...alertView(a),
    consentVersion: a.consentVersion,
    confirmedAt: a.confirmedAt,
    unsubscribedAt: a.unsubscribedAt,
  }));

/** Art. 17: deletes the alerts of an address / account (their sent-listing ids cascade). */
export const eraseGermanyJobAlerts = async (email: string, userId?: string | null, tx: Prisma.TransactionClient = prisma) =>
  (await tx.germanyJobAlert.deleteMany({ where: personWhere(email, userId) })).count;

// ─── Staff (Admin → Job channels) ────────────────────────────────────────

export const germanyAlertStats = async (now = new Date()) => {
  const [active, pending, accounts, weekly, sent7d, saved, rows, budget] = await Promise.all([
    prisma.germanyJobAlert.count({ where: { confirmedAt: { not: null }, unsubscribedAt: null } }),
    prisma.germanyJobAlert.count({ where: { confirmedAt: null } }),
    prisma.germanyJobAlert.count({ where: { confirmedAt: { not: null }, unsubscribedAt: null, userId: { not: null } } }),
    prisma.germanyJobAlert.count({ where: { confirmedAt: { not: null }, unsubscribedAt: null, frequency: 'weekly' } }),
    prisma.germanyJobAlert.count({ where: { lastSentAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.savedGermanyJob.count(),
    prisma.germanyJobAlert.findMany({
      where: { confirmedAt: { not: null }, unsubscribedAt: null },
      select: { q: true, place: true, radius: true, jobType: true, workTime: true, remote: true, visa: true },
      take: 5000,
    }),
    careerjetAlertBudget(now),
  ]);
  const searches = new Map<string, { q: string; where: string; type: string; count: number }>();
  for (const r of rows) {
    const k = alertGroupKey(r);
    const s = searches.get(k) ?? { q: r.q, where: r.place, type: r.jobType, count: 0 };
    s.count++;
    searches.set(k, s);
  }
  return {
    active,
    pending,
    accounts,
    daily: active - weekly,
    weekly,
    sentLast7Days: sent7d,
    uniqueSearches: searches.size,
    topSearches: [...searches.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    savedJobs: saved,
    careerjetBudget: budget,
  };
};
