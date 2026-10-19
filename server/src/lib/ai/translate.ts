import { prisma } from '../../db.js';
import { AiError, getAiTransport, getModelMeta, estimateCostMicros, noteKeySpend, reasoningFor, type ChatRequest } from './openrouter.js';
import { getAiSettings, resolveApiKey } from './settings.js';
import { checkLimits, monthSpentUsd } from './limits.js';

/**
 * Automatic translation of the site's four-language texts (az / de / en / ru) with the AI core.
 *
 * `translateFields` fills only the languages that are missing (or listed in `overwrite`) from one filled
 * source language. It goes through the same transport, key, limits and cost recording as the assistant:
 * the call is charged to the staff member's ADMIN usage (an archived "AI tərcümə" conversation whose
 * hidden `tool` rows carry the cost), so the monthly budget and the admin daily limit cover it.
 *
 * It never throws: without a key, over budget, on a timeout or an unusable answer it copies the source
 * text into the missing languages and reports `autoTranslated: false` with the reason.
 */

export const LANGS = ['az', 'de', 'en', 'ru'] as const;
export type Lang = (typeof LANGS)[number];
export type L10nInput = Partial<Record<Lang, string | null | undefined>>;
export type L10nFull = Record<Lang, string>;

/** Cheap model for this kind of task. */
export const TRANSLATE_MODEL = 'anthropic/claude-haiku-5.5';
export const TRANSLATE_TIMEOUT_MS = 8_000;
/** Title of the archived conversation the translation costs are booked on. */
export const TRANSLATE_CONVERSATION_TITLE = 'AI tərcümə';

export interface TranslateOptions {
  /** Staff member the cost is charged to (ADMIN scope). Without it only the monthly budget is checked and nothing is recorded. */
  userId?: string | null;
  /** Preferred source language (used when it is filled); otherwise az → de → en → ru. */
  source?: Lang;
  /** Languages to translate even when they already have text (the "Translate" button). */
  overwrite?: Lang[];
  /** Short hint for the model: what the text is (e.g. "document requirement for a German visa application"). */
  context?: string;
  timeoutMs?: number;
  /** false: on failure leave the missing languages as they are instead of copying the source. Default true. */
  copyOnFailure?: boolean;
}

export type TranslateFailure = 'NOTHING_TO_TRANSLATE' | 'NO_SOURCE' | 'NO_API_KEY' | 'MONTHLY_BUDGET' | 'DAILY_COST' | 'KEY_CREDIT' | 'DISABLED' | 'DAILY_MESSAGES' | 'TIMEOUT' | 'UPSTREAM' | 'BAD_OUTPUT';

export interface TranslateManyResult<K extends string> {
  values: Record<K, L10nFull>;
  /** Languages filled by the model, per field. */
  translated: Record<K, Lang[]>;
  source: Lang | null;
  autoTranslated: boolean;
  reason?: TranslateFailure;
  costUsd?: number;
}

export interface TranslateResult extends L10nFull {
  autoTranslated: boolean;
  /** Languages filled by the model. */
  translated: Lang[];
  source: Lang | null;
  reason?: TranslateFailure;
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const full = (v: L10nInput | null | undefined): L10nFull => ({ az: clean(v?.az), de: clean(v?.de), en: clean(v?.en), ru: clean(v?.ru) });

export const SYSTEM_PROMPT = `You translate short texts of Triad Vision, an agency that brings workers from Azerbaijan to Germany (work visas, Ausbildung, recognition of qualifications, family reunion).
Languages: az = Azerbaijani (Latin script), de = German, en = English, ru = Russian.
Rules:
- Translate faithfully and precisely; keep the meaning, tone and length. Do not add explanations.
- Keep visa and legal terms exact. German official terms stay in German where the reader needs them for the authorities, e.g. Anerkennung, Anerkennungsbescheid, Vorabzustimmung, Blaue Karte EU, Chancenkarte, Aufenthaltstitel, Arbeitsvertrag, Zeugnisbewertung (ZAB), Meldebescheinigung, Sperrkonto, Krankenversicherung, VIDEX, Code 95, Berufskraftfahrer; in az / en / ru you may add a short translation in parentheses the first time.
- Keep paragraph signs and numbers (§18a, §19c, §16d), abbreviations, codes, e-mail addresses, URLs, placeholders like {{name}} and line breaks exactly as in the source.
- Answer with strict JSON only, no markdown: {"<field>": {"<lang>": "<text>"}} with exactly the requested fields and languages.`;

/** Parses the model's JSON answer (tolerates a code fence or text around the object). */
export const parseModelJson = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Finds (or opens) the archived conversation the translation costs of a user are booked on. */
const usageConversation = async (userId: string) => {
  const existing = await prisma.aiConversation.findFirst({ where: { userId, scope: 'ADMIN', archived: true, title: TRANSLATE_CONVERSATION_TITLE }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.aiConversation.create({ data: { userId, scope: 'ADMIN', archived: true, title: TRANSLATE_CONVERSATION_TITLE, model: TRANSLATE_MODEL }, select: { id: true } });
  return created.id;
};

const recordUsage = async (userId: string, r: { tokensIn: number; tokensOut: number; costMicros: number; fields: string[]; langs: Lang[] }) => {
  try {
    const conversationId = await usageConversation(userId);
    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'tool', // hidden from the chat view, counted by the usage limits and the dashboard
        toolName: 'translate',
        content: JSON.stringify({ fields: r.fields, langs: r.langs }).slice(0, 2000),
        model: TRANSLATE_MODEL,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costMicros: r.costMicros,
      },
    });
    noteKeySpend(r.costMicros / 1e6);
  } catch {
    /* recording must never break the request */
  }
};

