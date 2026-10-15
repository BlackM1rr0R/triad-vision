/**
 * Pure MRZ (machine readable zone) parser for ICAO 9303 TD3 passports: two lines of 44 characters.
 * No I/O: `parseMrz` takes the two lines, `findMrzLines` picks them out of raw OCR text.
 *
 * Line 1: P<ISSUER SURNAME<<GIVEN<NAMES<<<<…
 * Line 2: DOCNO(9) C NAT(3) BIRTH(6) C SEX EXPIRY(6) C OPTIONAL(14) C COMPOSITE
 * Check digits: weights 7-3-1 repeating; digits count as their value, A-Z as 10-35, '<' as 0.
 */

export interface MrzChecks {
  documentNumber: boolean;
  birthDate: boolean;
  expiryDate: boolean;
  optionalData: boolean;
  composite: boolean;
}

export interface MrzResult {
  format: 'TD3';
  documentType: string;
  issuingCountry: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  /** YYYY-MM-DD */
  birthDate: string;
  sex: 'M' | 'F' | 'X';
  /** YYYY-MM-DD */
  expiryDate: string;
  optionalData: string;
  /** Every check digit (document number, birth, expiry, composite) is correct. */
  valid: boolean;
  checks: MrzChecks;
  /** The two lines after the O/0-style corrections were applied. */
  lines: [string, string];
}

const WEIGHTS = [7, 3, 1];

const charValue = (ch: string) => {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  return 0; // '<' and anything unexpected
};

/** ICAO 9303 check digit of a field. */
export const checkDigit = (field: string) => {
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += charValue(field[i]) * WEIGHTS[i % 3];
  return sum % 10;
};

const checks = (field: string, digit: string) => {
  const d = toDigits(digit);
  return /^[0-9]$/.test(d) && checkDigit(field) === Number(d);
};

/** OCR confusions in fields that must be digits. */
const DIGIT_FIX: Record<string, string> = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7', A: '4' };
/** OCR confusions in fields that must be letters. */
const LETTER_FIX: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G', '4': 'A' };

export const toDigits = (s: string) => [...s].map((ch) => DIGIT_FIX[ch] ?? ch).join('');
export const toLetters = (s: string) => [...s].map((ch) => LETTER_FIX[ch] ?? ch).join('');

const ymd = (yymmdd: string, kind: 'birth' | 'expiry', now = new Date()) => {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return '';
  const century = kind === 'expiry' ? 2000 : yy <= now.getFullYear() % 100 ? 2000 : 1900;
  return `${century + yy}-${mm}-${dd}`;
};

/** Normalises one MRZ line: uppercase, strips spaces and anything outside the MRZ alphabet, pads/trims to 44. */
export const normaliseLine = (line: string) => {
  const cleaned = line
    .toUpperCase()
    .replace(/[«]/g, '<<')
    .replace(/[\s]/g, '')
    .replace(/[^A-Z0-9<]/g, '<');
  return cleaned.length >= 44 ? cleaned.slice(0, 44) : cleaned.padEnd(44, '<');
};

/** Picks the two MRZ lines out of raw OCR text, or null when there is no plausible pair. */
export const findMrzLines = (text: string): [string, string] | null => {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s/g, '').toUpperCase())
    .filter((l) => l.length >= 30);
  const isLine2 = (l: string) => /^[A-Z0-9<]{30,}$/.test(l) && /[0-9]/.test(l);
  for (let i = 0; i + 1 < lines.length; i++) {
    const l1 = lines[i].replace(/[^A-Z0-9<]/g, '<');
    const l2 = lines[i + 1].replace(/[^A-Z0-9<]/g, '<');
    if (/^P[A-Z<]/.test(l1) && isLine2(l2) && l1.includes('<<')) return [normaliseLine(l1), normaliseLine(l2)];
  }
  // Fallback: the first line that looks like a name line followed by one with digits.
  for (let i = 0; i + 1 < lines.length; i++) {
    const l1 = lines[i].replace(/[^A-Z0-9<]/g, '<');
    const l2 = lines[i + 1].replace(/[^A-Z0-9<]/g, '<');
    if (l1.includes('<<') && !/[0-9]{3}/.test(l1) && isLine2(l2)) return [normaliseLine(l1), normaliseLine(l2)];
  }
  return null;
};

/**
 * Document numbers mix letters and digits, so a blanket O→0 would also turn a real L into 1 (and both
 * readings can satisfy the check digit). Instead, the fewest single-character swaps between the usual
 * confusion pairs (at most 2) that make BOTH the field check digit and the composite check hold are applied.
 */
