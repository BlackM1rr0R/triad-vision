import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { Handshake } from '@/components/illustrations';
import { ErrorRetry, Loading, Pager, Section, type AgentReferralRow } from '@/components/agents/portal';
import { STAGE_TONE } from '@/components/agents/types';
import { day, money } from '@/components/agents/format';

interface Resp {
  items: AgentReferralRow[];
  total: number;
  pageSize: number;
  currency: string;
}

export default function AgentReferralsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['agent-referrals', page],
    queryFn: async () => (await api.get<Resp>('/agent/referrals', { params: { page } })).data,
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorRetry onRetry={() => q.refetch()} />;
  const { items, total, pageSize, currency } = q.data;

  return (
    <Section title={t('agents.ref.title')} icon={Users}>
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-sunken px-3 py-2.5 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t('agents.ref.privacy')}
      </p>
      {items.length === 0 ? (
        <EmptyState compact illustration={<Handshake className="w-28" />} title={t('agents.ref.empty')} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="tv-table min-w-[520px]">
            <thead>
              <tr>
                <th>{t('agents.ref.name')}</th>
                <th>{t('agents.ref.registered')}</th>
                <th>{t('agents.ref.stage')}</th>
                <th className="text-right">{t('agents.ref.earned')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.key}>
                  <td className="font-semibold text-ink">{r.name}</td>
                  <td className="text-muted">{day(r.registeredAt)}</td>
                  <td>
                    <span className={`badge ${STAGE_TONE[r.stage]}`}>{t(`agents.stages.${r.stage}`)}</span>
                  </td>
                  <td className="num text-ink">{r.earnedCents ? money(r.earnedCents, currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
    </Section>
  );
}
