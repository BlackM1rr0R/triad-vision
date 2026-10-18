import type { Currency } from './split.js';
import { RAWOT } from './split.js';

/**
 * Parsers for the cells of the team's settlement workbook (pure, no database).
 */

export type Stage = 'NEW' | 'IN_PROGRESS' | 'VISA' | 'REFUSED' | 'CANCELLED';

/** Locale-neutral lower case (the Azerbaijani locale would turn "I" into "ı"). */
const lower = (s: string) => s.normalize('NFC').toLowerCase().replace(/i̇/g, 'i');

/** "viza sonrası", "viza sonrasi", "после визы", "nach dem visum", "after visa". */
const AFTER_VISA = /(viza|visa|vīza)\s*(sonra|sonrası|sonrasi)|после\s+виз|nach\s+(dem\s+)?visum|after\s+(the\s+)?visa/i;

export const currencyOf = (text: string): Currency | null => {
  const t = lower(text);
  if (/(manat|azn|₼)/.test(t)) return 'AZN';
  if (/(euro|eur|€|avro)/.test(t)) return 'EUR';
  return null;
};

export interface ParsedAmount {
  amountCents: number | null;
  currency: Currency | null;
  payAfterVisa: boolean;
  /** Instalments ("2000azn/2000azn viza sonrasi"), in cents. */
  instalments: number[];
  /** Non-numeric content kept as-is ("RAWOT", "XALID", "rawot/atkaz …"). */
  marker: string | null;
  raw: string;
}

const NUM = /\d+(?:[ .,]\d{3})*(?:[.,]\d{1,2})?/g;

const toCents = (s: string) => {
  // "1.500" / "1 500" as thousands, "12,5" / "12.50" as decimals.
  let t = s.replace(/\s/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** "3000 manat", "1500 euro", "4000 azn (viza sonrasi)", "viza sonrasi 2000 euro", "2000azn/2000azn viza sonrasi", "RAWOT". */
export const parseAmount = (input: unknown, defaultCurrency: Currency | null = null): ParsedAmount => {
  const out: ParsedAmount = { amountCents: null, currency: null, payAfterVisa: false, instalments: [], marker: null, raw: '' };
  if (input == null) return out;
  if (typeof input === 'number') {
    out.raw = String(input);
    out.amountCents = Math.round(input * 100);
    out.currency = defaultCurrency;
    return out;
  }
  const raw = String(input).trim();
  out.raw = raw;
  if (!raw) return out;
  out.payAfterVisa = AFTER_VISA.test(raw);
  out.currency = currencyOf(raw) ?? defaultCurrency;
  const nums = (raw.match(NUM) ?? []).map(toCents).filter((n): n is number => n != null);
  if (!nums.length) {
    out.marker = raw;
    return out;
  }
  if (nums.length > 1 && /[/+]/.test(raw)) out.instalments = nums;
  out.amountCents = nums.length > 1 && /[/+]/.test(raw) ? nums.reduce((a, b) => a + b, 0) : nums[0]!;
  return out;
};

/** A share cell: amount, "rawot" marker, or empty. */
export const parseShareCell = (input: unknown, defaultCurrency: Currency): { cents: number; currency: Currency; text?: string } | null => {
  if (input == null || (typeof input === 'string' && !input.trim())) return null;
  if (typeof input === 'string' && lower(input).includes(RAWOT)) return { cents: 0, currency: defaultCurrency, text: RAWOT };
  const a = parseAmount(input, defaultCurrency);
  if (a.amountCents == null) return a.marker ? { cents: 0, currency: defaultCurrency, text: a.marker.slice(0, 40) } : null;
  return { cents: a.amountCents, currency: a.currency ?? defaultCurrency };
};

const REFUSAL = /(atkaz|otkaz|imtina|imtına|r[əe]dd|отказ|ablehn|refus|reject)/i;
const DATE = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/;

const toDate = (m: RegExpMatchArray | null): Date | null => {
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCDate() === d ? date : null;
};

export interface ParsedStatus {
  tlsDate: Date | null;
  visaDate: Date | null;
  refused: boolean;
  /** Stage implied by the text alone. */
  stage: Stage;
  raw: string;
}

/** "TLS/01.06.2026-viza/09.07.2026", "TLS/10.08.2026", "TLS/01.06.2026-saxta atkaz". */
export const parseStatus = (input: unknown): ParsedStatus => {
  const raw = input instanceof Date ? input.toISOString().slice(0, 10) : input == null ? '' : String(input).trim();
  const out: ParsedStatus = { tlsDate: null, visaDate: null, refused: false, stage: 'NEW', raw };
  if (input instanceof Date) {
    out.tlsDate = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
    out.stage = 'IN_PROGRESS';
    return out;
  }
  if (!raw) return out;
  const t = lower(raw);
  const visaIdx = t.search(/(viza|visa|виза)/);
  const tlsPart = visaIdx >= 0 ? raw.slice(0, visaIdx) : raw;
  const visaPart = visaIdx >= 0 ? raw.slice(visaIdx) : '';
  out.tlsDate = toDate(tlsPart.match(DATE));
  out.visaDate = toDate(visaPart.match(DATE));
  out.refused = REFUSAL.test(raw);
  out.stage = out.refused ? 'REFUSED' : out.visaDate ? 'VISA' : out.tlsDate || /tls/i.test(raw) ? 'IN_PROGRESS' : 'NEW';
  return out;
};

/** The status text of a row, like the team writes it: "TLS/01.06.2026-viza/09.07.2026" (+ " atkaz"). */
export const formatStatus = (tls: Date | null, visa: Date | null, stage: Stage) => {
  const d = (x: Date) => `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}.${x.getUTCFullYear()}`;
  const parts: string[] = [];
  if (tls) parts.push(`TLS/${d(tls)}`);
  if (visa) parts.push(`viza/${d(visa)}`);
  let s = parts.join('-');
  if (stage === 'REFUSED') s = s ? `${s}-atkaz` : 'atkaz';
  if (stage === 'CANCELLED') s = s ? `${s}-ləğv` : 'ləğv';
  return s;
};

const LICENCE = /^(B|BE|C|C1|C1E|CE|D|D1|D1E|DE|BC|BCE)$/i;

/** "Niftaliyev Elvin (CE)" → name "Niftaliyev Elvin", licence "CE"; other brackets become notes. */
export const splitName = (input: string) => {
  let name = input;
  let licence: string | null = null;
  const notes: string[] = [];
  name = name.replace(/[({[]\s*([^)}\]]*?)\s*[)}\]]/g, (_m, inner: string) => {
    const v = inner.trim();
    if (!v) return ' ';
    if (!licence && LICENCE.test(v.replace(/[\s/+-]/g, ''))) licence = v.replace(/[\s/+-]/g, '').toUpperCase();
    else notes.push(v);
    return ' ';
  });
  name = name.replace(/\s+/g, ' ').trim();
  return { name, licence, note: notes.join('; ') || null };
};

