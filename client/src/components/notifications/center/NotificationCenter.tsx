import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Bell, BellRing, CheckCheck, ChevronRight, Circle, CircleCheck, FileText, FolderKanban, ListTodo, Mail, MessageSquare, Settings2, Smartphone, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { useRealtimeNotifications } from '@/lib/realtime';
import { registerCopy } from '@/i18n';
import { pagesNotificationCenter } from '@/i18n/pagesNotificationCenter';
import { useWhen } from '@/components/portal/useWhen';
import { useApiError } from '@/components/portal/useApiError';
import { EmptyInbox } from '@/components/illustrations';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { BrowserPushSwitch } from '../BrowserPushSwitch';
import { NOTIF_CATEGORIES, groupByDay, useNotificationActions, useNotificationFeed, useNotificationSummary, type FeedFilter, type FeedItem, type NotifCategory, type NotifSummary } from './api';

registerCopy(pagesNotificationCenter);

/**
 * Notification center for staff and every portal (client, employer, agent, partner):
 *
 *   NotificationBell        header bell: unread badge, panel with All / Unread, type chips, day groups, infinite
 *                           scroll, per-item open / mark read / unread, "mark all read", links to the full page and
 *                           to the notification settings
 *   NotificationCenterPage  the full history (/admin/notifications, /account/notifications, /company/…) with the
 *                           same filters kept in the URL, plus the settings (inline, or a link for the client portal
 *                           whose settings live in the profile)
 *
 * Realtime: the SSE event 'notification' invalidates the ['notifications'] queries (useRealtimeNotifications), so a
 * new item appears at once; polling every minute stays as the fallback. Only in-app paths are followed.
 */

export const isAppLink = (link: string | null | undefined): link is string => !!link && link.startsWith('/') && !link.startsWith('//');

const CAT_ICON: Record<NotifCategory, LucideIcon> = { case: FolderKanban, document: FileText, message: MessageSquare, task: ListTodo, finance: Wallet, system: Bell };
const CAT_TONE: Record<NotifCategory, string> = {
  case: 'bg-info-bg text-info-fg',
  document: 'bg-warning-bg text-warning-fg',
  message: 'bg-success-bg text-success-fg',
  task: 'bg-accent-bg text-accent-fg',
  finance: 'bg-highlight-bg text-highlight-fg',
  system: 'bg-neutral-bg text-neutral-fg',
};

// ─── Row ─────────────────────────────────────────────────────────────────

