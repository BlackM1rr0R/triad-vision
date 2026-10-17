import type { CvLang, LanguageLevel } from './schema.js';

/** Fixed wording of the generated documents (German by default, English as an option). */
export const CV_LABELS = {
  de: {
    lebenslauf: 'Lebenslauf',
    europass: 'Lebenslauf',
    personal: 'Persönliche Daten',
    name: 'Name',
    address: 'Anschrift',
    residence: 'Wohnort',
    phone: 'Telefon',
    email: 'E-Mail',
    birthDate: 'Geburtsdatum',
    birthYear: 'Jahrgang',
    nationality: 'Staatsangehörigkeit',
    profile: 'Kurzprofil',
    experience: 'Berufserfahrung',
    education: 'Ausbildung',
    languages: 'Sprachkenntnisse',
    skills: 'Kenntnisse',
    certificates: 'Weiterbildungen und Zertifikate',
    driving: 'Führerschein',
    drivingClasses: 'Klasse',
    interests: 'Interessen',
    present: 'heute',
    since: 'seit',
    motherTongue: 'Muttersprache(n)',
    otherLanguages: 'Weitere Sprachen',
    understanding: 'Verstehen',
    speaking: 'Sprechen',
    writing: 'Schreiben',
    listening: 'Hören',
    reading: 'Lesen',
    production: 'Zusammenhängendes Sprechen',
    interaction: 'An Gesprächen teilnehmen',
    gridProduction: 'Zusammen- hängend sprechen',
    gridInteraction: 'An Gesprächen teilnehmen',
    cefrNote: 'Niveaustufen: A1/A2 elementare, B1/B2 selbständige, C1/C2 kompetente Sprachverwendung (GER).',
    native: 'Muttersprache',
    field: 'Fachrichtung',
    yearsOld: 'Jahre',
    age: 'Alter',
    signature: 'Unterschrift',
    page: 'Seite',
    anonymised: 'Anonymisiertes Profil – vermittelt durch Triad Vision',
  },
  en: {
    lebenslauf: 'Curriculum Vitae',
    europass: 'Curriculum Vitae',
    personal: 'Personal details',
    name: 'Name',
    address: 'Address',
    residence: 'Place of residence',
    phone: 'Phone',
    email: 'E-mail',
    birthDate: 'Date of birth',
    birthYear: 'Year of birth',
    nationality: 'Nationality',
    profile: 'Profile',
    experience: 'Work experience',
    education: 'Education and training',
    languages: 'Language skills',
    skills: 'Skills',
    certificates: 'Further training and certificates',
    driving: 'Driving licence',
    drivingClasses: 'Category',
    interests: 'Interests',
    present: 'present',
    since: 'since',
    motherTongue: 'Mother tongue(s)',
    otherLanguages: 'Other languages',
    understanding: 'Understanding',
    speaking: 'Speaking',
    writing: 'Writing',
    listening: 'Listening',
    reading: 'Reading',
    production: 'Spoken production',
    interaction: 'Spoken interaction',
    gridProduction: 'Spoken production',
    gridInteraction: 'Spoken interaction',
    cefrNote: 'Levels: A1/A2 basic user, B1/B2 independent user, C1/C2 proficient user (CEFR).',
    native: 'Mother tongue',
    field: 'Field',
    yearsOld: 'years',
    age: 'Age',
    signature: 'Signature',
    page: 'Page',
    anonymised: 'Anonymised profile – presented by Triad Vision',
  },
} as const satisfies Record<CvLang, Record<string, string>>;

export type CvLabels = (typeof CV_LABELS)[CvLang];

const LEVEL_WORDS: Record<CvLang, Record<Exclude<LanguageLevel, 'native'>, string>> = {
  de: { A1: 'Grundkenntnisse', A2: 'Grundkenntnisse', B1: 'Gute Kenntnisse', B2: 'Sehr gute Kenntnisse', C1: 'Fließend', C2: 'Verhandlungssicher' },
  en: { A1: 'Basic', A2: 'Elementary', B1: 'Intermediate', B2: 'Upper intermediate', C1: 'Advanced', C2: 'Proficient' },
};

export const levelLabel = (level: LanguageLevel, lang: CvLang) =>
  level === 'native' ? CV_LABELS[lang].native : `${level} – ${LEVEL_WORDS[lang][level]}`;

export const EDUCATION_LABEL: Record<CvLang, Record<string, string>> = {
  de: { school: 'Schulabschluss', vocational: 'Berufsausbildung', university: 'Hochschulabschluss' },
  en: { school: 'School leaving certificate', vocational: 'Vocational training', university: 'University degree' },
};

