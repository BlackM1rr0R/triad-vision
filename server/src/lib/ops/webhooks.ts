import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Outgoing webhooks for partners. `emitWebhook` only records deliveries (one per subscribed,
 * active webhook); the delivery job (src/jobs/webhooks.ts) posts them with an HMAC signature and
 * retries with back-off. Never throws: a webhook problem must not break the business action.
 */
export type WebhookEvent =
  | 'case.created'
  | 'case.status_changed'
  | 'case.decided'
  | 'application.created'
  | 'application.status_changed'
  | 'interview.scheduled'
  | 'interview.updated'
  | 'vacancy.published';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'case.created',
  'case.status_changed',
  'case.decided',
  'application.created',
  'application.status_changed',
  'interview.scheduled',
  'interview.updated',
  'vacancy.published',
];

export const emitWebhook = async (event: WebhookEvent, payload: Prisma.InputJsonValue, companyId?: string | null) => {
  try {
    const hooks = await prisma.webhook.findMany({
      where: { active: true, ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : { companyId: null }) },
      select: { id: true, events: true },
    });
    const targets = hooks.filter((h) => Array.isArray(h.events) && (h.events as string[]).includes(event));
    if (!targets.length) return;
    await prisma.webhookDelivery.createMany({
      data: targets.map((h) => ({ webhookId: h.id, event, payload: { event, at: new Date().toISOString(), data: payload }, nextAttemptAt: new Date() })),
    });
  } catch (err) {
    console.error('[webhooks] emit failed', event, err);
  }
};

// ─── Delivery ───────────────────────────────────────────────────────────

/** Pause before the next try after the n-th failure (1 min, 5 min, 30 min, 2 h, 12 h); the 6th failure is final. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
export const MAX_ATTEMPTS = 6;
export const DELIVERY_TIMEOUT_MS = 10_000;

/** `sha256=<hex hmac>` over the exact request body, with the webhook's secret. */
export const signBody = (secret: string, body: string) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

/** Constant-time check a receiver can use (also what the test server does). */
export const verifySignature = (secret: string, body: string, header: string | undefined) => {
  if (!header) return false;
  const expected = Buffer.from(signBody(secret, body));
  const given = Buffer.from(header);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

export const newWebhookSecret = () => `whsec_${crypto.randomBytes(24).toString('base64url')}`;

export type DeliveryResult = { ok: true; status: number } | { ok: false; status?: number; error: string };

/** One HTTP attempt. Never throws. */
export const postDelivery = async (
  hook: { url: string; secret: string },
  delivery: { id: string; event: string; payload: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryResult> => {
  const body = JSON.stringify(delivery.payload);
  try {
    const res = await fetchImpl(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TriadVision-Webhooks/1.0',
        'X-TV-Event': delivery.event,
        'X-TV-Delivery': delivery.id,
        'X-TV-Signature': signBody(hook.secret, body),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    // Drain the body so the socket is released; the content is irrelevant.
    await res.arrayBuffer().catch(() => undefined);
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    const e = err as { name?: string; message?: string; cause?: { code?: string } };
    return { ok: false, error: (e.name === 'TimeoutError' ? 'TIMEOUT' : (e.cause?.code ?? e.message ?? 'FETCH_FAILED')).slice(0, 500) };
  }
};

/** Only plain http(s) URLs; a webhook pointing at the API itself or a non-HTTP scheme is refused. */
export const isAcceptableWebhookUrl = (url: string) => {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname;
  } catch {
    return false;
  }
};
