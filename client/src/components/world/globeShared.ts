import { cityCoords } from '@/components/about/geo';
import type { MapCity } from '@/components/growth/api';
import type { LatLng } from './globeMath';

/** A city of the placement map with coordinates (admin-entered lat/lng, else the built-in city table). */
export interface GlobeCity {
  city: string;
  workers: number;
  ll: LatLng;
}

export const placeCities = (cities: MapCity[]): { placed: GlobeCity[]; all: MapCity[] } => {
  const placed: GlobeCity[] = [];
  for (const c of cities) {
    const lngLat = c.lat != null && c.lng != null ? ([c.lng, c.lat] as [number, number]) : cityCoords(c.city);
    if (lngLat) placed.push({ city: c.city, workers: c.workers, ll: [lngLat[1], lngLat[0]] });
  }
  placed.sort((a, b) => b.workers - a.workers || a.city.localeCompare(b.city));
  return { placed, all: [...cities].sort((a, b) => b.workers - a.workers || a.city.localeCompare(b.city)) };
};

/** Marker radius in the 400-unit static globe, by share of the biggest city. */
export const markerRadius = (workers: number, max: number) => 3 + 4 * Math.sqrt(workers / Math.max(1, max));

/** Text of a marker label: "Berlin 12". */
export const labelText = (c: { city: string; workers: number }) => `${c.city} ${c.workers}`;

/** Approximate width of a label pill in px at a 10.5 px bold font. */
export const pillWidth = (text: string) => Math.round(12 + 6.3 * text.length);

/**
 * Greedy label placement: biggest cities first, a label is shown only where it does not overlap one already
 * shown (Germany is small on a globe — the list next to it always has every city).
 */
export const placeLabels = <T extends { x: number; y: number; w: number; h: number }>(items: T[], gap = 2): T[] => {
  const shown: T[] = [];
  for (const it of items) {
    const hit = shown.some((s) => it.x < s.x + s.w + gap && it.x + it.w + gap > s.x && it.y < s.y + s.h + gap && it.y + it.h + gap > s.y);
    if (!hit) shown.push(it);
  }
  return shown;
};

/** Colours of the globe panel (always the dark "night sky" panel, in both themes). */
export const GLOBE_COLORS = {
  marker: '#f2b52e',
  baku: '#ffffff',
  arc: '#f2b52e',
  land: 'rgba(186, 206, 243, 0.32)',
  grid: 'rgba(186, 206, 243, 0.14)',
};
