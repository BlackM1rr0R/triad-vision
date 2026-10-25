import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AtSign,
  Banknote,
  BarChart3,
  BookOpen,
  BookOpenText,
  BookUser,
  Bot,
  Briefcase,
  BriefcaseBusiness,
  Bug,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarHeart,
  ClipboardList,
  Copy,
  Eye,
  FileBarChart2,
  FileImage,
  FileSearch,
  FileSignature,
  FileText,
  FolderKanban,
  FolderOpen,
  Gauge,
  Globe,
  GraduationCap,
  Handshake,
  HardDrive,
  HeartHandshake,
  Headset,
  HelpCircle,
  History,
  Hourglass,
  Inbox,
  KanbanSquare,
  Languages,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  ListTodo,
  Mail,
  MailCheck,
  Megaphone,
  MessageCircleQuestion,
  MessageSquareQuote,
  MessageSquareText,
  MessagesSquare,
  Newspaper,
  Package,
  PanelsTopLeft,
  PhoneCall,
  PlaneLanding,
  Plug,
  Receipt,
  Rocket,
  Route,
  Scale,
  Settings,
  Sheet,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Smile,
  Sparkles,
  Star,
  Target,
  Timer,
  ToggleRight,
  TrendingUp,
  UserSearch,
  Users,
  UsersRound,
  Vault,
  Video,
  Wallet,
  Wand2,
  Workflow,
  ScrollText,
  BookOpenCheck,
  Signature as SignatureIcon,
  Palette,
  BadgeCheck,
  KeyRound,
  Store,
} from 'lucide-react';
// Relative (not '@/'): the server unit tests load this module directly (tests/unit/adminNavRegistry.test.ts).
import { hasMinRole, type Role } from '../../lib/types';

/**
 * One list of every staff page (admin + workspace). The command palette (Ctrl+K) offers all of them under
 * "Go to"; the admin sidebar shows the user's desk (DESK_ITEMS), favourites, recent pages and the hubs (HUBS:
 * 12 sections whose pages appear as tabs above each page). Role rules match the routes in App.tsx
 * (`RequireAuth roles`): `adminOnly` = ADMIN+, `superOnly` = SUPER_ADMIN. `module` = optional feature a
 * SUPER_ADMIN can switch off (System → Modules); a disabled module hides the page everywhere in the menu.
 */

/** Former sidebar groups; still used as the sub-line of a page in Ctrl+K. */
export type NavGroupKey = 'today' | 'work' | 'clients' | 'employers' | 'comms' | 'finance' | 'site' | 'system';

export const NAV_GROUPS: { key: NavGroupKey; icon: LucideIcon }[] = [
  { key: 'today', icon: LayoutDashboard },
  { key: 'work', icon: FolderKanban },
  { key: 'clients', icon: Users },
  { key: 'employers', icon: Building2 },
  { key: 'comms', icon: MessageSquareText },
  { key: 'finance', icon: Wallet },
  { key: 'site', icon: Layers },
  { key: 'system', icon: Settings },
];

// ─── Modules (System → Modules, SUPER_ADMIN) ───────────────────────────

