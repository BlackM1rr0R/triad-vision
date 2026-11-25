/**
 * Profession hubs (/for/<slug>): one page per profession bundling the relevant tools, work scene + vocabulary, mock
 * exam, guides, current vacancies (GET /api/profession-hubs/:slug/vacancies) and salary orientation.
 * Mirrors server/src/lib/professionHubs.ts (slugs, professions, tools); server/tests/unit/professionHubs.test.ts
 * checks that both agree. Plain data, no React.
 */
import type { SceneId } from './workScenes/types';

export const PROFESSION_HUB_SLUGS = [
  'truck-driver',
  'cook',
  'nurse',
  'care-worker',
  'electrician',
  'construction-worker',
  // Added 2026-11-25 (SEO profession landings; texts of requirements, visa path, FAQ: server lib/careerPages).
  'courier',
  'warehouse',
  'hospitality',
  'agriculture',
  'mechatronics',
  'it-specialist',
] as const;
export type ProfessionHubSlug = (typeof PROFESSION_HUB_SLUGS)[number];

/**
 * Indicative entry-level gross monthly salary (full time, first job in Germany, € per month) — the same orientation
 * values as the path finder (server lib/publicAi/pathFinder.ts REFERENCE_GROSS): Entgeltatlas of the Federal
 * Employment Agency for entry level, rounded; never below the statutory minimum wage. An ESTIMATE, shown as such.
 */
export const HUB_SALARY_AS_OF = '2026-11-16';
export const HUB_SALARY_SOURCES = [
  { label: 'Bundesagentur für Arbeit — Entgeltatlas', url: 'https://web.arbeitsagentur.de/entgeltatlas/' },
  { label: 'Bundesagentur für Arbeit — Engpassanalyse', url: 'https://statistik.arbeitsagentur.de/DE/Navigation/Statistiken/Interaktive-Statistiken/Fachkraeftebedarf/Engpassanalyse-Nav.html' },
] as const;

export interface ProfessionHub {
  slug: ProfessionHubSlug;
  /** Canonical professions (server lib/matching.ts keys) whose vacancies the hub lists. */
  professions: string[];
  /** Interactive work scene (lib/workScenes), if one fits the profession. */
  scene?: SceneId;
  /** Tool pages (paths of components/audience/tools.ts TOOLS, or work-scene / mock-exam sub pages). */
  tools: string[];
  /** The mock exam the hub recommends. */
  mockExam: '/german-mock-exam/a1' | '/german-mock-exam/b1';
  /** Guide keys (CMS guides, shown when published in the reader's language). */
  guides: string[];
  /** Search term of the Germany-wide job search (/jobs/germany/search?q=). */
  jobSearch: string;
  /** Indicative entry gross per month [low, high] in € (estimate, see HUB_SALARY_SOURCES). */
  salary: readonly [number, number];
  /** Existing glossary terms (/glossary/:slug). */
  glossary: string[];
}

