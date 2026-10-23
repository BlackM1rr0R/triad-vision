import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Handshake, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import type { AdminAgent, AgentStatus } from '../types';
import { money, percent } from '../format';
import { CreateAgentDialog } from './CreateAgentDialog';

interface ListResp {
  items: AdminAgent[];
  counts: Partial<Record<AgentStatus, number>>;
}

export const termsSummary = (a: Pick<AdminAgent, 'commissionType' | 'commissionValue' | 'currency'>) =>
  a.commissionType === 'PERCENT' ? percent(a.commissionValue) : money(a.commissionValue, a.currency);

export const AgentsList = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AgentStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['admin-agents', 'list', search.trim(), status],
    queryFn: async () => (await api.get<ListResp>('/admin/agents', { params: { search: search.trim() || undefined, status: status || undefined } })).data,
    placeholderData: keepPreviousData,
  });
  const counts = q.data?.counts ?? {};
  const total = (counts.ACTIVE ?? 0) + (counts.PAUSED ?? 0);

  return (
    <>
      <Panel
        bodyClassName="p-0"
        title={
          <span className="flex items-center gap-2">
            <Handshake className="size-4 text-brand-600" aria-hidden /> {t('agents.admin.tabs.agents')}
          </span>
        }
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> {t('agents.admin.newAgent')}
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 sm:px-6">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-9" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('agents.admin.search')} aria-label={t('agents.admin.search')} />
          </div>
          <Chip active={status === ''} onClick={() => setStatus('')} count={total}>
            {t('agents.common.all')}
          </Chip>
          {(['ACTIVE', 'PAUSED'] as const).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)} count={counts[s] ?? 0}>
              {t(`agents.agentStatus.${s}`)}
            </Chip>
          ))}
        </div>
        {q.isLoading ? (
          <LoadingBlock />
        ) : q.isError || !q.data ? (
          <div className="p-5">
            <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={Handshake} title={t('agents.admin.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2.5 font-semibold sm:px-6">{t('agents.admin.col.agent')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('agents.admin.col.code')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('agents.admin.col.region')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('agents.admin.terms.title')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('agents.admin.col.referrals')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('agents.admin.col.activeCases')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('agents.admin.col.approved')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('agents.admin.col.pending')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('agents.admin.col.approvedSum')}</th>
                  <th className="px-5 py-2.5 text-right font-semibold sm:px-6">{t('agents.admin.col.paid')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface/60">
                    <td className="px-5 py-3 sm:px-6">
                      <Link to={`/admin/agents/${a.id}`} className="font-semibold text-brand-700 hover:underline">
                        {a.user.firstName} {a.user.lastName}
                      </Link>
                      <span className="block truncate text-xs text-muted">{a.user.email}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs font-semibold text-ink">{a.code}</span>
                      {a.status === 'PAUSED' && <span className="badge ml-1.5 bg-warning-bg text-warning-fg">{t('agents.agentStatus.PAUSED')}</span>}
                    </td>
                    <td className="px-3 py-3 text-muted">{a.region ?? '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink">{a.commissionValue > 0 ? termsSummary(a) : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{a.stats?.referrals ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{a.stats?.activeCases ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{a.stats?.approvedVisas ?? 0}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{money(a.stats?.pendingCents ?? 0, a.currency)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{money(a.stats?.approvedCents ?? 0, a.currency)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap tabular-nums sm:px-6">{money(a.stats?.paidCents ?? 0, a.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <CreateAgentDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
};
