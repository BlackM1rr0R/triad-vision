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
  licensedModules,
  recordVisit,
  saveModules,
  toPins,
  toRecent,
  usageReport,
} from '../../lib/navModules.js';
import { getLicense } from '../../lib/license/index.js';
import { NAV_VIEWS, WORK_PROFILES, defaultWorkProfile, isWorkProfile, resolveNavView } from '../../lib/workProfiles.js';

/**
 * Admin navigation (mounted on /api/admin, STAFF+):
 *   GET  /me/nav                    { desk, defaultDesk, pins, recent, modules, landing }  (bootstrap of the sidebar + Ctrl+K)
 *   PUT  /me/nav                    { desk?: Desk | null, pins?: string[], landing?: Landing | null }  own desk / favourites / start page
 *   POST /me/nav/visit              { navId }                                       one page open (usage + recent)
 *   GET  /nav/desks                 staff with their desk                           ADMIN+
 *   PUT  /nav/desks/:userId         { desk: Desk | null }                           ADMIN+
 *   PUT  /me/nav also takes      { workProfile?: WorkProfile | null, navView?: 'simple' | 'full' | null }  simple sidebar
 *   PUT  /nav/profiles/:userId   { workProfile: WorkProfile | null }             ADMIN+ (work profile of a staff member)
 *   GET  /nav/usage?days=7|30|90    opens per page, unique users, last opened       SUPER_ADMIN
 *   PUT  /nav/modules               { modules: { key: boolean } }                   SUPER_ADMIN
 */
export const adminNavRouter = Router();

const navId = z.string().regex(NAV_ID_RE);
const desk = z.enum(DESKS);

/**
 * Start page of /admin per staff member: "Bu günüm" (my day), the work queue or the dashboard. null = the role
 * default (STAFF → queue, ADMIN+ → dashboard). Kept in a Setting row (no schema change for one small value).
 */
export const LANDINGS = ['myday', 'today', 'dashboard'] as const;
export type Landing = (typeof LANDINGS)[number];
const landingKey = (userId: string) => `staff-landing:${userId}`;
const readLanding = async (userId: string): Promise<Landing | null> => {
  const row = await prisma.setting.findUnique({ where: { key: landingKey(userId) } });
  const v = (row?.value as { landing?: unknown } | null)?.landing;
  return (LANDINGS as readonly unknown[]).includes(v) ? (v as Landing) : null;
};
const writeLanding = async (userId: string, landing: Landing | null) => {
  const key = landingKey(userId);
  if (landing === null) await prisma.setting.deleteMany({ where: { key } });
  else await prisma.setting.upsert({ where: { key }, create: { key, value: { landing } }, update: { value: { landing } } });
};

const navView = async (userId: string, role: Parameters<typeof defaultDesk>[0]) => {
  const license = getLicense();
  const [prefs, modules, landing] = await Promise.all([
    prisma.staffPreferences.findUnique({ where: { userId }, select: { desk: true, navPins: true, navRecent: true, workProfile: true, navView: true } }),
    getModules(),
    readLanding(userId),
  ]);
  const fallback = defaultDesk(role);
  return {
    desk: isDesk(prefs?.desk) ? prefs.desk : fallback,
    defaultDesk: fallback,
    pins: toPins(prefs?.navPins),
    recent: toRecent(prefs?.navRecent),
    modules,
    /** Own start page of /admin (null = role default). */
    landing,
    /** Simple sidebar (lib/workProfiles): chosen profile (null = default), the default, and the effective view. */
    workProfile: isWorkProfile(prefs?.workProfile) ? prefs.workProfile : null,
    defaultWorkProfile: defaultWorkProfile(role, prefs?.desk),
    navView: resolveNavView(prefs?.navView, prefs?.workProfile),
    /** White-label licence: plan modules (null = all) and the status for the admin banner (lib/license). */
    licensedModules: licensedModules(license),
    license: {
      role: license.role,
      status: license.status,
      mode: license.mode,
      daysLeft: license.daysLeft ?? null,
      graceEndsAt: license.graceEndsAt ?? null,
      expiresAt: license.expiresAt ?? null,
    },
  };
};

adminNavRouter.get('/me/nav', async (req, res) => {
  res.json(await navView(req.user!.id, req.user!.role));
});

adminNavRouter.put('/me/nav', async (req, res) => {
  const body = parse(
    z.object({ desk: desk.nullable().optional(), pins: z.array(navId).max(PINS_MAX * 2).optional(), landing: z.enum(LANDINGS).nullable().optional(),
      workProfile: z.enum(WORK_PROFILES).nullable().optional(),
      navView: z.enum(NAV_VIEWS).nullable().optional(),
    }),
    req.body ?? {},
  );
  const data = {
    ...(body.desk !== undefined ? { desk: body.desk } : {}),
    ...(body.pins ? { navPins: toPins(body.pins) } : {}),
    ...(body.workProfile !== undefined ? { workProfile: body.workProfile } : {}),
    ...(body.navView !== undefined ? { navView: body.navView } : {}),
  };
  const userId = req.user!.id;
  await prisma.staffPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  if (body.landing !== undefined) await writeLanding(userId, body.landing);
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
  const prefs = staff.length ? await prisma.staffPreferences.findMany({ where: { userId: { in: staff.map((s) => s.id) } }, select: { userId: true, desk: true, workProfile: true } }) : [];
  const by = new Map(prefs.map((p) => [p.userId, p.desk]));
  const profiles = new Map(prefs.map((p) => [p.userId, p.workProfile]));
  res.json({
    items: staff.map((s) => {
      const own = by.get(s.id);
      const profile = profiles.get(s.id);
      return {
        ...s,
        desk: isDesk(own) ? own : null,
        defaultDesk: defaultDesk(s.role),
        workProfile: isWorkProfile(profile) ? profile : null,
        defaultWorkProfile: defaultWorkProfile(s.role, own),
      };
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

// Work profile of a staff member (simple sidebar). Assigning one switches their sidebar to the simple view unless
// they chose a view themselves (lib/workProfiles resolveNavView); null = back to the default from role / desk.
adminNavRouter.put('/nav/profiles/:userId', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ workProfile: z.enum(WORK_PROFILES).nullable() }), req.body ?? {});
  const userId = String(req.params.userId);
  const user = await prisma.user.findFirst({ where: { id: userId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, role: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  const prefs = await prisma.staffPreferences.upsert({
    where: { userId },
    create: { userId, workProfile: body.workProfile },
    update: { workProfile: body.workProfile },
    select: { desk: true },
  });
  await audit(req, 'WORK_PROFILE_SET', `user:${userId}`, { workProfile: body.workProfile });
  res.json({ userId, workProfile: body.workProfile, defaultWorkProfile: defaultWorkProfile(user.role, prefs.desk) });
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