const fixDocumentNumber = (raw: string, digit: string, compositeOk: (docNo: string) => boolean) => {
  if (checks(raw, digit)) return raw;
  const alternatives = (ch: string) => [DIGIT_FIX[ch], LETTER_FIX[ch]].filter((x): x is string => !!x && x !== ch);
  let frontier = [raw];
  const seen = new Set(frontier);
  for (let depth = 0; depth < 2; depth++) {
    const next: string[] = [];
    for (const candidate of frontier) {
      for (let i = 0; i < candidate.length; i++) {
        for (const alt of alternatives(candidate[i])) {
          const variant = candidate.slice(0, i) + alt + candidate.slice(i + 1);
          if (seen.has(variant)) continue;
          seen.add(variant);
          if (checks(variant, digit) && compositeOk(variant)) return variant;
          next.push(variant);
        }
      }
    }
    frontier = next;
  }
  return raw;
};

/** Parses the two lines of a TD3 MRZ. Never throws; `valid` says whether the check digits hold. */
export const parseMrz = (line1: string, line2: string, now = new Date()): MrzResult => {
  const l1 = normaliseLine(line1);
  const rawL2 = normaliseLine(line2);

  const documentType = toLetters(l1.slice(0, 2)).replace(/</g, '');
  const issuingCountry = toLetters(l1.slice(2, 5)).replace(/</g, '');
  const names = l1.slice(5);
  const [surnamePart, ...givenParts] = names.split('<<');
  const clean = (s: string) => toLetters(s).replace(/</g, ' ').trim().replace(/\s+/g, ' ');
  const surname = clean(surnamePart ?? '');
  const givenNames = clean(givenParts.join('<<'));

  const docCheck = toDigits(rawL2[9]);
  const nationality = toLetters(rawL2.slice(10, 13));
  const birthRaw = toDigits(rawL2.slice(13, 19));
  const birthCheck = toDigits(rawL2[19]);
  const sexRaw = rawL2[20];
  const expiryRaw = toDigits(rawL2.slice(21, 27));
  const expiryCheck = toDigits(rawL2[27]);
  const optional = rawL2.slice(28, 42);
  const optionalCheckRaw = rawL2[42];
  const compositeCheck = toDigits(rawL2[43]);

  const assemble = (docNo: string) => docNo + docCheck + nationality + birthRaw + birthCheck + sexRaw + expiryRaw + expiryCheck + optional + optionalCheckRaw + compositeCheck;
  const compositeOf = (line: string) => line.slice(0, 10) + line.slice(13, 20) + line.slice(21, 43);
  const documentNumber = fixDocumentNumber(rawL2.slice(0, 9), rawL2[9], (docNo) => checks(compositeOf(assemble(docNo)), compositeCheck));
  const l2 = assemble(documentNumber);

  const optionalCheck = optionalCheckRaw === '<' ? '0' : toDigits(optionalCheckRaw);
  const composite = compositeOf(l2);
  const result: MrzChecks = {
    documentNumber: checks(documentNumber, docCheck),
    birthDate: checks(birthRaw, birthCheck),
    expiryDate: checks(expiryRaw, expiryCheck),
    optionalData: optional.replace(/</g, '') === '' ? optionalCheckRaw === '<' || optionalCheck === '0' : checks(optional, optionalCheck),
    composite: checks(composite, compositeCheck),
  };
  const sex: MrzResult['sex'] = sexRaw === 'M' ? 'M' : sexRaw === 'F' ? 'F' : 'X';
  const birthDate = ymd(birthRaw, 'birth', now);
  const expiryDate = ymd(expiryRaw, 'expiry', now);

  return {
    format: 'TD3',
    documentType,
    issuingCountry,
    surname,
    givenNames,
    documentNumber: documentNumber.replace(/</g, ''),
    nationality,
    birthDate,
    sex,
    expiryDate,
    optionalData: optional.replace(/</g, ''),
    valid: result.documentNumber && result.birthDate && result.expiryDate && result.composite && !!birthDate && !!expiryDate,
    checks: result,
    lines: [l1, l2],
  };
};

/** Convenience: OCR text in, parsed MRZ out (null when no MRZ lines are found). */
export const parseMrzText = (text: string, now = new Date()) => {
  const lines = findMrzLines(text);
  return lines ? parseMrz(lines[0], lines[1], now) : null;
};
