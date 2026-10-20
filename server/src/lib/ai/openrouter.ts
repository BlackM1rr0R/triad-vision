import crypto from 'node:crypto';
import { config } from '../../config.js';
import type { ChatMessage } from './context.js';
import { createSseParser } from './sse.js';

/**
 * OpenRouter over plain fetch (no SDK): streamed chat completions, the key's remaining credit and
 * the model list. Every network call goes through a replaceable function so tests never reach the
 * real service (and in NODE_ENV=test the real transport refuses to run at all).
 */

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const APP_HEADERS = { 'HTTP-Referer': 'https://triad-vision.de', 'X-Title': 'Triad Vision' };

export class AiError extends Error {
  constructor(
    public code: string,
    message?: string,
    public status?: number,
  ) {
    super(message ?? code);
  }
}

export interface OpenAiToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ReasoningParam {
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  max_tokens?: number;
  exclude?: boolean;
}

/** OpenRouter provider routing (openrouter.ai/docs → provider selection); only the fields we use. */
export interface ProviderPreferences {
  /** "deny": only providers that do not store user data non-transiently or train on it. */
  data_collection?: 'allow' | 'deny';
  /** true: only endpoints with a Zero Data Retention policy. */
  zdr?: boolean;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: OpenAiToolSpec[];
  tool_choice?: 'auto' | 'none';
  max_tokens: number;
  reasoning?: ReasoningParam;
  temperature?: number;
  /** From the AI privacy settings (settings.ts privacyRouting); absent when privacy routing is off. */
  provider?: ProviderPreferences;
}

/** One parsed `data:` object of the stream (OpenAI chunk format plus OpenRouter's usage/error fields). */
export interface StreamChunk {
  id?: string;
  model?: string;
  choices?: {
    index?: number;
    delta?: {
      content?: string | null;
      tool_calls?: { index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  error?: { code?: number | string; message?: string };
}

export type AiTransport = (req: ChatRequest, opts: { signal: AbortSignal; apiKey: string }) => AsyncIterable<StreamChunk>;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new AiError('ABORTED'));
    });
  });

const CONNECT_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;
/**
 * Anthropic prompt caching through OpenRouter: the tool definitions and the fixed part of the system prompt
 * (~17k tokens for the admin assistant) are identical on every round, so a cache breakpoint after the fixed
 * system text makes later rounds and follow-up questions read them at ~10 % of the price. The per-request
 * tail (date, user, where the chat was opened) stays outside the cached prefix.
 */
const CONTEXT_MARKER = '\n\nContext: today is';
export const withPromptCache = (req: ChatRequest): ChatRequest | (Omit<ChatRequest, 'messages'> & { messages: unknown[] }) => {
  if (!req.model.startsWith('anthropic/')) return req;
  const [first, ...rest] = req.messages;
  if (!first || first.role !== 'system' || typeof first.content !== 'string') return req;
  const at = first.content.indexOf(CONTEXT_MARKER);
  const fixed = at > 0 ? first.content.slice(0, at) : first.content;
  const tail = at > 0 ? first.content.slice(at + 2) : '';
  const content: Record<string, unknown>[] = [{ type: 'text', text: fixed, cache_control: { type: 'ephemeral' } }];
  if (tail) content.push({ type: 'text', text: tail });
  return { ...req, messages: [{ role: 'system', content }, ...rest] };
};

const MAX_ATTEMPTS = 3;

