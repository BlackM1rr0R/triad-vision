import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Coins } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { Documents } from '@/components/illustrations';
import { ErrorRetry, Loading, Pager, Section, type AgentCommissionRow } from '@/components/agents/portal';
import { COMMISSION_STATUSES, STATUS_TONE, type CommissionStatus } from '@/components/agents/types';
import { day, money } from '@/components/agents/format';

interface Resp {
  items: AgentCommissionRow[];
  total: number;
  pageSize: number;
}

export default function AgentEarningsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CommissionStatus | ''>('');
  const q = useQuery({
    queryKey: ['agent-commissions', page, status],
    queryFn: async () => (await api.get<Resp>('/agent/commissions', { params: { page, status: status || undefined } })).data,
    placeholderData: keepPreviousData,
  });

  const filters = (
    <div className="flex flex-wrap gap-1.5">
      {(['', ...COMMISSION_STATUSES] as const).map((s) => (
        <button
          key={s || 'all'}
          type="button"
          aria-pressed={status === s}
          onClick={() => {
            setStatus(s);
            setPage(1);
          }}
          className={clsx(
            'min-h-11 rounded-full border px-3.5 text-sm font-semibold transition-colors sm:min-h-10',
            status === s ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
          )}
        >
          {s ? t(`agents.status.${s}`) : t('agents.common.all')}
        </button>
      ))}
    </div>
  );

  return (
    <Section title={t('agents.earn.title')} icon={Coins} actions={filters}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <ErrorRetry onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState compact illustration={<Documents className="w-28" />} title={t('agents.earn.empty')} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="tv-table min-w-[640px]">
              <thead>
                <tr>
                  <th>{t('agents.earn.date')}</th>
                  <th>{t('agents.earn.event')}</th>
                  <th>{t('agents.earn.client')}</th>
                  <th className="text-right">{t('agents.earn.amount')}</th>
                  <th>{t('agents.earn.status')}</th>
                  <th>{t('agents.earn.payout')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap text-muted">{day(r.createdAt)}</td>
                    <td className="text-ink">
                      {t(`agents.events.${r.event}`, { defaultValue: r.event })}
                      {r.note && <p className="mt-0.5 text-xs text-muted">{r.note}</p>}
                    </td>
                    <td className="text-ink">{r.client ?? '—'}</td>
                    <td className={clsx('num font-semibold', r.amountCents < 0 ? 'text-danger' : 'text-ink')}>{money(r.amountCents, r.currency)}</td>
                    <td>
                      <span className={`badge ${STATUS_TONE[r.status]}`}>{t(`agents.status.${r.status}`)}</span>
                    </td>
                    <td className="text-xs text-muted">
                      {r.paidAt ? (
                        <>
                          {day(r.paidAt)}
                          {r.payoutRef && <span className="block font-mono">{r.payoutRef}</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />
        </>
      )}
    </Section>
  );
}
