/**
 * First-month budget in Germany: every yearly parameter in one typed file (payroll + cost assumptions).
 * A yearly update touches only this file: copy BUDGET_PARAMS_2026, change the figures, point CURRENT_PARAMS
 * at the new object and update the reference values in tests/unit/budgetPayroll.test.ts.
 *
 * Payroll sources (all for 2026):
 *  - BMF, "Programmablaufplan für den Lohnsteuerabzug 2026", Anlage 1 to the BMF letter of 12.11.2025
 *    (final). Constants MPARA: GFB 12,348 €, SOLZFREI 20,350 €, BBGRVALV 101,400 €, BBGKVPV 69,750 €,
 *    RVSATZAN 0.093, AVSATZAN 0.013, KVSATZAN = KVZ/2/100 + 0.07, PVSATZAN 0.018 (Saxony 0.023) + 0.006
 *    childless − 0.0025 per reduction child; MZTABFB: ANP 1,230 €, SAP 36 €, KFB 9,756 € (4,878 € in class IV),
 *    UPTAB26 tariff (§32a EStG 2026), UPEVP / MVSPHB (Vorsorgepauschale incl. the new 2026 unemployment
 *    insurance part, capped together with health + care at 1,900 €), EFA 4,260 € (class II), MST5_6 with W1STKL5 14,071 €,
 *    W2STKL5 34,939 €, W3STKL5 222,260 € (classes V / VI). Its "Prüftabelle" (page 39) is the reference
 *    table the unit tests check against.
 *  - Minijob limit 2026: 603 €/month (minimum wage 13.90 € × 130 / 3, §8 Abs. 1a SGB IV); Übergangsbereich
 *    603.01 – 2,000 € (§20 Abs. 2 SGB IV), employee base 2,000 / (2,000 − 603) × (gross − 603).
 *  - Sozialversicherungsrechengrößen-Verordnung 2026: BBG pension/unemployment 8,450 €/month,
 *    health/care 5,812.50 €/month.
 *  - BMG, average Zusatzbeitrag 2026 (§242a SGB V): 2.9 % (individual funds charge more or less).
 *  - Church tax 8 % (Bavaria, Baden-Württemberg) / 9 % (other states) of the income tax.
 *
 * Cost sources / assumptions (orientation values, conservative, checked 2026-10):
 *  - Deutschlandticket 63 €/month since 01.01.2026 (decision of the transport ministers' conference, 09/2025).
 *  - Rundfunkbeitrag 18.36 €/month per flat (Rundfunkbeitragsstaatsvertrag; billed quarterly, 55.08 €).
 *  - Kindergeld 259 € per child and month in 2026 (§66 EStG).
 *  - Rent deposit: at most 3 net cold rents (§551 BGB); city rents and food: CityCost table (admin-editable).
 *  - Private liability insurance, SIM cards, furniture, incoming health insurance: typical price ranges of
 *    comparison portals 2025/2026, rounded up.
 *  - Blocked account (Sperrkonto): amount per visa category from the cost calculator settings
 *    (lib/marketing/costCalculator.ts, default 11,904 €/year = 992 €/month in 2025 and 2026).
 */

export type Range = [number, number];

export const FEDERAL_STATES = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
export type FederalState = (typeof FEDERAL_STATES)[number];

export interface PayrollParams {
  year: number;
  tax: {
    /** Grundfreibetrag (zone 1 ends here). */
    gfb: number;
    /** First euro of zone 3 / 4 / 5 (PAP: X < 17800, X < 69879, X < 277826). */
    zone3From: number;
    zone4From: number;
    zone5From: number;
    /** Zone 2: (a·y + b)·y, y = (x − gfb) / 10,000. */
    zone2: { a: number; b: number };
    /** Zone 3: (a·z + b)·z + c, z = (x − zone3From + 1) / 10,000. */
    zone3: { a: number; b: number; c: number };
    /** Zone 4 / 5: rate·x − d. */
    zone4: { rate: number; d: number };
    zone5: { rate: number; d: number };
    /** Arbeitnehmer-Pauschbetrag, Sonderausgaben-Pauschbetrag. */
    anp: number;
    sap: number;
    /** Freibeträge für Kinder per child (both parents) / half (one parent). */
    kfbFull: number;
    kfbHalf: number;
    /** Entlastungsbetrag für Alleinerziehende in class II (PAP MZTABFB: EFA; the +240 € per further child is an ELStAM Freibetrag, not in the PAP). */
    efa: number;
    /** Classes V / VI (PAP MST5_6): W1STKL5, W2STKL5, W3STKL5. */
    class56: { w1: number; w2: number; w3: number };
  };
  soli: { rate: number; freigrenze: number; milderung: number };
  church: { low: number; default: number; lowStates: readonly FederalState[] };
  social: {
    /** Yearly contribution ceilings (BBG). */
    bbgRvAlvYear: number;
    bbgKvPvYear: number;
    pensionEmployee: number;
    unemploymentEmployee: number;
    /** Health: general rate share of the employee (actual contribution). */
    healthEmployee: number;
    /** Reduced rate used inside the Vorsorgepauschale (KVSATZAN = Zusatzbeitrag/2 + this). */
    healthReducedForVsp: number;
    /** Average Zusatzbeitrag (total, split 50/50). */
    averageZusatzbeitrag: number;
    careEmployee: number;
    careEmployeeSaxony: number;
    careChildlessSurcharge: number;
    careChildlessFromAge: number;
    careReductionPerChild: number;
    /** Reductions for the 2nd … 5th child (max 4). */
    careReductionMaxChildren: number;
    /** Höchstbetrag of health + care + unemployment inside the Vorsorgepauschale (§39b Abs. 2 S. 5 Nr. 3 e EStG). */
    vspCap: number;
  };
  /** Gross per month up to which the Übergangsbereich (Midijob, §20 Abs. 2 SGB IV) applies. */
  midijobUpTo: number;
  /** Geringfügigkeitsgrenze (Minijob, §8 Abs. 1a SGB IV): 130 h × minimum wage / 3, rounded up. */
  minijobUpTo: number;
  /** Employee pension share in a Minijob (18.6 % − the employer's 15 % flat rate) unless exempted. */
  minijobPensionEmployee: number;
}