/** Nationality as typed in the profile or read from the passport (ISO alpha-3) → adjective. */
const NATIONALITY: Record<string, { de: string; en: string }> = {
  AZE: { de: 'aserbaidschanisch', en: 'Azerbaijani' },
  RUS: { de: 'russisch', en: 'Russian' },
  UKR: { de: 'ukrainisch', en: 'Ukrainian' },
  GEO: { de: 'georgisch', en: 'Georgian' },
  TUR: { de: 'türkisch', en: 'Turkish' },
  KAZ: { de: 'kasachisch', en: 'Kazakh' },
  UZB: { de: 'usbekisch', en: 'Uzbek' },
  KGZ: { de: 'kirgisisch', en: 'Kyrgyz' },
  TKM: { de: 'turkmenisch', en: 'Turkmen' },
  BLR: { de: 'belarussisch', en: 'Belarusian' },
  ARM: { de: 'armenisch', en: 'Armenian' },
  MDA: { de: 'moldauisch', en: 'Moldovan' },
  IRN: { de: 'iranisch', en: 'Iranian' },
  IND: { de: 'indisch', en: 'Indian' },
};
const NATIONALITY_ALIASES: Record<string, string> = {
  AZ: 'AZE', azerbaijan: 'AZE', azərbaycan: 'AZE', azerbaycan: 'AZE', azerbaijani: 'AZE', азербайджан: 'AZE', aserbaidschan: 'AZE',
  RU: 'RUS', russia: 'RUS', россия: 'RUS', rusiya: 'RUS',
  UA: 'UKR', ukraine: 'UKR', украина: 'UKR', ukrayna: 'UKR',
  GE: 'GEO', georgia: 'GEO', gürcüstan: 'GEO', грузия: 'GEO',
  TR: 'TUR', turkey: 'TUR', türkiyə: 'TUR', türkiye: 'TUR', турция: 'TUR',
  KZ: 'KAZ', kazakhstan: 'KAZ', qazaxıstan: 'KAZ', казахстан: 'KAZ',
  UZ: 'UZB', uzbekistan: 'UZB', özbəkistan: 'UZB', узбекистан: 'UZB',
};

const nationalityCode = (raw: string): string | null => {
  const t = raw.trim();
  if (NATIONALITY[t.toUpperCase()]) return t.toUpperCase();
  return NATIONALITY_ALIASES[t] ?? NATIONALITY_ALIASES[t.toLowerCase()] ?? NATIONALITY_ALIASES[t.toUpperCase()] ?? null;
};

export const nationalityLabel = (raw: string | null | undefined, lang: CvLang) => {
  if (!raw?.trim()) return '';
  const code = nationalityCode(raw);
  return code ? NATIONALITY[code][lang] : raw.trim();
};

/** Mother tongue derived from the nationality (used by prefill only). */
export const nativeLanguageFor = (raw: string | null | undefined): string | null => {
  const code = raw ? nationalityCode(raw) : null;
  return ({ AZE: 'Aserbaidschanisch', RUS: 'Russisch', UKR: 'Ukrainisch', GEO: 'Georgisch', TUR: 'Türkisch', KAZ: 'Kasachisch', UZB: 'Usbekisch' } as Record<string, string>)[code ?? ''] ?? null;
};

/** Language names typed in German are shown in English for an English CV (and vice versa when known). */
const LANGUAGE_EN: Record<string, string> = {
  deutsch: 'German', englisch: 'English', russisch: 'Russian', aserbaidschanisch: 'Azerbaijani', türkisch: 'Turkish', ukrainisch: 'Ukrainian',
  georgisch: 'Georgian', kasachisch: 'Kazakh', usbekisch: 'Uzbek', französisch: 'French', spanisch: 'Spanish', arabisch: 'Arabic', persisch: 'Persian',
};
export const languageName = (name: string, lang: CvLang) => (lang === 'en' ? (LANGUAGE_EN[name.trim().toLowerCase()] ?? name) : name);

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** TT.MM.JJJJ (dates are stored as UTC midnight). */
export const fmtDate = (d: Date | null | undefined, lang: CvLang = 'de') => {
  if (!d) return '';
  const dd = pad2(d.getUTCDate());
  const mm = pad2(d.getUTCMonth() + 1);
  return lang === 'en' ? `${dd}/${mm}/${d.getUTCFullYear()}` : `${dd}.${mm}.${d.getUTCFullYear()}`;
};

/** 'YYYY-MM' → 'MM/JJJJ' */
export const fmtMonth = (m: string | null | undefined) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '');

export const fmtRange = (from: string | null, to: string | null, lang: CvLang, current = false) => {
  const L = CV_LABELS[lang];
  if (!from && !to) return '';
  if (!from) return fmtMonth(to);
  if (!to) return current ? `${fmtMonth(from)} – ${L.present}` : fmtMonth(from);
  if (from === to) return fmtMonth(from);
  return `${fmtMonth(from)} – ${fmtMonth(to)}`;
};

export const ageOn = (birth: Date, now = new Date()) => {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
};

/** Sort key: newest first; current positions on top. */
export const byNewest = <T extends { from: string | null; to: string | null }>(items: T[], currentWhenNoTo = true) =>
  [...items].sort((a, b) => {
    const ta = a.to ?? (currentWhenNoTo ? '9999-99' : (a.from ?? ''));
    const tb = b.to ?? (currentWhenNoTo ? '9999-99' : (b.from ?? ''));
    if (ta !== tb) return tb.localeCompare(ta);
    return (b.from ?? '').localeCompare(a.from ?? '');
  });
