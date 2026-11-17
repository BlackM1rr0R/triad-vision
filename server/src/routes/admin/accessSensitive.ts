import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import {
  DEFAULT_MASKING,
  EXTRA_MASK_GROUPS,
  MASKABLE_ROLES,
  MASK_GROUPS,
  MASK_MODES,
  clearPolicyOverridesCache,
  loadMaskingSettings,
  loadPolicyOverrides,
  maskJsonPolicy,
  policyFromModes,
  resolvePolicy,
  saveMaskingSettings,
  templateIdOf,
  type MaskGroup,
  type MaskMode,
  type MaskableRole,
} from '../../lib/privacy/mask.js';
import { EXTRA_REASON_MIN } from '../../lib/privacy/sensitiveReveal.js';

/**
 * Access Center › Sensitive fields — mounted at /api/admin/access/sensitive (SUPER_ADMIN, or an ADMIN the core
 * access engine granted "manage access"):
 *
 *   GET  /                      groups, modes, role matrix, template + user overrides, defaults
 *   PUT  /role                  { role: STAFF | ADMIN, group, mode }               role policy
 *   PUT  /template              { templateId, group, mode | null }  (null = inherit from the role)
 *   PUT  /user                  { userId, group, mode | null }      (null = inherit)
 *   GET  /users?q=              staff users (STAFF / ADMIN) to add a per-user override for
 *   GET  /preview?userId=       "test as user": effective mode per group (and why) + a sample record as they see it
 *
 * Role policy: MASKED / VISIBLE stay in Setting 'privacy.masking' (the same setting the original page edits);
 * HIDDEN is a SensitiveFieldPolicy row (scope role:X) and the group is kept in the masked list as well, so
 * code that only knows the setting still masks it. Every change: audit SENSITIVE_POLICY_CHANGED (before → after).
 * The reveal log is GET /api/admin/sensitive/reveals (privacyTools.ts).
 */
export const adminAccessSensitiveRouter = Router();

const ACCESS_SPECS = ['../../lib/access/index.js', '../../lib/access/store.js'];

/** SUPER_ADMIN always; an ADMIN only when the core engine says they may manage access. */
const canManage = async (user: { id: string; role: Role }) => {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'ADMIN') return false;
  for (const spec of ACCESS_SPECS) {
    try {
      const m = (await import(/* @vite-ignore */ spec)) as { canManageAccess?: unknown; loadAccess?: unknown };
      if (typeof m.canManageAccess === 'function') return !!(await (m.canManageAccess as (u: unknown) => Promise<boolean> | boolean)(user));
      if (typeof m.loadAccess === 'function') return !!(await (m.loadAccess as (u: unknown) => Promise<{ manageAccess?: boolean }>)(user))?.manageAccess;
    } catch {
      // engine not there (yet): only SUPER_ADMIN
    }
  }
  return false;
};

adminAccessSensitiveRouter.use(async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.user || !(await canManage(req.user))) return next(forbidden());
    next();
  } catch (err) {
    next(err);
  }
});

const groupSchema = z.enum(MASK_GROUPS);
const modeSchema = z.enum(MASK_MODES);
const roleSchema = z.enum(MASKABLE_ROLES);

type ModeMap = Partial<Record<MaskGroup, MaskMode>>;

const roleModes = async (): Promise<Record<MaskableRole, Record<MaskGroup, MaskMode>>> => {
  const [settings, overrides] = await Promise.all([loadMaskingSettings(), loadPolicyOverrides()]);
  const out = {} as Record<MaskableRole, Record<MaskGroup, MaskMode>>;
  for (const role of MASKABLE_ROLES) {
    out[role] = {} as Record<MaskGroup, MaskMode>;
    for (const g of MASK_GROUPS) {
      out[role][g] = overrides.get(`role:${role}`)?.get(g) === 'HIDDEN' ? 'HIDDEN' : settings[role].includes(g) ? 'MASKED' : 'VISIBLE';
    }
  }
  return out;
};

