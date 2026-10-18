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
            <select id="pp-month" className="input min-h-10 w-auto py-1.5 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">{t('partnerPortal.commissions.allMonths')}</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => download.mutate()} disabled={download.isPending}>
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
              <Kpi label={t('partnerPortal.dashboard.pending')} value={money(q.data.totals.pendingCents, q.data.currency)} icon={Clock3} tone="bg-amber-100 text-amber-700" hint={q.data.totals.pendingCount || undefined} />
              <Kpi label={t('partnerPortal.dashboard.approved')} value={money(q.data.totals.approvedCents, q.data.currency)} icon={CheckCircle2} hint={q.data.totals.approvedCount || undefined} />
              <Kpi label={t('partnerPortal.dashboard.paid')} value={money(q.data.totals.paidCents, q.data.currency)} icon={Wallet} tone="bg-emerald-100 text-emerald-700" hint={q.data.totals.paidCount || undefined} />
            </div>

            {q.data.items.length === 0 ? (
              <div className="py-10 text-center">
                <p className="font-semibold text-ink">{t('partnerPortal.commissions.empty')}</p>
                <p className="mt-1 text-sm text-muted">{t('partnerPortal.commissions.emptyHint')}</p>
              </div>
            ) : (
              <>
                {/* Cards on phones, a table from sm up. */}
                <ul className="mt-5 space-y-2 sm:hidden">
                  {q.data.items.map((r) => (
                    <li key={r.id} className="rounded-xl border border-line p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{r.clientName ?? t('partnerPortal.commissions.manual')}</p>
                          <p className="text-xs text-muted">{day(r.createdAt)}</p>
                        </div>
                        <p className="font-bold text-ink tabular-nums">{money(r.amountCents, r.currency)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <CommissionPill status={r.status} />
                        {r.paidAt && `${t('partnerPortal.commissions.paidAt')}: ${day(r.paidAt)}`}
                        {r.note && <span className="w-full">{r.note}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-line text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                      <tr>
                        <th className="py-2 pr-3">{t('partnerPortal.commissions.date')}</th>
                        <th className="px-3 py-2">{t('partnerPortal.commissions.client')}</th>
                        <th className="px-3 py-2 text-right">{t('partnerPortal.commissions.amount')}</th>
                        <th className="px-3 py-2">{t('partnerPortal.commissions.status')}</th>
                        <th className="px-3 py-2">{t('partnerPortal.commissions.paidAt')}</th>
                        <th className="py-2 pl-3">{t('partnerPortal.commissions.note')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {q.data.items.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{day(r.createdAt)}</td>
                          <td className="px-3 py-2.5">
                            {r.case ? (
                              <Link to={`/partner/clients/${r.case.id}`} className="font-medium text-ink hover:text-brand-700">
                                {r.case.client} <span className="font-mono text-xs text-muted">{r.case.number}</span>
                              </Link>
                            ) : (
                              <span className={r.clientName ? 'font-medium text-ink' : 'text-muted'}>{r.clientName ?? t('partnerPortal.commissions.manual')}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap text-ink tabular-nums">{money(r.amountCents, r.currency)}</td>
                          <td className="px-3 py-2.5">
                            <CommissionPill status={r.status} />
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">{r.paidAt ? day(r.paidAt) : r.dueAt ? `${t('partnerPortal.commissions.due')}: ${day(r.dueAt)}` : '—'}</td>
                          <td className="py-2.5 pl-3 text-xs text-muted">{r.note ?? ''}</td>
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
