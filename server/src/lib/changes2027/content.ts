import { FRESHNESS_ITEMS, type ChangeAudience, type FreshnessItem, type FreshnessStatus } from '../dataFreshness/registry.js';
import { glossaryTerm } from '../glossary/index.js';
import { STATIC_PAGES, textIn } from '../seoCatalogue.js';
import { CHANGES_TEXTS, type ChangesLocale, type ChangesTexts } from './texts.js';

/**
 * "What changes in Germany on 1 January 2027" (/changes-2027): built ONLY from the data freshness registry
 * (lib/dataFreshness/registry.ts) — every item with `upcoming.from` = 2027-01-01 and an `upcoming.change` block.
 * Old value (`change.before`), new value (`upcoming.value`), status and source come from the registry; this
 * module only adds the translated title / explanation (texts.ts) and the related calculators. Pure (no DB).
 * tests/unit/changes2027.test.ts checks that every text maps to a registry entry and the other way round.
 */

export const CHANGES_DATE = '2027-01-01';
/** Day the statuses were last checked against official sources (shown as "as of"). */
export const CHANGES_AS_OF = '2026-11-17';
export const CHANGES_LOCALES: readonly ChangesLocale[] = ['az', 'de', 'en', 'ru', 'tr', 'uk'];
export const STATUS_ORDER: readonly FreshnessStatus[] = ['enacted', 'decided', 'expected', 'proposed'];

/** Related calculators / tools per registry id (site paths; must be public pages). */
export const CHANGE_TOOLS: Record<string, string[]> = {
  'minimum-wage': ['/salary-calculator', '/shift-pay-calculator'],
  'minijob-limit': ['/employer-cost-calculator', '/salary-calculator'],
  'income-tax-tariff': ['/salary-calculator', '/tax-refund-calculator', '/tax-class-chooser'],
  kindergeld: ['/salary-calculator', '/budget'],
  'social-insurance-limits': ['/salary-calculator', '/blue-card-check', '/health-insurance-comparison'],
  'contribution-rates': ['/health-insurance-comparison', '/salary-calculator'],
  deutschlandticket: ['/budget', '/cities'],
  rundfunkbeitrag: ['/budget', '/german-apartment'],
  'blue-card-thresholds': ['/blue-card-check', '/compare-visas'],
};

/** Glossary terms (/glossary/:slug) per registry id. */
export const CHANGE_GLOSSARY: Record<string, string[]> = {
  'minimum-wage': ['mindestlohn'],
  'minijob-limit': ['minijob', 'midijob'],
  'income-tax-tariff': ['grundfreibetrag', 'werbungskosten', 'kinderfreibetrag'],
  kindergeld: ['kindergeld', 'familienkasse'],
  'social-insurance-limits': ['sozialabgaben', 'private-krankenversicherung'],
  'contribution-rates': ['zusatzbeitrag', 'krankenkasse'],
  deutschlandticket: ['deutschlandticket'],
  rundfunkbeitrag: ['rundfunkbeitrag'],
  'blue-card-thresholds': ['blaue-karte-eu'],
};

/** Registry items shown on the page (registry order). */
export const changeRegistryItems = (): (FreshnessItem & { upcoming: NonNullable<FreshnessItem['upcoming']> & { change: NonNullable<NonNullable<FreshnessItem['upcoming']>['change']> } })[] =>
  FRESHNESS_ITEMS.filter((i) => i.upcoming?.from === CHANGES_DATE && i.upcoming.change) as never;

const NUMBER_LOCALE: Record<ChangesLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };

/**
 * Registry figures use the English format ("106,200 €", "48,108.60 €", "2.9 %"); shown in the reader's format.
 * Only numbers with a thousands comma or a decimal point are touched (years, dates, "§ 19c(2)", "45+" stay).
 */
export const localizeFigures = (text: string, lng: ChangesLocale): string => {
  if (lng === 'en') return text;
  const loc = NUMBER_LOCALE[lng];
  return text.replace(/(?<![\d.,-])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d-])|(?<![\d.,-])\d+\.\d+(?![\d.-])/g, (m) => {
    const decimals = m.includes('.') ? m.split('.')[1].length : 0;
    const n = Number(m.replace(/,/g, ''));
    if (!Number.isFinite(n)) return m;
    return new Intl.NumberFormat(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: m.includes(',') }).format(n).replace(/ | /g, ' ');
  });
};

export interface ChangeView {
  id: string;
  title: string;
  text: string;
  before: string;
  after: string;
  from: string;
  status: FreshnessStatus;
  statusName: string;
  statusLabel: string;
  affects: ChangeAudience[];
  /** Already switched automatically on the site on that day (calculators use the new value from 1 January). */
  implemented: boolean;
  source: { label: string; url: string };
  tools: { path: string; label: string }[];
  glossary: { slug: string; term: string }[];
}

export interface ChangesPage {
  lng: ChangesLocale;
  date: string;
  asOf: string;
  texts: Omit<ChangesTexts, 'items'>;
  items: ChangeView[];
  /** Label of the holiday planner link under "also good to know". */
  holidayPlanner: string;
}

export const asChangesLocale = (lng: unknown): ChangesLocale => (CHANGES_LOCALES.includes(lng as ChangesLocale) ? (lng as ChangesLocale) : 'en');

export const changesPage = (lngIn: unknown): ChangesPage => {
  const lng = asChangesLocale(lngIn);
  const { items: itemTexts, ...texts } = CHANGES_TEXTS[lng];
  const items = changeRegistryItems().map((i): ChangeView => {
    const tx = itemTexts[i.id] ?? CHANGES_TEXTS.en.items[i.id] ?? { title: i.label.en, text: '' };
    return {
      id: i.id,
      title: tx.title,
      text: tx.text,
      before: localizeFigures(i.upcoming.change.before, lng),
      after: localizeFigures(i.upcoming.value, lng),
      from: i.upcoming.from,
      status: i.upcoming.status,
      statusName: texts.status[i.upcoming.status],
      statusLabel: localizeFigures(i.upcoming.change.statusLabel[lng], lng),
      affects: i.upcoming.change.affects,
      implemented: i.upcoming.implemented,
      source: i.source,
      tools: (CHANGE_TOOLS[i.id] ?? []).map((path) => ({ path, label: STATIC_PAGES[path] ? textIn(STATIC_PAGES[path].name, lng) : path })),
      glossary: (CHANGE_GLOSSARY[i.id] ?? []).map((slug) => ({ slug, term: glossaryTerm(slug)?.term ?? slug })),
    };
  });
  return { lng, date: CHANGES_DATE, asOf: CHANGES_AS_OF, texts, items, holidayPlanner: textIn(STATIC_PAGES['/holiday-planner'].name, lng) };
};
