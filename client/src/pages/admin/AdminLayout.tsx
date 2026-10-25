import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Bell, BookOpen, CheckCheck, ChevronDown, ChevronsLeft, ChevronsRight, ExternalLink, LayoutGrid, LogOut, Menu, Star, X } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { Menu as UiMenu, type MenuItem } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/a11y/ThemeToggle';
import { AccessibilityWidget } from '@/components/a11y/AccessibilityWidget';
import { api } from '@/lib/api';
import { useRealtimeNotifications } from '@/lib/realtime';
import { useAuth } from '@/lib/auth';
import type { Notification, Role } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { adminCopy } from '@/i18n/admin';
import { roleLabel, fmtRelative } from '@/components/admin/labels';
import { HelpButton } from '@/components/admin/help/HelpButton';
import { TodayNavBadge } from '@/components/today/TodayNavBadge'; // urgent count of "my work today"
import { TrainingNavBadge } from '@/components/team/training/TrainingNotice'; // unfinished required courses
import { pagesCalls } from '@/i18n/pagesCalls';
import { LiveChatAlerts } from '@/components/livechat/LiveChatAlerts'; // live chat queue sound + toast, incoming calls
import { HeaderTimer } from '@/components/timeCare/HeaderTimer'; // running staff timer (registers its copy)
import { CommandPaletteButton, CommandPaletteHotkey } from '@/components/command/CommandPaletteHost'; // Ctrl+K staff palette
import { ShortcutLayer } from '@/components/shortcuts/ShortcutLayer'; // ? cheat sheet, g+c/i/t/d, page shortcuts (J/K, E, /)
import { NAV_GROUPS, STAFF_NAV, activeNavItem, hrefFor, isVisible, type NavGroupKey, type StaffNavItem } from '@/components/command/navRegistry';
import { usePageVisits, useStaffNav } from '@/components/command/navPrefs'; // server-side pins (shared with Ctrl+K), modules, page usage
import { ModuleDisabled } from '@/components/admin/nav/ModuleDisabled';
import { isStringArray, navGroupsKey, navPinsKey, readJson, writeJson } from '@/components/command/storage';
import { useSurface } from '@/lib/theme'; // crisp admin surface tokens (index.css [data-surface=admin])
import { DensityToggle } from '@/components/ui/DensityToggle'; // per-user table density (data-density)

registerCopy(adminCopy);
registerCopy(pagesCalls);

/**
 * Sidebar entries come from components/command/navRegistry.ts (shared with the Ctrl+K palette): eight
 * collapsible groups, plus "Sevimlilər" (pinned favourites) on top. Role rules (adminOnly / superOnly)
 * live there too and match the route guards in App.tsx.
 */
const ADMIN_NAV = STAFF_NAV.filter((i) => i.area === 'admin' || i.id === 'workspace');
const SIDEBAR_NAV = ADMIN_NAV.filter((i) => i.group);
type GroupKey = NavGroupKey | 'favourites';
const DEFAULT_OPEN: GroupKey[] = ['favourites', 'today', 'work'];
const PREFS_EVENT = 'tv:admin-nav-prefs';

