import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'framer-motion';
import clsx from 'clsx';
import { GERMANY, cityCoords, makeProjection } from '@/components/about/geo';
import type { Office, Partner } from '@/lib/types';

export type CityGroup = { city: string; partners: Partner[]; x: number; y: number };

const proj = makeProjection({ w: 5.6, e: 15.3, s: 47.1, n: 55.2 }, 420, 14);

/** Groups partners by their German city (only cities we have coordinates for). */
export const useCityGroups = (partners: Partner[]) =>
  useMemo(() => {
    const map = new Map<string, CityGroup>();
    const unlocated: Partner[] = [];
    for (const p of partners) {
      const c = cityCoords(p.city);
      if (!c || !p.city) {
        unlocated.push(p);
        continue;
      }
      const key = p.city.trim();
      const [x, y] = proj.project(c);
      const g = map.get(key) ?? { city: key, partners: [], x, y };
      g.partners.push(p);
      map.set(key, g);
    }
    return { groups: [...map.values()].sort((a, b) => a.y - b.y), unlocated };
  }, [partners]);

/** Simplified map of Germany with clickable partner-city pins and the Triad Vision office in Germany. */
export const GermanyMap = ({
  groups,
  office,
  selected,
  onSelect,
}: {
  groups: CityGroup[];
  office?: Office;
  selected: string | null;
  onSelect: (city: string) => void;
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: '-60px' });
  const officeXY = office ? proj.project([office.lng, office.lat]) : null;

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${proj.width} ${proj.height}`} className="mx-auto w-full max-w-[460px]" role="group" aria-label={t('partnersPage.map.label')}>
        <defs>
          <pattern id="tv-de-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="var(--ill-line)" />
          </pattern>
          <clipPath id="tv-de-clip">
            <path d={proj.path(GERMANY)} />
          </clipPath>
        </defs>
        <path d={proj.path(GERMANY)} fill="var(--ill-sky)" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinejoin="round" />
        <rect width={proj.width} height={proj.height} fill="url(#tv-de-grid)" clipPath="url(#tv-de-clip)" />

        {officeXY && (
          <g aria-hidden>
            <rect x={officeXY[0] - 8} y={officeXY[1] - 8} width="16" height="16" rx="4" transform={`rotate(45 ${officeXY[0]} ${officeXY[1]})`} fill="var(--color-ink)" />
            <circle cx={officeXY[0]} cy={officeXY[1]} r="3" fill="var(--color-highlight)" />
          </g>
        )}

        {groups.map((g, i) => {
          const isSel = selected === g.city;
          const r = 7 + Math.min(4, g.partners.length - 1) * 2.5;
          const labelLeft = g.x > proj.width * 0.62;
          return (
            <g
              key={g.city}
              role="button"
              tabIndex={0}
              aria-pressed={isSel}
              aria-label={`${g.city}: ${g.partners.map((p) => p.name).join(', ')}`}
              onClick={() => onSelect(g.city)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(g.city);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-focus"
              style={{ opacity: on ? 1 : 0, transition: `opacity .5s ease ${0.2 + i * 0.08}s` }}
            >
              <circle cx={g.x} cy={g.y} r={r + 9} fill={isSel ? 'rgba(232,163,23,0.28)' : 'rgba(27,45,92,0.10)'} stroke="transparent" strokeWidth="3" />
              <circle cx={g.x} cy={g.y} r={r} fill={isSel ? 'var(--color-highlight)' : 'var(--color-primary)'} stroke="var(--color-card)" strokeWidth="2.5" />
              {g.partners.length > 1 && (
                <text x={g.x} y={g.y + 3.5} textAnchor="middle" className={clsx('pointer-events-none text-[10px] font-bold', isSel ? 'fill-highlight-contrast' : 'fill-primary-contrast')}>
                  {g.partners.length}
                </text>
              )}
              <text
                x={labelLeft ? g.x - r - 6 : g.x + r + 6}
                y={g.y + 4}
                textAnchor={labelLeft ? 'end' : 'start'}
                className={isSel ? 'fill-ink text-[12px] font-semibold' : 'fill-ink/75 text-[11px] font-semibold'}
                style={{ paintOrder: 'stroke', stroke: 'var(--color-card)', strokeWidth: 4, strokeLinejoin: 'round' }}
              >
                {g.city}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-full border-2 border-card bg-primary shadow-[var(--tv-shadow-card)]" /> {t('partnersPage.map.partner')}
        </span>
        {officeXY && (
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rotate-45 rounded-[2px] bg-ink" /> {t('partnersPage.map.office')}
          </span>
        )}
      </div>
    </div>
  );
};