const pickSource = (fields: Record<string, L10nFull>, preferred?: Lang): Lang | null => {
  const filled = (l: Lang) => Object.values(fields).some((f) => !!f[l]);
  if (preferred && filled(preferred)) return preferred;
  return LANGS.find(filled) ?? null;
};

/**
 * Several four-language fields at once (one model call), e.g. a title and a description.
 * Each field keeps the languages it has; missing ones (and `overwrite`) are translated from the source.
 */
export const translateMany = async <K extends string>(input: Record<K, L10nInput | null | undefined>, opts: TranslateOptions = {}): Promise<TranslateManyResult<K>> => {
  const keys = Object.keys(input) as K[];
  const values = Object.fromEntries(keys.map((k) => [k, full(input[k])])) as Record<K, L10nFull>;
  const translated = Object.fromEntries(keys.map((k) => [k, [] as Lang[]])) as Record<K, Lang[]>;
  const source = pickSource(values, opts.source);
  if (!source) return { values, translated, source: null, autoTranslated: false, reason: 'NO_SOURCE' };

  // Per field: which languages to produce (a field without source text is left alone).
  const wanted = Object.fromEntries(
    keys.map((k) => {
      const f = values[k];
      if (!f[source]) return [k, [] as Lang[]];
      return [k, LANGS.filter((l) => l !== source && (!f[l] || opts.overwrite?.includes(l)))];
    }),
  ) as Record<K, Lang[]>;
  const work = keys.filter((k) => wanted[k].length);
  if (!work.length) return { values, translated, source, autoTranslated: false, reason: 'NOTHING_TO_TRANSLATE' };

  const fail = (reason: TranslateFailure): TranslateManyResult<K> => {
    if (opts.copyOnFailure !== false) {
      for (const k of work) for (const l of wanted[k]) if (!values[k][l]) values[k][l] = values[k][source];
    }
    return { values, translated, source, autoTranslated: false, reason };
  };

  try {
    const settings = await getAiSettings();
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return fail('NO_API_KEY');
    const monthOnly = async () => ((await monthSpentUsd()) >= settings.monthlyBudgetUsd ? ('MONTHLY_BUDGET' as const) : null);
    // The full check may ask OpenRouter for the key's credit (cached 5 min); never wait long for it.
    const limit = opts.userId
      ? await Promise.race([checkLimits({ id: opts.userId }, 'ADMIN', settings, apiKey, { countingNewMessage: false }), new Promise<'SLOW'>((r) => setTimeout(() => r('SLOW'), 3000))]).then((v) => (v === 'SLOW' ? monthOnly() : v))
      : await monthOnly();
    if (limit) return fail(limit);

    const request = Object.fromEntries(work.map((k) => [k, { source: values[k][source], into: wanted[k] }]));
    const sourceChars = work.reduce((a, k) => a + values[k][source].length, 0);
    const langCount = work.reduce((a, k) => a + wanted[k].length, 0);
    const answerTokens = Math.min(4000, 200 + Math.ceil((sourceChars / 2.5) * langCount));
    const meta = await Promise.race([getModelMeta(TRANSLATE_MODEL), new Promise<undefined>((r) => setTimeout(() => r(undefined), 1500))]);
    const req: ChatRequest = {
      model: TRANSLATE_MODEL,
      temperature: 0,
      ...reasoningFor(meta, answerTokens),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${opts.context ? `Context: ${opts.context}\n` : ''}Source language: ${source}\nTranslate each field's "source" text into the languages listed in "into":\n${JSON.stringify(request)}`,
        },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TRANSLATE_TIMEOUT_MS);
    let content = '';
    let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null = null;
    try {
      for await (const chunk of getAiTransport()(req, { signal: controller.signal, apiKey })) {
        if (chunk.error) throw new AiError('UPSTREAM_ERROR', chunk.error.message);
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) content += text;
        if (chunk.usage) usage = chunk.usage;
        if (controller.signal.aborted) throw new AiError('ABORTED');
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof AiError && err.code === 'ABORTED')) return fail('TIMEOUT');
      return fail('UPSTREAM');
    } finally {
      clearTimeout(timer);
    }

    const tokensIn = usage?.prompt_tokens ?? Math.ceil((SYSTEM_PROMPT.length + JSON.stringify(request).length) / 4);
    const tokensOut = usage?.completion_tokens ?? Math.ceil(content.length / 4);
    const costMicros = typeof usage?.cost === 'number' ? Math.round(usage.cost * 1e6) : estimateCostMicros(meta, tokensIn, tokensOut);
    if (opts.userId) await recordUsage(opts.userId, { tokensIn, tokensOut, costMicros, fields: work, langs: [...new Set(work.flatMap((k) => wanted[k]))] });

    const parsed = parseModelJson(content);
    if (!parsed) return fail('BAD_OUTPUT');
    let any = false;
    for (const k of work) {
      const out = parsed[k];
      if (!out || typeof out !== 'object') continue;
      for (const l of wanted[k]) {
        const text = clean((out as Record<string, unknown>)[l]);
        if (!text) continue;
        values[k][l] = text;
        translated[k].push(l);
        any = true;
      }
    }
    if (!any) return fail('BAD_OUTPUT');
    // Languages the model skipped get the source text (or stay as they were).
    if (opts.copyOnFailure !== false) for (const k of work) for (const l of wanted[k]) if (!values[k][l]) values[k][l] = values[k][source];
    return { values, translated, source, autoTranslated: true, costUsd: costMicros / 1e6 };
  } catch {
    return fail('UPSTREAM');
  }
};