/** Same keys as server lib/navModules.ts (MODULE_KEYS). Labels: anav.modules.<key>.title / .desc. */
export const MODULE_KEYS = [
  'campaigns',
  'liveChat',
  'calls',
  'landingPages',
  'events',
  'referrals',
  'agents',
  'training',
  'shifts',
  'waitingRoom',
  'aiAssistant',
  'settlements',
  'originals',
  'surveys',
  'reviews',
  'announcements',
  'interviewPrep',
  'translations',
  'timeTracking',
  'kpi',
  'examDates',
  'journey',
  'bookings',
  'knowledgeBase',
  'quotes',
  'checkIns',
  'guides',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleFlags = Partial<Record<ModuleKey, boolean>>;

/** A module is on unless it was switched off explicitly (unknown / not loaded yet = on). */
export const moduleOn = (modules: ModuleFlags | undefined, key: ModuleKey | undefined) => !key || modules?.[key] !== false;

export interface StaffNavItem {
  /** Stable id: favourites, recents, usage statistics and synonyms refer to it. */
  id: string;
  to: string;
  /** Full i18n key of the label. */
  labelKey: string;
  icon: LucideIcon;
  area: 'admin' | 'workspace';
  /** Former sidebar group (sub-line in Ctrl+K). */
  group?: NavGroupKey;
  end?: boolean;
  adminOnly?: boolean;
  superOnly?: boolean;
  /** Live counter shown on the sidebar item. */
  badge?: 'today' | 'training';
  /** Optional feature (System → Modules); hidden when switched off. */
  module?: ModuleKey;
  /** White-label: only on the owner's own instance (INSTANCE_ROLE=owner), e.g. the list of customer agencies. */
  ownerOnly?: boolean;
}

// White-label instance role from GET /admin/me/nav (navPrefs.ts sets it); unknown = not the owner's instance.
let ownerInstance = false;
export const setOwnerInstance = (v: boolean) => {
  ownerInstance = v;
};

const a = (id: string, to: string, icon: LucideIcon, group: NavGroupKey | undefined, extra: Partial<StaffNavItem> = {}): StaffNavItem => ({
  id,
  to,
  labelKey: `admin.nav.${id}`,
  icon,
  area: 'admin',
  group,
  ...extra,
});

const content = (id: string, resource: string, icon: LucideIcon): StaffNavItem =>
  a(id, `/admin/content/${resource}`, icon, 'site', { adminOnly: true });

const w = (id: string, path: string, icon: LucideIcon, module?: ModuleKey): StaffNavItem => ({
  id: `ws.${id}`,
  to: `/workspace/${path}`,
  labelKey: `workspace.nav.${id}`,
  icon,
  area: 'workspace',
  module,
});

export const STAFF_NAV: StaffNavItem[] = [
  // Bu gün
  a('today', '/admin/today', ListChecks, 'today', { badge: 'today' }),
  a('dashboard', '/admin', LayoutDashboard, 'today', { end: true }),
  a('workspace', '/workspace/home', LayoutGrid, 'today'),
  // İşlər
  a('cases', '/admin/cases', FolderKanban, 'work'),
  a('kanban', '/admin/kanban', KanbanSquare, 'work'),
  a('tasks', '/admin/tasks', ListTodo, 'work'),
  a('clientTasks', '/admin/client-tasks', ClipboardList, 'work'),
  a('requirements', '/admin/requirements', ListChecks, 'work'),
  a('signatures', '/admin/signatures', FileSignature, 'work'),
  a('countersign', '/admin/countersign', SignatureIcon, 'work', { adminOnly: true }), // Triad Vision countersignature of service contracts
  a('officialForms', '/admin/official-forms', FileText, 'work'), // official fillable PDFs: templates + mapping (ADMIN edits, STAFF uses)
  a('expiring', '/admin/expiring', Hourglass, 'work'),
  a('recognition', '/admin/recognition', GraduationCap, 'work'), // Anerkennung procedures of all cases
  a('accelerated', '/admin/accelerated', Rocket, 'work'), // § 81a accelerated skilled-worker procedures
  a('originals', '/admin/originals', Vault, 'work', { module: 'originals' }),
  a('arrivals', '/admin/arrivals', PlaneLanding, 'work'),
  a('checkIns', '/admin/check-ins', HeartHandshake, 'work', { module: 'checkIns' }),
  a('examDates', '/admin/exam-dates', CalendarClock, 'work', { module: 'examDates' }),
  a('journey', '/admin/journey', Route, 'work', { module: 'journey' }),
  a('shifts', '/admin/shifts', CalendarRange, 'work', { module: 'shifts' }), // team calendar: shifts, leave, handovers
  // Müştərilər
  a('users', '/admin/users', Users, 'clients'),
  a('candidates', '/admin/candidates', UserSearch, 'clients'),
  a('register', '/admin/register', Sheet, 'clients'),
  a('duplicates', '/admin/duplicates', Copy, 'clients', { adminOnly: true }),
  a('inquiries', '/admin/inquiries', Inbox, 'clients'),
  a('privacyRequests', '/admin/privacy-requests', ShieldHalf, 'clients', { adminOnly: true }),
  a('referralPartners', '/admin/partners', Handshake, 'clients', { module: 'referrals' }),
  // İşəgötürənlər
  a('companies', '/admin/companies', Building2, 'employers'),
  a('vacancies', '/admin/vacancies', BriefcaseBusiness, 'employers'),
  a('candidateRequests', '/admin/candidate-requests', UsersRound, 'employers'),
  a('quotes', '/admin/quotes', FileSignature, 'employers', { adminOnly: true, module: 'quotes' }),
  a('interviews', '/admin/interviews', Video, 'employers'),
  a('employmentContracts', '/admin/employment-contracts', FileText, 'employers'),
  a('interviewPrep', '/admin/interview-prep', MessageCircleQuestion, 'employers', { module: 'interviewPrep' }),
  // Ünsiyyət
  a('messaging', '/admin/messaging', MessageSquareText, 'comms'),
  a('mailboxes', '/admin/mailboxes', AtSign, 'comms', { adminOnly: true }),
  a('mailTriage', '/admin/ai/mail-triage', MailCheck, 'comms', { superOnly: true, module: 'aiAssistant' }),
  a('campaigns', '/admin/campaigns', Megaphone, 'comms', { adminOnly: true, module: 'campaigns' }),
  a('calls', '/admin/calls', PhoneCall, 'comms', { module: 'calls' }),
  a('bookings', '/admin/bookings', CalendarClock, 'comms', { module: 'bookings' }),
  a('events', '/admin/events', CalendarHeart, 'comms', { module: 'events' }),
  a('announcements', '/admin/announcements', Megaphone, 'comms', { module: 'announcements' }),
  a('surveys', '/admin/surveys', Smile, 'comms', { module: 'surveys' }),
  a('reviews', '/admin/reviews', Star, 'comms', { module: 'reviews' }),
  // Maliyyə
  a('invoices', '/admin/invoices', Receipt, 'finance', { adminOnly: true }),
  a('clientInvoices', '/admin/client-invoices', Receipt, 'finance', { adminOnly: true }), // invoices + payments of private clients
  a('packages', '/admin/packages', Package, 'finance', { adminOnly: true }), // service packages + online orders
  a('accounting', '/admin/accounting', BookOpenCheck, 'finance', { adminOnly: true }), // DATEV export, currencies, billing entities, exchange rates
  a('settlements', '/admin/settlements', Banknote, 'finance', { module: 'settlements' }),
  a('finance', '/admin/finance', Wallet, 'finance', { adminOnly: true }),
  a('profitability', '/admin/profitability', TrendingUp, 'finance', { adminOnly: true }),
  a('timeTracking', '/admin/time', Timer, 'finance', { module: 'timeTracking' }),
  a('reports', '/admin/reports', FileBarChart2, 'finance', { adminOnly: true }),
  a('analytics', '/admin/analytics', BarChart3, 'finance'),
  a('weeklyReports', '/admin/weekly-reports', FileBarChart2, 'finance', { superOnly: true }),
  // Sayt
  content('services', 'services', Layers),
  content('visaCategories', 'visa-categories', Briefcase),
  content('partners', 'partners', Handshake),
  content('visaSamples', 'visa-samples', FileImage),
  content('testimonials', 'testimonials', MessageSquareQuote),
  content('stats', 'stats', TrendingUp),
  content('faqs', 'faqs', HelpCircle),
  content('posts', 'posts', Newspaper),
  a('kb', '/admin/kb', BookOpenText, 'site', { module: 'knowledgeBase' }),
  a('translations', '/admin/translations', Languages, 'site', { module: 'translations' }),
  a('docGuides', '/admin/doc-guides', BookOpen, 'site'),
  a('waitingRoom', '/admin/waiting-room', Hourglass, 'site', { module: 'waitingRoom' }),
  a('caseForms', '/admin/case-forms', ListChecks, 'site'),
  a('contractTemplates', '/admin/contract-templates', FileText, 'site', { adminOnly: true }),
  a('siteTools', '/admin/site-tools', Wand2, 'site'),
  a('landingPages', '/admin/landing-pages', PanelsTopLeft, 'site', { module: 'landingPages' }),
  a('leadMagnets', '/admin/lead-magnets', BookOpen, 'site', { adminOnly: true, module: 'landingPages' }), // e-book lead magnets
  a('guides', '/admin/guides', BookOpen, 'site', { adminOnly: true, module: 'guides' }), // SEO topic guides (6 languages)
  a('problemReports', '/admin/problems', Bug, 'site', { adminOnly: true }),
  // Sistem
  a('settings', '/admin/settings', Settings, 'system', { adminOnly: true }),
  a('legal', '/admin/legal', ScrollText, 'system', { adminOnly: true }),
  a('security', '/admin/security', ShieldCheck, 'system'),
  a('securityAlerts', '/admin/security-alerts', ShieldAlert, 'system', { superOnly: true }),
  a('sensitiveAccess', '/admin/sensitive-access', ShieldHalf, 'system', { superOnly: true }),
  a('history', '/admin/history', History, 'system', { adminOnly: true }),
  a('storage', '/admin/storage', HardDrive, 'system', { adminOnly: true }),
  a('automation', '/admin/automation', Workflow, 'system', { adminOnly: true }),
  a('integrations', '/admin/integrations', Plug, 'system', { adminOnly: true }),
  a('ai', '/admin/ai', Sparkles, 'system', { superOnly: true, module: 'aiAssistant' }),
  a('agents', '/admin/agents', Handshake, 'system', { adminOnly: true, module: 'agents' }),
  a('oversight', '/admin/oversight', Eye, 'system', { superOnly: true }),
  a('kpi', '/admin/kpi', Gauge, 'system', { adminOnly: true, module: 'kpi' }), // staff KPI leaderboard
  a('training', '/admin/training', GraduationCap, 'system', { badge: 'training', module: 'training' }), // internal training (badge: unfinished required courses)
  a('help', '/admin/help', LifeBuoy, 'system'),
  // Navigation settings: module toggles, page usage (SUPER_ADMIN), staff desks (ADMIN+)
  a('modules', '/admin/system/modules', ToggleRight, 'system', { superOnly: true }),
  a('usage', '/admin/system/usage', Activity, 'system', { superOnly: true }),
  a('designSystem', '/admin/design-system', Palette, 'system', { adminOnly: true }), // tokens + component catalogue
  // White-label: brand of this instance, its licence, and (owner instance only) the customer agencies.
  a('brand', '/admin/system/brand', BadgeCheck, 'system', { superOnly: true }),
  a('license', '/admin/system/license', KeyRound, 'system', { superOnly: true }),
  a('customers', '/admin/system/customers', Store, 'system', { superOnly: true, ownerOnly: true }),
  // Sub-pages without a former sidebar entry
  a('docsAudit', '/admin/docs/audit', FileSearch, undefined),
  a('aiSettings', '/admin/ai/settings', Bot, undefined, { superOnly: true, module: 'aiAssistant' }),
  // Workspace
  w('home', 'home', LayoutDashboard),
  w('mail', 'mail', Mail),
  w('chat', 'chat', MessagesSquare),
  w('calendar', 'calendar', CalendarDays),
  w('drive', 'drive', FolderOpen),
  w('settlements', 'settlements', Banknote, 'settlements'),
  w('tasks', 'tasks', ListTodo),
  w('contacts', 'contacts', BookUser),
  w('team', 'team', Users),
  w('liveChats', 'live-chats', Headset, 'liveChat'),
];

/** Whether a role may open the item (mirrors the route guards). */
export const canSee = (item: Pick<StaffNavItem, 'adminOnly' | 'superOnly' | 'ownerOnly'>, role: Role | null | undefined) =>
  hasMinRole(role, 'STAFF') &&
  (!item.superOnly || hasMinRole(role, 'SUPER_ADMIN')) &&
  (!item.adminOnly || hasMinRole(role, 'ADMIN')) &&
  (!item.ownerOnly || ownerInstance);

/** Staff below ADMIN land on /admin/dashboard (the /admin index redirects them elsewhere). */
export const hrefFor = (item: StaffNavItem, role: Role | null | undefined) =>
  item.id === 'dashboard' && !hasMinRole(role, 'ADMIN') ? '/admin/dashboard' : item.to;

/** The item whose route contains the pathname best (longest match; `end` items only match exactly). */
export const activeNavItem = (pathname: string, items: StaffNavItem[] = STAFF_NAV) => {
  let best: StaffNavItem | undefined;
  for (const item of items) {
    const exact = pathname === item.to || (item.id === 'dashboard' && pathname === '/admin/dashboard');
    const prefix = !item.end && pathname.startsWith(`${item.to}/`);
    if ((exact || prefix) && (!best || item.to.length > best.to.length)) best = item;
  }
  return best;
};

// ─── Hubs ───────────────────────────────────────────────────────────────

export type HubKey = 'today' | 'cases' | 'clients' | 'employers' | 'comms' | 'finance' | 'site' | 'leads' | 'team' | 'compliance' | 'ai' | 'system';

/**
 * Hubs replace the long flat menu: each one is a sidebar entry (/admin/hub/<key> opens its last or first tab)
 * and its pages are shown as tabs above the page. Every admin page belongs to exactly one hub; the pages keep
 * their own URLs, so old links and bookmarks still open them. Labels: anav.hubs.<key>.
 */
export const HUBS: { key: HubKey; icon: LucideIcon; tabs: string[] }[] = [
  { key: 'today', icon: LayoutDashboard, tabs: ['today', 'dashboard', 'kanban', 'tasks', 'clientTasks'] },
  { key: 'cases', icon: FolderKanban, tabs: ['cases', 'requirements', 'docsAudit', 'expiring', 'recognition', 'accelerated', 'originals', 'signatures', 'countersign', 'officialForms', 'caseForms', 'contractTemplates', 'translations'] },
  { key: 'clients', icon: Users, tabs: ['candidates', 'register', 'duplicates', 'checkIns', 'arrivals', 'journey', 'examDates', 'waitingRoom'] },
  { key: 'employers', icon: Building2, tabs: ['companies', 'vacancies', 'candidateRequests', 'interviews', 'employmentContracts', 'interviewPrep'] },
  { key: 'comms', icon: MessageSquareText, tabs: ['messaging', 'mailboxes', 'calls', 'campaigns', 'announcements', 'surveys', 'reviews'] },
  { key: 'finance', icon: Wallet, tabs: ['finance', 'invoices', 'clientInvoices', 'packages', 'accounting', 'quotes', 'settlements', 'profitability', 'reports'] },
  { key: 'leads', icon: Target, tabs: ['inquiries', 'bookings', 'analytics', 'referralPartners', 'agents'] },
  {
    key: 'site',
    icon: Globe,
    tabs: ['services', 'visaCategories', 'partners', 'visaSamples', 'testimonials', 'stats', 'faqs', 'posts', 'landingPages', 'leadMagnets', 'guides', 'docGuides', 'events', 'siteTools'],
  },
  { key: 'team', icon: UsersRound, tabs: ['users', 'kpi', 'shifts', 'training', 'timeTracking', 'oversight', 'weeklyReports'] },
  { key: 'compliance', icon: Scale, tabs: ['privacyRequests', 'legal', 'history', 'security', 'securityAlerts', 'sensitiveAccess', 'storage'] },
  { key: 'ai', icon: Sparkles, tabs: ['ai', 'aiSettings', 'mailTriage'] },
  { key: 'system', icon: Settings, tabs: ['settings', 'integrations', 'automation', 'modules', 'usage', 'brand', 'license', 'customers', 'designSystem', 'kb', 'problemReports', 'help'] },
];

export const hubHref = (key: HubKey) => `/admin/hub/${key}`;

/** Sidebar / palette entries of the hubs (pinnable like any page: id `hub.<key>`). */
export const HUB_NAV: StaffNavItem[] = HUBS.map((h) => ({ id: `hub.${h.key}`, to: hubHref(h.key), labelKey: `anav.hubs.${h.key}`, icon: h.icon, area: 'admin' }));

const HUB_OF = new Map<string, HubKey>(HUBS.flatMap((h) => h.tabs.map((id) => [id, h.key] as const)));
export const hubOf = (navId: string | undefined): HubKey | undefined => (navId ? (navId.startsWith('hub.') ? hubByKey(navId.slice(4))?.key : HUB_OF.get(navId)) : undefined);
export const hubByKey = (key: string | undefined) => HUBS.find((h) => h.key === key);

/** Every page and hub, for favourites / recent lookups. */
export const ALL_NAV: StaffNavItem[] = [...STAFF_NAV, ...HUB_NAV];
export const navItemById = (id: string) => ALL_NAV.find((i) => i.id === id);

/** The tabs of a hub the user can open, in hub order. */
export const hubTabs = (key: string, role: Role | null | undefined, modules: ModuleFlags | undefined): StaffNavItem[] =>
  (hubByKey(key)?.tabs ?? [])
    .map((id) => STAFF_NAV.find((i) => i.id === id))
    .filter((i): i is StaffNavItem => !!i && canSee(i, role) && moduleOn(modules, i.module));

/** Role + module check of a page or hub (a hub is visible while one of its tabs is). */
export const isVisible = (item: StaffNavItem, role: Role | null | undefined, modules: ModuleFlags | undefined): boolean => {
  if (item.id.startsWith('hub.')) return hubTabs(item.id.slice(4), role, modules).length > 0;
  return canSee(item, role) && moduleOn(modules, item.module);
};

/** Pages of a module (System → Modules lists them; Usage offers "switch off" next to them). */
export const moduleItems = (key: ModuleKey) => STAFF_NAV.filter((i) => i.module === key);

// ─── Desks ──────────────────────────────────────────────────────────────

export const DESKS = ['MANAGER', 'FINANCE', 'MARKETING', 'ALL'] as const;
export type Desk = (typeof DESKS)[number];
export const isDesk = (v: unknown): v is Desk => typeof v === 'string' && (DESKS as readonly string[]).includes(v);

/** Desk until one is chosen (same rule as the server): admins see every hub, everyone else the case desk. */
export const defaultDeskFor = (role: Role | null | undefined): Desk => (hasMinRole(role, 'ADMIN') ? 'ALL' : 'MANAGER');

/**
 * The sidebar's first block per desk. Everything else stays one click away under "More" (the hubs), in
 * Ctrl+K and by URL. ALL (admins): "today" + the dashboard, then every hub as the main list.
 * Labels: anav.desks.<desk>.
 */
export const DESK_ITEMS: Record<Desk, string[]> = {
  MANAGER: ['today', 'cases', 'candidates', 'messaging', 'ws.mail', 'interviews', 'ws.calendar', 'ws.drive'],
  FINANCE: ['today', 'finance', 'invoices', 'quotes', 'settlements', 'profitability', 'candidates'],
  MARKETING: ['today', 'inquiries', 'campaigns', 'hub.site', 'landingPages', 'analytics'],
  ALL: ['today', 'dashboard'],
};

/** Favourites shown on top of the sidebar; recently opened pages listed under the desk. */
export const PINS_MAX = 8;
export const RECENT_SHOWN = 5;
