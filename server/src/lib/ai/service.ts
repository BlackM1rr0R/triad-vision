import type { AiAction, AiConversation, AiMessage, AiScope, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';
import type { AiToolContext, AnyAiTool } from './types.js';
import { repairToolPairs, trimHistory, messageTokens, estimateTokens, type ChatMessage, type ChatToolCall } from './context.js';
import { AiError, estimateCostMicros, getAiTransport, getModelMeta, noteKeySpend, reasoningFor, type ChatRequest } from './openrouter.js';
import { ensureToolsLoaded, getTool, toolSpecs } from './registry.js';
import { systemPrompt } from './prompts.js';
import { getAiSettings, resolveApiKey, type AiSettings } from './settings.js';
import { checkLimits, checkSpendDuringTurn, limitMessage, type LimitReason } from './limits.js';

/**
 * The conversation engine: one user message → up to MAX_TOOL_ROUNDS model calls with tool calls in
 * between, streamed to the caller through `emit`. Every model answer, tool call and tool result is
 * stored as an AiMessage with its tokens and cost.
 */

export const MAX_TOOL_ROUNDS = 8;
export const ACTION_TTL_MS = 30 * 60_000;
const TOOL_TIMEOUT_MS = 30_000;
const MAX_TOOL_RESULT_CHARS = 16_000;
const HISTORY_LOAD = 200;

export type Emit = (event: 'start' | 'delta' | 'tool' | 'action' | 'notice' | 'done' | 'error', data: unknown) => void;

export interface AiUser {
  id: string;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  locale: string;
}

type Lang = 'az' | 'de' | 'en' | 'ru';
const lang = (l: string): Lang => (['az', 'de', 'en', 'ru'].includes(l) ? (l as Lang) : 'az');

const GENERIC_LABEL: Record<Lang, string> = { az: 'Məlumatlara baxıram…', de: 'Ich sehe nach…', en: 'Looking it up…', ru: 'Смотрю данные…' };
export const toolLabel = (tool: AnyAiTool | undefined, locale: string) => tool?.label?.[lang(locale)] ?? tool?.label?.en ?? GENERIC_LABEL[lang(locale)];

/** Wraps text taken from files/e-mails so the model treats it as data (see the system prompt). */
export const untrusted = (text: string, maxChars = 8000) => ({
  untrusted_document_text: text.length > maxChars ? `${text.slice(0, maxChars)}\n[…truncated]` : text,
});

// Distinct, increasing timestamps so messages written within one millisecond keep their order.
let lastTs = 0;
const nextTs = () => {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return new Date(lastTs);
};

// One running turn per conversation (a second tab must not interleave tool calls).
const busy = new Set<string>();
export const isBusy = (conversationId: string) => busy.has(conversationId);

export const autoTitle = (text: string) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t || null;
};

/** Action as sent to the UI. Arguments are shown to the super admin only. */
export const publicAction = (a: AiAction, scope: AiScope) => ({
  id: a.id,
  tool: a.tool,
  summary: a.summary,
  status: a.status,
  createdAt: a.createdAt,
  decidedAt: a.decidedAt,
  expiresAt: new Date(a.createdAt.getTime() + ACTION_TTL_MS),
  result: a.result ?? null,
  ...(scope === 'ADMIN' ? { args: a.args } : {}),
});

const clampResult = (value: unknown) => {
  let s: string;
  try {
    s = JSON.stringify(value ?? null);
  } catch {
    s = JSON.stringify({ error: 'unserialisable_result' });
  }
  return s.length > MAX_TOOL_RESULT_CHARS ? `${s.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated: ask for fewer items]` : s;
};

const actionNotice = (content: string | null) => {
  try {
    const n = JSON.parse(content ?? '{}') as { action_update?: { decision: string; summary: string; status: string; result?: unknown } };
    const u = n.action_update;
    if (!u) return null;
    const verb = u.decision === 'confirmed' ? 'CONFIRMED' : 'REJECTED';
    const outcome = u.decision === 'confirmed' ? `Outcome: ${u.status}. Result: ${JSON.stringify(u.result ?? null).slice(0, 4000)}` : 'Nothing was changed.';
    return `[App notice, not written by the user] The user ${verb} the proposed action "${u.summary}". ${outcome} Tell the user the outcome in one or two short sentences.`;
  } catch {
    return null;
  }
};

