import { config } from '../config.js';
import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyUser } from '../lib/notifications.js';
import { renderEmail, sendMail } from '../lib/mailer.js';
import { formatDay } from '../lib/growthTexts.js';
import {
  DIGEST_DAYS,
  EXPIRY_WINDOWS,
  backfillDocumentExpiry,
  daysLeft,
  dueWindow,
  kindForKey,
  l10nTitle,
  listExpiring,
  trackedDocuments,
} from '../lib/expiry/index.js';
import { EXPIRY_TEXTS } from '../lib/expiry/texts.js';
import { DIGEST_HOUR, bakuParts, claimReminder } from './reminders.js';

/**
 * Document expiry warnings (hourly, idempotent):
 *   - once a day (and once at start-up) expiry dates are read from stored OCR / check results and vault copies;
 *   - each document of an open case is warned once per window (passport 6/3/1 months, others 60/30/7 days,
 *     see lib/expiry/rules.ts): the client in-app + e-mail in their language, the assigned staff member in-app;
 *   - from 08:00 Baku time every admin gets one e-mail a day listing documents that expire within 30 days
 *     (skipped when there is nothing to report).
 */

const DAY = 24 * 60 * 60 * 1000;
const maxWindow = Math.max(...Object.values(EXPIRY_WINDOWS).flat());
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export const runExpiryReminders = async (now = new Date()) => {
  const docs = await trackedDocuments({ until: new Date(now.getTime() + maxWindow * DAY) });
  let sent = 0;
  for (const d of docs) {
    const kind = kindForKey(d.requirement?.key);
    const window = dueWindow(kind, d.expiresAt!, d.expiryRemindedAt, now);
    if (window === null) continue;
    // Claim the window first (two overlapping runs never both send).
    const claimed = await prisma.document.updateMany({
      where: { id: d.id, expiresAt: d.expiresAt, expiryRemindedAt: d.expiryRemindedAt },
      data: { expiryRemindedAt: now },
    });
    if (!claimed.count) continue;

    const days = daysLeft(d.expiresAt!, now);
    const client = d.case.client;
    const tx = EXPIRY_TEXTS[client.locale];
    const doc = l10nTitle(d.requirement?.title, client.locale) || d.originalName;
    const msg = tx.client({ doc, number: d.case.number, date: formatDay(d.expiresAt!, client.locale), days, passport: kind === 'passport' });
    await notifyUser(client.id, { type: 'DOCUMENT_EXPIRY', ...msg, link: `/account/cases/${d.case.id}`, caseId: d.case.id, ctaLabel: tx.cta }).catch((err) =>
      console.error('[job:document-expiry] client notify failed', err),
    );

    const staff = d.case.assignedStaff;
    if (staff?.isActive) {
      const st = EXPIRY_TEXTS[staff.locale];
      const m = st.staff({ doc: l10nTitle(d.requirement?.title, staff.locale) || d.originalName, number: d.case.number, client: fullName(client), date: formatDay(d.expiresAt!, staff.locale), days, passport: kind === 'passport' });
      await notifyUser(staff.id, { type: 'DOCUMENT_EXPIRY_STAFF', ...m, link: `/admin/cases/${d.case.id}`, caseId: d.case.id, email: false }).catch((err) =>
        console.error('[job:document-expiry] staff notify failed', err),
      );
    }
    sent++;
  }
  return sent;
};

/** One e-mail per admin per Baku day with every document expiring within DIGEST_DAYS; nothing when empty. */
export const runExpiryDigest = async (now = new Date()) => {
  const local = bakuParts(now);
  if (local.hour < DIGEST_HOUR) return 0;
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, email: true, locale: true } });
  if (!admins.length) return 0;
  const byLocale = new Map<string, Awaited<ReturnType<typeof listExpiring>>>();
  let sent = 0;
  for (const a of admins) {
    let rows = byLocale.get(a.locale);
    if (!rows) {
      rows = await listExpiring({ days: DIGEST_DAYS, now, locale: a.locale });
      byLocale.set(a.locale, rows);
    }
    if (!rows.length) continue;
    if (!(await claimReminder(`expiry-digest:${a.id}:${local.day}`, now))) continue;
    const tx = EXPIRY_TEXTS[a.locale];
    const { subject, body } = tx.digest(
      rows.map((r) => ({ client: r.client.name, number: r.case?.number ?? '—', doc: r.document, date: formatDay(new Date(r.expiresAt), a.locale), days: r.daysLeft, vault: r.source === 'vault' })),
      DIGEST_DAYS,
    );
    void sendMail(a.email, `Triad Vision · ${subject}`, renderEmail(subject, body, { label: tx.ctaAdmin, url: `${config.clientUrl}/admin/expiring` }));
    sent++;
  }
  return sent;
};

let lastBackfillDay: string | null = null;

/** Hourly run: daily backfill, reminders, digest; one failing part does not stop the others. */
export const runExpiryJob = async (now = new Date()) => {
  const day = bakuParts(now).day;
  const parts: [string, () => Promise<unknown>][] = [
    [
      'backfill',
      async () => {
        if (lastBackfillDay === day) return;
        lastBackfillDay = day;
        await backfillDocumentExpiry();
      },
    ],
    ['reminders', () => runExpiryReminders(now)],
    ['digest', () => runExpiryDigest(now)],
  ];
  for (const [name, fn] of parts) {
    try {
      await fn();
    } catch (err) {
      console.error(`[job:document-expiry:${name}] failed`, err);
    }
  }
};

registerJob({ name: 'document-expiry', everyMs: 60 * 60 * 1000, firstRunAfterMs: 3 * 60 * 1000, run: () => runExpiryJob() });
