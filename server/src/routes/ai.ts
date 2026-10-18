import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AiScope, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, limiter, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import {
  decideAction,
  expireStaleActions,
  isBusy,
  loadOwnAction,
  preflight,
  publicAction,
  runTurn,
  toolLabel,
  type AiUser,
  type Emit,
} from '../lib/ai/service.js';
import { ensureToolsLoaded, getTool } from '../lib/ai/registry.js';
import { aiSettingsUpdateSchema, getAiSettings, publicSettings, saveAiSettings } from '../lib/ai/settings.js';
import { usageReport } from '../lib/ai/usage.js';
import { AiError, getModels } from '../lib/ai/openrouter.js';

/**
 * AI assistant API — mounted at /api/ai.
 *   Conversations: scope CLIENT (role CLIENT) and ADMIN (SUPER_ADMIN with 2FA); everyone sees only their own.
 *   POST /conversations/:id/messages and /actions/:id/(confirm|reject) answer with Server-Sent Events:
 *     start {conversationId, userMessageId} · delta {text} · tool {callId, name, status, label}
 *     action {action} · notice {code, message} · done {messageId, costUsd, tokensIn, tokensOut, title} · error {code, message}
 *   A limit reached before the call answers 429 { error: 'AI_LIMIT', reason, message } (403 AI_DISABLED when switched off).
 *   GET/PUT /settings, GET /usage, GET /models: super admin.
 */
export const aiRouter = Router();
aiRouter.use(requireAuth);

const scopeEnum = z.enum(['CLIENT', 'ADMIN']);
const contextSchema = z
  .object({
    nodeId: z.string().max(64).nullish(),
    folderId: z.string().max(64).nullish(),
    caseId: z.string().max(64).nullish(),
    page: z.string().max(200).nullish(),
  })
  .strict()
  .nullish();

const aiUser = (req: Request): AiUser => {
  const u = req.user!;
  return { id: u.id, role: u.role, firstName: u.firstName, lastName: u.lastName, email: u.email, locale: u.locale };
};

/** CLIENT scope: clients only. ADMIN scope: the super admin with completed 2FA (same gate as staff routes). */
const assertScope = (req: Request, scope: AiScope) => {
  const u = req.user!;
  if (scope === 'CLIENT') {
    if (u.role !== 'CLIENT') throw new HttpError(403, 'FORBIDDEN');
    return;
  }
  if (u.role !== 'SUPER_ADMIN') throw new HttpError(403, 'FORBIDDEN');
  if (!u.twoFactorEnabled) throw new HttpError(403, 'TWO_FACTOR_ENROLLMENT_REQUIRED');
};

const defaultScope = (req: Request): AiScope => (req.user!.role === 'SUPER_ADMIN' ? 'ADMIN' : 'CLIENT');

const ownConversation = async (req: Request, id: string) => {
  const conv = await prisma.aiConversation.findFirst({ where: { id, userId: req.user!.id } });
  if (!conv) throw new HttpError(404, 'NOT_FOUND');
  assertScope(req, conv.scope);
  return conv;
};

// Per-user ceiling on paid calls (independent of the daily limits).
const postLimiter = limiter({
  windowMs: 60_000,
  limit: 10,
  keyGenerator: (req) => `ai:${(req as Request).user?.id ?? 'anon'}`,
});

// ─── Server-Sent Events ────────────────────────────────────────────────

const openStream = (req: Request, res: Response) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  req.socket?.setTimeout?.(0);
  const controller = new AbortController();
  let closed = false;
  const write = (chunk: string) => {
    if (closed || res.writableEnded) return;
    res.write(chunk);
    (res as Response & { flush?: () => void }).flush?.();
  };
  const heartbeat = setInterval(() => write(`: ping\n\n`), 15_000);
  // The browser went away (tab closed, Stop pressed): abort the upstream call.
  res.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
    if (!res.writableEnded) controller.abort();
  });
  const emit: Emit = (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const end = () => {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  };
  return { emit, end, signal: controller.signal };
};

