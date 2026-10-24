import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { PageCta } from '@/components/visa/PageCta';
import { PlacementMap } from '@/components/growth/PlacementMap';
import { OriginFlowMap } from '@/components/growth/OriginFlowMap';
import { usePlacementMap } from '@/components/growth/api';
import { usePublicOrigins } from '@/components/marketing/api';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowthPlus);
registerCopy(pagesMarketing);

const HERO = 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=2000&q=70';

export default function MapPage() {
  const { t } = useTranslation();
  usePageTitle(t('gp.map.title'));
  const { data, isLoading } = usePlacementMap();
  const { data: origins } = usePublicOrigins();
  const [view, setView] = useState<'to' | 'from'>('to');
  if (data && !data.enabled) return <Navigate to="/stories" replace />;
  // The "From → To" toggle only appears once at least one origin point is public (≥ 3 people).
  const hasOrigins = !!origins?.enabled && origins.origins.length > 0;
  const showFrom = hasOrigins && view === 'from';
  return (
    <>
      <PageHero title={showFrom ? t('mk.origins.title') : t('gp.map.title')} subtitle={showFrom ? t('mk.origins.subtitle') : t('gp.map.subtitle')} image={HERO} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x">
          {hasOrigins && (
            <Tabs
              className="mb-6"
              variant="pills"
              label={t('gp.map.title')}
              items={[
                { key: 'to', label: t('mk.origins.toggleTo') },
                { key: 'from', label: t('mk.origins.toggleFrom') },
              ]}
              value={view}
              onChange={setView}
            />
          )}
          {showFrom && origins ? (
            <OriginFlowMap data={origins} />
          ) : isLoading || !data ? (
            <Spinner />
          ) : data.cities.length === 0 ? (
            <p className="card card-pad text-center text-muted">{t('gp.map.empty')}</p>
          ) : (
            <PlacementMap data={data} />
          )}
        </div>
      </section>
      <PageCta title={t('gp.calc.teaserTitle')} text={t('gp.calc.teaserText')} primary={{ to: '/calculator', label: t('gp.calc.teaserCta') }} secondary={{ to: '/booking', label: t('gp.calc.ctaBooking') }} />
    </>
  );
}
