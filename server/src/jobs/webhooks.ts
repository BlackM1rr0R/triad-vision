import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { BACKOFF_MS, MAX_ATTEMPTS, postDelivery } from '../lib/ops/webhooks.js';

/**
 * Posts due webhook deliveries (PENDING with nextAttemptAt in the past) with an HMAC signature.
 * A 2xx marks the delivery DELIVERED; anything else schedules a retry with exponential back-off
 * (1 min, 5 min, 30 min, 2 h, 12 h) and gives up as FAILED after six attempts. Returns what happened,
 * so tests can drive it with a local receiver. `fetchImpl` is injectable for the same reason.
 */

const BATCH = 50;

export const runWebhookDeliveries = async (now = new Date(), fetchImpl: typeof fetch = fetch) => {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
    include: { webhook: { select: { url: true, secret: true, active: true } } },
  });
  let delivered = 0;
  let failed = 0;
  let retried = 0;
  for (const d of due) {
    if (!d.webhook.active) {
      await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', lastError: 'WEBHOOK_INACTIVE', nextAttemptAt: null } });
      failed++;
      continue;
    }
    // Claim it so an overlapping run (two API instances) does not post twice.
    const claimed = await prisma.webhookDelivery.updateMany({ where: { id: d.id, status: 'PENDING', nextAttemptAt: d.nextAttemptAt }, data: { nextAttemptAt: null } });
    if (!claimed.count) continue;
    const result = await postDelivery(d.webhook, { id: d.id, event: d.event, payload: d.payload }, fetchImpl);
    const attempts = d.attempts + 1;
    if (result.ok) {
      await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'DELIVERED', attempts, responseCode: result.status, deliveredAt: now, lastError: null, nextAttemptAt: null } });
      delivered++;
    } else if (attempts >= MAX_ATTEMPTS) {
      await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', attempts, responseCode: result.status ?? null, lastError: result.error, nextAttemptAt: null } });
      failed++;
    } else {
      const wait = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: { status: 'PENDING', attempts, responseCode: result.status ?? null, lastError: result.error, nextAttemptAt: new Date(now.getTime() + wait) },
      });
      retried++;
    }
  }
  return { picked: due.length, delivered, failed, retried };
};

registerJob({ name: 'webhook-deliveries', everyMs: 30 * 1000, firstRunAfterMs: 30 * 1000, run: async () => void (await runWebhookDeliveries()) });
