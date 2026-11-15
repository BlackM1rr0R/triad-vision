import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesConfigurator } from '@/i18n/pagesConfigurator';
import { Section } from '@/components/company/shared';
import { PackageConfigurator } from './PackageConfigurator';

registerCopy(pagesConfigurator);

/** Company portal /company/configurator: the package configurator; requests become draft offers for staff review. */
export const CompanyConfigurator = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <Section title={t('packageConfigurator.title')} icon={Package}>
        <p className="-mt-2 text-sm text-muted">{t('packageConfigurator.subtitle')}</p>
      </Section>
      <PackageConfigurator mode="company" />
    </div>
  );
};
