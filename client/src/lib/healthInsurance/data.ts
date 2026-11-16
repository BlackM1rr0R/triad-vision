import type { FederalState } from '@/lib/salary';

/**
 * Statutory health insurance funds (gesetzliche Krankenkassen) for the public comparison page
 * (/health-insurance-comparison): every fund open nationwide plus the eleven regional AOKs with the states they
 * are open in, each with its Zusatzbeitrag (total, split 50/50 between employee and employer).
 *
 * Sources (checked 2026-11-16):
 *  - Rates: the market overview on krankenkassen.de ("Zusatzbeitrag: Liste der Krankenkassen nach Beitragssatz"),
 *    which mirrors the GKV-Spitzenverband "Krankenkassenliste" (the official list itself could not be fetched from
 *    here — connection reset — so the UI links to it for checking). Mid-year changes 2026 cross-checked on
 *    gesetzlichekrankenkassen.de: IKK classic 3.85 % from 01.08.2026; no 01.01.2027 changes announced on 16.11.2026.
 *  - Average Zusatzbeitrag 2026: 2.9 % (BMG, BAnz AT 10.11.2025 B7, § 242a SGB V); it stays 2.9 % for 2027
 *    (BMG press release of 30.10.2026). General rate 14.6 % (§ 241 SGB V). BBG KV/PV 2026 69,750 €/year
 *    (5,812.50 €/month, Sozialversicherungsrechengrößen-Verordnung 2026) — all from server/src/lib/budget/params.ts.
 *  - Regional AOK areas: the AOKs' own areas (one AOK per region; NRW is split between AOK Rheinland/Hamburg and
 *    AOK NordWest).
 * Funds change their rate on 1 January (and sometimes mid-year): re-check every December.
 */
export const KASSEN_CHECKED = '2026-11-16';

export type KasseType = 'AOK' | 'BKK' | 'IKK' | 'EK' | 'KN';
export type KasseScope = 'nationwide' | 'regional';

export interface Kasse {
  id: string;
  name: string;
  type: KasseType;
  /** Zusatzbeitrag in percent of the gross wage (total; the employee pays half). */
  zb: number;
  scope: KasseScope;
  /** Regional funds: the states whose residents / employees may join. */
  states?: FederalState[];
}

const nw = (id: string, name: string, type: KasseType, zb: number): Kasse => ({ id, name, type, zb, scope: 'nationwide' });
const aok = (id: string, name: string, zb: number, states: FederalState[]): Kasse => ({ id, name, type: 'AOK', zb, scope: 'regional', states });

