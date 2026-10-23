import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Locale } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, requireAuth } from '../middleware/auth.js';
import { HttpError, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { publish } from '../lib/messaging/realtime.js';
import { createCaseMessage, serializeMessage, staffRecipientsFor } from '../lib/messaging/caseMessages.js';
import { MESSAGE_LANGS, isLang } from '../lib/messagingPlus/language.js';
import { previewTranslation, translateMessages, type MessageRef } from '../lib/messagingPlus/translate.js';
import {
  scheduleTranscription,
  signedVoicePath,
  storeVoiceClip,
  transcriptionStatus,
  validVoiceSignature,
  voicePath,
  voiceUpload,
  VOICE_MAX_BYTES,
  VOICE_MAX_MS,
  VOICE_SELECT,
} from '../lib/messagingPlus/voice.js';
import {
  MODERATION_ACTIONS,
  PIN_TOPICS,
  addPin,
  afterPartyTranscript,
  canSeeMessage,
  listThreads,
  loadThreadFor,
  markThreadRead,
  moderateMessage,
  openThread,
  removePin,
  sendPartyMessage,
  threadView,
  translationRefs,
  updateThread,
  visibleMessages,
  type Viewer,
} from '../lib/messagingPlus/threads.js';

/**
 * /api/messaging-plus — automatic translation of messages, three-party threads (candidate + employer +
 * Triad Vision) and voice messages. Mounted in app.ts. Design: lib/messagingPlus/*.
 */
export const messagingPlusRouter = Router();

const AUTHOR = { select: { id: true, firstName: true, lastName: true, role: true } } as const;

const viewer = (req: Request): Viewer => ({ ...req.user!, locale: (isLang(req.user!.locale) ? req.user!.locale : 'az') as Locale });
const isStaff = (req: Request) => hasMinRole(req.user?.role, 'STAFF');
const requireStaff2fa = (req: Request) => {
  if (!isStaff(req)) throw forbidden('FORBIDDEN');
  if (!req.user!.twoFactorEnabled) throw new HttpError(403, 'TWO_FACTOR_ENROLLMENT_REQUIRED');
};

/** Reader language: ?lang= (the UI language) when valid, else the profile language. */
const readerLang = (req: Request, explicit?: unknown): Locale => {
  const q = explicit ?? req.query.lang;
  return isLang(q) ? q : viewer(req).locale;
};

/** Case access for the case chat: the client who owns it, or staff (with 2FA). */
const caseFor = async (req: Request, caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, number: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (c.clientId === req.user!.id) return { c, side: 'client' as const };
  if (isStaff(req)) {
    requireStaff2fa(req);
    return { c, side: 'staff' as const };
  }
  throw notFound('CASE_NOT_FOUND');
};

// ─── Voice file (cookie / bearer session, or a short-lived signed link) ──

/** GET /voice/:id[?exp&sig] — the audio of a voice message, for people who may read that message. */
messagingPlusRouter.get('/voice/:id', async (req, res) => {
  const id = String(req.params.id);
  const clip = await prisma.voiceClip.findUnique({
    where: { id },
    include: { caseMessage: { select: { case: { select: { id: true, clientId: true } } } }, partyMessage: { select: { threadId: true, status: true, authorId: true } } },
  });
  if (!clip) throw notFound('VOICE_NOT_FOUND');
  let allowed = false;
  if (req.query.sig !== undefined) {
    allowed = validVoiceSignature(clip.id, req.query.exp, req.query.sig);
  } else if (req.user) {
    if (clip.caseMessage) {
      allowed = clip.caseMessage.case.clientId === req.user.id || (isStaff(req) && !!req.user.twoFactorEnabled);
    } else if (clip.partyMessage) {
      try {
        const { side } = await loadThreadFor(clip.partyMessage.threadId, viewer(req));
        allowed = canSeeMessage(clip.partyMessage, side, req.user.id);
      } catch {
        allowed = false;
      }
    } else {
      allowed = clip.uploaderId === req.user.id;
    }
  } else {
    throw new HttpError(401, req.authFailure ?? 'UNAUTHENTICATED');
  }
  if (!allowed) throw notFound('VOICE_NOT_FOUND');
  res.setHeader('Content-Type', clip.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="voice-${clip.id}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; media-src 'self'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.sendFile(voicePath(clip), { acceptRanges: true, cacheControl: false }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'VOICE_NOT_FOUND' });
  });
});