export interface CostParams {
  deutschlandticket: number;
  rundfunkMonthly: number;
  kindergeld: number;
  /** First annual premium of a private liability insurance. */
  liabilityYear: { single: Range; household: Range };
  sim: { starter: Range; monthlyPerAdult: Range };
  furniture: { wg: Range; flat: Range; flatPerExtraPerson: Range; company: Range };
  /** Incoming / travel health insurance between arrival and the job start, per person and month. */
  incomingInsuranceMonthly: Range;
  electricity: { base: Range; perExtraPerson: Range };
  internet: Range;
  personalPerAdult: Range;
  childPerMonth: Range;
  /** Food of a child relative to an adult. */
  childFoodFactor: number;
  /** Large families (≥ 3 children): 2-room rent × this (≈ a 3-room flat). */
  largeFamilyRentFactor: number;
  /** Company housing deposit: [low, high] monthly rents. */
  companyDepositMonths: Range;
  /** Days of arrival before the job start when the visitor gives no arrival date. */
  arrivalDaysBeforeStart: number;
  /** The first salary is paid at the end of the month after the start month (conservative). */
  firstPayMonthsAfterStart: number;
  /** Arriving after this day of the month: no Deutschlandticket / phone month for the arrival month. */
  arrivalLateDay: number;
  buffer: { percent: number; min: number; roundTo: number };
  /** Sperrkonto default when the visa category has no own value but needs one (EUR / 12 months). */
  blockedAccountYear: number;
}

export interface BudgetParams {
  year: number;
  /** Date the figures were last checked (shown as "as of"). */
  checkedAt: string;
  payroll: PayrollParams;
  costs: CostParams;
}

export const BUDGET_PARAMS_2026: BudgetParams = {
  year: 2026,
  checkedAt: '2026-10-26',
  payroll: {
    year: 2026,
    tax: {
      gfb: 12_348,
      zone3From: 17_800,
      zone4From: 69_879,
      zone5From: 277_826,
      zone2: { a: 914.51, b: 1_400 },
      zone3: { a: 173.1, b: 2_397, c: 1_034.87 },
      zone4: { rate: 0.42, d: 11_135.63 },
      zone5: { rate: 0.45, d: 19_470.38 },
      anp: 1_230,
      sap: 36,
      kfbFull: 9_756,
      kfbHalf: 4_878,
      efa: 4_260,
      class56: { w1: 14_071, w2: 34_939, w3: 222_260 },
    },
    soli: { rate: 0.055, freigrenze: 20_350, milderung: 0.119 },
    church: { low: 0.08, default: 0.09, lowStates: ['BY', 'BW'] },
    social: {
      bbgRvAlvYear: 101_400,
      bbgKvPvYear: 69_750,
      pensionEmployee: 0.093,
      unemploymentEmployee: 0.013,
      healthEmployee: 0.073,
      healthReducedForVsp: 0.07,
      averageZusatzbeitrag: 0.029,
      careEmployee: 0.018,
      careEmployeeSaxony: 0.023,
      careChildlessSurcharge: 0.006,
      careChildlessFromAge: 23,
      careReductionPerChild: 0.0025,
      careReductionMaxChildren: 4,
      vspCap: 1_900,
    },
    midijobUpTo: 2_000,
    minijobUpTo: 603,
    minijobPensionEmployee: 0.036,
  },
  costs: {
    deutschlandticket: 63,
    rundfunkMonthly: 18.36,
    kindergeld: 259,
    liabilityYear: { single: [45, 90], household: [60, 120] },
    sim: { starter: [10, 30], monthlyPerAdult: [10, 25] },
    furniture: { wg: [100, 300], flat: [900, 2_000], flatPerExtraPerson: [200, 500], company: [50, 200] },
    incomingInsuranceMonthly: [35, 80],
    electricity: { base: [35, 55], perExtraPerson: [15, 20] },
    internet: [30, 45],
    personalPerAdult: [80, 180],
    childPerMonth: [120, 250],
    childFoodFactor: 0.6,
    largeFamilyRentFactor: 1.35,
    companyDepositMonths: [0, 1],
    arrivalDaysBeforeStart: 7,
    firstPayMonthsAfterStart: 1,
    arrivalLateDay: 20,
    buffer: { percent: 0.15, min: 500, roundTo: 100 },
    blockedAccountYear: 11_904,
  },
};

/** Parameters used by the calculator now. */
export const CURRENT_PARAMS: BudgetParams = BUDGET_PARAMS_2026;
