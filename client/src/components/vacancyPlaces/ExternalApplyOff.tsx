import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Info } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { registerCopy } from '@/i18n';
import { pagesVacancyPlaces } from '@/i18n/pagesVacancyPlaces';

registerCopy(pagesVacancyPlaces);

/**
 * Shown on /jobs/germany (and saved jobs) instead of "apply via Triad Vision" while the admin setting "allow
 * applications to external Germany job listings" is off: these listings are not our vacancies.
 */
export const ExternalApplyOff = ({ className = 'card rounded-3xl p-6 sm:p-8' }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <div className={className} role="note">
      <p className="flex items-start gap-2 text-sm text-ink">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> {t('vacPlaces.external.off')}
      </p>
      <Link to="/jobs" className={buttonClass({ variant: 'outline', className: 'mt-4' })}>
        {t('vacPlaces.external.ours')} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
};
