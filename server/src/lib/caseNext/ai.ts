import crypto from 'node:crypto';
import type { Locale } from '@prisma/client';
import { aiComplete, CHEAP_MODEL } from '../ai/complete.js';
import { str } from '../aiDocs/input.js';
import { aiAvailability, type AiMeta } from '../ai/features/caseAi/runs.js';
import type { CaseFacts, NextStepView } from './nextStep.js';

/**
 * AI layer of the next-step card (cheap model): a 1–2 sentence plain-language explanation of where the case
 * stands and its main risk (staff language) and a ready message draft for the client (client language) for
 * the top action. The deterministic steps never depend on it. Answers are cached per case state for 6 h.
 */

export const PURPOSE = 'case-next-step';

const LANG: Record<Locale, string> = { az: 'Azerbaijani', de: 'German (formal "Sie")', en: 'English', ru: 'Russian (formal "вы")' };

export interface NextStepAi {
  explanation: string | null;
  risk: string | null;
  draft: { body: string; locale: Locale } | null;
  ai: AiMeta;
  cached?: boolean;
}

const SYSTEM = `You help a case manager of Triad Vision (agency placing Azerbaijani workers with German employers; German national visa via the German Embassy Baku).
You get the current state of ONE visa case and the next steps a rule engine computed. Do not invent other steps, dates or facts.
Reply with ONE JSON object only: {"explanation":"…","risk":"…","clientMessage":"…"}
- explanation: 1–2 short sentences in plain language (the staff language given) — where the case stands and what happens next.
- risk: one short sentence (staff language) with the main risk for the visa or the timeline, or "" if none.
- clientMessage: a short, friendly, formal message to the client in the client language for the FIRST step (what we need from them or what happens now). Address the client by first name, no placeholders, no promises about the embassy decision, sign as "Triad Vision". If the first step needs nothing from the client, inform them briefly about the progress.`;

const cache = new Map<string, { at: number; value: NextStepAi }>();
const TTL = 6 * 3600 * 1000;

export const clearNextStepAiCache = () => cache.clear();

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** What the model gets: no documents, no contact data — only the case state and the rule output. */
export const aiInput = (f: CaseFacts, view: NextStepView, staffLocale: Locale) => ({
  staffLanguage: LANG[staffLocale],
  clientLanguage: LANG[f.client.locale],
  clientFirstName: f.client.firstName,
  case: {
    number: f.number,
    status: f.status,
    visaType: f.visaType,
    daysInStatus: f.daysInStatus,
    typicalDaysInStatus: f.typicalDays,
    appointmentAt: day(f.appointmentAt),
    passportExpiry: day(f.passportExpiry),
    plannedEntry: day(f.plannedEntry),
    contractSigned: !!f.contract?.signedAt,
    lastClientActivity: day(f.lastClientActivityAt),
    openTasks: f.openTasks,
    documents: f.requirements.map((r) => ({ title: r.title.en || r.title.de, stage: r.stage, required: r.required, latest: r.docs[0]?.status ?? 'NONE' })),
  },
  steps: view.steps.map((s) => ({ code: s.code, params: s.params, items: s.items.map((i) => i.en || i.de), actions: s.actions.map((a) => a.id) })),
});

export const nextStepAi = async (f: CaseFacts, view: NextStepView, user: { id: string; locale: Locale }): Promise<NextStepAi> => {
  const input = aiInput(f, view, user.locale);
  const key = crypto.createHash('sha1').update(JSON.stringify({ id: f.id, input })).digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.value, cached: true };

  const avail = await aiAvailability(user.id);
  if (!avail.available) return { explanation: null, risk: null, draft: null, ai: { status: 'skipped', reason: avail.reason ?? 'DISABLED' } };
  const res = await aiComplete({ userId: user.id, scope: 'ADMIN', purpose: PURPOSE, model: CHEAP_MODEL, system: SYSTEM, input: JSON.stringify(input), maxTokens: 600, json: true, timeoutMs: 25_000 });
  if (!res.ok || !res.json) return { explanation: null, risk: null, draft: null, ai: { status: 'skipped', reason: res.ok ? 'BAD_OUTPUT' : res.reason } };
  const explanation = str(res.json.explanation, 600) || null;
  const risk = str(res.json.risk, 300) || null;
  const raw = res.json.clientMessage;
  // Keep the line breaks of the letter (str() would collapse them).
  const body = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000) : '';
  const value: NextStepAi = {
    explanation,
    risk,
    draft: body ? { body, locale: f.client.locale } : null,
    ai: { status: 'done', model: res.model, costUsd: res.costUsd },
  };
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
};
