import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarRange, Check, Info } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { useForecast } from './api';
import type { Forecast, ForecastStep } from './types';

registerCopy(pagesJourney);

/**
 * Durations of two weeks or more read in weeks ("about 2–4 weeks"), shorter ones in days. A range that only crosses
 * the two-week mark is shown in weeks when the team entered it in whole weeks, else in days ("about 10–20 days").
 */
export const rangeUnit = (minDays: number, maxDays: number): 'week' | 'day' =>
  minDays >= 14 || (maxDays >= 14 && minDays % 7 === 0 && maxDays % 7 === 0) ? 'week' : 'day';

export const useRangeLabel = () => {
  const { t } = useTranslation();
  return (minDays: number, maxDays: number) => {
    if (rangeUnit(minDays, maxDays) === 'week') {
      const min = Math.max(1, Math.round(minDays / 7));
      const max = Math.max(min, Math.round(maxDays / 7));
      return min === max ? t('journey.forecast.weeksExact', { count: min }) : t('journey.forecast.weeks', { min, max });
    }
    return minDays === maxDays ? t('journey.forecast.daysExact', { count: minDays }) : t('journey.forecast.days', { min: minDays, max: maxDays });
  };
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

const EASE = [0.22, 1, 0.36, 1] as const;

const StepCell = ({ step, index, visaType }: { step: ForecastStep; index: number; visaType?: string }) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const { date } = useL10n();
  const range = useRangeLabel();
  const tone = step.status === 'done' ? 'text-success' : step.status === 'current' ? 'text-link' : 'text-muted';
  return (
    <li className="relative min-w-0 flex-1" aria-current={step.status === 'current' ? 'step' : undefined}>
      <div className="flex items-center gap-2">
        <motion.span
          className={clsx(
            'relative grid size-10 shrink-0 place-items-center rounded-full border-2 font-display text-sm font-bold',
            step.status === 'done' && 'border-success bg-success text-white',
            step.status === 'current' && 'border-primary bg-card text-link shadow-lg shadow-brand-600/30',
            step.status === 'upcoming' && 'border-line bg-card text-muted',
          )}
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: reduce ? 0 : index * 0.12, ease: EASE }}
          aria-hidden
        >
          {step.status === 'current' && !reduce && (
            <motion.span
              className="absolute inset-0 rounded-full bg-primary"
              animate={{ scale: [1, 1.7], opacity: [0.45, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          {step.status === 'done' ? <Check className="relative size-4" strokeWidth={3} /> : <span className="relative">{index + 1}</span>}
        </motion.span>
        <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <motion.span
            className="absolute inset-0 rounded-full bg-success"
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: step.status === 'done' ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)' }}
            transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.15 + index * 0.12, ease: EASE }}
          />
        </span>
      </div>
      <p className={clsx('mt-2.5 text-sm font-bold', step.status === 'upcoming' ? 'text-ink/70' : 'text-ink')}>{step.key === 'CONTRACT' && visaType ? t(`journey.forecast.contractByType.${visaType}`, { defaultValue: t('journey.forecast.steps.CONTRACT') }) : t(`journey.forecast.steps.${step.key}`)}</p>
      <p className={clsx('mt-0.5 text-xs font-semibold', tone)}>{t(`journey.forecast.${step.status}`)}</p>
      <p className="mt-1 text-xs text-muted">
        {step.status === 'done' && step.enteredAt && step.leftAt ? (
          <>
            {date(step.enteredAt, { day: 'numeric', month: 'short' })} – {date(step.leftAt, { day: 'numeric', month: 'short' })}
          </>
        ) : step.expectedFrom && step.expectedTo ? (
          <>
            <span className="block font-medium text-ink/80">{range(step.minDays, step.maxDays)}</span>
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
          <h2 id="forecast-title" className="flex items-center gap-2.5 text-base font-bold text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sunken text-primary">
              <CalendarRange className="size-4" aria-hidden />
            </span>
            {t('journey.forecast.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('journey.forecast.subtitle')}</p>
        </div>
        {forecast.estimatedDecision && (
          <p className="rounded-xl border border-line-strong bg-sunken px-3.5 py-2 text-sm">
            <span className="block text-[11px] font-semibold tracking-wide text-link uppercase">{t('journey.forecast.decision')}</span>
            <span className="font-bold text-ink">
              <DateRange from={forecast.estimatedDecision.from} to={forecast.estimatedDecision.to} />
            </span>
          </p>
        )}
        {finished && <p className="rounded-xl bg-success-bg px-3.5 py-2 text-sm font-semibold text-success-fg">{t('journey.forecast.finished')}</p>}
      </div>

      <ol className="mt-5 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] sm:gap-4 [&>li]:min-w-[8.5rem] sm:[&>li]:min-w-0">
        {forecast.steps.map((s, i) => (
          <StepCell key={s.key} step={s} index={i} visaType={forecast.visaType} />
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
      className={clsx('inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-strong bg-sunken px-2.5 py-1 text-xs font-medium text-link', className)}
      title={basis ? t(`journey.forecast.basedOn.${basis.basedOn}`, { count: basis.sample }) : undefined}
    >
      <CalendarRange className="size-3.5 shrink-0" aria-hidden />
      {t('journey.forecast.decision')}: <DateRange from={data.estimatedDecision.from} to={data.estimatedDecision.to} />
    </span>
  );
};
