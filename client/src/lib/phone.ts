/**
 * Phone number normaliser (E.164-ish): "+994 50 123-45-67" → "+994501234567".
 *
 * Mirror: server/src/lib/phone.ts (same code, no imports, so both sides give the same answer;
 * tests/unit/phone.test.ts checks that they agree).
 *
 * Rules, in order:
 *  1. Spaces (also non-breaking), dashes, dots, slashes and brackets are removed. "+49 (0) 151…" drops the "(0)".
 *  2. "00" at the start is the international prefix: "0049…" → "+49…".
 *  3. "+…" must be "+" and 8–15 digits (first digit 1–9). A trunk zero after +994 / +49 is dropped
 *     ("+994 050…" → "+99450…"); +994 numbers must have exactly 9 national digits.
 *  4. Without "+":
 *     - "994" + 9 digits → "+994…";
 *     - context Germany ("DE"): "0…" → "+49…", "49…" (11–14 digits) → "+49…";
 *     - otherwise an Azerbaijani local number (0 + a known area / operator code + 7 digits, or the
 *       same 9 digits without the 0) → "+994…";
 *     - anything else is refused as AMBIGUOUS (we do not guess the country).
 *
 * The result never invents digits: it only re-formats what was typed.
 */

export type PhoneCountry = 'AZ' | 'DE';

export type PhoneParseError = 'EMPTY' | 'INVALID_CHARS' | 'INVALID_LENGTH' | 'AMBIGUOUS';

export type PhoneParse = { ok: true; value: string } | { ok: false; reason: PhoneParseError };

/** First two national digits of Azerbaijani numbers: mobile operators (10, 50, 51, 55, 60, 70, 77, 99), Baku 12, regions. */
const AZ_PREFIXES = new Set(['10', '12', '18', '20', '21', '22', '23', '24', '25', '26', '36', '50', '51', '55', '60', '70', '77', '99']);

const isAzNational = (digits: string) => digits.length === 9 && AZ_PREFIXES.has(digits.slice(0, 2));

const finish = (e164: string): PhoneParse => {
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return { ok: false, reason: 'INVALID_LENGTH' };
  // +994: exactly 9 national digits.
  if (e164.startsWith('+994') && e164.length !== 13) return { ok: false, reason: 'INVALID_LENGTH' };
  return { ok: true, value: e164 };
};

export const parsePhone = (raw: string | null | undefined, opts: { country?: PhoneCountry | null } = {}): PhoneParse => {
  if (raw == null) return { ok: false, reason: 'EMPTY' };
  let s = String(raw).trim();
  if (!s) return { ok: false, reason: 'EMPTY' };
  // "+49 (0) 151 …": the bracketed trunk zero is not dialled from abroad.
  s = s.replace(/^(\+\d{1,3})[\s ]*\(0\)/, '$1');
  s = s.replace(/[\s  -​ \-‐-―.()/[\]]/g, '');
  if (!s) return { ok: false, reason: 'EMPTY' };
  if (!/^\+?\d+$/.test(s)) return { ok: false, reason: 'INVALID_CHARS' };
  if (s.startsWith('00')) s = `+${s.slice(2)}`;

  if (s.startsWith('+')) {
    // Trunk zero typed after the country code: "+994 050 …", "+49 0151 …".
    if (/^\+9940\d{9}$/.test(s)) s = `+994${s.slice(5)}`;
    else if (/^\+490\d{6,13}$/.test(s)) s = `+49${s.slice(4)}`;
    return finish(s);
  }

  const country = opts.country ?? null;
  if (/^994\d{9}$/.test(s)) return finish(`+${s}`);
  if (country === 'DE') {
    if (/^0[1-9]\d{5,12}$/.test(s)) return finish(`+49${s.slice(1)}`);
    if (/^49[1-9]\d{8,11}$/.test(s)) return finish(`+${s}`);
    return { ok: false, reason: 'AMBIGUOUS' };
  }
  if (s.startsWith('0') && isAzNational(s.slice(1))) return finish(`+994${s.slice(1)}`);
  if (isAzNational(s)) return finish(`+994${s}`);
  return { ok: false, reason: 'AMBIGUOUS' };
};

/** The normalised number, or null when it cannot be read unambiguously. */
export const normalizePhoneNumber = (raw: string | null | undefined, opts: { country?: PhoneCountry | null } = {}): string | null => {
  const r = parsePhone(raw, opts);
  return r.ok ? r.value : null;
};

/** Which country a user's local numbers belong to: employer accounts are German, candidates and agents Azerbaijani, staff unknown. */
export const phoneCountryForRole = (role: string | null | undefined): PhoneCountry | null => {
  if (role === 'COMPANY') return 'DE';
  if (role === 'CLIENT' || role === 'AGENT') return 'AZ';
  return null;
};
