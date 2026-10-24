import { AZERBAIJAN, GERMANY, NAKHCHIVAN, type LngLat } from '@/components/about/geo';
import { TURKEY, UKRAINE } from './originGeo';

/**
 * Shared geometry of the origin → Germany maps: the public "From → To" map (OriginFlowMap) and the client
 * portal journey map (components/portal/JourneyMap). Plain data and pure helpers, no React.
 */

export type MapCountry = 'AZ' | 'TR' | 'UA' | 'DE';

/** Bounding box that holds Germany and every origin country (AZ / TR / UA). */
export const ORIGIN_MAP_BOUNDS = { w: 5.4, e: 50.8, s: 35.4, n: 55.4 } as const;

export const COUNTRY_SHAPES: { code: MapCountry; rings: LngLat[][] }[] = [
  { code: 'DE', rings: [GERMANY] },
  { code: 'UA', rings: [UKRAINE] },
  { code: 'TR', rings: [TURKEY] },
  { code: 'AZ', rings: [AZERBAIJAN, NAKHCHIVAN] },
];

/** Label anchors of the countries [lng, lat]. */
export const COUNTRY_LABELS: Record<MapCountry, LngLat> = { DE: [10.3, 51.1], UA: [31.5, 49.3], TR: [34.5, 39.0], AZ: [47.6, 40.6] };

/** Destination when the German city has no known coordinates: the middle of Germany. */
export const DE_CENTRE: LngLat = [10.4, 51.2];

/** Control point of the curved arc from a to b (quadratic Bézier lifted towards the north). */
export const arcControl = (a: [number, number], b: [number, number]): [number, number] => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2 - Math.min(140, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.28),
];

/** SVG path of the curved arc from origin to destination (projected coordinates). */
export const arc = (a: [number, number], b: [number, number]) => {
  const [mx, my] = arcControl(a, b);
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
};

/** Point of the quadratic Bézier a → c → b at parameter t (0..1). */
const bezier = (a: [number, number], c: [number, number], b: [number, number], t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
};

/**
 * Points along the arc at given fractions of its LENGTH (not of the Bézier parameter), so markers placed at
 * 0.2 / 0.4 … sit evenly on the line and a stroke drawn to 40 % of its length ends exactly on the 0.4 marker.
 */
export const pointsAlongArc = (a: [number, number], b: [number, number], fractions: number[], samples = 120): [number, number][] => {
  const c = arcControl(a, b);
  const pts: [number, number][] = [];
  const cum: number[] = [0];
  for (let i = 0; i <= samples; i++) {
    pts.push(bezier(a, c, b, i / samples));
    if (i > 0) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[samples] || 1;
  return fractions.map((f) => {
    const target = Math.min(1, Math.max(0, f)) * total;
    let i = 1;
    while (i < samples && cum[i] < target) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const k = (target - cum[i - 1]) / seg;
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  });
};

/** Point-in-polygon (ray casting) on [lng, lat] rings. */
export const inRing = ([x, y]: LngLat, ring: LngLat[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
