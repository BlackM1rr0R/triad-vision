import type { Locale, Role } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { buildMyWork, clockFor, type WorkItem, type WorkKind } from '../myWork.js';
import { DIGEST_TEXTS, type DigestSection } from './texts.js';

/**
 * Staff morning digest ("bu gün nə etməlisən"): one e-mail per staff member and Baku day, sent from 08:00
 * Asia/Baku (until 12:00, so a long outage does not mail stale news in the afternoon). The data is the
 * member's own "my work today" queue (lib/myWork, scope "mine"), grouped into: today's appointments,
 * overdue work, documents expiring soon, new inquiries / assignments and things due today.
 *
 * - Recipients: active STAFF / ADMIN / SUPER_ADMIN users with e-mail notifications on who did not opt out
 *   (Setting `staffDigest:<userId>` = { enabled: false }; default on).
 * - Empty day: nothing is sent.
 * - Idempotent: ReminderLog key `staff-digest:<userId>:<bakuDay>` is claimed before sending (also on empty
 *   days, so later runs that day cost one lookup), so restarts / overlapping runs never mail twice.
 * - Language: the recipient's account language (`user.locale`).
 */

export const DIGEST_HOUR = 8;
export const DIGEST_UNTIL_HOUR = 12;
/** Rows per section in the e-mail (the rest is "… and N more"). */
export const DIGEST_ROWS = 8;

const HOUR = 60 * 60 * 1000;
const BAKU_OFFSET = 4 * HOUR; // Asia/Baku is UTC+4 all year
const STAFF: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

export const optOutKey = (userId: string) => `staffDigest:${userId}`;
const sentKey = (userId: string, day: string) => `staff-digest:${userId}:${day}`;

export const bakuDay = (now: Date) => new Date(now.getTime() + BAKU_OFFSET).toISOString().slice(0, 10);
const bakuHour = (now: Date) => new Date(now.getTime() + BAKU_OFFSET).getUTCHours();

// ─── Preference ─────────────────────────────────────────────────────────

export const isDigestEnabled = async (userId: string) => {
  const row = await prisma.setting.findUnique({ where: { key: optOutKey(userId) } });
  return (row?.value as { enabled?: boolean } | null)?.enabled !== false;
};

export const setDigestEnabled = async (userId: string, enabled: boolean) => {
  const key = optOutKey(userId);
  await prisma.setting.upsert({ where: { key }, create: { key, value: { enabled } }, update: { value: { enabled } } });
  return enabled;
};

// ─── Content ────────────────────────────────────────────────────────────

const APPOINTMENT_KINDS = new Set<WorkKind>(['booking', 'appointment']);
const NEW_KINDS = new Set<WorkKind>(['inquiry', 'application', 'employer_decision', 'candidate_request', 'processing', 'handover']);
/** Mail has its own inbox; the digest does not repeat it. */
const SKIP_KINDS = new Set<WorkKind>(['mail_unread', 'mail_triage']);
export const SECTION_ORDER: DigestSection[] = ['appointments', 'overdue', 'expiring', 'new', 'today'];

/** The section an item belongs to (null: not for today's e-mail, e.g. due later this week). */
export const sectionOf = (i: WorkItem): DigestSection | null => {
  if (SKIP_KINDS.has(i.kind)) return null;
  if (APPOINTMENT_KINDS.has(i.kind) && i.bucket === 'today') return 'appointments';
  if (i.kind === 'expiring') return 'expiring';
  if (NEW_KINDS.has(i.kind)) return 'new';
  if (i.overdue) return 'overdue';
  if (i.bucket === 'today') return 'today';
  return null;
};

export interface DigestRow {
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  overdue: boolean;
  daysLeft: number | null;
  link: string;
}

export interface DigestData {
  day: string;
  total: number;
  sections: { key: DigestSection; total: number; rows: DigestRow[] }[];
}

export interface DigestRecipient {
  id: string;
  email: string;
  locale: Locale;
  role: Role;
  firstName: string;
  lastName: string;
}

export const buildDigestData = async (user: DigestRecipient, now: Date): Promise<DigestData> => {
  const work = await buildMyWork(user, { team: false, now });
  const grouped = new Map<DigestSection, WorkItem[]>();
  for (const item of work.items) {
    const s = sectionOf(item);
    if (s) grouped.set(s, [...(grouped.get(s) ?? []), item]);
  }
  const sections = SECTION_ORDER.filter((k) => grouped.get(k)?.length).map((key) => {
    const items = grouped.get(key)!;
    // Appointments in time order; everything else keeps the queue order (overdue, priority, deadline).
    if (key === 'appointments') items.sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
    return {
      key,
      total: items.length,
      rows: items.slice(0, DIGEST_ROWS).map((i) => ({
        title: i.title,
        subtitle: i.subtitle ? i.subtitle.replace(/\s+/g, ' ').slice(0, 90) : null,
        dueAt: i.dueAt,
        overdue: i.overdue,
        daysLeft: i.kind === 'expiring' && typeof i.note?.params?.days === 'number' ? (i.note.key === 'expired' ? 0 : i.note.params.days) : null,
        link: i.link,
      })),
    };
  });
  return { day: bakuDay(now), total: sections.reduce((n, s) => n + s.total, 0), sections };
};

