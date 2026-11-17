import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesStaffOnboarding } from '@/i18n/pagesStaffOnboarding';
import { Modal } from '@/components/ui/Modal';
import { useTourState } from '@/components/onboarding/tour';
import { fmtDate } from '@/components/admin/labels';
import { pick, whatsNewFeedKey, type WhatsNewFeedV2, type WhatsNewItem } from './api';

registerCopy(pagesStaffOnboarding);

/** Title / body of an entry in the UI language; older notes keep their texts in the client i18n. */
export const useWhatsNewText = () => {
  const { t, i18n } = useTranslation();
  return (n: WhatsNewItem) => {
    if (n.title) return { title: pick(n.title, i18n.language), body: pick(n.body, i18n.language) };
    const key = `sp.whatsNew.items.${n.id}`;
    return i18n.exists(`${key}.title`) ? { title: t(`${key}.title`), body: t(`${key}.body`) } : { title: '', body: '' };
  };
};

const sessionKey = (userId: string) => `tv-whats-new-modal:${userId}`;

/**
 * Once per browser session after login: a modal with the unseen entries for the user's role (at most 8 — the
 * server picks them). "Got it" marks the shown entries as seen; "Later" only closes it for this session.
 * Waits while a guided tour runs and never shows on the Yeniliklər page itself.
 */
export const WhatsNewLoginModal = ({ feed }: { feed: WhatsNewFeedV2 }) => {
  const { t } = useTranslation();
  const text = useWhatsNewText();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const tour = useTourState();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => {
    const ids = new Set(feed.modal);
    return feed.items.filter((i) => ids.has(i.id) && !!text(i).title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed]);
  const seen = useMutation({
    mutationFn: async (ids: string[]) => (await api.post<WhatsNewFeedV2>('/admin/whats-new/seen', { ids })).data,
    onSuccess: (f) => qc.setQueryData(whatsNewFeedKey, f),
  });

  useEffect(() => {
    if (!user || open || entries.length === 0 || tour.tourId !== null || pathname.startsWith('/admin/whats-new')) return;
    let shown = false;
    try {
      shown = sessionStorage.getItem(sessionKey(user.id)) === '1';
    } catch {
      /* storage blocked: show once per page load */
    }
    if (shown) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(sessionKey(user.id), '1');
      } catch {
        /* ignore */
      }
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [user, open, entries.length, tour.tourId, pathname]);

  const gotIt = () => {
    setOpen(false);
    if (entries.length) seen.mutate(entries.map((e) => e.id));
  };
  const more = Math.max(0, feed.unseen - entries.length);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('sob.whatsNew.modalTitle')}
      description={t('sob.whatsNew.modalIntro')}
      icon={<Sparkles className="size-5" aria-hidden />}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Link to="/admin/whats-new" onClick={gotIt} className="text-sm font-semibold text-link hover:underline">
            {t('sob.whatsNew.viewAll')}
            {more > 0 ? ` (${t('sob.whatsNew.more', { count: more })})` : ''}
          </Link>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              {t('sob.whatsNew.later')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={gotIt} data-autofocus>
              {t('sob.whatsNew.gotIt')}
            </button>
          </div>
        </div>
      }
    >
      <ul className="divide-y divide-line">
        {entries.map((n) => {
          const { title, body } = text(n);
          return (
            <li key={n.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{title}</p>
                <span className="num shrink-0 text-[11px] text-muted">{fmtDate(n.date)}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{body}</p>
              {n.link && (
                <Link to={n.link} onClick={gotIt} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
                  {t('sob.whatsNew.open')} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
};
