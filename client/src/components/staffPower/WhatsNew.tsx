import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, m as motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowRight, Gift, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { pagesStaffOnboarding } from '@/i18n/pagesStaffOnboarding';
import { useEscapeLayer } from '@/components/ui/overlay';
import { startTour } from '@/components/onboarding/tour';
import { fmtDate } from '@/components/admin/labels';
import { whatsNewFeedKey, type WhatsNewFeedV2, type WhatsNewItem } from '@/components/staffOnboarding/api';
import { WhatsNewLoginModal, useWhatsNewText } from '@/components/staffOnboarding/WhatsNewLoginModal';
import './tours';

registerCopy(pagesStaffPower);
registerCopy(pagesStaffOnboarding);

/**
 * "Yeniliklər" in the admin top bar: the release notes for the viewer's role (server lib/whatsNew: code registry,
 * admin-written entries and the older notes of lib/staffUi), an unseen badge (seen is stored per user and entry),
 * "Göstər" for entries with a guided tour, "Hamısına bax" → /admin/whats-new. Also hosts the once-per-session
 * modal with unseen entries after login (WhatsNewLoginModal).
 */
export const WhatsNewButton = () => {
  const { t } = useTranslation();
  const text = useWhatsNewText();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // What was unseen before this opening (opening marks everything as seen, the dots stay until it closes).
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: whatsNewFeedKey,
    queryFn: async () => (await api.get<WhatsNewFeedV2>('/admin/whats-new')).data,
    staleTime: 10 * 60_000,
    enabled: !!user,
    retry: false,
  });
  const seenAll = useMutation({
    mutationFn: async () => (await api.post<WhatsNewFeedV2>('/admin/whats-new/seen', { all: true })).data,
    onSuccess: (feed) => qc.setQueryData(whatsNewFeedKey, feed),
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
  // Opening the panel marks everything as seen.
  useEffect(() => {
    if (!open) return;
    setFreshIds(new Set((data?.items ?? []).filter((i) => !i.seen).map((i) => i.id)));
    if ((data?.unseen ?? 0) > 0 && !seenAll.isPending) seenAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const unseen = data?.unseen ?? 0;
  const items: WhatsNewItem[] = (data?.items ?? []).filter((i) => !!text(i).title).slice(0, 30);
  const label = unseen ? t('sp.whatsNew.openUnread', { count: unseen }) : t('sp.whatsNew.open');

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
        {unseen > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-bold text-primary-contrast tabular-nums" aria-hidden>
            {unseen > 9 ? '9+' : unseen}
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
              {items.map((n) => {
                const fresh = freshIds.has(n.id);
                const { title, body } = text(n);
                return (
                  <li key={n.id} className={clsx('px-4 py-3', fresh && 'bg-primary/[0.03]')}>
                    <div className="flex items-start gap-2">
                      <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', fresh ? 'bg-link' : 'bg-transparent')} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">{title}</p>
                        <p className="mt-0.5 text-xs whitespace-pre-line text-muted">{body}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="num text-[11px] text-muted">{fmtDate(n.date)}</span>
                          {n.tour ? (
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
                          ) : (
                            n.link && (
                              <Link
                                to={n.link}
                                onClick={() => setOpen(false)}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-link hover:bg-primary/[0.06]"
                              >
                                {t('sob.whatsNew.open')} <ArrowRight className="size-3.5" aria-hidden />
                              </Link>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line px-4 py-2.5 text-right">
              <Link to="/admin/whats-new" onClick={() => setOpen(false)} className="text-xs font-semibold text-link hover:underline">
                {t('sob.whatsNew.viewAll')}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {data && <WhatsNewLoginModal feed={data} />}
    </div>
  );
};
