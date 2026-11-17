import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Handshake } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesWorkplaceEtiquette } from '@/i18n/pagesWorkplaceEtiquette';

registerCopy(pagesWorkplaceEtiquette);

export const ETIQUETTE_PATH = '/workplace-etiquette';

/**
 * Small card linking to the workplace etiquette quiz (/workplace-etiquette): shown on the work scenes, the
 * profession hubs (/for/*) and the employer guide. Static, SSR-safe.
 */
export const EtiquetteTeaser = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <div className={clsx('rounded-3xl border border-line bg-card p-4 sm:p-5', className)}>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Handshake className="size-5 text-primary" aria-hidden /> {t('etq.teaser.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('etq.teaser.text')}</p>
      <Link to={ETIQUETTE_PATH} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link underline hover:text-link-hover">
        {t('etq.teaser.cta')} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
};

export default EtiquetteTeaser;
