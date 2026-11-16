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
  ausbildung: ['/salary-calculator', '/cities', '/german-mock-exam/b1'],
  familiennachzug: ['/cost-calculator', '/cities', '/german-mock-exam/a1'],
  'salary-net': ['/salary-calculator', '/cities'],
  'first-month': ['/cities', '/salary-calculator', '/cost-calculator'],
  'work-visa': ['/cost-calculator', '/blue-card-check'],
  'driver-jobs': ['/salary-calculator', '/cities'],
  'jobs-azerbaijan': ['/salary-calculator', '/cities'],
  'anerkennung-bau': ['/anerkennung', '/salary-calculator', '/cities'],
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
  '/life-in-germany': ['first-month', 'salary-net', 'familiennachzug'],
  '/when-in-germany': ['work-visa', 'anerkennung', 'blue-card'],
  '/payslip-explained': ['salary-net', 'first-month'],
  '/german-apartment': ['first-month', 'salary-net'],
  '/residence-card-explained': ['blue-card', 'work-visa', 'familiennachzug'],
  '/shortage-barometer': ['work-visa', 'blue-card', 'anerkennung', 'driver-jobs'],
  '/tax-refund-calculator': ['salary-net', 'first-month'],
  '/shift-pay-calculator': ['salary-net', 'pflege', 'driver-jobs'],
  '/driving-time-calculator': ['driver-jobs', 'salary-net'],
  '/work-schedule-check': ['pflege', 'salary-net'],
  '/tax-class-chooser': ['salary-net', 'familiennachzug'],
  '/employer-cost-calculator': ['work-visa', 'anerkennung'],
  '/rent-check': ['first-month', 'familiennachzug'],
  '/real-salaries': ['salary-net', 'driver-jobs', 'blue-card'],
  '/health-insurance-comparison': ['salary-net', 'first-month'],
  '/emergency-wallpaper': ['first-month'],
  '/holiday-planner': ['first-month', 'salary-net'],
  '/grade-converter': ['anerkennung', 'ausbildung'],
  '/which-city': ['first-month', 'salary-net', 'jobs-azerbaijan'],
  '/permanent-residence': ['blue-card', 'work-visa', 'familiennachzug'],
  '/germany-vs-other-countries': ['work-visa', 'blue-card', 'salary-net', 'familiennachzug'],
  '/visa-refusal': ['work-visa', 'anerkennung', 'familiennachzug'],
  '/visa-document-checklist': ['work-visa', 'anerkennung', 'familiennachzug', 'ausbildung'],
  '/driving-licence-germany': ['driver-jobs', 'first-month'],
  '/family-reunification-check': ['familiennachzug', 'blue-card', 'work-visa'],
  '/german-simulator': ['first-month', 'work-visa'],
  '/pronunciation': ['first-month', 'jobs-azerbaijan'],
  '/price-game': ['first-month', 'salary-net'],
  '/traffic-signs': ['driver-jobs', 'first-month'],
  '/waste-sorting': ['first-month'],
  '/work-scenes/restaurant-kitchen': ['anerkennung-koch', 'first-month'],
  '/work-scenes/truck-cab': ['driver-jobs', 'first-month'],
  '/work-scenes/hospital-ward': ['pflege', 'anerkennung'],
  '/work-scenes/construction-site': ['anerkennung-bau', 'work-visa', 'first-month'],
  '/work-scenes/electrical-panel': ['anerkennung-elektroniker', 'anerkennung'],
  '/calculator': ['work-visa', 'anerkennung'],
  '/eligibility': ['work-visa', 'chancenkarte', 'blue-card', 'ausbildung'],
  '/uygunluq-testi': ['work-visa', 'chancenkarte', 'blue-card', 'ausbildung'],
  '/compare-visas': ['chancenkarte', 'blue-card', 'ausbildung', 'familiennachzug'],
  '/german-mock-exam': ['familiennachzug', 'work-visa', 'ausbildung'],
  '/german-mock-exam/a1': ['familiennachzug', 'work-visa'],
  '/german-mock-exam/b1': ['ausbildung', 'work-visa', 'pflege'],
  '/german-level-test-self': ['work-visa', 'ausbildung', 'familiennachzug'],
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
  '/german-mock-exam/a1': 'nav.germanMockA1',
  '/german-mock-exam/b1': 'nav.germanMockB1',
} as const;
export type GuideToolPath = keyof typeof TOOL_LABEL_KEY;
