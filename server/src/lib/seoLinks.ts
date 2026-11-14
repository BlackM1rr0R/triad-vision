/**
 * Internal links between the topic guides and the tools (calculators, checks, cities), for the crawlable body
 * (lib/seoBody.ts). The visible pages use the same map: client/src/lib/guideTools.ts (tests/unit/seo.test.ts
 * checks that both agree).
 *
 *   guide → tools  : the "Tools" box next to a guide (client: pages/guides/GuideDetail.tsx).
 *   tool  → guides : the "Related guides" block under a tool (client: components/guides/RelatedGuides.tsx).
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

/** Every guide links the visa check last. */
export const ELIGIBILITY_TOOL = '/eligibility';

/** Tools of a guide key: its own (profession recognition guides anerkennung-* like anerkennung), then the visa check. */
export const guideTools = (key: string): string[] => {
  const own = GUIDE_TOOLS[key] ?? (key.startsWith('anerkennung-') ? GUIDE_TOOLS.anerkennung : key.startsWith('employer-') ? [] : ['/salary-calculator', '/cities']);
  return [...own.filter((p) => p !== ELIGIBILITY_TOOL), ELIGIBILITY_TOOL];
};

/** Guide keys shown first under a tool (most relevant first). */
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

/** Guides ordered for a tool page: its related keys first (in that order), then the others. */
export const orderGuidesForTool = <T extends { key: string }>(toolPath: string, guides: T[]): T[] => {
  const keys = TOOL_GUIDES[toolPath] ?? [];
  const rank = (g: T) => {
    const i = keys.indexOf(g.key);
    return i < 0 ? keys.length : i;
  };
  return [...guides].sort((a, b) => rank(a) - rank(b));
};