const NotificationRow = ({ n, compact, onOpen, onToggleRead }: { n: FeedItem; compact?: boolean; onOpen: (n: FeedItem) => void; onToggleRead: (n: FeedItem) => void }) => {
  const { t } = useTranslation();
  const when = useWhen();
  const { dateTime } = useL10n();
  const unread = !n.readAt;
  const Icon = CAT_ICON[n.category] ?? Bell;
  const hasLink = isAppLink(n.link);
  return (
    <div className={clsx('group relative flex items-start gap-3 transition-colors hover:bg-sunken focus-within:bg-sunken', compact ? 'px-4 py-3' : 'px-5 py-4 sm:px-6', unread && 'bg-sunken/60')}>
      <span className={clsx('relative grid shrink-0 place-items-center rounded-lg', compact ? 'size-8' : 'size-9', CAT_TONE[n.category])} aria-hidden>
        <Icon className="size-4" />
        {unread && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-highlight ring-2 ring-raised" />}
      </span>
      <button type="button" onClick={() => onOpen(n)} className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-focus/50 focus-visible:after:ring-inset">
        <span className={clsx('block text-sm break-words text-ink', unread ? 'font-bold' : 'font-medium')}>
          {unread && <span className="sr-only">{t('ncenter.filter.unread')}: </span>}
          {n.title}
        </span>
        <span className={clsx('mt-0.5 block text-sm break-words whitespace-pre-line text-muted', compact && 'line-clamp-2 text-xs')}>{n.body}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <time dateTime={n.createdAt} title={dateTime(n.createdAt)}>
            {when(n.createdAt)}
          </time>
          <span aria-hidden>·</span>
          <span>{t(`ncenter.cat.${n.category}`)}</span>
        </span>
      </button>
      {/* Per-item actions above the row's click area (z-10), always reachable by keyboard; on touch always shown. */}
      <span className="relative z-10 flex shrink-0 items-center gap-0.5 self-center">
        <button
          type="button"
          onClick={() => onToggleRead(n)}
          className="grid size-9 place-items-center rounded-lg text-muted opacity-100 transition hover:bg-line/60 hover:text-ink focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 pointer-coarse:size-11"
          aria-label={`${unread ? t('ncenter.markRead') : t('ncenter.markUnread')}: ${n.title}`}
          title={unread ? t('ncenter.markRead') : t('ncenter.markUnread')}
        >
          {unread ? <CircleCheck className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
        </button>
        {hasLink && <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />}
      </span>
    </div>
  );
};

// ─── Filters ─────────────────────────────────────────────────────────────

const FilterBar = ({ filter, onChange, summary, compact }: { filter: FeedFilter; onChange: (f: FeedFilter) => void; summary: NotifSummary | undefined; compact?: boolean }) => {
  const { t } = useTranslation();
  const counts = new Map(summary?.categories.map((c) => [c.key, c]) ?? []);
  // Types the user never received stay out of the chips (the current one stays so it can be cleared).
  const cats = NOTIF_CATEGORIES.filter((c) => (counts.get(c)?.total ?? 0) > 0 || filter.category === c);
  const chip = (active: boolean) =>
    clsx(
      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
      compact ? 'min-h-8 pointer-coarse:min-h-10' : 'min-h-9 pointer-coarse:min-h-11',
      active ? 'border-ink bg-ink text-canvas' : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
    );
  return (
    <div className={clsx('flex flex-col gap-2', compact ? 'px-4 py-2.5' : '')} role="group" aria-label={t('ncenter.filter.label')}>
      <div className="flex items-center gap-1 rounded-lg bg-sunken p-0.5 self-start" role="radiogroup" aria-label={t('ncenter.filter.label')}>
        {([false, true] as const).map((u) => (
          <button
            key={String(u)}
            type="button"
            role="radio"
            aria-checked={filter.unreadOnly === u}
            onClick={() => onChange({ ...filter, unreadOnly: u })}
            className={clsx(
              'inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition pointer-coarse:min-h-10',
              filter.unreadOnly === u ? 'bg-card text-ink shadow-[var(--tv-shadow-card)]' : 'text-muted hover:text-ink',
            )}
          >
            {u ? t('ncenter.filter.unread') : t('ncenter.filter.all')}
            {u && (summary?.unread ?? 0) > 0 && <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 text-white tabular-nums">{summary!.unread > 99 ? '99+' : summary!.unread}</span>}
          </button>
        ))}
      </div>
      {cats.length > 1 || filter.category ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t('ncenter.filter.type')}>
          <button type="button" className={chip(!filter.category)} aria-pressed={!filter.category} onClick={() => onChange({ ...filter, category: null })}>
            {t('ncenter.filter.allTypes')}
          </button>
          {cats.map((c) => {
            const Icon = CAT_ICON[c];
            const un = counts.get(c)?.unread ?? 0;
            return (
              <button key={c} type="button" className={chip(filter.category === c)} aria-pressed={filter.category === c} onClick={() => onChange({ ...filter, category: filter.category === c ? null : c })}>
                <Icon className="size-3.5" aria-hidden />
                {t(`ncenter.cat.${c}`)}
                {un > 0 && (
                  <span className="tabular-nums opacity-80">
                    <span className="sr-only">, {t('ncenter.unreadCount', { count: un })}</span>
                    <span aria-hidden>{un}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

// ─── Feed (day groups + infinite scroll) ────────────────────────────────

const useOpenNotification = (after?: () => void) => {
  const navigate = useNavigate();
  const act = useNotificationActions();
  return {
    act,
    open: (n: FeedItem) => {
      if (!n.readAt) act.mutate({ kind: 'read', ids: [n.id] });
      if (isAppLink(n.link)) {
        after?.();
        navigate(n.link);
      }
    },
    toggle: (n: FeedItem) => act.mutate(n.readAt ? { kind: 'unread', ids: [n.id] } : { kind: 'read', ids: [n.id] }),
  };
};

const NotificationFeed = ({ filter, compact, scrollRoot, onNavigate }: { filter: FeedFilter; compact?: boolean; scrollRoot?: RefObject<HTMLElement | null>; onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const feed = useNotificationFeed(filter);
  const { open, toggle } = useOpenNotification(onNavigate);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && !isFetchingNextPage && void fetchNextPage(), {
      root: scrollRoot?.current ?? null,
      rootMargin: '160px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, scrollRoot]);

  if (feed.isLoading) {
    return (
      <div className="grid place-items-center py-12 text-primary" role="status">
        <Spinner className="size-6" />
        <span className="sr-only">{t('ncenter.loading')}</span>
      </div>
    );
  }
  if (feed.error) {
    return (
      <div className="px-4 py-10 text-center text-sm">
        <p className="text-danger-fg">{t('ncenter.loadFailed')}</p>
        <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => feed.refetch()}>
          {t('ncenter.retry')}
        </button>
      </div>
    );
  }
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  if (!items.length) {
    return (
      <div className={clsx('flex flex-col items-center gap-3 px-6 text-center text-sm text-muted', compact ? 'py-10' : 'py-16')}>
        {!compact && <EmptyInbox className="w-40" />}
        {filter.unreadOnly ? t('ncenter.emptyUnread') : filter.category ? t('ncenter.emptyCategory') : t('ncenter.empty')}
      </div>
    );
  }
  const groups = groupByDay(items);
  return (
    <div>
      {groups.map((g) => {
        const label = g.when === 'today' ? t('ncenter.today') : g.when === 'yesterday' ? t('ncenter.yesterday') : date(g.date, { weekday: 'long', day: 'numeric', month: 'long', year: g.date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
        return (
          <section key={g.key} aria-label={label}>
            {/* Sticky inside the bell's own scroll box; on the page it would slide under the sticky top bar. */}
            <h3 className={clsx('type-overline border-b border-line py-1.5', compact ? 'sticky top-0 z-[1] bg-raised px-4' : 'bg-sunken/50 px-5 sm:px-6')}>{label}</h3>
            <ul className="divide-y divide-line">
              {g.items.map((n) => (
                <li key={n.id}>
                  <NotificationRow n={n} compact={compact} onOpen={open} onToggleRead={toggle} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div ref={sentinel} className="flex min-h-12 items-center justify-center border-t border-line px-4 py-2 text-xs text-muted">
        {hasNextPage ? (
          <button type="button" className="btn-ghost btn-sm min-h-9" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <Spinner className="size-3.5" /> : null}
            {isFetchingNextPage ? t('ncenter.loading') : t('ncenter.loadMore')}
          </button>
        ) : (
          <span>{t('ncenter.end')}</span>
        )}
      </div>
    </div>
  );
};

// ─── Bell ────────────────────────────────────────────────────────────────

/**
 * Header bell. `variant` only changes the button size to fit the host header (admin top bar vs. portal header).
 * `prefsTo` links the settings (the page's #prefs block, or the client profile).
 */
export const NotificationBell = ({ allTo, prefsTo, variant = 'portal' }: { allTo: string; prefsTo: string; variant?: 'admin' | 'portal' }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>({ category: null, unreadOnly: false });
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useRealtimeNotifications();
  const { data: summary } = useNotificationSummary();
  const act = useNotificationActions();
  const unread = summary?.unread ?? 0;

  // Screen readers hear new arrivals (the count going up), not every refetch.
  const [announce, setAnnounce] = useState('');
  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (lastUnread.current !== null && unread > lastUnread.current) setAnnounce(t('ncenter.unreadAria', { count: unread }));
    lastUnread.current = unread;
  }, [unread, t]);

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

  const catUnread = filter.category ? (summary?.categories.find((c) => c.key === filter.category)?.unread ?? 0) : unread;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={unread ? t('ncenter.unreadAria', { count: unread }) : t('ncenter.open')}
        data-tour="notification-bell"
        className={clsx(
          'relative grid place-items-center text-muted transition hover:bg-sunken hover:text-ink',
          variant === 'admin' ? 'size-9 rounded-[var(--tv-radius-control)] pointer-coarse:size-10' : 'min-h-11 min-w-11 rounded-xl',
        )}
      >
        <Bell className={variant === 'admin' ? 'size-[18px]' : 'size-5'} aria-hidden />
        {unread > 0 && (
          <span
            className={clsx(
              'absolute grid place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums',
              variant === 'admin' ? 'top-0.5 right-0.5 min-w-4 leading-4 ring-2 ring-canvas' : 'top-1 right-1 min-w-4.5 leading-4.5 ring-2 ring-card',
            )}
            aria-hidden
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label={t('ncenter.title')}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className={clsx(
              'fixed inset-x-3 z-50 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--tv-shadow-raised)] sm:absolute sm:inset-x-auto sm:right-0 sm:w-[26rem] sm:max-h-[min(80vh,40rem)]',
              variant === 'admin' ? 'top-14 sm:top-10' : 'top-20 sm:top-12',
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <p className="type-card-title flex items-center gap-2">
                {t('ncenter.title')}
                {unread > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">{unread > 99 ? '99+' : unread}</span>}
              </p>
              <span className="flex items-center gap-0.5">
                {catUnread > 0 && (
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap text-link hover:bg-sunken hover:text-link-hover"
                    onClick={() => act.mutate({ kind: 'readAll', category: filter.category })}
                  >
                    <CheckCheck className="size-3.5" aria-hidden /> {filter.category ? t('ncenter.markCategory') : t('ncenter.markAll')}
                  </button>
                )}
                <Link to={prefsTo} onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label={t('ncenter.prefs')} title={t('ncenter.prefs')}>
                  <Settings2 className="size-4" aria-hidden />
                </Link>
              </span>
            </div>
            <div className="border-b border-line">
              <FilterBar filter={filter} onChange={setFilter} summary={summary} compact />
            </div>
            <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <NotificationFeed filter={filter} compact scrollRoot={scroll} onNavigate={() => setOpen(false)} />
            </div>
            <Link to={allTo} onClick={() => setOpen(false)} className="flex min-h-11 shrink-0 items-center justify-center gap-1 border-t border-line text-sm font-semibold text-link hover:bg-sunken">
              {t('ncenter.seeAll')} <ChevronRight className="size-4" aria-hidden />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Preferences ─────────────────────────────────────────────────────────

/** E-mail / push switches (PATCH /auth/me, optimistic) and this browser's push subscription. */
export const NotificationPrefs = ({ id }: { id?: string }) => {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const onError = useApiError();
  const [busy, setBusy] = useState<string | null>(null);
  if (!user) return null;
  const update = async (key: 'emailNotifications' | 'pushNotifications', value: boolean) => {
    const prev = user;
    setUser({ ...user, [key]: value });
    setBusy(key);
    try {
      await api.patch('/auth/me', { [key]: value });
      toast.success(t('ncenter.prefsSaved'));
    } catch (err) {
      setUser(prev);
      onError(err);
    } finally {
      setBusy(null);
    }
  };
  const pushOn = user.pushNotifications !== false;
  const row = (icon: LucideIcon, key: 'emailNotifications' | 'pushNotifications', label: string, hint: string) => {
    const Icon = icon;
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
        <span className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{label}</span>
            <span className="block text-xs text-muted">{hint}</span>
          </span>
        </span>
        <Switch checked={user[key] !== false} onChange={(v) => void update(key, v)} label={label} disabled={busy === key} />
      </div>
    );
  };
  return (
    <section id={id} className="card scroll-mt-24 space-y-3 p-5 sm:p-6" aria-labelledby={`${id ?? 'nprefs'}-title`}>
      <div>
        <h2 id={`${id ?? 'nprefs'}-title`} className="flex items-center gap-2 text-base font-semibold text-ink">
          <Settings2 className="size-4 text-primary" aria-hidden /> {t('ncenter.prefsTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('ncenter.prefsIntro')}</p>
      </div>
      {row(Mail, 'emailNotifications', t('ncenter.prefsEmail'), t('ncenter.prefsEmailHint'))}
      {row(Smartphone, 'pushNotifications', t('ncenter.prefsPush'), t('ncenter.prefsPushHint'))}
      <BrowserPushSwitch disabled={!pushOn} />
    </section>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────

const readFilter = (sp: URLSearchParams): FeedFilter => {
  const c = sp.get('type');
  return { category: (NOTIF_CATEGORIES as readonly string[]).includes(c ?? '') ? (c as NotifCategory) : null, unreadOnly: sp.get('unread') === '1' };
};

/**
 * Full history page. `prefs="inline"` renders the settings below the list (anchor #prefs); a path renders a link
 * instead (the client portal keeps its settings in the profile). `aside` adds a side column (client portal cards).
 */
export const NotificationCenterPage = ({ prefs, aside }: { prefs: 'inline' | { to: string }; aside?: ReactNode }) => {
  const { t } = useTranslation();
  useRealtimeNotifications();
  const [sp, setSp] = useSearchParams();
  const { hash } = useLocation();
  const filter = readFilter(sp);
  // "Bildiriş ayarları" in the bell links here with #prefs: the router does not scroll to hashes by itself.
  useEffect(() => {
    if (hash !== '#prefs') return;
    const id = window.setTimeout(() => document.getElementById('prefs')?.scrollIntoView({ block: 'start' }), 50);
    return () => window.clearTimeout(id);
  }, [hash]);
  const { data: summary } = useNotificationSummary();
  const act = useNotificationActions();
  const unread = summary?.unread ?? 0;
  const catUnread = filter.category ? (summary?.categories.find((c) => c.key === filter.category)?.unread ?? 0) : unread;

  const setFilter = (f: FeedFilter) => {
    const next = new URLSearchParams(sp);
    if (f.category) next.set('type', f.category);
    else next.delete('type');
    if (f.unreadOnly) next.set('unread', '1');
    else next.delete('unread');
    setSp(next, { replace: true });
  };

  const main = (
    <div className="min-w-0 space-y-6">
      <section className="card overflow-hidden" aria-labelledby="ncenter-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="ncenter-title" className="flex items-center gap-2 text-xl font-semibold text-ink">
              <BellRing className="size-5 text-primary" aria-hidden />
              {t('ncenter.title')}
              {unread > 0 && <span className="badge bg-danger text-white">{unread}</span>}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('ncenter.pageIntro')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost btn-sm min-h-10 whitespace-nowrap" onClick={() => act.mutate({ kind: 'readAll', category: filter.category })} disabled={catUnread === 0}>
              <CheckCheck className="size-4" aria-hidden />
              {filter.category ? t('ncenter.markCategory') : t('ncenter.markAll')}
            </button>
            {prefs === 'inline' ? (
              <a href="#prefs" className="btn-ghost btn-sm min-h-10 whitespace-nowrap">
                <Settings2 className="size-4" aria-hidden /> {t('ncenter.prefs')}
              </a>
            ) : (
              <Link to={prefs.to} className="btn-ghost btn-sm min-h-10 whitespace-nowrap">
                <Settings2 className="size-4" aria-hidden /> {t('ncenter.prefs')}
              </Link>
            )}
          </div>
        </div>
        <div className="border-b border-line px-5 py-3 sm:px-6">
          <FilterBar filter={filter} onChange={setFilter} summary={summary} />
        </div>
        <NotificationFeed filter={filter} />
      </section>
      {prefs === 'inline' ? (
        <NotificationPrefs id="prefs" />
      ) : (
        <Link to={prefs.to} className="card flex min-h-14 items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-ink hover:bg-sunken sm:px-6">
          <span className="flex items-center gap-2">
            <Settings2 className="size-4 text-primary" aria-hidden /> {t('ncenter.prefsProfile')}
          </span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      )}
    </div>
  );

  if (!aside) return main;
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
      {main}
      <aside className="space-y-6">{aside}</aside>
    </div>
  );
};
