/**
 * Page help ("?" button, components/pageHelp/PageHelpButton): which pages have a short help text, keyed by route
 * pattern (as in App.tsx: ":param" = one path segment, "/*" = the rest). The texts themselves (three short, very
 * simple sentences: what is this · why do I need it · what should I do here) live per language in ./texts/<lng>.ts
 * and are loaded only when someone opens the help, so this list is all the page shell carries.
 *
 * Public pages: az, de, en, ru, tr, uk. Client portal pages (/account…): az, de, en, ru (tr / uk read en).
 * tests: lib/pageHelp/registry.test.ts — every tool of components/audience/tools.ts and every /account route of
 * App.tsx needs an entry here and a text in every required language. Admin / staff pages have their own help.
 * Plain data + a matcher, no React.
 */
import { splitLocalePath } from '@/lib/siteLocale';

/** Public tools, games, work scenes and hubs. */
export const PUBLIC_HELP_ROUTES = [
  // start + hubs
  '/start',
  '/start/plan',
  '/tools',
  '/for/:profession',
  // am I eligible?
  '/path-finder',
  '/uygunluq-testi',
  '/eligibility',
  '/compare-visas',
  '/blue-card-check',
  '/chancenkarte-calculator',
  '/anerkennung',
  '/family-reunification-check',
  '/germany-vs-other-countries',
  '/visa-document-checklist',
  '/visa-refusal',
  '/grade-converter',
  // money
  '/salary-calculator',
  '/cost-calculator',
  '/budget',
  '/payslip-explained',
  '/tax-refund-calculator',
  '/shift-pay-calculator',
  '/tax-class-chooser',
  '/rent-check',
  '/send-money-home',
  '/real-salaries',
  '/health-insurance-comparison',
  // plan the move
  '/when-in-germany',
  '/permanent-residence',
  '/five-years-in-germany',
  '/which-city',
  '/residence-card-explained',
  '/calculator',
  '/cities',
  '/events',
  '/status',
  '/changes-2027',
  // life in Germany
  '/life-in-germany',
  '/driving-licence-germany',
  '/german-apartment',
  '/apartment-viewing',
  '/german-street',
  '/holiday-planner',
  '/advent-calendar',
  '/weekend-trips',
  '/driving-time-calculator',
  '/work-schedule-check',
  '/emergency-wallpaper',
  '/pocket-guide',
  // explore
  '/map',
  '/azerbaijan-in-germany',
  '/guides',
  '/glossary',
  '/shortage-barometer',
  '/jobs',
  '/visas',
  // learn German (games, exams, scenes)
  '/german-mock-exam',
  '/german-mock-exam/a1',
  '/german-mock-exam/b1',
  '/german-level-test-self',
  '/german-simulator',
  '/pronunciation',
  '/price-game',
  '/traffic-signs',
  '/waste-sorting',
  '/ticket-machine',
  '/supermarket-game',
  '/workplace-etiquette',
  '/work-scenes',
  '/work-scenes/restaurant-kitchen',
  '/work-scenes/truck-cab',
  '/work-scenes/hospital-ward',
  '/work-scenes/construction-site',
  '/work-scenes/electrical-panel',
  // employers
  '/employer-cost-calculator',
  '/employer-guide-azerbaijan',
  '/kandidaten',
  '/novruz-card',
] as const;

