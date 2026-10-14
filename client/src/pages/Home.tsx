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

export default function Home() {
  return (
    <>
      <Hero />
      <StatsBar />
      <VisaSection />
      <ServicesSection />
      <ProcessSection />
      <PartnersSection />
      <AudienceSection />
      <SamplesSection />
      <WhySection />
      <TestimonialsSection />
      <AusbildungSection />
      <FaqSection />
      <NewsSection />
      <CtaSection />
    </>
  );
}
