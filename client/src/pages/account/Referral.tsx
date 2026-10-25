import { useState } from 'react';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, Copy, Gift, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Handshake } from '@/components/illustrations';

registerCopy(pagesGrowthPlus);

type Stage = 'REGISTERED' | 'CASE_OPENED' | 'VISA_APPROVED' | 'BLOCKED';
type RewardStatus = 'PENDING' | 'EARNED' | 'PAID' | 'USED' | 'CANCELLED';

interface ReferralData {
  enabled: boolean;
  rule: { trigger: 'CASE_OPENED' | 'VISA_APPROVED'; kind: 'DISCOUNT' | 'PAYOUT'; amount: number; currency: string; terms: L10n };
  code: string | null;
  link: string | null;
  referrals: {
    id: string;
    name: string;
    stage: Stage;
    createdAt: string;
    reward: { amount: number; currency: string; kind: string; status: RewardStatus } | null;
  }[];
  totals: { pending: number; earned: number; settled: number; currency: string };
}

const STEP_OF: Record<Stage, number> = { REGISTERED: 0, CASE_OPENED: 1, VISA_APPROVED: 2, BLOCKED: -1 };
const REWARD_TONE: Record<RewardStatus, string> = toneClasses(STATUS_TONES.reward);

export default function AccountReferral() {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  usePageTitle(t('gp.ref.title'));
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['growth', 'referral'], queryFn: async () => (await api.get<ReferralData>('/growth/referral')).data });

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
              </div>
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
                {r.reward && (
                  <span className={clsx('self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:self-auto', REWARD_TONE[r.reward.status])}>
                    {r.reward.amount} {r.reward.currency} · {t(`gp.ref.reward.${r.reward.status}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {t('gp.ref.rules')}
          {terms && <> {terms}</>}
        </span>
      </p>
    </div>
  );
}
