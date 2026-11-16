import { useId } from 'react';
import type { TripKind } from '@/lib/weekendTrips/data';

/**
 * Self-drawn card illustration of a day-trip destination type (no photos): a sky gradient and a simple
 * silhouette per kind. Decorative; the card title carries the meaning (the svg has role="img" + label).
 * The variant (0–3) shifts the sky colours so neighbouring cards of the same kind look different.
 */
const SKIES: [string, string][] = [
  ['#7cc4f2', '#f8e7c4'],
  ['#f6b48a', '#fbe3c3'],
  ['#93b8e8', '#e6eefc'],
  ['#b9a6e8', '#fde2d0'],
];

const GROUND: Record<TripKind, string> = {
  city: '#4b5b7a',
  castle: '#5a5f7d',
  nature: '#3f7a4d',
  lake: '#3b7a88',
  sea: '#2f6f9a',
  mountains: '#56657e',
  industrial: '#6a5a55',
  wine: '#6f4e7c',
};

const Shape = ({ kind, fill }: { kind: TripKind; fill: string }) => {
  switch (kind) {
    case 'city':
      return (
        <g fill={fill}>
          <rect x="18" y="58" width="22" height="42" />
          <rect x="44" y="44" width="16" height="56" />
          <path d="M64 100V52l10-14 10 14v48z" />
          <rect x="88" y="62" width="26" height="38" />
          <rect x="118" y="50" width="18" height="50" />
          <path d="M140 100V66h24v34z" />
          <g fill="#fff" opacity=".55">
            <rect x="23" y="66" width="4" height="5" />
            <rect x="31" y="66" width="4" height="5" />
            <rect x="93" y="70" width="4" height="5" />
            <rect x="103" y="70" width="4" height="5" />
            <rect x="122" y="58" width="4" height="5" />
          </g>
        </g>
      );
    case 'castle':
      return (
        <g fill={fill}>
          <path d="M0 100c30-16 60-22 90-22s70 8 110 22z" opacity=".55" />
          <path d="M62 100V58h8v-8h6v8h8v-8h6v8h8v-8h6v8h8v42z" />
          <path d="M54 100V46l9-14 9 14v54z" />
          <path d="M108 100V46l9-14 9 14v54z" />
          <path d="M84 100V84a6 6 0 0 1 12 0v16z" fill="#fff" opacity=".5" />
        </g>
      );
    case 'nature':
      return (
        <g fill={fill}>
          <path d="M0 100c40-22 80-26 120-18s60 10 80 18z" opacity=".6" />
          <path d="M40 92l14-34 14 34z" />
          <path d="M60 96l16-42 16 42z" />
          <path d="M120 94l12-30 12 30z" />
          <path d="M140 98l15-38 15 38z" />
          <circle cx="160" cy="26" r="10" fill="#fff6c9" />
        </g>
      );
    case 'lake':
      return (
        <g>
          <path d="M0 74c30-18 60-24 100-18s70 10 100 18v26H0z" fill={fill} opacity=".55" />
          <rect y="76" width="200" height="24" fill={fill} />
          <g stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".6">
            <path d="M24 86h22M70 92h30M130 84h26M160 94h18" />
          </g>
          <path d="M96 76l14-20v20z" fill="#fff" />
          <path d="M92 78h24l-4 5H96z" fill="#fff" opacity=".85" />
        </g>
      );
    case 'sea':
      return (
        <g>
          <rect y="70" width="200" height="30" fill={fill} />
          <path d="M0 74c12-5 22-5 34 0s22 5 34 0 22-5 34 0 22 5 34 0 22-5 34 0 20 5 30 0" stroke="#fff" strokeWidth="2.5" fill="none" opacity=".7" />
          <path d="M150 70V36l6-4 6 4v34z" fill="#fff" />
          <path d="M150 44h12v6h-12zM150 56h12v6h-12z" fill="#d6453a" />
          <path d="M0 100V88c40-6 70-6 100 0v12z" fill="#f2deb0" />
        </g>
      );
    case 'mountains':
      return (
        <g>
          <path d="M-4 100l56-70 30 34 26-40 58 76z" fill={fill} />
          <path d="M44 40l8-10 10 12-6 4-4-6zM100 32l8-8 10 14-8 2-4-6z" fill="#fff" />
          <path d="M0 100c40-12 90-14 200-4v4z" fill={fill} opacity=".6" />
        </g>
      );
    case 'industrial':
      return (
        <g fill={fill}>
          <path d="M60 100V56l14-8 14 8v44z" />
          <rect x="96" y="30" width="10" height="70" />
          <rect x="116" y="44" width="8" height="56" />
          <path d="M130 100V62h40v38z" />
          <path d="M18 100V72l12-8 12 8v28z" />
          <path d="M66 56l8-26 8 26" fill="none" stroke={fill} strokeWidth="3" />
          <circle cx="101" cy="22" r="6" fill="#fff" opacity=".6" />
          <circle cx="110" cy="14" r="5" fill="#fff" opacity=".45" />
        </g>
      );
    case 'wine':
      return (
        <g>
          <path d="M0 100V62c50-22 110-30 200-20v58z" fill={fill} opacity=".7" />
          <g stroke="#2f5d33" strokeWidth="3" strokeLinecap="round" opacity=".85">
            <path d="M20 92l40-20M30 98l50-24M50 100l60-28M80 100l60-28M110 100l60-28" />
          </g>
          <g fill="#7d3b8f">
            <circle cx="160" cy="34" r="4" />
            <circle cx="166" cy="34" r="4" />
            <circle cx="163" cy="40" r="4" />
          </g>
        </g>
      );
  }
};

export const TripArt = ({ kind, variant = 0, label }: { kind: TripKind; variant?: number; label: string }) => {
  const id = useId().replace(/:/g, '');
  const [a, b] = SKIES[Math.abs(variant) % SKIES.length];
  return (
    <svg viewBox="0 0 200 100" role="img" aria-label={label} className="block h-auto w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="200" height="100" fill={`url(#sky-${id})`} />
      <Shape kind={kind} fill={GROUND[kind]} />
    </svg>
  );
};
