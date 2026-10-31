import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarClock, CalendarX2, CircleCheck, CircleDashed } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPartnerHub } from '@/i18n/pagesPartnerHub';
import { fmtDate } from '@/components/admin/labels';
import type { ContractStatus, ContractSummary, Readiness } from './types';

registerCopy(pagesPartnerHub);

const TONE: Record<ContractStatus, string> = {
  active: 'bg-success-bg text-success-fg',
  expiring: 'bg-warning-bg text-warning-fg',
  expired: 'bg-danger-bg text-danger-fg',
  none: 'bg-sunken text-muted',
};
const ICON = { active: CircleCheck, expiring: CalendarClock, expired: CalendarX2, none: CircleDashed } as const;

/** Contract status badge with days left / since the end (list rows, profile header). */
export const ContractBadge = ({ contract, compact = false, className }: { contract: ContractSummary | undefined; compact?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const c = contract ?? { status: 'none' as const, endDate: null, daysLeft: null, count: 0, legacy: false };
  const Icon = ICON[c.status];
  const detail =
    c.status === 'none'
      ? null
      : c.daysLeft == null
        ? c.status === 'expired'
          ? null
          : t('partnerHub.contract.openEnded')
        : c.daysLeft >= 0
          ? t('partnerHub.contract.daysLeft', { count: c.daysLeft })
          : t('partnerHub.contract.endedAgo', { count: -c.daysLeft });
  return (
    <span className={clsx('inline-flex min-w-0 flex-col', className)} title={c.endDate ? t('partnerHub.contract.until', { date: fmtDate(c.endDate) }) : undefined}>
      <span className={clsx('badge inline-flex w-fit items-center gap-1 whitespace-nowrap', TONE[c.status])}>
        <Icon className="size-3" aria-hidden /> {t(`partnerHub.contract.${c.status}`)}
      </span>
      {!compact && (detail || c.legacy) && (
        <span className="mt-0.5 text-[11px] whitespace-nowrap text-muted">
          {detail}
          {c.legacy && ` · ${t('partnerHub.contract.legacy')}`}
        </span>
      )}
    </span>
  );
};

/** Data completeness for contract generation: a thin bar and the missing fields. */
export const ReadinessMeter = ({ readiness, className, onFill }: { readiness: Readiness | undefined; className?: string; onFill?: () => void }) => {
  const { t } = useTranslation();
  if (!readiness) return null;
  const { percent, missing } = readiness;
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted">{t('partnerForm.readiness.title')}</span>
        <span className={clsx('font-semibold tabular-nums', missing.length ? 'text-warning-fg' : 'text-success-fg')}>{percent}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t('partnerForm.readiness.title')}>
        <div className={clsx('h-full rounded-full', missing.length ? 'bg-warning' : 'bg-success')} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {missing.length ? t('partnerForm.readiness.missing', { fields: missing.map((k) => t(`partnerHub.fields.${k}`)).join(', ') }) : t('partnerForm.readiness.complete')}
        {missing.length > 0 && onFill && (
          <>
            {' · '}
            <button type="button" className="font-semibold text-link hover:underline" onClick={onFill}>
              {t('partnerHub.info.fillMissing')}
            </button>
          </>
        )}
      </p>
    </div>
  );
};
