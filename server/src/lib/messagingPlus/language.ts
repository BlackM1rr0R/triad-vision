import type { Locale } from '@prisma/client';

/**
 * Cheap, synchronous helpers used while a message is stored (sending never waits for the AI):
 *  - detectLanguage: az / de / en / ru from script, special letters and frequent words;
 *  - findContactDetails: e-mail addresses, phone numbers and messenger links typed into a message.
 */

export const MESSAGE_LANGS = ['az', 'de', 'en', 'ru'] as const satisfies readonly Locale[];
export const isLang = (v: unknown): v is Locale => typeof v === 'string' && (MESSAGE_LANGS as readonly string[]).includes(v);

const WORDS: Record<Locale, string[]> = {
  az: ['və', 'bu', 'üçün', 'salam', 'mən', 'siz', 'sizin', 'biz', 'var', 'yox', 'nə', 'necə', 'çox', 'sağ', 'ol', 'olun', 'zəhmət', 'olmasa', 'sənəd', 'sənədlər', 'iş', 'bəli', 'xeyr', 'təşəkkür', 'edirəm', 'ilə', 'amma', 'hələ', 'artıq', 'gün', 'vaxt', 'nə vaxt', 'işləyirəm', 'ki', 'da', 'də'],
  de: ['und', 'der', 'die', 'das', 'ist', 'nicht', 'ich', 'sie', 'wir', 'mit', 'für', 'bitte', 'danke', 'guten', 'tag', 'ein', 'eine', 'haben', 'sind', 'wann', 'wie', 'auf', 'zu', 'den', 'dem', 'auch', 'noch', 'schon', 'können', 'kann', 'ihr', 'ihre', 'termin', 'arbeit', 'mfg', 'grüße'],
  en: ['the', 'and', 'is', 'are', 'you', 'we', 'please', 'thanks', 'thank', 'hello', 'with', 'for', 'will', 'have', 'has', 'when', 'what', 'how', 'can', 'of', 'to', 'in', 'it', 'this', 'that', 'your', 'our', 'start', 'date', 'job', 'yes', 'no'],
  ru: [],
};
const WORD_SET: Record<Locale, Set<string>> = { az: new Set(WORDS.az), de: new Set(WORDS.de), en: new Set(WORDS.en), ru: new Set() };

/**
 * Best guess of the text's language, or `fallback` (usually the author's UI language) when the text
 * gives no clue (emoji, "ok", numbers). Azerbaijani in Cyrillic script (ә ғ ҹ ҝ ө ү һ) counts as az.
 */
export const detectLanguage = (text: string, fallback: Locale | null = null): Locale | null => {
  const t = text.trim();
  if (!t) return fallback;
  const cyr = (t.match(/[Ѐ-ӿ]/g) ?? []).length;
  const lat = (t.match(/[a-zA-ZÀ-ɏ]/g) ?? []).length;
  if (cyr > lat) return /[әғҹҝөүһӘҒҸҜӨҮҺ]/.test(t) ? 'az' : 'ru';
  if (!lat) return fallback;
  const score: Record<Locale, number> = { az: 0, de: 0, en: 0, ru: 0 };
  score.az += (t.match(/[əğıƏĞİ]/g) ?? []).length * 3 + (t.match(/[şçŞÇ]/g) ?? []).length;
  score.de += (t.match(/[äßÄ]/g) ?? []).length * 3;
  for (const w of t.toLowerCase().split(/[^a-zà-ɏ]+/u).filter(Boolean)) {
    for (const l of ['az', 'de', 'en'] as const) if (WORD_SET[l].has(w)) score[l] += 1;
  }
  const best = (['az', 'de', 'en'] as const).reduce((a, b) => (score[b] > score[a] ? b : a));
  return score[best] > 0 ? best : fallback;
};

// ─── Contact details ───────────────────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Za-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[A-Za-z0-9-]+)*\s*(?:\.|\(dot\)|\[dot\])\s*[A-Za-z]{2,}/i;
/** 7+ digits, optionally with +, spaces, dots, dashes, slashes or brackets between them (e.g. +994 50 111 22 33, 0151/2345678). */
const PHONE = /(?:\+|00)?\d(?:[\s().\-/]{0,3}\d){6,}/;
const MESSENGER = /\b(?:wa\.me|t\.me|telegram\.me|whatsapp\.com|signal\.me|viber:\/\/|skype:)\S*/i;
const HANDLE = /(?:telegram|whatsapp|viber|signal|instagram|insta|tg|ig)\s*[:\-]?\s*@[A-Za-z0-9_]{3,}/i;
/** Dates and times are not phone numbers ("12.10.2026 10:30", "2026-10-12"): removed before looking for numbers. */
const DATES_TIMES = /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|\d{1,2}:\d{2}(?::\d{2})?/g;

export type ContactKind = 'EMAIL' | 'PHONE' | 'MESSENGER';

/**
 * A digit run counts as a phone number when it has 7+ digits and starts with + / 00 / 0 (international or
 * national prefix), or has 9+ digits. Salary ranges ("2800-3400"), postcodes and years stay clean.
 */
const looksLikePhone = (m: string) => {
  const s = m.trim();
  const digits = s.replace(/\D/g, '').length;
  if (digits < 7) return false;
  return /^(?:\+|00|0|\(0)/.test(s) || digits >= 9;
};

/** The kinds of contact details found in a text (empty = clean). */
export const findContactDetails = (text: string): ContactKind[] => {
  const kinds = new Set<ContactKind>();
  if (EMAIL.test(text)) kinds.add('EMAIL');
  if (MESSENGER.test(text) || HANDLE.test(text)) kinds.add('MESSENGER');
  const numbers = text.replace(DATES_TIMES, ' ').match(new RegExp(PHONE.source, 'g')) ?? [];
  if (numbers.some(looksLikePhone)) kinds.add('PHONE');
  return [...kinds];
};

export const hasContactDetails = (text: string) => findContactDetails(text).length > 0;