/** Stored messages → provider messages. */
export const toChatMessages = (rows: Pick<AiMessage, 'role' | 'content' | 'toolCalls' | 'toolCallId'>[]): ChatMessage[] => {
  const out: ChatMessage[] = [];
  for (const m of rows) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content ?? '' });
    else if (m.role === 'assistant') {
      const calls = Array.isArray(m.toolCalls) ? (m.toolCalls as { id: string; name: string; arguments: string }[]) : [];
      if (!m.content && !calls.length) continue;
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(calls.length ? { tool_calls: calls.map((c): ChatToolCall => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })) } : {}),
      });
    } else if (m.role === 'tool') {
      if (m.toolCallId) out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content ?? '' });
      else {
        const notice = actionNotice(m.content);
        if (notice) out.push({ role: 'user', content: notice });
      }
    }
  }
  return repairToolPairs(out);
};

const toolCtx = (user: AiUser, conv: AiConversation): AiToolContext => ({
  user: { id: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName, email: user.email, locale: user.locale },
  scope: conv.scope,
  conversationId: conv.id,
  context: (conv.context as AiToolContext['context']) ?? null,
});

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tool timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

const errorText = (err: unknown) => (err instanceof HttpError ? err.code : err instanceof Error ? err.message : String(err)).slice(0, 300);

interface RoundResult {
  content: string;
  calls: { id: string; name: string; arguments: string }[];
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  aborted: boolean;
}

/** One streamed model call; text deltas go straight to `emit`. */
const streamRound = async (req: ChatRequest, apiKey: string, signal: AbortSignal, emit: Emit): Promise<RoundResult> => {
  let content = '';
  const slots: { id: string; name: string; arguments: string }[] = [];
  let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null = null;
  let aborted = false;
  try {
    for await (const chunk of getAiTransport()(req, { signal, apiKey })) {
      if (chunk.error) throw new AiError('UPSTREAM_ERROR', chunk.error.message ?? 'upstream error');
      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (text) {
        content += text;
        emit('delta', { text });
      }
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const slot = (slots[tc.index ?? 0] ??= { id: '', name: '', arguments: '' });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.arguments += tc.function.arguments;
      }
      if (chunk.usage) usage = chunk.usage;
      if (signal.aborted) throw new AiError('ABORTED');
    }
  } catch (err) {
    if (!(signal.aborted || (err instanceof AiError && err.code === 'ABORTED'))) throw err;
    aborted = true;
  }
  const calls = slots.filter(Boolean).filter((c) => c.name).map((c, i) => ({ ...c, id: c.id || `call_${Date.now().toString(36)}_${i}` }));
  const tokensIn = usage?.prompt_tokens ?? req.messages.reduce((a, m) => a + messageTokens(m), 0);
  const tokensOut = usage?.completion_tokens ?? estimateTokens(content) + calls.reduce((a, c) => a + estimateTokens(c.arguments), 0);
  const costMicros =
    typeof usage?.cost === 'number' ? Math.round(usage.cost * 1e6) : estimateCostMicros(await getModelMeta(req.model), tokensIn, tokensOut + (req.reasoning?.max_tokens ?? 0));
  return { content, calls, tokensIn, tokensOut, costMicros, aborted };
};

/** Runs one tool call (or turns it into a pending action) and returns the tool-result content. */
const runToolCall = async (
  call: { id: string; name: string; arguments: string },
  conv: AiConversation,
  user: AiUser,
  emit: Emit,
): Promise<string> => {
  const tool = getTool(conv.scope, call.name);
  const label = toolLabel(tool, user.locale);
  emit('tool', { callId: call.id, name: call.name, status: 'running', label });
  let ok = true;
  let result: unknown;
  if (!tool) {
    ok = false;
    result = { error: 'unknown_tool', message: `No tool named ${call.name}` };
  } else {
    let raw: unknown = {};
    try {
      raw = call.arguments.trim() ? JSON.parse(call.arguments) : {};
    } catch {
      raw = null;
    }
    const parsed = raw === null ? null : tool.schema.safeParse(raw);
    if (!parsed || !parsed.success) {
      ok = false;
      result = { error: 'invalid_arguments', issues: parsed && !parsed.success ? parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) : ['arguments are not valid JSON'] };
    } else if (tool.confirm) {
      const ctx = toolCtx(user, conv);
      let summary: string;
      try {
        summary = (await tool.summary?.(parsed.data, ctx)) ?? `${tool.name} ${JSON.stringify(parsed.data).slice(0, 300)}`;
      } catch (err) {
        summary = `${tool.name}: ${errorText(err)}`;
      }
      const action = await prisma.aiAction.create({
        data: { conversationId: conv.id, userId: user.id, toolCallId: call.id, tool: tool.name, args: parsed.data as Prisma.InputJsonValue, summary: summary.slice(0, 2000) },
      });
      emit('action', { action: publicAction(action, conv.scope) });
      result = {
        status: 'awaiting_user_confirmation',
        actionId: action.id,
        summary: action.summary,
        note: 'Nothing has been changed yet. The user sees a confirmation card; the change runs only if they press Confirm.',
      };
    } else {
      try {
        result = await withTimeout(tool.run(parsed.data, toolCtx(user, conv)), TOOL_TIMEOUT_MS);
      } catch (err) {
        ok = false;
        result = { error: 'tool_failed', message: errorText(err) };
      }
    }
  }
  emit('tool', { callId: call.id, name: call.name, status: ok ? 'done' : 'error', label });
  return clampResult(result);
};

