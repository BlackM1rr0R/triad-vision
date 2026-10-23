import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import {
  ACTIVITIES,
  caseTime,
  createManual,
  currentTimer,
  deleteEntry,
  entryView,
  listEntries,
  listQuery,
  manualSchema,
  patchSchema,
  startSchema,
  startTimer,
  stopRunning,
  summarize,
  updateEntry,
  type Viewer,
} from '../../lib/timeTracking/service.js';
import { defaultRateSchema, ratesOverview, rateSchema, saveDefaultRate } from '../../lib/timeTracking/rates.js';
import { bakuDay } from '../../lib/reports/dates.js';

/**
 * Staff time tracking (mounted at /api/admin/time, STAFF+):
 *
 *   GET    /current              running timer of the signed-in user (+ idle warning; applies the 12 h auto-stop)
 *   POST   /start                start a timer (stops the running one first)   { caseId?, taskId?, activity?, note? }
 *   POST   /stop                 stop the running timer                         { note?, activity? }
 *   GET    /entries              list (STAFF: own only)                         ?from&to&userId&caseId&taskId&activity&page
 *   POST   /entries              manual entry                                   { caseId?, taskId?, date, minutes, activity, note? }
 *   PATCH  /entries/:id          own entry (ADMIN+: any)
 *   DELETE /entries/:id          own entry (ADMIN+: any)
 *   GET    /summary              per staff per week, per case, per activity     ?from&to&userId&caseId
 *   GET    /cases/:caseId        case page card
 *   GET    /rates                SUPER_ADMIN: hourly cost rates
 *   PUT    /rates/default        SUPER_ADMIN: default hourly rate               { hourly }
 *   POST   /rates                SUPER_ADMIN: a staff member's rate from a day  { userId, hourly, effectiveFrom }
 *   DELETE /rates/:id            SUPER_ADMIN
 */
export const adminTimeRouter = Router();

const viewer = (req: { user?: { id: string; role: Viewer['role']; locale: string } }): Viewer => ({ id: req.user!.id, role: req.user!.role, locale: req.user!.locale });

adminTimeRouter.get('/current', async (req, res) => {
  res.json({ ...(await currentTimer(req.user!.id)), activities: ACTIVITIES });
});

adminTimeRouter.post('/start', async (req, res) => {
  const body = parse(startSchema, req.body ?? {});
  const out = await startTimer(req.user!.id, body);
  res.status(201).json(out);
});

adminTimeRouter.post('/stop', async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(1000).nullish(), activity: z.enum(ACTIVITIES).optional() }), req.body ?? {});
  const stopped = await stopRunning(req.user!.id, { note: body.note === undefined ? undefined : body.note || null, activity: body.activity });
  if (!stopped) throw notFound('NO_RUNNING_TIMER');
  res.json({ entry: entryView(stopped) });
});

adminTimeRouter.get('/entries', async (req, res) => {
  res.json(await listEntries(viewer(req), parse(listQuery, req.query)));
});

adminTimeRouter.post('/entries', async (req, res) => {
  const body = parse(manualSchema, req.body ?? {});
  const e = await createManual(req.user!.id, body);
  await audit(req, 'TIME_ENTRY_CREATED', `time:${e.id}`, { caseId: e.caseId, minutes: e.minutes, activity: e.activity, day: body.date });
  res.status(201).json({ entry: entryView(e) });
});

adminTimeRouter.patch('/entries/:id', async (req, res) => {
  const body = parse(patchSchema, req.body ?? {});
  const { before, entry } = await updateEntry(viewer(req), String(req.params.id), body);
  await audit(req, 'TIME_ENTRY_UPDATED', `time:${entry.id}`, { owner: entry.userId, before, after: { caseId: entry.caseId, taskId: entry.taskId, activity: entry.activity, minutes: entry.minutes, day: bakuDay(entry.startedAt), note: entry.note } });
  res.json({ entry: entryView(entry) });
});

adminTimeRouter.delete('/entries/:id', async (req, res) => {
  const e = await deleteEntry(viewer(req), String(req.params.id));
  await audit(req, 'TIME_ENTRY_DELETED', `time:${e.id}`, { owner: e.userId, caseId: e.caseId, minutes: e.minutes, activity: e.activity, day: bakuDay(e.startedAt) });
  res.json({ ok: true });
});

adminTimeRouter.get('/summary', async (req, res) => {
  const { page: _page, ...q } = parse(listQuery, req.query);
  res.json(await summarize(viewer(req), q));
});

adminTimeRouter.get('/cases/:caseId', async (req, res) => {
  res.json(await caseTime(viewer(req), String(req.params.caseId)));
});

// ─── Hourly cost rates (SUPER_ADMIN) ──────────────────────────────────

adminTimeRouter.get('/rates', requireMinRole('SUPER_ADMIN'), async (_req, res) => {
  res.json(await ratesOverview());
});

adminTimeRouter.put('/rates/default', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(defaultRateSchema, req.body ?? {});
  const cents = await saveDefaultRate(Math.round(body.hourly * 100));
  await audit(req, 'STAFF_COST_RATE_DEFAULT', 'setting:timeTracking', { centsPerHour: cents });
  res.json(await ratesOverview());
});

adminTimeRouter.post('/rates', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(rateSchema, req.body ?? {});
  const staff = await prisma.user.findFirst({ where: { id: body.userId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
  if (!staff) throw notFound('USER_NOT_FOUND');
  const effectiveFrom = new Date(`${body.effectiveFrom}T00:00:00Z`);
  const centsPerHour = Math.round(body.hourly * 100);
  const row = await prisma.staffCostRate.upsert({
    where: { userId_effectiveFrom: { userId: body.userId, effectiveFrom } },
    create: { userId: body.userId, effectiveFrom, centsPerHour, createdById: req.user!.id },
    update: { centsPerHour, createdById: req.user!.id },
  });
  await audit(req, 'STAFF_COST_RATE_SET', `user:${body.userId}`, { rateId: row.id, centsPerHour, effectiveFrom: body.effectiveFrom });
  res.status(201).json(await ratesOverview());
});

adminTimeRouter.delete('/rates/:id', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const row = await prisma.staffCostRate.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound();
  await prisma.staffCostRate.delete({ where: { id: row.id } });
  await audit(req, 'STAFF_COST_RATE_DELETED', `user:${row.userId}`, { centsPerHour: row.centsPerHour, effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10) });
  res.json(await ratesOverview());
});
