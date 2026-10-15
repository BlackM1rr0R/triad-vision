import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Compass } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { useOnboarding } from './api';

registerCopy(pagesJourney);

/** Compact "first steps in Germany" card for the dashboard (approved clients only). */
export const OnboardingCard = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { data } = useOnboarding();
  if (!data?.case || !data.progress) return null;
  const next = data.items.find((i) => !i.done);
  return (
    <section className="card relative overflow-hidden p-5 sm:p-6" aria-labelledby="onboarding-card-title">
      <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-100),transparent)]" aria-hidden />
      <div className="relative flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="onboarding-card-title" className="flex items-center gap-2.5 text-base font-bold text-navy-900">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Compass className="size-4" aria-hidden />
            </span>
            {t('journey.onboarding.home.title')}
          </h2>
          <p className="mt-2 text-sm text-muted">{t('journey.onboarding.home.body')}</p>
          {next && <p className="mt-2 text-sm font-semibold text-navy-900">{t('journey.onboarding.home.next', { title: tr(next.title) })}</p>}
          <Link to="/account/onboarding" className="btn-primary mt-4 min-h-10 px-4 py-2 text-sm">
            {t('journey.onboarding.home.cta')}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ProgressRing percent={data.progress.percent} size={64} stroke={6} label={t('journey.onboarding.progress', { done: data.progress.done, total: data.progress.total })}>
          <span className="text-center font-display text-sm leading-none font-extrabold text-navy-900">
            {data.progress.done}/{data.progress.total}
          </span>
        </ProgressRing>
      </div>
    </section>
  );
};
