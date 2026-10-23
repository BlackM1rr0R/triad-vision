import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
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
      <PageHero title={t('gp.events.heroTitle')} subtitle={t('gp.events.heroSubtitle')} image={HERO} />
      <section className="section">
        <div className="container-x">
          <h2 className="h-section section-head text-navy-900">{t('gp.events.upcoming')}</h2>
          {isLoading ? (
            <Spinner />
          ) : !events?.length ? (
            <div className="card card-pad flex flex-col items-center gap-4 text-center">
              <CalendarClock className="size-10 text-brand-600" aria-hidden />
              <p className="max-w-md text-muted">{t('gp.events.none')}</p>
              <Link to="/booking" className="btn-primary px-5 py-3">
                {t('gp.calc.ctaBooking')}
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
