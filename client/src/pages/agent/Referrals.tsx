import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building2, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { Handshake } from '@/components/illustrations';
import { ErrorRetry, Loading, Pager, Section, type AgentReferralRow } from '@/components/agents/portal';
import { STAGE_TONE } from '@/components/agents/types';
import { day, money } from '@/components/agents/format';

/** Employer that signed up with the agent's code (business name only, no contacts). */
interface EmployerRow {
  key: string;
  name: string;
  city: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  registeredAt: string;
  earnedCents: number;
}

const EMPLOYER_TONE: Record<EmployerRow['status'], string> = {
  PENDING: 'bg-warning-bg text-warning-fg',
  ACTIVE: 'bg-success-bg text-success-fg',
  SUSPENDED: 'bg-sunken text-muted',
};

interface Resp {
  items: AgentReferralRow[];
  employers?: EmployerRow[];
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
  const employers = q.data.employers ?? [];

  return (
    <div className="space-y-6">
    <Section title={t('agents.ref.title')} icon={Users}>
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-sunken px-3 py-2.5 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t('agents.ref.privacy')}
      </p>
      {items.length === 0 ? (
        <EmptyState compact illustration={<Handshake className="w-28" />} title={t('agents.ref.empty')} />
      ) : (
        <>
        {/* Cards on phones, a table from sm up. */}
        <ul className="space-y-2 sm:hidden">
          {items.map((r) => (
            <li key={r.key} className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-muted">{day(r.registeredAt)}</p>
                </div>
                <p className="num shrink-0 font-semibold text-ink">{r.earnedCents ? money(r.earnedCents, currency) : '—'}</p>
              </div>
              <span className={`badge mt-2 ${STAGE_TONE[r.stage]}`}>{t(`agents.stages.${r.stage}`)}</span>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-line sm:block">
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
        </>
      )}
      <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
    </Section>
    {employers.length > 0 && (
      <Section title={t('agents.ref.employersTitle')} icon={Building2}>
        <ul className="space-y-2 sm:hidden">
          {employers.map((e) => (
            <li key={e.key} className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{e.name}</p>
                  <p className="text-xs text-muted">
                    {e.city ? `${e.city} · ` : ''}
                    {day(e.registeredAt)}
                  </p>
                </div>
                <p className="num shrink-0 font-semibold text-ink">{e.earnedCents ? money(e.earnedCents, currency) : '—'}</p>
              </div>
              <span className={`badge mt-2 ${EMPLOYER_TONE[e.status]}`}>{t(`agents.ref.employerStatus.${e.status}`)}</span>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-line sm:block">
          <table className="tv-table min-w-[520px]">
            <thead>
              <tr>
                <th>{t('agents.ref.employer')}</th>
                <th>{t('agents.ref.registered')}</th>
                <th>{t('agents.ref.employerState')}</th>
                <th className="text-right">{t('agents.ref.earned')}</th>
              </tr>
            </thead>
            <tbody>
              {employers.map((e) => (
                <tr key={e.key}>
                  <td>
                    <span className="font-semibold text-ink">{e.name}</span>
                    {e.city && <span className="block text-xs text-muted">{e.city}</span>}
                  </td>
                  <td className="text-muted">{day(e.registeredAt)}</td>
                  <td>
                    <span className={`badge ${EMPLOYER_TONE[e.status]}`}>{t(`agents.ref.employerStatus.${e.status}`)}</span>
                  </td>
                  <td className="num text-ink">{e.earnedCents ? money(e.earnedCents, currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    )}
    </div>
  );
}
