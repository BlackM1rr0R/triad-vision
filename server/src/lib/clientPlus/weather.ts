import { config } from '../../config.js';

/**
 * Weather of the client's destination city for the portal countdown cards (Open-Meteo: free, no API key).
 * The SERVER calls Open-Meteo (geocoding → daily forecast) so the browser only talks to our API and the CSP
 * stays unchanged. Results are cached in memory for 3 hours per city (failures for 15 minutes, so a dead
 * upstream is not hammered). Tests replace the fetcher (setWeatherFetch); in the test env the default does no
 * network request at all.
 */

export const WEATHER_TTL_MS = 3 * 60 * 60 * 1000;
const FAIL_TTL_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 6_000;
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Our icon set (the client maps it to lucide icons); derived from the WMO weather code. */
export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface WeatherDay {
  date: string; // YYYY-MM-DD (local date of the city)
  code: number;
  icon: WeatherIcon;
  max: number | null;
  min: number | null;
  rain: number | null; // max precipitation probability, %
}

export interface Weather {
  city: string;
  country: string | null;
  days: WeatherDay[]; // today + next 3 days
  fetchedAt: string;
}

type Fetcher = (url: string) => Promise<unknown>;

const defaultFetch: Fetcher = async (url) => {
  if (config.isTest) throw new Error('NO_NETWORK_IN_TESTS');
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
};

let fetcher: Fetcher = defaultFetch;
/** Tests: a fake Open-Meteo; null restores the real one. Also clears the cache. */
export const setWeatherFetch = (fn: Fetcher | null) => {
  fetcher = fn ?? defaultFetch;
  cache.clear();
};

const cache = new Map<string, { at: number; ttl: number; value: Weather | null }>();
const inflight = new Map<string, Promise<Weather | null>>();

export const iconFor = (code: number): WeatherIcon => {
  if (code === 0) return 'sun';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

/** City names as staff / clients type them: "Berlin (Mitte)", "München, Bayern" → "Berlin", "München". */
export const cleanCity = (raw: string | null | undefined) => {
  const c = (raw ?? '').replace(/\(.*?\)/g, '').split(/[,/;]/)[0].trim();
  return c.length >= 2 && c.length <= 80 ? c : null;
};

const load = async (city: string): Promise<Weather | null> => {
  const geo = (await fetcher(`${GEO_URL}?name=${encodeURIComponent(city)}&count=5&language=de&format=json`)) as {
    results?: { name: string; latitude: number; longitude: number; country_code?: string }[];
  };
  // Destinations are in Germany: prefer a German match, else the first one.
  const hit = geo.results?.find((r) => r.country_code === 'DE') ?? geo.results?.[0];
  if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null;
  const q = new URLSearchParams({
    latitude: hit.latitude.toFixed(4),
    longitude: hit.longitude.toFixed(4),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '4',
  });
  const fc = (await fetcher(`${FORECAST_URL}?${q}`)) as {
    daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
  };
  const d = fc.daily;
  if (!d?.time?.length) return null;
  const days = d.time.slice(0, 4).map((date, i) => {
    const code = num(d.weather_code?.[i]) ?? 3;
    return { date, code, icon: iconFor(code), max: num(d.temperature_2m_max?.[i]), min: num(d.temperature_2m_min?.[i]), rain: num(d.precipitation_probability_max?.[i]) };
  });
  return { city: hit.name, country: hit.country_code ?? null, days, fetchedAt: new Date().toISOString() };
};

/** Forecast for a city (today + 3 days), cached; null when unknown or Open-Meteo is unreachable. */
export const weatherFor = async (rawCity: string | null | undefined): Promise<Weather | null> => {
  const city = cleanCity(rawCity);
  if (!city) return null;
  const key = city.toLocaleLowerCase('de');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = load(city)
    .then((value) => {
      cache.set(key, { at: Date.now(), ttl: value ? WEATHER_TTL_MS : FAIL_TTL_MS, value });
      return value;
    })
    .catch(() => {
      cache.set(key, { at: Date.now(), ttl: FAIL_TTL_MS, value: null });
      return null;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  // Keep the map bounded (a few hundred destination cities at most).
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return p;
};
