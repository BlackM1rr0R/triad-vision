import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { setPrefs, useResolvedTheme } from '@/lib/prefs';

/**
 * Sun/moon button that flips between light and dark (the three-way light/dark/system choice lives
 * in the accessibility panel). `light` = white icon for transparent headers over dark heroes.
 */
export const ThemeToggle = ({ light = false, variant = 'pill', className }: { light?: boolean; variant?: 'pill' | 'bar'; className?: string }) => {
  const { t } = useTranslation();
  const resolved = useResolvedTheme();
  const dark = resolved === 'dark';
  const label = dark ? t('a11y.theme.toLight') : t('a11y.theme.toDark');
  return (
    <button
      type="button"
      onClick={() => setPrefs({ theme: dark ? 'light' : 'dark' })}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center transition',
        variant === 'pill' && 'size-10 rounded-lg border',
        variant === 'pill' && (light ? 'border-white/25 text-white hover:bg-white/10' : 'border-line text-ink hover:border-primary'),
        variant === 'bar' && 'size-8 rounded text-white/80 hover:text-white',
        className,
      )}
    >
      {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
};
