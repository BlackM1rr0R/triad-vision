import { lazy, Suspense } from 'react';
import { AusbildungSection, NewsSection, PartnersSection, ProcessSection, SamplesSection, VisaSection, WhySection } from '../home/Sections';
import { CalculatorTeaser } from '../growth/CalculatorTeaser';
import {
  AudienceCta,
  AudienceFaq,
  AudienceServices,
  AudienceTestimonials,
  EmployerBenefits,
  EmployerProcess,
  ToolsTeaser,
  WorkerQuickLinks,
} from './AudienceSections';
import type { Audience } from '@/lib/audience';

const PlacementMapSection = lazy(() => import('../growth/PlacementMap').then((m) => ({ default: m.PlacementMapSection })));

const HomeMap = () => (
  <Suspense fallback={null}>
    <PlacementMapSection where="home" />
  </Suspense>
);

/** Home page below the hero once the visitor has said who they are: only that audience's content. */
export default function AudienceHome({ audience }: { audience: Audience }) {
  if (audience === 'employer') {
    return (
      <>
        <EmployerBenefits />
        <AudienceServices audience="employer" />
        <EmployerProcess />
        <PartnersSection />
        <WhySection />
        <AudienceTestimonials audience="employer" />
        <HomeMap />
        <AudienceFaq audience="employer" />
        <NewsSection />
        <AudienceCta audience="employer" />
      </>
    );
  }
  return (
    <>
      <WorkerQuickLinks />
      <VisaSection />
      <CalculatorTeaser />
      <AudienceServices audience="worker" />
      <div id="process" className="scroll-mt-20">
        <ProcessSection />
      </div>
      <ToolsTeaser />
      <SamplesSection />
      <AudienceTestimonials audience="worker" />
      <HomeMap />
      <AusbildungSection />
      <AudienceFaq audience="worker" />
      <NewsSection />
      <AudienceCta audience="worker" />
    </>
  );
}
