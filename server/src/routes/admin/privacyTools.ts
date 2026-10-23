import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { hasMinRole, requireAuth, requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, limiter, notFound, parse } from '../../lib/http.js';
import {
  clearImpersonationCookie,
  endImpersonation,
  IMPERSONATION_COOKIE,
  IMPERSONATION_REASONS,
  hashToken,
  startImpersonation,
} from '../../lib/privacy/impersonation.js';
import { DEFAULT_MASKING, loadMaskingSettings, MASK_GROUPS, maskedGroupsFor, maskingSettingsSchema, saveMaskingSettings, groupOfField } from '../../lib/privacy/mask.js';
import { loadInvoiceSettings } from './invoices.js';

/**
 * Privacy tools for staff:
 *
 * "View as client" — mounted at /api/admin/impersonate in app.ts (before the staff-only admin router,
 * because while impersonating req.user is the client):
 *   POST /:userId            (ADMIN+) { reason, note?, returnTo? } → starts a 30-minute read-only view
 *   POST /stop               ends the running view (the only write allowed while viewing)
 *   GET  /history?userId=    (ADMIN+) past views of a user, with the paths viewed
 *
 * Sensitive data — mounted inside /api/admin (STAFF+):
 *   POST /reveal                       { entity, id, field, reason } → plaintext once, audited
 *   GET  /sensitive/policy             which groups the caller sees masked
 *   GET  /sensitive/settings           (SUPER_ADMIN) masked groups per role
 *   PUT  /sensitive/settings           (SUPER_ADMIN)
 *   GET  /sensitive/reveals            (SUPER_ADMIN) reveal log with filters
 *   GET  /sensitive/reveals.csv        (SUPER_ADMIN) same, as CSV
 */

// ─── View as client ────────────────────────────────────────────────────

export const impersonationRouter = Router();

const startLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: (req) => req.user?.id ?? 'anonymous', skip: () => config.isTest });

impersonationRouter.post('/stop', requireAuth, async (req, res) => {
  if (req.impersonation && req.impersonator) {
    const row = await prisma.impersonationSession.findUnique({ where: { id: req.impersonation.id } });
    if (row) await endImpersonation({ ip: req.ip }, row, 'STOPPED');
    clearImpersonationCookie(res);
    res.json({ ok: true, returnTo: req.impersonation.returnTo ?? '/admin' });
    return;
  }
  // No running view (expired or already stopped): only tidy the cookie up.
  const token = req.cookies?.[IMPERSONATION_COOKIE];
  if (typeof token === 'string' && token) {
    const row = await prisma.impersonationSession.findUnique({ where: { tokenHash: hashToken(token) } });
    if (row && row.adminId === req.user!.id && !row.endedAt) await endImpersonation({ ip: req.ip }, row, 'STOPPED');
    clearImpersonationCookie(res);
  }
  res.json({ ok: true, returnTo: null });
});

impersonationRouter.get('/history', requireMinRole('ADMIN'), async (req, res) => {
  const q = parse(z.object({ userId: z.string().min(1).max(64) }), req.query);
  const sessions = await prisma.impersonationSession.findMany({
    where: { targetUserId: q.userId },
    orderBy: { startedAt: 'desc' },
    take: 50,
    select: { id: true, adminId: true, reason: true, note: true, startedAt: true, expiresAt: true, endedAt: true, endReason: true, requestCount: true },
  });
  const [admins, logs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(sessions.map((s) => s.adminId))] } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.impersonationLog.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) } }, orderBy: { windowStart: 'asc' }, select: { sessionId: true, windowStart: true, paths: true } }),
  ]);
  const adminName = new Map(admins.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
  res.json({
    items: sessions.map((s) => ({
      ...s,
      admin: adminName.get(s.adminId) ?? null,
      views: logs.filter((l) => l.sessionId === s.id).map((l) => ({ at: l.windowStart, paths: l.paths })),
    })),
  });
});

const startSchema = z
  .object({
    reason: z.enum(IMPERSONATION_REASONS),
    note: z.string().trim().max(500).optional().nullable(),
    returnTo: z
      .string()
      .trim()
      .max(300)
      .regex(/^\/admin(\/[\w\-./?=&%]*)?$/)
      .optional()
      .nullable(),
  })
  .refine((b) => b.reason !== 'OTHER' || (b.note ?? '').length >= 3, { message: 'NOTE_REQUIRED', path: ['note'] });