export const KASSEN: Kasse[] = [
  // ─── Open nationwide ───
  nw('tui-bkk', 'TUI BKK', 'BKK', 2.5),
  nw('hkk', 'hkk Krankenkasse', 'EK', 2.59),
  nw('audi-bkk', 'Audi BKK', 'BKK', 2.6),
  nw('tk', 'Techniker Krankenkasse (TK)', 'EK', 2.69),
  nw('wmf-bkk', 'WMF BKK', 'BKK', 2.85),
  nw('hek', 'HEK – Hanseatische Krankenkasse', 'EK', 2.89),
  nw('bkk-linde', 'BKK Linde', 'BKK', 2.99),
  nw('dak', 'DAK-Gesundheit', 'EK', 3.2),
  nw('bertelsmann-bkk', 'Bertelsmann BKK', 'BKK', 3.2),
  nw('debeka-bkk', 'Debeka BKK', 'BKK', 3.25),
  nw('barmer', 'BARMER', 'EK', 3.29),
  nw('salus-bkk', 'Salus BKK', 'BKK', 3.29),
  nw('continentale-bkk', 'Die Continentale BKK', 'BKK', 3.33),
  nw('ikk-gesund-plus', 'IKK gesund plus', 'IKK', 3.39),
  nw('bkk-gildemeister', 'BKK GILDEMEISTER SEIDENSTICKER', 'BKK', 3.4),
  nw('rv-bkk', 'R+V BKK', 'BKK', 3.49),
  nw('mkk', 'mkk – meine krankenkasse', 'BKK', 3.5),
  nw('novitas-bkk', 'Novitas BKK', 'BKK', 3.6),
  nw('bahn-bkk', 'BAHN-BKK', 'BKK', 3.65),
  nw('big', 'BIG direkt gesund', 'BKK', 3.69),
  nw('pronova-bkk', 'pronova BKK', 'BKK', 3.7),
  nw('kkh', 'KKH Kaufmännische Krankenkasse', 'EK', 3.78),
  nw('vivida-bkk', 'vivida bkk', 'BKK', 3.79),
  nw('bkk-provita', 'BKK ProVita', 'BKK', 3.79),
  nw('sbk', 'SBK Siemens-Betriebskrankenkasse', 'BKK', 3.8),
  nw('ikk-classic', 'IKK classic', 'IKK', 3.85),
  nw('bkk-verbundplus', 'BKK VerbundPlus', 'BKK', 3.89),
  nw('mobil', 'Mobil Krankenkasse', 'BKK', 3.89),
  nw('securvita', 'SECURVITA Krankenkasse', 'BKK', 3.9),
  nw('heimat', 'Heimat Krankenkasse', 'BKK', 3.9),
  nw('bkk-pfalz', 'BKK Pfalz', 'BKK', 3.9),
  nw('energie-bkk', 'energie-BKK', 'BKK', 3.98),
  nw('viactiv', 'VIACTIV Krankenkasse', 'BKK', 4.19),
  nw('ikk-innovationskasse', 'IKK – Die Innovationskasse', 'IKK', 4.3),
  nw('knappschaft', 'KNAPPSCHAFT', 'KN', 4.3),
  nw('bkk24', 'BKK24', 'BKK', 4.39),
  // ─── Regional AOKs (open to residents / employees of these states) ───
  aok('aok-rps', 'AOK Rheinland-Pfalz/Saarland', 2.47, ['RP', 'SL']),
  aok('aok-bayern', 'AOK Bayern', 2.69, ['BY']),
  aok('aok-sachsen-anhalt', 'AOK Sachsen-Anhalt', 2.89, ['ST']),
  aok('aok-niedersachsen', 'AOK Niedersachsen', 2.98, ['NI']),
  aok('aok-hessen', 'AOK Hessen', 2.98, ['HE']),
  aok('aok-nordwest', 'AOK NordWest', 2.99, ['NW', 'SH']),
  aok('aok-bw', 'AOK Baden-Württemberg', 2.99, ['BW']),
  aok('aok-plus', 'AOK PLUS', 3.1, ['SN', 'TH']),
  aok('aok-rheinland-hamburg', 'AOK Rheinland/Hamburg', 3.29, ['NW', 'HH']),
  aok('aok-bremen', 'AOK Bremen/Bremerhaven', 3.29, ['HB']),
  aok('aok-nordost', 'AOK Nordost', 3.5, ['BE', 'BB', 'MV']),
];

export const KASSE_SOURCES = [
  { label: 'GKV-Spitzenverband – Krankenkassenliste (offizielle Liste mit Zusatzbeiträgen)', url: 'https://www.gkv-spitzenverband.de/service/krankenkassenliste/krankenkassen.jsp' },
  { label: 'krankenkassen.de – Zusatzbeitrag: Liste der Krankenkassen nach Beitragssatz', url: 'https://www.krankenkassen.de/gesetzliche-krankenkassen/krankenkasse-beitrag/zusatzbeitrag/' },
  { label: 'BMG – Durchschnittlicher Zusatzbeitragssatz (2,9 %)', url: 'https://www.bundesgesundheitsministerium.de/presse/pressemitteilungen/zusatzbeitragssatz-gkv-2027-festgelegt' },
  { label: 'Bundesanzeiger – Bekanntmachung durchschnittlicher Zusatzbeitragssatz 2026 (BAnz AT 10.11.2025 B7)', url: 'https://www.bundesanzeiger.de/pub/publication/oUJYVk8GYRXybnb9Y4h/content/oUJYVk8GYRXybnb9Y4h/BAnz%20AT%2010.11.2025%20B7.pdf' },
  { label: '§ 175 SGB V – Kassenwahl, Bindungsfrist, Sonderkündigungsrecht', url: 'https://www.gesetze-im-internet.de/sgb_5/__175.html' },
  { label: '§ 242 SGB V – Zusatzbeitrag', url: 'https://www.gesetze-im-internet.de/sgb_5/__242.html' },
];
