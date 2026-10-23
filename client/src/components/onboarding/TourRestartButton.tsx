import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CircleHelp } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { startTour } from './tour';

registerCopy(pagesPortalUx);

/** "Guided tour" link for a user menu / help area. `compact` = icon only (label stays for screen readers). */
export function TourRestartButton({ tourId, className, compact = false, tour }: { tourId: string; className?: string; compact?: boolean; tour?: string }) {
  const { t } = useTranslation();
  const label = t('pux.tour.restart');
  return (
    <button
      type="button"
      onClick={() => startTour(tourId)}
      className={clsx('inline-flex items-center gap-2 font-semibold', className)}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      data-tour={tour}
    >
      <CircleHelp className="size-4 shrink-0" aria-hidden />
      {!compact && <span className="truncate">{label}</span>}
    </button>
  );
}
