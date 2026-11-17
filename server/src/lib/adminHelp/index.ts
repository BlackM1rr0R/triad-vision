import type { PageHelpEntry } from './types.js';
import { PAGES_TODAY } from './pages/today.js';
import { PAGES_CASES } from './pages/cases.js';
import { PAGES_CLIENTS } from './pages/clients.js';
import { PAGES_EMPLOYERS } from './pages/employers.js';
import { PAGES_COMMS } from './pages/comms.js';
import { PAGES_FINANCE } from './pages/finance.js';
import { PAGES_SITE } from './pages/site.js';
import { PAGES_SYSTEM } from './pages/system.js';
import { PAGES_EXTRA } from './pages/extra.js';

export * from './types.js';

/** Every admin page's "What does this page do?" entry (one per admin route of client/src/App.tsx). */
export const ADMIN_PAGE_HELP: PageHelpEntry[] = [
  ...PAGES_TODAY,
  ...PAGES_CASES,
  ...PAGES_CLIENTS,
  ...PAGES_EMPLOYERS,
  ...PAGES_COMMS,
  ...PAGES_FINANCE,
  ...PAGES_SITE,
  ...PAGES_SYSTEM,
  ...PAGES_EXTRA,
];

/** Admin routes of App.tsx that only redirect (no page of their own, so no help entry). */
export const ADMIN_HELP_REDIRECT_ROUTES = ['docs', 'q/:caseId'];

/** Knowledge Base system key of a page's article (KbArticle.systemKey). */
export const kbSystemKey = (route: string) => `admin-page:${route === '' ? 'index' : route}`;