const streamError = (emit: Emit, err: unknown, locale: string) => {
  const code = err instanceof HttpError || err instanceof AiError ? err.code : 'INTERNAL';
  if (!(err instanceof HttpError) && !(err instanceof AiError && err.code === 'ABORTED')) console.error('[ai] turn failed', code, (err as Error)?.message);
  const message: Record<string, string> = {
    az: 'Bağışlayın, cavab hazırlanarkən xəta baş verdi. Bir az sonra yenidən cəhd edin.',
    de: 'Entschuldigung, beim Antworten ist ein Fehler aufgetreten. Bitte versuchen Sie es gleich noch einmal.',
    en: 'Sorry, something went wrong while answering. Please try again in a moment.',
    ru: 'Извините, при подготовке ответа произошла ошибка. Попробуйте ещё раз чуть позже.',
  };
  emit('error', { code, message: message[locale] ?? message.az });
};

const limitResponse = (res: Response, pre: { reason: string; message: string }) =>
  res.status(pre.reason === 'DISABLED' ? 403 : 429).json({ error: pre.reason === 'DISABLED' ? 'AI_DISABLED' : 'AI_LIMIT', reason: pre.reason, message: pre.message });

// ─── Status ─────────────────────────────────────────────────────────────

aiRouter.get('/status', async (req, res) => {
  const s = await getAiSettings();
  const u = req.user!;
  res.json({
    clientEnabled: s.clientEnabled,
    scopes: {
      CLIENT: u.role === 'CLIENT' && s.clientEnabled,
      ADMIN: u.role === 'SUPER_ADMIN' && !!u.twoFactorEnabled,
    },
  });
});

// ─── Conversations ──────────────────────────────────────────────────────

aiRouter.get('/conversations', async (req, res) => {
  const q = parse(z.object({ scope: scopeEnum.optional(), archived: z.enum(['0', '1']).optional() }), req.query);
  const scope = q.scope ?? defaultScope(req);
  assertScope(req, scope);
  const rows = await prisma.aiConversation.findMany({
    where: { userId: req.user!.id, scope, archived: q.archived === '1' },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: { id: true, title: true, scope: true, archived: true, createdAt: true, updatedAt: true, _count: { select: { actions: { where: { status: 'PENDING' } } } } },
  });
  res.json({ items: rows.map(({ _count, ...c }) => ({ ...c, pendingActions: _count.actions })) });
});

aiRouter.post('/conversations', async (req, res) => {
  const body = parse(z.object({ scope: scopeEnum.optional(), context: contextSchema, title: z.string().max(200).optional() }), req.body);
  const scope = body.scope ?? defaultScope(req);
  assertScope(req, scope);
  const s = await getAiSettings();
  const conv = await prisma.aiConversation.create({
    data: { userId: req.user!.id, scope, title: body.title?.trim() || null, model: s.models[scope], context: (body.context ?? undefined) as Prisma.InputJsonValue | undefined },
  });
  res.status(201).json({ conversation: conv });
});

aiRouter.get('/conversations/:id', async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  await expireStaleActions(conv.id);
  await ensureToolsLoaded();
  const [messages, actions] = await Promise.all([
    prisma.aiMessage.findMany({ where: { conversationId: conv.id, role: { in: ['user', 'assistant'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 500 }),
    prisma.aiAction.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } }),
  ]);
  const locale = req.user!.locale;
  res.json({
    conversation: conv,
    messages: messages
      .map((m) => {
        const calls = Array.isArray(m.toolCalls) ? (m.toolCalls as { id: string; name: string }[]) : [];
        return {
          id: m.id,
          role: m.role,
          content: m.content ?? '',
          tools: calls.map((c) => ({ callId: c.id, name: c.name, label: toolLabel(getTool(conv.scope, c.name), locale) })),
          createdAt: m.createdAt,
          ...(conv.scope === 'ADMIN' ? { costUsd: m.costMicros / 1e6, model: m.model } : {}),
        };
      })
      .filter((m) => m.role === 'user' || m.content || m.tools.length),
    actions: actions.map((a) => publicAction(a, conv.scope)),
  });
});

aiRouter.patch('/conversations/:id', async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  const body = parse(z.object({ title: z.string().trim().min(1).max(200).optional(), archived: z.boolean().optional(), context: contextSchema }).strict(), req.body);
  const updated = await prisma.aiConversation.update({
    where: { id: conv.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.archived !== undefined ? { archived: body.archived } : {}),
      ...(body.context !== undefined ? { context: (body.context ?? undefined) as Prisma.InputJsonValue | undefined } : {}),
    },
  });
  res.json({ conversation: updated });
});

