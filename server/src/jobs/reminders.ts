import type { CaseStatus, Locale, User } from '@prisma/client';
import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { formatDateTime, notifyUser } from '../lib/notifications.js';
import { formatDay, textsFor, type PassportLevel, type SlaRow } from '../lib/growthTexts.js';
import { inviteForCase } from '../lib/reviewInvites.js';
import { FINAL_STATUSES } from '../lib/caseFlow.js';
import { preferredChannel, sendSms, sendWhatsApp } from '../lib/messaging/outbound.js';

/**
 * Appointment, missing-document, passport-expiry, contract-signature and staff-SLA reminders,
 * plus review invitations. Every send is guarded by a unique ReminderLog key, so a run can be
 * repeated (restarts, overlapping deploys) without sending anything twice. Each function takes
 * `now` so tests can drive time.
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const MISSING_DOCS_IDLE_DAYS = 7;
export const MISSING_DOCS_MAX_REMINDERS = 3;
export const CONTRACT_WAIT_DAYS = 5;
export const SLA_DAYS = 3;
export const SLA_DECISION_DAYS = 21;
export const REVIEW_AFTER_DAYS = 3;
/** Approvals older than this are not invited (avoids mailing old cases on the first deploy). */
export const REVIEW_MAX_AGE_DAYS = 180;
/** Local Baku hour from which "today" appointment reminders and the staff digest go out. */
export const MORNING_HOUR = 7;
export const DIGEST_HOUR = 8;

// ─── Helpers ───────────────────────────────────────────────────────────

const bakuFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baku',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Calendar day (YYYY-MM-DD) and hour in Baku time. */
export const bakuParts = (d: Date) => {
  const p = Object.fromEntries(bakuFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
};

export const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
};

/** Records that a reminder was sent; false when it was already sent (unique key). */
export const claimReminder = async (key: string, now = new Date()) => {
  try {
    await prisma.reminderLog.create({ data: { key: key.slice(0, 191), sentAt: now } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

const admins = () =>
  prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, locale: true } });

/** The assigned staff member, or every admin when nobody (active) is assigned. */
const staffFor = async (assigned: Pick<User, 'id' | 'locale' | 'isActive'> | null) =>
  assigned?.isActive ? [{ id: assigned.id, locale: assigned.locale }] : admins();

const l10nTitle = (title: unknown, locale: Locale) => {
  const t = (title ?? {}) as Partial<Record<Locale, string>>;
  return t[locale] || t.az || t.en || '';
};

// ─── Embassy appointment ───────────────────────────────────────────────

/** WhatsApp (preferred) or SMS copy of the 24-hour appointment reminder; `appt-24h-<channel>:` keys keep it single-shot. */
export const sendPhoneReminder = async (c: { id: string; clientId: string; client: User }, text: string, iso: string, now: Date) => {
  const channel = preferredChannel(c.client);
  if (!channel) return null;
  const key = channel === 'WHATSAPP' ? `appt-24h-wa:${c.id}:${iso}` : `appt-24h-sms:${c.id}:${iso}`;
  if (!(await claimReminder(key, now))) return null;
  return channel === 'WHATSAPP'
    ? sendWhatsApp({ userId: c.clientId, caseId: c.id, templateKey: 'APPOINTMENT_REMINDER' }, text)
    : sendSms({ userId: c.clientId, caseId: c.id, templateKey: 'APPOINTMENT_REMINDER' }, text);
};

export const runAppointmentReminders = async (now = new Date()) => {
  const cases = await prisma.case.findMany({
    where: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } },
    include: { client: true, assignedStaff: true },
  });
  const today = bakuParts(now);
  for (const c of cases) {
    const at = c.appointmentAt!;
    const iso = at.toISOString();
    const sameDay = bakuParts(at).day === today.day;
    const place = c.appointmentPlace ?? '—';
    const link = `/account/cases/${c.id}`;
    const send = async (when: 'today' | 'tomorrow') => {
      const tx = textsFor(c.client.locale);
      const { title, body } = tx.appointment({ when, number: c.number, date: formatDateTime(at, c.client.locale), place });
      await notifyUser(c.clientId, { type: 'APPOINTMENT_REMINDER', title, body, link, caseId: c.id, ctaLabel: tx.cta.openCase });
      // 24-hour reminder also by phone: WhatsApp when opted in (preferred), otherwise SMS (one ReminderLog key per channel).
      if (when === 'tomorrow') await sendPhoneReminder(c, `${title}\n\n${body}`, iso, now);
    };

    if (sameDay) {
      if (today.hour >= MORNING_HOUR && (await claimReminder(`appt-day:${c.id}:${iso}`, now))) {
        // A same-day reminder replaces a "tomorrow" one that never went out.
        await claimReminder(`appt-24h:${c.id}:${iso}`, now);
        await send('today');
      }
      continue;
    }
    if (await claimReminder(`appt-24h:${c.id}:${iso}`, now)) await send('tomorrow');
    if (c.assignedStaff?.isActive && (await claimReminder(`appt-staff:${c.id}:${iso}`, now))) {
      const s = c.assignedStaff;
      const tx = textsFor(s.locale);
      const { title, body } = tx.appointmentStaff({ number: c.number, client: fullName(c.client), date: formatDateTime(at, s.locale), place });
      await notifyUser(s.id, { type: 'APPOINTMENT_REMINDER_STAFF', title, body, link: `/admin/cases/${c.id}`, caseId: c.id, ctaLabel: tx.cta.admin });
    }
  }
};