const INTL: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const fmtTime = (iso: string, locale: Locale) => new Intl.DateTimeFormat(INTL[locale], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Baku' }).format(new Date(iso));
const fmtDay = (iso: string, locale: Locale) => new Intl.DateTimeFormat(INTL[locale], { day: '2-digit', month: '2-digit', timeZone: 'Asia/Baku' }).format(new Date(iso));

export const renderDigest = (d: DigestData, user: Pick<DigestRecipient, 'locale' | 'firstName'>, now: Date) => {
  const tx = DIGEST_TEXTS[user.locale];
  const { endOfToday } = clockFor(undefined, now);
  const startOfToday = endOfToday.getTime() - 24 * HOUR;
  const when = (r: DigestRow, section: DigestSection) => {
    if (r.daysLeft !== null) return tx.daysLeft(r.daysLeft);
    if (!r.dueAt) return null;
    const t = Date.parse(r.dueAt);
    if (section === 'appointments' || (t >= startOfToday && t < endOfToday.getTime())) return fmtTime(r.dueAt, user.locale);
    return r.overdue ? tx.overdueSince(fmtDay(r.dueAt, user.locale)) : fmtDay(r.dueAt, user.locale);
  };
  const parts = [`${tx.greeting(user.firstName)}\n${tx.summary(d.total)}`];
  for (const s of d.sections) {
    const lines = s.rows.map((r) => `• ${[when(r, s.key), r.title, r.subtitle].filter(Boolean).join(' · ')}`);
    if (s.total > s.rows.length) lines.push(tx.more(s.total - s.rows.length));
    parts.push(`${tx.sections[s.key]} (${s.total})\n${lines.join('\n')}`);
  }
  parts.push(tx.optOut);
  return { subject: tx.subject(d.day), title: tx.title, body: parts.join('\n\n') };
};

// ─── Sending ────────────────────────────────────────────────────────────

const claim = async (key: string, now: Date) => {
  try {
    await prisma.reminderLog.create({ data: { key: key.slice(0, 191), sentAt: now } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/**
 * Builds and sends one digest. `test`: send now even when empty or already sent today (the "send me a test"
 * button) and without claiming the day.
 */
export const sendDigest = async (user: DigestRecipient, opts: { now?: Date; test?: boolean } = {}): Promise<{ sent: boolean; reason?: 'EMPTY' | 'ALREADY_SENT'; total: number }> => {
  const now = opts.now ?? new Date();
  const key = sentKey(user.id, bakuDay(now));
  if (!opts.test && (await prisma.reminderLog.findUnique({ where: { key } }))) return { sent: false, reason: 'ALREADY_SENT', total: 0 };
  const data = await buildDigestData(user, now);
  if (!opts.test) {
    // Claimed before sending: a parallel run (overlapping deploy) loses the race and sends nothing.
    if (!(await claim(key, now))) return { sent: false, reason: 'ALREADY_SENT', total: data.total };
    if (!data.total) return { sent: false, reason: 'EMPTY', total: 0 };
  }
  const { subject, title, body } = renderDigest(data, user, now);
  await sendMail(user.email, `Triad Vision · ${subject}`, renderEmail(title, body, { label: DIGEST_TEXTS[user.locale].cta, url: `${config.clientUrl}/admin/today` }));
  return { sent: true, total: data.total };
};

/** Active staff with e-mail notifications on, minus those who switched the digest off. */
export const digestRecipients = async (): Promise<DigestRecipient[]> => {
  const [users, off] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { in: STAFF }, emailNotifications: true },
      select: { id: true, email: true, locale: true, role: true, firstName: true, lastName: true },
    }),
    prisma.setting.findMany({ where: { key: { startsWith: 'staffDigest:' } } }),
  ]);
  const disabled = new Set(off.filter((s) => (s.value as { enabled?: boolean } | null)?.enabled === false).map((s) => s.key.slice('staffDigest:'.length)));
  return users.filter((u) => !disabled.has(u.id));
};

/** Job body (every 15 min): from 08:00 to 12:00 Baku time, one digest per recipient per day. Returns the number sent. */
export const runStaffDigest = async (now = new Date()) => {
  const hour = bakuHour(now);
  if (hour < DIGEST_HOUR || hour >= DIGEST_UNTIL_HOUR) return 0;
  let sent = 0;
  for (const u of await digestRecipients()) {
    try {
      if ((await sendDigest(u, { now })).sent) sent++;
    } catch (err) {
      console.error('[job:staff-digest] failed for', u.id, err);
    }
  }
  return sent;
};
