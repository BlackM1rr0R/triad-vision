import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';

registerCopy(pagesGrowthPlus);

/** Small call-out linking to /calculator (home page and visa detail pages; `visa` preselects the category). */
export const CalculatorTeaser = ({ visa, inline = false }: { visa?: string; inline?: boolean }) => {
  const { t } = useTranslation();
  const to = visa ? `/calculator?visa=${encodeURIComponent(visa)}` : '/calculator';
  const card = (
    <div className="card card-pad flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <CalendarClock className="size-6" aria-hidden />
        </span>
        <div>
          <span className="eyebrow">{t('gp.calc.teaserEyebrow')}</span>
          <p className="mt-1 font-display text-lg font-bold text-ink">{t('gp.calc.teaserTitle')}</p>
          <p className="mt-1 text-sm text-muted">{t('gp.calc.teaserText')}</p>
        </div>
      </div>
      <Link to={to} className="btn-primary group shrink-0 px-5 py-3">
        {t('gp.calc.teaserCta')} <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
      </Link>
    </div>
  );
  if (inline) return card;
  return (
    <section className="section-sm">
      <div className="container-x">{card}</div>
    </section>
  );
};
