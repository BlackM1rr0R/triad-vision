import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';

registerCopy(pagesGrowthPlus);

/** Small call-out linking to /calculator (home page and visa detail pages; `visa` preselects the category). */
export const CalculatorTeaser = ({ visa, inline = false }: { visa?: string; inline?: boolean }) => {
  const { t } = useTranslation();
  const to = visa ? `/calculator?visa=${encodeURIComponent(visa)}` : '/calculator';
  const card = (
    <div className="card card-pad flex flex-col gap-5 rounded-3xl sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl chip-sky">
          <CalendarClock className="size-6" aria-hidden />
        </span>
        <div>
          <span className="eyebrow">{t('gp.calc.teaserEyebrow')}</span>
          <p className="mt-1 font-display text-lg font-semibold text-ink">{t('gp.calc.teaserTitle')}</p>
          <p className="mt-1 max-w-[60ch] text-muted">{t('gp.calc.teaserText')}</p>
        </div>
      </div>
      <Link to={to} className={buttonClass({ variant: 'outline', size: 'lg', className: 'shrink-0' })}>
        {t('gp.calc.teaserCta')} <ArrowRight className="size-4" aria-hidden />
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
