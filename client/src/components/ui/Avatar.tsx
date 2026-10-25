import { useState } from 'react';
import clsx from 'clsx';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const BOX: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-lg',
};

/** Muted, low-saturation hues (categorical, not status): picked from the name so a person keeps one colour. */
const HUES = [
  'bg-[#e3eaf6] text-[#1d3f75] dark:bg-[#22304a] dark:text-[#c6d6f3]',
  'bg-[#f3eadb] text-[#6b4a12] dark:bg-[#3a3022] dark:text-[#f0d8a8]',
  'bg-[#e1efea] text-[#1c5a49] dark:bg-[#1f3a33] dark:text-[#b4e3d4]',
  'bg-[#ece7f6] text-[#4a3784] dark:bg-[#2e2742] dark:text-[#d4c9f3]',
  'bg-[#f5e4e8] text-[#7a2b3d] dark:bg-[#3d242b] dark:text-[#f2c3cd]',
  'bg-[#e6e9ee] text-[#3a4352] dark:bg-[#272d38] dark:text-[#cfd5df]',
];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toLocaleUpperCase();

export type AvatarProps = {
  /** Full name: initials, colour and the accessible name come from it. */
  name: string;
  src?: string | null;
  size?: AvatarSize;
  /** "circle" (people, default) or "square" (companies, teams). */
  shape?: 'circle' | 'square';
  /** Presence dot. */
  status?: 'online' | 'away' | 'offline';
  /** Decorative when the name is printed next to it (default true → aria-hidden). */
  decorative?: boolean;
  className?: string;
};

/**
 * Photo or initials. Initials get a calm hue derived from the name.
 *
 *   <Avatar name="Leyla Məmmədova" size="sm" />
 *   <Avatar name={company.name} src={company.logoUrl} shape="square" decorative={false} />
 */
export const Avatar = ({ name, src, size = 'md', shape = 'circle', status, decorative = true, className }: AvatarProps) => {
  const [broken, setBroken] = useState(false);
  const showImg = !!src && !broken;
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': name };
  return (
    <span className={clsx('relative inline-flex shrink-0', className)} {...a11y}>
      <span
        className={clsx(
          'grid place-items-center overflow-hidden font-semibold select-none',
          BOX[size],
          shape === 'circle' ? 'rounded-full' : 'rounded-lg',
          !showImg && HUES[hash(name) % HUES.length],
        )}
      >
        {showImg ? <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(true)} loading="lazy" /> : initialsOf(name) || '?'}
      </span>
      {status && (
        <span
          className={clsx(
            'absolute right-0 bottom-0 block rounded-full ring-2 ring-card',
            size === 'xs' || size === 'sm' ? 'size-2' : 'size-2.5',
            status === 'online' ? 'bg-success' : status === 'away' ? 'bg-warning' : 'bg-neutral',
          )}
        />
      )}
    </span>
  );
};