export const PROFESSION_HUBS: ProfessionHub[] = [
  {
    slug: 'truck-driver',
    professions: ['truck_driver', 'bus_driver', 'courier'],
    scene: 'truck-cab',
    tools: ['/salary-calculator', '/driving-time-calculator', '/shift-pay-calculator', '/work-schedule-check', '/driving-licence-germany', '/traffic-signs', '/work-scenes/truck-cab', '/which-city', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/a1',
    guides: ['driver-jobs', 'salary-net', 'first-month', 'work-visa'],
    jobSearch: 'Berufskraftfahrer',
    salary: [2800, 3600],
    glossary: ['fuehrerschein-umschreibung', 'arbeitszeit', 'ueberstunden', 'tarifvertrag', 'berufsgenossenschaft'],
  },
  {
    slug: 'cook',
    professions: ['cook', 'baker', 'butcher', 'waiter', 'hotel'],
    scene: 'restaurant-kitchen',
    tools: ['/salary-calculator', '/shift-pay-calculator', '/work-schedule-check', '/anerkennung', '/work-scenes/restaurant-kitchen', '/german-mock-exam', '/budget', '/which-city', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/a1',
    guides: ['anerkennung-koch', 'salary-net', 'first-month', 'work-visa'],
    jobSearch: 'Koch',
    salary: [2450, 3000],
    glossary: ['anerkennung', 'schichtarbeit', 'mindestlohn', 'arbeitsvertrag', 'probezeit'],
  },
  {
    slug: 'nurse',
    professions: ['nurse'],
    scene: 'hospital-ward',
    tools: ['/anerkennung', '/salary-calculator', '/shift-pay-calculator', '/work-schedule-check', '/work-scenes/hospital-ward', '/german-mock-exam', '/blue-card-check', '/family-reunification-check', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/b1',
    guides: ['pflege', 'anerkennung', 'salary-net', 'familiennachzug'],
    jobSearch: 'Pflegefachkraft',
    salary: [2900, 3900],
    glossary: ['anerkennung', 'berufserlaubnis', 'defizitbescheid', 'anpassungslehrgang', 'kenntnispruefung', 'schichtarbeit'],
  },
  {
    slug: 'care-worker',
    professions: ['nurse'],
    scene: 'hospital-ward',
    tools: ['/salary-calculator', '/shift-pay-calculator', '/anerkennung', '/work-scenes/hospital-ward', '/german-mock-exam', '/german-level-test-self', '/budget', '/rent-check', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/a1',
    guides: ['pflege', 'ausbildung', 'first-month', 'salary-net'],
    jobSearch: 'Pflegehelfer',
    salary: [2900, 3900],
    glossary: ['ausbildung', 'schichtarbeit', 'pflegeversicherung', 'sprachzertifikat', 'probezeit'],
  },
  {
    slug: 'electrician',
    professions: ['electrician'],
    scene: 'electrical-panel',
    tools: ['/anerkennung', '/salary-calculator', '/work-scenes/electrical-panel', '/german-mock-exam', '/blue-card-check', '/chancenkarte-calculator', '/which-city', '/budget', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/b1',
    guides: ['anerkennung-elektroniker', 'anerkennung', 'blue-card', 'salary-net'],
    jobSearch: 'Elektriker',
    salary: [3000, 3900],
    glossary: ['anerkennung', 'handwerkskammer', 'ihk', 'arbeitsunfall', 'berufsgenossenschaft'],
  },
  {
    slug: 'construction-worker',
    professions: ['construction_worker', 'welder', 'carpenter', 'painter', 'plumber'],
    scene: 'construction-site',
    tools: ['/salary-calculator', '/work-scenes/construction-site', '/shift-pay-calculator', '/work-schedule-check', '/anerkennung', '/german-mock-exam', '/budget', '/rent-check', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/a1',
    guides: ['anerkennung-bau', 'ausbildung', 'salary-net', 'work-visa'],
    jobSearch: 'Bauarbeiter',
    salary: [2700, 3500],
    glossary: ['arbeitsunfall', 'berufsgenossenschaft', 'tarifvertrag', 'handwerkskammer', 'ueberstunden'],
  },
  {
    slug: 'courier',
    professions: ['courier'],
    scene: 'truck-cab',
    tools: ['/salary-calculator', '/driving-licence-germany', '/traffic-signs', '/work-schedule-check', '/shift-pay-calculator', '/which-city', '/budget', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/a1',
    guides: ['driver-jobs', 'living-costs', 'salary-net', 'first-month'],
    jobSearch: 'Kurierfahrer',
    salary: [2410, 2900],
    glossary: ['fuehrerschein-umschreibung', 'arbeitszeit', 'mindestlohn', 'ueberstunden', 'probezeit'],
  },
  {
    slug: 'warehouse',
    professions: ['warehouse'],
    tools: ['/salary-calculator', '/shift-pay-calculator', '/work-schedule-check', '/anerkennung', '/german-mock-exam', '/which-city', '/budget', '/rent-check', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/a1',
    guides: ['ausbildung', 'skilled-worker-visa', 'living-costs', 'salary-net'],
    jobSearch: 'Lagerist',
    salary: [2500, 3000],
    glossary: ['schichtarbeit', 'zeitarbeit', 'arbeitsvertrag', 'berufsgenossenschaft', 'arbeitsunfall'],
  },
  {
    slug: 'hospitality',
    professions: ['waiter', 'hotel'],
    scene: 'restaurant-kitchen',
    tools: ['/salary-calculator', '/shift-pay-calculator', '/work-schedule-check', '/work-scenes/restaurant-kitchen', '/german-mock-exam', '/anerkennung', '/budget', '/which-city', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/a1',
    guides: ['ausbildung', 'living-costs', 'salary-net', 'first-month'],
    jobSearch: 'Hotelfachmann',
    salary: [2410, 2900],
    glossary: ['ausbildung', 'schichtarbeit', 'mindestlohn', 'probezeit', 'tarifvertrag'],
  },
  {
    slug: 'agriculture',
    professions: ['agriculture'],
    tools: ['/salary-calculator', '/work-schedule-check', '/budget', '/send-money-home', '/health-insurance-comparison', '/german-mock-exam', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/a1',
    guides: ['work-visa', 'living-costs', 'first-month', 'salary-net'],
    jobSearch: 'Erntehelfer',
    salary: [2410, 2700],
    glossary: ['mindestlohn', 'arbeitszeit', 'befristeter-arbeitsvertrag', 'krankenkasse', 'arbeitsunfall'],
  },
  {
    slug: 'mechatronics',
    professions: ['mechanic'],
    tools: ['/anerkennung', '/salary-calculator', '/german-mock-exam', '/blue-card-check', '/chancenkarte-calculator', '/which-city', '/budget', '/workplace-etiquette'],
    mockExam: '/german-mock-exam/b1',
    guides: ['anerkennung', 'skilled-worker-visa', 'ausbildung', 'salary-net'],
    jobSearch: 'Kfz-Mechatroniker',
    salary: [2900, 3700],
    glossary: ['anerkennung', 'handwerkskammer', 'ausbildung', 'tarifvertrag', 'arbeitsunfall'],
  },
  {
    slug: 'it-specialist',
    professions: ['it'],
    tools: ['/blue-card-check', '/chancenkarte-calculator', '/anerkennung', '/salary-calculator', '/tax-class-chooser', '/which-city', '/rent-check', '/family-reunification-check'],
    mockExam: '/german-mock-exam/a1',
    guides: ['blue-card', 'chancenkarte', 'skilled-worker-visa', 'familiennachzug'],
    jobSearch: 'Softwareentwickler',
    salary: [3600, 4800],
    glossary: ['blaue-karte-eu', 'chancenkarte', 'zeugnisbewertung', 'anabin', 'vorabzustimmung'],
  },
];

export const hubBySlug = (slug: string | undefined): ProfessionHub | null => PROFESSION_HUBS.find((h) => h.slug === slug) ?? null;

export const hubPath = (slug: ProfessionHubSlug) => `/for/${slug}`;

/** Middle of the salary range, rounded to 50 € (prefill of the salary calculator). */
export const salaryMid = (h: Pick<ProfessionHub, 'salary'>) => Math.round((h.salary[0] + h.salary[1]) / 2 / 50) * 50;

/** Germany-wide job search link of a hub. */
export const germanyJobsLink = (h: Pick<ProfessionHub, 'jobSearch'>) => `/jobs/germany/search?q=${encodeURIComponent(h.jobSearch)}`;
