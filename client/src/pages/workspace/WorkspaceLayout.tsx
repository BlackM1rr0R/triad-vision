import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Banknote, BookUser, CalendarDays, FolderOpen, Globe, LayoutDashboard, ListTodo, LogOut, Mail, Menu, MessagesSquare, PanelLeftClose, PanelLeftOpen, Users, X } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/a11y/ThemeToggle';
import { RouteErrorBoundary } from '@/components/ui/RouteErrorBoundary';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useRealtime, useRealtimeStatus } from '@/lib/realtime';
import { useMailPush } from '@/components/workspace/useMailPush';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { workspaceCopy } from '@/i18n/workspace';
import { pagesCalls } from '@/i18n/pagesCalls';
import { Headset } from 'lucide-react'; // live chats
import { LiveChatAlerts, useLiveChatWaiting } from '@/components/livechat/LiveChatAlerts'; // AI → human chat queue: badge, sound + toast
import { HeaderTimer } from '@/components/timeCare/HeaderTimer'; // running staff timer
import { BottomNavWorkspace } from '@/components/nav/BottomNavWorkspace'; // phones: tab bar
import { STAFF_TOUR, TourHost, TourRestartButton } from '@/components/onboarding'; // first-login tour
import { CommandPaletteButton, CommandPaletteHotkey } from '@/components/command'; // Ctrl+K
import { usePageVisits, useStaffNav } from '@/components/command/navPrefs'; // usage + module toggles
import { useSurface } from '@/lib/theme'; // crisp staff surface tokens (index.css [data-surface=admin])

registerCopy(workspaceCopy);
registerCopy(pagesCalls);

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const COLLAPSE_KEY = 'tv-workspace-collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Full-screen shell of the team workspace (/workspace): a slim icon rail (documents, tasks) and the
 * whole remaining viewport for the active app. No site header/footer, no page scroll — each app
 * manages its own scrolling panes.
 */
