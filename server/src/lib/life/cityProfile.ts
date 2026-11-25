import { cityPoint, currentWeatherAt, type CurrentWeather } from '../clientPlus/weather.js';

/**
 * "My Germany" card of the client cabinet: the destination city's current weather (Open-Meteo, shared cache of the
 * home clock) and an APPROXIMATE direct flight time from Baku. Time zone difference and the Maps links are
 * computed in the browser.
 */
export const BAKU_POINT = { lat: 40.4093, lng: 49.8671 } as const;

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km (haversine). */
export const greatCircleKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Rough direct flight time: distance at ~800 km/h plus 30 minutes for take-off and landing; rounded to 5 minutes. */
export const flightMinutes = (km: number): number => Math.round(((km / 800) * 60 + 30) / 5) * 5;

export interface CityProfile {
  city: string;
  lat: number;
  lng: number;
  weather: CurrentWeather | null;
  flight: { km: number; minutes: number };
}

export const cityProfile = async (rawCity: string): Promise<CityProfile | null> => {
  const p = await cityPoint(rawCity);
  if (!p) return null;
  const km = Math.round(greatCircleKm(BAKU_POINT, p) / 10) * 10;
  const weather = await currentWeatherAt(p.lat, p.lng);
  return { city: p.name, lat: Math.round(p.lat * 1e4) / 1e4, lng: Math.round(p.lng * 1e4) / 1e4, weather, flight: { km, minutes: flightMinutes(km) } };
};
