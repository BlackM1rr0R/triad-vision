import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BriefcaseBusiness, ExternalLink, IdCard } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesPostArrival } from '@/i18n/pagesPostArrival';
import { useL10n } from '@/lib/l10n';
import { Panel } from '@/components/admin/ui';
import { StatusBadge } from '@/components/portal/StatusBadge';
import { TONE_CLASS, type ExpiryTone } from '@/components/expiry/Expiry';

registerCopy(pagesPostArrival);

// GET /api/admin/renewals/upcoming (server lib/renewals/service.ts upcomingCare)
interface CaseRef {
  id: string;
  number: string;
  status: CaseStatus;
  visaType: string;
}
interface Upcoming {
  residence: { case: CaseRef; client: { id: string; name: string }; staff: { id: string; name: string } | null; expiresAt: string; daysLeft: number; renewal: { id: string; number: string; status: CaseStatus } | null }[];
  probation: { case: CaseRef; client: { id: string; name: string }; staff: { id: string; name: string } | null; employer: string | null; endsAt: string; daysLeft: number; remindedAt: string | null }[];
}

const toneOf = (days: number): ExpiryTone => (days <= 0 ? 'expired' : days <= 14 ? 'urgent' : days <= 45 ? 'soon' : 'ok');

const DaysChip = ({ days }: { days: number }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge whitespace-nowrap tabular-nums', TONE_CLASS[toneOf(days)])}>{days <= 0 ? t('expiry.chip.expired') : t('expiry.page.daysShort', { count: days })}</span>;
};

const OpenLink = ({ id, number }: { id: string; number: string }) => {
  const { t } = useTranslation();
  return (
    <Link to={`/admin/cases/${id}`} className="grid size-9 place-items-center rounded-lg text-link transition hover:bg-primary/[0.06]" title={t('expiry.page.openCase')} aria-label={`${t('expiry.page.openCase')}: ${number}`}>
      <ExternalLink className="size-4" aria-hidden />
    </Link>
  );
};

/** Extra sections of /admin/expiring: residence titles (→ renewal case) and probation periods ending in the period. */
export const RenewalSections = ({ days, staffId }: { days: number; staffId: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const q = useQuery({
    queryKey: ['admin-renewals-upcoming', days, staffId],
    queryFn: async () => (await api.get<Upcoming>('/admin/renewals/upcoming', { params: { days, staffId: staffId || undefined } })).data,
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  if (!d) return null;
  return (
    <div className={clsx('mt-6 grid gap-6 xl:grid-cols-2', q.isFetching && 'opacity-70')}>
      <Panel title={t('postArrival.expiring.residenceTitle')} icon={IdCard} bodyClassName="p-0 sm:p-0">
        {d.residence.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">{t('postArrival.expiring.emptyResidence')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.residence.map((r) => (
              <li key={r.case.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.client.name}</p>
                  <p className="truncate text-xs text-muted">
                    <span className="font-mono">{r.case.number}</span> · {date(r.expiresAt)} · {r.staff?.name ?? t('expiry.page.unassigned')}
                  </p>
                  <p className="mt-0.5 text-xs">
                    {t('postArrival.expiring.renewal')}:{' '}
                    {r.renewal ? (
                      <Link to={`/admin/cases/${r.renewal.id}`} className="font-mono font-semibold text-link hover:underline">
                        {r.renewal.number}
                      </Link>
                    ) : (
                      <span className="text-muted">{t('postArrival.expiring.noRenewal')}</span>
                    )}
                    {r.renewal && <StatusBadge status={r.renewal.status} />}
                  </p>
                </div>
                <DaysChip days={r.daysLeft} />
                <OpenLink id={r.case.id} number={r.case.number} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t('postArrival.expiring.probationTitle')} icon={BriefcaseBusiness} bodyClassName="p-0 sm:p-0">
        {d.probation.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">{t('postArrival.expiring.emptyProbation')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.probation.map((p) => (
              <li key={p.case.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{p.client.name}</p>
                  <p className="truncate text-xs text-muted">
                    <span className="font-mono">{p.case.number}</span>
                    {p.employer && ` · ${t('postArrival.expiring.employer')}: ${p.employer}`} · {t('postArrival.expiring.ends')}: {date(p.endsAt)}
                    {p.remindedAt && ` · ${t('postArrival.expiring.reminded')}`}
                  </p>
                </div>
                <DaysChip days={p.daysLeft} />
                <OpenLink id={p.case.id} number={p.case.number} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};

export default RenewalSections;
