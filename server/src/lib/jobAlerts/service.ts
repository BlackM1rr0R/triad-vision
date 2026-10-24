import crypto from 'node:crypto';
import type { JobAlert, Prisma, Vacancy } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { GERMAN_LEVELS, PROFESSION_KEYS, canonicalProfession, germanRank, professionFamily } from '../matching.js';
import { openVacancyWhere } from '../vacancies.js';
import { escapeHtml, localizedPath, pick } from '../seo.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { renderEmail, sendMail } from '../mailer.js';
import { ALERT_MAIL, PROFESSION_LABELS, professionLabel } from './texts.js';

/**
 * Job alerts (model JobAlert): "notify me about new jobs" for a set of professions, an optional German level
 * and optional job kinds.
 *
 *  - Visitors: double opt-in. The alert is created unconfirmed and a confirmation e-mail is sent; nothing else
 *    is ever sent before the address is confirmed. Unconfirmed alerts are deleted after 7 days.
 *  - Signed-in clients: created confirmed for their account e-mail (they proved it at sign-up); digests respect
 *    the account's e-mail notification setting.
 *  - Every e-mail carries a manage link and an unsubscribe link (random token, only its SHA-256 is stored).
 *    Unsubscribing stops all mail at once; the row is deleted 30 days later (or with the account).
 *  - Matching: a vacancy matches when its profession (or title) maps to one of the alert's professions or the
 *    same profession family (lib/matching.ts), its minimum German level is not above the alert's level, and
 *    its kind (work / Ausbildung / seasonal) is one of the alert's kinds, when any are set.
 *  - Digest: at most one e-mail per alert per day, listing the vacancies published since the last digest
 *    (or the confirmation). Triggered when a vacancy is published, plus a periodic safety-net job.
 */

export const JOB_KINDS = ['work', 'ausbildung', 'seasonal'] as const;
export type JobKind = (typeof JOB_KINDS)[number];
const DAY = 24 * 60 * 60 * 1000;
export const UNCONFIRMED_TTL_DAYS = 7;
export const UNSUBSCRIBED_TTL_DAYS = 30;
export const MAX_ALERTS_PER_EMAIL = 5;
/** A digest never lists vacancies older than this (first digest after a long pause stays short). */
const MAX_LOOKBACK_DAYS = 14;
const DIGEST_MAX_JOBS = 15;

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const placeholderHash = () => hashToken(crypto.randomBytes(24).toString('base64url'));
/**
 * The manage / unsubscribe token of an alert: derived from its id with the server secret, so every e-mail
 * (also an old one) carries a working link while the database only holds the token's SHA-256.
 */
export const alertToken = (alertId: string) => crypto.createHmac('sha256', config.jwtSecret).update(`job-alert:${alertId}`).digest('base64url');

/** Creates an alert and stores the hash of its derived token. */
const createWithToken = async (data: Omit<Prisma.JobAlertUncheckedCreateInput, 'tokenHash'>) => {
  const created = await prisma.jobAlert.create({ data: { ...data, tokenHash: placeholderHash() } });
  const token = alertToken(created.id);
  const alert = await prisma.jobAlert.update({ where: { id: created.id }, data: { tokenHash: hashToken(token) } });
  return { alert, token };
};

export const alertPrefsSchema = z.object({
  professions: z.array(z.enum(PROFESSION_KEYS as [string, ...string[]])).min(1).max(10),
  germanLevel: z.enum(GERMAN_LEVELS).nullable().optional(),
  kinds: z.array(z.enum(JOB_KINDS)).max(3).optional(),
  lng: z.string().optional(),
});
export type AlertPrefs = z.infer<typeof alertPrefsSchema>;

const siteLocale = (raw: unknown): SeoLocale => ((SEO_LOCALES as readonly string[]).includes(String(raw)) ? (raw as SeoLocale) : 'az');

const stringList = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);

