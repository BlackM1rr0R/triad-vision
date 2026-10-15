import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { sendRow } from '../lib/messaging/outbound.js';

/**
 * Outbound message housekeeping:
 *  - rows stuck in QUEUED (the process died between writing the row and the provider answer) are
 *    retried once they are older than STUCK_AFTER_MS;
 *  - FAILED rows younger than RETRY_WINDOW_MS get up to one automatic retry per run while the
 *    provider is reachable (a message sent outside the WhatsApp 24-hour window fails again and is
 *    then left for the admin "resend" button);
 *  - the log is pruned after RETENTION_DAYS.
 */

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
export const STUCK_AFTER_MS = 5 * MINUTE;
export const RETRY_WINDOW_MS = 60 * MINUTE;
export const RETENTION_DAYS = 180;
const BATCH = 50;

export const runOutboundMaintenance = async (now = new Date()) => {
  const stuck = await prisma.outboundMessage.findMany({
    where: { status: 'QUEUED', createdAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });
  for (const row of stuck) await sendRow(row);

  const failed = await prisma.outboundMessage.findMany({
    where: {
      status: 'FAILED',
      createdAt: { gt: new Date(now.getTime() - RETRY_WINDOW_MS) },
      // Only transient failures (network/5xx); a provider rejection (4xx) is final until an admin resends.
      NOT: { error: { startsWith: 'WhatsApp 4' } },
      AND: [{ NOT: { error: { startsWith: 'SMS 4' } } }, { NOT: { error: { contains: 'not configured' } } }],
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });
  for (const row of failed) {
    const reset = await prisma.outboundMessage.update({ where: { id: row.id }, data: { status: 'QUEUED', error: null } });
    await sendRow(reset);
  }

  const pruned = await prisma.outboundMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * DAY) } } });
  return { retriedStuck: stuck.length, retriedFailed: failed.length, pruned: pruned.count };
};

registerJob({ name: 'messaging-outbound', everyMs: 10 * MINUTE, firstRunAfterMs: 2 * MINUTE, run: async () => void (await runOutboundMaintenance()) });
