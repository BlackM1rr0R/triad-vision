import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Coins } from 'lucide-react';
import { api } from '@/lib/api';
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
            'min-h-9 rounded-full border px-3 text-xs font-semibold',
            status === s ? 'border-navy-900 bg-navy-900 text-white' : 'border-line text-ink/75 hover:border-brand-400',
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
        <p className="py-8 text-center text-sm text-muted">{t('agents.earn.empty')}</p>
      ) : (
        <>
          <div className="-mx-5 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2 font-semibold sm:px-3">{t('agents.earn.date')}</th>
                  <th className="px-3 py-2 font-semibold">{t('agents.earn.event')}</th>
                  <th className="px-3 py-2 font-semibold">{t('agents.earn.client')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('agents.earn.amount')}</th>
                  <th className="px-3 py-2 font-semibold">{t('agents.earn.status')}</th>
                  <th className="px-5 py-2 font-semibold sm:px-3">{t('agents.earn.payout')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap text-muted sm:px-3">{day(r.createdAt)}</td>
                    <td className="px-3 py-3 text-ink">
                      {t(`agents.events.${r.event}`, { defaultValue: r.event })}
                      {r.note && <p className="mt-0.5 text-xs text-muted">{r.note}</p>}
                    </td>
                    <td className="px-3 py-3 text-ink">{r.client ?? '—'}</td>
                    <td className={clsx('px-3 py-3 text-right font-semibold tabular-nums', r.amountCents < 0 ? 'text-danger' : 'text-ink')}>{money(r.amountCents, r.currency)}</td>
                    <td className="px-3 py-3">
                      <span className={`badge ${STATUS_TONE[r.status]}`}>{t(`agents.status.${r.status}`)}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted sm:px-3">
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
