import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { openVacancyWhere } from '../vacancies.js';
import { publicMap } from './map.js';

/**
 * Home counters: workers placed (the public placement map total: approved / arrived cases + admin-entered past placements,
 * cities with at least 3 workers only, same switch as the map) and the open vacancies people can apply to now.
 * Counts only, no personal data. `placed` is null when the map is off or has nothing to show.
 */
export interface HomeStats {
  placed: number | null;
  vacancies: number;
}

export const publicHomeStats = (): Promise<HomeStats> =>
  cached('growth:home-stats', async () => {
    const [map, vacancies] = await Promise.all([publicMap(), prisma.vacancy.count({ where: openVacancyWhere() })]);
    return { placed: map.enabled && map.total > 0 ? map.total : null, vacancies };
  });
