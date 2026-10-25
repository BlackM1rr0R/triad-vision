import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useBrand } from '@/lib/brand';

/** Triad Vision's own mark (the default brand). */
const TriadMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 64 56" className={className} aria-hidden>
    <defs>
      <linearGradient id="tv-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5c9bff" />
        <stop offset="1" stopColor="#1565e8" />
      </linearGradient>
    </defs>
    <path d="M32 2 62 54H44L32 32 20 54H2Z" fill="url(#tv-g)" />
    <path d="M32 32 44 54H20Z" fill="currentColor" />
    <path d="M14 46h36" stroke="#fff" strokeWidth="3" opacity=".55" />
  </svg>
);

/** White-label instance without its own logo: the brand's app icon, else its initial on the brand colour. */
const BrandMark = ({ className, icon, name, color }: { className?: string; icon: string; name: string; color: string }) =>
  icon.startsWith('/uploads/') ? (
    <img src={icon} alt="" aria-hidden className={clsx(className, 'object-contain')} />
  ) : (
    <span aria-hidden className={clsx(className, 'grid place-items-center rounded-xl font-display text-lg font-extrabold text-white')} style={{ background: color }}>
      {name.slice(0, 1).toLocaleUpperCase()}
    </span>
  );

/** The brand's mark: Triad Vision's triangle by default, a white-label instance's icon or initial otherwise. */
export const LogoMark = ({ className }: { className?: string }) => {
  const brand = useBrand();
  return brand.isDefault ? <TriadMark className={className} /> : <BrandMark className={className} icon={brand.icons.icon192} name={brand.name} color={brand.primaryColor} />;
};

/** `shrink`: may give up width in a crowded bar (the word mark truncates instead of pushing the controls off-screen). */
export const Logo = ({ light = false, shrink = false, className }: { light?: boolean; shrink?: boolean; className?: string }) => {
  const brand = useBrand();
  // An uploaded logo replaces mark + word mark (the dark variant on dark backgrounds, if there is one).
  const logo = light ? brand.logoDark || brand.logoLight : brand.logoLight || brand.logoDark;
  return (
    <Link to="/" className={clsx('group flex min-h-11 items-center gap-2 sm:gap-3', shrink ? 'min-w-0' : 'shrink-0', className)} aria-label={brand.name}>
      {logo ? (
        <img src={logo} alt="" aria-hidden className={clsx('h-9 w-auto max-w-[11rem] object-contain sm:h-11 sm:max-w-[14rem]', shrink && 'min-w-0')} />
      ) : (
        <>
          {brand.isDefault ? (
            <LogoMark
              className={clsx(
                'h-8 w-9 shrink-0 transition-transform duration-500 group-hover:scale-105 group-hover:rotate-[8deg] sm:h-10 sm:w-11',
                light ? 'text-white' : 'text-ink',
              )}
            />
          ) : (
            <BrandMark className="size-8 shrink-0 sm:size-10" icon={brand.icons.icon192} name={brand.name} color={brand.primaryColor} />
          )}
          <span className={clsx('leading-none whitespace-nowrap', shrink && 'min-w-0 overflow-hidden')}>
            <span className={clsx('block font-display text-[0.98rem] font-extrabold tracking-[0.08em] min-[400px]:text-[1.05rem] min-[400px]:tracking-[0.1em] sm:text-[1.3rem] sm:tracking-[0.12em]', light ? 'text-white' : 'text-ink')}>
              {brand.name.toLocaleUpperCase('en')}
            </span>
            {brand.tagline && (
              <span className={clsx('mt-1 hidden text-[0.52rem] font-semibold tracking-[0.3em] sm:block', light ? 'text-white/60' : 'text-muted')}>
                {brand.tagline.toLocaleUpperCase('en')}
              </span>
            )}
          </span>
        </>
      )}
    </Link>
  );
};
