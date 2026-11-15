import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesConfigurator } from '@/i18n/pagesConfigurator';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { PackageConfigurator } from './PackageConfigurator';

registerCopy(pagesConfigurator);

/** Public section of /for-employers (anchor #configurator): configure a package, request the official offer. */
export default function ConfiguratorSection() {
  const { t } = useTranslation();
  return (
    <section id="configurator" className="section scroll-mt-28">
      <div className="container-x">
        <SectionHeading eyebrow={t('packageConfigurator.eyebrow')} title={t('packageConfigurator.title')} subtitle={t('packageConfigurator.subtitle')} />
        <PackageConfigurator mode="public" />
      </div>
    </section>
  );
}
