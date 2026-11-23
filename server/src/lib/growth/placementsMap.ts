import { buildMap, getMapSettings } from './map.js';

/**
 * Admin live placement map (/admin/analytics/placements): the same real numbers as the public map — approved / arrived
 * cases by the city of their employer, the admin-entered past placements and the admin map entries — but without the
 * privacy threshold (admins see small cities too) and with the source split per city. Only counts and job titles.
 */
export const placementsMap = async () => {
  const settings = await getMapSettings();
  const { cities, minPerCity } = await buildMap({ ...settings, enabled: true }, { threshold: false });
  const rows = cities
    .map((c) => ({ cityKey: c.cityKey, city: c.city, workers: c.workers, professions: c.professions, lat: c.lat, lng: c.lng, source: c.source, computed: c.computed, past: c.past }))
    .sort((a, b) => b.workers - a.workers || a.city.localeCompare(b.city));
  return { cities: rows, total: rows.reduce((n, c) => n + c.workers, 0), minPerCity };
};
