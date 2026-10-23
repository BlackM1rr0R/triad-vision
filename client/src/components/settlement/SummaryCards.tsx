import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { STAGE_DOT, fmtBag } from './money';
import { STAGES, type Summary } from './types';
import { SkeletonBlock } from '@/components/ui/Skeleton';

/** Cards above the table: per beneficiary owed / paid this month (and owed overall), partner commissions, stages. */
export const SummaryCards = ({ summary }: { summary: Summary | undefined }) => {
  const { t } = useTranslation();
  if (!summary) return <SkeletonBlock className="h-[104px] w-full" />;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {summary.beneficiaries.map((b) => (
        <div key={b.id} className="min-w-[180px] shrink-0 rounded-xl border border-line bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-sm font-bold text-ink">{b.name}</span>
            <span className="text-[10px] text-muted">{t('settlement.summary.thisMonth', { month: summary.month })}</span>
          </div>
          <dl className="mt-1.5 space-y-0.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('settlement.summary.owed')}</dt>
              <dd className="font-semibold text-amber-800 tabular-nums">{fmtBag(b.month.pending) || '0'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('settlement.summary.paid')}</dt>
              <dd className="font-semibold text-emerald-700 tabular-nums">{fmtBag(b.month.paid) || '0'}</dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-line pt-0.5">
              <dt className="text-muted">{t('settlement.summary.overall')}</dt>
              <dd className="font-semibold text-ink tabular-nums">{fmtBag(b.overall.pending) || '0'}</dd>
            </div>
          </dl>
        </div>
      ))}
      <div className="min-w-[220px] shrink-0 rounded-xl border border-line bg-card p-3">
        <div className="font-display text-sm font-bold text-ink">{t('settlement.summary.partners')}</div>
        {summary.partners.filter((p) => fmtBag(p.pending) || fmtBag(p.paid)).length ? (
          <ul className="mt-1.5 max-h-[66px] space-y-0.5 overflow-y-auto text-xs">
            {summary.partners
              .filter((p) => fmtBag(p.pending) || fmtBag(p.paid))
              .map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted" title={t('settlement.summary.clients', { count: p.clients })}>
                    {p.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold text-amber-800">{fmtBag(p.pending) || '0'}</span>
                    {fmtBag(p.paid) && <span className="text-emerald-700"> · {fmtBag(p.paid)}</span>}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-muted">{t('settlement.summary.partnersEmpty')}</p>
        )}
      </div>
      <div className="min-w-[200px] shrink-0 rounded-xl border border-line bg-card p-3">
        <div className="font-display text-sm font-bold text-ink">{t('settlement.summary.stages')}</div>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
          {STAGES.map((s) => (
            <li key={s} className="flex items-center justify-between gap-1">
              <span className="flex min-w-0 items-center gap-1 text-muted">
                <span className={clsx('size-2 shrink-0 rounded-full', STAGE_DOT[s])} />
                <span className="truncate">{t(`settlement.stage.${s}`)}</span>
              </span>
              <span className="font-semibold tabular-nums">{summary.stages[s]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-[200px] shrink-0 rounded-xl border border-line bg-card p-3">
        <div className="font-display text-sm font-bold text-ink">{t('settlement.summary.revenue')}</div>
        <dl className="mt-1.5 space-y-0.5 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('settlement.cols.amount')}</dt>
            <dd className="font-semibold tabular-nums">{fmtBag(summary.revenue.agreed) || '0'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('settlement.summary.received')}</dt>
            <dd className="font-semibold text-emerald-700 tabular-nums">{fmtBag(summary.revenue.received) || '0'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('settlement.cols.expenses')}</dt>
            <dd className="font-semibold tabular-nums">{fmtBag(summary.revenue.expenses) || '0'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
};