export const manageUrl = (token: string, lng: SeoLocale, action?: 'confirm' | 'unsubscribe') =>
  `${config.clientUrl}/job-alert?token=${encodeURIComponent(token)}&lng=${lng}${action ? `&action=${action}` : ''}`;

// ─── Matching (pure) ────────────────────────────────────────────────────

export const kindOf = (employmentType: string): JobKind => (employmentType === 'AUSBILDUNG' ? 'ausbildung' : employmentType === 'SEASONAL' ? 'seasonal' : 'work');

/** Canonical profession of a vacancy: its profession field, else its title (de → en → az → ru). */
export const vacancyProfession = (v: Pick<Vacancy, 'profession' | 'title'>): string | null => {
  const own = canonicalProfession(v.profession);
  if (own) return own;
  const t = (v.title ?? {}) as Record<string, unknown>;
  for (const l of ['de', 'en', 'az', 'ru']) {
    const hit = typeof t[l] === 'string' ? canonicalProfession(t[l] as string) : null;
    if (hit) return hit;
  }
  return null;
};

export const alertMatches = (
  alert: Pick<JobAlert, 'professions' | 'germanLevel' | 'visaTypes'>,
  v: Pick<Vacancy, 'profession' | 'title' | 'germanLevel' | 'employmentType'>,
) => {
  const key = vacancyProfession(v);
  if (!key) return false;
  const wanted = stringList(alert.professions);
  const family = professionFamily(key);
  if (!wanted.some((w) => w === key || (family && professionFamily(w) === family))) return false;
  if (alert.germanLevel && germanRank(v.germanLevel) > germanRank(alert.germanLevel)) return false;
  const kinds = stringList(alert.visaTypes);
  if (kinds.length && !kinds.includes(kindOf(v.employmentType))) return false;
  return true;
};

// ─── E-mails ────────────────────────────────────────────────────────────

const professionsText = (alert: Pick<JobAlert, 'professions'>, lng: SeoLocale) =>
  stringList(alert.professions)
    .map((p) => professionLabel(p, lng))
    .join(', ');

const footerHtml = (token: string, lng: SeoLocale) => {
  const m = ALERT_MAIL[lng];
  return `<p style="margin:22px 0 0;font-size:12px;color:#5b6b88;line-height:1.6">${escapeHtml(m.why)}<br><a href="${escapeHtml(manageUrl(token, lng))}" style="color:#1565e8">${escapeHtml(m.manage)}</a> · <a href="${escapeHtml(manageUrl(token, lng, 'unsubscribe'))}" style="color:#1565e8">${escapeHtml(m.unsubscribe)}</a></p>`;
};

export const sendConfirmMail = async (alert: Pick<JobAlert, 'email' | 'professions' | 'locale'>, token: string) => {
  const lng = siteLocale(alert.locale);
  const m = ALERT_MAIL[lng];
  const html = renderEmail(m.confirmSubject, m.confirmBody(professionsText(alert, lng)), { label: m.confirmCta, url: manageUrl(token, lng, 'confirm') });
  await sendMail(alert.email, m.confirmSubject, html);
};

type DigestJob = Pick<Vacancy, 'slug' | 'title' | 'city' | 'salaryMin' | 'salaryMax'>;

const digestHtml = (jobs: DigestJob[], lng: SeoLocale) => {
  const m = ALERT_MAIL[lng];
  const origin = new URL(config.clientUrl).origin;
  const rows = jobs
    .map((j) => {
      const salary = j.salaryMin != null || j.salaryMax != null ? `${[j.salaryMin, j.salaryMax].filter((x) => x != null).join('–')} € ${m.perMonth}` : '';
      const meta = [j.city, salary].filter(Boolean).join(' · ');
      return `<li style="margin:0 0 10px"><a href="${escapeHtml(`${origin}${localizedPath(`/jobs/${j.slug}`, lng)}`)}" style="color:#1565e8;font-weight:600">${escapeHtml(pick(j.title, lng))}</a>${meta ? `<br><span style="color:#5b6b88;font-size:13px">${escapeHtml(meta)}</span>` : ''}</li>`;
    })
    .join('');
  return `<ul style="padding-left:18px;margin:0 0 8px">${rows}</ul>`;
};