// ─── Missing documents ─────────────────────────────────────────────────

const UPLOAD_STAGE: Partial<Record<CaseStatus, 'INITIAL' | 'EMBASSY'>> = { DOCUMENTS_PENDING: 'INITIAL', EMBASSY_DOCUMENTS: 'EMBASSY' };

export const runMissingDocsReminders = async (now = new Date()) => {
  const cases = await prisma.case.findMany({
    where: { status: { in: ['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS'] } },
    include: {
      client: true,
      assignedStaff: true,
      requirements: { where: { required: true }, orderBy: { sortOrder: 'asc' }, include: { documents: { select: { status: true } } } },
    },
  });
  for (const c of cases) {
    const stage = UPLOAD_STAGE[c.status]!;
    const missing = c.requirements.filter((r) => r.stage === stage && !r.documents.some((d) => d.status !== 'REJECTED'));
    if (!missing.length) continue;

    // An "episode" is one stay in this status: a case sent back for changes gets a fresh budget.
    const [entered, lastUpload] = await Promise.all([
      prisma.caseEvent.findFirst({ where: { caseId: c.id, toStatus: c.status }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true } }),
      prisma.document.findFirst({ where: { caseId: c.id, stage, uploadedById: c.clientId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    const episode = entered?.id ?? 'start';
    const enteredAt = entered?.createdAt ?? c.createdAt;
    const lastActivity = Math.max(enteredAt.getTime(), lastUpload?.createdAt.getTime() ?? 0);
    const idle = now.getTime() - lastActivity;
    if (idle < MISSING_DOCS_IDLE_DAYS * DAY) continue;

    const prefix = `missing-docs:${c.id}:${episode}:`;
    const sent = await prisma.reminderLog.findMany({ where: { key: { startsWith: prefix } }, orderBy: { sentAt: 'desc' } });
    const sinceLast = sent.length ? now.getTime() - sent[0].sentAt.getTime() : Infinity;
    if (sinceLast < MISSING_DOCS_IDLE_DAYS * DAY) continue;

    if (sent.length < MISSING_DOCS_MAX_REMINDERS) {
      if (!(await claimReminder(`${prefix}${sent.length + 1}`, now))) continue;
      const tx = textsFor(c.client.locale);
      const { title, body } = tx.missingDocs({ number: c.number, stage, missing: missing.map((r) => l10nTitle(r.title, c.client.locale)) });
      await notifyUser(c.clientId, { type: 'MISSING_DOCUMENTS_REMINDER', title, body, link: `/account/cases/${c.id}`, caseId: c.id, ctaLabel: tx.cta.uploadDocs });
    } else if (await claimReminder(`missing-docs-staff:${c.id}:${episode}`, now)) {
      for (const s of await staffFor(c.assignedStaff)) {
        const tx = textsFor(s.locale);
        const { title, body } = tx.missingDocsStaff({ number: c.number, client: fullName(c.client), count: missing.length, days: Math.floor(idle / DAY) });
        await notifyUser(s.id, { type: 'MISSING_DOCUMENTS_ESCALATION', title, body, link: `/admin/cases/${c.id}`, caseId: c.id, ctaLabel: tx.cta.admin });
      }
    }
  }
};

// ─── Passport expiry ───────────────────────────────────────────────────

export const passportLevel = (expiry: Date, now: Date): PassportLevel | null => {
  if (expiry.getTime() <= now.getTime()) return 'expired';
  if (expiry <= addMonths(now, 3)) return '3m';
  if (expiry <= addMonths(now, 6)) return '6m';
  return null;
};

export const runPassportReminders = async (now = new Date()) => {
  const users = await prisma.user.findMany({
    where: { role: 'CLIENT', isActive: true, passportExpiry: { not: null, lte: addMonths(now, 6) } },
    include: {
      cases: { where: { status: { notIn: FINAL_STATUSES } }, take: 1, orderBy: { createdAt: 'desc' }, include: { assignedStaff: true } },
    },
  });
  for (const u of users) {
    const expiry = u.passportExpiry!;
    const level = passportLevel(expiry, now);
    if (!level) continue;
    const key = `passport:${u.id}:${expiry.toISOString().slice(0, 10)}:${level}`;
    if (!(await claimReminder(key, now))) continue;
    const tx = textsFor(u.locale);
    const { title, body } = tx.passport({ level, date: formatDay(expiry, u.locale) });
    await notifyUser(u.id, { type: 'PASSPORT_EXPIRY', title, body, link: '/account/profile', ctaLabel: tx.cta.profile });

    const active = u.cases[0];
    if (active) {
      for (const s of await staffFor(active.assignedStaff)) {
        const st = textsFor(s.locale);
        const m = st.passportStaff({ number: active.number, client: fullName(u), level, date: formatDay(expiry, s.locale) });
        await notifyUser(s.id, { type: 'PASSPORT_EXPIRY_STAFF', ...m, link: `/admin/cases/${active.id}`, caseId: active.id, ctaLabel: st.cta.admin });
      }
    }
  }
};

// ─── Staff SLA digest ──────────────────────────────────────────────────

const STAFF_TURN: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'];

export const runStaffSlaDigest = async (now = new Date()) => {
  const local = bakuParts(now);
  if (local.hour < DIGEST_HOUR) return;
  const cases = await prisma.case.findMany({
    where: {
      OR: [
        { status: { in: STAFF_TURN }, updatedAt: { lt: new Date(now.getTime() - SLA_DAYS * DAY) } },
        { status: 'DECISION_PENDING', updatedAt: { lt: new Date(now.getTime() - SLA_DECISION_DAYS * DAY) } },
      ],
    },
    select: { id: true, number: true, status: true, updatedAt: true, assignedStaff: { select: { id: true, locale: true, isActive: true } } },
  });
  if (!cases.length) return;
  const adminList = await admins();
  const byUser = new Map<string, { locale: Locale; rows: SlaRow[] }>();
  for (const c of cases) {
    const row = { number: c.number, status: c.status, days: Math.floor((now.getTime() - c.updatedAt.getTime()) / DAY) };
    const recipients = c.assignedStaff?.isActive ? [c.assignedStaff] : adminList;
    for (const r of recipients) {
      const entry = byUser.get(r.id) ?? { locale: r.locale, rows: [] };
      entry.rows.push(row);
      byUser.set(r.id, entry);
    }
  }
  for (const [userId, { locale, rows }] of byUser) {
    if (!(await claimReminder(`sla-digest:${userId}:${local.day}`, now))) continue;
    rows.sort((a, b) => b.days - a.days);
    const tx = textsFor(locale);
    const { title, body } = tx.slaDigest({ rows });
    await notifyUser(userId, { type: 'STAFF_SLA_DIGEST', title, body, link: '/admin/cases', ctaLabel: tx.cta.admin });
  }
};

// ─── Contract signature ────────────────────────────────────────────────

export const runContractReminders = async (now = new Date()) => {
  const cases = await prisma.case.findMany({
    where: { status: 'CONTRACT_SENT', contract: { signedAt: null } },
    include: { client: true, contract: true },
  });
  for (const c of cases) {
    if (!c.contract) continue;
    // Waiting since the contract was (re)sent or a signature was sent back for re-signing.
    const entered = await prisma.caseEvent.findFirst({
      where: { caseId: c.id, toStatus: 'CONTRACT_SENT' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    const since = Math.max(c.contract.sentAt.getTime(), entered?.createdAt.getTime() ?? 0);
    const waited = now.getTime() - since;
    if (waited < CONTRACT_WAIT_DAYS * DAY) continue;
    if (!(await claimReminder(`contract-sign:${c.id}:${entered?.id ?? `v${c.contract.version}`}`, now))) continue;
    const tx = textsFor(c.client.locale);
    const { title, body } = tx.contractSign({ number: c.number, days: Math.floor(waited / DAY) });
    await notifyUser(c.clientId, { type: 'CONTRACT_SIGN_REMINDER', title, body, link: `/account/cases/${c.id}`, caseId: c.id, ctaLabel: tx.cta.openCase });
  }
};

// ─── Review invitations ────────────────────────────────────────────────

export const runReviewInvites = async (now = new Date()) => {
  const cases = await prisma.case.findMany({
    where: {
      status: 'APPROVED',
      decisionAt: { lte: new Date(now.getTime() - REVIEW_AFTER_DAYS * DAY), gte: new Date(now.getTime() - REVIEW_MAX_AGE_DAYS * DAY) },
      client: { isActive: true },
    },
    select: { id: true },
  });
  if (!cases.length) return 0;
  const existing = new Set(
    (await prisma.review.findMany({ where: { caseId: { in: cases.map((c) => c.id) } }, select: { caseId: true } })).map((r) => r.caseId),
  );
  let sent = 0;
  for (const c of cases) {
    if (existing.has(c.id)) continue;
    if (await inviteForCase(c.id)) sent++;
  }
  return sent;
};

// ─── Registration ──────────────────────────────────────────────────────

/** Runs every 15-minute reminder; one failing part does not stop the others. */
export const runReminders = async (now = new Date()) => {
  const parts: [string, (n: Date) => Promise<unknown>][] = [
    ['appointment', runAppointmentReminders],
    ['missing-docs', runMissingDocsReminders],
    ['passport', runPassportReminders],
    ['contract', runContractReminders],
    ['sla-digest', runStaffSlaDigest],
  ];
  for (const [name, fn] of parts) {
    try {
      await fn(now);
    } catch (err) {
      console.error(`[job:reminders:${name}] failed`, err);
    }
  }
};

registerJob({ name: 'reminders', everyMs: 15 * 60 * 1000, run: () => runReminders() });
registerJob({ name: 'review-invites', everyMs: 24 * HOUR, firstRunAfterMs: 5 * 60 * 1000, run: async () => void (await runReviewInvites()) });
