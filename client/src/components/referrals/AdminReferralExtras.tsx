import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, Download, Plus, ShieldAlert, Sparkles, Trash2, Trophy } from 'lucide-react';
import { ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { Switch } from '@/components/ui/Switch';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { L10nInput } from '@/components/admin/L10nInput';
import { registerCopy } from '@/i18n';
import { pagesReferralPlus } from '@/i18n/pagesReferralPlus';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';

registerCopy(pagesReferralPlus);

/**
 * Admin extras of the client referral programme (Site tools → Refer a friend): the optional rules
 * (case-opened amount, tiers, friend discount, campaign), the leaderboard with period filter, CSV and
 * bulk settlement, the bonus ledger, and blocked / suspicious referrals.
 */

const KEY = ['admin', 'growth', 'referrals'] as const;
type RewardStatus = 'PENDING' | 'EARNED' | 'PAID' | 'USED' | 'CANCELLED';
interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}
const fullName = (p: Person) => `${p.firstName} ${p.lastName}`.trim();

// ─── Rules ─────────────────────────────────────────────────────────────

export interface RuleExtras {
  caseOpenedBonus: number;
  tiers: { approved: number; bonus: number }[];
  friendDiscount: { enabled: boolean; amount: number };
  campaign: { enabled: boolean; multiplier: number; startsAt: string; endsAt: string; label: L10n };
}

const int = (v: string) => Math.max(0, Math.round(Number(v) || 0));

