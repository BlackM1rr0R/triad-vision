import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BellOff, BellRing, CheckCheck, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { Notification } from '@/lib/types';
import { PageLoader, Spinner } from '@/components/ui/Spinner';
import { useNotifications } from '@/components/portal/useNotifications';
import { useApiError } from '@/components/portal/useApiError';
import { useWhen } from '@/components/portal/useWhen';
import { OVERVIEW_KEY } from '@/components/portal/useOverview';
import { usePageTitle } from '@/lib/usePageTitle';

export default function Notifications() {
  const { t } = useTranslation();
  usePageTitle(t('portal.notifications'));
  const { dateTime } = useL10n();
  const when = useWhen();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onError = useApiError();
  const { data, isLoading } = useNotifications();
  const [markingAll, setMarkingAll] = useState(false);

  const markRead = (body: { ids?: string[] }) => api.post('/notifications/read', body);

  const open = (n: Notification) => {
    if (!n.readAt) {
      // Optimistically mark as read so the badge updates immediately.
      qc.setQueryData<typeof data>(['notifications'], (prev) =>
        prev
          ? {
              items: prev.items.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)),
              unread: Math.max(0, prev.unread - 1),
            }
          : prev,
      );
      markRead({ ids: [n.id] })
        .catch(onError)
        .finally(() => {
          void qc.invalidateQueries({ queryKey: ['notifications'] });
          void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
        });
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markRead({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['notifications'] }),
        qc.invalidateQueries({ queryKey: OVERVIEW_KEY }),
      ]);
    } catch (err) {
      onError(err);
    } finally {
      setMarkingAll(false);
    }
  };

  if (isLoading) return <PageLoader />;
  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <section className="card mx-auto max-w-3xl overflow-hidden" aria-labelledby="notif-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <h2 id="notif-title" className="flex items-center gap-2 text-xl font-bold text-navy-900">
          <BellRing className="size-5 text-brand-600" aria-hidden />
          {t('portal.notifications')}
          {unread > 0 && <span className="badge bg-danger text-white">{unread}</span>}
        </h2>
        <button type="button" className="btn-ghost btn-sm min-h-10 whitespace-nowrap" onClick={markAll} disabled={unread === 0 || markingAll}>
          {markingAll ? <Spinner className="size-3.5" /> : <CheckCheck className="size-4" aria-hidden />}
          {t('portal.markAllRead')}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted">
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
  );
}
