/**
 * Candidate ↔ vacancy matching. Pure functions (no database), so the same score is computed on
 * apply, in the staff candidate list and for vacancy suggestions.
 *
 * Score 0–100 = weighted sum of: profession similarity, German level vs the minimum, experience vs
 * the minimum, driving-licence coverage and fit for the vacancy's visa category. A criterion the
 * vacancy does not ask for counts as fully met. `gaps` lists what is missing, for the UI
 * ("needs German B1").
 */

export const GERMAN_LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type GermanLevel = (typeof GERMAN_LEVELS)[number];

/** 0 = none … 6 = C2; unknown / empty counts as "none". */
export const germanRank = (level: string | null | undefined): number => {
  if (!level) return 0;
  const i = GERMAN_LEVELS.findIndex((l) => l.toLowerCase() === level.trim().toLowerCase());
  return i < 0 ? 0 : i;
};

// ─── Professions ────────────────────────────────────────────────────────

/** Folds case, diacritics and the Azerbaijani/German special letters; keeps Cyrillic. */
export const normaliseText = (s: string) =>
  s
    .toLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ä/g, 'a')
    .replace(/ß/g, 'ss')
    .replace(/ё/g, 'е')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

type Family = 'driving' | 'care' | 'hospitality' | 'construction' | 'logistics' | 'technical' | 'it' | 'agriculture' | 'cleaning';

