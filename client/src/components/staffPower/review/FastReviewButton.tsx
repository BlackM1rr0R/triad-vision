import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ScanEye } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';

registerCopy(pagesStaffPower);

/**
 * "Sürətli yoxlama" entry: opens the full-screen review queue (/admin/review), optionally for one case;
 * Esc / × brings the user back to where they came from.
 */
export const FastReviewButton = ({ caseId, pending, className }: { caseId?: string; pending?: number; className?: string }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const qs = new URLSearchParams();
  if (caseId) qs.set('caseId', caseId);
  qs.set('back', `${location.pathname}${location.search}`);
  return (
    <Link
      to={`/admin/review?${qs.toString()}`}
      title={t('sp.review.openHint')}
      className={clsx('inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-semibold whitespace-nowrap text-ink/85 transition hover:border-line-strong', className)}
    >
      <ScanEye className="size-4" aria-hidden /> {t('sp.review.open')}
      {pending ? <span className="rounded bg-warning-bg px-1.5 text-[11px] text-warning-fg tabular-nums">{pending}</span> : null}
    </Link>
  );
};
