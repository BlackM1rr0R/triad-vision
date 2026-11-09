import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Target } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPartnerQuota } from '@/i18n/pagesPartnerQuota';
import type { PartnerQuota } from './api';

registerCopy(pagesPartnerQuota);

/** Allowed quota input: empty (no target) or a whole number 1–100000. */
export const parseQuota = (raw: string): number | null | undefined => {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= 1 && n <= 100_000 ? n : undefined;
};

/**
 * Client quota progress ("assigned X / needed Y"): a bar with the numbers. `compact` = the list cell
 * (numbers + thin bar), otherwise a card block with the missing count.
 */
export const QuotaMeter = ({ quota, compact = false, className }: { quota: PartnerQuota | undefined; compact?: boolean; className?: string }) => {
  const { t } = useTranslation();
  if (!quota) return null;
  if (quota.needed == null) return compact ? <span className={clsx('text-xs text-muted', className)}>—</span> : null;
  const percent = quota.percent ?? 0;
  const label = t('partnerQuota.progressLong', { assigned: quota.assigned, needed: quota.needed });
  const bar = (
    <div
      className={clsx('overflow-hidden rounded-full bg-sunken', compact ? 'mt-1 h-1' : 'mt-1.5 h-1.5')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={quota.needed}
      aria-valuenow={Math.min(quota.assigned, quota.needed)}
      aria-valuetext={label}
      aria-label={t('partnerQuota.title')}
    >
      <div className={clsx('h-full rounded-full transition-all', quota.filled ? 'bg-success' : 'bg-link')} style={{ width: `${percent}%` }} />
    </div>
  );
  if (compact)
    return (
      <div className={clsx('min-w-[6.5rem]', className)} title={label}>
        <span className={clsx('text-xs font-semibold tabular-nums', quota.filled ? 'text-success-fg' : 'text-ink')}>{t('partnerQuota.progress', { assigned: quota.assigned, needed: quota.needed })}</span>
        {bar}
      </div>
    );
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-muted">
          <Target className="size-3.5 text-link" aria-hidden /> {t('partnerQuota.title')}
        </span>
        <span className={clsx('font-semibold tabular-nums', quota.filled ? 'text-success-fg' : 'text-ink')}>{t('partnerQuota.progress', { assigned: quota.assigned, needed: quota.needed })}</span>
      </div>
      {bar}
      <p className={clsx('mt-1 text-[11px]', quota.filled ? 'text-success-fg' : 'text-muted')}>{quota.filled ? t('partnerQuota.filled') : t('partnerQuota.remaining', { count: quota.remaining })}</p>
    </div>
  );
};
