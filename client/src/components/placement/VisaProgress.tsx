import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Plane } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { fmtDate } from '@/components/admin/labels';

registerCopy(pagesPlacement);

export interface VisaProgressData {
  steps: { key: 'documents' | 'contract' | 'embassy' | 'appointment' | 'decision' | 'arrival'; state: 'done' | 'current' | 'upcoming'; reachedAt: string | null }[];
  currentStep: string;
  arrival: { from: string; to: string; planned: boolean } | null;
  approximate: true;
}

/**
 * Employer view of a candidate's visa progress: six steps, the dates of the steps reached and an approximate
 * arrival window. No documents or personal data (server: lib/placement/visaProgress.ts).
 */
export function VisaProgress({ visa, className }: { visa: VisaProgressData; className?: string }) {
  const { t } = useTranslation();
  const arrival = visa.arrival;
  const same = arrival && fmtDate(arrival.from) === fmtDate(arrival.to);
  return (
    <div className={className}>
      <ol className="space-y-2" aria-label={t('placement.public.visa.title')}>
        {visa.steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-sm" aria-current={s.state === 'current' ? 'step' : undefined}>
            <span
              className={clsx(
                'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                s.state === 'done' ? 'bg-success-bg text-success-fg' : s.state === 'current' ? 'bg-highlight text-ink' : 'bg-line/60 text-muted',
              )}
              aria-hidden
            >
              {s.state === 'done' ? <Check className="size-3.5" /> : s.key === 'arrival' ? <Plane className="size-3.5" /> : ''}
            </span>
            <span className={clsx('min-w-0 flex-1', s.state === 'upcoming' ? 'text-muted' : 'font-semibold text-ink')}>{t(`placement.public.visa.steps.${s.key}`)}</span>
            {s.reachedAt && <span className="shrink-0 text-xs text-muted">{fmtDate(s.reachedAt)}</span>}
          </li>
        ))}
      </ol>
      {arrival && (
        <p className="mt-3 text-xs text-muted">
          <Plane className="mr-1 inline size-3.5" aria-hidden />
          {arrival.planned ? t('placement.public.visa.arrivalPlanned') : t('placement.public.visa.arrivalEstimate')}:{' '}
          <span className="font-semibold text-ink">{same ? fmtDate(arrival.from) : `${fmtDate(arrival.from)} – ${fmtDate(arrival.to)}`}</span>
        </p>
      )}
    </div>
  );
}