messagingPlusRouter.use(requireAuth);

/** GET /voice/:id/link → { url } signed for 10 minutes (the mobile app opens it in the system player). */
messagingPlusRouter.get('/voice/:id/link', async (req, res) => {
  const clip = await prisma.voiceClip.findUnique({
    where: { id: String(req.params.id) },
    include: { caseMessage: { select: { case: { select: { clientId: true } } } }, partyMessage: { select: { threadId: true, status: true, authorId: true } } },
  });
  if (!clip) throw notFound('VOICE_NOT_FOUND');
  let allowed = clip.uploaderId === req.user!.id;
  if (clip.caseMessage) allowed = clip.caseMessage.case.clientId === req.user!.id || (isStaff(req) && !!req.user!.twoFactorEnabled);
  if (clip.partyMessage) {
    const { side } = await loadThreadFor(clip.partyMessage.threadId, viewer(req)).catch(() => ({ side: null }));
    allowed = !!side && canSeeMessage(clip.partyMessage, side, req.user!.id);
  }
  if (!allowed) throw notFound('VOICE_NOT_FOUND');
  res.json({ url: signedVoicePath(clip.id) });
});

// ─── Status & preferences ──────────────────────────────────────────────

messagingPlusRouter.get('/status', async (_req, res) => {
  const t = await transcriptionStatus();
  res.json({ transcription: { enabled: t.enabled, reason: t.enabled ? undefined : t.reason }, voice: { maxMs: VOICE_MAX_MS, maxBytes: VOICE_MAX_BYTES }, langs: MESSAGE_LANGS });
});

messagingPlusRouter.get('/preferences', async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { showOriginalMessages: true, locale: true } });
  res.json({ preferences: { showOriginals: u.showOriginalMessages, locale: u.locale } });
});

messagingPlusRouter.patch('/preferences', async (req, res) => {
  const body = parse(z.object({ showOriginals: z.boolean() }), req.body);
  const u = await prisma.user.update({ where: { id: req.user!.id }, data: { showOriginalMessages: body.showOriginals }, select: { showOriginalMessages: true, locale: true } });
  res.json({ preferences: { showOriginals: u.showOriginalMessages, locale: u.locale } });
});

// ─── Translation ───────────────────────────────────────────────────────

/**
 * POST /translate { scope: 'case' | 'party', id, messageIds?, lang? } → { translations, pending, unavailable? }
 * Only messages of that one thread that the reader may see go into the prompt.
 */
messagingPlusRouter.post('/translate', async (req, res) => {
  const body = parse(
    z.object({ scope: z.enum(['case', 'party']), id: z.string().min(1).max(40), messageIds: z.array(z.string().min(1).max(40)).max(200).optional(), lang: z.enum(MESSAGE_LANGS).optional() }),
    req.body,
  );
  const lang = readerLang(req, body.lang);
  let refs: MessageRef[];
  if (body.scope === 'case') {
    const { c } = await caseFor(req, body.id);
    const rows = await prisma.caseMessage.findMany({
      where: { caseId: c.id, ...(body.messageIds ? { id: { in: body.messageIds } } : {}) },
      orderBy: { createdAt: 'asc' },
      include: { author: AUTHOR, voice: { select: VOICE_SELECT } },
      take: 300,
    });
    refs = rows.map((m) => {
      const s = serializeMessage(m);
      return { kind: 'case', id: m.id, text: m.body || s.voice?.transcript || '', lang: s.lang ?? m.voice?.transcriptLang ?? null };
    });
  } else {
    const { thread, side } = await loadThreadFor(body.id, viewer(req));
    const rows = await visibleMessages(thread, side, req.user!.id);
    refs = translationRefs(rows).filter((r) => !body.messageIds || body.messageIds.includes(r.id));
  }
  const out = await translateMessages(refs, lang, req.user!);
  res.json({ lang, ...out });
});