/**
 * Name key for matching (Azerbaijani / Latin transliterations, order-insensitive):
 * ə/e/a, ş/sh, ç/ch, ğ/gh/g, ı/i, ö/o, ü/u, x/kh, q/g, c/j; doubled letters count once.
 */
export const nameTokens = (input: string) => {
  let s = lower(input)
    .replace(/[({[][^)}\]]*[)}\]]/g, ' ')
    .replace(/ç/g, 'ch')
    .replace(/ş/g, 'sh')
    .replace(/ğ/g, 'gh')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/['-]/g, '');
  s = s
    .replace(/x/g, 'kh')
    .replace(/q/g, 'g')
    .replace(/c(?!h)/g, 'j')
    .replace(/gh/g, 'g')
    // ə is written "e" or "a" in Latin (Məmmədov / Mammadov / Memmedov): treat a and e alike.
    .replace(/a/g, 'e')
    .replace(/([a-z])\1+/g, '$1');
  return s.split(/\s+/).filter(Boolean);
};

export const normaliseName = (input: string) => nameTokens(input).sort().join(' ');

/** 0..1: 1 = same tokens; 0.8 = one name contains the other; 0.5 = shares a long token. */
export const nameScore = (a: string, b: string) => {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  if ([...ta].sort().join(' ') === [...tb].sort().join(' ')) return 1;
  const sa = new Set(ta);
  const sb = new Set(tb);
  const common = ta.filter((t) => sb.has(t));
  if (common.length && (ta.every((t) => sb.has(t)) || tb.every((t) => sa.has(t)))) return 0.8;
  if (common.some((t) => t.length >= 4)) return 0.5;
  return 0;
};

/** E-mail address + password text and similar login data must never be stored. */
export const looksLikeCredential = (input: unknown) => {
  if (input == null) return false;
  const s = typeof input === 'object' && 'text' in (input as object) ? String((input as { text: unknown }).text) : String(input);
  if (/[\w.+-]+@[\w-]+/.test(s)) return true;
  return /(parol|password|passwort|пароль|şifrə|sifre)\s*[:=]/i.test(s);
};

/** Stage from an Excel fill colour (ARGB / RGB hex): green = visa, yellow = in progress, red = refusal, blue = new. */
export const stageFromColor = (argb: string | null | undefined): Stage | null => {
  if (!argb) return null;
  const hex = argb.replace(/^#/, '').slice(-6);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (max < 0.15 || d / (max || 1) < 0.18) return null; // white, grey, black
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 20 || h >= 330) return 'REFUSED';
  if (h < 72) return 'IN_PROGRESS';
  if (h < 170) return 'VISA';
  if (h < 265) return 'NEW';
  return null;
};

export const STAGE_FILL: Record<Stage, string> = {
  VISA: 'FF00B050',
  IN_PROGRESS: 'FFFFFF00',
  REFUSED: 'FFFF0000',
  NEW: 'FF00B0F0',
  CANCELLED: 'FFBFBFBF',
};

/** Fuzzy header key: lower-case ASCII without spaces / punctuation ("Müştəri adı:" → "musteriadi"). */
export const headerKey = (input: unknown) =>
  lower(String(input ?? ''))
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9а-я]/g, '');