/** Canonical professions with synonyms in AZ / DE / EN / RU (written naturally; normalised on load). */
const PROFESSION_DEFS: { key: string; family: Family; synonyms: string[] }[] = [
  {
    key: 'truck_driver',
    family: 'driving',
    synonyms: [
      'truck driver', 'lorry driver', 'hgv driver', 'driver', 'professional driver',
      'lkw-fahrer', 'lkw fahrer', 'berufskraftfahrer', 'kraftfahrer', 'fernfahrer', 'fahrer',
      'sürücü', 'yük maşını sürücüsü', 'yük avtomobili sürücüsü', 'tır sürücüsü', 'fura sürücüsü',
      'водитель', 'водитель грузовика', 'водитель грузового автомобиля', 'дальнобойщик', 'водитель категории ce',
    ],
  },
  {
    key: 'bus_driver',
    family: 'driving',
    synonyms: ['bus driver', 'busfahrer', 'omnibusfahrer', 'avtobus sürücüsü', 'водитель автобуса'],
  },
  {
    key: 'courier',
    family: 'driving',
    synonyms: ['courier', 'delivery driver', 'kurier', 'kurierfahrer', 'paketzusteller', 'zusteller', 'kuryer', 'çatdırılma sürücüsü', 'курьер', 'водитель-курьер'],
  },
  {
    key: 'nurse',
    family: 'care',
    synonyms: [
      'nurse', 'nursing assistant', 'caregiver', 'care worker', 'elderly care',
      'pflegekraft', 'pflegefachkraft', 'pflegefachmann', 'pflegefachfrau', 'krankenpfleger', 'krankenschwester', 'altenpfleger', 'pflegehelfer', 'pfleger',
      'tibb bacısı', 'tibb qardaşı', 'şəfqət bacısı', 'baxıcı', 'sanitar',
      'медсестра', 'медбрат', 'медицинская сестра', 'санитар', 'сиделка',
    ],
  },
  {
    key: 'cook',
    family: 'hospitality',
    synonyms: ['cook', 'chef', 'kitchen assistant', 'koch', 'köchin', 'küchenhilfe', 'beikoch', 'aşpaz', 'aşbaz', 'mətbəx köməkçisi', 'повар', 'шеф-повар', 'помощник повара'],
  },
  {
    key: 'waiter',
    family: 'hospitality',
    synonyms: ['waiter', 'waitress', 'kellner', 'kellnerin', 'servicekraft', 'restaurantfachmann', 'ofisiant', 'официант', 'официантка'],
  },
  {
    key: 'hotel',
    family: 'hospitality',
    synonyms: ['housekeeping', 'room attendant', 'hotel staff', 'zimmermädchen', 'hotelfachmann', 'hotelfachfrau', 'otel işçisi', 'qulluqçu', 'горничная', 'работник отеля'],
  },
  {
    key: 'baker',
    family: 'hospitality',
    synonyms: ['baker', 'bäcker', 'çörəkçi', 'пекарь'],
  },
  {
    key: 'butcher',
    family: 'hospitality',
    synonyms: ['butcher', 'fleischer', 'metzger', 'qəssab', 'мясник', 'обвальщик'],
  },
  {
    key: 'welder',
    family: 'construction',
    synonyms: ['welder', 'schweißer', 'schweisser', 'qaynaqçı', 'elektrik qaynaqçısı', 'сварщик', 'электросварщик'],
  },
  {
    key: 'construction_worker',
    family: 'construction',
    synonyms: [
      'construction worker', 'builder', 'bricklayer', 'mason', 'labourer',
      'bauarbeiter', 'bauhelfer', 'maurer', 'betonbauer', 'trockenbauer',
      'inşaat fəhləsi', 'inşaatçı', 'inşaat işçisi', 'bənna', 'fəhlə',
      'строитель', 'разнорабочий', 'каменщик', 'бетонщик',
    ],
  },
  {
    key: 'electrician',
    family: 'technical',
    synonyms: ['electrician', 'elektriker', 'elektroniker', 'elektroinstallateur', 'elektrik', 'elektrik ustası', 'elektrik montajçısı', 'электрик', 'электромонтажник'],
  },
  {
    key: 'plumber',
    family: 'technical',
    synonyms: ['plumber', 'pipefitter', 'anlagenmechaniker', 'installateur', 'klempner', 'santexnik', 'сантехник'],
  },
  {
    key: 'mechanic',
    family: 'technical',
    synonyms: ['mechanic', 'car mechanic', 'kfz-mechatroniker', 'kfz mechatroniker', 'mechatroniker', 'mechaniker', 'mexanik', 'avtomexanik', 'avtoçilingər', 'механик', 'автомеханик', 'автослесарь'],
  },
  {
    key: 'carpenter',
    family: 'construction',
    synonyms: ['carpenter', 'joiner', 'tischler', 'schreiner', 'zimmermann', 'zimmerer', 'dülgər', 'xarrat', 'плотник', 'столяр'],
  },
  {
    key: 'painter',
    family: 'construction',
    synonyms: ['painter', 'decorator', 'maler', 'lackierer', 'malyar', 'rəngsaz', 'маляр'],
  },
  {
    key: 'warehouse',
    family: 'logistics',
    synonyms: [
      'warehouse worker', 'warehouse', 'picker', 'forklift driver', 'storekeeper',
      'lagerarbeiter', 'lagerist', 'lagerhelfer', 'kommissionierer', 'fachkraft für lagerlogistik', 'staplerfahrer', 'gabelstaplerfahrer',
      'anbar işçisi', 'anbardar', 'yükləyici', 'forklift sürücüsü',
      'кладовщик', 'складской работник', 'работник склада', 'комплектовщик', 'грузчик', 'водитель погрузчика',
    ],
  },
  {
    key: 'it',
    family: 'it',
    synonyms: [
      'it', 'it specialist', 'software developer', 'developer', 'programmer', 'software engineer', 'system administrator', 'devops',
      'softwareentwickler', 'informatiker', 'fachinformatiker', 'anwendungsentwickler',
      'proqramçı', 'programçı', 'proqramist', 'it mütəxəssisi', 'sistem administratoru',
      'программист', 'разработчик', 'системный администратор', 'айти',
    ],
  },
  {
    key: 'agriculture',
    family: 'agriculture',
    synonyms: ['farm worker', 'harvest worker', 'seasonal worker', 'erntehelfer', 'landwirt', 'saisonarbeiter', 'saisonkraft', 'kənd təsərrüfatı işçisi', 'fermer', 'mövsümi işçi', 'сельхозработник', 'фермер', 'сезонный работник'],
  },
  {
    key: 'cleaner',
    family: 'cleaning',
    synonyms: ['cleaner', 'janitor', 'reinigungskraft', 'gebäudereiniger', 'raumpfleger', 'təmizlikçi', 'xadimə', 'уборщик', 'уборщица'],
  },
];

const PROFESSIONS = PROFESSION_DEFS.map((p) => ({
  ...p,
  normalised: [...new Set([p.key.replace(/_/g, ' '), ...p.synonyms].map(normaliseText))].filter(Boolean),
}));
const FAMILY_OF = new Map(PROFESSIONS.map((p) => [p.key, p.family]));

