/**
 * Anschreiben (cover letter) templates — pure part: job types, placeholders, filling and German date wording.
 * Deterministic text only (no AI): a template is German text with {{placeholders}} and optional segments
 * [[ … ]] that are dropped when a placeholder inside them has no value (e.g. no company name known).
 */

export const COVER_JOB_TYPES = ['FAHRER', 'PFLEGE', 'HANDWERK', 'GASTRO', 'BUERO_IT', 'AUSBILDUNG', 'GENERAL'] as const;
export type CoverJobType = (typeof COVER_JOB_TYPES)[number];

/** Every placeholder a template may use (admin editor shows this list with the descriptions). */
export const COVER_PLACEHOLDERS = [
  'firma',
  'position',
  'ort',
  'datum',
  'name',
  'vorname',
  'nachname',
  'anschrift',
  'telefon',
  'email',
  'beruf',
  'berufserfahrung',
  'jahre',
  'deutschniveau',
  'eintritt',
  'fuehrerschein',
  'letzte_taetigkeit',
  'ausbildung',
  'kenntnisse',
  'sprachen',
] as const;
export type CoverPlaceholder = (typeof COVER_PLACEHOLDERS)[number];
export type CoverValues = Partial<Record<CoverPlaceholder, string | null | undefined>>;

/** Short German description + example of each placeholder (shown to admins). */
export const PLACEHOLDER_HELP: Record<CoverPlaceholder, { de: string; example: string }> = {
  firma: { de: 'Arbeitgeber aus der Stellenanzeige', example: 'Muster Logistik GmbH' },
  position: { de: 'Stellenbezeichnung (ohne „(m/w/d)“)', example: 'Berufskraftfahrer CE' },
  ort: { de: 'Arbeitsort der Stelle', example: 'Hamburg' },
  datum: { de: 'Heutiges Datum, ausgeschrieben', example: '15. November 2026' },
  name: { de: 'Vor- und Nachname der Bewerberin / des Bewerbers', example: 'Aysel Məmmədova' },
  vorname: { de: 'Vorname', example: 'Aysel' },
  nachname: { de: 'Nachname', example: 'Məmmədova' },
  anschrift: { de: 'Anschrift der Bewerberin / des Bewerbers', example: 'Nizami küç. 10, Baku' },
  telefon: { de: 'Telefonnummer', example: '+994 50 123 45 67' },
  email: { de: 'E-Mail-Adresse', example: 'aysel@example.com' },
  beruf: { de: 'Beruf (wie angegeben)', example: 'Kraftfahrer' },
  berufserfahrung: { de: 'Berufserfahrung in Worten (leer bei 0)', example: 'fünf Jahre' },
  jahre: { de: 'Berufserfahrung als Zahl (leer bei 0)', example: '5' },
  deutschniveau: { de: 'Deutschniveau nach GER (leer ohne Deutsch)', example: 'B1' },
  eintritt: { de: 'Frühester Eintritt („ab März 2027“, „ab sofort“ oder „nach Absprache“)', example: 'ab März 2027' },
  fuehrerschein: { de: 'Führerscheinklassen', example: 'B, C, CE' },
  letzte_taetigkeit: { de: 'Letzte Tätigkeit laut Lebenslauf', example: 'Kraftfahrer bei Azərsun Holding' },
  ausbildung: { de: 'Letzter Abschluss laut Lebenslauf', example: 'Berufsausbildung (Kfz-Technik)' },
  kenntnisse: { de: 'Bis zu sechs Kenntnisse aus dem Lebenslauf', example: 'Ladungssicherung, Tachograph, Staplerschein' },
  sprachen: { de: 'Sprachen mit Niveau', example: 'Aserbaidschanisch (Muttersprache), Deutsch (B1)' },
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
const SEGMENT_RE = /\[\[([\s\S]*?)\]\]/g;

const isKnown = (k: string): k is CoverPlaceholder => (COVER_PLACEHOLDERS as readonly string[]).includes(k);
const valueOf = (values: CoverValues, key: string) => {
  if (!isKnown(key)) return null;
  const v = values[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

export interface FillResult {
  text: string;
  /** Known placeholders used outside optional segments that had no value (left empty). */
  missing: CoverPlaceholder[];
  /** Placeholder names that are not in COVER_PLACEHOLDERS (left in the text as typed). */
  unknown: string[];
}

/** Whitespace tidy-up after filling: single spaces, no space before punctuation, at most one blank line. */
export const tidy = (s: string) =>
  s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,;:!?)])/g, '$1')
    .replace(/\( +/g, '(')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Fills a template: optional segments first (kept without the brackets when every known placeholder inside has a
 * value, dropped otherwise), then the remaining placeholders. Unknown placeholders stay visible so an admin's
 * typo is noticed in the preview.
 */
export const fillTemplate = (template: string, values: CoverValues): FillResult => {
  const missing = new Set<CoverPlaceholder>();
  const unknown = new Set<string>();
  const withSegments = template.replace(SEGMENT_RE, (_m, inner: string) => {
    const keys = [...inner.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
    return keys.every((k) => !isKnown(k) || valueOf(values, k) !== null) ? inner : '';
  });
  const text = withSegments.replace(PLACEHOLDER_RE, (m, key: string) => {
    if (!isKnown(key)) {
      unknown.add(key);
      return m;
    }
    const v = valueOf(values, key);
    if (v === null) missing.add(key);
    return v ?? '';
  });
  return { text: tidy(text), missing: [...missing], unknown: [...unknown] };
};

// ─── German date wording ────────────────────────────────────────────────

export const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Calendar day in a time zone (the letter is dated where the applicant is: Baku by default). */
const dayParts = (d: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
};

/** "15. November 2026" (DIN 5008 allows the written-out month in letters). */
export const germanLongDate = (d: Date, timeZone = 'Asia/Baku') => {
  const p = dayParts(d, timeZone);
  return `${p.d}. ${MONTHS_DE[p.m - 1]} ${p.y}`;
};

/** 'YYYY-MM' → "März 2027"; anything else → ''. */
export const germanMonthYear = (month: string | null | undefined) => {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month ?? '');
  return m ? `${MONTHS_DE[Number(m[2]) - 1]} ${m[1]}` : '';
};

/** Earliest start: a future month → "ab März 2027", this month or earlier → "ab sofort", none → "nach Absprache". */
export const startText = (month: string | null | undefined, now = new Date(), timeZone = 'Asia/Baku') => {
  const label = germanMonthYear(month);
  if (!label) return 'nach Absprache';
  const p = dayParts(now, timeZone);
  const current = `${p.y}-${String(p.m).padStart(2, '0')}`;
  return month! <= current ? 'ab sofort' : `ab ${label}`;
};

/** Removes the gender suffix of German job titles: "Koch (m/w/d)" → "Koch". */
export const cleanPosition = (title: string | null | undefined) =>
  (title ?? '')
    .replace(/\s*[([]\s*(?:m|w|d|f|x|i|div|all)(?:\s*[/|,]\s*(?:m|w|d|f|x|i|div))+\s*[)\]]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

// ─── Job type of a listing ──────────────────────────────────────────────

const RULES: [CoverJobType, RegExp][] = [
  ['FAHRER', /fahrer|kraftfahr|lkw|bus(?:fahrer)?\b|kurier|zusteller|driver|sürücü|водител|trucker|\bce\b|logistik.*fahr/i],
  ['PFLEGE', /pflege|kranken|altenpfleg|pfleger|nurse|caregiver|tibb bacı|медсест|sanitäter|betreuung|hebamme|ergotherap|physiotherap/i],
  ['HANDWERK', /elektr|mechani|mechatron|schwei|tischler|schreiner|maurer|zimmerer|dachdecker|maler|installateur|anlagenmechan|klempner|monteur|handwerk|bau(?:arbeiter|helfer|stelle)|fliesen|metallbau|kfz|schlosser|elektrik|qaynaq|сварщ|слесар|строит|usta/i],
  ['GASTRO', /koch|köch|küche|kellner|service(?:kraft|mitarbeiter)|restaurant|gastro|hotel|barista|bäcker|konditor|housekeeping|zimmer|aşpaz|повар|ofisiant/i],
  ['BUERO_IT', /büro|kaufm|sachbearbeit|buchhalt|verwaltung|assistenz|sekretär|software|entwickl|developer|informatik|\bit\b|admin(?:istrator)?|devops|daten|data|programm|frontend|backend|fullstack|engineer/i],
];

/** Template to start from: Ausbildung listings first, then keyword rules on the title and profession. */
export const detectJobType = (x: { jobType?: string | null; title?: string | null; profession?: string | null }): CoverJobType => {
  if (x.jobType === 'ausbildung' || /ausbildung|azubi|auszubildend/i.test(x.title ?? '')) return 'AUSBILDUNG';
  const hay = `${x.title ?? ''} ${x.profession ?? ''}`;
  return RULES.find(([, re]) => re.test(hay))?.[0] ?? 'GENERAL';
};
