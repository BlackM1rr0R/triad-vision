import { nameLatin, nameMatches, nameSkeleton } from '../aiDocs/docCheck.js';

/**
 * Name transliteration checker (no AI): an Azerbaijani name → the Latin form in the passport's machine readable
 * zone (MRZ), the other spellings one meets in Germany, and a comparison with the MRZ name on file.
 *
 * MRZ rules — ICAO Doc 9303 Part 3 (8th ed.), section 6 "Transliteration of multinational Latin-based characters":
 *   Ç → C, Ğ → G, İ / ı (I without dot) → I, Ş → S, Ö → "OE or O", Ü → "UE or UXX or U".
 * (table re-checked in the ICAO PDF 2026-11-17). Ə (schwa) is not in the ICAO table; Azerbaijani passports in
 * practice write it as A (MƏMMƏDOV → MAMMADOV), and Ö / Ü as O / U — observed practice, no published Azerbaijani
 * specification found, so the UI says "usually" and asks to check the own passport. That is what we show as the expected MRZ form, with OE / UE as the ICAO alternative. X and Q are
 * ordinary A–Z letters and stay (XƏLİLOV → XALILOV). Only A–Z and "<" exist in the MRZ.
 *
 * The comparison reuses the tolerant name helpers of lib/aiDocs/docCheck (consonant skeleton, plain Latin).
 */

export type Variant = 'mrz' | 'icaoAlt' | 'english' | 'german';

/** Azerbaijani letters that change, per variant (lower case in, upper case out). */
const MAPS: Record<Variant, Record<string, string>> = {
  // As printed in an Azerbaijani passport MRZ.
  mrz: { ə: 'A', ş: 'S', ç: 'C', ğ: 'G', ı: 'I', i: 'I', ö: 'O', ü: 'U' },
  // ICAO's other allowed forms for Ö / Ü.
  icaoAlt: { ə: 'A', ş: 'S', ç: 'C', ğ: 'G', ı: 'I', i: 'I', ö: 'OE', ü: 'UE' },
  // English-style phonetic spelling (often in older documents, e-mails, airline bookings by hand).
  english: { ə: 'A', ş: 'SH', ç: 'CH', ğ: 'GH', ı: 'I', i: 'I', ö: 'O', ü: 'U', x: 'KH', c: 'J', q: 'G' },
  // How a German reads / writes it by ear (letters from German offices, colleagues): never for official forms.
  german: { ə: 'Ä', ş: 'SCH', ç: 'TSCH', ğ: 'G', ı: 'I', i: 'I', ö: 'Ö', ü: 'Ü', x: 'CH', c: 'DSCH', y: 'J', v: 'W', q: 'G' },
};

/** The letters explained in the UI: Azerbaijani letter → each variant. */
export const SPECIAL_LETTERS = ['ə', 'ş', 'ç', 'ğ', 'ı', 'ö', 'ü', 'x', 'q', 'c', 'y'] as const;

/** Latin, Azerbaijani-aware lower case ("İ" → "i", "I" → "ı" only when the text is Azerbaijani-looking). */
const lower = (s: string) => s.normalize('NFC').replace(/İ/g, 'i').toLocaleLowerCase('az');

const apply = (s: string, map: Record<string, string>) =>
  lower(s)
    .split('')
    .map((ch) => map[ch] ?? ch.toUpperCase())
    .join('');

/** Plain A–Z MRZ form of one name part: diacritics stripped, anything else (hyphen, apostrophe, space) → space. */
export const toMrz = (s: string, variant: 'mrz' | 'icaoAlt' = 'mrz') =>
  apply(s, MAPS[variant])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z]+/g, ' ')
    .trim();

/** The MRZ name field of a TD3 passport: SURNAME<<GIVEN<NAMES, padded / truncated to 39 characters. */
export const mrzNameField = (lastName: string, firstName: string) => {
  const raw = `${toMrz(lastName).replace(/ /g, '<')}<<${toMrz(firstName).replace(/ /g, '<')}`;
  return { field: raw.length > 39 ? raw.slice(0, 39) : raw.padEnd(39, '<'), truncated: raw.length > 39 };
};

/** "MAMMADOV" → "Mammadov" (each word / hyphen part capitalised). */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

