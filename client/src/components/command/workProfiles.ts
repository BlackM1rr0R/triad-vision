// Relative imports (not '@/'): the server unit tests load this module directly (tests/unit/workProfiles.test.ts).
import { hasMinRole, type Role } from '../../lib/types';
import { STAFF_NAV, hubOf, isVisible, type HubKey, type ModuleFlags, type StaffNavItem } from './navRegistry';

/**
 * Work profiles of the simple admin sidebar ("Sadə görünüş"). Each profile lists the pages one kind of work
 * needs, in sidebar order; the simple sidebar shows the profile's pages (grouped by their hub) plus the user's
 * pinned favourites. Role guards and module toggles still apply (isVisible): a profile never shows a page the
 * role cannot open or a switched-off module. Ctrl+K and URLs still reach every page; "Full view" is the old menu.
 * Keys, defaults and the view rule mirror server/src/lib/workProfiles.ts. Labels: wprof.names.<profile>.
 */

export const WORK_PROFILES = ['SALES', 'CASES', 'FINANCE', 'EMPLOYERS', 'CONTENT', 'OWNER'] as const;
export type WorkProfile = (typeof WORK_PROFILES)[number];
export const isWorkProfile = (v: unknown): v is WorkProfile => typeof v === 'string' && (WORK_PROFILES as readonly string[]).includes(v);

export const NAV_VIEWS = ['simple', 'full'] as const;
export type NavView = (typeof NAV_VIEWS)[number];
export const isNavView = (v: unknown): v is NavView => v === 'simple' || v === 'full';

/** Nav ids (navRegistry STAFF_NAV) per profile, in sidebar order. */
export const PROFILE_PAGES: Record<WorkProfile, string[]> = {
  SALES: ['today', 'myDay', 'inquiries', 'bookings', 'calls', 'candidates', 'inbox', 'messaging', 'cannedReplies', 'campaigns', 'referralPartners', 'agents', 'overview', 'analytics', 'ws.mail', 'ws.calendar'],
  CASES: ['today', 'myDay', 'cases', 'review', 'tasks', 'clientTasks', 'requirements', 'expiring', 'dataQuality', 'signatures', 'officialForms', 'recognition', 'accelerated', 'authorities', 'arrivals', 'inbox', 'messaging', 'cannedReplies', 'ws.mail', 'ws.drive'],
  FINANCE: ['today', 'finance', 'invoices', 'clientInvoices', 'packages', 'quotes', 'settlements', 'accounting', 'profitability', 'reports', 'timeTracking', 'bizAnalytics'],
  EMPLOYERS: ['today', 'companies', 'vacancies', 'candidateRequests', 'candidatePool', 'candidates', 'interviews', 'employmentContracts', 'interviewPrep', 'coverLetterTemplates', 'employerChecklist', 'realSalaries', 'jobChannels', 'quotes'],
  CONTENT: ['today', 'posts', 'faqs', 'services', 'visaCategories', 'testimonials', 'guides', 'landingPages', 'leadMagnets', 'docGuides', 'siteTools', 'searchPerformance', 'toolAnalytics', 'dataFreshness', 'translations', 'kb'],
  OWNER: ['dashboard', 'today', 'overview', 'bizAnalytics', 'profitability', 'finance', 'teamLoad', 'kpi', 'oversight', 'weeklyReports', 'cases', 'inquiries', 'users', 'yearReview', 'setupChecklist', 'settings', 'modules'],
};

/** Profile from the old sidebar desk (when one was chosen). */
const DESK_PROFILE: Record<string, WorkProfile> = { MANAGER: 'CASES', FINANCE: 'FINANCE', MARKETING: 'SALES', ALL: 'OWNER' };

/** Profile until one is chosen: the chosen desk's, else admins → management, everyone else → case handling. */
export const defaultWorkProfile = (role: Role | null | undefined, desk?: string | null): WorkProfile =>
  (desk && DESK_PROFILE[desk]) || (hasMinRole(role, 'ADMIN') ? 'OWNER' : 'CASES');

/** Stored profile if valid, else the default. */
export const resolveWorkProfile = (stored: unknown, role: Role | null | undefined, desk?: string | null): WorkProfile =>
  isWorkProfile(stored) ? stored : defaultWorkProfile(role, desk);

/** Stored view; without one, simple once a profile was chosen, else the full menu. */
export const resolveNavView = (stored: unknown, storedProfile: unknown): NavView => (isNavView(stored) ? stored : isWorkProfile(storedProfile) ? 'simple' : 'full');

/** The profile's pages the role may open with the current modules, in profile order. */
export const profileItems = (profile: WorkProfile, role: Role | null | undefined, modules: ModuleFlags | undefined): StaffNavItem[] =>
  PROFILE_PAGES[profile]
    .map((id) => STAFF_NAV.find((i) => i.id === id))
    .filter((i): i is StaffNavItem => !!i && isVisible(i, role, modules));

export interface SimpleGroup {
  /** 'favourites' | 'hub:<key>' | 'workspace' */
  key: string;
  hub?: HubKey;
  items: StaffNavItem[];
}

/**
 * Groups of the simple sidebar: pinned favourites first (any visible page), then the profile's pages grouped by
 * hub in order of first appearance (workspace pages last). A pinned page is not repeated below.
 */
export const simpleSidebarGroups = (profile: WorkProfile, pins: string[], role: Role | null | undefined, modules: ModuleFlags | undefined): SimpleGroup[] => {
  const pinned = pins
    .map((id) => STAFF_NAV.find((i) => i.id === id))
    .filter((i): i is StaffNavItem => !!i && isVisible(i, role, modules));
  const pinnedIds = new Set(pinned.map((i) => i.id));
  const groups: SimpleGroup[] = pinned.length ? [{ key: 'favourites', items: pinned }] : [];
  const byKey = new Map<string, SimpleGroup>();
  const workspace: StaffNavItem[] = [];
  for (const item of profileItems(profile, role, modules)) {
    if (pinnedIds.has(item.id)) continue;
    const hub = hubOf(item.id);
    if (!hub) {
      workspace.push(item);
      continue;
    }
    const key = `hub:${hub}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, hub, items: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.items.push(item);
  }
  if (workspace.length) groups.push({ key: 'workspace', items: workspace });
  return groups;
};
