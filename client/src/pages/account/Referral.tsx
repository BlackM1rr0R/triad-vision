import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/ErrorState';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, Copy, Download, Gift, MessageCircle, Send, Share2, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { pagesReferralPlus } from '@/i18n/pagesReferralPlus';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Handshake } from '@/components/illustrations';
import { PortalReferralShare, ReferralTermsLink } from '@/components/referrals/PortalReferralShare';

registerCopy(pagesGrowthPlus);
registerCopy(pagesReferralPlus);

type Stage = 'REGISTERED' | 'CASE_OPENED' | 'VISA_APPROVED' | 'BLOCKED';
type RewardStatus = 'PENDING' | 'EARNED' | 'PAID' | 'USED' | 'CANCELLED';

interface RewardBrief {
  id: string;
  amount: number;
  currency: string;
  kind: string;
  status: RewardStatus;
}

interface ReferralData {
  enabled: boolean;
  rule: {
    trigger: 'CASE_OPENED' | 'VISA_APPROVED';
    kind: 'DISCOUNT' | 'PAYOUT';
    amount: number;
    currency: string;
    terms: L10n;
    caseOpenedBonus: number;
    tiers: { approved: number; bonus: number }[];
    friendDiscount: number;
    campaign: { multiplier: number; endsAt: string | null; label: L10n } | null;
  };
  code: string | null;
  link: string | null;
  referrals: {
    id: string;
    name: string;
    stage: Stage;
    createdAt: string;
    reward: RewardBrief | null;
    /** Extra amount at "case opened" (when the programme has one). */
    bonus: RewardBrief | null;
  }[];
  tierBonuses: (RewardBrief & { approved: number | null })[];
  progress: { approved: number; next: { approved: number; bonus: number; remaining: number } | null };
  /** This client's own discount as a referred friend (double-sided programme). */
  welcome: RewardBrief | null;
  totals: { pending: number; earned: number; settled: number; currency: string };
}

const STEP_OF: Record<Stage, number> = { REGISTERED: 0, CASE_OPENED: 1, VISA_APPROVED: 2, BLOCKED: -1 };
const REWARD_TONE: Record<RewardStatus, string> = toneClasses(STATUS_TONES.reward);