aiRouter.delete('/conversations/:id', async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  if (isBusy(conv.id)) throw new HttpError(409, 'CONVERSATION_BUSY');
  await prisma.aiConversation.delete({ where: { id: conv.id } });
  res.json({ ok: true });
});

aiRouter.post('/conversations/:id/messages', postLimiter, async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  const body = parse(z.object({ content: z.string().trim().min(1).max(4000), context: contextSchema }), req.body);
  if (isBusy(conv.id)) throw new HttpError(409, 'CONVERSATION_BUSY');
  const user = aiUser(req);
  const pre = await preflight(user, conv.scope);
  if (pre) return limitResponse(res, pre);

  let conversation = conv;
  if (body.context !== undefined) {
    conversation = await prisma.aiConversation.update({ where: { id: conv.id }, data: { context: (body.context ?? undefined) as Prisma.InputJsonValue | undefined } });
  }
  const { emit, end, signal } = openStream(req, res);
  try {
    await runTurn({ conversation, user, content: body.content, emit, signal });
  } catch (err) {
    streamError(emit, err, user.locale);
  } finally {
    end();
  }
});

// ─── Confirm / reject a proposed change ─────────────────────────────────

const decide = (decision: 'confirm' | 'reject') => async (req: Request, res: Response) => {
  const user = aiUser(req);
  const action = await loadOwnAction(String(req.params.id), user.id);
  assertScope(req, action.conversation.scope);
  if (isBusy(action.conversationId)) throw new HttpError(409, 'CONVERSATION_BUSY');

  const updated = await decideAction(action, user, decision);
  if (action.conversation.scope === 'ADMIN') {
    await audit(req, decision === 'confirm' ? 'AI_ACTION_CONFIRMED' : 'AI_ACTION_REJECTED', `ai-action:${action.id}`, {
      tool: action.tool,
      summary: action.summary,
      status: updated.status,
    });
  }

  const { emit, end, signal } = openStream(req, res);
  try {
    emit('action', { action: publicAction(updated, action.conversation.scope) });
    // The follow-up is a paid call too: skip it (the result card is enough) when a limit is reached.
    const pre = await preflight(user, action.conversation.scope, { countingNewMessage: false });
    if (pre) {
      emit('notice', { code: pre.reason, message: pre.message });
      emit('done', { messageId: null, costUsd: 0, tokensIn: 0, tokensOut: 0, title: action.conversation.title });
    } else {
      const conversation = await prisma.aiConversation.findUniqueOrThrow({ where: { id: action.conversationId } });
      await runTurn({ conversation, user, emit, signal });
    }
  } catch (err) {
    streamError(emit, err, user.locale);
  } finally {
    end();
  }
};

aiRouter.post('/actions/:id/confirm', postLimiter, decide('confirm'));
aiRouter.post('/actions/:id/reject', postLimiter, decide('reject'));

// ─── Super admin: settings, usage, models ───────────────────────────────

aiRouter.get('/settings', requireRole('SUPER_ADMIN'), async (_req, res) => {
  res.json({ settings: publicSettings(await getAiSettings()) });
});

aiRouter.put('/settings', requireRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(aiSettingsUpdateSchema, req.body);
  const next = await saveAiSettings(body);
  await audit(req, 'AI_SETTINGS_UPDATED', 'setting:ai.assistant', { fields: Object.keys(body).filter((k) => k !== 'apiKey'), apiKeyChanged: body.apiKey !== undefined });
  res.json({ settings: publicSettings(next) });
});

aiRouter.get('/usage', requireRole('SUPER_ADMIN'), async (req, res) => {
  const q = parse(z.object({ days: z.coerce.number().int().min(1).max(90).optional() }), req.query);
  res.json(await usageReport(q.days ?? 30));
});

aiRouter.get('/models', requireRole('SUPER_ADMIN'), async (_req, res) => {
  const s = await getAiSettings();
  const list = (await getModels()).filter((m) => m.id.startsWith('anthropic/') && !m.id.endsWith(':batch'));
  // Keep the configured models selectable even when the list is unavailable.
  for (const id of Object.values(s.models)) if (!list.some((m) => m.id === id)) list.push({ id, name: id, contextLength: null, promptPerM: null, completionPerM: null, reasoning: null });
  list.sort((a, b) => a.id.localeCompare(b.id));
  res.json({ items: list });
});