/** One four-language text: returns all four languages, the missing ones filled from the source. */
export const translateFields = async (fields: L10nInput, opts: TranslateOptions = {}): Promise<TranslateResult> => {
  const r = await translateMany({ text: fields }, opts);
  return { ...r.values.text, autoTranslated: r.autoTranslated, translated: r.translated.text, source: r.source, ...(r.reason ? { reason: r.reason } : {}) };
};

// ─── "AI translated" marker stored inside a four-language JSON value ────────
// `{ az, de, en, ru, _ai: ['de', 'ru'] }`: the languages filled by the model and not edited by a person since.
// Readers pick a language by key, so the extra key is harmless; copies into other records drop it (stripAiFlag).

export const AI_FLAG = '_ai';

export const aiLangsOf = (v: unknown): Lang[] => {
  const raw = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>)[AI_FLAG] : null;
  return Array.isArray(raw) ? LANGS.filter((l) => raw.includes(l)) : [];
};

export const withAiFlag = (values: L10nFull, ai: Lang[]): L10nFull & { _ai?: Lang[] } => {
  const langs = LANGS.filter((l) => ai.includes(l) && values[l]);
  return langs.length ? { ...values, [AI_FLAG]: langs } : { ...values };
};

export const stripAiFlag = <T>(v: T): T => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !(AI_FLAG in v)) return v;
  const { [AI_FLAG]: _drop, ...rest } = v as Record<string, unknown>;
  return rest as T;
};

/**
 * Markers after a person saved new texts: a language stays marked only while its text is unchanged;
 * languages just filled by the model are added.
 */
export const mergeAiFlag = (previous: unknown, next: L10nFull, translated: Lang[]): Lang[] => {
  const prev = full(previous as L10nInput);
  const kept = aiLangsOf(previous).filter((l) => prev[l] === next[l]);
  return LANGS.filter((l) => kept.includes(l) || translated.includes(l));
};

/** True when some language of a filled text is empty (worth a translation). */
export const hasMissing = (v: L10nInput | null | undefined) => {
  const f = full(v);
  return LANGS.some((l) => f[l]) && LANGS.some((l) => !f[l]);
};
