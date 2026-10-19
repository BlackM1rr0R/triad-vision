import type { Locale } from '@prisma/client';
import { aiComplete, CHEAP_MODEL, type AiCompleteFailure, type AiPart } from '../ai/complete.js';
import { isoDate, str, today } from './input.js';

/**
 * "Explain my German letter": the client photographs or uploads a letter from an authority or company,
 * the model explains it in the client's language (sender, gist, deadlines, steps, documents to bring,
 * consequences, glossary, urgency). One CHEAP_MODEL call, CLIENT scope (the client's daily cost cap).
 *
 * Storage (no schema change): the letter becomes a VaultDocument of the client (kind OTHER) with the
 * explanation in `ocr.letter` — the vault is the client's own document store and works without a case.
 */

export const LETTER_PURPOSE = 'letter-explain';
export const URGENCY = ['low', 'medium', 'high'] as const;
export type Urgency = (typeof URGENCY)[number];

export interface LetterExplanation {
  sender: { name: string | null; kind: 'authority' | 'company' | 'other' };
  subject: string | null;
  letterDate: string | null;
  reference: string | null;
  summary: string;
  deadlines: { date: string; what: string }[];
  steps: string[];
  documents: string[];
  consequences: string | null;
  glossary: { term: string; meaning: string }[];
  urgency: Urgency;
  language: string | null;
}

export interface StoredLetter {
  explanation: LetterExplanation;
  locale: Locale;
  model: string;
  costUsd: number;
  at: string;
  sentAt?: string;
  sentCaseId?: string;
  sentDocumentId?: string;
}

const LANG_NAME: Record<Locale, string> = { az: 'Azerbaijani', de: 'German (simple language)', en: 'English', ru: 'Russian' };

const systemFor = (locale: Locale, now: Date) => `You help a migrant (from Azerbaijan, living in or moving to Germany) understand an official letter.
Today is ${today(now)}. Write every text value in ${LANG_NAME[locale]}, in plain, friendly words (no legal jargon). German terms stay German in "term".
Reply with ONE JSON object only, no prose, no code fence:
{"sender":{"name":"authority or company name","kind":"authority|company|other"},"subject":"what the letter is, max 8 words","letterDate":"YYYY-MM-DD","reference":"Aktenzeichen / file number","summary":"2-3 plain sentences: what it is about and what it means for the reader","deadlines":[{"date":"YYYY-MM-DD","what":"what must happen by then"}],"steps":["step 1","step 2"],"documents":["document to bring or send"],"consequences":"what happens if the letter is ignored","glossary":[{"term":"German word from the letter","meaning":"short explanation"}],"urgency":"low|medium|high","language":"language of the letter"}
Rules: deadlines only with a real date (compute it when the letter says e.g. "within 2 weeks of the letter date"); at most 6 steps, 8 documents, 8 glossary terms; urgency high = deadline within 14 days or money / residence status at risk.
If the image is not a letter or not readable, return {"summary":"…explain that it cannot be read…","urgency":"low"} with empty lists.`;

const list = (v: unknown, max: number, len = 300) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter((x): x is string => !!x).slice(0, max) : []);

/** Cleans the model JSON (null when there is no summary at all). */
export const parseLetter = (json: Record<string, unknown>): LetterExplanation | null => {
  const summary = str(json.summary, 1200);
  if (!summary) return null;
  const sender = (json.sender && typeof json.sender === 'object' ? json.sender : {}) as Record<string, unknown>;
  const kind = sender.kind === 'authority' || sender.kind === 'company' ? sender.kind : 'other';
  const deadlines = (Array.isArray(json.deadlines) ? json.deadlines : [])
    .map((d) => {
      const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
      const date = isoDate(o.date);
      return date ? { date, what: str(o.what, 300) ?? '' } : null;
    })
    .filter((d): d is { date: string; what: string } => !!d)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const glossary = (Array.isArray(json.glossary) ? json.glossary : [])
    .map((g) => {
      const o = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
      const term = str(o.term, 80);
      const meaning = str(o.meaning, 300);
      return term && meaning ? { term, meaning } : null;
    })
    .filter((g): g is { term: string; meaning: string } => !!g)
    .slice(0, 8);
  return {
    sender: { name: str(sender.name, 160), kind },
    subject: str(json.subject, 120),
    letterDate: isoDate(json.letterDate),
    reference: str(json.reference, 80),
    summary,
    deadlines,
    steps: list(json.steps, 6),
    documents: list(json.documents, 8, 200),
    consequences: str(json.consequences, 600),
    glossary,
    urgency: (URGENCY as readonly string[]).includes(json.urgency as string) ? (json.urgency as Urgency) : 'medium',
    language: str(json.language, 40),
  };
};

