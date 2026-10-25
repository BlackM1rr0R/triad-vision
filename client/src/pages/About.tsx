import { useTranslation } from 'react-i18next';
import { PageHero } from '@/components/layout/PageHero';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { HeroChips, useCopy } from '@/components/about/shared';
import { NumbersCharts } from '@/components/about/AboutVisuals';
import {
  AboutCta,
  AboutFaqSection,
  CompareSection,
  ComplianceSection,
  JourneySection,
  LanguagesSection,
  MissionSection,
  PresenceSection,
  SectorsSection,
  TeamSection,
} from '@/components/about/AboutSections';
import { useSiteContent } from '@/lib/content';
import { registerCopy } from '@/i18n';
import { pagesCompany } from '@/i18n/pagesCompany';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesCompany);

export default function About() {
  const { t } = useTranslation();
  usePageTitle(t('aboutPage.hero.title'));
  const copy = useCopy();
  const { data } = useSiteContent();
  const offices = data?.settings.contact?.offices ?? [];

  return (
    <>
      <PageHero title={t('aboutPage.hero.title')} subtitle={t('aboutPage.hero.subtitle')} image="https://images.unsplash.com/photo-1599946347371-68eb71b16afc?auto=format&fit=crop&w=2000&q=70">
        <HeroChips items={copy<string[]>('aboutPage.hero.chips')} />
      </PageHero>

      <MissionSection />
      <CompareSection />
      <JourneySection />

      <section className="section bg-sunken">
        <div className="container-x">
          <SectionHeading eyebrow={t('aboutPage.numbers.eyebrow')} title={t('aboutPage.numbers.title')} subtitle={t('aboutPage.numbers.subtitle')} />
          <NumbersCharts stats={data?.stats} />
        </div>
      </section>

      <TeamSection />
      {offices.length > 0 && <PresenceSection offices={offices} />}
      <ComplianceSection />
      <LanguagesSection />
      <SectorsSection visas={data?.visaCategories ?? []} />
      <AboutFaqSection />
      <AboutCta />
    </>
  );
}
