import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, Calculator, Euro, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion';
import { PageCta } from '@/components/visa/PageCta';
import { PathLink, useGuides, type GuideSummary } from '@/components/guides/shared';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Learning } from '@/components/illustrations';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { useMorphSource } from '@/lib/viewTransition';

registerCopy(pagesSeo);

/** One guide card; morphs into the guide page's hero when opened (lib/viewTransition.ts). */
const CHIPS = ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'];

const GuideCard = ({ g, index = 0 }: { g: GuideSummary; index?: number }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const m = useMorphSource('guide', g.slug);
  return (
    <PathLink
      ref={m.ref}
      onClick={m.onClick}
      path={g.path}
      {...m.part('card')}
      className="card card-interactive card-pad group flex h-full flex-col rounded-3xl"
    >
      <span className={`grid size-11 place-items-center rounded-xl ${CHIPS[index % CHIPS.length]}`}>
        <BookOpen className="size-5" aria-hidden />
      </span>
      <h2 {...m.part('title')} className="mt-4 font-display text-lg leading-snug font-semibold text-ink">
        {g.title}
      </h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{g.description}</p>
      <div className="mt-5 flex items-center justify-between text-xs text-muted">
        <span>{t('guidesPage.updated', { date: date(g.updatedAt) })}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-link group-hover:underline">
          {t('guidesPage.read')} <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </PathLink>
  );
};

/** Topic guides index (/guides): every published guide in the reader's language. */
export default function Guides() {
  const { t } = useTranslation();
  usePageTitle(t('guidesPage.title'));
  const { data, isLoading } = useGuides(currentSiteLocale());

  const tools = [
    { to: '/chancenkarte-calculator', label: t('ckCalc.title'), icon: Calculator },
    { to: '/blue-card-check', label: t('bcCheck.title'), icon: Euro },
    { to: '/eligibility', label: t('nav.eligibility'), icon: ListChecks },
  ];

  return (
    <>
      <PageHero title={t('guidesPage.title')} subtitle={t('guidesPage.subtitle')} illustration={<Learning className="w-full" />} />
      <section className="section">
        <div className="container-x">
          {isLoading ? (
            <SkeletonGrid count={6} lines={3} footer className="gap-5 md:grid-cols-2 lg:grid-cols-3" />
          ) : !data?.length ? (
            <div className="rounded-3xl border border-line bg-card">
              <EmptyState size="lg" illustration={<Learning />} title={t('guidesPage.empty')} />
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {data.map((g, i) => (
                <Reveal key={`${g.key}-${g.locale}`} delay={Math.min(i, 5) * 0.05}>
                  <GuideCard g={g} index={i} />
                </Reveal>
              ))}
            </div>
          )}

          <div className="mt-16 rounded-3xl bg-sunken p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold text-ink">{t('guidesPage.tools')}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {tools.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="card card-interactive flex min-h-14 items-center gap-3 px-4 py-3 font-semibold text-ink">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl chip-sky"><Icon className="size-4.5" aria-hidden /></span> {label}
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
