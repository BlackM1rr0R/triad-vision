import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  AtSign,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  BookOpenText,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Eye,
  FileImage,
  FileSignature,
  FileText,
  FolderKanban,
  Handshake,
  HelpCircle,
  Inbox,
  KanbanSquare,
  Languages,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  ListTodo,
  LogOut,
  Megaphone,
  Menu,
  MessageCircleQuestion,
  MessageSquareQuote,
  MessageSquareText,
  Newspaper,
  PlaneLanding,
  Hourglass,
  HardDrive,
  Vault,
  Plug,
  Receipt,
  Route,
  Settings,
  Sheet,
  ShieldCheck,
  ShieldHalf,
  Smile,
  Sparkles,
  Star,
  TrendingUp,
  UserSearch,
  Users,
  UsersRound,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/a11y/ThemeToggle';
import { AccessibilityWidget } from '@/components/a11y/AccessibilityWidget';
import { api } from '@/lib/api';
import { useRealtimeNotifications } from '@/lib/realtime';
import { useAuth } from '@/lib/auth';
import { hasMinRole, type Notification } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { adminCopy } from '@/i18n/admin';
import { roleLabel, fmtRelative } from '@/components/admin/labels';
import { HelpButton } from '@/components/admin/help/HelpButton';

registerCopy(adminCopy);

