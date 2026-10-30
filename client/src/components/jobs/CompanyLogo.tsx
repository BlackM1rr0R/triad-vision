import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesPublicImages } from '@/i18n/pagesPublicImages';
import type { CompanyLogo as Logo } from './types';

registerCopy(pagesPublicImages);

/**
 * Employer logo on the public board (job card, job page) and in the portals: a contained image on a white tile
 * (transparent logos stay readable in dark mode). Alt "<name> logo"; nothing when there is no logo or it fails to load.
 */
export const CompanyLogo = ({ logo, name, className }: { logo?: Logo | null; name: string; className?: string }) => {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  if (!logo?.url || broken) return null;
  return (
    <span className={clsx('grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white p-1', className)}>
      <img
        src={logo.url}
        alt={t('publicImages.logoAlt', { name })}
        width={logo.w ?? 512}
        height={logo.h ?? 512}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="max-h-full max-w-full object-contain"
      />
    </span>
  );
};
