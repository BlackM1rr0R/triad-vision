import { z } from 'zod';
import type { PartnerActivity, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { forbidden, notFound } from '../http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { ownerAuditTargets, ownerShape, ownerWhere, type Owner } from './owner.js';

/**
 * Timeline of an employer / referral partner: notes, calls, meetings, e-mails and tasks staff log by hand
 * (PartnerActivity) merged with what the audit log knows about the owner (field changes with before / after,
 * status changes, contracts, contact persons …) into one list, newest first.
 */

export const ACTIVITY_KINDS = ['NOTE', 'CALL', 'MEETING', 'EMAIL', 'TASK'] as const;

/** Audit actions of the activity routes themselves: the activity is already in the list. */
const HIDDEN_ACTIONS = ['PARTNER_ACTIVITY_CREATED', 'PARTNER_ACTIVITY_UPDATED', 'PARTNER_ACTIVITY_DELETED'];

const at = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'INVALID_DATE')
  .transform((v) => new Date(v));

export const activityCreateSchema = z.object({
  ...ownerShape,
  kind: z.enum(ACTIVITY_KINDS).default('NOTE'),
  body: z.string().trim().min(1).max(10_000),
  at: at.optional(),
  contactId: z.string().trim().min(1).max(40).nullable().optional(),
});

export const activityUpdateSchema = z.object({
  kind: z.enum(ACTIVITY_KINDS).optional(),
  body: z.string().trim().min(1).max(10_000).optional(),
  at: at.optional(),
  contactId: z.string().trim().min(1).max(40).nullable().optional(),
});

export const loadActivity = async (id: string) => {
  const a = await prisma.partnerActivity.findUnique({ where: { id } });
  if (!a) throw notFound('ACTIVITY_NOT_FOUND');
  return a;
};

/** The author may change / delete an entry; ADMIN+ any entry. */
export const assertActivityEditable = (a: PartnerActivity, viewer: { id: string; role: Parameters<typeof hasMinRole>[0] }) => {
  if (a.createdById !== viewer.id && !hasMinRole(viewer.role, 'ADMIN')) throw forbidden('NOT_OWN_ACTIVITY');
};

/** The contact must belong to the same owner. */
export const assertContactOfOwner = async (owner: Owner, contactId: string | null | undefined) => {
  if (!contactId) return;
  if (!(await prisma.contact.count({ where: { id: contactId, ...ownerWhere(owner) } }))) throw notFound('CONTACT_NOT_FOUND');
};

export interface TimelineChange {
  field: string;
  from: unknown;
  to: unknown;
  /** value not shown (bank data, tax numbers, notes): only that the field changed */
  hidden?: boolean;
}

export type TimelineItem =
  | {
      type: 'activity';
      id: string;
      at: string;
      kind: string;
      body: string;
      contact: { id: string; name: string } | null;
      actor: { id: string; name: string } | null;
      canEdit: boolean;
    }
  | {
      type: 'audit';
      id: string;
      at: string;
      action: string;
      actor: { id: string; name: string } | null;
      changes: TimelineChange[];
      details: Record<string, unknown>;
    };

const obj = (v: Prisma.JsonValue | null): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** { fields: [...], changes: { f: { from, to } } } → change rows; fields without values are "hidden". */
export const changesOf = (details: Prisma.JsonValue | null): TimelineChange[] => {
  const d = obj(details);
  const changes = obj((d.changes ?? null) as Prisma.JsonValue);
  const out: TimelineChange[] = [];
  for (const [field, v] of Object.entries(changes)) {
    const c = obj(v as Prisma.JsonValue);
    out.push({ field, from: c.from ?? null, to: c.to ?? null });
  }
  const fields = Array.isArray(d.fields) ? d.fields.filter((f): f is string => typeof f === 'string') : [];
  for (const f of fields) if (!(f in changes)) out.push({ field: f, from: null, to: null, hidden: true });
  return out;
};

/** Details shown next to an audit entry (without the change map and impersonation noise). */
const detailsOf = (details: Prisma.JsonValue | null) => {
  const { changes: _c, fields: _f, impersonating: _i, ...rest } = obj(details);
  void _c;
  void _f;
  void _i;
  return rest;
};

const names = async (ids: (string | null)[]) => {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
};

/**
 * One page of the merged timeline. Both sources are read up to page × pageSize (newest first), merged and cut,
 * so paging is exact; `total` counts both.
 */
export const timeline = async (owner: Owner, opts: { page: number; pageSize: number; audit: boolean; kind?: string }, viewer: { id: string; role: Parameters<typeof hasMinRole>[0] }) => {
  const take = opts.page * opts.pageSize;
  const actWhere: Prisma.PartnerActivityWhereInput = { ...ownerWhere(owner), ...(opts.kind && opts.kind !== 'CHANGE' ? { kind: opts.kind } : {}) };
  const auditWhere: Prisma.AuditLogWhereInput = { target: { in: ownerAuditTargets(owner) }, action: { notIn: HIDDEN_ACTIONS } };
  const withActivities = opts.kind !== 'CHANGE';
  const withAudit = opts.audit && (!opts.kind || opts.kind === 'CHANGE');
  const [acts, actTotal, audits, auditTotal] = await Promise.all([
    withActivities ? prisma.partnerActivity.findMany({ where: actWhere, orderBy: [{ at: 'desc' }, { id: 'desc' }], take }) : [],
    withActivities ? prisma.partnerActivity.count({ where: actWhere }) : 0,
    withAudit ? prisma.auditLog.findMany({ where: auditWhere, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take }) : [],
    withAudit ? prisma.auditLog.count({ where: auditWhere }) : 0,
  ]);
  const contactIds = [...new Set(acts.map((a) => a.contactId).filter((x): x is string => !!x))];
  const [who, contacts] = await Promise.all([
    names([...acts.map((a) => a.createdById), ...audits.map((a) => a.actorId)]),
    contactIds.length ? prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
  ]);
  const contactName = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName ?? ''}`.trim()]));
  const isAdmin = hasMinRole(viewer.role, 'ADMIN');
  const items: TimelineItem[] = [
    ...acts.map(
      (a): TimelineItem => ({
        type: 'activity',
        id: a.id,
        at: a.at.toISOString(),
        kind: a.kind,
        body: a.body,
        contact: a.contactId && contactName.has(a.contactId) ? { id: a.contactId, name: contactName.get(a.contactId)! } : null,
        actor: a.createdById ? { id: a.createdById, name: who.get(a.createdById) ?? '—' } : null,
        canEdit: isAdmin || a.createdById === viewer.id,
      }),
    ),
    ...audits.map(
      (a): TimelineItem => ({
        type: 'audit',
        id: a.id,
        at: a.createdAt.toISOString(),
        action: a.action,
        actor: a.actorId ? { id: a.actorId, name: who.get(a.actorId) ?? '—' } : null,
        changes: changesOf(a.details),
        details: detailsOf(a.details),
      }),
    ),
  ].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  return { items: items.slice((opts.page - 1) * opts.pageSize, take), total: actTotal + auditTotal, page: opts.page, pageSize: opts.pageSize };
};