interface NavItem {
  to: string;
  /** Key under admin.nav. */
  label: string;
  icon: LucideIcon;
  end?: boolean;
  adminOnly?: boolean;
  /** Shown only to the super admin. */
  superOnly?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { to: '/admin', label: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/oversight', label: 'oversight', icon: Eye, superOnly: true },
  { to: '/admin/ai', label: 'ai', icon: Sparkles, superOnly: true },
  { to: '/admin/cases', label: 'cases', icon: FolderKanban },
  { to: '/admin/register', label: 'register', icon: Sheet },
  { to: '/admin/settlements', label: 'settlements', icon: Banknote },
  { to: '/admin/partners', label: 'referralPartners', icon: Handshake },
  { to: '/admin/signatures', label: 'signatures', icon: FileSignature },
  { to: '/workspace/home', label: 'workspace', icon: LayoutGrid },
  { to: '/admin/tasks', label: 'tasks', icon: ListTodo },
  { to: '/admin/announcements', label: 'announcements', icon: Megaphone },
  { to: '/admin/inquiries', label: 'inquiries', icon: Inbox },
  { to: '/admin/users', label: 'users', icon: Users },
  { to: '/admin/mailboxes', label: 'mailboxes', icon: AtSign, adminOnly: true },
  { to: '/admin/candidates', label: 'candidates', icon: UserSearch },
  { to: '/admin/vacancies', label: 'vacancies', icon: BriefcaseBusiness },
  { to: '/admin/companies', label: 'companies', icon: Building2 },
  { to: '/admin/bookings', label: 'bookings', icon: CalendarClock },
  { to: '/admin/invoices', label: 'invoices', icon: Receipt, adminOnly: true },
  { to: '/admin/reviews', label: 'reviews', icon: Star },
  { to: '/admin/analytics', label: 'analytics', icon: BarChart3 },
  { to: '/admin/security', label: 'security', icon: ShieldCheck },
  { to: '/admin/kanban', label: 'kanban', icon: KanbanSquare },
  { to: '/admin/messaging', label: 'messaging', icon: MessageSquareText },
  { to: '/admin/interviews', label: 'interviews', icon: Video },
  { to: '/admin/journey', label: 'journey', icon: Route },
  { to: '/admin/requirements', label: 'requirements', icon: ListChecks },
  { to: '/admin/expiring', label: 'expiring', icon: Hourglass },
  { to: '/admin/originals', label: 'originals', icon: Vault },
  { to: '/admin/storage', label: 'storage', icon: HardDrive, adminOnly: true },
  { to: '/admin/kb', label: 'kb', icon: BookOpenText },
  { to: '/admin/agents', label: 'agents', icon: Handshake, adminOnly: true },
  { to: '/admin/translations', label: 'translations', icon: Languages },
  { to: '/admin/arrivals', label: 'arrivals', icon: PlaneLanding },
  { to: '/admin/candidate-requests', label: 'candidateRequests', icon: UsersRound },
  { to: '/admin/contract-templates', label: 'contractTemplates', icon: FileText, adminOnly: true },
  { to: '/admin/interview-prep', label: 'interviewPrep', icon: MessageCircleQuestion },
  { to: '/admin/surveys', label: 'surveys', icon: Smile },
  { to: '/admin/finance', label: 'finance', icon: Wallet, adminOnly: true },
  { to: '/admin/privacy-requests', label: 'privacyRequests', icon: ShieldHalf, adminOnly: true },
  { to: '/admin/integrations', label: 'integrations', icon: Plug, adminOnly: true },
  { to: '/admin/help', label: 'help', icon: LifeBuoy },
];

const CONTENT_NAV: (NavItem & { resource: string })[] = [
  { resource: 'services', to: '/admin/content/services', label: 'services', icon: Layers },
  { resource: 'visa-categories', to: '/admin/content/visa-categories', label: 'visaCategories', icon: Briefcase },
  { resource: 'partners', to: '/admin/content/partners', label: 'partners', icon: Handshake },
  { resource: 'visa-samples', to: '/admin/content/visa-samples', label: 'visaSamples', icon: FileImage },
  { resource: 'testimonials', to: '/admin/content/testimonials', label: 'testimonials', icon: MessageSquareQuote },
  { resource: 'stats', to: '/admin/content/stats', label: 'stats', icon: TrendingUp },
  { resource: 'faqs', to: '/admin/content/faqs', label: 'faqs', icon: HelpCircle },
  { resource: 'posts', to: '/admin/content/posts', label: 'posts', icon: Newspaper },
];

const SETTINGS_NAV: NavItem = { to: '/admin/settings', label: 'settings', icon: Settings, adminOnly: true };

/** Translation key of the page title for a pathname. */
const pageTitleKey = (pathname: string) => {
  if (matchPath('/admin', pathname)) return 'admin.nav.dashboard';
  if (matchPath('/admin/oversight', pathname)) return 'admin.nav.oversight';
  if (matchPath('/admin/ai/*', pathname)) return 'admin.nav.ai';
  if (matchPath('/admin/oversight/staff/:id', pathname)) return 'admin.layout.staff';
  if (matchPath('/admin/cases', pathname)) return 'admin.nav.cases';
  if (matchPath('/admin/cases/:id', pathname)) return 'admin.layout.case';
  if (matchPath('/admin/docs', pathname)) return 'admin.nav.docs';
  if (matchPath('/admin/docs/audit', pathname)) return 'admin.layout.audit';
  if (matchPath('/admin/inquiries', pathname)) return 'admin.nav.inquiries';
  if (matchPath('/admin/users', pathname)) return 'admin.nav.users';
  if (matchPath('/admin/signatures/*', pathname)) return 'admin.nav.signatures';
  if (matchPath('/admin/mailboxes', pathname)) return 'admin.nav.mailboxes';
  if (matchPath('/admin/settings', pathname)) return 'admin.nav.settings';
  if (matchPath('/admin/help', pathname)) return 'admin.nav.help';
  if (matchPath('/admin/tasks/*', pathname)) return 'admin.nav.tasks';
  if (matchPath('/admin/announcements', pathname)) return 'admin.nav.announcements';
  if (matchPath('/admin/arrivals/*', pathname)) return 'admin.nav.arrivals';
  if (matchPath('/admin/originals', pathname)) return 'admin.nav.originals';
  if (matchPath('/admin/storage', pathname)) return 'admin.nav.storage';
  const m = matchPath('/admin/content/:resource', pathname);
  if (m) {
    const item = CONTENT_NAV.find((c) => c.resource === m.params.resource);
    return item ? `admin.nav.${item.label}` : 'admin.nav.content';
  }
  return 'admin.layout.panel';
};

const COLLAPSE_KEY = 'tv-admin-sidebar-collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

// ─── Sidebar ────────────────────────────────────────────────────────────

const SideLink = ({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const label = t(`admin.nav.${item.label}`);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        clsx(
          'group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-brand-400" aria-hidden />}
          <item.icon className={clsx('size-[18px] shrink-0', isActive ? 'text-brand-400' : 'text-white/50 group-hover:text-white/80')} aria-hidden />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
};

const SidebarNav = ({ collapsed, isAdmin, isSuper, onNavigate }: { collapsed: boolean; isAdmin: boolean; isSuper: boolean; onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const inContent = location.pathname.startsWith('/admin/content');
  const [contentOpen, setContentOpen] = useState(true);

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={t('admin.layout.navAria')}>
      {MAIN_NAV.filter((item) => (!item.superOnly || isSuper) && (!item.adminOnly || isAdmin)).map((item) => (
        <SideLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}

      {isAdmin && (
        <div className="pt-4">
          {collapsed ? (
            <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden />
          ) : (
            <button
              type="button"
              onClick={() => setContentOpen((v) => !v)}
              aria-expanded={contentOpen}
              className={clsx(
                'flex min-h-8 w-full items-center justify-between rounded-md px-3 pb-1.5 text-[11px] font-bold tracking-[0.14em] uppercase transition',
                inContent ? 'text-brand-400' : 'text-white/40 hover:text-white/70',
              )}
            >
              {t('admin.nav.content')}
              <ChevronDown className={clsx('size-3.5 transition-transform', !contentOpen && '-rotate-90')} aria-hidden />
            </button>
          )}
          <AnimatePresence initial={false}>
            {(contentOpen || collapsed) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1 overflow-hidden"
              >
                {CONTENT_NAV.map((item) => (
                  <SideLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="pt-4">
            <SideLink item={SETTINGS_NAV} collapsed={collapsed} onNavigate={onNavigate} />
          </div>
        </div>
      )}
    </nav>
  );
};

// ─── Notifications ──────────────────────────────────────────────────────

const NotificationBell = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Server-sent events refresh the badge the moment a notification is created (polling stays as fallback).
  useRealtimeNotifications();

  const { data } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () => (await api.get<{ items: Notification[]; unread: number }>('/notifications')).data,
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.post('/notifications/read', ids ? { ids } : {}),
    onMutate: (ids) => {
      qc.setQueryData<{ items: Notification[]; unread: number }>(['admin-notifications'], (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        const items = old.items.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n));
        return { items, unread: items.filter((n) => !n.readAt).length };
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? t('admin.layout.notificationsUnread', { count: unread }) : t('admin.layout.notifications')}
        className="relative grid size-10 place-items-center rounded-lg text-ink/70 transition hover:bg-surface hover:text-navy-900"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-white tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-line bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="text-sm font-semibold text-navy-900">{t('admin.layout.notifications')}</p>
              {unread > 0 && (
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold whitespace-nowrap text-brand-600 hover:text-brand-700"
                  onClick={() => markRead.mutate(undefined)}
                >
                  <CheckCheck className="size-3.5" /> {t('admin.layout.markAllRead')}
                </button>
              )}
            </div>
            <ul className="max-h-[min(60vh,32rem)] divide-y divide-line overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t('admin.layout.noNotifications')}</li>}
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={clsx('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-surface', !n.readAt && 'bg-brand-50/60')}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate([n.id]);
                      if (n.link) {
                        setOpen(false);
                        navigate(n.link);
                      }
                    }}
                  >
                    <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-500')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-navy-900">{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs whitespace-pre-line text-muted">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-muted/80">{fmtRelative(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Layout ─────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const isSuper = hasMinRole(user?.role, 'SUPER_ADMIN');
  const title = t(pageTitleKey(location.pathname));

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable: keep in-memory state only */
    }
  }, [collapsed]);

  useEffect(() => {
    document.title = `${title} · Triad Vision Admin`;
  }, [title]);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  // Mobile drawer: Escape closes it, page behind does not scroll.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  const onLogout = () => {
    navigate('/login', { replace: true });
    void logout();
  };

  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '';

  return (
    <div className="flex min-h-screen bg-surface text-ink">
      <a href="#admin-main" className="skip-link">
        {t('a11y.skip')}
      </a>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'sticky top-0 hidden h-screen shrink-0 flex-col bg-navy-950 transition-[width] duration-300 lg:flex',
          collapsed ? 'w-[68px]' : 'w-64',
        )}
      >
        <div className={clsx('flex h-16 items-center border-b border-white/10', collapsed ? 'justify-center' : 'px-5')}>
          {collapsed ? (
            <Link to="/" aria-label="Triad Vision">
              <LogoMark className="h-8 w-9 text-white" />
            </Link>
          ) : (
            <Logo light className="origin-left scale-[0.82]" />
          )}
        </div>
        <SidebarNav collapsed={collapsed} isAdmin={isAdmin} isSuper={isSuper} />
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={clsx(
            'm-3 flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white/50 transition hover:bg-white/5 hover:text-white',
            collapsed && 'justify-center',
          )}
          aria-label={collapsed ? t('admin.layout.expandMenu') : t('admin.layout.collapseMenu')}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && t('admin.layout.collapseMenu')}
        </button>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div
              className="absolute inset-0 bg-navy-950/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <motion.aside
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy-950"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label={t('admin.layout.menu')}
            >
              <div className="flex h-16 items-center justify-between border-b border-white/10 pr-3 pl-4">
                <Logo light className="origin-left scale-[0.8]" />
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="grid size-10 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                  aria-label={t('admin.layout.closeMenu')}
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarNav collapsed={false} isAdmin={isAdmin} isSuper={isSuper} onNavigate={() => setMobileOpen(false)} />
              <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <a
                  href="/"
                  className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white"
                >
                  <ExternalLink className="size-[18px] shrink-0 text-white/50" aria-hidden /> {t('admin.layout.goToSite')}
                </a>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-1.5 border-b border-line bg-white/[0.97] px-2 sm:gap-2 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-ink/70 hover:bg-surface lg:hidden"
            aria-label={t('admin.layout.openMenu')}
          >
            <Menu className="size-5" />
          </button>
          <p className="min-w-0 flex-1 truncate pl-1 font-display text-base font-bold text-navy-900 sm:text-lg lg:pl-0">{title}</p>

