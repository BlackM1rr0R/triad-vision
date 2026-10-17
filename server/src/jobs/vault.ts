import type { Locale } from '@prisma/client';
import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyUser } from '../lib/notifications.js';
import { finishPendingChecks } from '../lib/docCheck/index.js';
import { VAULT_REMINDER_DAYS } from '../lib/docCheck/vault.js';
import { claimReminder } from './reminders.js';

/**
 * Document vault jobs:
 *   - vault-expiry (daily): a vault document expiring within 90 and within 30 days notifies its owner
 *     once per threshold. Idempotent through ReminderLog; the key carries the expiry date, so a
 *     corrected date gets fresh reminders. Entering the window late (e.g. 20 days left) only sends the
 *     30-day notice.
 *   - doc-checks (every minute): finishes document checks whose passport OCR did not complete inside
 *     the upload request and notifies the client about problems found.
 */

const DAY = 24 * 60 * 60 * 1000;

const TEXT: Record<Locale, { title: (t: string) => string; body: (t: string, days: number, date: string) => string }> = {
  az: {
    title: (t) => `Sənədin müddəti bitir: ${t}`,
    body: (t, d, date) => `Sənəd seyfinizdəki "${t}" sənədinin müddəti ${d} gün sonra (${date}) bitir. Vaxtında yeniləyin.`,
  },
  de: {
    title: (t) => `Dokument läuft ab: ${t}`,
    body: (t, d, date) => `Das Dokument „${t}" in Ihrem Dokumentensafe läuft in ${d} Tagen ab (${date}). Bitte rechtzeitig erneuern.`,
  },
  en: {
    title: (t) => `Document expiring: ${t}`,
    body: (t, d, date) => `"${t}" in your document vault expires in ${d} days (${date}). Please renew it in time.`,
  },
  ru: {
    title: (t) => `Срок документа истекает: ${t}`,
    body: (t, d, date) => `Срок действия документа «${t}» в вашем сейфе истекает через ${d} дн. (${date}). Обновите его вовремя.`,
  },
};

export const runVaultExpiryReminders = async (now = new Date()) => {
  const [far, near] = [VAULT_REMINDER_DAYS[0], VAULT_REMINDER_DAYS[1]];
  const docs = await prisma.vaultDocument.findMany({
    where: { expiresAt: { gt: now, lte: new Date(now.getTime() + far * DAY) } },
    include: { user: { select: { locale: true } } },
  });
  let sent = 0;
  for (const d of docs) {
    const days = Math.ceil((d.expiresAt!.getTime() - now.getTime()) / DAY);
    const threshold = days <= near ? near : far;
    if (!(await claimReminder(`vault-expiry-${threshold}:${d.id}:${d.expiresAt!.toISOString()}`, now))) continue;
    const text = TEXT[d.user.locale];
    const date = d.expiresAt!.toISOString().slice(0, 10);
    await notifyUser(d.userId, { type: 'VAULT_EXPIRY', title: text.title(d.title), body: text.body(d.title, days, date), link: '/account/vault' }).catch((e) =>
      console.error('[job:vault-expiry] notify failed', e),
    );
    sent++;
  }
  return sent;
};

registerJob({ name: 'vault-expiry', everyMs: 24 * 60 * 60 * 1000, firstRunAfterMs: 5 * 60 * 1000, run: async () => void (await runVaultExpiryReminders()) });
registerJob({ name: 'doc-checks', everyMs: 60_000, firstRunAfterMs: 120_000, run: async () => void (await finishPendingChecks()) });
