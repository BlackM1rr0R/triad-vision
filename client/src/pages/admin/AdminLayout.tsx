import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Bell, BookOpen, CheckCheck, ChevronDown, ChevronsLeft, ChevronsRight, ExternalLink, LogOut, Menu, Star, X } from 'lucide-react';
import { Logo, LogoMark } from '@/components/ui/Logo';
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
import { NAV_GROUPS, STAFF_NAV, activeNavItem, canSee, hrefFor, type NavGroupKey, type StaffNavItem } from '@/components/command/navRegistry';
import { isStringArray, navGroupsKey, navPinsKey, readJson, writeJson } from '@/components/command/storage';

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
          'group relative flex min-h-10 items-center gap-3 rounded-lg py-2 text-sm font-medium transition',
          collapsed ? 'w-11 justify-center' : 'pr-9 pl-3',
          isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-brand-400" aria-hidden />}
          <item.icon className={clsx('size-[18px] shrink-0', isActive ? 'text-brand-400' : 'text-white/50 group-hover:text-white/80')} aria-hidden />
          {!collapsed && <span className="truncate">{label}</span>}
          {item.badge === 'today' && <TodayNavBadge collapsed={collapsed} />}
          {item.badge === 'training' && <TrainingNavBadge collapsed={collapsed} />}
        </>
      )}
    </NavLink>
  );
  if (collapsed) {
    return (
      <div className="pointer-events-auto flex w-11 justify-center">
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
          'absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md opacity-0 transition group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-60',
          pinned ? 'text-amber-300' : 'text-white/40 hover:text-white',
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
  const items = SIDEBAR_NAV.filter((i) => canSee(i, role));
  const active = activeNavItem(location.pathname, items);
  const pinned = prefs.pins.map((id) => items.find((i) => i.id === id)).filter((i): i is StaffNavItem => !!i);

  const toggleGroup = (key: GroupKey) => save({ ...prefs, open: prefs.open.includes(key) ? prefs.open.filter((k) => k !== key) : [...prefs.open, key] });
  const togglePin = (id: string) => save({ ...prefs, pins: prefs.pins.includes(id) ? prefs.pins.filter((p) => p !== id) : [...prefs.pins, id] });

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
        'flex-1 overflow-y-auto py-3',
        // Rail: the scroll box reaches 16rem past the rail (transparent and click-through) so the tooltips
        // to the right of each icon are not clipped by it.
        collapsed ? 'pointer-events-none -mr-64 pr-64 pl-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'px-3',
      )}
      aria-label={t('admin.layout.navAria')}
    >
      {groups.map((g, gi) => {
        const open = prefs.open.includes(g.key);
        const name = g.key === 'favourites' ? t('admin.nav.favourites') : t(`admin.nav.groups.${g.key}`);
        const listId = `admin-nav-${g.key}-${idSuffix}`;
        const holdsActive = !!active && g.items.some((i) => i.id === active.id);
        return (
          <div key={g.key} className={clsx(gi > 0 && (collapsed ? 'mt-1.5 w-11 border-t border-white/10 pt-1.5' : 'mt-2'))}>
            {collapsed ? (
              <div className="pointer-events-auto flex w-11 justify-center">
                <Tooltip content={name} side="right">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-label={t('admin.layout.toggleGroup', { group: name })}
                    className={clsx(
                      'relative grid h-7 w-11 place-items-center rounded-md transition hover:bg-white/5',
                      holdsActive && !open ? 'text-brand-400' : 'text-white/35 hover:text-white/70',
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
                  'flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-3 text-[11px] font-bold tracking-[0.14em] uppercase transition',
                  holdsActive && !open ? 'text-brand-400' : 'text-white/60 hover:text-white/80',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {g.key === 'favourites' && <Star className="size-3 fill-current text-amber-300" aria-hidden />}
                  <span className="truncate">{name}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {!open && <span className="text-[10px] font-semibold tracking-normal text-white/30 tabular-nums">{g.items.length}</span>}
                  <ChevronDown className={clsx('size-3.5 transition-transform', !open && '-rotate-90')} aria-hidden />
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
                      pinned={prefs.pins.includes(item.id)}
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
          // z-50: the rail's tooltips overlap the sticky page header (z-40).
          'sticky top-0 z-50 hidden h-screen shrink-0 flex-col bg-navy-950 transition-[width] duration-300 lg:flex',
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
        <SidebarNav collapsed={collapsed} role={user?.role} userId={user?.id} idSuffix={collapsed ? 'rail' : 'side'} />
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
              <SidebarNav collapsed={false} role={user?.role} userId={user?.id} idSuffix="drawer" onNavigate={() => setMobileOpen(false)} />
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

          <CommandPaletteButton className="lg:min-w-[15rem]" />
          <HelpButton />
          <LanguageSwitcher variant="pill" />
          <ThemeToggle />
          <HeaderTimer />
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
          <LiveChatAlerts />
        </main>
        <footer className="flex items-center justify-center gap-1.5 px-4 pb-5 text-[11px] text-muted/70">
          <BookOpen className="size-3" aria-hidden /> {t('admin.layout.footer')}
        </footer>
      </div>
      <CommandPaletteHotkey />
      <AccessibilityWidget standalone panelClass="sm:bottom-[5.75rem] sm:max-h-[calc(100dvh-6.75rem)]" />
    </div>
  );
}
