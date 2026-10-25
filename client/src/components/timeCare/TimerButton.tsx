import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Square } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/types';
import { useCurrentTimer, useStartTimer, useStopTimer, type Activity } from './api';

/**
 * "⏱ Başlat" for a case / task (case page, my-work rows, task detail). When the running timer belongs to
 * the same case / task it turns into a stop button; otherwise starting switches the timer over.
 */
export function TimerButton({ caseId, taskId, activity, className, compact }: { caseId?: string | null; taskId?: string | null; activity?: Activity; className?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const q = useCurrentTimer(isStaffRole(user?.role));
  const start = useStartTimer();
  const stop = useStopTimer();
  if (!isStaffRole(user?.role)) return null;
  const run = q.data?.running;
  const mine = !!run && (taskId ? run.taskId === taskId : !!caseId && run.caseId === caseId && !run.taskId);
  const base = clsx('inline-flex items-center gap-1 rounded-lg font-semibold whitespace-nowrap transition disabled:opacity-60', compact ? 'min-h-8 px-2.5 text-xs' : 'min-h-9 px-3 text-sm', className);

  if (mine)
    return (
      <button type="button" className={clsx(base, 'bg-success text-white hover:bg-success/90')} disabled={stop.isPending} onClick={(e) => (e.stopPropagation(), stop.mutate({}))}>
        <Square className="size-3 fill-current" aria-hidden /> {t('time.stop')}
      </button>
    );
  return (
    <button
      type="button"
      className={clsx(base, 'border border-line bg-card text-ink hover:border-success hover:text-success-fg')}
      disabled={start.isPending}
      title={run ? t('time.switchTo') : undefined}
      onClick={(e) => {
        e.stopPropagation();
        start.mutate({ caseId: caseId ?? null, taskId: taskId ?? null, activity });
      }}
    >
      {t('time.start')}
    </button>
  );
}

export default TimerButton;
