import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, Calculator, Euro, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion';
import { PageCta } from '@/components/visa/PageCta';
import { PathLink, useGuides } from '@/components/guides/shared';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesSeo);

const HERO = 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=2000&q=70';

/** Topic guides index (/guides): every published guide in the reader's language. */
export default function Guides() {
  const { t } = useTranslation();
  const { date } = useL10n();
  usePageTitle(t('guidesPage.title'));
  const { data, isLoading } = useGuides(currentSiteLocale());

  const tools = [
    { to: '/chancenkarte-calculator', label: t('ckCalc.title'), icon: Calculator },
    { to: '/blue-card-check', label: t('bcCheck.title'), icon: Euro },
    { to: '/eligibility', label: t('nav.eligibility'), icon: ListChecks },
  ];

  return (
    <>
      <PageHero title={t('guidesPage.title')} subtitle={t('guidesPage.subtitle')} image={HERO} />
      <section className="section">
        <div className="container-x">
          {isLoading ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="card card-pad h-52 animate-pulse bg-surface" />
              ))}
            </div>
          ) : !data?.length ? (
            <p className="text-muted">{t('guidesPage.empty')}</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {data.map((g, i) => (
                <Reveal key={`${g.key}-${g.locale}`} delay={Math.min(i, 5) * 0.05}>
                  <PathLink path={g.path} className="card card-pad group flex h-full flex-col transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                      <BookOpen className="size-5" aria-hidden />
                    </span>
                    <h2 className="mt-4 font-display text-lg leading-snug font-bold text-navy-900">{g.title}</h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{g.description}</p>
                    <div className="mt-5 flex items-center justify-between text-xs text-muted">
                      <span>{t('guidesPage.updated', { date: date(g.updatedAt) })}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-brand-600">
                        {t('guidesPage.read')} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </div>
                  </PathLink>
                </Reveal>
              ))}
            </div>
          )}

          <div className="mt-14">
            <h2 className="font-display text-xl font-bold text-navy-900">{t('guidesPage.tools')}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {tools.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="card flex items-center gap-3 px-4 py-3.5 font-semibold text-navy-900 hover:border-brand-400">
                  <Icon className="size-5 text-brand-600" aria-hidden /> {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
      <PageCta
        title={t('guidesPage.ctaTitle')}
        text={t('guidesPage.ctaText')}
        primary={{ to: '/booking', label: t('guidesPage.ctaBooking') }}
        secondary={{ to: '/eligibility', label: t('guidesPage.ctaEligibility') }}
      />
    </>
  );
}
