import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Gift, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { useEscapeLayer } from '@/components/ui/overlay';
import { startTour } from '@/components/onboarding/tour';
import { fmtDate } from '@/components/admin/labels';
import { whatsNewKey, type WhatsNewFeed } from './api';
import './tours';

registerCopy(pagesStaffPower);

/**
 * "Yeniliklər" in the admin top bar: short release notes (static i18n list in code — sp.whatsNew.items.<id> —
 * plus optional Setting overrides), an unread badge per user (the last seen note id is stored on the server)
 * and "Göstər" to start the guided tour of a feature.
 */
export const WhatsNewButton = () => {
  const { t, i18n } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // What was read before this opening (the panel marks everything as read at once, the dots stay until it closes).
  const [seenBefore, setSeenBefore] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: whatsNewKey,
    queryFn: async () => (await api.get<WhatsNewFeed>('/admin/me/whats-new')).data,
    staleTime: 10 * 60_000,
    enabled: !!user,
  });
  const seen = useMutation({
    mutationFn: async (id: string) => (await api.post<WhatsNewFeed>('/admin/me/whats-new/seen', { id })).data,
    onSuccess: (feed) => qc.setQueryData(whatsNewKey, feed),
  });
  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  // Opening the panel marks everything as read.
  useEffect(() => {
    if (open) setSeenBefore(data?.seen ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open && data?.latest && data.unread > 0 && !seen.isPending) seen.mutate(data.latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data?.latest, data?.unread]);

  const unread = data?.unread ?? 0;
  const items = (data?.items ?? []).filter((i) => i.custom || i18n.exists(`sp.whatsNew.items.${i.id}.title`));
  const seenIdx = seenBefore ? items.findIndex((i) => i.id === seenBefore) : -1;
  const label = unread ? t('sp.whatsNew.openUnread', { count: unread }) : t('sp.whatsNew.open');

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-10 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink sm:size-9"
        aria-label={label}
        title={label}
        aria-expanded={open}
        data-tour="sp-whats-new"
      >
        <Gift className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-bold text-primary-contrast tabular-nums" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={t('sp.whatsNew.title')}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-2 top-14 z-50 rounded-xl border border-line bg-card shadow-[var(--tv-shadow-overlay)] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[24rem]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-ink">{t('sp.whatsNew.title')}</p>
              <span className="text-[11px] text-muted">{t('sp.whatsNew.subtitle')}</span>
            </div>
            <ul className="max-h-[min(70vh,28rem)] divide-y divide-line overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t('sp.whatsNew.empty')}</li>}
              {items.map((n, i) => {
                const fresh = seenIdx < 0 ? true : i < seenIdx;
                const title = n.custom ? tr(n.custom.title) : t(`sp.whatsNew.items.${n.id}.title`);
                const body = n.custom ? tr(n.custom.body) : t(`sp.whatsNew.items.${n.id}.body`);
                return (
                  <li key={n.id} className={clsx('px-4 py-3', fresh && 'bg-primary/[0.03]')}>
                    <div className="flex items-start gap-2">
                      <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', fresh ? 'bg-link' : 'bg-transparent')} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">{title}</p>
                        <p className="mt-0.5 text-xs whitespace-pre-line text-muted">{body}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="num text-[11px] text-muted">{fmtDate(n.date)}</span>
                          {n.tour && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-link hover:bg-primary/[0.06]"
                              onClick={() => {
                                setOpen(false);
                                startTour(n.tour!);
                              }}
                            >
                              <PlayCircle className="size-3.5" aria-hidden /> {t('sp.whatsNew.show')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
