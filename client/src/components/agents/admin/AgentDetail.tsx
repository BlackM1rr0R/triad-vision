import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Coins, HandCoins, Link2, Mail, Pause, Play, Plus, Search, Unlink, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState, ErrorBlock, LoadingBlock, Panel, StatTile } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import type { CaseStatus } from '@/lib/types';
import type { AdminAgent, AdminCommission, AdminReferral } from '../types';
import { money } from '../format';
import { ShareBox } from '../ShareBox';
import { CommissionsTable } from './CommissionsTable';
import { ManualCommissionDialog } from './ManualCommissionDialog';
import { TermsFields, type TermsValue } from './TermsFields';
import { fromUnits, toUnits, useAgentToastError } from './shared';

interface DetailResp {
  agent: AdminAgent;
  referrals: AdminReferral[];
  commissions: AdminCommission[];
}

interface ClientHit {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  referredByAgentId: string | null;
}

const ProfileForm = ({ agent }: { agent: AdminAgent }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toastError = useAgentToastError();
  const initial = () => ({
    firstName: agent.user.firstName,
    lastName: agent.user.lastName,
    phone: agent.user.phone ?? '',
    code: agent.code,
    region: agent.region ?? '',
    company: agent.company ?? '',
    iban: agent.iban ?? '',
    notes: agent.notes ?? '',
  });
  const [f, setF] = useState(initial);
  const [terms, setTerms] = useState<TermsValue>({
    commissionType: agent.commissionType,
    value: agent.commissionValue ? toUnits(agent.commissionValue) : '',
    currency: agent.currency,
    payoutEvents: agent.payoutEvents,
  });

  const save = useMutation({
    mutationFn: () => {
      const value = terms.value.trim() ? fromUnits(terms.value) : 0;
      return api.patch(`/admin/agents/${agent.id}`, {
        firstName: f.firstName,
        lastName: f.lastName,
        phone: f.phone || null,
        code: f.code,
        region: f.region || null,
        company: f.company || null,
        iban: f.iban || null,
        notes: f.notes || null,
        commissionType: terms.commissionType,
        commissionValue: Number.isNaN(value) ? -1 : value,
        currency: terms.currency,
        payoutEvents: terms.payoutEvents,
      });
    },
    onSuccess: () => {
      toast.success(t('agents.admin.terms.saved'));
      void qc.invalidateQueries({ queryKey: ['admin-agents'] });
    },
    onError: toastError,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const input = (k: keyof ReturnType<typeof initial>, label: string, props: Record<string, unknown> = {}) => (
    <div>
      <label className="label" htmlFor={`agent-${k}`}>
        {label}
      </label>
      <input id={`agent-${k}`} className="input" value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink">{t('agents.admin.detail.profile')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {input('firstName', t('agents.admin.create.firstName'), { required: true, maxLength: 80 })}
          {input('lastName', t('agents.admin.create.lastName'), { required: true, maxLength: 80 })}
          {input('phone', t('agents.admin.create.phone'), { type: 'tel', maxLength: 40 })}
          {input('code', t('agents.admin.create.code'), { required: true, maxLength: 32, className: 'input font-mono uppercase' })}
          {input('region', t('agents.admin.create.region'), { maxLength: 120 })}
          {input('company', t('agents.admin.create.company'), { maxLength: 160 })}
        </div>
        {input('iban', t('agents.admin.terms.iban'), { maxLength: 64, className: 'input font-mono uppercase' })}
        <div>
          <label className="label" htmlFor="agent-notes">
            {t('agents.admin.terms.notes')}
          </label>
          <textarea id="agent-notes" className="input min-h-24" value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} maxLength={5000} />
        </div>
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-ink">{t('agents.admin.terms.title')}</p>
        <TermsFields value={terms} onChange={setTerms} />
      </div>
      <div className="lg:col-span-2">
        <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
          {save.isPending && <Spinner className="size-4" />} {t('agents.common.save')}
        </button>
      </div>
    </form>
  );
};

const AttachClient = ({ agentId }: { agentId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toastError = useAgentToastError();
  const [term, setTerm] = useState('');
  const hits = useQuery({
    queryKey: ['admin-agents', 'clients', term.trim()],
    queryFn: async () => (await api.get<{ items: ClientHit[] }>('/admin/agents/clients', { params: { search: term.trim() } })).data.items,
    enabled: term.trim().length >= 2,
  });
  const attach = useMutation({
    mutationFn: (userId: string) => api.patch(`/admin/agents/referrals/${userId}`, { agentId }),
    onSuccess: () => {
      toast.success(t('agents.admin.detail.attached'));
      setTerm('');
      void qc.invalidateQueries({ queryKey: ['admin-agents'] });
    },
    onError: toastError,
  });
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <UserPlus className="size-4 text-brand-600" aria-hidden /> {t('agents.admin.detail.attach')}
      </p>
      <p className="mt-0.5 text-xs text-muted">{t('agents.admin.detail.attachHint')}</p>
      <div className="relative mt-2 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input pl-9" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('agents.admin.detail.searchClient')} aria-label={t('agents.admin.detail.searchClient')} />
      </div>
      {hits.data && term.trim().length >= 2 && (
        <ul className="mt-2 max-w-md divide-y divide-line rounded-lg border border-line">
          {hits.data
            .filter((h) => h.referredByAgentId !== agentId)
            .map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {h.firstName} {h.lastName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {h.email}
                    {h.referredByAgentId ? ` · ${t('agents.admin.detail.alreadyOther')}` : ''}
                  </span>
                </span>
                <button type="button" className="btn-white btn-sm shrink-0 border border-line" onClick={() => attach.mutate(h.id)} disabled={attach.isPending}>
                  <Plus className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

export const AgentDetail = () => {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toastError = useAgentToastError();
  const [manual, setManual] = useState(false);
  const q = useQuery({ queryKey: ['admin-agents', 'detail', id], queryFn: async () => (await api.get<DetailResp>(`/admin/agents/${id}`)).data });

  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'PAUSED') => api.patch(`/admin/agents/${id}`, { status }),
    onSuccess: (_r, status) => {
      toast.success(t(status === 'PAUSED' ? 'agents.admin.detail.paused' : 'agents.admin.detail.activated'));
      void qc.invalidateQueries({ queryKey: ['admin-agents'] });
    },
    onError: toastError,
  });
  const invite = useMutation({
    mutationFn: () => api.post(`/admin/agents/${id}/invite`),
    onSuccess: () => toast.success(t('agents.admin.detail.inviteSent')),
    onError: toastError,
  });
  const detach = useMutation({
    mutationFn: (userId: string) => api.patch(`/admin/agents/referrals/${userId}`, { agentId: null }),
    onSuccess: () => {
      toast.success(t('agents.admin.detail.detached'));
      void qc.invalidateQueries({ queryKey: ['admin-agents'] });
    },
    onError: toastError,
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const { agent, referrals, commissions } = q.data;
  const s = agent.stats;
  const cur = agent.currency;
  // Re-seed the profile form whenever the server copy changes.
  const formKey = `${agent.code}|${agent.status}|${agent.commissionType}|${agent.commissionValue}|${agent.payoutEvents.join(',')}|${agent.iban}|${agent.notes}|${agent.region}|${agent.user.firstName}|${agent.user.lastName}|${agent.user.phone}`;

  return (
    <div className="space-y-5">
      <Link to="/admin/agents" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('agents.admin.back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink">
            {agent.user.firstName} {agent.user.lastName}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono font-semibold text-ink">{agent.code}</span>
            <span className={`badge ${agent.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{t(`agents.agentStatus.${agent.status}`)}</span>
            <a href={`mailto:${agent.user.email}`} className="hover:underline">
              {agent.user.email}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => invite.mutate()} disabled={invite.isPending}>
            <Mail className="size-3.5" aria-hidden /> {t('agents.admin.detail.resendInvite')}
          </button>
          {agent.status === 'ACTIVE' ? (
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => setStatus.mutate('PAUSED')} disabled={setStatus.isPending}>
              <Pause className="size-3.5" aria-hidden /> {t('agents.admin.detail.pause')}
            </button>
          ) : (
            <button type="button" className="btn-primary btn-sm" onClick={() => setStatus.mutate('ACTIVE')} disabled={setStatus.isPending}>
              <Play className="size-3.5" aria-hidden /> {t('agents.admin.detail.activate')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label={t('agents.admin.col.referrals')} value={s?.referrals ?? 0} />
        <StatTile label={t('agents.admin.col.activeCases')} value={s?.activeCases ?? 0} />
        <StatTile label={t('agents.admin.col.approved')} value={s?.approvedVisas ?? 0} tone="good" />
        <StatTile label={t('agents.admin.col.pending')} value={money(s?.pendingCents ?? 0, cur)} tone="warn" />
        <StatTile label={t('agents.admin.col.approvedSum')} value={money(s?.approvedCents ?? 0, cur)} />
        <StatTile label={t('agents.admin.col.paid')} value={money(s?.paidCents ?? 0, cur)} tone="good" />
      </div>

      <Panel title={t('agents.admin.detail.share')} icon={Link2}>
        <ShareBox link={agent.shareLink} code={agent.code} compact />
      </Panel>

      <Panel title={t('agents.admin.terms.title')} icon={HandCoins}>
        <ProfileForm key={formKey} agent={agent} />
      </Panel>

      <Panel title={`${t('agents.admin.detail.referrals')} (${referrals.length})`} icon={Users}>
        {referrals.length === 0 ? (
          <EmptyState icon={Users} title={t('agents.admin.detail.noReferrals')} />
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2 font-semibold sm:px-6">{t('agents.admin.detail.client')}</th>
                  <th className="px-3 py-2 font-semibold">{t('agents.admin.detail.registered')}</th>
                  <th className="px-3 py-2 font-semibold">{t('agents.admin.detail.case')}</th>
                  <th className="px-5 py-2 sm:px-6" />
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 sm:px-6">
                      <span className="font-semibold text-ink">
                        {r.firstName} {r.lastName}
                      </span>
                      <span className="block text-xs text-muted">{r.email}</span>
                    </td>
                    <td className="px-3 py-3 text-muted">{fmtDate(r.referredAt ?? r.createdAt)}</td>
                    <td className="px-3 py-3">
                      {r.case ? (
                        <Link to={`/admin/cases/${r.case.id}`} className="inline-flex flex-wrap items-center gap-2 hover:underline">
                          <span className="font-mono text-xs font-semibold text-brand-700">{r.case.number}</span>
                          <StatusBadge status={r.case.status as CaseStatus} />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">{t('agents.admin.detail.noCase')}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-surface hover:text-danger"
                        onClick={() => detach.mutate(r.id)}
                        disabled={detach.isPending}
                      >
                        <Unlink className="size-3.5" aria-hidden /> {t('agents.admin.detail.detach')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AttachClient agentId={agent.id} />
      </Panel>

      <Panel
        title={t('agents.admin.com.title')}
        icon={Coins}
        actions={
          <>
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => setManual(true)}>
              <Plus className="size-3.5" aria-hidden /> {t('agents.admin.com.manual')}
            </button>
            <Link to={`/admin/agents/commissions?agentId=${agent.id}`} className="btn-white btn-sm border border-line">
              {t('agents.admin.tabs.commissions')}
            </Link>
          </>
        }
      >
        <CommissionsTable items={commissions} showAgent={false} />
      </Panel>

      <ManualCommissionDialog
        open={manual}
        onClose={() => setManual(false)}
        agentId={agent.id}
        fixedCurrency={cur}
        clients={referrals.map((r) => ({ id: r.id, label: `${r.firstName} ${r.lastName} · ${r.email}`, caseId: r.case?.id ?? null }))}
      />
    </div>
  );
};
