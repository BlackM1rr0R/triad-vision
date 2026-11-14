import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesStaffDesk } from '@/i18n/pagesStaffDesk';
import { useAssignSuggest } from './api';

registerCopy(pagesStaffDesk);

/**
 * Hint under the "responsible staff" select (case page, quick drawer): the least-loaded eligible colleague by the
 * auto-assignment rules (language, visa type, leave, max open cases), one click to assign. ADMIN+ also see the
 * load numbers and a link to the workload board.
 */
export const AssignHint = ({ caseId, currentId, onPick, disabled, className }: { caseId: string; currentId: string | null; onPick: (staffId: string) => void; disabled?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = hasMinRole(user?.role, 'ADMIN');
  const { data } = useAssignSuggest(caseId);
  const s = data?.suggested;
  if (!s) return null;
  const name = `${s.firstName} ${s.lastName}`.trim();
  if (s.id === currentId) {
    return <p className={clsx('mt-1.5 text-[11px] text-muted', className)}>{t('sd.assign.alreadyBest')}</p>;
  }
  return (
    <p className={clsx('mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted', className)}>
      <Sparkles className="size-3.5 shrink-0 text-link" aria-hidden />
      <span>
        {t('sd.assign.suggest')} <span className="font-semibold text-ink">{name}</span>
        {admin && s.open !== undefined && <span className="tabular-nums"> · {t('sd.assign.load', { count: s.open, pct: s.capacityPct })}</span>}
      </span>
      <button type="button" className="font-semibold text-link hover:underline disabled:opacity-50" disabled={disabled} onClick={() => onPick(s.id)}>
        {t('sd.assign.apply')}
      </button>
      {admin && (
        <Link to="/admin/team-load" className="hover:text-link hover:underline">
          {t('sd.assign.board')}
        </Link>
      )}
    </p>
  );
};
