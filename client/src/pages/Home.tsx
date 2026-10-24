import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Repeat } from 'lucide-react';
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
import { AUDIENCE_PATH, useAudience, type Audience } from '@/lib/audience';
import { smoothScrollTo } from '@/lib/smoothScroll';

// Germany placement map: own chunk, renders nothing when hidden by the admin or empty.
const PlacementMapSection = lazy(() => import('@/components/growth/PlacementMap').then((m) => ({ default: m.PlacementMapSection })));
// The audience view (after "Who are you?"): own chunk, fetched only once a visitor has chosen.
const AudienceHome = lazy(() => import('@/components/audience/AudienceHome'));

/** Strip above the audience view: what is shown, switch to the other audience, back to everything. */
const AudienceBar = ({ audience, onChoose }: { audience: Audience; onChoose: (a: Audience | null) => void }) => {
  const { t } = useTranslation();
  const other: Audience = audience === 'worker' ? 'employer' : 'worker';
  return (
    <div className="border-b border-line bg-surface">
      <div className="container-x flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold text-navy-900" aria-live="polite">
          {t(audience === 'worker' ? 'siteNav.home.showingWorker' : 'siteNav.home.showingEmployer')}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={() => onChoose(other)} className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-brand-700 hover:underline">
            <Repeat className="size-4" aria-hidden />
            {t(other === 'worker' ? 'siteNav.home.switchToWorker' : 'siteNav.home.switchToEmployer')}
          </button>
          <button type="button" onClick={() => onChoose(null)} className="inline-flex min-h-9 items-center text-muted hover:text-navy-900 hover:underline">
            {t('siteNav.home.showAll')}
          </button>
          <Link to={AUDIENCE_PATH[audience]} className="inline-flex min-h-9 items-center gap-1 font-semibold text-navy-900 hover:text-brand-700">
            {t('siteNav.home.fullPage')} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
};

/** First visit (or "show everything"): both audiences, as the home page always was. */
const NeutralHome = () => (
  <>
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

export default function Home() {
  const { t } = useTranslation();
  usePageTitle(t('nav.home'));
  const [audience, setAudience] = useAudience();

  const choose = (a: Audience | null) => {
    setAudience(a);
    // Bring the visitor to the content that just changed (below the hero and the stats).
    requestAnimationFrame(() => {
      const el = document.getElementById('home-content');
      if (el) smoothScrollTo(el, { offset: -72 });
    });
  };

  return (
    <>
      <Hero audience={audience} onChoose={choose} />
      <StatsBar />
      <div id="home-content" className="scroll-mt-16">
        {audience ? (
          <>
            <AudienceBar audience={audience} onChoose={choose} />
            <Suspense fallback={<div className="min-h-[60vh]" />}>
              <AudienceHome audience={audience} />
            </Suspense>
          </>
        ) : (
          <NeutralHome />
        )}
      </div>
    </>
  );
}
