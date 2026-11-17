import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Ban, Users } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesVacancyPlaces } from '@/i18n/pagesVacancyPlaces';
import { isFull, type Places } from './api';

registerCopy(pagesVacancyPlaces);

/** "3 boş yer" (green) / "Yer qalmayıb" (amber) — on job cards, the vacancy page, pickers and staff lists. */
export const PlacesBadge = ({ v, className, withTotal }: { v: Places; className?: string; withTotal?: boolean }) => {
  const { t } = useTranslation();
  if (v.free === undefined) return null;
  const full = isFull(v);
  return (
    <span className={clsx('badge inline-flex items-center gap-1', full ? 'bg-warning-bg text-warning-fg' : 'bg-success-bg text-success-fg', className)}>
      {full ? <Ban className="size-3.5" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
      {full ? t('vacPlaces.full') : t('vacPlaces.left', { count: v.free })}
      {withTotal && v.filled !== undefined && <span className="font-normal opacity-80">· {t('vacPlaces.of', { filled: v.filled, positions: v.positions })}</span>}
    </span>
  );
};

/** Shown instead of the apply button when every place is taken: why, and where to get notified about similar jobs. */
export const FullNotice = ({ alertAnchor }: { alertAnchor?: string }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-warning-border bg-warning-bg p-4 text-sm text-warning-fg" role="status">
      <p className="flex items-center gap-2 font-semibold">
        <Ban className="size-4" aria-hidden /> {t('vacPlaces.fullTitle')}
      </p>
      <p className="mt-1 text-xs leading-relaxed">{t('vacPlaces.fullText')}</p>
      {alertAnchor && (
        <a href={`#${alertAnchor}`} className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold underline">
          {t('vacPlaces.notifyHint')}
        </a>
      )}
    </div>
  );
};
