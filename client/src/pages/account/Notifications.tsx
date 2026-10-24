import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BellOff, BellRing, CheckCheck, ChevronRight } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import type { Notification } from '@/lib/types';
import { PageLoader } from '@/components/ui/Spinner';
import { useMarkNotificationsRead, useNotifications } from '@/components/portal/useNotifications';
import { useWhen } from '@/components/portal/useWhen';
import { useOverview } from '@/components/portal/useOverview';
import { usePageTitle } from '@/lib/usePageTitle';
import { ManagerCard } from '@/components/portal/Dashboard';
import { PortalCallbackCard } from '@/components/calls/CallbackForm';

export default function Notifications() {
  const { t } = useTranslation();
  usePageTitle(t('portal.notifications'));
  const { dateTime } = useL10n();
  const when = useWhen();
  const navigate = useNavigate();
  const { data, isLoading } = useNotifications();
  const { data: overview } = useOverview();
  // Optimistic (components/portal/useNotifications.ts): dots and badges clear at once, rolled back on error.
  const markRead = useMarkNotificationsRead();

  const open = (n: Notification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  const markAll = () => markRead.mutate(undefined);

  if (isLoading) return <PageLoader />;
  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    // Messages › Notifications, with the contact card and "call me back" (moved here from the portal home).
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
      <section className="card overflow-hidden" aria-labelledby="notif-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 id="notif-title" className="flex items-center gap-2 text-xl font-bold text-navy-900">
            <BellRing className="size-5 text-brand-600" aria-hidden />
            {t('portal.notifications')}
            {unread > 0 && <span className="badge bg-danger text-white">{unread}</span>}
          </h2>
          <button type="button" className="btn-ghost btn-sm min-h-10 whitespace-nowrap" onClick={markAll} disabled={unread === 0}>
            <CheckCheck className="size-4" aria-hidden />
            {t('portal.markAllRead')}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted">
            {/* TODO(ui): large portal empty state (size-14 icon, display title) -> <EmptyState size="lg" tone="brand"> (portal rework) */}
            <span className="grid size-14 place-items-center rounded-full bg-surface">
              <BellOff className="size-6" aria-hidden />
            </span>
            {t('portal.noNotifications')}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {items.map((n, i) => {
                const isUnread = !n.readAt;
                return (
                  <motion.li
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i, 10) * 0.03 }}
                  >
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className={clsx(
                        'group flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface focus-visible:bg-surface sm:px-6',
                        isUnread && 'bg-brand-50/60',
                      )}
                    >
                      <span className="mt-1.5 flex size-2.5 shrink-0" aria-hidden>
                        {isUnread && <span className="size-2.5 rounded-full bg-brand-600 shadow-[0_0_0_4px_rgba(21,101,232,0.15)]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={clsx('block text-sm break-words text-navy-900', isUnread ? 'font-bold' : 'font-semibold')}>
                          {n.title}
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed break-words whitespace-pre-line text-muted">{n.body}</span>
                        <time className="mt-1.5 block text-xs text-muted/80" dateTime={n.createdAt} title={dateTime(n.createdAt)}>
                          {when(n.createdAt)}
                        </time>
                      </span>
                      {n.link && (
                        <ChevronRight className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
                      )}
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>
      <aside className="space-y-6">
        <ManagerCard c={overview?.activeCase ?? null} />
        <PortalCallbackCard />
      </aside>
    </div>
  );
}