/** Translation key of the page title for a pathname. */
const pageTitleKey = (pathname: string) => {
  if (matchPath('/admin', pathname)) return 'admin.nav.dashboard';
  if (matchPath('/admin/dashboard', pathname)) return 'admin.nav.dashboard';
  if (matchPath('/admin/oversight/staff/:id', pathname)) return 'admin.layout.staff';
  if (matchPath('/admin/cases/:id', pathname)) return 'admin.layout.case';
  if (matchPath('/admin/docs', pathname)) return 'admin.nav.docs';
  if (matchPath('/admin/docs/audit', pathname)) return 'admin.layout.audit';
  const m = matchPath('/admin/content/:resource', pathname);
  if (m) return STAFF_NAV.find((i) => i.to === `/admin/content/${m.params.resource}`)?.labelKey ?? 'admin.nav.content';
  // Every other page: the sidebar / palette entry whose route contains it.
  return activeNavItem(pathname, ADMIN_NAV)?.labelKey ?? 'admin.layout.panel';
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

/**
 * Open groups and pinned favourites, per user in localStorage. The desktop sidebar and the mobile drawer
 * are separate instances: a change in one is broadcast so the other follows.
 */
const useNavPrefs = (userId: string | undefined) => {
  const read = useCallback(
    () => ({
      open: readJson<string[]>(navGroupsKey(userId), DEFAULT_OPEN, isStringArray),
      pins: readJson<string[]>(navPinsKey(userId), [], isStringArray),
    }),
    [userId],
  );
  const [prefs, setPrefs] = useState(read);
  useEffect(() => {
    setPrefs(read());
    const sync = () => setPrefs(read());
    window.addEventListener(PREFS_EVENT, sync);
    return () => window.removeEventListener(PREFS_EVENT, sync);
  }, [read]);
  const save = useCallback(
    (next: { open: string[]; pins: string[] }) => {
      writeJson(navGroupsKey(userId), next.open);
      writeJson(navPinsKey(userId), next.pins);
      setPrefs(next);
      window.dispatchEvent(new Event(PREFS_EVENT));
    },
    [userId],
  );
  return { prefs, save };
};

type SideLinkProps = {
  item: StaffNavItem;
  role: Role | undefined;
  collapsed: boolean;
  pinned: boolean;
  onTogglePin: (id: string) => void;
  onNavigate?: () => void;
};

const SideLink = ({ item, role, collapsed, pinned, onTogglePin, onNavigate }: SideLinkProps) => {
  const { t } = useTranslation();
  const label = t(item.labelKey);
  const link = (
    <NavLink
      to={hrefFor(item, role)}
      end={item.end}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        clsx(
          // Direction A: calm rows, the active page is a white "key" with a hairline ring.
          'group relative flex min-h-8 items-center gap-2.5 rounded-lg py-1.5 text-[13px] transition-colors pointer-coarse:min-h-10',
          collapsed ? 'w-10 justify-center' : 'pr-8 pl-2.5',
          isActive
            ? 'bg-card font-medium text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line'
            : 'text-muted hover:bg-line/60 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={clsx('size-4 shrink-0', isActive ? 'text-ink' : 'text-muted group-hover:text-ink')} aria-hidden />
          {!collapsed && <span className="truncate">{label}</span>}
          {item.badge === 'today' && <TodayNavBadge collapsed={collapsed} />}
          {item.badge === 'training' && <TrainingNavBadge collapsed={collapsed} />}
        </>
      )}
    </NavLink>
  );
  if (collapsed) {
    return (
      <div className="pointer-events-auto flex w-10 justify-center">
        <Tooltip content={label} side="right">
          {link}
        </Tooltip>
      </div>
    );
  }
  const pinLabel = pinned ? t('admin.layout.unpin') : t('admin.layout.pin');
  return (
    <div className="group/row relative">
      {link}
      <button
        type="button"
        onClick={() => onTogglePin(item.id)}
        aria-pressed={pinned}
        aria-label={`${pinLabel}: ${label}`}
        title={pinLabel}
        className={clsx(
          'absolute top-1/2 right-0.5 grid size-7 -translate-y-1/2 place-items-center rounded-md opacity-0 transition group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-60',
          pinned ? 'text-highlight-fg' : 'text-muted hover:text-ink',
        )}
      >
        <Star className={clsx('size-3.5', pinned && 'fill-current')} aria-hidden />
      </button>
    </div>
  );
};

type SidebarNavProps = { collapsed: boolean; role: Role | undefined; userId: string | undefined; idSuffix: string; onNavigate?: () => void };