export const spellings = (name: string) => {
  const forms = (Object.keys(MAPS) as Variant[]).map((v) => ({
    variant: v,
    value: v === 'mrz' || v === 'icaoAlt' ? toMrz(name, v) : apply(name, MAPS[v]).replace(/\s+/g, ' ').trim(),
  }));
  // Drop variants that are the same as one listed before (e.g. no Ö / Ü → the ICAO alternative is the MRZ form).
  const seen = new Set<string>();
  return forms
    .filter((f) => {
      const k = f.value.toUpperCase();
      if (!f.value || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((f) => ({ ...f, display: f.variant === 'mrz' || f.variant === 'icaoAlt' ? f.value : titleCase(f.value) }));
};

/** The special letters in a name with their forms (for the explanation table). */
export const lettersIn = (name: string) => {
  const l = lower(name);
  return SPECIAL_LETTERS.filter((ch) => l.includes(ch)).map((ch) => ({
    letter: ch,
    mrz: MAPS.mrz[ch] ?? ch.toUpperCase(),
    icaoAlt: MAPS.icaoAlt[ch] ?? ch.toUpperCase(),
    english: MAPS.english[ch] ?? ch.toUpperCase(),
    german: MAPS.german[ch] ?? ch.toUpperCase(),
    /** Ə has no row in the ICAO table: the A is the Azerbaijani passport practice. */
    notInIcao: ch === 'ə',
  }));
};

export type NameStatus = 'exact' | 'spelling' | 'mismatch';

/**
 * Typed (or profile) name vs. the MRZ name read from the passport:
 *   exact     — the expected MRZ form equals the passport MRZ (surname and given names)
 *   spelling  — same person by the tolerant comparison, but the letters differ: forms must use the passport spelling
 *   mismatch  — the names do not match
 */
export const compareWithMrz = (name: { firstName: string; lastName: string }, mrz: { surname: string; givenNames: string }) => {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
  const expected = { surname: toMrz(name.lastName), givenNames: toMrz(name.firstName) };
  const alt = { surname: toMrz(name.lastName, 'icaoAlt'), givenNames: toMrz(name.firstName, 'icaoAlt') };
  const passport = { surname: norm(mrz.surname), givenNames: norm(mrz.givenNames) };
  const same = (a: string, b: string) => a === b || a.replace(/ /g, '') === b.replace(/ /g, '');
  const surnameExact = same(expected.surname, passport.surname) || same(alt.surname, passport.surname);
  // The MRZ may hold more given names than typed (a middle name) — the typed ones must come first.
  const givenExact =
    same(expected.givenNames, passport.givenNames) || same(alt.givenNames, passport.givenNames) || (!!expected.givenNames && passport.givenNames.startsWith(`${expected.givenNames} `));
  const surnameSimilar = surnameExact || nameMatches(`${mrz.surname}`, { firstName: name.firstName, lastName: name.lastName });
  const firstTyped = nameLatin(name.firstName);
  const firstWords = mrz.givenNames.split(/\s+/).map(nameLatin).filter(Boolean);
  const givenSimilar =
    givenExact || !firstTyped || firstWords.some((w) => w === firstTyped || (nameSkeleton(w) === nameSkeleton(name.firstName) && Math.abs(w.length - firstTyped.length) <= 2));
  const status: NameStatus = surnameExact && givenExact ? 'exact' : surnameSimilar && givenSimilar ? 'spelling' : 'mismatch';
  return {
    status,
    expected,
    passport,
    surname: surnameExact ? 'exact' : surnameSimilar ? 'spelling' : 'mismatch',
    givenNames: givenExact ? 'exact' : givenSimilar ? 'spelling' : 'mismatch',
  } as const;
};

/** Everything the checker shows for a typed name (and the comparison when an MRZ name is on file). */
export const analyseName = (name: { firstName: string; lastName: string }, mrz?: { surname: string; givenNames: string } | null) => {
  const full = `${name.firstName} ${name.lastName}`.trim();
  return {
    firstName: spellings(name.firstName),
    lastName: spellings(name.lastName),
    letters: lettersIn(full),
    mrzField: mrzNameField(name.lastName, name.firstName),
    comparison: mrz && (mrz.surname || mrz.givenNames) && (name.firstName.trim() || name.lastName.trim()) ? compareWithMrz(name, mrz) : null,
  };
};