/** POST /translate/preview { text, targets[] } (staff) → how the other side will read a draft. */
messagingPlusRouter.post('/translate/preview', async (req, res) => {
  requireStaff2fa(req);
  const body = parse(z.object({ text: z.string().trim().min(1).max(4000), targets: z.array(z.enum(MESSAGE_LANGS)).min(1).max(4) }), req.body);
  res.json(await previewTranslation(body.text, body.targets, req.user!));
});

// ─── Voice messages in the case chat ───────────────────────────────────

const durationOf = (req: Request) => Number((req.body as Record<string, unknown> | undefined)?.durationMs);

/** POST /cases/:caseId/voice (multipart "file", durationMs) — the client of the case or staff. */
messagingPlusRouter.post('/cases/:caseId/voice', voiceUpload.single('file'), async (req, res) => {
  const { c, side } = await caseFor(req, String(req.params.caseId));
  const clip = await storeVoiceClip(req.file, durationOf(req), req.user!.id);
  const message = (await createCaseMessage({ caseId: c.id, authorId: req.user!.id, body: '', side, voiceId: clip.id }))!; // null only for duplicate webhooks
  if (clip.transcriptStatus === 'PENDING') {
    const author = req.user!;
    void scheduleTranscription(clip.id, author, [author.locale as Locale], async () => {
      const m = await prisma.caseMessage.findUnique({ where: { id: message.id }, include: { author: AUTHOR, voice: { select: VOICE_SELECT } } });
      if (!m) return;
      if (m.voice?.transcriptLang) await prisma.caseMessage.update({ where: { id: m.id }, data: { lang: m.voice.transcriptLang } });
      const updated = serializeMessage({ ...m, lang: m.voice?.transcriptLang ?? m.lang });
      publish([...new Set([c.clientId, ...(await staffRecipientsFor(c.id))])], 'message.updated', { caseId: c.id, message: updated });
    });
  }
  res.status(201).json({ message });
});

// ─── Three-party threads ───────────────────────────────────────────────

messagingPlusRouter.get('/threads', async (req, res) => {
  const q = parse(z.object({ status: z.enum(['OPEN', 'CLOSED']).optional(), held: z.enum(['1', 'true']).optional(), lang: z.enum(MESSAGE_LANGS).optional() }), req.query);
  res.json({ items: await listThreads(viewer(req), { status: q.status, held: !!q.held, lang: readerLang(req, q.lang) }) });
});

/** GET /threads/lookup?applicationId= | caseId= (staff) → { thread: { id, status } | null } */
messagingPlusRouter.get('/threads/lookup', async (req, res) => {
  requireStaff2fa(req);
  const q = parse(z.object({ applicationId: z.string().max(40).optional(), caseId: z.string().max(40).optional() }).refine((v) => !!v.applicationId !== !!v.caseId), req.query);
  const t = await prisma.partyThread.findFirst({ where: q.applicationId ? { applicationId: q.applicationId } : { caseId: q.caseId }, select: { id: true, status: true } });
  res.json({ thread: t });
});

/** POST /threads { applicationId } | { caseId } (staff) → opens (or returns) the moderated thread. */
messagingPlusRouter.post('/threads', async (req, res) => {
  requireStaff2fa(req);
  const body = parse(z.object({ applicationId: z.string().min(1).max(40).optional(), caseId: z.string().min(1).max(40).optional() }).refine((v) => !!v.applicationId !== !!v.caseId, { message: 'ONE_TARGET' }), req.body);
  const { thread, created } = await openThread(body, viewer(req));
  if (created) await audit(req, 'PARTY_THREAD_OPENED', `partyThread:${thread.id}`, { applicationId: thread.applicationId, caseId: thread.caseId, companyId: thread.companyId });
  res.status(created ? 201 : 200).json({ thread: { id: thread.id, status: thread.status }, created });
});