const SidebarNav = ({ collapsed, role, userId, idSuffix, onNavigate }: SidebarNavProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { prefs, save } = useNavPrefs(userId);
  const { pins, modules, togglePin } = useStaffNav();
  // Modules switched off in System → Modules disappear from the sidebar.
  const items = SIDEBAR_NAV.filter((i) => isVisible(i, role, modules));
  const active = activeNavItem(location.pathname, items);
  const pinned = pins.map((id) => items.find((i) => i.id === id)).filter((i): i is StaffNavItem => !!i);

  const toggleGroup = (key: GroupKey) => save({ ...prefs, open: prefs.open.includes(key) ? prefs.open.filter((k) => k !== key) : [...prefs.open, key] });

  // The group of the current page opens by itself (and stays open).
  const activeGroup = active?.group;
  useEffect(() => {
    if (activeGroup && !prefs.open.includes(activeGroup)) save({ ...prefs, open: [...prefs.open, activeGroup] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  const groups: { key: GroupKey; icon: LucideIcon; items: StaffNavItem[] }[] = [
    ...(pinned.length ? [{ key: 'favourites' as const, icon: Star, items: pinned }] : []),
    ...NAV_GROUPS.map((g) => ({ key: g.key, icon: g.icon, items: items.filter((i) => i.group === g.key) })).filter((g) => g.items.length > 0),
  ];

  return (
    <nav
      className={clsx(
        'flex-1 overflow-y-auto py-2',
        // Rail: the scroll box reaches 16rem past the rail (transparent and click-through) so the tooltips
        // to the right of each icon are not clipped by it.
        collapsed ? 'pointer-events-none -mr-64 pr-64 pl-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'px-2.5',
      )}
      aria-label={t('admin.layout.navAria')}
    >
      {groups.map((g, gi) => {
        const open = prefs.open.includes(g.key);
        const name = g.key === 'favourites' ? t('admin.nav.favourites') : t(`admin.nav.groups.${g.key}`);
        const listId = `admin-nav-${g.key}-${idSuffix}`;
        const holdsActive = !!active && g.items.some((i) => i.id === active.id);
        return (
          <div key={g.key} className={clsx(gi > 0 && (collapsed ? 'mt-1.5 w-10 border-t border-line pt-1.5' : 'mt-3'))}>
            {collapsed ? (
              <div className="pointer-events-auto flex w-10 justify-center">
                <Tooltip content={name} side="right">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-label={t('admin.layout.toggleGroup', { group: name })}
                    className={clsx(
                      'relative grid h-7 w-10 place-items-center rounded-md transition hover:bg-line/60',
                      holdsActive && !open ? 'text-ink' : 'text-muted hover:text-ink',
                    )}
                  >
                    <g.icon className="size-3.5" aria-hidden />
                    <ChevronDown className={clsx('absolute right-1 bottom-0.5 size-2.5 transition-transform', !open && '-rotate-90')} aria-hidden />
                  </button>
                </Tooltip>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                aria-expanded={open}
                aria-controls={listId}
                className={clsx(
                  'type-overline flex min-h-7 w-full items-center justify-between gap-2 rounded-md px-2.5 transition-colors hover:text-ink',
                  holdsActive && !open && 'text-ink',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {g.key === 'favourites' && <Star className="size-3 fill-current text-highlight-fg" aria-hidden />}
                  <span className="truncate">{name}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {!open && <span className="code-id text-[11px] font-medium tracking-normal tabular-nums">{g.items.length}</span>}
                  <ChevronDown className={clsx('size-3 opacity-70 transition-transform', !open && '-rotate-90')} aria-hidden />
                </span>
              </button>
            )}
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  id={listId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  // The rail must not clip the tooltips; the full sidebar clips while animating.
                  className={clsx('space-y-0.5', collapsed ? 'pt-0.5' : 'overflow-hidden')}
                >
                  {g.items.map((item) => (
                    <SideLink
                      key={`${g.key}:${item.id}`}
                      item={item}
                      role={role}
                      collapsed={collapsed}
                      pinned={pins.includes(item.id)}
                      onTogglePin={togglePin}
                      onNavigate={onNavigate}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
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
        className="relative grid size-9 place-items-center rounded-[var(--tv-radius-control)] text-muted transition hover:bg-sunken hover:text-ink pointer-coarse:size-10"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white tabular-nums ring-2 ring-canvas">
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
            className="fixed inset-x-3 top-14 z-50 overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--tv-shadow-raised)] sm:absolute sm:inset-x-auto sm:top-10 sm:right-0 sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="type-card-title">{t('admin.layout.notifications')}</p>
              {unread > 0 && (
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap text-link hover:text-link-hover"
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
                    className={clsx('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-sunken', !n.readAt && 'bg-sunken/60')}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate([n.id]);
                      if (n.link) {
                        setOpen(false);
                        navigate(n.link);
                      }
                    }}
                  >
                    <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-link')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block text-sm text-ink', n.readAt ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs whitespace-pre-line text-muted">{n.body}</span>
                      <span className="num mt-1 block text-[11px] text-muted">{fmtRelative(n.createdAt)}</span>
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

// ─── Sidebar chrome (Direction A: workspace header, search, user footer) ─────

/** Sidebar header: brand tile + panel name; the menu jumps to the workspace or the public site. */
const WorkspaceSwitcher = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const tile = (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-card shadow-[var(--tv-shadow-card)] ring-1 ring-line" aria-hidden>
      <LogoMark className="h-4 w-[18px] text-ink" />
    </span>
  );
  const items: MenuItem[] = [
    { label: t('admin.nav.workspace'), icon: LayoutGrid, to: '/workspace/home' },
    { label: t('admin.layout.goToSite'), icon: ExternalLink, onSelect: () => window.location.assign('/') },
  ];
  return (
    <UiMenu
      align="start"
      label={t('admin.layout.panel')}
      items={items}
      trigger={
        <button
          type="button"
          aria-label={collapsed ? `Triad Vision · ${t('admin.layout.panel')}` : undefined}
          className={clsx(
            'flex w-full items-center gap-2.5 rounded-lg py-1.5 text-left transition-colors hover:bg-line/60',
            collapsed ? 'justify-center px-0' : 'px-2',
          )}
        >
          {tile}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-ink">Triad Vision</span>
                <span className="block truncate text-[11.5px] text-muted">{t('admin.layout.panel')}</span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted" aria-hidden />
            </>
          )}
        </button>
      }
    />
  );
};

/** Sidebar footer: who is signed in, with sign-out. */
const UserFooter = ({ collapsed, onLogout }: { collapsed: boolean; onLogout: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  const name = `${user.firstName} ${user.lastName}`;
  const logout = (
    <button
      type="button"
      onClick={onLogout}
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted transition hover:bg-danger-bg hover:text-danger-fg"
      aria-label={t('admin.layout.logout')}
      title={t('admin.layout.logout')}
    >
      <LogOut className="size-4" aria-hidden />
    </button>
  );
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 border-t border-line py-2">
        <Tooltip content={`${name} · ${roleLabel(user.role)}`} side="right">
          <span className="inline-flex" tabIndex={0}>
            <Avatar name={name} size="sm" decorative={false} />
          </span>
        </Tooltip>
        {logout}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 border-t border-line px-2 py-2.5">
      <Avatar name={name} size="sm" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[12.5px] font-semibold text-ink">{name}</span>
        <span className="block truncate text-[11.5px] text-muted">{roleLabel(user.role)}</span>
      </span>
      {logout}
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
  const title = t(pageTitleKey(location.pathname));
  const { isModuleOn, loaded } = useStaffNav();
  usePageVisits(location.pathname);
  // A page of a switched-off module shows a notice instead.
  const page = activeNavItem(location.pathname, STAFF_NAV);
  const blocked = loaded && !!page?.module && !isModuleOn(page.module);
  useSurface('admin');

  // Breadcrumb: sidebar group › page (› detail, when the title is not the nav entry itself).
  const crumbs: string[] = [];
  if (page?.group) crumbs.push(t(`admin.nav.groups.${page.group}`));
  if (page && t(page.labelKey) !== title) crumbs.push(t(page.labelKey));

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

  const userName = user ? `${user.firstName} ${user.lastName}` : '';

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <a href="#admin-main" className="skip-link">
        {t('a11y.skip')}
      </a>
      {/* Desktop sidebar: a calm sunken column with hairline edge (Direction A) */}
      <aside
        className={clsx(
          // z-50: the rail's tooltips overlap the sticky page header (z-40).
          'vt-admin-sidebar sticky top-0 z-50 hidden h-screen shrink-0 flex-col border-r border-line bg-sunken transition-[width] duration-300 lg:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <div className={clsx('flex flex-col gap-2 pt-3 pb-1', collapsed ? 'items-center px-3.5' : 'px-2.5')}>
          <WorkspaceSwitcher collapsed={collapsed} />
          <CommandPaletteButton variant="rail" compact={collapsed} className={collapsed ? 'w-10' : undefined} />
        </div>
        <SidebarNav collapsed={collapsed} role={user?.role} userId={user?.id} idSuffix={collapsed ? 'rail' : 'side'} />
        <div className={clsx('px-2.5', collapsed && 'flex flex-col items-center px-3.5')}>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={clsx(
              'mb-1 flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-muted transition hover:bg-line/60 hover:text-ink',
              collapsed ? 'w-10 justify-center px-0' : 'w-full',
            )}
            aria-label={collapsed ? t('admin.layout.expandMenu') : t('admin.layout.collapseMenu')}
          >
            {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
            {!collapsed && t('admin.layout.collapseMenu')}
          </button>
          <UserFooter collapsed={collapsed} onLogout={onLogout} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div
              className="absolute inset-0 bg-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <motion.aside
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-sunken shadow-[var(--tv-shadow-overlay)]"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label={t('admin.layout.menu')}
            >
              <div className="flex items-center gap-1 pt-3 pr-2 pl-2.5">
                <div className="min-w-0 flex-1">
                  <WorkspaceSwitcher collapsed={false} />
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-line/60 hover:text-ink"
                  aria-label={t('admin.layout.closeMenu')}
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <div className="px-2.5 pt-2">
                <CommandPaletteButton variant="rail" />
              </div>
              <SidebarNav collapsed={false} role={user?.role} userId={user?.id} idSuffix="drawer" onNavigate={() => setMobileOpen(false)} />
              <div className="px-2.5 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                <a
                  href="/"
                  className="mb-1 flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted transition hover:bg-line/60 hover:text-ink"
                >
                  <ExternalLink className="size-4 shrink-0" aria-hidden /> {t('admin.layout.goToSite')}
                </a>
                <UserFooter collapsed={false} onLogout={onLogout} />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: breadcrumb left, quiet tools right (solid canvas, hairline bottom; no blur) */}
        <header className="vt-admin-topbar sticky top-0 z-40 flex h-[52px] items-center gap-1 border-b border-line bg-canvas px-2 sm:gap-1.5 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink lg:hidden"
            aria-label={t('admin.layout.openMenu')}
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <nav aria-label={t('ui.breadcrumb')} className="min-w-0 flex-1 pl-1 lg:pl-0">
            <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
              {crumbs.map((c) => (
                <li key={c} className="hidden min-w-0 items-center gap-1.5 text-muted sm:flex">
                  <span className="truncate">{c}</span>
                  <span aria-hidden className="text-subtle">
                    /
                  </span>
                </li>
              ))}
              <li className="min-w-0">
                <span aria-current="page" className="block truncate font-medium text-ink">
                  {title}
                </span>
              </li>
            </ol>
          </nav>

          {/* the sidebar holds the search field on desktop; phones / tablets get the icon here */}
          <CommandPaletteButton className="lg:hidden" />
          <HelpButton />
          <LanguageSwitcher variant="pill" />
          <ThemeToggle />
          <DensityToggle className="hidden size-9 md:grid" />
          <HeaderTimer />
          <NotificationBell />
          <a
            href="/"
            className="hidden min-h-9 items-center gap-1.5 rounded-[var(--tv-radius-control)] px-2.5 text-xs font-medium whitespace-nowrap text-muted transition hover:bg-sunken hover:text-ink min-[56rem]:inline-flex lg:hidden xl:inline-flex"
          >
            <ExternalLink className="size-3.5" aria-hidden /> {t('admin.layout.goToSite')}
          </a>
          {/* phones / tablets: the sidebar footer is in the drawer, so the avatar + sign-out stay up here */}
          <div className="ml-0.5 flex shrink-0 items-center gap-1 lg:hidden">
            <span className="hidden sm:inline-flex">{user && <Avatar name={userName} size="sm" />}</span>
            <button
              type="button"
              onClick={onLogout}
              className="grid size-10 place-items-center rounded-lg text-muted transition hover:bg-danger-bg hover:text-danger-fg"
              aria-label={t('admin.layout.logout')}
              title={t('admin.layout.logout')}
            >
              <LogOut className="size-[18px]" aria-hidden />
            </button>
          </div>
        </header>

        <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-4 py-5 outline-none sm:px-6 sm:py-6 lg:px-8">
          {blocked && page ? <ModuleDisabled item={page} /> : <Outlet />}
          <LiveChatAlerts />
        </main>
        <footer className="flex items-center justify-center gap-1.5 px-4 pb-20 text-[11px] text-muted">
          <BookOpen className="size-3" aria-hidden /> {t('admin.layout.footer')}
        </footer>
      </div>
      <CommandPaletteHotkey />
      <ShortcutLayer />
      <AccessibilityWidget standalone panelClass="sm:bottom-[5.75rem] sm:max-h-[calc(100dvh-6.75rem)]" />
    </div>
  );
}
