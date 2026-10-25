import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Ban, Check, X } from 'lucide-react';
import { STATUS_STEP, STEP_KEYS } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { stepLabel } from '../labels';

export const WorkflowStepper = ({ status }: { status: CaseStatus }) => {
  const { t } = useTranslation();
  const current = STATUS_STEP[status];
  const cancelled = status === 'CANCELLED';
  const finished = status === 'APPROVED' || status === 'REJECTED';

  return (
    <div>
      {cancelled && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-sunken px-2.5 py-1 text-xs font-semibold text-muted">
          <Ban className="size-3.5" aria-hidden /> {t('admin.case.stepper.cancelled')}
        </p>
      )}
      <ol className="flex items-start overflow-x-auto pb-1" aria-label={t('admin.case.stepper.aria')}>
        {STEP_KEYS.map((key, i) => {
          const done = !cancelled && (i < current || (finished && i === current));
          const active = !cancelled && !finished && i === current;
          const failed = status === 'REJECTED' && i === current;
          return (
            <li key={key} className="flex min-w-[76px] flex-1 flex-col items-center text-center" aria-current={active ? 'step' : undefined}>
              <div className="flex w-full items-center">
                <span className={clsx('h-0.5 flex-1', i === 0 ? 'bg-transparent' : i <= current && !cancelled ? 'bg-primary' : 'bg-line')} />
                <span
                  className={clsx(
                    'grid size-7 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold transition',
                    failed && 'border-danger bg-danger text-white',
                    !failed && done && 'border-primary bg-primary text-primary-contrast',
                    !failed && active && 'border-primary bg-card text-link ring-4 ring-focus/15',
                    !failed && !done && !active && 'border-line bg-card text-muted',
                  )}
                >
                  {failed ? <X className="size-3.5" /> : done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={clsx('h-0.5 flex-1', i === STEP_KEYS.length - 1 ? 'bg-transparent' : i < current && !cancelled ? 'bg-primary' : 'bg-line')}
                />
              </div>
              <span className={clsx('mt-1.5 px-1 text-[11px] leading-tight font-medium', active || done ? 'text-ink' : 'text-muted')}>
                {key === 'result' && status === 'REJECTED' ? t('admin.case.stepper.rejected') : key === 'result' && status === 'APPROVED' ? t('admin.case.stepper.approved') : stepLabel(key)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