impersonationRouter.post('/:userId', requireMinRole('ADMIN'), startLimiter, async (req, res) => {
  const body = parse(startSchema, req.body ?? {});
  const userId = String(req.params.userId);
  if (userId === req.user!.id) throw badRequest('NOT_IMPERSONATABLE');
  const { session, target, landing } = await startImpersonation(req, res, { targetUserId: userId, ...body });
  res.status(201).json({
    ok: true,
    landing,
    impersonation: {
      id: session.id,
      reason: session.reason,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      returnTo: session.returnTo,
      target: { id: target.id, firstName: target.firstName, lastName: target.lastName, role: target.role },
    },
  });
});

// ─── Sensitive data: reveal ────────────────────────────────────────────

export const adminSensitiveRouter = Router();

const REVEAL_ENTITIES = ['user', 'company', 'agent', 'invoiceSettings', 'document', 'insight'] as const;
type RevealEntity = (typeof REVEAL_ENTITIES)[number];

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const jsonField = (j: Prisma.JsonValue | null | undefined, field: string): string | null => {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  if (str(o[field])) return str(o[field]);
  const mrz = o.mrz as Record<string, unknown> | null | undefined;
  if (mrz && typeof mrz === 'object' && (field === 'documentNumber' || field === 'passportNumber')) return str(mrz.documentNumber);
  return null;
};

/** What can be revealed, who may reveal it (on top of STAFF+), and where the plaintext lives. */
const REVEALERS: Record<RevealEntity, { fields: string[]; minRole: Role; load: (id: string, field: string) => Promise<{ found: boolean; value: string | null }> }> = {
  user: {
    fields: ['passportNumber'],
    minRole: 'STAFF',
    load: async (id) => {
      const u = await prisma.user.findUnique({ where: { id }, select: { passportNumber: true } });
      return { found: !!u, value: u?.passportNumber ?? null };
    },
  },
  company: {
    fields: ['vatId'],
    minRole: 'STAFF',
    load: async (id) => {
      const c = await prisma.company.findUnique({ where: { id }, select: { vatId: true } });
      return { found: !!c, value: c?.vatId ?? null };
    },
  },
  agent: {
    fields: ['iban'],
    minRole: 'ADMIN',
    load: async (id) => {
      const a = await prisma.agent.findUnique({ where: { id }, select: { iban: true } });
      return { found: !!a, value: a?.iban ?? null };
    },
  },
  invoiceSettings: {
    fields: ['iban', 'bic', 'vatId', 'taxNumber'],
    minRole: 'ADMIN',
    load: async (_id, field) => {
      const s = await loadInvoiceSettings();
      const v = field === 'iban' || field === 'bic' ? s.invoicing[field] : (s.seller as unknown as Record<string, unknown>)[field];
      return { found: true, value: str(v) };
    },
  },
  document: {
    fields: ['documentNumber', 'passportNumber'],
    minRole: 'STAFF',
    load: async (id, field) => {
      const d = await prisma.document.findUnique({ where: { id }, select: { ocr: true } });
      return { found: !!d, value: jsonField(d?.ocr, field) };
    },
  },
  insight: {
    fields: ['documentNumber'],
    minRole: 'STAFF',
    load: async (id, field) => {
      const i = await prisma.documentInsight.findUnique({ where: { id }, select: { fields: true } });
      return { found: !!i, value: jsonField(i?.fields, field) };
    },
  },
};

const revealLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30, keyGenerator: (req) => `reveal:${req.user?.id ?? 'anonymous'}` });

const revealSchema = z.object({
  entity: z.enum(REVEAL_ENTITIES),
  id: z.string().trim().min(1).max(64),
  field: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(5).max(500),
});

adminSensitiveRouter.post('/reveal', revealLimiter, async (req, res) => {
  const body = parse(revealSchema, req.body ?? {});
  const spec = REVEALERS[body.entity];
  if (!spec.fields.includes(body.field)) throw badRequest('FIELD_NOT_REVEALABLE');
  if (!hasMinRole(req.user!.role, spec.minRole)) throw forbidden();
  const { found, value } = await spec.load(body.id, body.field);
  if (!found) throw notFound();
  const group = groupOfField(body.field);
  await audit(req, 'SENSITIVE_REVEALED', `${body.entity}:${body.id}`, {
    entity: body.entity,
    id: body.id,
    field: body.field,
    group: group ?? null,
    reason: body.reason,
  });
  res.json({ entity: body.entity, id: body.id, field: body.field, value, visibleForSec: 60 });
});