/** The real transport: POST /chat/completions with stream:true, retrying 429/5xx before the stream starts. */
export const openRouterTransport: AiTransport = async function* (req, { signal, apiKey }) {
  if (config.isTest) throw new AiError('TRANSPORT_DISABLED', 'The real OpenRouter transport is disabled in tests');
  if (!apiKey) throw new AiError('NO_API_KEY', 'OpenRouter key is not configured');
  const body = JSON.stringify({ ...withPromptCache(req), stream: true, usage: { include: true } });

  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const connect = AbortSignal.timeout(CONNECT_TIMEOUT_MS);
    try {
      res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream', ...APP_HEADERS },
        body,
        signal: AbortSignal.any([signal, connect]),
      });
    } catch (err) {
      if (signal.aborted) throw new AiError('ABORTED');
      if (attempt === MAX_ATTEMPTS) throw new AiError('UPSTREAM_UNREACHABLE', (err as Error).message);
      await sleep(500 * 2 ** (attempt - 1), signal);
      continue;
    }
    if (res.ok) break;
    const retryable = res.status === 429 || res.status >= 500;
    const text = await res.text().catch(() => '');
    if (!retryable || attempt === MAX_ATTEMPTS) {
      let message = text.slice(0, 300);
      try {
        message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        /* not JSON */
      }
      throw new AiError(res.status === 402 ? 'UPSTREAM_NO_CREDIT' : res.status === 429 ? 'UPSTREAM_RATE_LIMITED' : `UPSTREAM_${res.status}`, message, res.status);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 750 * 2 ** (attempt - 1), signal);
  }
  if (!res?.body) throw new AiError('UPSTREAM_EMPTY');

  const reader = res.body.getReader();
  const queue: StreamChunk[] = [];
  let done = false;
  const parser = createSseParser((ev) => {
    if (ev.data === '[DONE]') {
      done = true;
      return;
    }
    try {
      queue.push(JSON.parse(ev.data) as StreamChunk);
    } catch {
      /* ignore malformed keep-alive data */
    }
  });
  try {
    while (!done) {
      let idle: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        idle = setTimeout(() => reject(new AiError('UPSTREAM_TIMEOUT', 'No data from OpenRouter for 60 s')), IDLE_TIMEOUT_MS);
      });
      let step: ReadableStreamReadResult<Uint8Array>;
      try {
        step = await Promise.race([reader.read(), timeout]);
      } finally {
        clearTimeout(idle);
      }
      if (step.done) {
        parser.end();
        done = true;
      } else parser.feed(step.value);
      while (queue.length) yield queue.shift()!;
    }
  } catch (err) {
    if (signal.aborted) throw new AiError('ABORTED');
    throw err;
  } finally {
    reader.cancel().catch(() => undefined);
  }
};

let transport: AiTransport = openRouterTransport;
/** Replace the chat transport (tests); `null` restores the real one. */
export const setAiTransport = (t: AiTransport | null) => {
  transport = t ?? openRouterTransport;
};
export const getAiTransport = () => transport;

// ─── Key credit (GET /key, cached 5 minutes) ────────────────────────────

export interface KeyInfo {
  limit: number | null;
  limitRemaining: number | null;
  usage: number;
  usageDaily: number | null;
  usageMonthly: number | null;
}

export type KeyInfoFetcher = (apiKey: string) => Promise<KeyInfo | null>;

