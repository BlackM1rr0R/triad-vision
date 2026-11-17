import clsx from 'clsx';
import { Lock } from 'lucide-react';
import type { DoorKind } from '@/lib/advent/doors';

/*
 * Self-drawn SVG art of the Advent calendar (/advent-calendar): the snowy night town above the doors and the
 * doors themselves. Colours are fixed (a night scene reads well in light and dark mode); the door swing is a CSS
 * 3D rotation that reduced-motion users get without animation.
 */

const DOOR_COLORS = ['#b42318', '#166534', '#1e3a8a', '#9a3412', '#0f766e', '#7e22ce'] as const;
const KIND_GLYPH: Record<DoorKind, string> = { tradition: '★', phrase: '“ ”', quiz: '?', tip: '!' };

/** Night town with snow, lit windows, a fir tree and the moon. Decorative. */
export const AdventScene = () => (
  <svg viewBox="0 0 800 170" className="block h-auto w-full" aria-hidden focusable="false">
    <defs>
      <radialGradient id="adv-moon" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fff7d6" />
        <stop offset="1" stopColor="#fde68a" />
      </radialGradient>
    </defs>
    <circle cx="690" cy="42" r="22" fill="url(#adv-moon)" opacity="0.95" />
    <circle cx="700" cy="36" r="20" fill="#16365a" opacity="0.35" />
    {[
      [60, 30], [140, 18], [230, 46], [320, 22], [410, 40], [500, 16], [580, 50], [760, 70], [30, 80], [620, 92],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} fill="#fff" opacity={0.85} />
    ))}
    {/* houses */}
    <g>
      <path d="M40 150 V105 L80 75 L120 105 V150 Z" fill="#284b72" />
      <path d="M34 108 L80 70 L126 108" fill="none" stroke="#f8fafc" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="60" y="115" width="14" height="14" rx="2" fill="#fcd34d" />
      <rect x="88" y="115" width="14" height="14" rx="2" fill="#fcd34d" opacity="0.8" />
      <path d="M150 150 V95 L200 60 L250 95 V150 Z" fill="#1f3d61" />
      <path d="M143 99 L200 54 L257 99" fill="none" stroke="#f8fafc" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="172" y="104" width="16" height="16" rx="2" fill="#fcd34d" />
      <rect x="212" y="104" width="16" height="16" rx="2" fill="#fde68a" opacity="0.7" />
      <rect x="191" y="126" width="18" height="24" rx="2" fill="#7c2d12" />
      <path d="M520 150 V100 L565 70 L610 100 V150 Z" fill="#284b72" />
      <path d="M514 103 L565 64 L616 103" fill="none" stroke="#f8fafc" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="542" y="110" width="14" height="14" rx="2" fill="#fcd34d" />
      <rect x="574" y="110" width="14" height="14" rx="2" fill="#fcd34d" />
      {/* Schwibbogen in a window */}
      <path d="M543 124 a7 6 0 0 1 12 0" fill="none" stroke="#fde68a" strokeWidth="1.5" />
    </g>
    {/* fir tree with lights */}
    <g>
      <path d="M380 150 L380 140" stroke="#5b3a1a" strokeWidth="8" />
      <path d="M380 40 L420 100 H400 L432 140 H328 L360 100 H340 Z" fill="#14532d" />
      <path d="M342 100 L418 100 M334 140" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      {[
        [372, 78, '#fca5a5'], [392, 90, '#fde68a'], [362, 112, '#93c5fd'], [398, 118, '#fca5a5'], [380, 130, '#fde68a'], [352, 132, '#86efac'],
      ].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r="3.2" fill={c as string} />
      ))}
      <path d="M380 30 l3.5 7 7.5 1 -5.5 5 1.5 7.5 -7 -3.8 -7 3.8 1.5 -7.5 -5.5 -5 7.5 -1 z" fill="#fcd34d" />
    </g>
    {/* snow hills */}
    <path d="M0 150 Q120 128 240 148 T480 146 T800 144 V170 H0 Z" fill="#f1f5f9" />
    <path d="M0 160 Q200 146 400 160 T800 158 V170 H0 Z" fill="#e2e8f0" />
  </svg>
);

/** One calendar door: the coloured door (swings open) over its inside (kind glyph). */
export const DoorArt = ({ day, kind, open, locked, today }: { day: number; kind: DoorKind; open: boolean; locked: boolean; today: boolean }) => {
  const color = DOOR_COLORS[(day * 7) % DOOR_COLORS.length];
  return (
    <span className="relative block size-full [perspective:700px]">
      {/* inside */}
      <span className="absolute inset-0 grid place-items-center rounded-xl bg-[#fff8e7] text-2xl font-bold text-[#9a3412] shadow-inner sm:text-3xl" aria-hidden>
        <span className="flex flex-col items-center leading-none">
          <span>{KIND_GLYPH[kind]}</span>
          <span className="mt-1 text-xs font-semibold text-[#7c2d12]/70">{day}</span>
        </span>
      </span>
      {/* door */}
      <span
        className={clsx(
          'absolute inset-0 origin-left rounded-xl transition-transform duration-700 ease-out [backface-visibility:hidden] [transform-style:preserve-3d] motion-reduce:transition-none',
          open && '[transform:rotateY(-108deg)]',
        )}
        aria-hidden
      >
        <svg viewBox="0 0 60 80" className="block size-full drop-shadow-md" focusable="false">
          <rect x="1" y="1" width="58" height="78" rx="7" fill={color} />
          <rect x="7" y="9" width="46" height="62" rx="4" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1.5" />
          {/* snow cap */}
          <path d="M1 9 Q1 1 9 1 H51 Q59 1 59 9 Q52 13 45 9 Q38 14 30 9 Q22 14 15 9 Q8 13 1 9 Z" fill="#f8fafc" />
          <text x="30" y="50" textAnchor="middle" fontSize="24" fontWeight="700" fill="#ffffff" fontFamily="Onest, system-ui, sans-serif">
            {day}
          </text>
          <circle cx="50" cy="44" r="2.4" fill="#fcd34d" />
          {/* little star */}
          <path d="M30 18 l1.6 3.2 3.5.5 -2.5 2.4 .6 3.5 -3.2 -1.7 -3.2 1.7 .6 -3.5 -2.5 -2.4 3.5 -.5 z" fill="#fcd34d" opacity="0.9" />
        </svg>
        {locked && (
          <span className="absolute bottom-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-black/35 text-white">
            <Lock className="size-3" />
          </span>
        )}
      </span>
      {today && !open && <span className="pointer-events-none absolute -inset-1 animate-pulse rounded-2xl ring-2 ring-[#fcd34d] motion-reduce:animate-none" aria-hidden />}
    </span>
  );
};
