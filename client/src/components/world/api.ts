import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PublicMap } from '@/components/growth/api';

/** Data of the home "world" pieces (globe, Baku ↔ Berlin clock). */

/**
 * Placement map aggregates for the globe — GET /growth/map, the same privacy-thresholded data as /map (cities
 * with fewer than 3 workers never leave the server). Own query key so the server render ships it
 * (entry-server.tsx SSR_QUERY_KEYS 'globe-map'): the city list and the static globe are in the first HTML.
 */
export const useGlobeMap = () =>
  useQuery({ queryKey: ['globe-map'], queryFn: async () => (await api.get<PublicMap>('/growth/map')).data, staleTime: 10 * 60 * 1000 });

export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface CurrentWeather {
  temp: number | null;
  code: number;
  icon: WeatherIcon;
  isDay: boolean;
  wind: number | null;
  fetchedAt: string;
}

export interface ClockWeather {
  cities: { key: 'baku' | 'berlin'; timeZone: string; weather: CurrentWeather | null }[];
  source: 'open-meteo';
}

/** GET /life/clock-weather: current weather of Baku and Berlin (Open-Meteo via our server, cached 30 min). */
export const useClockWeather = (enabled = true) =>
  useQuery({
    queryKey: ['clock-weather'],
    queryFn: async () => (await api.get<ClockWeather>('/life/clock-weather')).data,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
    enabled,
  });
