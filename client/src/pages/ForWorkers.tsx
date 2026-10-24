import { useTranslation } from 'react-i18next';
import { PageHero } from '@/components/layout/PageHero';
import { AusbildungSection, ProcessSection, VisaSection } from '@/components/home/Sections';
import { AudienceCta, AudienceCtas, AudienceFaq, AudienceServices, AudienceTestimonials, ToolsTeaser, WorkerQuickLinks } from '@/components/audience/AudienceSections';
import { usePageTitle } from '@/lib/usePageTitle';

const IMG = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=2000&q=70';

/** /for-workers: everything a worker / candidate needs, nothing for employers. */
export default function ForWorkers() {
  const { t } = useTranslation();
  usePageTitle(t('siteNav.footer.workers'));
  return (
    <>
      <PageHero title={t('workersPage.title')} subtitle={t('workersPage.subtitle')} image={IMG}>
        <AudienceCtas audience="worker" />
      </PageHero>
      <WorkerQuickLinks />
      <AudienceServices audience="worker" />
      <VisaSection />
      <div id="process" className="scroll-mt-20">
        <ProcessSection />
      </div>
      <ToolsTeaser />
      <AudienceTestimonials audience="worker" />
      <AusbildungSection />
      <AudienceFaq audience="worker" />
      <AudienceCta audience="worker" />
    </>
  );
}
