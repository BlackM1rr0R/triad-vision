import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
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
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {t('agents.ref.privacy')}
      </p>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('agents.ref.empty')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-2 font-semibold sm:px-3">{t('agents.ref.name')}</th>
                <th className="px-3 py-2 font-semibold">{t('agents.ref.registered')}</th>
                <th className="px-3 py-2 font-semibold">{t('agents.ref.stage')}</th>
                <th className="px-5 py-2 text-right font-semibold sm:px-3">{t('agents.ref.earned')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-semibold text-ink sm:px-3">{r.name}</td>
                  <td className="px-3 py-3 text-muted">{day(r.registeredAt)}</td>
                  <td className="px-3 py-3">
                    <span className={`badge ${STAGE_TONE[r.stage]}`}>{t(`agents.stages.${r.stage}`)}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-ink tabular-nums sm:px-3">{r.earnedCents ? money(r.earnedCents, currency) : '—'}</td>
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
