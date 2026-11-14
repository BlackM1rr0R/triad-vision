import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notFound, parse } from '../../lib/http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { assignSuggestions, workloadBoard } from '../../lib/workload.js';

/**
 * Team workload board — mounted at /api/admin/workload (STAFF+ via the admin router).
 *
 *   GET /?role=STAFF|ADMIN|SUPER_ADMIN   ADMIN+: every staff member + team totals; STAFF: only their own row
 *                                        (like KPI: own card for STAFF, the team for ADMIN+)
 *   GET /suggest?caseId=                 who to assign: eligible staff by weighted load (lib/workload). Every staff
 *                                        role may assign a case, so every role gets the suggestion; the load
 *                                        numbers of colleagues are only included for ADMIN+.
 */
export const adminWorkloadRouter = Router();

adminWorkloadRouter.get('/', async (req, res) => {
  const q = parse(z.object({ role: z.enum(['STAFF', 'ADMIN', 'SUPER_ADMIN']).optional() }), req.query);
  const admin = hasMinRole(req.user!.role, 'ADMIN');
  const board = await workloadBoard({ role: admin ? q.role : undefined });
  if (admin) {
    res.json({ scope: 'team', ...board });
    return;
  }
  const mine = board.rows.filter((r) => r.id === req.user!.id);
  res.json({ scope: 'self', rows: mine, week: board.week });
});

adminWorkloadRouter.get('/suggest', async (req, res) => {
  const q = parse(z.object({ caseId: z.string().trim().min(1).max(40).optional() }), req.query);
  if (q.caseId && !(await prisma.case.count({ where: { id: q.caseId } }))) throw notFound('CASE_NOT_FOUND');
  const { suggested, staff } = await assignSuggestions(q.caseId ?? null);
  const admin = hasMinRole(req.user!.role, 'ADMIN');
  const strip = <T extends { open: number; weighted: number; capacityPct: number }>(s: T) => (admin ? s : { ...s, open: undefined, weighted: undefined, capacityPct: undefined });
  res.json({ suggested: suggested ? strip(suggested) : null, staff: staff.map(strip) });
});
