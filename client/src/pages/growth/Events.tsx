import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarDay } from '@/components/illustrations';
import { EventCard } from '@/components/growth/EventCard';
import { usePublicEvents } from '@/components/growth/api';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowthPlus);

const HERO = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=2000&q=70';

export default function Events() {
  const { t } = useTranslation();
  usePageTitle(t('gp.events.heroTitle'));
  const { data: events, isLoading } = usePublicEvents();
  return (
    <>
      <PageHero title={t('gp.events.heroTitle')} subtitle={t('gp.events.heroSubtitle')} image={HERO} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x">
          <h2 className="h-section section-head text-ink">{t('gp.events.upcoming')}</h2>
          {isLoading ? (
            <Spinner />
          ) : !events?.length ? (
            <div className="card rounded-3xl">
              <EmptyState
                size="lg"
                illustration={<CalendarDay />}
                text={t('gp.events.none')}
                action={
                  <Link to="/booking" className={buttonClass({ size: 'lg' })}>
                    {t('gp.calc.ctaBooking')}
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="grid-cards sm:grid-cols-2 lg:grid-cols-3">
              {events.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
