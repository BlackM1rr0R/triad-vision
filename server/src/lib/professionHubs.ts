/**
 * Profession hubs (/for/<slug>): one public page per profession we place most, bundling the relevant tools, the work
 * scene, vocabulary, mock exam, guides, current vacancies and salary orientation. This module is the shared truth of
 * hub → canonical professions (lib/matching.ts keys) and the tools each hub links; the client mirrors it in
 * client/src/lib/professionHubs.ts (tests/unit/professionHubs.test.ts keeps both in line via the slugs).
 */

export const PROFESSION_HUB_SLUGS = ['truck-driver', 'cook', 'nurse', 'care-worker', 'electrician', 'construction-worker'] as const;
export type ProfessionHubSlug = (typeof PROFESSION_HUB_SLUGS)[number];

export interface ProfessionHub {
  slug: ProfessionHubSlug;
  /** Canonical professions (lib/matching.ts PROFESSIONS keys) whose vacancies the hub lists. */
  professions: string[];
  /** Tool pages the hub links (crawlable body too). */
  tools: string[];
}

export const PROFESSION_HUBS: ProfessionHub[] = [
  {
    slug: 'truck-driver',
    professions: ['truck_driver', 'bus_driver', 'courier'],
    tools: ['/salary-calculator', '/driving-time-calculator', '/shift-pay-calculator', '/work-schedule-check', '/driving-licence-germany', '/traffic-signs', '/work-scenes/truck-cab', '/which-city', '/workplace-etiquette'],
  },
  {
    slug: 'cook',
    professions: ['cook', 'baker', 'butcher', 'waiter', 'hotel'],
    tools: ['/salary-calculator', '/shift-pay-calculator', '/work-schedule-check', '/anerkennung', '/work-scenes/restaurant-kitchen', '/german-mock-exam', '/budget', '/which-city', '/workplace-etiquette'],
  },
  {
    slug: 'nurse',
    // Care jobs share one canonical profession (Pflegefachkraft, Altenpflege and Pflegehelfer are all "nurse").
    professions: ['nurse'],
    tools: ['/anerkennung', '/salary-calculator', '/shift-pay-calculator', '/work-schedule-check', '/work-scenes/hospital-ward', '/german-mock-exam', '/blue-card-check', '/family-reunification-check', '/workplace-etiquette'],
  },
  {
    slug: 'care-worker',
    professions: ['nurse'],
    tools: ['/salary-calculator', '/shift-pay-calculator', '/anerkennung', '/work-scenes/hospital-ward', '/german-mock-exam', '/german-level-test-self', '/budget', '/rent-check', '/workplace-etiquette'],
  },
  {
    slug: 'electrician',
    professions: ['electrician'],
    tools: ['/anerkennung', '/salary-calculator', '/work-scenes/electrical-panel', '/german-mock-exam', '/blue-card-check', '/chancenkarte-calculator', '/which-city', '/budget', '/workplace-etiquette'],
  },
  {
    slug: 'construction-worker',
    professions: ['construction_worker', 'welder', 'carpenter', 'painter', 'plumber'],
    tools: ['/salary-calculator', '/work-scenes/construction-site', '/shift-pay-calculator', '/work-schedule-check', '/anerkennung', '/german-mock-exam', '/budget', '/rent-check', '/workplace-etiquette'],
  },
];

export const PROFESSION_HUB_PATHS = PROFESSION_HUB_SLUGS.map((s) => `/for/${s}`);

export const hubBySlug = (slug: string): ProfessionHub | null => PROFESSION_HUBS.find((h) => h.slug === slug) ?? null;

/** The hub of a site path ("/for/cook"), else null. */
export const hubOfPath = (path: string): ProfessionHub | null => {
  const m = /^\/for\/([a-z-]+)$/.exec(path);
  return m ? hubBySlug(m[1]) : null;
};

/** Whether a vacancy's canonical profession belongs to the hub. */
export const hubMatches = (hub: ProfessionHub, profession: string | null | undefined) => !!profession && hub.professions.includes(profession);
