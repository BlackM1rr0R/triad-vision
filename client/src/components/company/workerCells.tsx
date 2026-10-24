import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { fmtDate } from '@/components/admin/labels';
import { TONE_CLASS, type BadgeTone } from '@/components/ui/status';
import type { CheckInState, DateWarn, RiskLevel, WorkerRow } from './workerTypes';

/** Cells and tones shared by the employer worker table and the worker drawer. */

export const warnTone = (w: DateWarn | undefined): BadgeTone | null => (w === 'CRITICAL' || w === 'EXPIRED' ? 'danger' : w === 'WARN' ? 'warning' : null);
export const CHECKIN_TONE: Record<CheckInState, BadgeTone> = { OK: 'success', RESOLVED: 'info', ANSWERED: 'success', ISSUE: 'danger', OVERDUE: 'warning', PENDING: 'neutral' };
export const RISK_TONE: Record<RiskLevel, BadgeTone> = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' };

/** "Next: Visa decision · expected 01.11. – 20.11." */
export const useMilestoneText = () => {
  const { t } = useTranslation();
  return (w: WorkerRow) => {
    if (!w.next) return null;
    const label = t(`employerWorkers.milestone.${w.next.code}`);
    const when = w.next.at ? fmtDate(w.next.at) : w.next.from && w.next.to ? t('employerWorkers.window', { from: fmtDate(w.next.from), to: fmtDate(w.next.to) }) : t('employerWorkers.tbd');
    return `${label}: ${when}`;
  };
};

export const DateCell = ({ iso, warn, daysLeft }: { iso: string | null | undefined; warn?: DateWarn; daysLeft?: number }) => {
  const { t } = useTranslation();
  if (!iso) return <span className="text-muted">—</span>;
  const tone = warnTone(warn);
  return (
    <span className="inline-flex flex-col">
      <span className={clsx('tabular-nums', tone && 'font-semibold')}>{fmtDate(iso)}</span>
      {tone && daysLeft !== undefined && (
        <span className={clsx('badge mt-0.5 w-fit px-1.5 py-0 text-[10px]', TONE_CLASS[tone])}>{warn === 'EXPIRED' ? t('employerWorkers.expired') : t('employerWorkers.daysLeft', { count: daysLeft })}</span>
      )}
    </span>
  );
};

export const CheckInCell = ({ w }: { w: WorkerRow }) => {
  const { t } = useTranslation();
  if (!w.checkIn.employer && !w.checkIn.worker) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-col gap-0.5 text-[11px]">
      {(['employer', 'worker'] as const).map((k) =>
        w.checkIn[k] ? (
          <span key={k} className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="text-muted">{t(k === 'employer' ? 'employerWorkers.checkInYou' : 'employerWorkers.checkInWorker')}:</span>
            <span className={clsx('badge px-1.5 py-0 text-[10px]', TONE_CLASS[CHECKIN_TONE[w.checkIn[k]!]])}>{t(`employerWorkers.checkIn.${w.checkIn[k]}`)}</span>
          </span>
        ) : null,
      )}
    </span>
  );
};