// ─── Create / confirm / manage ──────────────────────────────────────────

export const createPublicAlert = async (input: { email: string; prefs: AlertPrefs; visitorId?: string | null }) => {
  const lng = siteLocale(input.prefs.lng);
  const active = await prisma.jobAlert.count({ where: { email: input.email, unsubscribedAt: null } });
  if (active >= MAX_ALERTS_PER_EMAIL) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  const { alert, token } = await createWithToken({
    email: input.email,
    locale: lng,
    professions: input.prefs.professions,
    germanLevel: input.prefs.germanLevel ?? null,
    visaTypes: input.prefs.kinds?.length ? input.prefs.kinds : undefined,
    visitorId: input.visitorId ?? null,
  });
  await sendConfirmMail(alert, token);
  return { ok: true as const, alert };
};

export const createAccountAlert = async (user: { id: string; email: string; locale: string }, prefs: AlertPrefs) => {
  const active = await prisma.jobAlert.count({ where: { userId: user.id, unsubscribedAt: null } });
  if (active >= MAX_ALERTS_PER_EMAIL) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  const { alert } = await createWithToken({
    email: user.email,
    userId: user.id,
    locale: prefs.lng ? siteLocale(prefs.lng) : siteLocale(user.locale),
    professions: prefs.professions,
    germanLevel: prefs.germanLevel ?? null,
    visaTypes: prefs.kinds?.length ? prefs.kinds : undefined,
    confirmedAt: new Date(),
  });
  return { ok: true as const, alert };
};

export const findByToken = (token: unknown) =>
  typeof token === 'string' && token.length >= 20 && token.length <= 100 ? prisma.jobAlert.findUnique({ where: { tokenHash: hashToken(token) } }) : Promise.resolve(null);