/** PNG data URL of the referral link's QR code (null while rendering or when it fails). */
const useQr = (text: string | null) => {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    let alive = true;
    QRCode.toDataURL(text, { width: 480, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b1f44', light: '#ffffff' } })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [text]);
  return qr;
};

export default function AccountReferral() {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  usePageTitle(t('gp.ref.title'));
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['growth', 'referral'], queryFn: async () => (await api.get<ReferralData>('/growth/referral')).data });
  const qr = useQr(data?.enabled ? data.link : null);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Spinner />;
  const copy = async (what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? data.link! : data.code!);
      setCopied(what);
      toast.success(t('gp.ref.copied'));
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard blocked: the field stays selectable
    }
  };
  const share = data.link ? t('gp.ref.shareText', { link: data.link }) : '';
  const steps = t('gp.ref.steps', { returnObjects: true }) as string[];
  const terms = tr(data.rule.terms).trim();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = () => void navigator.share({ text: share, url: data.link ?? undefined }).catch(() => undefined); // cancelled
  const cur = data.rule.currency;
  const campaign = data.rule.campaign;
  const reachedTiers = new Set(data.tierBonuses.map((b) => b.approved));

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="flex items-center gap-6 border-b border-line bg-highlight-bg p-6 text-ink sm:p-8">
          <div className="min-w-0 flex-1">
          <p className="flex items-center gap-3 font-display text-xl font-semibold">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card">
              <Gift className="size-5" aria-hidden />
            </span>
            {t('gp.ref.title')}
          </p>
          <p className="mt-3 max-w-[65ch] text-ink/80">{t('gp.ref.intro')}</p>
          {data.enabled && (
            <p className="mt-4 inline-block rounded-full border border-warning-border bg-card px-3.5 py-1.5 text-sm font-semibold">
              {t(`gp.ref.rule.${data.rule.trigger}`, { amount: data.rule.amount, currency: data.rule.currency, kind: t(`gp.ref.kind.${data.rule.kind}`) })}
            </p>
          )}
          {data.enabled && campaign && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
              <Sparkles className="size-4 text-primary" aria-hidden />
              {tr(campaign.label).trim() && <span>{tr(campaign.label)} ·</span>}
              {t('rp.portal.campaign', { multiplier: campaign.multiplier })}
              {campaign.endsAt && <span className="font-normal text-ink/80">({t('rp.portal.campaignUntil', { date: date(campaign.endsAt) })})</span>}
            </p>
          )}
          {data.enabled && (data.rule.caseOpenedBonus > 0 || data.rule.friendDiscount > 0) && (
            <ul className="mt-2 space-y-1 text-sm text-ink/80">
              {data.rule.caseOpenedBonus > 0 && <li>{t('rp.portal.caseOpenedBonus', { amount: data.rule.caseOpenedBonus, currency: cur })}</li>}
              {data.rule.friendDiscount > 0 && <li>{t('rp.portal.friendDiscount', { amount: data.rule.friendDiscount, currency: cur })}</li>}
            </ul>
          )}
          </div>
          <Handshake className="hidden w-40 shrink-0 sm:block" />
        </div>
        <div className="p-6 sm:p-8">
          {!data.enabled || !data.link || !data.code ? (
            <p className="text-sm text-muted">{t('gp.ref.disabled')}</p>
          ) : (
            <>
              <label className="label" htmlFor="ref-link">
                {t('gp.ref.yourLink')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input id="ref-link" readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-xs sm:text-sm" />
                <button type="button" className="btn-primary shrink-0" onClick={() => copy('link')}>
                  {copied === 'link' ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {t('gp.ref.copy')}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">{t('gp.ref.code')}:</span>
                <code className="rounded-md border border-line bg-sunken px-2 py-1 font-mono font-bold tracking-wider text-ink">{data.code}</code>
                <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-link hover:bg-sunken" onClick={() => copy('code')}>
                  {copied === 'code' ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {t('gp.ref.copyCode')}
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#1f8a4c] px-3.5 text-sm font-semibold text-white hover:bg-[#1a7541]">
                  <MessageCircle className="size-3.5" aria-hidden /> {t('gp.ref.whatsapp')}
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(t('gp.ref.shareText', { link: '' }).trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#1f7fb8] px-3.5 text-sm font-semibold text-white hover:bg-[#1a6c9d]"
                >
                  <Send className="size-3.5" aria-hidden /> {t('gp.ref.telegram')}
                </a>
                {canShare && (
                  <button type="button" className="btn-secondary min-h-11" onClick={nativeShare}>
                    <Share2 className="size-3.5" aria-hidden /> {t('rp.portal.share')}
                  </button>
                )}
              </div>
              {qr && (
                <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-line bg-sunken/60 p-4 sm:flex-row sm:items-center">
                  <img src={qr} alt={t('rp.portal.qrTitle')} width={144} height={144} className="size-36 rounded-lg bg-white" />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{t('rp.portal.qrTitle')}</p>
                    <p className="mt-1 text-sm text-muted">{t('rp.portal.qrHint')}</p>
                    <a href={qr} download={`referral-${data.code}.png`} className="btn-secondary btn-sm mt-3">
                      <Download className="size-3.5" aria-hidden /> {t('rp.portal.qrDownload')}
                    </a>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {(['pending', 'earned', 'settled'] as const).map((k) => (
          <div key={k} className="card card-pad">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t(`gp.ref.totals.${k}`)}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink tabular-nums">
              {data.totals[k]} <span className="text-base font-bold text-muted">{data.totals.currency}</span>
            </p>
          </div>
        ))}
      </section>

      {data.welcome && (
        <section className="card card-pad flex items-start gap-3">
          <Gift className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{t('rp.portal.welcomeTitle')}</p>
            <p className="mt-1 text-sm text-muted">{t('rp.portal.welcomeText', { amount: data.welcome.amount, currency: data.welcome.currency })}</p>
          </div>
          <span className={clsx('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', REWARD_TONE[data.welcome.status])}>{t(`gp.ref.reward.${data.welcome.status}`)}</span>
        </section>
      )}

      {data.rule.tiers.length > 0 && (
        <section className="card card-pad">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Trophy className="size-5 text-primary" aria-hidden /> {t('rp.portal.tiers')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('rp.portal.approvedCount', { count: data.progress.approved })}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {[...data.rule.tiers]
              .sort((a, b) => a.approved - b.approved)
              .map((tier) => {
                const reached = reachedTiers.has(tier.approved);
                return (
                  <li key={tier.approved} className={clsx('rounded-full px-3 py-1.5 text-sm font-semibold', reached ? 'bg-primary text-primary-contrast' : 'bg-sunken text-ink')}>
                    {t('rp.portal.tierItem', { approved: tier.approved, bonus: tier.bonus, currency: cur })}
                    {reached && <> · {t('rp.portal.tierReached')}</>}
                  </li>
                );
              })}
          </ul>
          {data.progress.next && <p className="mt-3 text-sm text-ink">{t('rp.portal.nextTier', { remaining: data.progress.next.remaining, bonus: data.progress.next.bonus, currency: cur })}</p>}
        </section>
      )}

      {data.enabled && <PortalReferralShare />}

      <section className="card card-pad">
        <h2 className="font-display text-lg font-semibold text-ink">{t('gp.ref.list')}</h2>
        {data.referrals.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('gp.ref.empty')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {data.referrals.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-muted">{t('gp.ref.registered', { date: date(r.createdAt) })}</p>
                </div>
                {r.stage === 'BLOCKED' ? (
                  <span className="text-sm font-semibold text-danger">{t('gp.ref.stages.BLOCKED')}</span>
                ) : (
                  <ol className="flex items-center gap-1.5" aria-label={t(`gp.ref.stages.${r.stage}`)}>
                    {steps.map((s, i) => (
                      <li key={s} className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold', i <= STEP_OF[r.stage] ? 'bg-primary text-primary-contrast' : 'bg-sunken text-muted')}>
                        {s}
                      </li>
                    ))}
                  </ol>
                )}
                <span className="flex flex-col items-start gap-1.5 sm:items-end">
                  {r.reward && (
                    <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', REWARD_TONE[r.reward.status])}>
                      {r.reward.amount} {r.reward.currency} · {t(`gp.ref.reward.${r.reward.status}`)}
                    </span>
                  )}
                  {r.reward?.status === 'PAID' && r.reward.kind === 'PAYOUT' && (
                    <a href={`/api/growth/referral/rewards/${r.reward.id}/receipt.pdf`} className="text-xs font-semibold text-link hover:underline" download>
                      {t('rs.receipt')}
                    </a>
                  )}
                  {r.bonus && (
                    <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', REWARD_TONE[r.bonus.status])}>
                      {t('rp.portal.stageBonus', { amount: r.bonus.amount, currency: r.bonus.currency, status: t(`gp.ref.reward.${r.bonus.status}`) })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {t('gp.ref.rules')}
          {terms && <> {terms}</>} <ReferralTermsLink />
        </span>
      </p>
    </div>
  );
}
