import type { AiScope } from '@prisma/client';
import { prisma } from '../../db.js';
import type { ChatMessage } from './context.js';
import { AiError, estimateCostMicros, getAiTransport, getModelMeta, noteKeySpend, reasoningFor, type ChatRequest } from './openrouter.js';
import { getAiSettings, privacyRouting, resolveApiKey } from './settings.js';
import { checkLimits, monthSpentUsd, type LimitReason } from './limits.js';
import { parseModelJson } from './translate.js';

/**
 * One-shot AI task outside the chat (document check, letter explanation, CV text, case summary, reply draft …).
 *
 * Goes through the same transport, key, limits and cost recording as the assistant: the cost is booked on an
 * archived conversation of the user per `purpose` (hidden `tool` rows), so the monthly budget, the per-user
 * daily caps (CLIENT or ADMIN scope) and the usage dashboard all count it. Never throws: failures come back
 * as `{ ok: false, reason }` so callers can fall back gracefully.
 *
 * Input parts can carry images (JPEG/PNG/WEBP) and PDFs, which the Claude models read directly.
 */

export const CHEAP_MODEL = 'anthropic/claude-haiku-5.5';
export const STRONG_MODEL = 'anthropic/claude-sonnet-5.5';

export type AiPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; data: Buffer }
  | { type: 'pdf'; filename: string; data: Buffer };

export interface AiCompleteOptions {
  /** Who pays (limits + usage). Without a user only the monthly budget is checked and nothing is recorded (jobs, public visitors). */
  userId?: string | null;
  scope: AiScope;
  /** Short key of the task, e.g. "doc-check", "letter-explain", "cv", "case-summary"; also the usage bucket title. */
  purpose: string;
  model?: string;
  system: string;
  input: string | AiPart[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Parse the answer as a JSON object (tolerates code fences). */
  json?: boolean;
  /** Do not count this call as a chat message for the client's daily message limit (default true: not counted). */
  skipMessageCount?: boolean;
}

export type AiCompleteFailure = LimitReason | 'TIMEOUT' | 'UPSTREAM' | 'BAD_OUTPUT';

export type AiCompleteResult =
  | { ok: true; text: string; json?: Record<string, unknown>; costUsd: number; model: string }
  | { ok: false; reason: AiCompleteFailure; text?: string };

const toContent = (input: string | AiPart[]) => {
  if (typeof input === 'string') return input;
  return input.map((p) => {
    if (p.type === 'text') return { type: 'text', text: p.text };
    if (p.type === 'image') return { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data.toString('base64')}` } };
    return { type: 'file', file: { filename: p.filename, file_data: `data:application/pdf;base64,${p.data.toString('base64')}` } };
  });
};

const usageConversation = async (userId: string, scope: AiScope, purpose: string, model: string) => {
  const title = `AI · ${purpose}`;
  const existing = await prisma.aiConversation.findFirst({ where: { userId, scope, archived: true, title }, select: { id: true } });
  if (existing) return existing.id;
  return (await prisma.aiConversation.create({ data: { userId, scope, archived: true, title, model }, select: { id: true } })).id;
};

const recordUsage = async (userId: string, scope: AiScope, purpose: string, model: string, r: { tokensIn: number; tokensOut: number; costMicros: number }) => {
  try {
    const conversationId = await usageConversation(userId, scope, purpose, model);
    await prisma.aiMessage.create({ data: { conversationId, role: 'tool', toolName: purpose.slice(0, 80), content: null, model, ...r } });
    noteKeySpend(r.costMicros / 1e6);
  } catch {
    /* recording must never break the request */
  }
};

export const aiComplete = async (opts: AiCompleteOptions): Promise<AiCompleteResult> => {
  const model = opts.model ?? CHEAP_MODEL;
  try {
    const settings = await getAiSettings();
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return { ok: false, reason: 'NO_API_KEY' };
    const monthOnly = async () => ((await monthSpentUsd()) >= settings.monthlyBudgetUsd ? ('MONTHLY_BUDGET' as const) : null);
    const limit = opts.userId
      ? await Promise.race([
          checkLimits({ id: opts.userId }, opts.scope, settings, apiKey, { countingNewMessage: !(opts.skipMessageCount ?? true) }),
          new Promise<'SLOW'>((r) => setTimeout(() => r('SLOW'), 3000)),
        ]).then((v) => (v === 'SLOW' ? monthOnly() : v))
      : await monthOnly();
    if (limit) return { ok: false, reason: limit };

    const answerTokens = opts.maxTokens ?? 800;
    const meta = await Promise.race([getModelMeta(model), new Promise<undefined>((r) => setTimeout(() => r(undefined), 1500))]);
    const req: ChatRequest = {
      model,
      temperature: opts.temperature ?? 0.2,
      ...reasoningFor(meta, answerTokens),
      ...privacyRouting(settings),
      messages: [{ role: 'system', content: opts.system }, { role: 'user', content: toContent(opts.input) } as unknown as ChatMessage],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
    let text = '';
    let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null = null;
    try {
      for await (const chunk of getAiTransport()(req, { signal: controller.signal, apiKey })) {
        if (chunk.error) throw new AiError('UPSTREAM_ERROR', chunk.error.message);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) text += delta;
        if (chunk.usage) usage = chunk.usage;
        if (controller.signal.aborted) throw new AiError('ABORTED');
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof AiError && err.code === 'ABORTED')) return { ok: false, reason: 'TIMEOUT' };
      return { ok: false, reason: 'UPSTREAM' };
    } finally {
      clearTimeout(timer);
    }

    const tokensIn = usage?.prompt_tokens ?? Math.ceil(opts.system.length / 4 + 1500);
    const tokensOut = usage?.completion_tokens ?? Math.ceil(text.length / 4);
    const costMicros = typeof usage?.cost === 'number' ? Math.round(usage.cost * 1e6) : estimateCostMicros(meta, tokensIn, tokensOut);
    if (opts.userId) await recordUsage(opts.userId, opts.scope, opts.purpose, model, { tokensIn, tokensOut, costMicros });
    else noteKeySpend(costMicros / 1e6);

    if (opts.json) {
      const json = parseModelJson(text);
      if (!json) return { ok: false, reason: 'BAD_OUTPUT', text };
      return { ok: true, text, json, costUsd: costMicros / 1e6, model };
    }
    return { ok: true, text: text.trim(), costUsd: costMicros / 1e6, model };
  } catch {
    return { ok: false, reason: 'UPSTREAM' };
  }
};
