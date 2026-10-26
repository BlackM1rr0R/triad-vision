import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { PageCta } from '@/components/visa/PageCta';
import { BudgetCalculator } from '@/components/budget/BudgetCalculator';
import { registerCopy } from '@/i18n';
import { pagesBudget } from '@/i18n/pagesBudget';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesBudget);

const HERO = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=2000&q=70';

/** Public first-month budget calculator (/budget). Inputs come from the URL (share links, vacancy / visa links). */
export default function BudgetPage() {
  const { t } = useTranslation();
  usePageTitle(t('budget.heroTitle'));
  return (
    <>
      <PageHero title={t('budget.heroTitle')} subtitle={t('budget.heroSubtitle')} image={HERO} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x">
          <BudgetCalculator callbackSource="contact" />
        </div>
      </section>
      <PageCta
        icon={<Wallet className="size-7" aria-hidden />}
        title={t('budget.teaser.title')}
        text={t('budget.teaser.text')}
        primary={{ to: '/booking', label: t('budget.actions.booking') }}
        secondary={{ to: '/salary-calculator', label: t('nav.salary') }}
      />
    </>
  );
}
