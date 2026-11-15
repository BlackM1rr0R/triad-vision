import { currentWeatherAt, type CurrentWeather } from '../clientPlus/weather.js';

/**
 * Home page "Baku ↔ Germany" block: current weather in Baku and Berlin (Open-Meteo, free, no key). The browser
 * shows the clocks itself (Intl, time zones); the server only adds the weather, fetched by the shared
 * Open-Meteo client (cached 30 minutes per city, failures 15 minutes), so visitors never call Open-Meteo.
 */
export const TWIN_CITIES = [
  { key: 'baku', timeZone: 'Asia/Baku', lat: 40.4093, lng: 49.8671 },
  { key: 'berlin', timeZone: 'Europe/Berlin', lat: 52.52, lng: 13.405 },
] as const;

export type TwinCityKey = (typeof TWIN_CITIES)[number]['key'];

export interface ClockWeather {
  cities: { key: TwinCityKey; timeZone: string; weather: CurrentWeather | null }[];
  source: 'open-meteo';
}

export const clockWeather = async (): Promise<ClockWeather> => {
  const weather = await Promise.all(TWIN_CITIES.map((c) => currentWeatherAt(c.lat, c.lng)));
  return {
    cities: TWIN_CITIES.map((c, i) => ({ key: c.key, timeZone: c.timeZone, weather: weather[i] })),
    source: 'open-meteo',
  };
};
