/**
 * Parameters of the German net-salary estimate for 2026 (employees in statutory insurance).
 * Every figure lives here so a yearly update touches only this file.
 *
 * Sources / assumptions:
 *  - §32a EStG tariff 2026 as amended by the Steuerfortentwicklungsgesetz (BGBl. 2024 I Nr. 449):
 *    Grundfreibetrag 12,348 €, zone limits 17,799 / 69,878 / 277,825 €.
 *  - Solidaritätszuschlag Freigrenze 2026: 20,350 € income tax (single) / 40,700 € (splitting).
 *  - Kinderfreibetrag 2026: 3,414 € + BEA 1,464 € per parent → 9,756 € per child for a couple (class III),
 *    4,878 € in classes I/II/IV. Only used for soli and church tax (as in the payroll tax procedure).
 *  - Social insurance 2026 (Sozialversicherungsrechengrößen-Verordnung 2026): BBG pension/unemployment
 *    8,450 €/month (101,400 €/year, uniform East/West), BBG health/care 5,812.50 €/month (69,750 €/year).
 *  - Contribution rates 2026: pension 18.6 %, unemployment 2.6 %, health 14.6 % (+ average Zusatzbeitrag
 *    2.9 % announced by the BMG for 2026), care 3.6 % (+0.6 % childless surcharge paid by the employee alone,
 *    −0.25 % per child from the 2nd to the 5th child under 25). Saxony: employee pays 0.5 % more care.
 *  - Lohnsteuer classes V/VI: formula of the official Programmablaufplan (§39b Abs. 2 EStG) with the
 *    2026 thresholds W1–W3 (approximate — check against the BMF PAP when it changes).
 */
export const SALARY_YEAR = 2026;

export const TAX = {
  grundfreibetrag: 12_348,
  zone2End: 17_799,
  zone3End: 69_878,
  zone4End: 277_825,
  /** (a·y + b)·y with y = (zvE − Grundfreibetrag) / 10,000 */
  zone2: { a: 914.51, b: 1_400 },
  /** (a·z + b)·z + c with z = (zvE − zone2End) / 10,000 */
  zone3: { a: 173.1, b: 2_397, c: 1_034.87 },
  /** 0.42·x − d */
  zone4: { rate: 0.42, d: 11_135.63 },
  /** 0.45·x − d */
  zone5: { rate: 0.45, d: 19_470.38 },
  arbeitnehmerPauschbetrag: 1_230,
  sonderausgabenPauschbetrag: 36,
  /** Entlastungsbetrag für Alleinerziehende (class II) + per additional child. */
  entlastungAlleinerziehende: 4_260,
  entlastungPerExtraChild: 240,
  kinderfreibetragFull: 9_756,
  /** Class V/VI thresholds (PAP 2026, approximate). */
  w1: 14_071,
  w2: 34_939,
  w3: 222_260,
} as const;

export const SOLI = {
  rate: 0.055,
  freigrenzeSingle: 20_350,
  /** Milderungszone: soli may not exceed 11.9 % of the tax above the Freigrenze. */
  milderung: 0.119,
} as const;

/** Church tax: 8 % in Bavaria and Baden-Württemberg, 9 % elsewhere. */
export const CHURCH_RATE_LOW = 0.08;
export const CHURCH_RATE_DEFAULT = 0.09;
export const CHURCH_LOW_STATES = ['BY', 'BW'] as const;

export const SOCIAL = {
  bbgPension: 101_400,
  bbgHealth: 69_750,
  pensionEmployee: 0.093,
  unemploymentEmployee: 0.013,
  healthEmployee: 0.073,
  /** Reduced rate used inside the Vorsorgepauschale (no sick-pay entitlement component). */
  healthReducedEmployee: 0.07,
  /** Average Zusatzbeitrag 2026 (total, split 50/50). Editable in the calculator. */
  defaultZusatzbeitrag: 0.029,
  careEmployee: 0.018,
  careSaxonyExtra: 0.005,
  careChildlessSurcharge: 0.006,
  careChildlessFromAge: 23,
  careReductionPerChild: 0.0025,
  /** The reduction applies to the 2nd … 5th child. */
  careReductionMaxChildren: 4,
} as const;

export const FEDERAL_STATES = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
export type FederalState = (typeof FEDERAL_STATES)[number];

/** 40 h/week × 52 weeks / 12 months. */
export const HOURS_PER_MONTH = (40 * 52) / 12;
