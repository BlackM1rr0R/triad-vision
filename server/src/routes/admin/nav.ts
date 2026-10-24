import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { requireMinRole } from '../../middleware/auth.js';
import {
  DESKS,
  MODULE_KEYS,
  NAV_ID_RE,
  PINS_MAX,
  defaultDesk,
  getModules,
  isDesk,
  recordVisit,
  saveModules,
  toPins,
  toRecent,
  usageReport,
} from '../../lib/navModules.js';

/**
 * Admin navigation (mounted on /api/admin, STAFF+):
 *   GET  /me/nav                    { desk, defaultDesk, pins, recent, modules }  (bootstrap of the sidebar + Ctrl+K)
 *   PUT  /me/nav                    { desk?: Desk | null, pins?: string[] }        own desk / favourites
 *   POST /me/nav/visit              { navId }                                       one page open (usage + recent)
 *   GET  /nav/desks                 staff with their desk                           ADMIN+
 *   PUT  /nav/desks/:userId         { desk: Desk | null }                           ADMIN+
 *   GET  /nav/usage?days=7|30|90    opens per page, unique users, last opened       SUPER_ADMIN
 *   PUT  /nav/modules               { modules: { key: boolean } }                   SUPER_ADMIN
 */
export const adminNavRouter = Router();

const navId = z.string().regex(NAV_ID_RE);
const desk = z.enum(DESKS);

const navView = async (userId: string, role: Parameters<typeof defaultDesk>[0]) => {
  const [prefs, modules] = await Promise.all([
    prisma.staffPreferences.findUnique({ where: { userId }, select: { desk: true, navPins: true, navRecent: true } }),
    getModules(),
  ]);
  const fallback = defaultDesk(role);
  return {
    desk: isDesk(prefs?.desk) ? prefs.desk : fallback,
    defaultDesk: fallback,
    pins: toPins(prefs?.navPins),
    recent: toRecent(prefs?.navRecent),
    modules,
  };
};

adminNavRouter.get('/me/nav', async (req, res) => {
  res.json(await navView(req.user!.id, req.user!.role));
});

adminNavRouter.put('/me/nav', async (req, res) => {
  const body = parse(z.object({ desk: desk.nullable().optional(), pins: z.array(navId).max(PINS_MAX * 2).optional() }), req.body ?? {});
  const data = {
    ...(body.desk !== undefined ? { desk: body.desk } : {}),
    ...(body.pins ? { navPins: toPins(body.pins) } : {}),
  };
  const userId = req.user!.id;
  await prisma.staffPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  res.json(await navView(userId, req.user!.role));
});

adminNavRouter.post('/me/nav/visit', async (req, res) => {
  const body = parse(z.object({ navId }), req.body ?? {});
  const recent = await recordVisit(req.user!.id, body.navId);
  res.json({ recent });
});

adminNavRouter.get('/nav/desks', requireMinRole('ADMIN'), async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const prefs = staff.length ? await prisma.staffPreferences.findMany({ where: { userId: { in: staff.map((s) => s.id) } }, select: { userId: true, desk: true } }) : [];
  const by = new Map(prefs.map((p) => [p.userId, p.desk]));
  res.json({
    items: staff.map((s) => {
      const own = by.get(s.id);
      return { ...s, desk: isDesk(own) ? own : null, defaultDesk: defaultDesk(s.role) };
    }),
  });
});

adminNavRouter.put('/nav/desks/:userId', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ desk: desk.nullable() }), req.body ?? {});
  const userId = String(req.params.userId);
  const user = await prisma.user.findFirst({ where: { id: userId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, role: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  await prisma.staffPreferences.upsert({ where: { userId }, create: { userId, desk: body.desk }, update: { desk: body.desk } });
  res.json({ userId, desk: body.desk, defaultDesk: defaultDesk(user.role) });
});

adminNavRouter.get('/nav/usage', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const { days } = parse(z.object({ days: z.enum(['7', '30', '90']).default('30') }), req.query);
  res.json(await usageReport(Number(days)));
});

adminNavRouter.put('/nav/modules', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const shape = Object.fromEntries(MODULE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<(typeof MODULE_KEYS)[number], z.ZodOptional<z.ZodBoolean>>;
  const body = parse(z.object({ modules: z.object(shape).strict() }), req.body ?? {});
  const before = await getModules();
  const modules = await saveModules(body.modules);
  const changed = MODULE_KEYS.filter((k) => before[k] !== modules[k]);
  if (changed.length) await audit(req, 'MODULES_UPDATED', 'setting:modules', Object.fromEntries(changed.map((k) => [k, modules[k]])));
  res.json({ modules });
});
