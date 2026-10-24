import { useTranslation } from 'react-i18next';
import { PageHero } from '@/components/layout/PageHero';
import { PartnersSection } from '@/components/home/Sections';
import { AudienceCta, AudienceCtas, AudienceFaq, AudienceServices, AudienceTestimonials, EmployerBenefits, EmployerProcess } from '@/components/audience/AudienceSections';
import { usePageTitle } from '@/lib/usePageTitle';

const IMG = 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=2000&q=70';

/** /for-employers: services, hiring process and references for companies, nothing for job seekers. */
export default function ForEmployers() {
  const { t } = useTranslation();
  usePageTitle(t('siteNav.footer.employers'));
  return (
    <>
      <PageHero title={t('employersPage.title')} subtitle={t('employersPage.subtitle')} image={IMG}>
        <AudienceCtas audience="employer" />
      </PageHero>
      <EmployerBenefits />
      <AudienceServices audience="employer" />
      <EmployerProcess />
      <PartnersSection />
      <AudienceTestimonials audience="employer" />
      <AudienceFaq audience="employer" />
      <AudienceCta audience="employer" />
    </>
  );
}
