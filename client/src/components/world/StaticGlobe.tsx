import { useId, useMemo } from 'react';
import { AZERBAIJAN, GERMANY, NAKHCHIVAN } from '@/components/about/geo';
import { arcPoints, BAKU, graticuleLine, HOME_VIEW, outlinePoints, project, SPHERE_R, visiblePath } from './globeMath';
import { GLOBE_COLORS, labelText, markerRadius, pillWidth, placeLabels, type GlobeCity } from './globeShared';

const S = 400;
const C = S / 2;
const R = SPHERE_R * C;

/**
 * The globe drawn as SVG from the same projection as the WebGL globe (globeMath.ts): graticule, Germany and
 * Azerbaijan, arcs from Baku and the city markers with their worker counts. The server renders it, and it is what
 * visitors with reduced motion or without WebGL see; it is also the poster under the canvas while that loads.
 * Deterministic (fixed view, no time or chance), so the visual regression shots stay stable.
 */
export const StaticGlobe = ({ cities, bakuLabel, label }: { cities: GlobeCity[]; bakuLabel: string; label: string }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { phi, theta } = HOME_VIEW;
  const art = useMemo(() => {
    const grid: string[] = [];
    for (let lat = -60; lat <= 80; lat += 20) grid.push(visiblePath(graticuleLine('lat', lat), phi, theta, S));
    for (let lng = -180; lng < 180; lng += 20) grid.push(visiblePath(graticuleLine('lng', lng), phi, theta, S));
    const land = [GERMANY, AZERBAIJAN, NAKHCHIVAN].map((ring) => visiblePath(outlinePoints(ring), phi, theta, S, true));
    const max = Math.max(1, ...cities.map((c) => c.workers));
    const arcs = cities.map((c) => visiblePath(arcPoints(BAKU, c.ll, 0.14), phi, theta, S));
    const dots = cities
      .map((c) => {
        const p = project(c.ll, phi, theta);
        return { ...c, x: p.x * S, y: p.y * S, r: markerRadius(c.workers, max), front: p.z >= 0 };
      })
      .filter((d) => d.front);
    const labels = placeLabels(
      dots.map((d) => {
        const text = labelText(d);
        const w = pillWidth(text);
        return { key: d.city, text, x: d.x + d.r + 1, y: d.y - d.r - 15, w, h: 15 };
      }),
    );
    const baku = project(BAKU, phi, theta);
    return { grid, land, arcs, dots, labels, baku: { x: baku.x * S, y: baku.y * S } };
  }, [cities, phi, theta]);

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="absolute inset-0 size-full" role="img" aria-label={label}>
      <defs>
        <radialGradient id={`g${uid}`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#24427a" />
          <stop offset="70%" stopColor="#11244b" />
          <stop offset="100%" stopColor="#0a1733" />
        </radialGradient>
        <radialGradient id={`h${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor="#6ea2ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6ea2ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R * 1.18} fill={`url(#h${uid})`} />
      <circle cx={C} cy={C} r={R} fill={`url(#g${uid})`} />
      <g fill="none" stroke={GLOBE_COLORS.grid} strokeWidth={0.8}>
        {art.grid.map((d, i) => (d ? <path key={i} d={d} /> : null))}
      </g>
      <g fill={GLOBE_COLORS.land} stroke="rgba(186, 206, 243, 0.55)" strokeWidth={0.6} strokeLinejoin="round">
        {art.land.map((d, i) => (d ? <path key={i} d={d} /> : null))}
      </g>
      <g fill="none" stroke={GLOBE_COLORS.arc} strokeWidth={1.4} strokeLinecap="round" opacity={0.85}>
        {art.arcs.map((d, i) => (d ? <path key={i} d={d} /> : null))}
      </g>
      {art.dots.map((d) => (
        <g key={d.city}>
          <circle cx={d.x} cy={d.y} r={d.r + 3} fill={GLOBE_COLORS.marker} opacity={0.25} />
          <circle cx={d.x} cy={d.y} r={d.r} fill={GLOBE_COLORS.marker} stroke="#0a1733" strokeWidth={1} />
        </g>
      ))}
      {art.labels.map((l) => (
        <g key={l.key} aria-hidden>
          <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={7.5} fill="#ffffff" opacity={0.95} />
          <text x={l.x + l.w / 2} y={l.y + 11} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#0b1f44">
            {l.text}
          </text>
        </g>
      ))}
      <circle cx={art.baku.x} cy={art.baku.y} r={6.5} fill={GLOBE_COLORS.baku} opacity={0.3} />
      <circle cx={art.baku.x} cy={art.baku.y} r={4} fill={GLOBE_COLORS.baku} />
      <text x={art.baku.x} y={art.baku.y + 17} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff" aria-hidden>
        {bakuLabel}
      </text>
    </svg>
  );
};
