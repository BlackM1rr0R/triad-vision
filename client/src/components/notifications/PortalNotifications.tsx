import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Bell, BellRing, CheckCheck, ChevronRight } from 'lucide-react';
import type { Notification } from '@/lib/types';
import { useL10n } from '@/lib/l10n';
import { useRealtimeNotifications } from '@/lib/realtime';
import { registerCopy } from '@/i18n';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { useMarkNotificationsRead, useNotifications } from '@/components/portal/useNotifications';
import { useWhen } from '@/components/portal/useWhen';
import { EmptyInbox } from '@/components/illustrations';
import { Spinner } from '@/components/ui/Spinner';
import { BrowserPushSwitch } from './BrowserPushSwitch';

registerCopy(pagesPortalExtras);

/**
 * Notifications for the employer, agent and partner portals: a header bell (unread badge + latest items) and a full
 * page. Same API and cache as the client portal (GET /api/notifications, query key ['notifications'], optimistic
 * mark-read); server-sent events refresh the badge the moment a notification is created (polling stays as fallback).
 *
 * Only in-app paths are followed ("/company/…", "/agent/…"); anything else (absolute URLs) is ignored.
 */

export const isAppLink = (link: string | null | undefined): link is string => !!link && link.startsWith('/') && !link.startsWith('//');

const Row = ({ n, onOpen, compact }: { n: Notification; onOpen: (n: Notification) => void; compact?: boolean }) => {
  const when = useWhen();
  const { dateTime } = useL10n();
  const unread = !n.readAt;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={clsx(
        'group flex w-full items-start gap-3 text-left transition-colors hover:bg-sunken focus-visible:bg-sunken',
        compact ? 'px-4 py-3' : 'px-5 py-4 sm:px-6',
        unread && 'bg-sunken/60',
      )}
    >
      <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-highlight' : 'bg-transparent')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={clsx('block text-sm break-words text-ink', unread ? 'font-bold' : 'font-semibold')}>{n.title}</span>
        <span className={clsx('mt-0.5 block text-sm break-words whitespace-pre-line text-muted', compact && 'line-clamp-2 text-xs')}>{n.body}</span>
        <time className="mt-1 block text-xs text-muted" dateTime={n.createdAt} title={dateTime(n.createdAt)}>
          {when(n.createdAt)}
        </time>
      </span>
      {isAppLink(n.link) && <ChevronRight className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />}
    </button>
  );
};

const useOpen = (after?: () => void) => {
  const navigate = useNavigate();
  const markRead = useMarkNotificationsRead();
  return {
    markRead,
    open: (n: Notification) => {
      if (!n.readAt) markRead.mutate([n.id]);
      if (isAppLink(n.link)) {
        after?.();
        navigate(n.link);
      }
    },
  };
};

/** Header bell with the unread count and the latest notifications; "all" links to the portal's notifications page. */
export const PortalNotificationBell = ({ allTo }: { allTo: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useRealtimeNotifications();
  const { data } = useNotifications();
  const { open: openItem, markRead } = useOpen(() => setOpen(false));

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
  const items = (data?.items ?? []).slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        aria-label={unread ? t('px.notif.unread', { count: unread }) : t('px.notif.open')}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-semibold text-white tabular-nums ring-2 ring-card" aria-hidden>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-3 top-20 z-50 overflow-hidden rounded-2xl border border-line bg-raised shadow-[var(--tv-shadow-raised)] sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:w-96"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <p className="type-card-title">{t('px.notif.title')}</p>
              {unread > 0 && (
                <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap text-link hover:text-link-hover" onClick={() => markRead.mutate(undefined)}>
                  <CheckCheck className="size-3.5" aria-hidden /> {t('px.notif.markAll')}
                </button>
              )}
            </div>
            <ul className="max-h-[min(60vh,28rem)] divide-y divide-line overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t('px.notif.empty')}</li>}
              {items.map((n) => (
                <li key={n.id}>
                  <Row n={n} onOpen={openItem} compact />
                </li>
              ))}
            </ul>
            <Link to={allTo} onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center gap-1 border-t border-line text-sm font-semibold text-link hover:bg-sunken">
              {t('px.notif.seeAll')} <ChevronRight className="size-4" aria-hidden />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Full notifications page of a portal (/company/notifications, /agent/notifications, /partner/notifications). */
export const PortalNotificationsPage = () => {
  const { t } = useTranslation();
  useRealtimeNotifications();
  const { data, isLoading } = useNotifications();
  const { open, markRead } = useOpen();
  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden" aria-labelledby="pn-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 id="pn-title" className="flex items-center gap-2 text-xl font-semibold text-ink">
            <BellRing className="size-5 text-primary" aria-hidden />
            {t('px.notif.title')}
            {unread > 0 && <span className="badge bg-danger text-white">{unread}</span>}
          </h2>
          <button type="button" className="btn-ghost btn-sm min-h-10 whitespace-nowrap" onClick={() => markRead.mutate(undefined)} disabled={unread === 0}>
            <CheckCheck className="size-4" aria-hidden />
            {t('px.notif.markAll')}
          </button>
        </div>
        {isLoading ? (
          <div className="grid place-items-center py-14 text-primary">
            <Spinner className="size-6" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted">
            <EmptyInbox className="w-40" />
            {t('px.notif.empty')}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <Row n={n} onOpen={open} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <BrowserPushSwitch />
    </div>
  );
};
