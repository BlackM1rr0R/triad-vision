import { MAX_FORECAST_DAYS, weatherFor, type WeatherDay } from '../clientPlus/weather.js';
import { climateFor, type Climate } from './climate.js';

/**
 * Weather of "My Germany day": the week forecast while the flight is at most MAX_FORECAST_DAYS (16) days away
 * (Open-Meteo, cached 3 h by lib/clientPlus/weather), else the typical climate of the departure month; the climate
 * of the current month when the forecast is unavailable. Kept free of database imports (unit-tested).
 */

/** Days of forecast shown ("current week"). */
export const FORECAST_WEEK = 7;

export type DayWeather = { mode: 'forecast'; city: string; country: string | null; days: WeatherDay[] } | ({ mode: 'climate' } & Climate);

const berlinMonth = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', month: 'numeric' }).format(d));

export const dayWeather = async (city: string | null, days: number, departure: Date, now = new Date()): Promise<DayWeather | null> => {
  if (!city) return null;
  if (days <= MAX_FORECAST_DAYS) {
    const w = await weatherFor(city, FORECAST_WEEK);
    if (w?.days.length) return { mode: 'forecast', city: w.city, country: w.country, days: w.days };
    return { mode: 'climate', ...climateFor(city, berlinMonth(now)) };
  }
  return { mode: 'climate', ...climateFor(city, berlinMonth(departure)) };
};
