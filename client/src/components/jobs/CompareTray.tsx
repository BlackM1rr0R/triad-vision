import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, GitCompareArrows, X } from 'lucide-react';
import clsx from 'clsx';
import { registerCopy } from '@/i18n';
import { pagesJobCompare } from '@/i18n/pagesJobCompare';
import { useL10n } from '@/lib/l10n';
import { COMPARE_MAX, compareActions, compareHref, useCompareList } from './compare';

registerCopy(pagesJobCompare);

/**
 * Sticky comparison tray at the bottom of the job pages while at least one vacancy is selected: the chosen
 * vacancies (removable), "Compare" (from 2) and "Clear". Leaves room for the floating buttons on the right.
 */
export const CompareTray = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const list = useCompareList();
  const ready = list.length >= 2;
  return (
    <AnimatePresence>
      {list.length > 0 && (
        <motion.aside
          aria-label={t('jc.tray.label')}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-20 z-40 rounded-2xl border border-line bg-raised p-2.5 shadow-[var(--tv-shadow-raised)] sm:right-28 sm:left-6 sm:p-3 lg:right-auto lg:left-1/2 lg:w-[min(720px,calc(100%-14rem))] lg:-translate-x-1/2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
              <GitCompareArrows className="size-4 text-primary" aria-hidden />
              <span aria-live="polite">{t('jc.tray.count', { n: list.length })}</span>
            </p>
            <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto max-sm:order-last max-sm:basis-full">
              {list.map((x) => (
                <li key={x.slug} className="flex max-w-[12rem] shrink-0 items-center gap-1 rounded-full bg-sunken py-1 pr-1 pl-3 text-xs text-ink">
                  <span className="truncate">{tr(x.title)}</span>
                  <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-card hover:text-ink"
                    aria-label={t('jc.tray.remove', { title: tr(x.title) })}
                    onClick={() => compareActions.remove(x.slug)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
              {Array.from({ length: COMPARE_MAX - list.length }, (_, i) => (
                <li key={`slot-${i}`} className="hidden h-9 w-16 shrink-0 rounded-full border border-dashed border-line-strong sm:block" aria-hidden />
              ))}
            </ul>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" className="btn-ghost btn-sm" onClick={compareActions.clear}>
                {t('jc.tray.clear')}
              </button>
              {ready ? (
                <Link to={compareHref(list.map((x) => x.slug))} className="btn-primary btn-sm">
                  {t('jc.tray.open')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <span className={clsx('btn-primary btn-sm pointer-events-none opacity-50')} aria-disabled="true" title={t('jc.tray.needTwo')}>
                  {t('jc.tray.open')}
                  <span className="sr-only"> — {t('jc.tray.needTwo')}</span>
                </span>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default CompareTray;
