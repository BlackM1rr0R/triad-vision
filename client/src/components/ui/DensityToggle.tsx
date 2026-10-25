import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Rows3, Rows4 } from 'lucide-react';
import { setDensity, useDensity } from '@/lib/theme';
import { registerCopy } from '@/i18n';
import { designSystemCopy } from '@/i18n/designSystem';

registerCopy(designSystemCopy);

/**
 * The user's own admin table density (stored per browser; the theme sets the default). `variant="icon"` is a
 * single header button that flips it; `variant="segmented"` shows both options.
 */
export const DensityToggle = ({ variant = 'icon', className }: { variant?: 'icon' | 'segmented'; className?: string }) => {
  const { t } = useTranslation();
  const density = useDensity();
  if (variant === 'icon') {
    const compact = density === 'compact';
    const label = `${t('ds.density.label')}: ${compact ? t('ds.density.compact') : t('ds.density.comfortable')}`;
    return (
      <button
        type="button"
        onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
        aria-label={label}
        aria-pressed={compact}
        title={label}
        className={clsx('grid size-10 shrink-0 place-items-center rounded-[var(--tv-radius-control)] text-muted transition hover:bg-sunken hover:text-ink', className)}
      >
        {compact ? <Rows4 className="size-[18px]" aria-hidden /> : <Rows3 className="size-[18px]" aria-hidden />}
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label={t('ds.density.label')} className={clsx('inline-flex gap-1 rounded-lg bg-sunken p-1', className)}>
      {(['comfortable', 'compact'] as const).map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={density === d}
          onClick={() => setDensity(d)}
          className={clsx('rounded-md px-3 py-1.5 text-xs font-medium transition', density === d ? 'bg-card text-ink shadow-[var(--tv-shadow-card)]' : 'text-muted hover:text-ink')}
        >
          {t(`ds.density.${d}`)}
        </button>
      ))}
    </div>
  );
};