/** a***@example.com */
export const maskEmail = (email: string) => {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain ?? ''}`;
};

export const alertView = (a: JobAlert, opts: { maskedEmail?: boolean } = {}) => ({
  id: a.id,
  email: opts.maskedEmail ? maskEmail(a.email) : a.email,
  locale: a.locale,
  professions: stringList(a.professions),
  germanLevel: a.germanLevel,
  kinds: stringList(a.visaTypes),
  confirmed: !!a.confirmedAt,
  unsubscribed: !!a.unsubscribedAt,
  lastSentAt: a.lastSentAt,
  sentCount: a.sentCount,
  createdAt: a.createdAt,
});

export const prefsData = (prefs: Partial<AlertPrefs>): Prisma.JobAlertUpdateInput => ({
  ...(prefs.professions ? { professions: prefs.professions } : {}),
  ...(prefs.germanLevel !== undefined ? { germanLevel: prefs.germanLevel } : {}),
  ...(prefs.kinds ? { visaTypes: prefs.kinds.length ? prefs.kinds : [] } : {}),
  ...(prefs.lng ? { locale: siteLocale(prefs.lng) } : {}),
});

/** Profession options for the forms, in a language. */
export const professionOptions = (lng: SeoLocale) =>
  PROFESSION_KEYS.map((key) => ({ key, label: professionLabel(key, lng), family: professionFamily(key) })).sort((a, b) => a.label.localeCompare(b.label, lng));

// ─── Digest ─────────────────────────────────────────────────────────────

/**
 * Sends the due digests (at most one per alert per day). Each alert is claimed with a conditional update on
 * lastSentAt, so overlapping runs (publish hook + periodic job) never send twice. Returns alerts e-mailed.
 */
export const runJobAlertDigests = async (now = new Date()) => {
  const dueBefore = new Date(now.getTime() - DAY);
  const alerts = await prisma.jobAlert.findMany({
    where: { confirmedAt: { not: null }, unsubscribedAt: null, OR: [{ lastSentAt: null }, { lastSentAt: { lte: dueBefore } }] },
    take: 2000,
  });
  if (!alerts.length) return 0;
  const oldest = new Date(now.getTime() - MAX_LOOKBACK_DAYS * DAY);
  const vacancies = await prisma.vacancy.findMany({
    where: { ...openVacancyWhere(now), publishedAt: { gte: oldest, lte: now } },
    orderBy: { publishedAt: 'desc' },
    take: 500,
    select: { id: true, slug: true, title: true, city: true, salaryMin: true, salaryMax: true, profession: true, germanLevel: true, employmentType: true, publishedAt: true },
  });
  if (!vacancies.length) return 0;
  const userIds = [...new Set(alerts.map((a) => a.userId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, isActive: true, emailNotifications: true } }) : [];
  const userOk = new Map(users.map((u) => [u.id, u.isActive && u.emailNotifications]));

  let sent = 0;
  for (const alert of alerts) {
    if (alert.userId && !userOk.get(alert.userId)) continue; // account alerts follow the account's notification setting
    const since = new Date(Math.max((alert.lastSentAt ?? alert.confirmedAt!).getTime(), oldest.getTime()));
    const jobs = vacancies.filter((v) => v.publishedAt && v.publishedAt > since && alertMatches(alert, v)).slice(0, DIGEST_MAX_JOBS);
    if (!jobs.length) continue;
    const { count } = await prisma.jobAlert.updateMany({
      where: { id: alert.id, lastSentAt: alert.lastSentAt, unsubscribedAt: null },
      data: { lastSentAt: now, sentCount: { increment: 1 } },
    });
    if (!count) continue;
    const lng = siteLocale(alert.locale);
    const m = ALERT_MAIL[lng];
    const token = alertToken(alert.id);
    const origin = new URL(config.clientUrl).origin;
    const html = renderEmail(m.digestSubject(jobs.length), m.digestIntro(professionsText(alert, lng)), { label: m.digestCta, url: `${origin}${localizedPath('/jobs', lng)}` }, {
      html: digestHtml(jobs, lng) + footerHtml(token, lng),
    });
    await sendMail(alert.email, m.digestSubject(jobs.length), html);
    sent++;
  }
  return sent;
};

let running: Promise<unknown> | null = null;
let again = false;

/** Publish hook: runs the digests in the background (coalesced; never throws). */
export const onVacancyPublished = () => {
  if (running) {
    again = true;
    return;
  }
  running = runJobAlertDigests()
    .catch((err) => console.error('[job-alerts] digest failed', err))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        onVacancyPublished();
      }
    });
};

/** DSGVO housekeeping: unconfirmed alerts after 7 days, unsubscribed ones 30 days after unsubscribing. */
export const purgeJobAlerts = async (now = new Date()) => {
  const a = await prisma.jobAlert.deleteMany({ where: { confirmedAt: null, createdAt: { lt: new Date(now.getTime() - UNCONFIRMED_TTL_DAYS * DAY) } } });
  const b = await prisma.jobAlert.deleteMany({ where: { unsubscribedAt: { lt: new Date(now.getTime() - UNSUBSCRIBED_TTL_DAYS * DAY) } } });
  return a.count + b.count;
};

/** Active (confirmed, subscribed) alerts per profession key, for the admin vacancies / analytics area. */
export const alertStats = async () => {
  const rows = await prisma.jobAlert.findMany({ where: { confirmedAt: { not: null }, unsubscribedAt: null }, select: { professions: true, userId: true } });
  const pending = await prisma.jobAlert.count({ where: { confirmedAt: null } });
  const counts = new Map<string, number>();
  for (const r of rows) for (const p of new Set(stringList(r.professions))) counts.set(p, (counts.get(p) ?? 0) + 1);
  return {
    active: rows.length,
    accounts: rows.filter((r) => r.userId).length,
    pending,
    professions: [...counts.entries()]
      .map(([key, count]) => ({ key, count, labels: PROFESSION_LABELS[key] ?? null }))
      .sort((x, y) => y.count - x.count),
  };
};
