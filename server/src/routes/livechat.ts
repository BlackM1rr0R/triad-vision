import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireMinRole } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { publish, subscribe, type RealtimeEvent } from '../lib/messaging/realtime.js';
import { takeHit } from '../lib/publicAi/guard.js';
import { chatSummary } from '../lib/publicAi/advisor.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { normalizePhone } from '../lib/messaging/providers.js';
import { callTexts } from '../lib/calls/texts.js';
import { callbackInput, createCallback } from '../lib/calls/callbacks.js';
import {
  addMessage,
  availability,
  expireWaiting,
  loadChat,
  publishQueue,
  staffView,
  verifyVisitorToken,
  visitorChannel,
  visitorToken,
  visitorView,
} from '../lib/livechat/core.js';

/**
 * Live chat (/api/livechat): AI advisor → human handover.
 * Visitor (anonymous, signed visitor token in `x-livechat-token` / ?token= / body.token):
 *   GET  /availability            office open + staff online?
 *   POST /                        start (with the AI transcript) → 409 LIVECHAT_OFFLINE when nobody can take it
 *   GET  /:id   GET /:id/events   state + messages / SSE stream (livechat.message, livechat.status)
 *   POST /:id/messages            visitor message
 *   POST /:id/contact             offline / missed fallback: contact details → inquiry or callback request
 *   POST /:id/close
 * Staff (STAFF+):
 *   GET  /staff/queue   GET /staff/:id
 *   POST /staff/:id/accept | messages | close | lead (→ Inquiry) | link (→ existing client)
 * Staff get `livechat.queue` (new / accepted / closed / missed) and `livechat.message` on their realtime stream.
 */
export const livechatRouter = Router();

const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';
const HEARTBEAT_MS = 25_000;

const idOf = (req: Request) => {
  const id = String(req.params.id ?? '');
  if (!id || id.length > 40) throw notFound('LIVECHAT_NOT_FOUND');
  return id;
};
const tokenOf = (req: Request) => req.get('x-livechat-token') ?? (typeof req.query.token === 'string' ? req.query.token : undefined) ?? (req.body as { token?: unknown } | undefined)?.token;

/** Loads the chat for its visitor (403 on a bad token). */
const visitorChat = async (req: Request) => {
  const id = idOf(req);
  if (!verifyVisitorToken(id, tokenOf(req))) throw forbidden('LIVECHAT_TOKEN_INVALID');
  await expireWaiting();
  const chat = await loadChat(id);
  if (!chat) throw notFound('LIVECHAT_NOT_FOUND');
  return chat;
};

const turnSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }).strict();
const body2000 = z.string().trim().min(1).max(2000);

// ─── Staff ─────────────────────────────────────────────────────────────

const staff = Router();
staff.use(requireMinRole('STAFF'));