export type ExplainResult = { ok: true; explanation: LetterExplanation; model: string; costUsd: number } | { ok: false; reason: AiCompleteFailure };

export const explainLetter = async (userId: string, locale: Locale, parts: AiPart[], now = new Date()): Promise<ExplainResult> => {
  const res = await aiComplete({
    userId,
    scope: 'CLIENT',
    purpose: LETTER_PURPOSE,
    model: CHEAP_MODEL,
    system: systemFor(locale, now),
    input: [{ type: 'text', text: 'Explain this letter.' }, ...parts],
    maxTokens: 1300,
    json: true,
    timeoutMs: 45_000,
  });
  if (!res.ok) return { ok: false, reason: res.reason };
  const explanation = res.json ? parseLetter(res.json) : null;
  if (!explanation) return { ok: false, reason: 'BAD_OUTPUT' };
  return { ok: true, explanation, model: res.model, costUsd: res.costUsd };
};

/** The letter record stored in VaultDocument.ocr (null for other vault documents). */
export const letterOf = (ocr: unknown): StoredLetter | null => {
  const l = ocr && typeof ocr === 'object' ? (ocr as { letter?: unknown }).letter : null;
  return l && typeof l === 'object' && (l as StoredLetter).explanation ? (l as StoredLetter) : null;
};

const HEAD: Record<Locale, { title: string; deadlines: string; steps: string; docs: string; note: string }> = {
  az: { title: 'Məktubun izahı (AI)', deadlines: 'Son tarixlər', steps: 'Nə etməli', docs: 'Lazım olan sənədlər', note: 'Zəhmət olmasa məktuba baxın və kömək edin.' },
  de: { title: 'Brieferklärung (KI)', deadlines: 'Fristen', steps: 'Was zu tun ist', docs: 'Benötigte Unterlagen', note: 'Bitte schauen Sie sich den Brief an und helfen Sie mir.' },
  en: { title: 'Letter explanation (AI)', deadlines: 'Deadlines', steps: 'What to do', docs: 'Documents needed', note: 'Please have a look at the letter and help me.' },
  ru: { title: 'Разбор письма (AI)', deadlines: 'Сроки', steps: 'Что сделать', docs: 'Нужные документы', note: 'Пожалуйста, посмотрите письмо и помогите мне.' },
};

/** Case message text for "Menecerə göndər" (max 4000 characters, the message limit). */
export const managerMessage = (l: StoredLetter, fileName: string, note?: string | null) => {
  const h = HEAD[l.locale] ?? HEAD.az;
  const e = l.explanation;
  const parts = [
    `${h.title}: ${e.subject ?? fileName}${e.sender.name ? ` — ${e.sender.name}` : ''}`,
    e.summary,
    e.deadlines.length ? `${h.deadlines}: ${e.deadlines.map((d) => `${d.date} ${d.what}`.trim()).join('; ')}` : '',
    e.steps.length ? `${h.steps}: ${e.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}` : '',
    e.documents.length ? `${h.docs}: ${e.documents.join(', ')}` : '',
    note?.trim() || h.note,
    `(${fileName})`,
  ];
  return parts.filter(Boolean).join('\n\n').slice(0, 4000);
};