const realKeyFetcher: KeyInfoFetcher = async (apiKey) => {
  if (config.isTest || !apiKey) return null;
  const res = await fetch(`${OPENROUTER_BASE}/key`, { headers: { Authorization: `Bearer ${apiKey}`, ...APP_HEADERS }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const d = ((await res.json()) as { data?: Record<string, unknown> }).data ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    limit: num(d.limit),
    limitRemaining: num(d.limit_remaining),
    usage: num(d.usage) ?? 0,
    usageDaily: num(d.usage_daily),
    usageMonthly: num(d.usage_monthly),
  };
};

let keyFetcher: KeyInfoFetcher = realKeyFetcher;
let keyCache: { hash: string; at: number; info: KeyInfo | null } | null = null;
const KEY_TTL_MS = 5 * 60_000;

export const setKeyInfoFetcher = (f: KeyInfoFetcher | null) => {
  keyFetcher = f ?? realKeyFetcher;
  keyCache = null;
};

/** Remaining credit of the key; null when unknown (no key, network error, unlimited keys report limitRemaining null). */
export const getKeyInfo = async (apiKey: string, opts: { fresh?: boolean } = {}): Promise<KeyInfo | null> => {
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
  if (!opts.fresh && keyCache && keyCache.hash === hash && Date.now() - keyCache.at < KEY_TTL_MS) return keyCache.info;
  let info: KeyInfo | null = null;
  try {
    info = await keyFetcher(apiKey);
  } catch {
    info = null;
  }
  keyCache = { hash, at: Date.now(), info };
  return info;
};

/** Lowers the cached remaining credit after a paid call, so the 5-minute cache does not overshoot. */
export const noteKeySpend = (usd: number) => {
  if (keyCache?.info && keyCache.info.limitRemaining !== null) keyCache.info = { ...keyCache.info, limitRemaining: keyCache.info.limitRemaining - usd, usage: keyCache.info.usage + usd };
};

// ─── Model list (public endpoint, cached 1 hour) ────────────────────────

export interface ModelMeta {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per million tokens. */
  promptPerM: number | null;
  completionPerM: number | null;
  /** null = the model does not reason. */
  reasoning: { mandatory: boolean; efforts: string[] } | null;
}

export type ModelsFetcher = () => Promise<ModelMeta[]>;

const realModelsFetcher: ModelsFetcher = async () => {
  if (config.isTest) return [];
  const res = await fetch(`${OPENROUTER_BASE}/models`, { headers: APP_HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new AiError(`UPSTREAM_${res.status}`);
  const rows = ((await res.json()) as { data?: Record<string, unknown>[] }).data ?? [];
  return rows.map((m) => {
    const pricing = (m.pricing ?? {}) as Record<string, unknown>;
    const perM = (v: unknown) => (v === undefined || v === null || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 1e6 * 1000) / 1000);
    const r = m.reasoning as { mandatory?: boolean; supported_efforts?: string[] } | undefined;
    const supportsReasoning = Array.isArray(m.supported_parameters) && (m.supported_parameters as string[]).includes('reasoning');
    return {
      id: String(m.id),
      name: String(m.name ?? m.id),
      contextLength: typeof m.context_length === 'number' ? m.context_length : null,
      promptPerM: perM(pricing.prompt),
      completionPerM: perM(pricing.completion),
      reasoning: r || supportsReasoning ? { mandatory: !!r?.mandatory, efforts: Array.isArray(r?.supported_efforts) ? r!.supported_efforts! : [] } : null,
    };
  });
};

let modelsFetcher: ModelsFetcher = realModelsFetcher;
let modelsCache: { at: number; list: ModelMeta[] } | null = null;
const MODELS_TTL_MS = 60 * 60_000;

export const setModelsFetcher = (f: ModelsFetcher | null) => {
  modelsFetcher = f ?? realModelsFetcher;
  modelsCache = null;
};

export const getModels = async (): Promise<ModelMeta[]> => {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_TTL_MS) return modelsCache.list;
  try {
    const list = await modelsFetcher();
    modelsCache = { at: Date.now(), list };
    return list;
  } catch {
    // Keep serving a stale list; retry in a minute.
    if (modelsCache) {
      modelsCache.at = Date.now() - MODELS_TTL_MS + 60_000;
      return modelsCache.list;
    }
    return [];
  }
};

export const getModelMeta = async (id: string) => (await getModels()).find((m) => m.id === id);

/**
 * Reasoning settings that keep answers cheap: switch reasoning off where the model allows it;
 * where it is mandatory (or the model is unknown) give it the minimum budget (1024) on top of the
 * answer budget and leave the reasoning text out of the response.
 */
export const reasoningFor = (meta: ModelMeta | undefined, answerTokens: number): { reasoning?: ReasoningParam; max_tokens: number } => {
  if (meta && !meta.reasoning) return { max_tokens: answerTokens };
  if (meta?.reasoning && !meta.reasoning.mandatory && meta.reasoning.efforts.includes('none')) return { reasoning: { effort: 'none' }, max_tokens: answerTokens };
  return { reasoning: { max_tokens: 1024, exclude: true }, max_tokens: answerTokens + 1024 };
};

/** Cost estimate (micro-USD) when the provider did not report one (aborted stream). Conservative defaults. */
export const estimateCostMicros = (meta: ModelMeta | undefined, tokensIn: number, tokensOut: number) =>
  Math.ceil(tokensIn * (meta?.promptPerM ?? 3) + tokensOut * (meta?.completionPerM ?? 15));
