import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { m as motion, useReducedMotion } from 'framer-motion';
import { Ban, Users } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesVacancyPlaces } from '@/i18n/pagesVacancyPlaces';
import { pagesVisualPlus } from '@/i18n/pagesVisualPlus';
import { placesBar } from './bar';
import { isFull, type Places } from './api';

registerCopy(pagesVacancyPlaces);
registerCopy(pagesVisualPlus);

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

/**
 * "5 yerdən 2 yer qalıb": the taken share of the places as a thin bar (real positions / filled / free of lib/vacancyPlaces).
 * Nothing for a single place or when the server sent no counts. Colours from the status tokens (readable in both themes).
 */
export const PlacesBar = ({ v, className }: { v: Places; className?: string }) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const b = placesBar(v);
  if (!b) return null;
  return (
    <div className={className} data-testid="places-bar">
      <p className={clsx('text-xs font-semibold', b.full ? 'text-warning-fg' : b.low ? 'text-warning-fg' : 'text-success-fg')}>
        {b.full ? t('vizp.places.barFull', { positions: b.positions }) : t('vizp.places.bar', { positions: b.positions, free: b.free })}
      </p>
      <div role="img" aria-label={t('vizp.places.aria', { filled: b.filled, positions: b.positions, free: b.free })} className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <motion.span
          aria-hidden
          className={clsx('block h-full origin-left rounded-full', b.full || b.low ? 'bg-warning' : 'bg-success')}
          style={{ width: `${b.percent}%` }}
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
};
