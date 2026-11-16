/**
 * Skilled-shortage barometer (/shortage-barometer): results of the Bundesagentur für Arbeit (BA)
 * "Engpassanalyse 2025" (reference year 2025, published 2 September 2026) for the professions we place.
 *
 * Source data: the BA's own data files behind the interactive Engpassanalyse page (epaliste.asc = 2025 results,
 * epalisteZRInsg.asc = time series 2019–2025), read on 2026-11-16. Every score below is copied from those files —
 * nothing estimated. Scores are the unweighted mean of six indicators (0–3), rounded to one decimal by the BA:
 *   Engpassberuf ≥ 2.0 · "unter Beobachtung" 1.5 – < 2.0 · kein Engpassberuf < 1.5
 * (a rounded 2.0 can still be "unter Beobachtung" when the unrounded mean is just below 2.0 — the BA's label wins).
 *
 * Germany is rated per 4-digit KldB occupation ("Berufsuntergruppe"); the Länder only per 3-digit group
 * ("Berufsgruppe"), which is broader, and for 12 regions: Niedersachsen/Bremen, Berlin/Brandenburg,
 * Schleswig-Holstein/Hamburg and Rheinland-Pfalz/Saarland are rated together. Requirement levels: Fachkraft,
 * Spezialist, Experte — the BA publishes no Helfer level. "–" = no rating published for that cell.
 */

export const SHORTAGE_AS_OF = '2026-11-16';
export const SHORTAGE_EDITION = { year: 2025, published: '2026-09-02', previousYear: 2024 } as const;
export const SHORTAGE_SOURCES = {
  page: 'https://statistik.arbeitsagentur.de/DE/Navigation/Statistiken/Interaktive-Statistiken/Fachkraeftebedarf/Engpassanalyse-Nav.html',
  press: 'https://www.arbeitsagentur.de/presse/2026-32-fachkraefte-bleiben-knapp-zuwanderung-gewinnt-weiter-an-bedeutung',
  data: 'https://statistik.arbeitsagentur.de/DE/Statischer-Content/Statistiken/Interaktive-Statistiken/Generische-Publikationen/epaliste.asc?__blob=publicationFile',
} as const;

export type Category = 'E' | 'B' | 'K';
export type Level = 'F' | 'S' | 'X'; // Fachkraft, Spezialist, Experte
export const LEVELS: Level[] = ['F', 'S', 'X'];

export interface Rating {
  cat: Category;
  score: number;
}

/** The 12 regions of the Länder results, in the BA's order. */
export const REGIONS = ['NW', 'HE', 'BW', 'BY', 'MV', 'SN', 'ST', 'TH', 'NI_HB', 'BB_BE', 'RP_SL', 'SH_HH'] as const;
export type Region = (typeof REGIONS)[number];

/** Which map states (ISO 3166-2 codes without "DE-") belong to each region. */
export const REGION_STATES: Record<Region, string[]> = {
  NW: ['NW'],
  HE: ['HE'],
  BW: ['BW'],
  BY: ['BY'],
  MV: ['MV'],
  SN: ['SN'],
  ST: ['ST'],
  TH: ['TH'],
  NI_HB: ['NI', 'HB'],
  BB_BE: ['BB', 'BE'],
  RP_SL: ['RP', 'SL'],
  SH_HH: ['SH', 'HH'],
};

export const regionOfState = (state: string): Region | null => (Object.keys(REGION_STATES) as Region[]).find((r) => REGION_STATES[r].includes(state)) ?? null;

/** "E2.7" → { cat: 'E', score: 2.7 }; "-" → null. */
export const parseRating = (s: string): Rating | null => {
  const m = /^([EBK])(\d(?:\.\d)?)$/.exec(s.trim());
  return m ? { cat: m[1] as Category, score: Number(m[2]) } : null;
};

/** 12 ratings in REGIONS order, space separated. */
const regions = (row: string): Partial<Record<Region, Rating>> => {
  const cells = row.trim().split(/\s+/);
  if (cells.length !== REGIONS.length) throw new Error(`shortage: expected ${REGIONS.length} cells, got ${cells.length}`);
  const out: Partial<Record<Region, Rating>> = {};
  cells.forEach((c, i) => {
    const r = parseRating(c);
    if (r) out[REGIONS[i]] = r;
  });
  return out;
};