/** Canonical profession keys (for selects and tests). */
export const PROFESSION_KEYS = PROFESSIONS.map((p) => p.key);

const containsPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

/**
 * Maps free text ("LKW-Fahrer CE", "водитель автобуса", "Tibb bacısı") to a canonical profession key,
 * or null when nothing is recognised. The longest matching synonym wins, so "водитель автобуса" is a
 * bus driver even though "водитель" alone means truck driver.
 */
export const canonicalProfession = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const n = normaliseText(text);
  if (!n) return null;
  if (PROFESSION_KEYS.includes(n.replace(/ /g, '_'))) return n.replace(/ /g, '_');
  let best: { key: string; len: number } | null = null;
  for (const p of PROFESSIONS) {
    for (const syn of p.normalised) {
      if (syn.length > (best?.len ?? 0) && containsPhrase(n, syn)) best = { key: p.key, len: syn.length };
    }
  }
  return best?.key ?? null;
};

const words = (s: string) => new Set(normaliseText(s).split(' ').filter((w) => w.length >= 3));

/** 0..1 similarity of two free-text professions. */
export const professionSimilarity = (candidate: string | null | undefined, wanted: string | null | undefined): number => {
  if (!wanted || !wanted.trim()) return 1;
  if (!candidate || !candidate.trim()) return 0;
  if (normaliseText(candidate) === normaliseText(wanted)) return 1;
  const a = canonicalProfession(candidate);
  const b = canonicalProfession(wanted);
  if (a && b) {
    if (a === b) return 1;
    return FAMILY_OF.get(a) === FAMILY_OF.get(b) ? 0.6 : 0;
  }
  // At least one is not in the dictionary: fall back to shared words.
  const wa = words(candidate);
  const wb = words(wanted);
  for (const w of wa) if (wb.has(w)) return 0.5;
  return 0;
};

// ─── Driving licences ──────────────────────────────────────────────────

/** Each category and the categories it includes (EU rules: CE ⊇ C ⊇ C1 ⊇ B, …). */
const LICENCE_IMPLIES: Record<string, string[]> = {
  AM: ['AM'],
  A1: ['A1', 'AM'],
  A2: ['A2', 'A1', 'AM'],
  A: ['A', 'A2', 'A1', 'AM'],
  B: ['B', 'AM'],
  BE: ['BE', 'B', 'AM'],
  C1: ['C1', 'B', 'AM'],
  C1E: ['C1E', 'C1', 'BE', 'B', 'AM'],
  C: ['C', 'C1', 'B', 'AM'],
  CE: ['CE', 'C', 'C1E', 'C1', 'BE', 'B', 'AM'],
  D1: ['D1', 'B', 'AM'],
  D1E: ['D1E', 'D1', 'BE', 'B', 'AM'],
  D: ['D', 'D1', 'B', 'AM'],
  DE: ['DE', 'D', 'D1E', 'D1', 'BE', 'B', 'AM'],
  T: ['T'],
  L: ['L'],
};

/** "B, C/CE (95)" → ['B', 'C', 'CE']; Cyrillic look-alikes (В, С, Е) are mapped to Latin. */
export const parseLicences = (s: string | null | undefined): string[] => {
  if (!s) return [];
  const latin = s
    .toUpperCase()
    .replace(/В/g, 'B')
    .replace(/С/g, 'C')
    .replace(/Е/g, 'E')
    .replace(/А/g, 'A')
    .replace(/Т/g, 'T')
    .replace(/\+/g, '');
  return [...new Set(latin.split(/[^A-Z0-9]+/).filter((t) => t in LICENCE_IMPLIES))];
};

/** Categories a holder of `have` may drive. */
export const coveredLicences = (have: string | null | undefined) => {
  const out = new Set<string>();
  for (const c of parseLicences(have)) for (const x of LICENCE_IMPLIES[c]) out.add(x);
  return out;
};

/** True when every category in `need` is covered by `have` (an empty requirement is always met). */
export const licenceCovers = (have: string | null | undefined, need: string | null | undefined) => {
  const required = parseLicences(need);
  if (!required.length) return true;
  const covered = coveredLicences(have);
  return required.every((r) => covered.has(r));
};