/** Client portal (/account, App.tsx). */
export const PORTAL_HELP_ROUTES = [
  '/account',
  '/account/cases',
  '/account/cases/:id',
  '/account/cases/:id/forms/:formId',
  '/account/cases/:id/confirm',
  '/account/notifications',
  '/account/profile',
  '/account/applications',
  '/account/saved-jobs',
  '/account/job-applications',
  '/account/onboarding',
  '/account/housing',
  '/account/german',
  '/account/interviews',
  '/account/privacy',
  '/account/waiting-room',
  '/account/course',
  '/account/course/:courseId',
  '/account/course/:courseId/lesson/:lessonId',
  '/account/guides',
  '/account/cv',
  '/account/letters/*',
  '/account/letters-explain',
  '/account/vault',
  '/account/referral',
  '/account/arrival',
  '/account/arrival-prep',
  '/account/arrival-card',
  '/account/readiness',
  '/account/germany-ready',
  '/account/future-letter',
  '/account/rate-alerts',
  '/account/pocket-guide',
  '/account/emergency-wallpaper',
  '/account/badges',
  '/account/visa-story/:caseId',
  '/account/rule-changes',
  '/account/checklist',
  '/account/budget',
  '/account/interview-prep',
  '/account/signatures',
  '/account/signatures/:signerId',
  '/account/payments',
  '/account/all',
] as const;

export type PublicHelpRoute = (typeof PUBLIC_HELP_ROUTES)[number];
export type PortalHelpRoute = (typeof PORTAL_HELP_ROUTES)[number];
export type HelpRoute = PublicHelpRoute | PortalHelpRoute;

/** One help text: three short sentences. */
export interface PageHelpText {
  /** What is this? */
  what: string;
  /** Why do I need it? */
  why: string;
  /** What should I do here? */
  todo: string;
}

/** az / de / en / ru: every route. */
export type FullHelpTexts = Record<HelpRoute, PageHelpText>;
/** tr / uk: the public pages (portal pages fall back to English). */
export type PublicHelpTexts = Record<PublicHelpRoute, PageHelpText>;

export const HELP_ROUTES: readonly HelpRoute[] = [...PUBLIC_HELP_ROUTES, ...PORTAL_HELP_ROUTES];

const segments = (p: string) => p.split('/').filter(Boolean);

/** Does a route pattern match a path (without language prefix)? Returns a specificity score, or -1. */
export const matchScore = (pattern: string, path: string): number => {
  const pat = segments(pattern);
  const seg = segments(path);
  const splat = pat[pat.length - 1] === '*';
  const fixed = splat ? pat.slice(0, -1) : pat;
  if (splat ? seg.length < fixed.length : seg.length !== fixed.length) return -1;
  let score = 0;
  for (let i = 0; i < fixed.length; i++) {
    if (fixed[i].startsWith(':')) score += 1;
    else if (fixed[i] === seg[i]) score += 3;
    else return -1;
  }
  return splat ? score : score + 1;
};

/** The help route of a pathname ("/de/salary-calculator" → "/salary-calculator"), or null (no help there). */
export const helpRouteOf = (pathname: string): HelpRoute | null => {
  const rest = splitLocalePath(pathname.split(/[?#]/)[0]).rest.replace(/\/+$/, '') || '/';
  let best: HelpRoute | null = null;
  let bestScore = -1;
  for (const r of HELP_ROUTES) {
    const s = matchScore(r, rest);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
};

export const isPortalHelpRoute = (r: HelpRoute): r is PortalHelpRoute => r === '/account' || r.startsWith('/account/');

type HelpLocale = 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';

const LOADERS: Record<HelpLocale, () => Promise<Partial<Record<HelpRoute, PageHelpText>>>> = {
  az: () => import('./texts/az').then((m) => m.HELP_AZ),
  de: () => import('./texts/de').then((m) => m.HELP_DE),
  en: () => import('./texts/en').then((m) => m.HELP_EN),
  ru: () => import('./texts/ru').then((m) => m.HELP_RU),
  tr: () => import('./texts/tr').then((m) => m.HELP_TR),
  uk: () => import('./texts/uk').then((m) => m.HELP_UK),
};

/** The help text of a route in a language (tr / uk without a text: English). */
export const loadPageHelp = async (route: HelpRoute, lng: string): Promise<PageHelpText | null> => {
  const l = (lng.slice(0, 2) in LOADERS ? lng.slice(0, 2) : 'en') as HelpLocale;
  const own = (await LOADERS[l]())[route];
  if (own) return own;
  return (await LOADERS.en())[route] ?? null;
};
