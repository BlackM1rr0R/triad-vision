import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarClock, Video } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { bookingCtaCopy } from '@/i18n/pagesBooking';
import { Reveal } from '@/components/motion';

registerCopy(bookingCtaCopy);

/** "Book a free consultation" banner for Contact / Cooperation. Preselects the topic on /booking. */
export const BookingCta = ({ topic }: { topic?: 'candidate' | 'company' | 'other' }) => {
  const { t } = useTranslation();
  return (
    <section className="section-sm">
      <div className="container-x">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl bg-navy-900 px-5 py-8 text-white sm:px-10 sm:py-12 lg:px-14">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_85%_15%,rgba(47,123,255,0.45),transparent_55%)]" aria-hidden />
            <div className="absolute -right-10 -bottom-16 -z-10 hidden size-72 rounded-full border border-white/10 sm:block" aria-hidden />
            <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto] lg:gap-12">
              <div className="min-w-0">
                <span className="eyebrow text-brand-400">
                  <Video className="size-3.5" aria-hidden />
                  {t('bookingCta.eyebrow')}
                </span>
                <h2 className="mt-3 font-display text-2xl leading-tight font-extrabold text-balance sm:text-3xl lg:text-[2.1rem]">{t('bookingCta.title')}</h2>
                <p className="mt-3 max-w-2xl text-sm text-white/75 sm:text-base">{t('bookingCta.text')}</p>
              </div>
              <div className="flex flex-col items-start gap-2.5 lg:items-end">
                <Link to={topic ? `/booking?topic=${topic}` : '/booking'} className="btn-primary w-full justify-center sm:w-auto">
                  <CalendarClock className="size-4" aria-hidden />
                  {t('bookingCta.button')}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <p className="text-xs text-white/60">{t('bookingCta.note')}</p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