const staffChat = async (req: Request) => {
  await expireWaiting();
  const chat = await loadChat(idOf(req));
  if (!chat) throw notFound('LIVECHAT_NOT_FOUND');
  return chat;
};
const requireOwner = (req: Request, chat: { staffId: string | null }) => {
  if (chat.staffId !== req.user!.id && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw forbidden('NOT_YOUR_CHAT');
};
const lastLine = (c: { messages: { body: string; author: string }[]; transcript: unknown }) => {
  const m = c.messages.filter((x) => x.author !== 'SYSTEM').at(-1);
  if (m) return m.body.slice(0, 140);
  const t = Array.isArray(c.transcript) ? (c.transcript as { content?: string }[]) : [];
  return (t.at(-1)?.content ?? '').slice(0, 140);
};

staff.get('/queue', async (req, res) => {
  await expireWaiting();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.liveChat.findMany({
    where: { OR: [{ status: { in: ['WAITING', 'ACTIVE'] } }, { createdAt: { gte: since } }] },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
  });
  const ids = [...new Set(rows.map((r) => r.staffId).filter((x): x is string => !!x))];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const name = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
  res.json({
    me: req.user!.id,
    chats: rows.map((c) => ({
      id: c.id,
      status: c.status,
      locale: c.locale,
      visitorName: c.visitorName,
      createdAt: c.createdAt,
      acceptedAt: c.acceptedAt,
      staff: c.staffId ? { id: c.staffId, name: name.get(c.staffId) ?? '' } : null,
      last: lastLine(c),
      unread: c.messages.filter((m) => m.author === 'VISITOR' && (!c.acceptedAt || m.createdAt > c.acceptedAt)).length,
    })),
  });
});

staff.get('/:id', async (req, res) => {
  res.json({ chat: await staffView(await staffChat(req)) });
});

staff.post('/:id/accept', async (req, res) => {
  const chat = await staffChat(req);
  const now = new Date();
  const r = await prisma.liveChat.updateMany({ where: { id: chat.id, status: 'WAITING' }, data: { status: 'ACTIVE', staffId: req.user!.id, acceptedAt: now } });
  if (!r.count) throw conflict(chat.status === 'ACTIVE' ? 'LIVECHAT_TAKEN' : 'LIVECHAT_NOT_WAITING');
  const fresh = (await loadChat(chat.id))!;
  await addMessage(fresh, 'SYSTEM', callTexts(fresh.locale).chatAccepted(req.user!.firstName));
  publish(visitorChannel(chat.id), 'livechat.status', { chatId: chat.id, status: 'ACTIVE', staffName: req.user!.firstName });
  await publishQueue(chat.id, 'accepted', { staffId: req.user!.id });
  await audit(req, 'LIVECHAT_ACCEPTED', `livechat:${chat.id}`);
  res.json({ chat: await staffView((await loadChat(chat.id))!) });
});

staff.post('/:id/messages', async (req, res) => {
  const { body } = parse(z.object({ body: body2000 }).strict(), req.body);
  const chat = await staffChat(req);
  if (chat.status !== 'ACTIVE') throw conflict('LIVECHAT_NOT_ACTIVE');
  requireOwner(req, chat);
  const message = await addMessage(chat, 'STAFF', body, req.user!.id);
  res.status(201).json({ message });
});

staff.post('/:id/close', async (req, res) => {
  const chat = await staffChat(req);
  if (chat.status === 'ACTIVE') requireOwner(req, chat);
  if (chat.status === 'WAITING' || chat.status === 'ACTIVE') {
    await prisma.liveChat.update({ where: { id: chat.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await addMessage(chat, 'SYSTEM', callTexts(chat.locale).chatClosed);
    publish(visitorChannel(chat.id), 'livechat.status', { chatId: chat.id, status: 'CLOSED' });
    await publishQueue(chat.id, 'closed');
  }
  res.json({ chat: await staffView((await loadChat(chat.id))!) });
});

const transcriptText = (c: { transcript: unknown; messages: { author: string; body: string }[] }) => {
  const ai = Array.isArray(c.transcript) ? (c.transcript as { role: 'user' | 'assistant'; content: string }[]) : [];
  const parts = [chatSummary(ai)];
  const live = c.messages.filter((m) => m.author !== 'SYSTEM').map((m) => `${m.author === 'VISITOR' ? '›' : '‹'} ${m.body.replace(/\s+/g, ' ').slice(0, 300)}`);
  if (live.length) parts.push('Canlı söhbət:', ...live.slice(-20));
  return parts.filter(Boolean).join('\n');
};

const leadSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
    phone: z.string().trim().regex(/^\+?[\d\s()-]{6,30}$/).optional().or(z.literal('').transform(() => undefined)),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

staff.post('/:id/lead', async (req, res) => {
  const body = parse(leadSchema, req.body);
  const chat = await staffChat(req);
  if (chat.inquiryId) throw conflict('LIVECHAT_ALREADY_LEAD');
  const name = body.name ?? chat.visitorName;
  if (!name) throw badRequest('NAME_REQUIRED');
  const email = body.email ?? chat.visitorEmail ?? '';
  const phone = body.phone ? normalizePhone(body.phone) ?? body.phone : chat.visitorPhone;
  const message = ['[Canlı söhbət]', body.note ?? null, '', transcriptText(chat)].filter((l) => l !== null).join('\n').slice(0, 5000);
  const inquiry = await prisma.inquiry.create({ data: { kind: 'contact', contactName: name, email, phone: phone ?? null, sector: 'Live chat', message, locale: chat.locale, status: 'IN_PROGRESS' } });
  void onInquiryCreated(inquiry.id);
  await prisma.liveChat.update({ where: { id: chat.id }, data: { inquiryId: inquiry.id, visitorName: name, visitorEmail: email || null, visitorPhone: phone ?? null } });
  await audit(req, 'LIVECHAT_LEAD_CREATED', `livechat:${chat.id}`, { inquiryId: inquiry.id });
  res.status(201).json({ inquiry: { id: inquiry.id }, chat: await staffView((await loadChat(chat.id))!) });
});

staff.post('/:id/link', async (req, res) => {
  const { clientId } = parse(z.object({ clientId: z.string().trim().min(1).max(40) }).strict(), req.body);
  const chat = await staffChat(req);
  const client = await prisma.user.findUnique({ where: { id: clientId }, select: { id: true, role: true } });
  if (!client || client.role !== 'CLIENT') throw notFound('CLIENT_NOT_FOUND');
  await prisma.liveChat.update({ where: { id: chat.id }, data: { clientId } });
  await audit(req, 'LIVECHAT_LINKED', `livechat:${chat.id}`, { clientId });
  res.json({ chat: await staffView((await loadChat(chat.id))!) });
});

livechatRouter.use('/staff', staff);

// ─── Visitor ───────────────────────────────────────────────────────────

livechatRouter.get('/availability', async (_req, res) => {
  res.json(await availability());
});

const startSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    lang: z.enum(['az', 'de', 'en', 'ru']).catch('az'),
    transcript: z.array(turnSchema).max(24).default([]),
    message: z.string().trim().max(2000).optional(),
    pageUrl: z.string().trim().max(300).optional(),
    reason: z.enum(['button', 'ai_unsure', 'asked', 'ai_error']).default('button'),
    website: z.string().max(200).optional(),
  })
  .strict();

livechatRouter.post('/', async (req, res) => {
  const body = parse(startSchema, req.body);
  if (body.website) {
    res.status(409).json({ error: 'LIVECHAT_OFFLINE', available: false });
    return;
  }
  await expireWaiting();
  const avail = await availability();
  if (!avail.available) {
    res.status(409).json({ error: 'LIVECHAT_OFFLINE', ...avail });
    return;
  }
  if (takeHit(`livechat:${ipOf(req)}`, { hour: 6 })) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', scope: 'hour' });
    return;
  }
  const isClient = req.user?.role === 'CLIENT';
  const chat = await prisma.liveChat.create({
    data: {
      locale: body.lang,
      visitorName: body.name || (isClient ? `${req.user!.firstName} ${req.user!.lastName}`.trim() : null),
      visitorEmail: isClient ? req.user!.email : null,
      transcript: body.transcript,
      pageUrl: body.pageUrl ?? null,
      reason: body.reason,
      clientId: isClient ? req.user!.id : null,
    },
  });
  if (body.message) await addMessage(chat, 'VISITOR', body.message);
  const name = chat.visitorName ?? '—';
  await publishQueue(chat.id, 'new', { name, locale: chat.locale, title: callTexts('az').chatQueueTitle, body: callTexts('az').chatQueueBody(name) });
  res.status(201).json({ token: visitorToken(chat.id), chat: await visitorView((await loadChat(chat.id))!) });
});

livechatRouter.get('/:id', async (req, res) => {
  res.json({ chat: await visitorView(await visitorChat(req)) });
});

const sseWrite = (res: Response, chunk: string) => {
  res.write(chunk);
  (res as Response & { flush?: () => void }).flush?.();
};

livechatRouter.get('/:id/events', async (req, res) => {
  const chat = await visitorChat(req);
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res.flushHeaders();
  req.socket?.setKeepAlive?.(true);
  req.socket?.setTimeout?.(0);
  let seq = 0;
  sseWrite(res, `retry: 3000\n: connected ${new Date().toISOString()}\n\n`);
  sseWrite(res, `event: livechat.status\ndata: ${JSON.stringify({ chatId: chat.id, status: chat.status })}\n\n`);
  const off = subscribe(visitorChannel(chat.id), (ev: RealtimeEvent) => {
    seq += 1;
    sseWrite(res, `id: ${seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.payload)}\n\n`);
  });
  const hb = setInterval(() => sseWrite(res, `: ping ${Date.now()}\n\n`), HEARTBEAT_MS);
  const cleanup = () => {
    clearInterval(hb);
    off();
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
});

livechatRouter.post('/:id/messages', async (req, res) => {
  const { body } = parse(z.object({ body: body2000, token: z.string().max(120).optional() }).strict(), req.body);
  const chat = await visitorChat(req);
  if (chat.status !== 'WAITING' && chat.status !== 'ACTIVE') throw conflict('LIVECHAT_NOT_ACTIVE');
  if (takeHit(`livechat-msg:${chat.id}`, { hour: 120 })) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', scope: 'hour' });
    return;
  }
  const message = await addMessage(chat, 'VISITOR', body);
  res.status(201).json({ message });
});

const contactSchema = z
  .object({
    token: z.string().max(120).optional(),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
    phone: z.string().trim().regex(/^\+?[\d\s()-]{6,30}$/).optional().or(z.literal('').transform(() => undefined)),
    message: z.string().trim().max(600).optional(),
    /** with a phone: a callback window ('asap' or a window start from /api/callback/slots) */
    window: callbackInput.shape.window.optional(),
    consent: z.literal(true),
    website: z.string().max(200).optional(),
  })
  .strict()
  .refine((b) => !!b.email || !!b.phone, { message: 'CONTACT_REQUIRED', path: ['email'] });

livechatRouter.post('/:id/contact', async (req, res) => {
  const body = parse(contactSchema, req.body);
  const chat = await visitorChat(req);
  if (body.website) {
    res.status(201).json({ ok: true });
    return;
  }
  if (chat.inquiryId || chat.callbackId) throw conflict('LIVECHAT_CONTACT_SENT');
  if (takeHit(`livechat-contact:${ipOf(req)}`, { hour: 5 })) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', scope: 'hour' });
    return;
  }
  const phone = body.phone ? (normalizePhone(body.phone) ?? body.phone) : null;
  let result: Record<string, unknown>;
  if (phone && body.window) {
    const r = await createCallback(
      { name: body.name, phone, email: body.email, lang: chat.locale as 'az', message: [body.message, transcriptText(chat)].filter(Boolean).join('\n').slice(0, 600), window: body.window, source: 'livechat', consent: true, liveChatId: chat.id },
      { clientId: chat.clientId },
    );
    result = { kind: 'callback', ...r };
  } else {
    const message = ['[Canlı söhbət · əməkdaş tapılmadı]', body.message ?? null, '', transcriptText(chat)].filter((l) => l !== null).join('\n').slice(0, 5000);
    const inquiry = await prisma.inquiry.create({ data: { kind: 'contact', contactName: body.name, email: body.email ?? '', phone, sector: 'Live chat', message, locale: chat.locale } });
    void onInquiryCreated(inquiry.id);
    await prisma.liveChat.update({ where: { id: chat.id }, data: { inquiryId: inquiry.id } });
    result = { kind: 'inquiry', id: inquiry.id, confirmation: callTexts(chat.locale).confirm(callTexts(chat.locale).asap) };
  }
  await prisma.liveChat.update({
    where: { id: chat.id },
    data: { visitorName: body.name, visitorEmail: body.email ?? null, visitorPhone: phone, ...(chat.status === 'WAITING' || chat.status === 'ACTIVE' ? { status: 'CLOSED', closedAt: new Date() } : {}) },
  });
  if (chat.status === 'WAITING') await publishQueue(chat.id, 'closed');
  res.status(201).json({ ok: true, ...result });
});

livechatRouter.post('/:id/close', async (req, res) => {
  const chat = await visitorChat(req);
  if (chat.status === 'WAITING' || chat.status === 'ACTIVE') {
    await prisma.liveChat.update({ where: { id: chat.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await addMessage(chat, 'SYSTEM', callTexts(chat.locale).chatClosed);
    publish(visitorChannel(chat.id), 'livechat.status', { chatId: chat.id, status: 'CLOSED' });
    await publishQueue(chat.id, 'closed');
  }
  res.json({ ok: true });
});
