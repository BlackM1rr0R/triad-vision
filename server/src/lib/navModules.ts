import type { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole } from '../middleware/auth.js';
import { getLicense, type LicenseState } from './license/index.js';

/**
 * Admin navigation settings (simplification round):
 *  - role desks: which pages a staff member sees first in the sidebar (StaffPreferences.desk);
 *  - module toggles: optional features a SUPER_ADMIN can hide from the staff panel (Setting `modules`).
 *    A disabled module only hides its menu items, hub tabs, dashboard widgets and Ctrl+K entries; the
 *    API keeps working, so public / legacy flows and links in old e-mails are not broken.
 *  - white-label licence (lib/license): a module outside the instance's plan is hidden the same way, whatever
 *    the stored toggle says (the stored toggles are kept, so an upgraded plan shows them again).
 * The client mirrors the module list in client/src/components/command/navRegistry.ts (MODULES).
 */

export const DESKS = ['MANAGER', 'FINANCE', 'MARKETING', 'ALL'] as const;
export type Desk = (typeof DESKS)[number];

/** Desk when none was chosen: admins see every hub, everyone else the case-manager desk. */
export const defaultDesk = (role: Role | undefined): Desk => (hasMinRole(role, 'ADMIN') ? 'ALL' : 'MANAGER');

export const isDesk = (v: unknown): v is Desk => typeof v === 'string' && (DESKS as readonly string[]).includes(v);

export const MODULE_KEYS = [
  'campaigns',
  'liveChat',
  'calls',
  'landingPages',
  'events',
  'referrals',
  'agents',
  'training',
  'shifts',
  'waitingRoom',
  'aiAssistant',
  'settlements',
  'originals',
  'surveys',
  'reviews',
  'announcements',
  'interviewPrep',
  'translations',
  'timeTracking',
  'kpi',
  'examDates',
  'journey',
  'bookings',
  'knowledgeBase',
  'quotes',
  'checkIns',
  'guides',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type Modules = Record<ModuleKey, boolean>;

export const MODULES_SETTING_KEY = 'modules';

/** Every module on, then the stored flags (unknown keys dropped, non-booleans ignored). */
export const normalizeModules = (raw: unknown): Modules => {
  const out = Object.fromEntries(MODULE_KEYS.map((k) => [k, true])) as Modules;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of MODULE_KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
};

// Read on every admin page load (GET /admin/me/nav): a short in-process cache, dropped on save.
const TTL_MS = 30_000;
let memo: { at: number; value: Modules } | null = null;

/** The toggles as stored by the SUPER_ADMIN (System → Modules), without the licence. */
export const getStoredModules = async (): Promise<Modules> => {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  const row = await prisma.setting.findUnique({ where: { key: MODULES_SETTING_KEY } });
  const value = normalizeModules(row?.value);
  memo = { at: Date.now(), value };
  return value;
};

/** Modules of the licence plan (null = every module: owner instance or an all-modules plan). */
export const licensedModules = (license: LicenseState = getLicense()): ModuleKey[] | null =>
  license.modules === null ? null : MODULE_KEYS.filter((k) => license.modules!.includes(k));

/** Stored toggles AND the licence plan: a module outside the plan is always off. */
export const applyLicense = (modules: Modules, license: LicenseState = getLicense()): Modules => {
  const allowed = licensedModules(license);
  if (!allowed) return modules;
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, modules[k] && allowed.includes(k)])) as Modules;
};

/** Effective modules (what the staff panel shows). */
export const getModules = async (): Promise<Modules> => applyLicense(await getStoredModules());

export const saveModules = async (patch: Partial<Record<ModuleKey, boolean>>): Promise<Modules> => {
  const next = { ...(await getStoredModules()), ...patch };
  await prisma.setting.upsert({ where: { key: MODULES_SETTING_KEY }, create: { key: MODULES_SETTING_KEY, value: next }, update: { value: next } });
  memo = null;
  return applyLicense(next);
};

export const invalidateModules = () => {
  memo = null;
};

// ─── Page usage (AdminPageVisit) ──────────────────────────────────────

export const NAV_ID_RE = /^[a-zA-Z0-9_.-]{1,60}$/;
export const RECENT_MAX = 10;
export const PINS_MAX = 30;
export const VISIT_RETENTION_DAYS = 400;
const DAY = 86_400_000;

/** Today's date (UTC) for the @db.Date column. */
export const visitDay = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export type RecentItem = { id: string; at: string };

export const toRecent = (v: unknown): RecentItem[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is RecentItem => !!x && typeof x === 'object' && typeof (x as RecentItem).id === 'string' && typeof (x as RecentItem).at === 'string' && NAV_ID_RE.test((x as RecentItem).id))
        .slice(0, RECENT_MAX)
    : [];

export const toPins = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && NAV_ID_RE.test(x)))].slice(0, PINS_MAX) : []);

/** One page open: +1 for the user / page / day, and the page moves to the top of the user's recent list. */
export const recordVisit = async (userId: string, navId: string, now = new Date()) => {
  const day = visitDay(now);
  await prisma.adminPageVisit.upsert({
    where: { userId_navId_day: { userId, navId, day } },
    create: { userId, navId, day, count: 1 },
    update: { count: { increment: 1 } },
  });
  const prefs = await prisma.staffPreferences.findUnique({ where: { userId }, select: { navRecent: true } });
  const recent = [{ id: navId, at: now.toISOString() }, ...toRecent(prefs?.navRecent).filter((r) => r.id !== navId)].slice(0, RECENT_MAX);
  await prisma.staffPreferences.upsert({ where: { userId }, create: { userId, navRecent: recent }, update: { navRecent: recent } });
  return recent;
};

/** Opens per page in the last `days` days: total, distinct users, last day it was opened (any time). */
export const usageReport = async (days: number, now = new Date()) => {
  const since = new Date(visitDay(now).getTime() - (days - 1) * DAY);
  const [perUser, last] = await Promise.all([
    prisma.adminPageVisit.groupBy({ by: ['navId', 'userId'], where: { day: { gte: since } }, _sum: { count: true } }),
    prisma.adminPageVisit.groupBy({ by: ['navId'], _max: { day: true } }),
  ]);
  const by = new Map<string, { navId: string; opens: number; users: number; lastDay: string | null }>();
  for (const r of perUser) {
    const e = by.get(r.navId) ?? { navId: r.navId, opens: 0, users: 0, lastDay: null };
    e.opens += r._sum.count ?? 0;
    e.users += 1;
    by.set(r.navId, e);
  }
  for (const r of last) {
    const e = by.get(r.navId) ?? { navId: r.navId, opens: 0, users: 0, lastDay: null };
    e.lastDay = r._max.day ? r._max.day.toISOString().slice(0, 10) : null;
    by.set(r.navId, e);
  }
  return { days, since: since.toISOString().slice(0, 10), items: [...by.values()].sort((a, b) => a.opens - b.opens || a.navId.localeCompare(b.navId)) };
};

/** Retention: usage rows older than VISIT_RETENTION_DAYS (run by the daily retention job). */
export const pruneAdminPageVisits = async (now = new Date()) =>
  (await prisma.adminPageVisit.deleteMany({ where: { day: { lt: new Date(visitDay(now).getTime() - VISIT_RETENTION_DAYS * DAY) } } })).count;
