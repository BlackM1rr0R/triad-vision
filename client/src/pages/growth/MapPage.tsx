import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { PageCta } from '@/components/visa/PageCta';
import { PlacementMap } from '@/components/growth/PlacementMap';
import { usePlacementMap } from '@/components/growth/api';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowthPlus);

const HERO = 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=2000&q=70';

export default function MapPage() {
  const { t } = useTranslation();
  usePageTitle(t('gp.map.title'));
  const { data, isLoading } = usePlacementMap();
  if (data && !data.enabled) return <Navigate to="/stories" replace />;
  return (
    <>
      <PageHero title={t('gp.map.title')} subtitle={t('gp.map.subtitle')} image={HERO} />
      <section className="section">
        <div className="container-x">
          {isLoading || !data ? (
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
