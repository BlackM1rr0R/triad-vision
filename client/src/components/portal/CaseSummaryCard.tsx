import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Briefcase, CalendarClock } from 'lucide-react';
import { CLIENT_ACTION } from '@/lib/caseStatus';
import { useL10n } from '@/lib/l10n';
import type { CaseSummary } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { CaseStepper } from './CaseStepper';
import { useRelationLabel } from '@/components/journey/Family';

/** Compact card for a case in a list (dashboard "previous applications"). */
export const CaseSummaryCard = ({ c }: { c: CaseSummary & { relation?: string | null } }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const relationLabel = useRelationLabel()(c.relation);
  const clientTurn = CLIENT_ACTION.includes(c.status);
  return (
    <Link
      to={`/account/cases/${c.id}`}
      className="card card-interactive group flex h-full flex-col p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">{t('portal.caseNo')}</p>
          <p className="code-id truncate text-lg font-semibold text-ink">{c.number}</p>
          {relationLabel && <span className="badge mt-1 bg-danger-bg text-danger-fg">{relationLabel}</span>}
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="mt-4 space-y-1.5 text-sm">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <Briefcase className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="truncate">{c.profession}</span>
        </p>
        {c.visaCategory && (
          <p className="flex min-w-0 items-center gap-2 text-muted">
            <span className="badge shrink-0 whitespace-nowrap border border-line bg-sunken text-ink">{c.visaCategory.visaLabel}</span>
            <span className="truncate">{tr(c.visaCategory.title)}</span>
          </p>
        )}
      </div>

      <CaseStepper status={c.status} variant="mini" className="mt-5 mb-5" />

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-4 text-xs text-muted">
        <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <CalendarClock className="size-3.5 shrink-0" aria-hidden />
          {t('portal.updated')}: {date(c.updatedAt)}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-link">
          {clientTurn ? t('portal.actionRequired') : t('portal.openCase')}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
        </span>
      </div>
    </Link>
  );
};

export default CaseSummaryCard;