// ─── Score ──────────────────────────────────────────────────────────────

export interface MatchCandidate {
  profession?: string | null;
  experienceYears?: number | null;
  germanLevel?: string | null;
  education?: string | null;
  drivingLicence?: string | null;
}

export interface MatchVacancy {
  profession?: string | null;
  germanLevel?: string | null;
  minExperience?: number | null;
  drivingLicence?: string | null;
  visaCategory?: { visaLabel?: string | null; germanLevel?: string | null } | null;
}

export type GapCode = 'PROFESSION' | 'GERMAN' | 'EXPERIENCE' | 'LICENCE' | 'VISA_GERMAN' | 'VISA_EDUCATION';

export interface MatchGap {
  code: GapCode;
  required: string | number;
  actual: string | number | null;
}

export interface MatchResult {
  score: number;
  gaps: MatchGap[];
}

export const MATCH_WEIGHTS = { profession: 35, german: 25, experience: 15, licence: 15, visa: 10 } as const;

/** Skilled-worker visas (§18a / §18b) need a recognised vocational or university qualification. */
const needsQualification = (visaLabel: string | null | undefined) => !!visaLabel && /18\s*[ab]\b/i.test(visaLabel);
const QUALIFIED = new Set(['vocational', 'university']);

export const matchCandidate = (c: MatchCandidate, v: MatchVacancy): MatchResult => {
  const gaps: MatchGap[] = [];
  let score = 0;

  // Profession
  const prof = professionSimilarity(c.profession, v.profession);
  score += MATCH_WEIGHTS.profession * prof;
  if (prof < 1 && v.profession) gaps.push({ code: 'PROFESSION', required: v.profession, actual: c.profession ?? null });

  // German
  const needGerman = germanRank(v.germanLevel);
  const haveGerman = germanRank(c.germanLevel);
  if (needGerman <= haveGerman) score += MATCH_WEIGHTS.german;
  else {
    const diff = needGerman - haveGerman;
    score += MATCH_WEIGHTS.german * (diff === 1 ? 0.5 : diff === 2 ? 0.2 : 0);
    gaps.push({ code: 'GERMAN', required: GERMAN_LEVELS[needGerman], actual: c.germanLevel ?? null });
  }

  // Experience
  const needExp = v.minExperience ?? 0;
  const haveExp = c.experienceYears ?? 0;
  if (needExp <= 0 || haveExp >= needExp) score += MATCH_WEIGHTS.experience;
  else {
    score += MATCH_WEIGHTS.experience * Math.max(0, haveExp / needExp);
    gaps.push({ code: 'EXPERIENCE', required: needExp, actual: c.experienceYears ?? null });
  }

  // Driving licence
  if (licenceCovers(c.drivingLicence, v.drivingLicence)) score += MATCH_WEIGHTS.licence;
  else {
    // Partial credit for a lower category in the same line (e.g. C when CE is required).
    const covered = coveredLicences(c.drivingLicence);
    const required = parseLicences(v.drivingLicence);
    const partial = required.some((r) => LICENCE_IMPLIES[r].some((x) => x !== 'B' && x !== 'AM' && covered.has(x)));
    score += MATCH_WEIGHTS.licence * (partial ? 0.3 : 0);
    gaps.push({ code: 'LICENCE', required: required.join(', '), actual: c.drivingLicence ?? null });
  }

  // Visa category fit: the category's German minimum and, for skilled-worker visas, a qualification.
  const visa = v.visaCategory;
  let visaFit = 1;
  if (visa) {
    const visaGerman = germanRank(visa.germanLevel);
    if (visaGerman > haveGerman) {
      visaFit -= 0.5;
      gaps.push({ code: 'VISA_GERMAN', required: GERMAN_LEVELS[visaGerman], actual: c.germanLevel ?? null });
    }
    if (needsQualification(visa.visaLabel) && !QUALIFIED.has(c.education ?? '')) {
      visaFit -= 0.5;
      gaps.push({ code: 'VISA_EDUCATION', required: 'vocational', actual: c.education ?? null });
    }
  }
  score += MATCH_WEIGHTS.visa * visaFit;

  return { score: Math.max(0, Math.min(100, Math.round(score))), gaps };
};
