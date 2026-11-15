import { cleanCity } from '../clientPlus/weather.js';

/**
 * Typical climate of a German city for a month — "My Germany day" shows it when the departure is further away
 * than the forecast horizon (Open-Meteo: 16 days) or when the forecast is unavailable.
 *
 * Mean daily maximum / minimum in °C, rounded, from the DWD 1991–2020 climate normals of the main station of each
 * city (as published in the cities' climate tables). Cities that are not listed use the regional profile they are
 * closest to by name match, else the "Germany" profile (mean of the listed stations). Approximate by design: the
 * card says "typical", never "forecast".
 */

type Month = [max: number, min: number];
type Profile = readonly Month[]; // 12 entries, January first

const P = (max: number[], min: number[]): Profile => max.map((m, i) => [m, min[i]] as Month);

const BERLIN = P([4, 5, 9, 15, 20, 23, 25, 25, 20, 14, 8, 4], [-2, -1, 1, 5, 9, 13, 15, 14, 11, 7, 3, 0]);
const HAMBURG = P([4, 5, 9, 14, 18, 21, 23, 23, 19, 14, 8, 5], [-1, -1, 1, 4, 8, 11, 13, 13, 10, 7, 3, 0]);
const MUENCHEN = P([3, 5, 9, 14, 19, 22, 24, 24, 19, 14, 8, 4], [-4, -3, 1, 4, 8, 12, 14, 13, 10, 6, 1, -2]);
const KOELN = P([6, 7, 11, 15, 19, 22, 24, 24, 20, 15, 9, 6], [0, 0, 2, 5, 9, 12, 14, 14, 11, 7, 4, 1]);
const FRANKFURT = P([5, 6, 11, 16, 20, 24, 26, 26, 21, 15, 9, 5], [-1, -1, 2, 5, 9, 13, 15, 14, 11, 7, 3, 0]);
const GERMANY = P([4, 6, 10, 15, 19, 22, 24, 24, 20, 14, 8, 5], [-1, -1, 2, 5, 9, 12, 14, 14, 11, 7, 3, 0]);

/** Lower-case city name (German spelling, common transliterations) → profile. */
const CITIES: Record<string, Profile> = {
  berlin: BERLIN,
  potsdam: BERLIN,
  leipzig: BERLIN,
  dresden: BERLIN,
  magdeburg: BERLIN,
  hamburg: HAMBURG,
  bremen: HAMBURG,
  kiel: HAMBURG,
  hannover: HAMBURG,
  lübeck: HAMBURG,
  münchen: MUENCHEN,
  muenchen: MUENCHEN,
  munich: MUENCHEN,
  augsburg: MUENCHEN,
  nürnberg: MUENCHEN,
  regensburg: MUENCHEN,
  köln: KOELN,
  koeln: KOELN,
  cologne: KOELN,
  düsseldorf: KOELN,
  duesseldorf: KOELN,
  dortmund: KOELN,
  essen: KOELN,
  duisburg: KOELN,
  bonn: KOELN,
  frankfurt: FRANKFURT,
  'frankfurt am main': FRANKFURT,
  mainz: FRANKFURT,
  wiesbaden: FRANKFURT,
  mannheim: FRANKFURT,
  stuttgart: FRANKFURT,
};

export interface Climate {
  city: string | null;
  /** 1–12 */
  month: number;
  avgMax: number;
  avgMin: number;
  /** true: the city is not in the table, the Germany-wide profile is shown. */
  generic: boolean;
}

/** Typical climate of the city in the month (1–12). */
export const climateFor = (rawCity: string | null | undefined, month: number): Climate => {
  const city = cleanCity(rawCity);
  const m = Math.min(12, Math.max(1, Math.round(month)));
  const key = city?.toLocaleLowerCase('de') ?? '';
  const profile = CITIES[key] ?? CITIES[key.split(/\s+/)[0] ?? ''] ?? null;
  const [avgMax, avgMin] = (profile ?? GERMANY)[m - 1];
  return { city, month: m, avgMax, avgMin, generic: !profile };
};
