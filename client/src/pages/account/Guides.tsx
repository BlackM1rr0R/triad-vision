import { useTranslation } from 'react-i18next';
import { QuickLinks, TipsCard } from '@/components/portal/Dashboard';
import { useOverview } from '@/components/portal/useOverview';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesAccount } from '@/i18n/pagesAccount';
import { pagesPortalNav } from '@/i18n/pagesPortalNav';
import { GermanTeaser } from './portal/SecondaryCards';
import { BudgetLink } from '@/components/budget/BudgetTeaser';

registerCopy(pagesAccount);
registerCopy(pagesPortalNav);

/** /account/guides — Learn › Guides: tips for the current step, German progress and links to the public guides. */
export default function AccountGuides() {
  const { t } = useTranslation();
  usePageTitle(t('pnav.guides.title'));
  const { data } = useOverview();
  const latest = data?.activeCase ?? data?.cases[0] ?? null;
  const visaSlug = latest?.visaCategory?.slug ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="type-page-title">{t('pnav.guides.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('pnav.guides.intro')}</p>
        <BudgetLink portal className="mt-1 text-sm" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <TipsCard status={latest?.status ?? null} />
        <div className="space-y-6">
          <QuickLinks visaSlug={visaSlug} />
          <GermanTeaser />
        </div>
      </div>
    </div>
  );
}
