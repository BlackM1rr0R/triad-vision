import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { openVacancyWhere } from '../vacancies.js';
import { placesFor } from '../vacancyPlaces/service.js';
import { aggregateVacancyCities } from './vacancyCities.js';

/**
 * Public "active vacancies per city" layer of the placement map: open vacancies (lib/vacancies openVacancyWhere:
 * status OPEN, closing date not passed) that still have a free place (lib/vacancyPlaces), grouped by city with
 * the salary range. Deactivated / expired / full ones are left out; no employer data leaves the server.
 */
export const publicVacancyMap = () =>
  cached('growth:vacancyMap', async () => {
    const rows = await prisma.vacancy.findMany({
      where: { ...openVacancyWhere(), city: { not: null } },
      select: { id: true, city: true, salaryMin: true, salaryMax: true, positions: true, filledAdjustment: true },
      take: 5000,
    });
    const places = await placesFor(rows);
    const open = rows.filter((v) => (places.get(v.id)?.free ?? 0) > 0);
    const cities = aggregateVacancyCities(open);
    return { cities, total: cities.reduce((a, c) => a + c.count, 0) };
  });