messagingPlusRouter.get('/threads/:id', async (req, res) => {
  const v = viewer(req);
  const { thread, side } = await loadThreadFor(String(req.params.id), v);
  res.json(await threadView(thread, side, v, readerLang(req)));
});

messagingPlusRouter.post('/threads/:id/messages', async (req, res) => {
  const body = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const v = viewer(req);
  const { thread, side } = await loadThreadFor(String(req.params.id), v);
  const message = await sendPartyMessage(thread, side, v, { body: body.body });
  res.status(201).json({ message, held: message.status === 'HELD' });
});

messagingPlusRouter.post('/threads/:id/voice', voiceUpload.single('file'), async (req, res) => {
  const v = viewer(req);
  const { thread, side } = await loadThreadFor(String(req.params.id), v);
  if (thread.status === 'CLOSED') throw new HttpError(409, 'THREAD_CLOSED');
  const clip = await storeVoiceClip(req.file, durationOf(req), v.id);
  const message = await sendPartyMessage(thread, side, v, { body: '', voiceId: clip.id });
  if (clip.transcriptStatus === 'PENDING') {
    void scheduleTranscription(clip.id, v, [v.locale], () => afterPartyTranscript(message.id));
  }
  res.status(201).json({ message, held: message.status === 'HELD' });
});

messagingPlusRouter.post('/threads/:id/read', async (req, res) => {
  const v = viewer(req);
  const { thread, side } = await loadThreadFor(String(req.params.id), v);
  await markThreadRead(thread, side, v);
  res.json({ ok: true });
});

// Staff moderation ─────────────────────────────────────────────────────

const staffThread = async (req: Request) => {
  requireStaff2fa(req);
  const v = viewer(req);
  const { thread, side } = await loadThreadFor(String(req.params.id), v);
  if (side !== 'STAFF') throw forbidden('FORBIDDEN');
  return { thread, v };
};

messagingPlusRouter.patch('/threads/:id', async (req, res) => {
  const { thread } = await staffThread(req);
  const body = parse(z.object({ status: z.enum(['OPEN', 'CLOSED']).optional(), showCompany: z.boolean().optional() }).refine((b) => b.status !== undefined || b.showCompany !== undefined), req.body);
  const updated = await updateThread(thread, body);
  await audit(req, 'PARTY_THREAD_UPDATED', `partyThread:${thread.id}`, body);
  res.json({ thread: { id: updated.id, status: updated.status, showCompany: updated.showCompany } });
});

messagingPlusRouter.post('/threads/:id/pins', async (req, res) => {
  const { thread, v } = await staffThread(req);
  const body = parse(z.object({ topic: z.enum(PIN_TOPICS), text: z.string().trim().min(1).max(300) }), req.body);
  const pin = await addPin(thread, v, body.topic, body.text);
  await audit(req, 'PARTY_THREAD_PINNED', `partyThread:${thread.id}`, { topic: body.topic });
  res.status(201).json({ pin });
});

messagingPlusRouter.delete('/threads/:id/pins/:pinId', async (req, res) => {
  const { thread } = await staffThread(req);
  await removePin(thread, String(req.params.pinId));
  await audit(req, 'PARTY_THREAD_UNPINNED', `partyThread:${thread.id}`, { pinId: String(req.params.pinId) });
  res.json({ ok: true });
});

messagingPlusRouter.post('/threads/:id/messages/:messageId/moderate', async (req, res) => {
  const { thread, v } = await staffThread(req);
  const body = parse(z.object({ action: z.enum(MODERATION_ACTIONS) }), req.body);
  await moderateMessage(thread, String(req.params.messageId), body.action, v);
  await audit(req, `PARTY_MESSAGE_${body.action}`, `partyMessage:${String(req.params.messageId)}`, { threadId: thread.id });
  res.json({ ok: true });
});
