import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Wallet } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesMarketing } from '@/i18n/pagesMarketing';

registerCopy(pagesMarketing);

/** Call-out linking to /cost-calculator (visa list and visa detail pages; `visa` preselects the category). */
export const CostCalculatorTeaser = ({ visa }: { visa?: string }) => {
  const { t } = useTranslation();
  const to = visa ? `/cost-calculator?visa=${encodeURIComponent(visa)}` : '/cost-calculator';
  return (
    <section className="section-sm">
      <div className="container-x">
        <div className="card card-pad flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <Wallet className="size-6" aria-hidden />
            </span>
            <div>
              <span className="eyebrow">{t('mk.cost.teaserEyebrow')}</span>
              <p className="mt-1 font-display text-lg font-bold text-ink">{t('mk.cost.teaserTitle')}</p>
              <p className="mt-1 text-sm text-muted">{t('mk.cost.teaserText')}</p>
            </div>
          </div>
          <Link to={to} className="btn-ghost group shrink-0 px-5 py-3">
            {t('mk.cost.teaserCta')} <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
};
