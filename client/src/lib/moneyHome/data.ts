/**
 * Data of the "Money for family" calculator (/send-money-home) and the 5-year time machine (/five-years-in-germany):
 * typical figures in Azerbaijan to translate a monthly transfer into something relatable, the transfer-cost model
 * and the sector wages of Azerbaijan. Plain data, no React; every figure carries its source and "as of" date.
 *
 * Checked on 17.11.2026:
 *  - minimum monthly wage 400 AZN since 1 January 2025 (Presidential decree; the 2026 budget package kept it at 400,
 *    report.az 23.10.2025; no later change found — the Labour Code now requires a review at least once a year);
 *  - subsistence minimum 2026 for the working-age population 317 AZN (country average 300 AZN), Law No. 295-VIIQ of
 *    9.12.2025 "On the subsistence minimum for 2026";
 *  - average monthly pension 595 AZN as of 1 August 2026 (State Social Protection Fund, sosial.gov.az);
 *  - average monthly nominal wage January–July 2026: 1,176.7 AZN (State Statistical Committee);
 *  - 2-room flat in Baku, long-term rent: no official statistic exists; 600–900 AZN per month is OUR ESTIMATE from
 *    listing portals (lalafo.az, bina.az) in October/November 2026 — central new builds cost more;
 *  - sector wages 2025 (Total column of table 6.2, "Azerbaijan in figures 2026", stat.gov.az).
 * Transfer costs: World Bank Remittance Prices Worldwide, Q1 2025, for sending the equivalent of 200 USD: banks
 * 14.55 % on average, digital remittances 4.85 %, global average 6.49 %. Larger amounts cost a smaller share; our
 * model (fixed fee + exchange-rate margin) is an ESTIMATE, no provider is recommended.
 */

export const MONEY_HOME_AS_OF = '2026-11-17';

export const BAKU_ITEMS = ['rent2', 'pension', 'subsistence', 'minWage', 'avgWage'] as const;
export type BakuItem = (typeof BAKU_ITEMS)[number];

export interface BakuFigure {
  /** AZN per month (rent: middle of the estimated range). */
  azn: number;
  /** Shown range, when the figure is a range. */
  range?: readonly [number, number];
  /** Our estimate (no official statistic) — labelled on the page. */
  estimate: boolean;
  /** Period the figure refers to (shown next to it). */
  period: string;
  source: { label: string; url: string };
}

export const BAKU: Record<BakuItem, BakuFigure> = {
  rent2: {
    azn: 750,
    range: [600, 900],
    estimate: true,
    period: '2026-11',
    source: { label: 'lalafo.az / bina.az – Mietangebote Baku (eigene Auswertung, Schätzung)', url: 'https://lalafo.az/baku/kvartiry' },
  },
  pension: {
    azn: 595,
    estimate: false,
    period: '2026-08',
    source: { label: 'DSMF (sosial.gov.az) – Social indicators, January–July 2026', url: 'https://www.sosial.gov.az/en/media/news/4-billion-568-million-manats-allocated-for-pensions-in-january-july-426-million-manats-more-than-last-year-9659' },
  },
  subsistence: {
    azn: 317,
    estimate: false,
    period: '2026',
    source: { label: 'Law No. 295-VIIQ – subsistence minimum 2026 (report.az, 29.12.2025)', url: 'https://report.az/en/finance/president-aliyev-approves-subsistence-minimum-for-2026' },
  },
  minWage: {
    azn: 400,
    estimate: false,
    period: '2026',
    source: { label: 'Minimum wage 400 AZN since 01.01.2025, unchanged for 2026 (report.az)', url: 'https://report.az/en/finance/minimum-wage-in-azerbaijan-may-remain-at-azn400-in-2026' },
  },
  avgWage: {
    azn: 1176.7,
    estimate: false,
    period: '2026-01/07',
    source: { label: 'State Statistical Committee – labour market (stat.gov.az)', url: 'https://www.stat.gov.az/source/labour/?lang=en' },
  },
};

/** Transfer channels: fixed fee (EUR) and exchange-rate margin / percentage fee (%), [low, high]. ESTIMATES. */
export const TRANSFER_METHODS = ['online', 'bank'] as const;
export type TransferMethod = (typeof TRANSFER_METHODS)[number];
export const TRANSFER_COST: Record<TransferMethod, { fixed: readonly [number, number]; pct: readonly [number, number] }> = {
  // Online money-transfer services (app / website, to an account or card in Azerbaijan).
  online: { fixed: [0, 5], pct: [0.5, 2.5] },
  // International bank transfer (SWIFT, not SEPA): own bank fee + correspondent / receiving fees + currency margin.
  bank: { fixed: [15, 45], pct: [1, 3.5] },
};

export const WORLD_BANK_RPW = {
  quarter: 'Q1 2025',
  banksPct: 14.55,
  digitalPct: 4.85,
  globalPct: 6.49,
  url: 'https://remittanceprices.worldbank.org/',
};

/**
 * Average monthly nominal wage 2025 in Azerbaijan by economic activity (AZN, gross, all employees of the sector —
 * not the profession). Source: stat.gov.az, "Azerbaijan in figures 2026", table 6.2.
 */
export const AZ_SECTOR_WAGE_YEAR = 2025;
export const AZ_SECTOR_WAGES = {
  total: 1102.9,
  transport: 1558.6, // transportation and storage
  health: 939.2, // human health and social work activities
  construction: 1180.0,
  manufacturing: 1002.8,
  accommodation: 783.1, // accommodation and food service activities
  ict: 1879.9, // information and communication
} as const;
export type AzSector = keyof typeof AZ_SECTOR_WAGES;
export const AZ_SECTOR_SOURCE = { label: 'stat.gov.az – Azerbaijan in figures 2026, table 6.2 (wages by economic activity 2025)', url: 'https://www.stat.gov.az/menu/6/statistical_yearbooks/source/azfigures_2026.pdf' };

export const MONEY_HOME_SOURCES = [
  BAKU.avgWage.source,
  BAKU.pension.source,
  BAKU.subsistence.source,
  BAKU.minWage.source,
  BAKU.rent2.source,
  { label: 'World Bank – Remittance Prices Worldwide (Q1 2025)', url: WORLD_BANK_RPW.url },
  { label: 'CBAR – official exchange rates', url: 'https://www.cbar.az/currency/rates?language=en' },
  { label: 'Bundesagentur für Arbeit – Entgeltatlas', url: 'https://web.arbeitsagentur.de/entgeltatlas/' },
  { label: '§ 13 Abs. 1 Nr. 12 ErbStG – Unterhaltszuwendungen schenkungsteuerfrei', url: 'https://www.gesetze-im-internet.de/erbstg_1974/__13.html' },
  { label: '§ 33a EStG – Unterhalt für bedürftige Angehörige', url: 'https://www.gesetze-im-internet.de/estg/__33a.html' },
];
