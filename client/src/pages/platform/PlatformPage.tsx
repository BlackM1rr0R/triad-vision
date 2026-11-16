import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Briefcase, Building2, FileStack, FolderOpen, GraduationCap, Landmark, LayoutDashboard, Search, Server, Palette, ListChecks, Rocket, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { ScreenTour } from '@/components/platform/ScreenTour';
import { DemoRequestForm, INTERESTS } from '@/components/platform/DemoRequestForm';
import { MODULE_KEYS } from '@/components/command/navRegistry';
import { registerCopy } from '@/i18n';
import { pagesPlatform } from '@/i18n/pagesPlatform';
import { adminNavCopy } from '@/i18n/adminNav';
import { api } from '@/lib/api';
import { useBrand } from '@/lib/brand';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesPlatform);
registerCopy(adminNavCopy); // module names / descriptions (anav.modules.*), same list as System → Modules

const FEATURE_ICON: Record<(typeof INTERESTS)[number], LucideIcon> = {
  crm: LayoutDashboard,
  clientPortal: UserRound,
  employerPortal: Building2,
  documents: FolderOpen,
  embassyPackage: Landmark,
  germanLearning: GraduationCap,
  jobSearch: Briefcase,
  seo: Search,
  whiteLabel: Palette,
};
const HOW: { key: 's1' | 's2' | 's3' | 's4'; icon: LucideIcon }[] = [
  { key: 's1', icon: Server },
  { key: 's2', icon: Palette },
  { key: 's3', icon: ListChecks },
  { key: 's4', icon: Rocket },
];

/**
 * /platform — product page of the platform for other visa / recruitment agencies (owner instance only: on a
 * white-label customer instance GET /api/platform/status says available=false and the page shows a short notice).
 * Separate from the agency site: linked only from the footer. No prices ("on request").
 */
export default function PlatformPage() {
  const { t } = useTranslation();
  const brand = useBrand();
  usePageTitle(t('platform.pageTitle'));
  const status = useQuery({
    queryKey: ['platform-status'],
    queryFn: async () => (await api.get<{ available: boolean }>('/platform/status')).data,
    staleTime: 5 * 60_000,
  });

  if (status.data && !status.data.available)
    return (
      <div className="container-x py-24 text-center">
        <p className="text-lg text-muted">{t('platform.unavailable')}</p>
      </div>
    );

  return (
    <>
      <PageHero title={t('platform.title')} subtitle={t('platform.lead')}>
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-ink">
          <BadgeCheck className="size-4 text-link" aria-hidden /> {t('platform.badge')}
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="#demo" className={buttonClass({ size: 'lg' })}>
            {t('platform.ctaDemo')}
          </a>
          <a href="#tour" className={buttonClass({ variant: 'outline', size: 'lg' })}>
            {t('platform.ctaTour')}
          </a>
        </div>
        <p className="mt-4 text-sm text-muted">{t('platform.proof', { brand: brand.name })}</p>
      </PageHero>

      <section className="container-x py-14 sm:py-20" aria-labelledby="pf-features">
        <h2 id="pf-features" className="text-2xl font-bold text-ink sm:text-3xl">
          {t('platform.features.title')}
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTERESTS.map((k) => {
            const Icon = FEATURE_ICON[k];
            return (
              <li key={k} className="rounded-2xl border border-line bg-card p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-link">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3 font-semibold text-ink">{t(`platform.features.${k}.t`)}</h3>
                <p className="mt-1 text-sm text-muted">{t(`platform.features.${k}.d`)}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="tour" className="scroll-mt-24 border-y border-line bg-sunken/50 py-14 sm:py-20" aria-labelledby="pf-tour">
        <div className="container-x">
          <h2 id="pf-tour" className="mb-8 text-2xl font-bold text-ink sm:text-3xl">
            {t('platform.tour.title')}
          </h2>
          <ScreenTour />
        </div>
      </section>

      <section className="container-x py-14 sm:py-20" aria-labelledby="pf-modules">
        <h2 id="pf-modules" className="text-2xl font-bold text-ink sm:text-3xl">
          {t('platform.modules.title')}
        </h2>
        <p className="mt-2 max-w-2xl text-muted">{t('platform.modules.intro')}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_KEYS.map((k) => (
            <li key={k} className="flex gap-3 rounded-xl border border-line bg-card p-4">
              <FileStack className="mt-0.5 size-4 shrink-0 text-link" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">{t(`anav.modules.${k}.title`)}</p>
                <p className="mt-0.5 text-xs text-muted">{t(`anav.modules.${k}.desc`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-sunken/50 py-14 sm:py-20" aria-labelledby="pf-how">
        <div className="container-x">
          <h2 id="pf-how" className="text-2xl font-bold text-ink sm:text-3xl">
            {t('platform.how.title')}
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW.map(({ key, icon: Icon }, n) => (
              <li key={key} className="rounded-2xl border border-line bg-card p-5">
                <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <Icon className="size-4 text-link" aria-hidden /> {n + 1}
                </span>
                <h3 className="mt-2 font-semibold text-ink">{t(`platform.how.${key}.t`)}</h3>
                <p className="mt-1 text-sm text-muted">{t(`platform.how.${key}.d`)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-2xl border border-line bg-card p-5">
            <h3 className="font-semibold text-ink">{t('platform.pricing.title')}</h3>
            <p className="mt-1 text-sm text-muted">{t('platform.pricing.text')}</p>
          </div>
        </div>
      </section>

      <section id="demo" className="container-x scroll-mt-24 py-14 sm:py-20" aria-labelledby="pf-demo">
        <div className="mx-auto max-w-3xl rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-8">
          <h2 id="pf-demo" className="text-2xl font-bold text-ink sm:text-3xl">
            {t('platform.form.title')}
          </h2>
          <p className="mt-2 mb-6 text-muted">{t('platform.form.intro')}</p>
          <DemoRequestForm />
        </div>
      </section>
    </>
  );
}
