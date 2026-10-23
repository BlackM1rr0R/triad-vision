import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Check } from 'lucide-react';
import { STATUS_STEP, STEP_KEYS } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { stepLabel } from '@/components/portal/stepLabel';
import { StatusBadge } from '@/components/portal/StatusBadge';

/** The 6 steps of an application as one calm track: done · current · upcoming. */
export function ProgressSteps({ status, visaType, number, detailsTo, tour }: { status: CaseStatus; visaType?: string | null; number?: string; detailsTo?: string; tour?: string }) {
  const { t } = useTranslation();
  const step = STATUS_STEP[status];
  if (step < 0) return null; // cancelled
  const finished = status === 'APPROVED' || status === 'REJECTED';
  const current = Math.max(0, step);
  const total = STEP_KEYS.length;

  return (
    <section className="card card-body" aria-labelledby="progress-title" data-tour={tour}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="progress-title" className="type-card-title">
            {t('pux.progress.title')}
            {number && <span className="font-normal text-muted"> · {t('portal.caseNo')} {number}</span>}
          </h2>
          <p className="type-small mt-0.5">
            {t('pux.progress.stepOf', { n: current + 1, total })} · {stepLabel(t, STEP_KEYS[current], visaType)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {detailsTo && (
            <Link to={detailsTo} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold whitespace-nowrap text-brand-600 hover:text-brand-700">
              {t('pux.progress.details')}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-6 gap-1.5 sm:gap-2" aria-label={t('pux.progress.stepOf', { n: current + 1, total })}>
        {STEP_KEYS.map((key, i) => {
          const done = i < current || (finished && i === current);
          const now = i === current && !finished;
          return (
            <li key={key} className="min-w-0" aria-current={now ? 'step' : undefined}>
              <span className={clsx('block h-1.5 rounded-full', done ? 'bg-brand-600' : now ? 'bg-brand-400' : 'bg-line')} aria-hidden />
              <span className={clsx('mt-2 hidden items-center gap-1 truncate text-[11px] font-semibold md:flex', now ? 'text-ink' : done ? 'text-muted' : 'text-muted/70')}>
                {done && <Check className="size-3 shrink-0 text-brand-600" aria-hidden />}
                <span className="truncate">{stepLabel(t, key, visaType)}</span>
              </span>
              <span className="sr-only">
                {stepLabel(t, key, visaType)}
                {done ? ' ✓' : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
