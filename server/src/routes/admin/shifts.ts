import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { isDayKey } from '../../lib/shifts/coverage.js';
import {
  calendar,
  copyWeek,
  copyWeekSchema,
  coverageSchema,
  createShift,
  deleteShift,
  readCoverage,
  repeatSchema,
  repeatWeek,
  saveCoverage,
  shiftPatchSchema,
  shiftSchema,
  updateShift,
} from '../../lib/shifts/service.js';

/**
 * Team calendar — /api/admin/shifts (STAFF+ read; changes ADMIN+).
 *
 *   GET    /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD   people, shifts, leave, handovers, coverage per day (≤ 62 days)
 *   GET    /coverage · PUT                          coverage rule { requireOffice, requireOnCall, weekdays }
 *   POST   /                                        new shift { userId, date, startMin, endMin, kind, note }
 *   PATCH  /:id · DELETE /:id
 *   POST   /copy-week                               { from, to, userIds?, replace? } (any day of each week)
 *   POST   /repeat                                  { week, weeks, userIds?, replace? } pattern week → next n weeks
 */
export const adminShiftsRouter = Router();
const admin = requireMinRole('ADMIN');

const rangeQuery = z.object({ from: z.string().refine(isDayKey, 'INVALID_DAY'), to: z.string().refine(isDayKey, 'INVALID_DAY') });

adminShiftsRouter.get('/calendar', async (req, res) => {
  const q = parse(rangeQuery, req.query);
  if (q.to < q.from) throw badRequest('INVALID_RANGE');
  res.json(await calendar(q.from, q.to));
});

adminShiftsRouter.get('/coverage', async (_req, res) => {
  res.json({ config: await readCoverage() });
});

adminShiftsRouter.put('/coverage', admin, async (req, res) => {
  const config = await saveCoverage(parse(coverageSchema, req.body));
  void audit(req, 'SHIFT_COVERAGE_UPDATED', 'setting:shiftCoverage', config as unknown as Prisma.InputJsonValue);
  res.json({ config });
});

adminShiftsRouter.post('/copy-week', admin, async (req, res) => {
  const result = await copyWeek(parse(copyWeekSchema, req.body), req.user!.id);
  void audit(req, 'SHIFTS_WEEK_COPIED', undefined, result);
  res.json(result);
});

adminShiftsRouter.post('/repeat', admin, async (req, res) => {
  const b = parse(repeatSchema, req.body);
  const result = await repeatWeek(b, req.user!.id);
  void audit(req, 'SHIFTS_PATTERN_REPEATED', undefined, { ...result, week: b.week, weeks: b.weeks });
  res.json(result);
});

adminShiftsRouter.post('/', admin, async (req, res) => {
  const shift = await createShift(parse(shiftSchema, req.body), req.user!.id);
  void audit(req, 'SHIFT_CREATED', shift.id, { userId: shift.userId, date: shift.date, kind: shift.kind });
  res.status(201).json({ shift });
});

adminShiftsRouter.patch('/:id', admin, async (req, res) => {
  const shift = await updateShift(String(req.params.id), parse(shiftPatchSchema, req.body));
  void audit(req, 'SHIFT_UPDATED', shift.id, { userId: shift.userId, date: shift.date, kind: shift.kind });
  res.json({ shift });
});

adminShiftsRouter.delete('/:id', admin, async (req, res) => {
  const shift = await deleteShift(String(req.params.id));
  void audit(req, 'SHIFT_DELETED', shift.id, { userId: shift.userId, date: shift.date });
  res.json({ ok: true });
});