export interface NationalOccupation {
  /** KldB 2010 code of the occupation (4 digits; "813x+821" = nursing + elderly care, published together). */
  kldb: string;
  /** BA name (German). */
  name: string;
  ratings: Partial<Record<Level, Rating>>;
  /** Same occupation and level in the 2024 analysis; absent = no row that year. */
  prev?: Partial<Record<Level, Rating>>;
}

export interface RegionalRow {
  /** KldB 3-digit group the Länder are rated on. */
  group: string;
  name: string;
  level: Level;
  /** The group's national value (column "D"). */
  national: Rating;
  states: Partial<Record<Region, Rating>>;
}

export interface ShortageProfession {
  key: string;
  /** Search term for /jobs/germany?q= */
  jobQuery: string;
  national: NationalOccupation[];
  /** Länder results of the broader group, or null when the BA publishes none that fits (shown: national only). */
  regional: RegionalRow[] | null;
  /** Why the map is missing / how it differs (copy key: shortage.notes.<note>). */
  note?: 'together' | 'broader' | 'noRegional' | 'groupDiffers';
  glossary: string[];
}

const r = (s: string) => parseRating(s)!;

export const SHORTAGE_PROFESSIONS: ShortageProfession[] = [
  {
    key: 'nursing',
    jobQuery: 'Pflegefachkraft',
    note: 'together',
    glossary: ['anerkennung', 'kenntnispruefung', 'anerkennungspartnerschaft'],
    national: [{ kldb: '813x+821', name: 'Pflegeberufe (Gesundheits- und Krankenpflege + Altenpflege)', ratings: { F: r('E2.7'), S: r('E2.5'), X: r('E2.5') }, prev: { F: r('E2.8'), S: r('E2.5'), X: r('E2.7') } }],
    regional: [
      { group: '813x+821', name: 'Pflegeberufe', level: 'F', national: r('E2.7'), states: regions('E2.7 E2.7 E2.8 E2.7 E2.5 E2.2 E2.5 E2.5 E2.8 E2.7 E2.5 E2.2') },
      { group: '813x+821', name: 'Pflegeberufe', level: 'S', national: r('E2.5'), states: regions('E2.0 - E2.3 E2.5 - - - - E2.3 - - -') },
      { group: '813x+821', name: 'Pflegeberufe', level: 'X', national: r('E2.5'), states: regions('E2.4 - E2.5 E2.0 - - - - E2.3 E2.3 - -') },
    ],
  },
  {
    key: 'cook',
    jobQuery: 'Koch',
    note: 'groupDiffers',
    glossary: ['probezeit', 'schichtarbeit'],
    national: [
      { kldb: '2930', name: 'Köche/Köchinnen (ohne Spezialisierung)', ratings: { F: r('E2.0') }, prev: { F: r('E2.0') } },
      { kldb: '2939', name: 'Aufsichtskräfte Speisenzubereitung', ratings: { S: r('E2.0') } },
    ],
    regional: [
      { group: '293', name: 'Speisenzubereitung', level: 'F', national: r('B1.8'), states: regions('B1.8 B1.8 E2.0 E2.5 E2.8 B1.8 E2.2 E2.2 B1.8 B1.8 E2.2 E2.0') },
      { group: '293', name: 'Speisenzubereitung', level: 'S', national: r('E2.0'), states: regions('E2.8 - E2.8 E2.8 - - - - - E2.5 - -') },
    ],
  },
  {
    key: 'truck',
    jobQuery: 'Berufskraftfahrer',
    note: 'noRegional',
    glossary: ['fuehrerschein-umschreibung', 'arbeitszeit'],
    national: [
      { kldb: '5212', name: 'Berufskraftfahrer/innen (Güterverkehr/LKW)', ratings: { F: r('E2.5') }, prev: { F: r('E2.4') } },
      { kldb: '5213', name: 'Bus- und Straßenbahnfahrer/innen', ratings: { F: r('E2.3') } },
    ],
    // Group 521 mixes truck drivers with car and taxi drivers (national B 1.5) — too different to colour a map for LKW drivers.
    regional: null,
  },
  {
    key: 'electrician',
    jobQuery: 'Elektriker',
    note: 'broader',
    glossary: ['anerkennung', 'handwerkskammer'],
    national: [
      { kldb: '2621', name: 'Bauelektrik', ratings: { F: r('E2.7') }, prev: { F: r('E2.7') } },
      { kldb: '2626', name: 'Elektrische Leitungsinstallation und -wartung', ratings: { F: r('E2.7') } },
    ],
    regional: [{ group: '262', name: 'Energietechnik', level: 'F', national: r('E2.5'), states: regions('E2.2 E2.3 E2.5 E2.5 E2.4 E2.5 E2.3 E2.8 E2.3 E2.5 E2.7 E2.5') }],
  },
  {
    key: 'shk',
    jobQuery: 'Anlagenmechaniker SHK',
    note: 'broader',
    glossary: ['anerkennung', 'handwerkskammer'],
    national: [{ kldb: '3421', name: 'Sanitär-, Heizungs- und Klimatechnik', ratings: { F: r('E2.5'), S: r('E2.5'), X: r('E2.0') }, prev: { F: r('E2.7'), S: r('E2.3'), X: r('E2.0') } }],
    regional: [
      { group: '342', name: 'Klempnerei, Sanitär-, Heizungs-, Klimatechnik', level: 'F', national: r('E2.5'), states: regions('E2.3 E2.3 E2.5 E2.5 E2.4 E2.3 E2.6 E2.2 E2.7 E2.2 E2.5 E2.3') },
      { group: '342', name: 'Klempnerei, Sanitär-, Heizungs-, Klimatechnik', level: 'S', national: r('E2.7'), states: regions('E2.6 - E2.8 E2.5 - - - - E2.5 - - -') },
    ],
  },
  {
    key: 'kfz',
    jobQuery: 'Kfz-Mechatroniker',
    note: 'broader',
    glossary: ['anerkennung', 'handwerkskammer'],
    national: [{ kldb: '2521', name: 'Kraftfahrzeugtechnik', ratings: { F: r('E2.5'), S: r('B1.8'), X: r('B1.5') }, prev: { F: r('E2.3'), S: r('B1.8'), X: r('B1.8') } }],
    regional: [
      { group: '252', name: 'Fahrzeug-, Luft-, Raumfahrt- und Schiffbautechnik', level: 'F', national: r('E2.5'), states: regions('E2.0 E2.2 E2.2 E2.3 E2.2 E2.5 E2.7 E2.5 E2.7 E2.5 E2.5 E2.5') },
      { group: '252', name: 'Fahrzeug-, Luft-, Raumfahrt- und Schiffbautechnik', level: 'S', national: r('E2.5'), states: regions('E2.2 E2.2 B1.8 E2.4 - - - - E2.0 - E2.4 E2.3') },
    ],
  },
  {
    key: 'mechatronics',
    jobQuery: 'Mechatroniker',
    note: 'broader',
    glossary: ['anerkennung', 'ihk'],
    national: [{ kldb: '2611', name: 'Mechatronik', ratings: { F: r('E2.3'), S: r('E2.4'), X: r('K1.0') }, prev: { F: r('E2.5'), S: r('E2.5'), X: r('B1.8') } }],
    regional: [{ group: '261', name: 'Mechatronik und Automatisierungstechnik', level: 'F', national: r('E2.2'), states: regions('E2.2 E2.2 E2.3 E2.3 - E2.4 E2.0 E2.5 E2.2 E2.2 E2.6 E2.4') }],
  },
  {
    key: 'construction',
    jobQuery: 'Maurer',
    note: 'broader',
    glossary: ['handwerkskammer', 'arbeitsvertrag'],
    national: [
      { kldb: '3210', name: 'Hochbau (ohne Spezialisierung)', ratings: { F: r('B1.7'), S: r('E2.2') } },
      { kldb: '3212', name: 'Maurerhandwerk', ratings: { F: r('B1.7') }, prev: { F: r('B1.7') } },
      { kldb: '3211', name: 'Beton- und Stahlbetonbau', ratings: { F: r('B1.5') } },
      { kldb: '3214', name: 'Dachdeckerei', ratings: { F: r('E2.0') }, prev: { F: r('E2.0') } },
      { kldb: '3332', name: 'Zimmerei', ratings: { F: r('B1.8') }, prev: { F: r('E2.0') } },
    ],
    regional: [
      { group: '321', name: 'Hochbau', level: 'F', national: r('B1.7'), states: regions('K1.3 B1.5 E2.0 E2.2 B1.6 B1.5 B1.6 E2.0 B1.8 K1.3 B1.7 K1.3') },
      { group: '321', name: 'Hochbau', level: 'S', national: r('E2.0'), states: regions('E2.2 - B1.8 E2.0 - - - - E2.0 - - -') },
    ],
  },
  {
    key: 'civil',
    jobQuery: 'Tiefbau',
    note: 'broader',
    glossary: ['handwerkskammer', 'schichtarbeit'],
    national: [
      { kldb: '3220', name: 'Tiefbau (ohne Spezialisierung)', ratings: { F: r('E2.7'), X: r('E2.0') }, prev: { F: r('E2.5'), X: r('B1.6') } },
      { kldb: '3222', name: 'Straßen- und Asphaltbau', ratings: { F: r('E2.5') } },
      { kldb: '3223', name: 'Gleisbau', ratings: { F: r('E2.8') } },
    ],
    regional: [{ group: '322', name: 'Tiefbau', level: 'F', national: r('E2.7'), states: regions('E2.3 E2.6 E2.4 E2.5 E2.0 E2.2 E2.2 E2.4 E2.3 E2.2 E2.6 E2.0') }],
  },
  {
    key: 'metal',
    jobQuery: 'Schweißer',
    note: 'broader',
    glossary: ['anerkennung', 'ihk'],
    national: [
      { kldb: '2441', name: 'Metallbau', ratings: { F: r('E2.0'), S: r('E2.3') }, prev: { F: r('E2.2'), S: r('E2.3') } },
      { kldb: '2442', name: 'Schweiß- und Verbindungstechnik', ratings: { F: r('B1.8'), S: r('E2.2') }, prev: { F: r('E2.0'), S: r('E2.2') } },
    ],
    regional: [{ group: '244', name: 'Metallbau und Schweißtechnik', level: 'F', national: r('E2.0'), states: regions('K1.2 K1.3 B1.7 E2.2 B1.6 E2.0 E2.3 E2.2 E2.2 B1.8 E2.2 B1.6') }],
  },
  {
    key: 'it',
    jobQuery: 'Informatiker',
    note: 'broader',
    glossary: ['blaue-karte-eu', 'anerkennung'],
    national: [{ kldb: '4310', name: 'Informatik (ohne Spezialisierung)', ratings: { F: r('K1.2'), S: r('E2.0'), X: r('B1.7') }, prev: { F: r('K1.2'), S: r('B1.5'), X: r('B1.7') } }],
    regional: [
      { group: '431', name: 'Informatik', level: 'F', national: r('K1.0'), states: regions('K1.2 K1.3 K1.3 K1.3 - K1.0 K1.3 K1.3 K1.0 K1.0 K1.4 K1.0') },
      { group: '431', name: 'Informatik', level: 'S', national: r('K1.3'), states: regions('K1.2 E2.3 B1.6 B1.8 - E2.0 - - K0.8 K1.3 - B1.8') },
      { group: '431', name: 'Informatik', level: 'X', national: r('B1.7'), states: regions('E2.0 E2.0 K1.4 B1.5 - E2.2 - - E2.2 B1.6 B1.8 B1.6') },
    ],
  },
  {
    key: 'software',
    jobQuery: 'Softwareentwickler',
    note: 'broader',
    glossary: ['blaue-karte-eu', 'anerkennung'],
    national: [{ kldb: '4341', name: 'Softwareentwicklung', ratings: { F: r('K0.8'), S: r('B1.5'), X: r('B1.7') }, prev: { F: r('K1.2'), S: r('B1.8'), X: r('E2.2') } }],
    regional: [
      { group: '434', name: 'Softwareentwicklung und Programmierung', level: 'S', national: r('B1.7'), states: regions('K1.2 - B1.8 E2.0 - - - - E2.3 - - -') },
      { group: '434', name: 'Softwareentwicklung und Programmierung', level: 'X', national: r('B1.8'), states: regions('K1.2 B1.7 K1.2 B1.8 - K1.3 - - B1.5 K1.4 B1.8 B1.5') },
    ],
  },
  {
    key: 'warehouse',
    jobQuery: 'Fachkraft für Lagerlogistik',
    note: 'broader',
    glossary: ['zeitarbeit', 'schichtarbeit'],
    national: [{ kldb: '5131', name: 'Lagerwirtschaft', ratings: { F: r('K1.3') }, prev: { F: r('B1.5') } }],
    regional: [{ group: '513', name: 'Lagerwirtschaft, Post, Zustellung, Güterumschlag', level: 'F', national: r('B1.5'), states: regions('K1.2 K1.2 B1.5 B1.5 K1.2 B1.5 K1.2 K1.3 B1.5 B1.5 K1.3 K1.2') }],
  },
  {
    key: 'hotel',
    jobQuery: 'Hotelfachmann',
    note: 'broader',
    glossary: ['schichtarbeit', 'probezeit'],
    national: [
      { kldb: '6322', name: 'Hotelservice', ratings: { F: r('E2.3') }, prev: { F: r('E2.6') } },
      { kldb: '6321', name: 'Hotelkaufleute', ratings: { F: r('B1.7') } },
    ],
    regional: [{ group: '632', name: 'Hotellerie', level: 'F', national: r('E2.2'), states: regions('E2.3 E2.4 E2.3 E2.5 E2.8 E3.0 - - E2.2 E2.8 E2.5 E2.0') }],
  },
  {
    key: 'gastro',
    jobQuery: 'Restaurantfachmann',
    note: 'broader',
    glossary: ['schichtarbeit', 'minijob'],
    national: [
      { kldb: '6330', name: 'Gastronomieservice (ohne Spezialisierung)', ratings: { F: r('E2.3'), S: r('E2.5') }, prev: { F: r('E2.5'), S: r('E2.7') } },
      { kldb: '6331', name: 'Systemgastronomie', ratings: { F: r('E2.2') } },
    ],
    regional: [{ group: '633', name: 'Gastronomie', level: 'F', national: r('E2.2'), states: regions('E2.2 B1.8 E2.5 E2.5 E2.8 E2.3 E2.2 E2.6 E2.3 B1.8 E2.8 E2.0') }],
  },
  {
    key: 'childcare',
    jobQuery: 'Erzieher',
    note: 'broader',
    glossary: ['anerkennung', 'kita'],
    national: [
      { kldb: '8311', name: 'Kinderbetreuung und -erziehung', ratings: { S: r('E2.2') }, prev: { S: r('E2.0') } },
      { kldb: '8313', name: 'Heilerziehungspflege, Sonderpädagogik', ratings: { F: r('B1.7'), S: r('E2.2'), X: r('E2.3') } },
    ],
    regional: [
      { group: '831', name: 'Erziehung, Sozialarbeit, Heilerziehungspflege', level: 'S', national: r('B2.0'), states: regions('B1.8 E2.5 E2.5 E2.2 B1.7 K1.3 B1.5 K1.2 E2.3 K1.3 E2.3 K1.3') },
      { group: '831', name: 'Erziehung, Sozialarbeit, Heilerziehungspflege', level: 'X', national: r('E2.2'), states: regions('E2.2 E2.5 E2.2 E2.2 E2.2 B1.5 E2.0 E2.2 E2.3 B1.8 E2.5 E2.2') },
    ],
  },
  {
    key: 'physio',
    jobQuery: 'Physiotherapeut',
    note: 'broader',
    glossary: ['anerkennung', 'berufserlaubnis'],
    national: [{ kldb: '8171', name: 'Physiotherapie', ratings: { F: r('B1.8'), S: r('E2.8') }, prev: { F: r('B1.8'), S: r('E2.7') } }],
    regional: [
      { group: '817', name: 'Nichtärztliche Therapie und Heilkunde', level: 'F', national: r('B1.8'), states: regions('B1.5 - B1.8 E2.3 - - - - K1.4 - - B1.6') },
      { group: '817', name: 'Nichtärztliche Therapie und Heilkunde', level: 'S', national: r('E2.8'), states: regions('E2.8 E2.8 E2.8 E2.7 E2.8 E2.7 E2.6 E2.6 E2.7 E2.3 E2.8 E2.5') },
    ],
  },
];

export const professionByKey = (key: string | null | undefined) => SHORTAGE_PROFESSIONS.find((p) => p.key === key) ?? null;

/** Category the BA thresholds give for a (rounded) score — for checks; the BA's own label is what we show. */
export const categoryOfScore = (score: number): Category => (score >= 2 ? 'E' : score >= 1.5 ? 'B' : 'K');

/** Levels with a Länder row for a profession, in F → S → X order. */
export const regionalLevels = (p: ShortageProfession): Level[] => LEVELS.filter((l) => p.regional?.some((row) => row.level === l));

/** Regions sorted for the bar chart: highest score first, unrated regions last (stable by REGIONS order). */
export const rankedRegions = (row: RegionalRow) =>
  REGIONS.map((region, i) => ({ region, rating: row.states[region] ?? null, i })).sort((a, b) => (b.rating?.score ?? -1) - (a.rating?.score ?? -1) || a.i - b.i);
