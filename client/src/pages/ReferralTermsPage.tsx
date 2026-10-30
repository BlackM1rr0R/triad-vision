import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { pagesReferralShare } from '@/i18n/pagesReferralShare';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowthPlus);
registerCopy(pagesReferralShare);

interface Terms {
  body: L10n;
  updatedAt: string | null;
  rule: { enabled: boolean; trigger: 'CASE_OPENED' | 'VISA_APPROVED'; kind: 'DISCOUNT' | 'PAYOUT'; amount: number; currency: string; terms: L10n };
}

/** Public terms of the client referral programme (/referral-terms): admin-edited text + the live rule. */
export default function ReferralTermsPage() {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  usePageTitle(t('rs.terms.title'));
  const { data } = useQuery({ queryKey: ['referral-terms'], queryFn: async () => (await api.get<Terms>('/growth/referral-terms')).data });
  return (
    <section className="bg-canvas pt-24 pb-16 sm:pt-28">
      <div className="container-x">
        <article className="card mx-auto max-w-3xl rounded-3xl p-6 sm:p-10">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{t('rs.terms.title')}</h1>
          {!data ? (
            <Spinner className="mt-6" />
          ) : (
            <>
              <div className="mt-5 rounded-xl border border-line bg-sunken/60 p-4 text-sm text-ink">
                <p className="font-semibold">{t('rs.terms.current')}</p>
                <p className="mt-1">
                  {data.rule.enabled
                    ? t(`gp.ref.rule.${data.rule.trigger}`, { amount: data.rule.amount, currency: data.rule.currency, kind: t(`gp.ref.kind.${data.rule.kind}`) })
                    : t('rs.terms.off')}
                </p>
                {tr(data.rule.terms).trim() && <p className="mt-1 text-muted">{tr(data.rule.terms)}</p>}
              </div>
              <div className="mt-6 space-y-4 text-[15px] leading-relaxed whitespace-pre-line text-ink/90">{tr(data.body)}</div>
              {data.updatedAt && <p className="mt-6 text-xs text-muted">{t('rs.terms.updated', { date: date(data.updatedAt) })}</p>}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
