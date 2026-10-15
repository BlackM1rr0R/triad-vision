import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, BookUser, CalendarDays, FolderOpen, Globe, LayoutDashboard, ListTodo, LogOut, Mail, Menu, MessagesSquare, PanelLeftClose, PanelLeftOpen, Users, X } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/a11y/ThemeToggle';
import { RouteErrorBoundary } from '@/components/ui/RouteErrorBoundary';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { workspaceCopy } from '@/i18n/workspace';

registerCopy(workspaceCopy);

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
  const mailSummary = useQuery({
    queryKey: ['mail', 'summary'],
    queryFn: async () => (await api.get<{ unread: number }>('/mail/summary')).data,
    refetchInterval: 60_000,
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
  useRealtime('mail.new', bump([['mail', 'summary']]));
  useRealtime('mail.updated', bump([['mail', 'summary']]));
  useRealtime('chat.message', bump([['chat', 'summary']]));
  useRealtime('chat.read', bump([['chat', 'summary']]));

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, [collapsed]);

  const nav: NavItem[] = [
    { to: '/workspace/home', label: t('workspace.nav.home'), icon: LayoutDashboard },
    { to: '/workspace/mail', label: t('workspace.nav.mail'), icon: Mail, badge: mailSummary.data?.unread || undefined },
    { to: '/workspace/chat', label: t('workspace.nav.chat'), icon: MessagesSquare, badge: chatSummary.data?.unread || undefined },
    { to: '/workspace/calendar', label: t('workspace.nav.calendar'), icon: CalendarDays },
    { to: '/workspace/drive', label: t('workspace.nav.drive'), icon: FolderOpen },
    { to: '/workspace/tasks', label: t('workspace.nav.tasks'), icon: ListTodo, badge: summary.data?.open || undefined },
    { to: '/workspace/contacts', label: t('workspace.nav.contacts'), icon: BookUser },
    { to: '/workspace/team', label: t('workspace.nav.team'), icon: Users },
  ];
  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '';

  const rail = (wide: boolean) => (
    <div className="flex h-full flex-col gap-1 p-2">
      <Link to="/workspace" className="mb-3 flex items-center gap-2.5 rounded-xl px-2 py-2" title={t('workspace.title')}>
        <LogoMark className="h-7 w-8 shrink-0 text-ink" />
        {wide && <span className="truncate font-display text-sm font-extrabold tracking-[0.08em] text-ink">{t('workspace.title')}</span>}
      </Link>
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          title={wide ? undefined : item.label}
          className={({ isActive }) =>
            clsx(
              'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
              isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:bg-brand-50 hover:text-ink',
            )
          }
        >
          <item.icon className="size-5 shrink-0" />
          {wide && <span className="truncate">{item.label}</span>}
          {!!item.badge && (
            <span
              className={clsx(
                'grid min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[0.68rem] font-bold leading-5 text-white',
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
        <Link to="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-brand-50 hover:text-ink" title={wide ? undefined : t('workspace.nav.admin')}>
          <ArrowLeft className="size-5 shrink-0" />
          {wide && <span className="truncate">{t('workspace.nav.admin')}</span>}
        </Link>
        <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-brand-50 hover:text-ink" title={wide ? undefined : t('workspace.nav.site')}>
          <Globe className="size-5 shrink-0" />
          {wide && <span className="truncate">{t('workspace.nav.site')}</span>}
        </Link>
        <div className={clsx('flex items-center gap-2 px-1 py-1', wide ? 'justify-between' : 'flex-col')}>
          <LanguageSwitcher variant="pill" />
          <ThemeToggle />
        </div>
        <div className={clsx('flex items-center gap-2.5 rounded-xl px-2 py-2', !wide && 'flex-col')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials}</span>
          {wide && user && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-ink">{user.firstName} {user.lastName}</span>
              <span className="block truncate text-xs text-muted">{t(`workspace.role.${user.role}`)}</span>
            </span>
          )}
          <button type="button" onClick={() => void logout()} className="rounded-lg p-2 text-muted hover:bg-brand-50 hover:text-danger" aria-label={t('workspace.logout')} title={t('workspace.logout')}>
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-surface text-ink">
      {/* Desktop rail */}
      <aside className={clsx('relative hidden shrink-0 border-r border-line bg-card transition-[width] duration-200 lg:block', collapsed ? 'w-[4.5rem]' : 'w-60')}>
        {rail(!collapsed)}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-16 z-10 grid size-6 place-items-center rounded-full border border-line bg-card text-muted shadow-sm hover:text-ink"
          aria-label={collapsed ? t('workspace.expand') : t('workspace.collapse')}
        >
          {collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-navy-900/50" onClick={() => setMobileOpen(false)} aria-label={t('workspace.menu')} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-card shadow-xl">
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-2 top-3 rounded-lg p-2 text-muted" aria-label={t('workspace.menu')}>
              <X className="size-5" />
            </button>
            {rail(true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-2.5 lg:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} className="-ml-1 rounded-lg p-2 text-ink" aria-label={t('workspace.menu')}>
            <Menu className="size-5" />
          </button>
          <LogoMark className="h-6 w-7 text-ink" />
          <span className="font-display text-sm font-extrabold tracking-[0.08em]">{t('workspace.title')}</span>
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
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}
