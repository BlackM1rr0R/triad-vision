import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BadgeCheck, Briefcase, Clock3, Network, ShieldCheck, UserPlus, Users, Wallet } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesReferrers } from '@/i18n/pagesReferrers';
import { money } from '@/components/agents/format';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorRetry, Kpi, Loading, Section, StatusPill } from '@/components/partnerPortal/ui';
import type { CaseStatus } from '@/lib/types';

registerCopy(pagesReferrers);

/** Figures of a referrer (server lib/referrers/portalRoutes.ts); null = not in this login's permission set. */
interface Stats {
  clients: number;
  activeCases: number | null;
  approvedVisas: number | null;
  paidCents: number | null;
  outstandingCents: number | null;
}
type Approval = 'PENDING' | 'APPROVED' | 'REJECTED';
interface TeamNode {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  approvalStatus: Approval;
  active: boolean;
  createdAt: string;
  phone: string | null;
  email: string | null;
  createdByMe: boolean;
  own: Stats;
  total: Stats;
  subReferrers: number;
}
interface TeamResponse {
  maxDepth: number;
  canAdd: boolean;
  currency: string;
  me: { own: Stats; total: Stats; subReferrers: number; descendants: number } | null;
  items: TeamNode[];
}
type PaymentState = 'NONE' | 'PAID' | 'OPEN' | 'PARTIAL' | 'OVERDUE';
interface DetailResponse {
  referrer: { id: string; name: string; approvalStatus: Approval; active: boolean; own: Stats; total: Stats; subReferrers: number };
  clients: { name: string; caseNumber: string | null; status: CaseStatus | null; refused: boolean | null; paymentState: PaymentState | null }[];
}

const TEAM_KEY = ['partner-portal', 'referrals'] as const;
const useTeam = () => useQuery({ queryKey: TEAM_KEY, queryFn: async () => (await api.get<TeamResponse>('/partner/referrals')).data });

const APPROVAL_TONE: Record<Approval, string> = { PENDING: 'bg-warning-bg text-warning-fg', APPROVED: 'bg-success-bg text-success-fg', REJECTED: 'bg-danger-bg text-danger-fg' };
const PAYMENT_TONE: Record<PaymentState, string> = {
  NONE: 'bg-sunken text-muted',
  PAID: 'bg-success-bg text-success-fg',
  OPEN: 'bg-warning-bg text-warning-fg',
  PARTIAL: 'bg-warning-bg text-warning-fg',
  OVERDUE: 'bg-danger-bg text-danger-fg',
};

const ApprovalPill = ({ status }: { status: Approval }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge whitespace-nowrap', APPROVAL_TONE[status])}>{t(`referrers.status.${status}`)}</span>;
};

/** KPI row: own and whole-team figures (the money tiles only with the payments permission). */
const StatsRow = ({ own, total, currency }: { own?: Stats; total: Stats; currency: string }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {own && <Kpi label={t('referrers.kpi.ownClients')} value={own.clients} icon={Users} />}
      <Kpi label={t('referrers.kpi.teamClients')} value={total.clients} icon={Network} tone="bg-accent-bg text-accent-fg" />
      {total.activeCases != null && <Kpi label={t('referrers.kpi.active')} value={total.activeCases} icon={Briefcase} tone="bg-warning-bg text-warning-fg" />}
      {total.approvedVisas != null && <Kpi label={t('referrers.kpi.approved')} value={total.approvedVisas} icon={BadgeCheck} tone="bg-success-bg text-success-fg" />}
      {total.paidCents != null && <Kpi label={t('referrers.kpi.paid')} value={money(total.paidCents, currency)} icon={Wallet} tone="bg-success-bg text-success-fg" />}
      {total.outstandingCents != null && <Kpi label={t('referrers.kpi.outstanding')} value={money(total.outstandingCents, currency)} icon={Clock3} tone="bg-danger-bg text-danger-fg" />}
    </div>
  );
};

