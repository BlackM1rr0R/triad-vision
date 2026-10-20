import type { AiScope, Locale } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../../db.js';
import { aiComplete, type AiCompleteFailure, type AiCompleteOptions } from '../../complete.js';
import { getAiSettings, resolveApiKey } from '../../settings.js';
import { checkLimits } from '../../limits.js';

/**
 * Shared pieces of the employer AI tools (candidate profile for employers, vacancy writer):
 * the feature toggle, the availability check for the UI, one JSON call with a single BAD_OUTPUT retry
 * and the scrubbing of contact data out of free text before anything goes to the model.
 */

export const EMPLOYER_TOOLS_KEY = 'ai.employerTools';

export const employerToolsSchema = z.object({
  /** Employers may use the vacancy writer in their portal (staff always may, if AI is configured). */
  companyEnabled: z.boolean().catch(true),
});
export type EmployerToolsSettings = z.infer<typeof employerToolsSchema>;

export const getEmployerTools = async (): Promise<EmployerToolsSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: EMPLOYER_TOOLS_KEY } });
  return employerToolsSchema.parse(row?.value && typeof row.value === 'object' ? row.value : {});
};

export const saveEmployerTools = async (patch: Partial<EmployerToolsSettings>) => {
  const value = { ...(await getEmployerTools()), ...patch };
  await prisma.setting.upsert({ where: { key: EMPLOYER_TOOLS_KEY }, update: { value }, create: { key: EMPLOYER_TOOLS_KEY, value } });
  return value;
};

/** Whether the AI buttons can work right now for this user (no model call, so it costs nothing). */
export const employerAiStatus = async (userId: string, scope: AiScope, opts: { company?: boolean } = {}) => {
  const settings = await getAiSettings();
  const apiKey = resolveApiKey(settings);
  if (!apiKey) return { available: false, reason: 'NO_API_KEY' as const };
  if (opts.company && !(await getEmployerTools()).companyEnabled) return { available: false, reason: 'DISABLED' as const };
  const reason = await Promise.race([
    checkLimits({ id: userId }, scope, settings, apiKey, { countingNewMessage: false }),
    new Promise<null>((r) => setTimeout(() => r(null), 3000)),
  ]);
  return reason ? { available: false, reason } : { available: true as const };
};

export type JsonCallResult<T> = { ok: true; value: T; costUsd: number; model: string } | { ok: false; reason: AiCompleteFailure };

const RETRY_NOTE =
  '\n\nIMPORTANT: your previous answer could not be used. Answer again with ONE strict JSON object exactly in the requested shape — no markdown, no code fence, no text before or after it.';

/**
 * One JSON call; when the answer is not JSON or `normalise` rejects it, the model is asked once more
 * (BAD_OUTPUT retry). Both attempts are charged.
 */
export const jsonCall = async <T>(opts: Omit<AiCompleteOptions, 'json'>, normalise: (json: Record<string, unknown>) => T | null): Promise<JsonCallResult<T>> => {
  let cost = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await aiComplete({ ...opts, json: true, system: attempt ? `${opts.system}${RETRY_NOTE}` : opts.system });
    if (!r.ok && r.reason !== 'BAD_OUTPUT') return { ok: false, reason: r.reason };
    if (r.ok) {
      cost += r.costUsd;
      const value = r.json ? normalise(r.json) : null;
      if (value) return { ok: true, value, costUsd: cost, model: r.model };
    }
  }
  return { ok: false, reason: 'BAD_OUTPUT' };
};

// ─── Text helpers ───────────────────────────────────────────────────────

/** Plain string from model JSON, single spaces kept, trimmed and capped. */
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');
export const strList = (v: unknown, maxItems: number, maxLen: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, maxLen))
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, maxItems);

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// 7+ digits with optional separators / leading + (phone numbers); years and salaries stay.
const PHONE_RE = /(?:\+|00)?\d[\d\s()./-]{6,}\d/g;
const PASSPORT_RE = /\b[A-Z]{1,2}\d{6,9}\b/g;
const YEAR_RANGE_RE = /^(?:19|20)\d\d(?:[./-]\d{1,2})?\s*[-/]\s*(?:19|20)\d\d(?:[./-]\d{1,2})?$/;

/** Removes e-mail addresses, phone numbers, passport-like numbers and the given words (e.g. the last name). */
export const scrub = (text: string, words: string[] = []) => {
  let out = text
    .replace(EMAIL_RE, '[…]')
    .replace(PASSPORT_RE, '[…]')
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 7 && !YEAR_RANGE_RE.test(m.trim()) ? '[…]' : m));
  for (const w of words.map((x) => x.trim()).filter((x) => x.length >= 2)) {
    // Whole words only (a short name must not cut into other words).
    out = out.replace(new RegExp(`(?<!\\p{L})${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'giu'), `${w[0].toUpperCase()}.`);
  }
  return out;
};

export const LANG_NAMES: Record<Locale, string> = { az: 'Azerbaijani', de: 'German', en: 'English', ru: 'Russian' };