          <HelpButton />
          <LanguageSwitcher variant="pill" />
          <ThemeToggle />
          <NotificationBell />
          <a
            href="/"
            className="hidden min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold whitespace-nowrap text-ink/70 transition hover:bg-surface hover:text-navy-900 sm:inline-flex"
          >
            <ExternalLink className="size-3.5" /> {t('admin.layout.goToSite')}
          </a>
          <div className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy-900 text-[11px] font-bold text-white" aria-hidden>
              {initials}
            </span>
            <span className="hidden max-w-[12rem] leading-tight md:block">
              <span className="block truncate text-sm font-semibold text-navy-900">
                {user?.firstName} {user?.lastName}
              </span>
              <span className="block text-[11px] text-muted">{user ? roleLabel(user.role) : ''}</span>
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="grid size-10 place-items-center rounded-lg text-ink/60 transition hover:bg-red-50 hover:text-danger"
              aria-label={t('admin.layout.logout')}
              title={t('admin.layout.logout')}
            >
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </header>

        <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 p-4 outline-none sm:p-6 lg:p-8">
          <Outlet />
        </main>
        <footer className="flex items-center justify-center gap-1.5 px-4 pb-5 text-[11px] text-muted/70">
          <BookOpen className="size-3" aria-hidden /> {t('admin.layout.footer')}
        </footer>
      </div>
      <AccessibilityWidget standalone panelClass="sm:bottom-[5.75rem] sm:max-h-[calc(100dvh-6.75rem)]" />
    </div>
  );
}