/** "Panel" block of a referrer: own + whole-subtree figures. */
export function ReferrerTeamPanel() {
  const { t } = useTranslation();
  const q = useTeam();
  if (!q.data?.me) return null;
  return (
    <Section
      title={t('referrers.panelTitle')}
      icon={Network}
      actions={
        <Link to="/partner/referrals" className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
          {t('referrers.openTeam')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <StatsRow own={q.data.me.own} total={q.data.me.total} currency={q.data.currency} />
    </Section>
  );
}

const AddForm = ({ maxDepth, onDone }: { maxDepth: number; onDone: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', phone: '', email: '', note: '' });
  const m = useMutation({
    mutationFn: async () => (await api.post('/partner/referrals', { ...f, phone: f.phone || null, note: f.note || null })).data,
    onSuccess: () => {
      toast.success(t('referrers.add.sent'));
      void qc.invalidateQueries({ queryKey: TEAM_KEY });
      onDone();
    },
    onError: (err) => {
      const code = errorCode(err);
      toast.error(t(`referrers.errors.${code}`, { max: maxDepth, defaultValue: t('referrers.errors.generic') }));
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  const field = (k: keyof typeof f, type = 'text', required = false) => (
    <label className="block">
      <span className="label">{t(`referrers.add.${k}`)}</span>
      <input className="input" type={type} required={required} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} maxLength={k === 'note' ? 1000 : 191} />
    </label>
  );
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-sunken/40 p-4">
      <p className="font-semibold text-ink">{t('referrers.add.title')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('name', 'text', true)}
        {field('email', 'email', true)}
        {field('phone', 'tel')}
        {field('note')}
      </div>
      <p className="text-xs text-muted">{t('referrers.add.hint')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={m.isPending}>
          {m.isPending && <Spinner className="size-4" />} {t('referrers.add.submit')}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          {t('referrers.add.cancel')}
        </button>
      </div>
    </form>
  );
};

/** /partner/referrals — the referrer's team (subtree), sub-referrer requests. */
export default function PartnerReferralsPage() {
  const { t } = useTranslation();
  const q = useTeam();
  const [adding, setAdding] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorRetry onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      {d.me && <StatsRow own={d.me.own} total={d.me.total} currency={d.currency} />}
      <Section
        title={t('referrers.title')}
        icon={Network}
        actions={
          d.canAdd && !adding ? (
            <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" aria-hidden /> {t('referrers.add.open')}
            </button>
          ) : undefined
        }
      >
        <p className="mb-4 flex items-start gap-2 text-sm text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t('referrers.intro')}
        </p>
        {adding && <AddForm maxDepth={d.maxDepth} onDone={() => setAdding(false)} />}
        {!d.canAdd && <p className="mb-3 text-xs text-muted">{t('referrers.add.full', { max: d.maxDepth })}</p>}
        {d.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('referrers.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {d.items.map((n) => {
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-ink">{n.name}</span>
                      {n.approvalStatus !== 'APPROVED' && <ApprovalPill status={n.approvalStatus} />}
                      {n.approvalStatus === 'APPROVED' && !n.active && <span className="badge bg-sunken text-muted">{t('referrers.inactive')}</span>}
                    </span>
                    <span className="block text-xs text-muted">
                      {t('referrers.level', { level: n.level })}
                      {n.createdByMe && n.email ? ` · ${n.email}` : ''}
                      {n.createdByMe && n.phone ? ` · ${n.phone}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
                    <span>
                      {t('referrers.cols.clients')}: <b className="text-ink">{n.total.clients}</b>
                    </span>
                    {n.total.activeCases != null && (
                      <span>
                        {t('referrers.cols.active')}: <b className="text-warning-fg">{n.total.activeCases}</b>
                      </span>
                    )}
                    {n.total.approvedVisas != null && (
                      <span>
                        {t('referrers.cols.approved')}: <b className="text-success-fg">{n.total.approvedVisas}</b>
                      </span>
                    )}
                    {n.total.paidCents != null && (
                      <span>
                        {t('referrers.cols.paid')}: <b className="text-ink">{money(n.total.paidCents, d.currency)}</b>
                      </span>
                    )}
                    {n.total.outstandingCents != null && (
                      <span>
                        {t('referrers.cols.outstanding')}: <b className="text-danger-fg">{money(n.total.outstandingCents, d.currency)}</b>
                      </span>
                    )}
                    <span>
                      {t('referrers.cols.team')}: <b className="text-ink">{n.subReferrers}</b>
                    </span>
                  </span>
                </>
              );
              const cls = 'flex min-h-14 flex-wrap items-center justify-between gap-2 py-3';
              return (
                <li key={n.id} style={{ paddingLeft: `${Math.min(n.level - 1, 4) * 1.25}rem` }}>
                  {n.approvalStatus === 'APPROVED' ? (
                    <Link to={`/partner/referrals/${n.id}`} className={clsx(cls, '-mx-2 rounded-xl px-2 transition-colors hover:bg-sunken')}>
                      {body}
                    </Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

/** /partner/referrals/:id — one referrer of the own team: figures and its clients (name, case number, stage, payment only). */
export function PartnerReferralDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const team = useTeam();
  const q = useQuery({ queryKey: [...TEAM_KEY, id], queryFn: async () => (await api.get<DetailResponse>(`/partner/referrals/${encodeURIComponent(id)}`)).data });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorRetry onRetry={() => q.refetch()} />;
  const { referrer: r, clients } = q.data;
  const currency = team.data?.currency ?? 'EUR';
  return (
    <>
      <Link to="/partner/referrals" className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('referrers.detail.back')}
      </Link>
      <Section title={r.name} icon={Network}>
        <StatsRow own={r.own} total={r.total} currency={currency} />
      </Section>
      <Section title={t('referrers.detail.clients')} icon={Users}>
        <p className="mb-4 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t('referrers.detail.privacy')}
        </p>
        {clients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('referrers.detail.empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {clients.map((c, i) => (
              <li key={`${c.caseNumber ?? 'x'}-${i}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{c.name}</span>
                  <span className="block font-mono text-xs text-muted">{c.caseNumber ?? t('referrers.detail.noCase')}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {c.refused ? <span className="badge bg-danger-bg text-danger-fg">{t('referrers.detail.refused')}</span> : c.status && <StatusPill status={c.status} />}
                  {c.paymentState && <span className={clsx('badge whitespace-nowrap', PAYMENT_TONE[c.paymentState])}>{t(`partnerClients.list.payment.${c.paymentState}`)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
