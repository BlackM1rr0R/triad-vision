import type { LucideIcon } from 'lucide-react';
import {
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
  PhoneCall,
  PlaneLanding,
  Plug,
  Receipt,
  Route,
  Settings,
  Sheet,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Smile,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  UserSearch,
  Users,
  UsersRound,
  Vault,
  Video,
  Wallet,
  Wand2,
  Workflow,
} from 'lucide-react';
import { hasMinRole, type Role } from '@/lib/types';

/**
 * One list of every staff page (admin + workspace). The admin sidebar renders the `admin` area grouped by
 * `group`; the command palette (Ctrl+K) offers all of them under "Go to". Role rules match the routes in
 * App.tsx (`RequireAuth roles`) and the former sidebar flags: `adminOnly` = ADMIN+, `superOnly` = SUPER_ADMIN.
 */

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

export interface StaffNavItem {
  /** Stable id: favourites, recents and synonyms refer to it. */
  id: string;
  to: string;
  /** Full i18n key of the label. */
  labelKey: string;
  icon: LucideIcon;
  area: 'admin' | 'workspace';
  /** Sidebar group (admin area). Items without a group are palette-only. */
  group?: NavGroupKey;
  end?: boolean;
  adminOnly?: boolean;
  superOnly?: boolean;
  /** Live counter shown on the sidebar item. */
  badge?: 'today';
}

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

const w = (id: string, path: string, icon: LucideIcon): StaffNavItem => ({
  id: `ws.${id}`,
  to: `/workspace/${path}`,
  labelKey: `workspace.nav.${id}`,
  icon,
  area: 'workspace',
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
  a('expiring', '/admin/expiring', Hourglass, 'work'),
  a('originals', '/admin/originals', Vault, 'work'),
  a('arrivals', '/admin/arrivals', PlaneLanding, 'work'),
  a('checkIns', '/admin/check-ins', HeartHandshake, 'work'),
  a('examDates', '/admin/exam-dates', CalendarClock, 'work'),
  a('journey', '/admin/journey', Route, 'work'),
  // Müştərilər
  a('users', '/admin/users', Users, 'clients'),
  a('candidates', '/admin/candidates', UserSearch, 'clients'),
  a('register', '/admin/register', Sheet, 'clients'),
  a('duplicates', '/admin/duplicates', Copy, 'clients', { adminOnly: true }),
  a('inquiries', '/admin/inquiries', Inbox, 'clients'),
  a('privacyRequests', '/admin/privacy-requests', ShieldHalf, 'clients', { adminOnly: true }),
  a('referralPartners', '/admin/partners', Handshake, 'clients'),
  // İşəgötürənlər
  a('companies', '/admin/companies', Building2, 'employers'),
  a('vacancies', '/admin/vacancies', BriefcaseBusiness, 'employers'),
  a('candidateRequests', '/admin/candidate-requests', UsersRound, 'employers'),
  a('quotes', '/admin/quotes', FileSignature, 'employers', { adminOnly: true }),
  a('interviews', '/admin/interviews', Video, 'employers'),
  a('interviewPrep', '/admin/interview-prep', MessageCircleQuestion, 'employers'),
  // Ünsiyyət
  a('messaging', '/admin/messaging', MessageSquareText, 'comms'),
  a('mailboxes', '/admin/mailboxes', AtSign, 'comms', { adminOnly: true }),
  a('mailTriage', '/admin/ai/mail-triage', MailCheck, 'comms', { superOnly: true }),
  a('campaigns', '/admin/campaigns', Megaphone, 'comms', { adminOnly: true }),
  a('calls', '/admin/calls', PhoneCall, 'comms'),
  a('bookings', '/admin/bookings', CalendarClock, 'comms'),
  a('events', '/admin/events', CalendarHeart, 'comms'),
  a('announcements', '/admin/announcements', Megaphone, 'comms'),
  a('surveys', '/admin/surveys', Smile, 'comms'),
  a('reviews', '/admin/reviews', Star, 'comms'),
  // Maliyyə
  a('invoices', '/admin/invoices', Receipt, 'finance', { adminOnly: true }),
  a('settlements', '/admin/settlements', Banknote, 'finance'),
  a('finance', '/admin/finance', Wallet, 'finance', { adminOnly: true }),
  a('profitability', '/admin/profitability', TrendingUp, 'finance', { adminOnly: true }),
  a('timeTracking', '/admin/time', Timer, 'finance'),
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
  a('kb', '/admin/kb', BookOpenText, 'site'),
  a('translations', '/admin/translations', Languages, 'site'),
  a('docGuides', '/admin/doc-guides', BookOpen, 'site'),
  a('caseForms', '/admin/case-forms', ListChecks, 'site'),
  a('contractTemplates', '/admin/contract-templates', FileText, 'site', { adminOnly: true }),
  a('siteTools', '/admin/site-tools', Wand2, 'site'),
  a('problemReports', '/admin/problems', Bug, 'site', { adminOnly: true }),
  // Sistem
  a('settings', '/admin/settings', Settings, 'system', { adminOnly: true }),
  a('security', '/admin/security', ShieldCheck, 'system'),
  a('securityAlerts', '/admin/security-alerts', ShieldAlert, 'system', { superOnly: true }),
  a('sensitiveAccess', '/admin/sensitive-access', ShieldHalf, 'system', { superOnly: true }),
  a('history', '/admin/history', History, 'system', { adminOnly: true }),
  a('storage', '/admin/storage', HardDrive, 'system', { adminOnly: true }),
  a('automation', '/admin/automation', Workflow, 'system', { adminOnly: true }),
  a('integrations', '/admin/integrations', Plug, 'system', { adminOnly: true }),
  a('ai', '/admin/ai', Sparkles, 'system', { superOnly: true }),
  a('agents', '/admin/agents', Handshake, 'system', { adminOnly: true }),
  a('oversight', '/admin/oversight', Eye, 'system', { superOnly: true }),
  a('help', '/admin/help', LifeBuoy, 'system'),
  // Palette only (sub-pages without their own sidebar entry)
  a('docsAudit', '/admin/docs/audit', FileSearch, undefined),
  a('aiSettings', '/admin/ai/settings', Bot, undefined, { superOnly: true }),
  // Workspace
  w('home', 'home', LayoutDashboard),
  w('mail', 'mail', Mail),
  w('chat', 'chat', MessagesSquare),
  w('calendar', 'calendar', CalendarDays),
  w('drive', 'drive', FolderOpen),
  w('settlements', 'settlements', Banknote),
  w('tasks', 'tasks', ListTodo),
  w('contacts', 'contacts', BookUser),
  w('team', 'team', Users),
  w('liveChats', 'live-chats', Headset),
];

/** Whether a role may open the item (mirrors the route guards). */
export const canSee = (item: Pick<StaffNavItem, 'adminOnly' | 'superOnly'>, role: Role | null | undefined) =>
  hasMinRole(role, 'STAFF') && (!item.superOnly || hasMinRole(role, 'SUPER_ADMIN')) && (!item.adminOnly || hasMinRole(role, 'ADMIN'));

/** Staff below ADMIN land on /admin/dashboard (the /admin index redirects them elsewhere). */
export const hrefFor = (item: StaffNavItem, role: Role | null | undefined) =>
  item.id === 'dashboard' && !hasMinRole(role, 'ADMIN') ? '/admin/dashboard' : item.to;

export const navItemById = (id: string) => STAFF_NAV.find((i) => i.id === id);

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
