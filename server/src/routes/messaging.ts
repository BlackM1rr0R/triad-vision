import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { forbidden } from '../lib/http.js';
import { subscribe, type RealtimeEvent } from '../lib/messaging/realtime.js';
import { handleWhatsAppWebhook, validSignature, validUrlSecret, verifyToken, webhookProtected, type WaWebhookBody } from '../lib/messaging/inbound.js';

/**
 * /api/messaging — realtime stream for the signed-in user, WhatsApp webhooks (no session: Meta calls
 * them) and the phone-channel preferences shown on the profile page. Mounted in app.ts.
 */
export const messagingRouter = Router();

export const HEARTBEAT_MS = 25_000;

const sseWrite = (res: Response, chunk: string) => {
  res.write(chunk);
  // compression() buffers unless told to flush; without it the browser would see nothing until 1 KB is written.
  (res as Response & { flush?: () => void }).flush?.();
};

const formatEvent = (ev: RealtimeEvent, id: number) => `id: ${id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.payload)}\n\n`;

// ─── Server-Sent Events ────────────────────────────────────────────────

messagingRouter.get('/events', requireAuth, (req, res) => {
  const userId = req.user!.id;
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  req.socket?.setKeepAlive?.(true);
  req.socket?.setTimeout?.(0);

  // Replay is not supported; `lastEventId` (header or query) is accepted so a client can resume
  // the stream without an error. Events are numbered per connection.
  let seq = Number(req.get('last-event-id') ?? req.query.lastEventId ?? 0) || 0;
  sseWrite(res, `retry: 3000\n: connected ${new Date().toISOString()}\n\n`);

  const unsubscribe = subscribe(userId, (ev) => {
    seq += 1;
    sseWrite(res, formatEvent(ev, seq));
  });
  const heartbeat = setInterval(() => sseWrite(res, `: ping ${Date.now()}\n\n`), HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
});

// ─── Phone-channel preferences (profile page) ─────────────────────────

messagingRouter.get('/preferences', requireAuth, async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { phone: true, whatsappOptIn: true, smsNotifications: true },
  });
  res.json({ preferences: u });
});

// ─── WhatsApp webhooks (Meta Cloud API) ────────────────────────────────

/** Meta verifies the callback URL with a GET carrying hub.mode / hub.verify_token / hub.challenge. */
messagingRouter.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = verifyToken();
  if (mode === 'subscribe' && expected && typeof token === 'string' && token === expected && typeof challenge === 'string') {
    res.status(200).type('text/plain').send(challenge);
    return;
  }
  throw forbidden('WEBHOOK_VERIFY_FAILED');
});

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Message deliveries. The request is accepted when the X-Hub-Signature-256 HMAC (app secret over the
 * raw body captured by app.ts) matches, or — as a fallback for deployments without the raw body —
 * when ?token= equals WHATSAPP_WEBHOOK_SECRET. Meta retries on non-2xx, so the body is processed
 * before answering and processing errors still answer 200.
 */
messagingRouter.post('/webhooks/whatsapp', async (req: RawBodyRequest, res) => {
  if (!webhookProtected()) throw forbidden('WEBHOOK_NOT_CONFIGURED');
  const ok = validSignature(req.rawBody, req.get('x-hub-signature-256')) || validUrlSecret(req.query.token);
  if (!ok) throw forbidden('WEBHOOK_SIGNATURE_INVALID');
  const body = (req.body ?? {}) as WaWebhookBody;
  if (body.object && body.object !== 'whatsapp_business_account') {
    res.json({ ok: true, ignored: true });
    return;
  }
  const result = await handleWhatsAppWebhook(body);
  res.json({ ok: true, ...result });
});