const scopeModes = (overrides: Map<string, Map<MaskGroup, MaskMode>>, prefix: string) => {
  const out = new Map<string, ModeMap>();
  for (const [scope, modes] of overrides) {
    if (!scope.startsWith(prefix)) continue;
    out.set(scope.slice(prefix.length), Object.fromEntries(modes));
  }
  return out;
};

/** Staff role templates of the core engine (empty until it exists). Read through the client without a compile-time dependency. */
const listTemplates = async (): Promise<{ id: string; key: string | null; name: unknown }[]> => {
  const delegate = (prisma as unknown as Record<string, { findMany?: (a: unknown) => Promise<{ id: string; key: string | null; name: unknown }[]> } | undefined>).staffRoleTemplate;
  if (!delegate?.findMany) return [];
  try {
    return await delegate.findMany({ select: { id: true, key: true, name: true }, orderBy: { createdAt: 'asc' } });
  } catch {
    return [];
  }
};

const userName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

adminAccessSensitiveRouter.get('/', async (_req, res) => {
  const overrides = await loadPolicyOverrides();
  const userOverrides = scopeModes(overrides, 'user:');
  const users = userOverrides.size
    ? await prisma.user.findMany({ where: { id: { in: [...userOverrides.keys()] } }, select: { id: true, firstName: true, lastName: true, email: true, role: true } })
    : [];
  const templateOverrides = scopeModes(overrides, 'template:');
  const templates = await listTemplates();
  res.json({
    groups: MASK_GROUPS,
    newGroups: EXTRA_MASK_GROUPS,
    modes: MASK_MODES,
    roles: MASKABLE_ROLES,
    reasonMin: { original: 5, new: EXTRA_REASON_MIN },
    defaults: Object.fromEntries(MASKABLE_ROLES.map((r) => [r, Object.fromEntries(MASK_GROUPS.map((g) => [g, DEFAULT_MASKING[r].includes(g) ? 'MASKED' : 'VISIBLE']))])),
    role: await roleModes(),
    templates: [
      ...templates.map((t) => ({ id: t.id, key: t.key, name: t.name, modes: templateOverrides.get(t.id) ?? {} })),
      // Overrides of templates that no longer exist stay visible (and removable).
      ...[...templateOverrides.entries()].filter(([id]) => !templates.some((t) => t.id === id)).map(([id, modes]) => ({ id, key: null, name: null, modes, missing: true })),
    ],
    users: users.map((u) => ({ id: u.id, name: userName(u), email: u.email, role: u.role, modes: userOverrides.get(u.id) ?? {} })),
  });
});

const changed = async (req: Request, scope: string, group: MaskGroup, before: MaskMode | null, after: MaskMode | null) => {
  clearPolicyOverridesCache();
  await audit(req, 'SENSITIVE_POLICY_CHANGED', `sensitive:${scope}:${group}`, { scope, group, before, after });
};

adminAccessSensitiveRouter.put('/role', async (req, res) => {
  const body = parse(z.object({ role: roleSchema, group: groupSchema, mode: modeSchema }), req.body ?? {});
  const before = (await roleModes())[body.role][body.group];
  const settings = await loadMaskingSettings();
  const list = new Set(settings[body.role]);
  if (body.mode === 'VISIBLE') list.delete(body.group);
  else list.add(body.group); // HIDDEN is kept in the masked list as well (code that only reads the setting still masks)
  await saveMaskingSettings({ ...settings, [body.role]: [...list] });
  const scope = `role:${body.role}`;
  if (body.mode === 'HIDDEN') {
    await prisma.sensitiveFieldPolicy.upsert({
      where: { maskGroup_scope: { maskGroup: body.group, scope } },
      create: { maskGroup: body.group, scope, mode: 'HIDDEN', updatedById: req.user!.id },
      update: { mode: 'HIDDEN', updatedById: req.user!.id },
    });
  } else {
    await prisma.sensitiveFieldPolicy.deleteMany({ where: { maskGroup: body.group, scope } });
  }
  if (before !== body.mode) await changed(req, scope, body.group, before, body.mode);
  else clearPolicyOverridesCache();
  res.json({ ok: true, role: await roleModes() });
});

