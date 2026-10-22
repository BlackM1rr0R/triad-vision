import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowUpRight, ListChecks } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesToday } from '@/i18n/pagesToday';
import { dueText, useMyWork } from './api';
import { CATEGORY_TONE, KIND_ICON } from './kinds';

registerCopy(pagesToday);

/**
 * Compact "My work today" card (workspace home, admin dashboard): counters and the first rows of the
 * queue; everything links to /admin/today. Shares the query with the page and the nav badge.
 */
export const TodayCard = ({ limit = 5, className }: { limit?: number; className?: string }) => {
  const { t } = useTranslation();
  const { data, isLoading } = useMyWork('mine');
  const items = data?.items.slice(0, limit) ?? [];
  const counts = data?.counts;

  return (
    <section className={clsx('min-w-0 rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(11,31,68,0.05)]', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          <ListChecks className="size-4 shrink-0 text-brand-600" aria-hidden />
          {t('today.card.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {!!counts?.urgent && <span className="badge bg-red-100 text-red-700 tabular-nums">{t('today.card.urgent', { count: counts.urgent })}</span>}
          {!!counts?.overdue && <span className="badge bg-amber-100 text-amber-800 tabular-nums">{t('today.card.overdue', { count: counts.overdue })}</span>}
          <Link to="/admin/today" className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:underline">
            {t('today.card.open')} <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        </div>
      </header>
      {isLoading ? (
        <div className="space-y-2 p-4" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : !items.length ? (
        <p className="px-4 py-6 text-center text-sm text-muted sm:px-5">{t('today.card.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((i) => {
            const Icon = KIND_ICON[i.kind];
            const due = dueText(t, i);
            return (
              <li key={i.id}>
                <Link to="/admin/today" className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface sm:px-5">
                  <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', CATEGORY_TONE[i.category])}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{i.title}</span>
                    <span className="block truncate text-[11px] text-muted">{t(`today.kind.${i.kind}`)}</span>
                  </span>
                  <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', due.late ? 'bg-red-100 text-red-700' : 'bg-surface text-muted')}>{due.text}</span>
                </Link>
              </li>
            );
          })}
          {counts && counts.total > items.length && (
            <li className="px-4 py-2 text-right text-xs text-muted sm:px-5">{t('today.card.total', { count: counts.total })}</li>
          )}
        </ul>
      )}
    </section>
  );
};

export default TodayCard;