export interface TurnOptions {
  conversation: AiConversation;
  user: AiUser;
  /** New user message; omitted for the follow-up after a confirm / reject. */
  content?: string;
  emit: Emit;
  signal: AbortSignal;
}

/** Runs a full turn. Limits must have been checked by the caller (so it can answer 429 before streaming). */
export const runTurn = async ({ conversation, user, content, emit, signal }: TurnOptions) => {
  if (busy.has(conversation.id)) throw new HttpError(409, 'CONVERSATION_BUSY');
  busy.add(conversation.id);
  try {
    await ensureToolsLoaded();
    const settings = await getAiSettings();
    const apiKey = resolveApiKey(settings);
    const followUp = content === undefined;
    const scope = conversation.scope;
    const model = settings.models[scope];
    const meta = await getModelMeta(model);
    const answerCap = followUp ? Math.min(settings.maxOutputTokens[scope], 400) : settings.maxOutputTokens[scope];

    let userMessageId: string | null = null;
    if (!followUp) {
      const msg = await prisma.aiMessage.create({ data: { conversationId: conversation.id, role: 'user', content, createdAt: nextTs() } });
      userMessageId = msg.id;
      await prisma.aiConversation.update({
        where: { id: conversation.id },
        data: { ...(conversation.title ? {} : { title: autoTitle(content) }), model, updatedAt: new Date() },
      });
    }
    emit('start', { conversationId: conversation.id, userMessageId });

    const rows = (
      await prisma.aiMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: HISTORY_LOAD,
        select: { role: true, content: true, toolCalls: true, toolCallId: true },
      })
    ).reverse();
    const trimmed = trimHistory(toChatMessages(rows));
    const ctx = toolCtx(user, conversation);
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(scope, ctx, { omitted: trimmed.omitted }) }, ...trimmed.messages];
    const tools = toolSpecs(scope);

    let lastAssistantId: string | null = null;
    let total = { costMicros: 0, tokensIn: 0, tokensOut: 0 };
    let notice: LimitReason | null = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const forceText = followUp || round === MAX_TOOL_ROUNDS;
      const req: ChatRequest = {
        model,
        messages,
        ...reasoningFor(meta, answerCap),
        ...(tools.length ? { tools, tool_choice: forceText ? 'none' : 'auto' } : {}),
      };
      const r = await streamRound(req, apiKey, signal, emit);
      const calls = forceText ? [] : r.calls;
      const saved = await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: r.content || null,
          toolCalls: calls.length ? (calls as unknown as Prisma.InputJsonValue) : undefined,
          model,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          costMicros: r.costMicros,
          createdAt: nextTs(),
        },
      });
      lastAssistantId = saved.id;
      total = { costMicros: total.costMicros + r.costMicros, tokensIn: total.tokensIn + r.tokensIn, tokensOut: total.tokensOut + r.tokensOut };
      noteKeySpend(r.costMicros / 1e6);
      if (r.aborted || !calls.length) break;

      messages.push({ role: 'assistant', content: r.content || null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })) });
      for (const call of calls) {
        const resultContent = await runToolCall(call, conversation, user, emit);
        await prisma.aiMessage.create({
          data: { conversationId: conversation.id, role: 'tool', toolCallId: call.id, toolName: call.name, content: resultContent, createdAt: nextTs() },
        });
        messages.push({ role: 'tool', tool_call_id: call.id, content: resultContent });
      }
      if (signal.aborted) break;
      notice = await checkSpendDuringTurn(user, scope, settings);
      if (notice) {
        emit('notice', { code: notice, message: limitMessage(notice, user.locale) });
        break;
      }
    }

    await prisma.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    const conv = await prisma.aiConversation.findUnique({ where: { id: conversation.id }, select: { title: true } });
    emit('done', {
      messageId: lastAssistantId,
      costUsd: total.costMicros / 1e6,
      tokensIn: total.tokensIn,
      tokensOut: total.tokensOut,
      title: conv?.title ?? null,
      aborted: signal.aborted,
    });
    return { messageId: lastAssistantId, ...total };
  } finally {
    busy.delete(conversation.id);
  }
};

