/**
 * "What does this page do?" texts of the admin panel, one entry per admin route of client/src/App.tsx.
 *
 * Pure data (no imports, no Node APIs): the client bundles these files for the "?" panel in the admin header
 * (client/src/lib/adminHelp/registry.ts, deploy/web.Dockerfile copies this folder) and the server seeds one
 * Knowledge Base article per page from them (./kbSeed.ts, run by prisma/seed.ts on every deploy).
 */

export const HELP_LOCALES = ['az', 'ru', 'en', 'de'] as const;
export type HelpLocale = (typeof HELP_LOCALES)[number];

export interface PageHelpText {
  /** Page name as staff know it (the sidebar label). */
  title: string;
  /** 1–2 sentences: what the page is for. */
  purpose: string;
  /** "How to use it": exactly three short steps. */
  steps: [string, string, string];
  /** 1–3 short tips (shortcuts, rules, who may do what). */
  tips: string[];
}

export interface PageHelpEntry {
  /** Route path under /admin exactly as written in App.tsx ('' = the /admin index, e.g. 'cases/:id', 'finance/*'). */
  route: string;
  text: Record<HelpLocale, PageHelpText>;
}
