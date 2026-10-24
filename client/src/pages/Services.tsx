import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Route } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ServiceCard } from '@/components/cards';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { ServiceMatrix } from '@/components/services/ServiceMatrix';
import { JourneyFlow } from '@/components/services/JourneyFlow';
import { PageCta } from '@/components/visa/PageCta';
import { useSiteContent } from '@/lib/content';
import { registerCopy } from '@/i18n';
import { pagesVisa } from '@/i18n/pagesVisa';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesVisa);

type Filter = 'all' | 'company' | 'candidate';

export default function Services() {
  const { t } = useTranslation();
  usePageTitle(t('servicesPage.heroTitle'));
  const { data, isLoading } = useSiteContent();
  const [filter, setFilter] = useState<Filter>('all');
  const all = data?.services ?? [];
  const items = all.filter((s) => filter === 'all' || s.audience === filter || s.audience === 'all');
  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: t('svc.all') },
    { key: 'company', label: t('svc.forCompany') },
    { key: 'candidate', label: t('svc.forCandidate') },
  ];

  return (
    <>
      <PageHero
        title={t('servicesPage.heroTitle')}
        subtitle={t('servicesPage.heroSubtitle')}
        image="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2000&q=70"
      />

      <section className="section">
        <div className="container-x">
          <SectionHeading
            eyebrow={t('servicesPage.grid.eyebrow')}
            title={t('servicesPage.grid.title')}
            subtitle={t('servicesPage.grid.subtitle')}
            action={
              <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-line bg-surface p-1 [scrollbar-width:none]">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={filter === tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={clsx(
                      'relative h-10 shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition sm:px-5',
                      filter === tab.key ? 'text-white' : 'text-navy-900',
                    )}
                  >
                    {filter === tab.key && <motion.span layoutId="svc-tab" className="absolute inset-0 rounded-full bg-brand-600" />}
                    <span className="relative">{tab.label}</span>
                  </button>
                ))}
              </div>
            }
          />
          {isLoading ? (
            <SkeletonGrid count={8} lines={3} footer className="grid-cards sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
          ) : (
            <Stagger key={filter} className="grid-cards sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((s) => (
                <StaggerItem key={s.id}>
                  <ServiceCard service={s} index={all.indexOf(s)} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>

      {all.length > 0 && (
        <section className="section relative isolate overflow-hidden bg-navy-950 text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_0%,rgba(47,123,255,0.25),transparent_45%)]" />
          <div className="container-x">
            <SectionHeading light eyebrow={t('servicesPage.journey.eyebrow')} title={t('servicesPage.journey.title')} subtitle={t('servicesPage.journey.subtitle')} />
            <JourneyFlow services={all} />
          </div>
        </section>
      )}

      {all.length > 0 && (
        <section className="section">
          <div className="container-x">
            <SectionHeading eyebrow={t('servicesPage.matrix.eyebrow')} title={t('servicesPage.matrix.title')} subtitle={t('servicesPage.matrix.subtitle')} />
            <Reveal>
              <ServiceMatrix services={all} />
            </Reveal>
          </div>
        </section>
      )}

      <PageCta
        icon={<Route className="size-7" />}
        title={t('servicesPage.cta.title')}
        text={t('servicesPage.cta.text')}
        primary={{ to: '/cooperation', label: t('servicesPage.cta.company') }}
        secondary={{ to: '/register', label: t('servicesPage.cta.candidate') }}
      />
    </>
  );
}
