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
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white sm:p-7">
          <p className="flex items-center gap-2 font-display text-xl font-bold">
            <Gift className="size-6" aria-hidden /> {t('gp.ref.title')}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-white/85">{t('gp.ref.intro')}</p>
          {data.enabled && (
            <p className="mt-3 inline-block rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold">
              {t(`gp.ref.rule.${data.rule.trigger}`, { amount: data.rule.amount, currency: data.rule.currency, kind: t(`gp.ref.kind.${data.rule.kind}`) })}
            </p>
          )}
        </div>
        <div className="p-5 sm:p-7">
          {!data.enabled || !data.link || !data.code ? (
            <p className="text-sm text-muted">{t('gp.ref.disabled')}</p>
          ) : (
            <>
              <label className="label" htmlFor="ref-link">
                {t('gp.ref.yourLink')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input id="ref-link" readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-xs sm:text-sm" />
                <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => copy('link')}>
                  {copied === 'link' ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {t('gp.ref.copy')}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">{t('gp.ref.code')}:</span>
                <code className="rounded-md border border-line bg-surface px-2 py-1 font-mono font-bold tracking-wider text-ink">{data.code}</code>
                <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-600 hover:bg-surface" onClick={() => copy('code')}>
                  {copied === 'code' ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {t('gp.ref.copyCode')}
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
                  <MessageCircle className="size-3.5" aria-hidden /> {t('gp.ref.whatsapp')}
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(t('gp.ref.shareText', { link: '' }).trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700"
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
            <p className="mt-1 font-display text-2xl font-extrabold text-ink tabular-nums">
              {data.totals[k]} <span className="text-base font-bold text-muted">{data.totals.currency}</span>
            </p>
          </div>
        ))}
      </section>

      <section className="card card-pad">
        <h2 className="font-display text-lg font-bold text-ink">{t('gp.ref.list')}</h2>
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
                      <li key={s} className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold', i <= STEP_OF[r.stage] ? 'bg-brand-600 text-white' : 'bg-surface text-muted')}>
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
