import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Hero } from '@/components/home/Hero';
import { StatsBar } from '@/components/home/StatsBar';
import {
  AudienceSection,
  AusbildungSection,
  CtaSection,
  FaqSection,
  NewsSection,
  PartnersSection,
  ProcessSection,
  ServicesSection,
  SamplesSection,
  TestimonialsSection,
  VisaSection,
  WhySection,
} from '@/components/home/Sections';
import { usePageTitle } from '@/lib/usePageTitle';
import { CalculatorTeaser } from '@/components/growth/CalculatorTeaser';

// Germany placement map: own chunk, renders nothing when hidden by the admin or empty.
const PlacementMapSection = lazy(() => import('@/components/growth/PlacementMap').then((m) => ({ default: m.PlacementMapSection })));

export default function Home() {
  const { t } = useTranslation();
  usePageTitle(t('nav.home'));
  return (
    <>
      <Hero />
      <StatsBar />
      <VisaSection />
      <CalculatorTeaser />
      <ServicesSection />
      <ProcessSection />
      <PartnersSection />
      <AudienceSection />
      <SamplesSection />
      <WhySection />
      <TestimonialsSection />
      <Suspense fallback={null}>
        <PlacementMapSection where="home" />
      </Suspense>
      <AusbildungSection />
      <FaqSection />
      <NewsSection />
      <CtaSection />
    </>
  );
}