// ─── Confirm / reject ───────────────────────────────────────────────────

/** Loads an action the caller owns (404 otherwise) and expires it when it is too old. */
export const loadOwnAction = async (actionId: string, userId: string) => {
  const action = await prisma.aiAction.findUnique({ where: { id: actionId }, include: { conversation: true } });
  if (!action || action.userId !== userId || action.conversation.userId !== userId) throw new HttpError(404, 'NOT_FOUND');
  if (action.status === 'PENDING' && Date.now() - action.createdAt.getTime() > ACTION_TTL_MS) {
    await prisma.aiAction.updateMany({ where: { id: action.id, status: 'PENDING' }, data: { status: 'EXPIRED', decidedAt: new Date() } });
    throw new HttpError(410, 'ACTION_EXPIRED');
  }
  if (action.status !== 'PENDING') throw new HttpError(409, 'ACTION_ALREADY_DECIDED');
  return action;
};

/** Marks old pending actions of a conversation as expired (lazy, on read). */
export const expireStaleActions = (conversationId: string) =>
  prisma.aiAction.updateMany({
    where: { conversationId, status: 'PENDING', createdAt: { lt: new Date(Date.now() - ACTION_TTL_MS) } },
    data: { status: 'EXPIRED', decidedAt: new Date() },
  });

/**
 * Claims the action (only one request can), runs the tool for a confirm, stores the outcome and the
 * notice message the model sees in its follow-up. Returns the updated action.
 */
export const decideAction = async (action: AiAction & { conversation: AiConversation }, user: AiUser, decision: 'confirm' | 'reject') => {
  const claimed = await prisma.aiAction.updateMany({
    where: { id: action.id, status: 'PENDING' },
    data: { status: decision === 'confirm' ? 'DONE' : 'REJECTED', decidedAt: new Date() },
  });
  if (!claimed.count) throw new HttpError(409, 'ACTION_ALREADY_DECIDED');

  let status: 'DONE' | 'REJECTED' | 'FAILED' = decision === 'confirm' ? 'DONE' : 'REJECTED';
  let result: unknown = null;
  if (decision === 'confirm') {
    await ensureToolsLoaded();
    const tool = getTool(action.conversation.scope, action.tool);
    const parsed = tool?.schema.safeParse(action.args);
    if (!tool || !tool.confirm) {
      status = 'FAILED';
      result = { error: 'unknown_tool' };
    } else if (!parsed?.success) {
      status = 'FAILED';
      result = { error: 'invalid_arguments' };
    } else {
      try {
        result = (await withTimeout(tool.run(parsed.data, toolCtx(user, action.conversation)), 120_000)) ?? { ok: true };
      } catch (err) {
        status = 'FAILED';
        result = { error: 'tool_failed', message: errorText(err) };
      }
    }
  }
  const updated = await prisma.aiAction.update({
    where: { id: action.id },
    data: { status, result: (result ?? undefined) as Prisma.InputJsonValue | undefined },
  });
  await prisma.aiMessage.create({
    data: {
      conversationId: action.conversationId,
      role: 'tool',
      toolName: action.tool,
      toolCallId: null,
      content: clampResult({ action_update: { actionId: action.id, decision: decision === 'confirm' ? 'confirmed' : 'rejected', status, summary: action.summary, result } }),
      createdAt: nextTs(),
    },
  });
  return updated;
};

/** Limits + settings for a caller, used by the routes before opening a stream. */
export const preflight = async (user: AiUser, scope: AiScope, opts: { countingNewMessage?: boolean } = {}) => {
  const settings: AiSettings = await getAiSettings();
  const reason = await checkLimits(user, scope, settings, resolveApiKey(settings), opts);
  return reason ? { reason, message: limitMessage(reason, user.locale) } : null;
};
