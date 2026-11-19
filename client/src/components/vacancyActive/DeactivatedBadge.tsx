import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { PauseCircle } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesVacancyActive } from '@/i18n/pagesVacancyActive';

registerCopy(pagesVacancyActive);

/**
 * Deactivated vacancy (server lib/vacancyActive.ts): staff switched it off, or its closing date passed. It stays
 * visible after the open ones, nobody can apply (409 VACANCY_CLOSED), the waitlist form is offered instead.
 */
export { isDeactivated } from './state';

/** "Deaktiv — müraciət qəbul olunmur" (grey). */
export const DeactivatedBadge = ({ long, className }: { long?: boolean; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('badge inline-flex items-center gap-1 bg-sunken text-muted ring-1 ring-line', className)}>
      <PauseCircle className="size-3.5" aria-hidden />
      {t(long ? 'vacActive.badgeLong' : 'vacActive.badge')}
    </span>
  );
};

/** Shown instead of the apply button on a deactivated vacancy, with a link to the waitlist form. */
export const DeactivatedNotice = ({ alertAnchor }: { alertAnchor?: string }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-line bg-sunken p-4 text-sm text-ink" role="status">
      <p className="flex items-center gap-2 font-semibold">
        <PauseCircle className="size-4 text-muted" aria-hidden /> {t('vacActive.closedTitle')}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t('vacActive.closedText')}</p>
      {alertAnchor && (
        <a href={`#${alertAnchor}`} className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-link underline">
          {t('vacActive.notifyHint')}
        </a>
      )}
    </div>
  );
};