export const ReferralRuleExtras = ({
  value,
  trigger,
  currency,
  canEdit,
  onChange,
}: {
  value: RuleExtras;
  trigger: 'VISA_APPROVED' | 'CASE_OPENED';
  currency: string;
  canEdit: boolean;
  onChange: (v: RuleExtras) => void;
}) => {
  const { t } = useTranslation();
  const set = (patch: Partial<RuleExtras>) => onChange({ ...value, ...patch });
  const c = value.campaign;
  return (
    <div className="mt-5 space-y-5 border-t border-line pt-5">
      <div>
        <p className="font-semibold text-ink">{t('rp.admin.extras')}</p>
        <p className="text-xs text-muted">{t('rp.admin.extrasHint')}</p>
      </div>
      {trigger === 'VISA_APPROVED' && (
        <label className="block max-w-xs">
          <span className="label">
            {t('rp.admin.caseOpenedBonus')} ({currency})
          </span>
          <input className="input" type="number" min={0} value={value.caseOpenedBonus} disabled={!canEdit} onChange={(e) => set({ caseOpenedBonus: int(e.target.value) })} />
          <span className="mt-1 block text-xs text-muted">{t('rp.admin.caseOpenedHint')}</span>
        </label>
      )}

      <div>
        <p className="label flex items-center gap-1.5">
          <Trophy className="size-4" aria-hidden /> {t('rp.admin.tiers')}
        </p>
        <p className="mb-2 text-xs text-muted">{t('rp.admin.tiersHint')}</p>
        <ul className="space-y-2">
          {value.tiers.map((tier, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <label className="block w-32">
                <span className="label">{t('rp.admin.tierApproved')}</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={tier.approved}
                  disabled={!canEdit}
                  onChange={(e) => set({ tiers: value.tiers.map((x, j) => (j === i ? { ...x, approved: Math.max(1, int(e.target.value)) } : x)) })}
                />
              </label>
              <label className="block w-32">
                <span className="label">
                  {t('rp.admin.tierBonus')} ({currency})
                </span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={tier.bonus}
                  disabled={!canEdit}
                  onChange={(e) => set({ tiers: value.tiers.map((x, j) => (j === i ? { ...x, bonus: int(e.target.value) } : x)) })}
                />
              </label>
              {canEdit && (
                <button type="button" className="btn-ghost btn-sm" aria-label={t('rp.admin.removeTier')} onClick={() => set({ tiers: value.tiers.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && value.tiers.length < 10 && (
          <button
            type="button"
            className="btn-secondary btn-sm mt-2"
            onClick={() => set({ tiers: [...value.tiers, { approved: Math.max(0, ...value.tiers.map((x) => x.approved)) + (value.tiers.length ? 2 : 3), bonus: 50 }] })}
          >
            <Plus className="size-4" aria-hidden /> {t('rp.admin.addTier')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Switch showLabel checked={value.friendDiscount.enabled} label={t('rp.admin.friend')} disabled={!canEdit} onChange={(v) => set({ friendDiscount: { ...value.friendDiscount, enabled: v } })} />
        {value.friendDiscount.enabled && (
          <label className="block w-40">
            <span className="label">
              {t('rp.admin.friendAmount')} ({currency})
            </span>
            <input
              className="input"
              type="number"
              min={0}
              value={value.friendDiscount.amount}
              disabled={!canEdit}
              onChange={(e) => set({ friendDiscount: { ...value.friendDiscount, amount: int(e.target.value) } })}
            />
          </label>
        )}
      </div>

      <div>
        <Switch showLabel checked={c.enabled} label={t('rp.admin.campaign')} disabled={!canEdit} onChange={(v) => set({ campaign: { ...c, enabled: v } })} />
        {c.enabled && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="block w-28">
                <span className="label">{t('rp.admin.multiplier')}</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  value={c.multiplier}
                  disabled={!canEdit}
                  onChange={(e) => set({ campaign: { ...c, multiplier: Math.min(5, Math.max(1, Number(e.target.value) || 1)) } })}
                />
              </label>
              <label className="block">
                <span className="label">{t('rp.admin.startsAt')}</span>
                <input className="input w-auto" type="date" value={c.startsAt} max={c.endsAt || undefined} disabled={!canEdit} onChange={(e) => set({ campaign: { ...c, startsAt: e.target.value } })} />
              </label>
              <label className="block">
                <span className="label">{t('rp.admin.endsAt')}</span>
                <input className="input w-auto" type="date" value={c.endsAt} min={c.startsAt || undefined} disabled={!canEdit} onChange={(e) => set({ campaign: { ...c, endsAt: e.target.value } })} />
              </label>
            </div>
            <L10nInput label={t('rp.admin.campaignLabel')} value={c.label} onChange={(v) => set({ campaign: { ...c, label: v } })} />
            <p className="flex items-start gap-1.5 text-xs text-muted">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('rp.admin.campaignHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/** Client-side check of the extras (the server validates the same). Returns an error key or null. */
export const ruleExtrasError = (v: RuleExtras) => {
  if (new Set(v.tiers.map((x) => x.approved)).size !== v.tiers.length) return 'DUPLICATE_TIER';
  if (v.campaign.startsAt && v.campaign.endsAt && v.campaign.startsAt > v.campaign.endsAt) return 'CAMPAIGN_DATES';
  return null;
};

// ─── Leaderboard ───────────────────────────────────────────────────────

interface LbRow {
  referrerId: string;
  name: string;
  email: string;
  registered: number;
  caseOpened: number;
  visaApproved: number;
  blocked: number;
  earned: number;
  pending: number;
  settled: number;
  outstanding: number;
}
const COLS = ['registered', 'caseOpened', 'visaApproved', 'blocked', 'earned', 'pending', 'settled', 'outstanding'] as const;

export const ReferralLeaderboard = ({ canEdit }: { canEdit: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [target, setTarget] = useState<LbRow | null>(null);
  const params = { from: from || undefined, to: to || undefined };
  const q = useQuery({
    queryKey: [...KEY, 'leaderboard', params],
    queryFn: async () => (await api.get<{ currency: string; rows: LbRow[] }>('/admin/growth/referrals/leaderboard', { params })).data,
    placeholderData: keepPreviousData,
  });
  const settle = useMutation({
    mutationFn: (referrerId: string) => api.post<{ paid: number; used: number }>('/admin/growth/referrals/rewards/settle', { referrerId }),
    onSuccess: (res) => {
      toast.success(t('rp.admin.settledToast', { count: res.data.paid + res.data.used }));
      setTarget(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(t('gp.common.error')),
  });
  const csvHref = `/api/admin/growth/referrals/leaderboard.csv?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const currency = q.data?.currency ?? '';

  return (
    <Panel title={t('rp.admin.leaderboard')} icon={Trophy} bodyClassName="p-0 sm:p-0">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block">
          <span className="label">{t('rp.admin.from')}</span>
          <input type="date" className="input w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('rp.admin.to')}</span>
          <input type="date" className="input w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="flex items-center gap-2 sm:ml-auto">
          {q.isFetching && !q.isLoading && <Spinner className="size-4 text-link" />}
          <a href={csvHref} className="btn-secondary btn-sm" download>
            <Download className="size-3.5" aria-hidden /> {t('rp.admin.csv')}
          </a>
        </div>
        <p className="w-full text-xs text-muted">{t('rp.admin.periodHint')}</p>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError || !q.data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.rows.length === 0 ? (
        <p className="p-5 text-sm text-muted">{t('rp.admin.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-sunken text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">{t('rp.admin.cols.referrer')}</th>
                {COLS.map((k) => (
                  <th key={k} className="px-3 py-2 text-right font-semibold">
                    {t(`rp.admin.cols.${k}`)}
                  </th>
                ))}
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.rows.map((r) => (
                <tr key={r.referrerId}>
                  <td className="px-4 py-2">
                    <span className="font-semibold text-ink">{r.name}</span>
                    <span className="block text-xs text-muted">{r.email}</span>
                  </td>
                  {COLS.map((k) => (
                    <td key={k} className="px-3 py-2 text-right tabular-nums">
                      {r[k]}
                      {['earned', 'pending', 'settled', 'outstanding'].includes(k) && r[k] > 0 && <span className="text-xs text-muted"> {currency}</span>}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      {r.outstanding > 0 && (
                        <button type="button" className="btn-secondary btn-sm whitespace-nowrap" onClick={() => setTarget(r)}>
                          {t('rp.admin.settleAll')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={() => target && settle.mutate(target.referrerId)}
        loading={settle.isPending}
        tone="primary"
        title={t('rp.admin.settleAll')}
        message={target ? t('rp.admin.settleConfirm', { name: target.name, amount: target.outstanding, currency }) : ''}
        confirmLabel={t('rp.admin.settleAll')}
      />
    </Panel>
  );
};

// ─── Bonus ledger ──────────────────────────────────────────────────────

export interface BonusRow {
  id: string;
  type: 'STAGE' | 'TIER' | 'FRIEND';
  kind: string;
  amount: number;
  currency: string;
  status: RewardStatus;
  note: string | null;
  dedupeKey: string | null;
  createdAt: string;
  source: { id: string; stage: string; referrer: Person; referred: Person } | null;
}

export const ReferralBonuses = ({ rows, canEdit }: { rows: BonusRow[]; canEdit: boolean }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RewardStatus }) => api.patch(`/admin/growth/referrals/rewards/${id}`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: () => toast.error(t('gp.common.error')),
  });
  const actions = (r: BonusRow) => {
    const out: { status: RewardStatus; label: string }[] = [];
    if (r.status === 'EARNED') out.push({ status: r.kind === 'PAYOUT' ? 'PAID' : 'USED', label: r.kind === 'PAYOUT' ? t('gp.admin.ref.markPaid') : t('gp.admin.ref.markUsed') });
    if (r.status === 'EARNED') out.push({ status: 'CANCELLED', label: t('gp.admin.ref.cancelReward') });
    if (r.status === 'CANCELLED' && r.source?.stage !== 'BLOCKED') out.push({ status: 'PENDING', label: t('gp.admin.ref.restore') });
    return out;
  };
  return (
    <Panel title={t('rp.admin.bonuses')} bodyClassName="p-0 sm:p-0">
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-muted">{t('rp.admin.noBonuses')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-sunken text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">{t('rp.admin.beneficiary')}</th>
                <th className="px-4 py-2 font-semibold">{t('rp.admin.source')}</th>
                <th className="px-4 py-2 font-semibold">{t('gp.admin.ref.reward')}</th>
                <th className="px-4 py-2 font-semibold">{t('gp.admin.ref.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const who = r.source ? (r.type === 'FRIEND' ? r.source.referred : r.source.referrer) : null;
                const tierN = r.type === 'TIER' ? Number(r.dedupeKey?.split(':')[2]) || null : null;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      {who ? (
                        <>
                          <span className="font-semibold text-ink">{fullName(who)}</span>
                          <span className="block text-xs text-muted">{who.email}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {t(`rp.admin.types.${r.type}`)}
                      {tierN && <> · {t('rp.admin.tierOf', { n: tierN })}</>}
                      {r.type !== 'TIER' && r.source && r.type !== 'FRIEND' && <span className="block text-muted">{fullName(r.source.referred)}</span>}
                      <span className="block text-muted">{date(r.createdAt)}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.amount} {r.currency} · {t(`gp.ref.reward.${r.status}`)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex flex-wrap gap-1.5">
                        {r.status === 'PAID' && r.kind === 'PAYOUT' && (
                          <a href={`/api/admin/growth/referrals/rewards/${r.id}/receipt.pdf`} className="btn-ghost btn-sm" download>
                            {t('rs.admin.receipt')}
                          </a>
                        )}
                        {canEdit &&
                          actions(r).map((a) => (
                            <button key={a.status} type="button" className="btn-secondary btn-sm" disabled={move.isPending} onClick={() => move.mutate({ id: r.id, status: a.status })}>
                              {a.label}
                            </button>
                          ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

// ─── Blocked / suspicious ──────────────────────────────────────────────

interface Suspicious {
  blocked: { id: string; blockedReason: string | null; createdAt: string; updatedAt: string; referrer: Person; referred: Person }[];
  bursts: { referrer: Person; maxIn24h: number }[];
}

export const ReferralSuspicious = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const q = useQuery({ queryKey: [...KEY, 'suspicious'], queryFn: async () => (await api.get<Suspicious>('/admin/growth/referrals/suspicious')).data });
  return (
    <Panel title={t('rp.admin.suspicious')} icon={ShieldAlert}>
      {q.isLoading ? (
        <LoadingBlock className="min-h-24" />
      ) : q.isError || !q.data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="label">{t('rp.admin.blockedList')}</p>
            {q.data.blocked.length === 0 ? (
              <p className="text-sm text-muted">{t('rp.admin.noBlocked')}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {q.data.blocked.map((b) => (
                  <li key={b.id} className="py-2">
                    <span className="font-semibold text-ink">{fullName(b.referrer)}</span> → {fullName(b.referred)}
                    <span className="block text-xs text-danger-fg">
                      {t('gp.admin.ref.blocked', { reason: t(`gp.admin.ref.reasons.${b.blockedReason ?? 'SAME_EMAIL'}`) })} · {date(b.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="label">{t('rp.admin.bursts')}</p>
            {q.data.bursts.length === 0 ? (
              <p className="text-sm text-muted">{t('rp.admin.noBursts')}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {q.data.bursts.map((b) => (
                  <li key={b.referrer.id} className="py-2">
                    <span className="font-semibold text-ink">{fullName(b.referrer)}</span>
                    <span className="block text-xs text-muted">
                      {b.referrer.email} · {t('rp.admin.burstItem', { count: b.maxIn24h })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
};

/** "Block" in the ledger: blocks a referral (MANUAL) after a confirmation. */
export const BlockReferralButton = ({ referralId }: { referralId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const block = useMutation({
    mutationFn: () => api.post(`/admin/growth/referrals/${referralId}/block`, {}),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(t('gp.common.error')),
  });
  return (
    <>
      <button type="button" className="btn-ghost btn-sm text-danger-fg" onClick={() => setOpen(true)}>
        <Ban className="size-3.5" aria-hidden /> {t('rp.admin.block')}
      </button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={() => block.mutate()} loading={block.isPending} title={t('rp.admin.block')} message={t('rp.admin.blockConfirm')} confirmLabel={t('rp.admin.block')} />
    </>
  );
};

/** Links to the separate B2B programmes (agents, partners) — they are not merged with client referrals. */
export const OtherProgrammes = () => {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-muted">
      {t('rp.admin.other')}{' '}
      <Link to="/admin/agents" className="font-semibold text-link hover:underline">
        {t('rp.admin.agents')}
      </Link>{' '}
      ·{' '}
      <Link to="/admin/partners" className="font-semibold text-link hover:underline">
        {t('rp.admin.partners')}
      </Link>
    </p>
  );
};
