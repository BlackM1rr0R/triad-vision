import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Route } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesJourneyMap } from '@/i18n/pagesJourneyMap';
import { pagesJourney } from '@/i18n/pagesJourney';
import type { NextStep } from './usePortalNav';
import { buildMilestones, type Milestone } from './journey';
import { JourneyMap } from './JourneyMap';
import { JourneyTimeline } from './JourneyTimeline';

registerCopy(pagesJourneyMap);
registerCopy(pagesJourney);

/**
 * "Your journey" (portal home and case overview): home city → German city with six milestones
 * (documents → contract → embassy → decision → travel → arrival) from GET /api/account/next-step.
 * Tablet / desktop: the animated map next to the milestone list; phones: the list only (same content).
 */
export function JourneyCard({ next, className, tour }: { next: NextStep | undefined; className?: string; tour?: string }) {
  const { t, i18n } = useTranslation();
  const journey = next?.journey ?? null;
  const milestones = useMemo(() => (journey ? buildMilestones(journey) : []), [journey]);
  if (!journey || !next?.case) return null;

  const visaType = next.case.visaType;
  const contractKey = `journey.forecast.contractByType.${visaType}`;
  const labelOf = (m: Milestone) => (m.key === 'contract' && visaType && i18n.exists(contractKey) ? t(contractKey) : t(`jmap.milestones.${m.key}`));
  const fromName = journey.origin.city ?? t('jmap.homeFallback');
  const toName = journey.destination.city ?? t('jmap.germany');
  const current = milestones.find((m) => m.status === 'current');
  const stopped = journey.outcome === 'REJECTED' || journey.outcome === 'CANCELLED';
  const status = current ? t('jmap.currentIs', { step: labelOf(current) }) : stopped ? t('jmap.stopped') : milestones.every((m) => m.status === 'done') ? t('jmap.allDone') : '';
  const estimated = milestones.some((m) => m.dateKind === 'expected');

  return (
    <section className={clsx('card card-body', className)} aria-labelledby="journey-map-title" data-tour={tour}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id="journey-map-title" className="type-card-title flex items-center gap-2">
            <Route className="size-4 shrink-0 text-brand-600" aria-hidden />
            {t('jmap.title')}
          </h2>
          <p className="type-small mt-0.5 break-words">{t('jmap.route', { from: fromName, to: toName })}</p>
        </div>
        {journey.outcome === 'APPROVED' && <span className="badge bg-success-bg text-success-fg">{t('jmap.approved')}</span>}
        {journey.outcome === 'REJECTED' && <span className="badge bg-danger-bg text-danger-fg">{t('jmap.rejected')}</span>}
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-center">
        <div className="hidden md:block">
          <JourneyMap
            journey={journey}
            milestones={milestones}
            labelOf={labelOf}
            fromName={fromName}
            toName={toName}
            summary={t('jmap.mapLabel', { from: fromName, to: toName, status })}
          />
        </div>
        <JourneyTimeline milestones={milestones} labelOf={labelOf} />
      </div>

      {estimated && <p className="mt-3 text-xs text-muted">{t('jmap.estimateNote')}</p>}
    </section>
  );
}