export default function WorkspaceLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  usePageVisits(location.pathname); // admin usage statistics + "recently opened" in the admin sidebar
  useSurface('admin');
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Open tasks assigned to me (badge on the rail). The tasks API answers { open, overdue }.
  const summary = useQuery({
    queryKey: ['tasks', 'summary'],
    queryFn: async () => (await api.get<{ open: number; overdue: number }>('/tasks/summary')).data,
    refetchInterval: 60_000,
    retry: false,
  });

  // Unread mail / chat badges; the endpoints belong to the mail and chat modules (404 → no badge).
  // Mail is pushed over the realtime stream (IMAP IDLE on the server); while it is connected the
  // poll is only a slow safety net.
  const live = useRealtimeStatus() === 'open';
  const mailSummary = useQuery({
    queryKey: ['mail', 'summary'],
    queryFn: async () => (await api.get<{ unread: number }>('/mail/summary')).data,
    refetchInterval: live ? 300_000 : 60_000,
    retry: false,
  });
  const chatSummary = useQuery({
    queryKey: ['chat', 'summary'],
    queryFn: async () => (await api.get<{ unread: number; mentions: number }>('/chat/summary')).data,
    refetchInterval: 60_000,
    retry: false,
  });
  const qc = useQueryClient();
  const bump = (keys: string[][]) => () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
  // Badge, "new mail" toast and "(n)" tab title.
  useMailPush(mailSummary.data?.unread ?? 0);
  useRealtime('chat.message', bump([['chat', 'summary']]));
  useRealtime('chat.read', bump([['chat', 'summary']]));

  const liveWaiting = useLiveChatWaiting();
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, [collapsed]);

  const { isModuleOn } = useStaffNav();
  const nav: NavItem[] = [
    { to: '/workspace/home', label: t('workspace.nav.home'), icon: LayoutDashboard },
    { to: '/workspace/mail', label: t('workspace.nav.mail'), icon: Mail, badge: mailSummary.data?.unread || undefined },
    { to: '/workspace/chat', label: t('workspace.nav.chat'), icon: MessagesSquare, badge: chatSummary.data?.unread || undefined },
    { to: '/workspace/calendar', label: t('workspace.nav.calendar'), icon: CalendarDays },
    { to: '/workspace/drive', label: t('workspace.nav.drive'), icon: FolderOpen },
    ...(isModuleOn('settlements') ? [{ to: '/workspace/settlements', label: t('workspace.nav.settlements'), icon: Banknote }] : []),
    { to: '/workspace/tasks', label: t('workspace.nav.tasks'), icon: ListTodo, badge: summary.data?.open || undefined },
    { to: '/workspace/contacts', label: t('workspace.nav.contacts'), icon: BookUser },
    { to: '/workspace/team', label: t('workspace.nav.team'), icon: Users },
    ...(isModuleOn('liveChat') ? [{ to: '/workspace/live-chats', label: t('workspace.nav.liveChats'), icon: Headset, badge: liveWaiting || undefined }] : []),
  ];

  const rail = (wide: boolean) => (
    <div className="flex h-full flex-col gap-1 p-2">
      <Link to="/workspace" className={clsx('mb-2 flex items-center gap-2.5 rounded-lg py-1.5 transition-colors hover:bg-line/60', wide ? 'px-2' : 'justify-center')} title={t('workspace.title')}>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-card shadow-[var(--tv-shadow-card)] ring-1 ring-line" aria-hidden>
          <LogoMark className="h-4 w-[18px] text-ink" />
        </span>
        {wide && <span className="truncate text-[13px] font-semibold text-ink">{t('workspace.title')}</span>}
      </Link>
      <CommandPaletteButton variant="rail" compact={!wide} className="mb-2" />
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          data-tour={`ws-nav-${item.to.split('/').pop()}`}
          title={wide ? undefined : item.label}
          className={({ isActive }) =>
            clsx(
              'relative flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
              !wide && 'justify-center',
              isActive ? 'bg-card font-medium text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted hover:bg-line/60 hover:text-ink',
            )
          }
        >
          <item.icon className="size-[18px] shrink-0" aria-hidden />
          {wide && <span className="truncate">{item.label}</span>}
          {!!item.badge && (
            <span
              className={clsx(
                'grid min-w-5 place-items-center rounded-full bg-danger px-1.5 code-id text-[11px] leading-[18px] font-medium text-white tabular-nums',
                wide ? 'ml-auto' : 'absolute -right-0.5 -top-0.5',
              )}
              aria-label={t('workspace.openTasks', { count: item.badge })}
            >
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </NavLink>
      ))}

      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-2">
        <Link to="/admin" className={clsx('flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted transition-colors hover:bg-line/60 hover:text-ink', !wide && 'justify-center')} title={wide ? undefined : t('workspace.nav.admin')}>
          <ArrowLeft className="size-[18px] shrink-0" aria-hidden />
          {wide && <span className="truncate">{t('workspace.nav.admin')}</span>}
        </Link>
        <Link to="/" className={clsx('flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted transition-colors hover:bg-line/60 hover:text-ink', !wide && 'justify-center')} title={wide ? undefined : t('workspace.nav.site')}>
          <Globe className="size-[18px] shrink-0" aria-hidden />
          {wide && <span className="truncate">{t('workspace.nav.site')}</span>}
        </Link>
        {wide && (
          <div className="px-1 py-1">
            <HeaderTimer />
          </div>
        )}
        <TourRestartButton
          tourId={STAFF_TOUR}
          tour="ws-help"
          compact={!wide}
          className={clsx('min-h-9 rounded-lg px-2.5 text-[13px] text-muted hover:bg-line/60 hover:text-ink', !wide && 'justify-center')}
        />
        <div className={clsx('flex items-center gap-2 px-1 py-1', wide ? 'justify-between' : 'flex-col')}>
          {/* Opens upward here (bottom of the sidebar); flag only in the collapsed rail. */}
          <LanguageSwitcher variant="pill" compact={!wide} />
          <ThemeToggle />
        </div>
        <div className={clsx('flex items-center gap-2.5 border-t border-line px-1 pt-2.5 pb-1', !wide && 'flex-col')}>
          {user && <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" decorative={wide} />}
          {wide && user && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12.5px] font-semibold text-ink">{user.firstName} {user.lastName}</span>
              <span className="block truncate text-[11.5px] text-muted">{t(`workspace.role.${user.role}`)}</span>
            </span>
          )}
          <button type="button" onClick={() => void logout()} className="grid size-8 place-items-center rounded-md text-muted hover:bg-danger-bg hover:text-danger-fg" aria-label={t('workspace.logout')} title={t('workspace.logout')}>
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      {/* Desktop rail */}
      <aside className={clsx('relative hidden shrink-0 border-r border-line bg-sunken transition-[width] duration-200 lg:block', collapsed ? 'w-[4.5rem]' : 'w-60')} data-tour="ws-rail">
        {rail(!collapsed)}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-16 z-10 grid size-6 place-items-center rounded-full border border-line bg-card text-muted shadow-[var(--tv-shadow-card)] hover:text-ink"
          aria-label={collapsed ? t('workspace.expand') : t('workspace.collapse')}
        >
          {collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-scrim" onClick={() => setMobileOpen(false)} aria-label={t('workspace.menu')} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-sunken shadow-[var(--tv-shadow-overlay)]">
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-2 top-3 rounded-lg p-2 text-muted" aria-label={t('workspace.menu')}>
              <X className="size-5" />
            </button>
            {rail(true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-line bg-canvas px-4 py-2 lg:hidden">
          {/* Phones open the rail from the bottom bar ("Daha çox"). */}
          <button type="button" onClick={() => setMobileOpen(true)} className="-ml-1 rounded-lg p-2 text-ink max-md:hidden" aria-label={t('workspace.menu')} data-tour="ws-menu">
            <Menu className="size-5" />
          </button>
          <LogoMark className="h-6 w-7 text-ink" />
          <span className="text-[13px] font-semibold text-ink">{t('workspace.title')}</span>
          <div className="ml-auto flex items-center gap-1">
            <HeaderTimer />
            <TourRestartButton tourId={STAFF_TOUR} tour="ws-help-mobile" compact className="rounded-lg p-2 text-muted hover:text-ink" />
          </div>
        </div>
        <main className="min-h-0 flex-1">
          <RouteErrorBoundary>
            <Suspense
              fallback={
                <div className="grid h-full place-items-center">
                  <Spinner />
                </div>
              }
            >
              <Outlet />
              <LiveChatAlerts />
            </Suspense>
          </RouteErrorBoundary>
        </main>
        <BottomNavWorkspace
          tasks={summary.data?.open || undefined}
          mail={mailSummary.data?.unread || undefined}
          chat={chatSummary.data?.unread || undefined}
          onMore={() => setMobileOpen(true)}
          moreOpen={mobileOpen}
        />
        <TourHost autoStart={STAFF_TOUR} />
        <CommandPaletteHotkey />
      </div>
    </div>
  );
}