const setOverride = async (req: Request, scope: string, group: MaskGroup, mode: MaskMode | null) => {
  const existing = await prisma.sensitiveFieldPolicy.findUnique({ where: { maskGroup_scope: { maskGroup: group, scope } }, select: { mode: true } });
  const before = (existing?.mode as MaskMode | undefined) ?? null;
  if (mode === null) await prisma.sensitiveFieldPolicy.deleteMany({ where: { maskGroup: group, scope } });
  else
    await prisma.sensitiveFieldPolicy.upsert({
      where: { maskGroup_scope: { maskGroup: group, scope } },
      create: { maskGroup: group, scope, mode, updatedById: req.user!.id },
      update: { mode, updatedById: req.user!.id },
    });
  if (before !== mode) await changed(req, scope, group, before, mode);
};

adminAccessSensitiveRouter.put('/template', async (req, res) => {
  const body = parse(z.object({ templateId: z.string().trim().min(1).max(60), group: groupSchema, mode: modeSchema.nullable() }), req.body ?? {});
  await setOverride(req, `template:${body.templateId}`, body.group, body.mode);
  res.json({ ok: true });
});

adminAccessSensitiveRouter.put('/user', async (req, res) => {
  const body = parse(z.object({ userId: z.string().trim().min(1).max(40), group: groupSchema, mode: modeSchema.nullable() }), req.body ?? {});
  const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { role: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  // SUPER_ADMIN always sees everything; portal roles only see their own data (never masked).
  if (user.role !== 'STAFF' && user.role !== 'ADMIN') throw badRequest('NOT_MASKABLE_ROLE');
  await setOverride(req, `user:${body.userId}`, body.group, body.mode);
  res.json({ ok: true });
});

adminAccessSensitiveRouter.get('/users', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(100).optional() }), req.query).q;
  const users = await prisma.user.findMany({
    where: {
      role: { in: ['STAFF', 'ADMIN'] },
      isActive: true,
      ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }] } : {}),
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 30,
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });
  res.json({ items: users.map((u) => ({ id: u.id, name: userName(u), email: u.email, role: u.role })) });
});

/** A made-up record touching every group (no real client data in the preview). */
export const PREVIEW_SAMPLE = {
  client: {
    firstName: 'Elvin',
    lastName: 'Məmmədov',
    birthDate: '1994-03-12',
    passportNumber: 'C01234567',
    placeOfBirth: 'Gəncə',
    address: 'Bakı, Nizami küç. 12, mən. 4',
    iban: 'AZ21NABZ00000000137010001944',
    taxId: '1234567891',
  },
  employmentContract: { employerName: 'Muster Logistik GmbH', grossMonthly: 3100, grossYearly: 37200 },
  permit: { residenceTitleKind: 'BLUE_CARD', healthInsuranceExpiresAt: '2027-03-31' },
  arrival: { housingDetails: 'Berlin, Musterstraße 5, 2. OG links' },
  familyMembers: [{ relation: 'SPOUSE', firstName: 'Aysel', lastName: 'Məmmədova', birthDate: '1996-07-01', passportNumber: 'C07654321', mainCaseId: 'sample' }],
  company: { name: 'Muster Logistik GmbH', address: 'Hamburg, Hafenstraße 1', vatId: 'DE123456789' },
};

adminAccessSensitiveRouter.get('/preview', async (req, res) => {
  const { userId } = parse(z.object({ userId: z.string().trim().min(1).max(40) }), req.query);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, email: true, role: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  const [settings, overrides] = await Promise.all([loadMaskingSettings(), loadPolicyOverrides()]);
  const templateId = user.role === 'STAFF' || user.role === 'ADMIN' ? await templateIdOf({ id: user.id, role: user.role }) : null;
  const modes = resolvePolicy(user, settings, overrides, templateId);
  res.json({
    user: { id: user.id, name: userName(user), email: user.email, role: user.role },
    templateId,
    modes,
    sample: { plain: PREVIEW_SAMPLE, shown: maskJsonPolicy(policyFromModes(modes), PREVIEW_SAMPLE) },
  });
});
