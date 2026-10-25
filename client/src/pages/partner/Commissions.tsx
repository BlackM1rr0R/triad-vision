import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, Clock3, Coins, Download, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { day, money } from '@/components/agents/format';
import { downloadFile, type PartnerCommissionRow, type Totals } from '@/components/partnerPortal/api';
import { CommissionPill, ErrorRetry, Kpi, Loading, Section } from '@/components/partnerPortal/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { Documents } from '@/components/illustrations';

/** Last 24 months as YYYY-MM, newest first. */
const recentMonths = () => {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

export default function PartnerCommissionsPage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState('');
  const months = useMemo(recentMonths, []);
  const q = useQuery({
    queryKey: ['partner-portal', 'commissions', month],
    queryFn: async () => (await api.get<{ currency: string; totals: Totals; items: PartnerCommissionRow[] }>('/partner/commissions', { params: { month: month || undefined } })).data,
    placeholderData: keepPreviousData,
  });
  const download = useMutation({
    mutationFn: () => downloadFile('/partner/commissions/export.xlsx', `Komissiyalar${month ? `-${month}` : ''}.xlsx`, { month: month || undefined }),
    onError: () => toast.error(t('partnerPortal.common.downloadFailed')),
  });

  return (
    <>
      <Section
        title={t('partnerPortal.commissions.title')}
        icon={Coins}
        actions={
          <>
            <label className="sr-only" htmlFor="pp-month">
              {t('partnerPortal.commissions.month')}
            </label>
            <select id="pp-month" className="input w-auto text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">{t('partnerPortal.commissions.allMonths')}</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary btn-sm" onClick={() => download.mutate()} disabled={download.isPending}>
              {download.isPending ? <Spinner className="size-3.5" /> : <Download className="size-3.5" aria-hidden />} {t('partnerPortal.common.download')}
            </button>
          </>
        }
      >
        {q.isLoading ? (
          <Loading />
        ) : q.isError || !q.data ? (
          <ErrorRetry onRetry={() => q.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3 sm:gap-4">
              <Kpi label={t('partnerPortal.dashboard.pending')} value={money(q.data.totals.pendingCents, q.data.currency)} icon={Clock3} tone="bg-warning-bg text-warning-fg" hint={q.data.totals.pendingCount || undefined} />
              <Kpi label={t('partnerPortal.dashboard.approved')} value={money(q.data.totals.approvedCents, q.data.currency)} icon={CheckCircle2} hint={q.data.totals.approvedCount || undefined} />
              <Kpi label={t('partnerPortal.dashboard.paid')} value={money(q.data.totals.paidCents, q.data.currency)} icon={Wallet} tone="bg-success-bg text-success-fg" hint={q.data.totals.paidCount || undefined} />
            </div>

            {q.data.items.length === 0 ? (
              <EmptyState illustration={<Documents className="w-28" />} title={t('partnerPortal.commissions.empty')} text={t('partnerPortal.commissions.emptyHint')} />
            ) : (
              <>
                {/* Cards on phones, a table from sm up. */}
                <ul className="mt-5 space-y-2 sm:hidden">
                  {q.data.items.map((r) => (
                    <li key={r.id} className="rounded-xl border border-line bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{r.clientName ?? t('partnerPortal.commissions.manual')}</p>
                          <p className="text-xs text-muted">{day(r.createdAt)}</p>
                        </div>
                        <p className="num font-semibold text-ink">{money(r.amountCents, r.currency)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <CommissionPill status={r.status} />
                        {r.paidAt && `${t('partnerPortal.commissions.paidAt')}: ${day(r.paidAt)}`}
                        {r.note && <span className="w-full">{r.note}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-line sm:block">
                  <table className="tv-table min-w-[640px]">
                    <thead>
                      <tr>
                        <th>{t('partnerPortal.commissions.date')}</th>
                        <th>{t('partnerPortal.commissions.client')}</th>
                        <th className="text-right">{t('partnerPortal.commissions.amount')}</th>
                        <th>{t('partnerPortal.commissions.status')}</th>
                        <th>{t('partnerPortal.commissions.paidAt')}</th>
                        <th>{t('partnerPortal.commissions.note')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.items.map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap text-muted">{day(r.createdAt)}</td>
                          <td>
                            {r.case ? (
                              <Link to={`/partner/clients/${r.case.id}`} className="font-medium text-ink hover:text-link">
                                {r.case.client} <span className="font-mono text-xs text-muted">{r.case.number}</span>
                              </Link>
                            ) : (
                              <span className={r.clientName ? 'font-medium text-ink' : 'text-muted'}>{r.clientName ?? t('partnerPortal.commissions.manual')}</span>
                            )}
                          </td>
                          <td className="num font-semibold whitespace-nowrap text-ink">{money(r.amountCents, r.currency)}</td>
                          <td>
                            <CommissionPill status={r.status} />
                          </td>
                          <td className="whitespace-nowrap text-muted">{r.paidAt ? day(r.paidAt) : r.dueAt ? `${t('partnerPortal.commissions.due')}: ${day(r.dueAt)}` : '—'}</td>
                          <td className="text-xs text-muted">{r.note ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Section>
    </>
  );
}
