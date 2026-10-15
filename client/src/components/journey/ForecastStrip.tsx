import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarRange, Check, Info } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { useForecast } from './api';
import type { Forecast, ForecastStep } from './types';

registerCopy(pagesJourney);

/** "about 3–5 weeks" when the range is long enough, else days. */
export const useRangeLabel = () => {
  const { t } = useTranslation();
  return (minDays: number, maxDays: number) =>
    maxDays >= 14 ? t('journey.forecast.weeks', { min: Math.max(1, Math.round(minDays / 7)), max: Math.max(1, Math.round(maxDays / 7)) }) : t('journey.forecast.days', { min: minDays, max: maxDays });
};

const DateRange = ({ from, to }: { from: string; to: string }) => {
  const { date } = useL10n();
  const sameYear = new Date(from).getFullYear() === new Date(to).getFullYear();
  return (
    <span className="whitespace-nowrap">
      {date(from, sameYear ? { day: 'numeric', month: 'short' } : { dateStyle: 'medium' })} – {date(to, { day: 'numeric', month: 'short', year: 'numeric' })}
    </span>
  );
};

const StepCell = ({ step, index }: { step: ForecastStep; index: number }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const range = useRangeLabel();
  const tone = step.status === 'done' ? 'text-success' : step.status === 'current' ? 'text-brand-700' : 'text-muted';
  return (
    <li className="relative min-w-0 flex-1" aria-current={step.status === 'current' ? 'step' : undefined}>
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold',
            step.status === 'done' ? 'bg-success text-white' : step.status === 'current' ? 'bg-brand-600 text-white shadow-[0_0_0_4px_rgba(21,101,232,0.18)]' : 'bg-surface text-muted ring-1 ring-line',
          )}
          aria-hidden
        >
          {step.status === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
        </span>
        <span className={clsx('h-px flex-1', step.status === 'done' ? 'bg-success/50' : 'bg-line')} aria-hidden />
      </div>
      <p className={clsx('mt-2.5 text-sm font-bold', step.status === 'upcoming' ? 'text-navy-900/70' : 'text-navy-900')}>{t(`journey.forecast.steps.${step.key}`)}</p>
      <p className={clsx('mt-0.5 text-xs font-semibold', tone)}>{t(`journey.forecast.${step.status}`)}</p>
      <p className="mt-1 text-xs text-muted">
        {step.status === 'done' && step.enteredAt && step.leftAt ? (
          <>
            {date(step.enteredAt, { day: 'numeric', month: 'short' })} – {date(step.leftAt, { day: 'numeric', month: 'short' })}
          </>
        ) : step.expectedFrom && step.expectedTo ? (
          <>
            <span className="block font-medium text-navy-900/80">{range(step.minDays, step.maxDays)}</span>
            <DateRange from={step.expectedFrom} to={step.expectedTo} />
          </>
        ) : (
          range(step.minDays, step.maxDays)
        )}
      </p>
    </li>
  );
};

/** Timeline strip with the expected window of every remaining step (client case page). */
export const ForecastStrip = ({ caseId, className }: { caseId: string; className?: string }) => {
  const { data, isLoading } = useForecast(caseId);
  if (isLoading || !data) return null;
  return <ForecastView forecast={data} className={className} />;
};

export const ForecastView = ({ forecast, className }: { forecast: Forecast; className?: string }) => {
  const { t } = useTranslation();
  const finished = forecast.status === 'APPROVED' || forecast.status === 'REJECTED';
  const basis = forecast.steps.find((s) => s.status === 'current') ?? forecast.steps.find((s) => s.status === 'upcoming') ?? null;
  if (forecast.status === 'CANCELLED') return null;

  return (
    <section className={clsx('card p-5 sm:p-6', className)} aria-labelledby="forecast-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="forecast-title" className="flex items-center gap-2.5 text-base font-bold text-navy-900">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <CalendarRange className="size-4" aria-hidden />
            </span>
            {t('journey.forecast.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('journey.forecast.subtitle')}</p>
        </div>
        {forecast.estimatedDecision && (
          <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2 text-sm">
            <span className="block text-[11px] font-semibold tracking-wide text-brand-700 uppercase">{t('journey.forecast.decision')}</span>
            <span className="font-bold text-navy-900">
              <DateRange from={forecast.estimatedDecision.from} to={forecast.estimatedDecision.to} />
            </span>
          </p>
        )}
        {finished && <p className="rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-800">{t('journey.forecast.finished')}</p>}
      </div>

      <ol className="mt-5 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] sm:gap-4 [&>li]:min-w-[8.5rem] sm:[&>li]:min-w-0">
        {forecast.steps.map((s, i) => (
          <StepCell key={s.key} step={s} index={i} />
        ))}
      </ol>

      {!finished && (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {basis && <>{t(`journey.forecast.basedOn.${basis.basedOn}`, { count: basis.sample })} · </>}
            {t('journey.forecast.disclaimer')}
          </span>
        </p>
      )}
    </section>
  );
};

/** Compact "Expected decision: 12 Nov – 3 Dec" chip for the admin case header. */
export const ForecastChip = ({ caseId, className }: { caseId: string; className?: string }) => {
  const { t } = useTranslation();
  const { data } = useForecast(caseId);
  if (!data?.estimatedDecision) return null;
  const basis = data.steps.find((s) => s.status === 'current');
  return (
    <span
      className={clsx('inline-flex min-h-8 items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800', className)}
      title={basis ? t(`journey.forecast.basedOn.${basis.basedOn}`, { count: basis.sample }) : undefined}
    >
      <CalendarRange className="size-3.5 shrink-0" aria-hidden />
      {t('journey.forecast.decision')}: <DateRange from={data.estimatedDecision.from} to={data.estimatedDecision.to} />
    </span>
  );
};
