import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, CalendarRange, Check } from 'lucide-react';
import { STATUS_STEP, STEP_KEYS } from '@/lib/caseStatus';
import { useL10n } from '@/lib/l10n';
import type { PortalStage } from '@/lib/portalStage';
import { stepLabel } from '@/components/portal/stepLabel';
import type { NextStep } from '@/components/portal/usePortalNav';

/**
 * Compact progress under the home card: the stage, the share done, the 6 steps of the application (or,
 * in Germany, the first-steps checklist) and the next date to expect from the forecast.
 */
export function HomeProgress({ next, stage, detailsTo, tour }: { next: NextStep; stage: PortalStage; detailsTo?: string | null; tour?: string }) {
  const { t } = useTranslation();
  const { date } = useL10n();
  const c = next.case;
  if (!c) return null;

  const inGermany = stage === 'IN_GERMANY' && !!next.onboarding?.total;
  const percent = inGermany ? next.onboarding!.percent : (next.progress ?? 0);
  const step = STATUS_STEP[c.status];
  const finished = c.status === 'APPROVED' || c.status === 'REJECTED';
  const current = Math.max(0, step);
  const fmt = (iso: string) => date(iso, { day: 'numeric', month: 'short' });
  const m = next.milestone;
  const when = m?.to ? (m.from && fmt(m.from) !== fmt(m.to) ? t('pnav.progress.range', { from: fmt(m.from), to: fmt(m.to) }) : fmt(m.to)) : null;

  return (
    <section className="card p-5 sm:p-7" aria-labelledby="home-progress-title" data-tour={tour}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="home-progress-title" className="type-card-title">
            {t('pnav.progress.title')}
            <span className="font-normal text-muted"> · {t(`pnav.stage.${stage}`)}</span>
          </h2>
          <p className="type-small mt-1.5">
            {inGermany ? (
              t('pnav.progress.onboarding', { done: next.onboarding!.done, total: next.onboarding!.total })
            ) : (
              <span className="code-id inline-flex items-center rounded-full border border-line bg-sunken px-2.5 py-0.5 text-xs font-semibold text-ink">
                {t('portal.caseNo')} {c.number}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink tabular-nums">{t('pnav.progress.percent', { percent })}</span>
          {detailsTo && (
            <Link to={detailsTo} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold whitespace-nowrap text-link hover:text-link">
              {t('pnav.progress.details')}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {inGermany || step < 0 ? (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('pnav.progress.title')}>
          <span className="block h-full rounded-full bg-highlight" style={{ width: `${percent}%` }} />
        </div>
      ) : (
        <ol className="mt-4 grid grid-cols-6 gap-1.5 sm:gap-2" aria-label={t('pnav.progress.title')}>
          {STEP_KEYS.map((key, i) => {
            const done = i < current || (finished && i === current);
            const now = i === current && !finished;
            return (
              <li key={key} className="min-w-0" aria-current={now ? 'step' : undefined}>
                <span className={clsx('block h-1.5 rounded-full', done ? 'bg-highlight' : now ? 'bg-highlight/45' : 'bg-line')} aria-hidden />
                <span className={clsx('mt-2 hidden items-center gap-1 truncate text-[11px] font-semibold md:flex', now ? 'text-ink' : done ? 'text-ink' : 'text-muted')}>
                  {done && <Check className="size-3 shrink-0 text-primary" aria-hidden />}
                  <span className="truncate">{stepLabel(t, key, c.visaType)}</span>
                </span>
                <span className="sr-only">
                  {stepLabel(t, key, c.visaType)}
                  {done ? ' ✓' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {!inGermany && !finished && step >= 0 && (
        <p className="mt-3 text-sm text-muted md:hidden">
          {t('pux.progress.stepOf', { n: current + 1, total: STEP_KEYS.length })} · <span className="font-semibold text-ink">{stepLabel(t, STEP_KEYS[current], c.visaType)}</span>
        </p>
      )}

      {m && when && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-sunken px-3.5 py-3 text-sm">
          <CalendarRange className="mt-0.5 size-4 shrink-0 text-highlight-fg" aria-hidden />
          <span className="min-w-0">
            <span className="text-muted">{t('pnav.progress.milestone')}: </span>
            <span className="font-semibold text-ink">{t(`pnav.progress.key.${m.key}`, { defaultValue: m.key })}</span>
            <span className="text-muted"> · </span>
            <span className="font-semibold whitespace-nowrap text-ink">{when}</span>
          </span>
        </p>
      )}
    </section>
  );
}