adminSensitiveRouter.get('/sensitive/policy', async (req, res) => {
  const settings = await loadMaskingSettings();
  res.json({ groups: MASK_GROUPS, masked: [...maskedGroupsFor(req.user, settings)] });
});

adminSensitiveRouter.get('/sensitive/settings', requireMinRole('SUPER_ADMIN'), async (_req, res) => {
  res.json({ groups: MASK_GROUPS, settings: await loadMaskingSettings(), defaults: DEFAULT_MASKING });
});

adminSensitiveRouter.put('/sensitive/settings', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const value = parse(maskingSettingsSchema, req.body?.settings ?? req.body ?? {});
  const saved = await saveMaskingSettings(value);
  await audit(req, 'MASKING_SETTINGS_CHANGED', 'setting:privacy.masking', saved);
  res.json({ groups: MASK_GROUPS, settings: saved, defaults: DEFAULT_MASKING });
});

// ─── Reveal log (SUPER_ADMIN) ──────────────────────────────────────────

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const logQuery = z.object({
  actorId: z.string().max(64).optional(),
  entity: z.enum(REVEAL_ENTITIES).optional(),
  field: z.string().max(40).optional(),
  q: z.string().trim().max(100).optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

type RevealRow = { id: string; at: Date; actor: { id: string; name: string; role: Role } | null; entity: string; entityId: string; field: string; reason: string; ip: string | null };

const loadReveals = async (req: Request, opts: { all?: boolean } = {}) => {
  const q = parse(logQuery, req.query);
  const where: Prisma.AuditLogWhereInput = {
    action: 'SENSITIVE_REVEALED',
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.entity ? { target: { startsWith: `${q.entity}:` } } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } } : {}),
  };
  const take = opts.all ? 10_000 : 50;
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts.all ? take : take + 1,
    skip: opts.all ? 0 : (q.page - 1) * take,
    include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
  });
  const hasMore = !opts.all && rows.length > take;
  let items: RevealRow[] = rows.slice(0, take).map((r) => {
    const d = (r.details ?? {}) as Record<string, unknown>;
    const [entity, ...rest] = (r.target ?? '').split(':');
    return {
      id: r.id,
      at: r.createdAt,
      actor: r.actor ? { id: r.actor.id, name: `${r.actor.firstName} ${r.actor.lastName}`.trim(), role: r.actor.role } : null,
      entity: String(d.entity ?? entity ?? ''),
      entityId: String(d.id ?? rest.join(':')),
      field: String(d.field ?? ''),
      reason: String(d.reason ?? ''),
      ip: r.ip,
    };
  });
  if (q.field) items = items.filter((i) => i.field === q.field);
  if (q.q) {
    const needle = q.q.toLowerCase();
    items = items.filter((i) => [i.reason, i.actor?.name ?? '', i.entityId].some((s) => s.toLowerCase().includes(needle)));
  }
  return { items, hasMore, page: q.page };
};

adminSensitiveRouter.get('/sensitive/reveals', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const [list, actors] = await Promise.all([
    loadReveals(req),
    prisma.auditLog.findMany({ where: { action: 'SENSITIVE_REVEALED', actorId: { not: null } }, distinct: ['actorId'], select: { actor: { select: { id: true, firstName: true, lastName: true } } }, take: 200 }),
  ]);
  res.json({ ...list, actors: actors.flatMap((a) => (a.actor ? [{ id: a.actor.id, name: `${a.actor.firstName} ${a.actor.lastName}`.trim() }] : [])) });
});

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

adminSensitiveRouter.get('/sensitive/reveals.csv', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const { items } = await loadReveals(req, { all: true });
  const header = ['time', 'actor', 'role', 'entity', 'entityId', 'field', 'reason', 'ip'];
  const lines = [header.join(','), ...items.map((i) => [i.at, i.actor?.name ?? '', i.actor?.role ?? '', i.entity, i.entityId, i.field, i.reason, i.ip ?? ''].map(csvCell).join(','))];
  await audit(req, 'SENSITIVE_REVEALS_EXPORTED', undefined, { rows: items.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sensitive-reveals-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${lines.join('\r\n')}\r\n`);
});

