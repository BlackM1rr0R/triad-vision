import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Coins, Download, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { COMMISSION_STATUSES, STATUS_TONE, type AdminCommission, type CommissionStatus } from '../types';
import { money } from '../format';
import { CommissionsTable } from './CommissionsTable';
import { ManualCommissionDialog } from './ManualCommissionDialog';

interface Resp {
  items: AdminCommission[];
  total: number;
  pageSize: number;
  sums: { status: CommissionStatus; currency: string; amountCents: number; count: number }[];
}

interface AgentOption {
  id: string;
  code: string;
  user: { firstName: string; lastName: string };
}

/** All commissions across agents, with filters, bulk actions and CSV export. */
export const CommissionsPage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [manual, setManual] = useState(false);
  const filter = {
    agentId: params.get('agentId') ?? '',
    status: (params.get('status') ?? '') as CommissionStatus | '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
  const setFilter = (k: keyof typeof filter, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(1);
  };
  const query = Object.fromEntries(Object.entries(filter).filter(([, v]) => v));

  const agents = useQuery({ queryKey: ['admin-agents', 'options'], queryFn: async () => (await api.get<{ items: AgentOption[] }>('/admin/agents/options')).data.items });
  const q = useQuery({
    queryKey: ['admin-agents', 'commissions', query, page],
    queryFn: async () => (await api.get<Resp>('/admin/agents/commissions', { params: { ...query, page } })).data,
    placeholderData: keepPreviousData,
  });
  const exportUrl = `/api/admin/agents/commissions/export.csv${Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : ''}`;
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <>
      <Panel
        bodyClassName="p-0"
        title={
          <span className="flex items-center gap-2">
            <Coins className="size-4 text-brand-600" aria-hidden /> {t('agents.admin.com.title')}
          </span>
        }
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setManual(true)}>
              <Plus className="size-3.5" aria-hidden /> {t('agents.admin.com.manual')}
            </button>
            <a href={exportUrl} className="btn-secondary btn-sm" download>
              <Download className="size-3.5" aria-hidden /> {t('agents.admin.com.exportCsv')}
            </a>
          </>
        }
      >
        <div className="grid gap-3 border-b border-line px-5 py-3 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="com-agent">
              {t('agents.admin.com.agent')}
            </label>
            <select id="com-agent" className="input" value={filter.agentId} onChange={(e) => setFilter('agentId', e.target.value)}>
              <option value="">{t('agents.common.all')}</option>
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.user.firstName} {a.user.lastName} · {a.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="com-status">
              {t('agents.admin.com.status')}
            </label>
            <select id="com-status" className="input" value={filter.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">{t('agents.common.all')}</option>
              {COMMISSION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`agents.status.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="com-from">
              {t('agents.admin.com.from')}
            </label>
            <input id="com-from" type="date" className="input" value={filter.from} onChange={(e) => setFilter('from', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="com-to">
              {t('agents.admin.com.to')}
            </label>
            <input id="com-to" type="date" className="input" value={filter.to} onChange={(e) => setFilter('to', e.target.value)} />
          </div>
        </div>
        {q.data && q.data.sums.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-xs sm:px-6">
            <span className="font-semibold text-muted">{t('agents.admin.com.sums')}:</span>
            {q.data.sums.map((s) => (
              <span key={`${s.status}-${s.currency}`} className={`badge ${STATUS_TONE[s.status]}`}>
                {t(`agents.status.${s.status}`)} · {s.count} · {money(s.amountCents, s.currency)}
              </span>
            ))}
          </div>
        )}
        <div className="px-5 py-4 sm:px-6">
          {q.isLoading ? (
            <LoadingBlock />
          ) : q.isError || !q.data ? (
            <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <>
              <CommissionsTable items={q.data.items} />
              {pages > 1 && (
                <div className="mt-4 flex items-center justify-end gap-2 text-sm">
                  <button type="button" className="grid size-10 place-items-center rounded-lg border border-line disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t('agents.common.prev')}>
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-muted tabular-nums">{t('agents.common.page', { page, pages })}</span>
                  <button type="button" className="grid size-10 place-items-center rounded-lg border border-line disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label={t('agents.common.next')}>
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Panel>
      <ManualCommissionDialog open={manual} onClose={() => setManual(false)} />
    </>
  );
};
