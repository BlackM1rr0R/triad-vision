/**
 * Internal links between topic guides and tools. Same map as server/src/lib/seoLinks.ts (crawlable body);
 * server/tests/unit/seo.test.ts checks that both agree. No imports: plain data.
 */

/** Tools that belong to a guide (by guide key; the visa check is added to every guide). */
export const GUIDE_TOOLS: Record<string, string[]> = {
  chancenkarte: ['/chancenkarte-calculator', '/cost-calculator'],
  'blue-card': ['/blue-card-check', '/salary-calculator'],
  anerkennung: ['/anerkennung', '/salary-calculator'],
  pflege: ['/anerkennung', '/salary-calculator'],
  ausbildung: ['/salary-calculator', '/cities'],
  familiennachzug: ['/cost-calculator', '/cities'],
  'salary-net': ['/salary-calculator', '/cities'],
  'first-month': ['/cities', '/salary-calculator', '/cost-calculator'],
  'work-visa': ['/cost-calculator', '/blue-card-check'],
  'driver-jobs': ['/salary-calculator', '/cities'],
  'jobs-azerbaijan': ['/salary-calculator', '/cities'],
};

export const ELIGIBILITY_TOOL = '/eligibility';

/** Tools of a guide key: its own (anerkennung-* like anerkennung, employer-* none), then the visa check. */
export const guideTools = (key: string): string[] => {
  const own = GUIDE_TOOLS[key] ?? (key.startsWith('anerkennung-') ? GUIDE_TOOLS.anerkennung : key.startsWith('employer-') ? [] : ['/salary-calculator', '/cities']);
  return [...own.filter((p) => p !== ELIGIBILITY_TOOL), ELIGIBILITY_TOOL];
};

/** Guide keys shown under a tool (most relevant first). */
export const TOOL_GUIDES: Record<string, string[]> = {
  '/salary-calculator': ['salary-net', 'blue-card', 'first-month', 'driver-jobs'],
  '/cities': ['first-month', 'salary-net', 'familiennachzug', 'ausbildung'],
  '/chancenkarte-calculator': ['chancenkarte', 'anerkennung', 'work-visa'],
  '/blue-card-check': ['blue-card', 'work-visa', 'salary-net'],
  '/anerkennung': ['anerkennung', 'pflege'],
  '/cost-calculator': ['first-month', 'chancenkarte', 'familiennachzug'],
  '/budget': ['first-month', 'salary-net'],
  '/calculator': ['work-visa', 'anerkennung'],
  '/eligibility': ['work-visa', 'chancenkarte', 'blue-card', 'ausbildung'],
  '/uygunluq-testi': ['work-visa', 'chancenkarte', 'blue-card', 'ausbildung'],
  '/compare-visas': ['chancenkarte', 'blue-card', 'ausbildung', 'familiennachzug'],
};

/** Label key (nav.*) of each tool linked from a guide. */
export const TOOL_LABEL_KEY = {
  '/chancenkarte-calculator': 'nav.chancenkarte',
  '/blue-card-check': 'nav.blueCard',
  '/salary-calculator': 'nav.salary',
  '/anerkennung': 'nav.anerkennung',
  '/cities': 'nav.cities',
  '/cost-calculator': 'nav.costCalculator',
  '/eligibility': 'nav.eligibility',
} as const;
export type GuideToolPath = keyof typeof TOOL_LABEL_KEY;
