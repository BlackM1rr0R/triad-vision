import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { can } from '../../lib/access/index.js';
import { PROFESSION_KEYS } from '../../lib/matching.js';
import { waitlistCsv, waitlistStats } from '../../lib/jobAlerts/waitlist.js';

/**
 * Admin: vacancy waitlist (demand signal) — mounted at /api/admin/vacancies/waitlist (lib/jobAlerts/waitlist.ts).
 * Access Center: the vacancies router's area (employers) — view for the counts, export for the CSV
 * (lib/access/routeMap.ts: *.csv = export). Contacts in the CSV are plain only with the "clients" export permission,
 * masked otherwise; every export is audited.
 *   GET /               counts per profession (active / pending / accounts / last 30 days / top places)
 *   GET /export.csv     the entries (?profession=)
 */
export const adminVacancyWaitlistRouter = Router();

adminVacancyWaitlistRouter.get('/', async (_req, res) => {
  res.json(await waitlistStats());
});

adminVacancyWaitlistRouter.get('/export.csv', async (req, res) => {
  const q = parse(z.object({ profession: z.enum(PROFESSION_KEYS as [string, ...string[]]).optional() }), req.query);
  const plainContacts = await can(req.user, 'clients', 'export');
  const { csv, count } = await waitlistCsv({ plainContacts, profession: q.profession ?? null });
  await audit(req, 'VACANCY_WAITLIST_EXPORTED', undefined, { count, profession: q.profession ?? null, plainContacts });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vacancy-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
});
