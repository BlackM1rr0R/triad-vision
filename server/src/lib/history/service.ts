import type { CaseStatus, FieldChange, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';
import { hasMinRole, revokeUserSessions } from '../../middleware/auth.js';
import { FINAL_STATUSES, staffCancel, staffRejectSignature, staffReopen, staffRequestChanges } from '../caseFlow.js';
import { syncCaseFolder, syncClientFolders } from '../drive/caseFolders.js';
import { withHistory } from './context.js';
import { ENTITY_CONFIG, fieldMeta, type FieldKind, type HistoryEntity } from './fields.js';
import { maskValue, openValue, sameValue } from './values.js';

export interface Viewer {
  id: string;
  role: Role;
}

/** Until the masking stream lands an "unmask" permission, only the super admin sees sensitive values in clear. */
export const canUnmask = (viewer: Viewer) => viewer.role === 'SUPER_ADMIN';

/** User fields only the super admin may change (mirrors PATCH /api/admin/users/:id). */
const SUPER_ONLY_USER_FIELDS = new Set(['role', 'isActive', 'email']);

const ID_KINDS: FieldKind[] = ['user', 'company', 'vacancy', 'visaCategory', 'case', 'partner', 'agent'];

type Label = string | Prisma.JsonValue;

/** Names for the ids that appear as values (assigned staff, employer, vacancy …), one query per kind. */
const resolveLabels = async (ids: Record<string, Set<string>>) => {
  const out: Record<string, Record<string, Label>> = {};
  const list = (k: string) => [...(ids[k] ?? [])];
  const [users, companies, vacancies, categories, cases, partners, agents] = await Promise.all([
    list('user').length ? prisma.user.findMany({ where: { id: { in: list('user') } }, select: { id: true, firstName: true, lastName: true } }) : [],
    list('company').length ? prisma.company.findMany({ where: { id: { in: list('company') } }, select: { id: true, name: true } }) : [],
    list('vacancy').length ? prisma.vacancy.findMany({ where: { id: { in: list('vacancy') } }, select: { id: true, title: true } }) : [],
    list('visaCategory').length ? prisma.visaCategory.findMany({ where: { id: { in: list('visaCategory') } }, select: { id: true, title: true } }) : [],
    list('case').length ? prisma.case.findMany({ where: { id: { in: list('case') } }, select: { id: true, number: true } }) : [],
    list('partner').length ? prisma.referralPartner.findMany({ where: { id: { in: list('partner') } }, select: { id: true, name: true } }) : [],
    list('agent').length ? prisma.agent.findMany({ where: { id: { in: list('agent') } }, select: { id: true, code: true } }) : [],
  ]);
  out.user = Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  out.company = Object.fromEntries(companies.map((c) => [c.id, c.name]));
  out.vacancy = Object.fromEntries(vacancies.map((v) => [v.id, v.title]));
  out.visaCategory = Object.fromEntries(categories.map((v) => [v.id, v.title]));
  out.case = Object.fromEntries(cases.map((c) => [c.id, c.number]));
  out.partner = Object.fromEntries(partners.map((p) => [p.id, p.name]));
  out.agent = Object.fromEntries(agents.map((a) => [a.id, a.code]));
  return out;
};

/** "TV-2026-0012 · Ali Mammadov", "Leyla Aliyeva", "Muster GmbH" for the global changes page. */
const entityLabels = async (rows: Pick<FieldChange, 'entity' | 'entityId'>[]) => {
  const ids = (e: HistoryEntity) => [...new Set(rows.filter((r) => r.entity === e).map((r) => r.entityId))];
  const [cases, users, companies] = await Promise.all([
    ids('CASE').length ? prisma.case.findMany({ where: { id: { in: ids('CASE') } }, select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } }) : [],
    ids('USER').length ? prisma.user.findMany({ where: { id: { in: ids('USER') } }, select: { id: true, firstName: true, lastName: true, role: true } }) : [],
    ids('COMPANY').length ? prisma.company.findMany({ where: { id: { in: ids('COMPANY') } }, select: { id: true, name: true } }) : [],
  ]);
  const map = new Map<string, { label: string; role?: Role }>();
  for (const c of cases) map.set(`CASE:${c.id}`, { label: `${c.number} · ${c.client.firstName} ${c.client.lastName}`.trim() });
  for (const u of users) map.set(`USER:${u.id}`, { label: `${u.firstName} ${u.lastName}`.trim(), role: u.role });
  for (const c of companies) map.set(`COMPANY:${c.id}`, { label: c.name });
  return map;
};

/** The value as the viewer may see it: sensitive values masked unless the viewer may unmask. */
const visibleValue = (row: FieldChange, stored: Prisma.JsonValue | null, viewer: Viewer) => {
  const plain = openValue(stored);
  if (!row.sensitive || canUnmask(viewer)) return plain;
  return maskValue(plain);
};

export interface HistoryQuery {
  entity?: HistoryEntity;
  entityId?: string;
  actorId?: string;
  field?: string;
  source?: string;
  requestId?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

/** STAFF may read the history of cases assigned to them; everything else is ADMIN+. */
export const assertCanRead = async (viewer: Viewer, q: Pick<HistoryQuery, 'entity' | 'entityId'>) => {
  if (hasMinRole(viewer.role, 'ADMIN')) return;
  if (q.entity === 'CASE' && q.entityId) {
    const c = await prisma.case.findUnique({ where: { id: q.entityId }, select: { assignedStaffId: true } });
    if (c && c.assignedStaffId === viewer.id) return;
  }
  throw new HttpError(403, 'FORBIDDEN');
};

export const listHistory = async (viewer: Viewer, q: HistoryQuery) => {
  const where: Prisma.FieldChangeWhereInput = {
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.field ? (q.field.endsWith('.') ? { field: { startsWith: q.field } } : { field: q.field }) : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.requestId ? { requestId: q.requestId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.fieldChange.count({ where }),
    prisma.fieldChange.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);

  // Names for actors and id values.
  const ids: Record<string, Set<string>> = { user: new Set() };
  for (const r of rows) {
    if (r.actorId) ids.user!.add(r.actorId);
    const meta = fieldMeta(r.entity as HistoryEntity, r.field);
    if (meta && ID_KINDS.includes(meta.kind) && !r.sensitive) {
      for (const v of [r.oldValue, r.newValue]) if (typeof v === 'string') (ids[meta.kind] ??= new Set()).add(v);
    }
  }
  const [labels, entities] = await Promise.all([resolveLabels(ids), entityLabels(rows)]);

  // Only the latest status change of a case can be undone (and only through the workflow rules).
  const statusCases = [...new Set(rows.filter((r) => r.entity === 'CASE' && r.field === 'status').map((r) => r.entityId))];
  const latestStatus = new Set<string>();
  for (const caseId of statusCases) {
    const last = await prisma.fieldChange.findFirst({ where: { entity: 'CASE', entityId: caseId, field: 'status' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
    if (last) latestStatus.add(last.id);
  }

  const mayRevert = hasMinRole(viewer.role, 'ADMIN');
  const items = rows.map((r) => {
    const meta = fieldMeta(r.entity as HistoryEntity, r.field);
    const masked = r.sensitive && !canUnmask(viewer);
    const oldValue = visibleValue(r, r.oldValue, viewer);
    const newValue = visibleValue(r, r.newValue, viewer);
    const label = (v: unknown) => (meta && ID_KINDS.includes(meta.kind) && typeof v === 'string' ? labels[meta.kind]?.[v] ?? null : null);
    const revertable =
      mayRevert &&
      !r.revertedAt &&
      !!meta &&
      (!r.sensitive || canUnmask(viewer)) &&
      (r.entity !== 'USER' || !SUPER_ONLY_USER_FIELDS.has(r.field) || viewer.role === 'SUPER_ADMIN') &&
      (r.field !== 'status' || r.entity !== 'CASE' || latestStatus.has(r.id));
    const ent = entities.get(`${r.entity}:${r.entityId}`);
    return {
      id: r.id,
      entity: r.entity,
      entityId: r.entityId,
      entityLabel: ent?.label ?? null,
      entityRole: ent?.role ?? null,
      field: r.field,
      kind: meta?.kind ?? 'text',
      enumName: meta?.enumName ?? null,
      oldValue,
      newValue,
      oldLabel: label(oldValue),
      newLabel: label(newValue),
      sensitive: r.sensitive,
      masked,
      actor: r.actorId ? { id: r.actorId, name: (labels.user?.[r.actorId] as string | undefined) ?? null, role: r.actorRole } : null,
      source: r.source,
      requestId: r.requestId,
      revertOfId: r.revertOfId,
      revertedById: r.revertedById,
      revertedAt: r.revertedAt,
      createdAt: r.createdAt,
      canRevert: revertable,
    };
  });
  return { items, total, page: q.page, pageSize: q.pageSize };
};

// ─── Revert ────────────────────────────────────────────────────────────

export interface RevertOptions {
  /** Revert although the field changed again since ("revert anyway"). Never applies to case status. */
  force?: boolean;
  /** Only check and describe what would happen. */
  dryRun?: boolean;
  /** Note for a workflow step back (client-visible staff note on "request changes" / reopen / cancel). */
  note?: string;
}

export interface RevertPlan {
  changeId: string;
  entity: HistoryEntity;
  entityId: string;
  field: string;
  current: unknown;
  target: unknown;
  /** Workflow action used for a status revert. */
  via?: 'REQUEST_CHANGES' | 'REJECT_SIGNATURE' | 'REOPEN' | 'CANCEL';
  forced: boolean;
}

/** Errors carry the data the confirmation dialog shows (current value, whether "revert anyway" is possible). */
export class RevertError extends HttpError {
  constructor(
    status: number,
    code: string,
    public details: Record<string, unknown> = {},
    message?: string,
  ) {
    super(status, code, message);
  }
}

/** Which workflow step (lib/caseFlow) leads from `from` back to `to`, if any. */
const statusStepBack = (from: CaseStatus, to: CaseStatus): RevertPlan['via'] | undefined => {
  if (from === 'DOCUMENTS_REVIEW' && to === 'DOCUMENTS_PENDING') return 'REQUEST_CHANGES';
  if (from === 'EMBASSY_REVIEW' && to === 'EMBASSY_DOCUMENTS') return 'REQUEST_CHANGES';
  if (from === 'CONTRACT_SIGNED' && to === 'CONTRACT_SENT') return 'REJECT_SIGNATURE';
  if ((from === 'REJECTED' || from === 'CANCELLED') && (to === 'DOCUMENTS_PENDING' || to === 'EMBASSY_DOCUMENTS')) return 'REOPEN';
  if (to === 'CANCELLED' && !FINAL_STATUSES.includes(from)) return 'CANCEL';
  return undefined;
};

const currentColumn = async (entity: HistoryEntity, entityId: string, column: string) => {
  const cfg = ENTITY_CONFIG[entity];
  const delegate = prisma[cfg.delegate] as unknown as { findUnique(a: unknown): Promise<Record<string, unknown> | null> };
  return delegate.findUnique({ where: { id: entityId }, select: { id: true, [column]: true } });
};

/** Value of a field path in a loaded row ("registerData.col1" → row.registerData.col1). */
const pathValue = (row: Record<string, unknown>, field: string) => {
  const [column, key] = field.split('.', 2) as [string, string | undefined];
  const v = row[column];
  if (key === undefined) return v ?? null;
  return v && typeof v === 'object' ? ((v as Record<string, unknown>)[key] ?? null) : null;
};

/** The old value as Prisma update input (dates back to Date, ids checked to still exist). */
const updateInput = async (entity: HistoryEntity, field: string, value: unknown, row: Record<string, unknown>) => {
  const [column, key] = field.split('.', 2) as [string, string | undefined];
  if (key !== undefined) {
    const obj = { ...((row[column] && typeof row[column] === 'object' ? row[column] : {}) as Record<string, unknown>) };
    if (value === null) delete obj[key];
    else obj[key] = value;
    return { [column]: obj as Prisma.InputJsonValue };
  }
  const meta = fieldMeta(entity, field)!;
  if (value === null) return { [column]: null };
  const missing = () => new RevertError(409, 'TARGET_MISSING', { field }, 'The record this field pointed to no longer exists');
  switch (meta.kind) {
    case 'date':
      return { [column]: new Date(String(value)) };
    case 'user': {
      const u = await prisma.user.findUnique({ where: { id: String(value) }, select: { role: true, isActive: true } });
      if (!u) throw missing();
      if (column === 'assignedStaffId' && !hasMinRole(u.role, 'STAFF')) throw new RevertError(409, 'INVALID_STAFF', { field });
      break;
    }
    case 'company':
      if (!(await prisma.company.count({ where: { id: String(value) } }))) throw missing();
      break;
    case 'vacancy':
      if (!(await prisma.vacancy.count({ where: { id: String(value) } }))) throw missing();
      break;
    case 'visaCategory':
      if (!(await prisma.visaCategory.count({ where: { id: String(value) } }))) throw missing();
      break;
    case 'case':
      if (!(await prisma.case.count({ where: { id: String(value) } }))) throw missing();
      break;
    case 'partner':
      if (!(await prisma.referralPartner.count({ where: { id: String(value) } }))) throw missing();
      break;
    case 'agent':
      if (!(await prisma.agent.count({ where: { id: String(value) } }))) throw missing();
      break;
    default:
      break;
  }
  return { [column]: value };
};

/** Checks a revert and describes it; throws RevertError when it may not (or cannot) happen. */
export const planRevert = async (viewer: Viewer, change: FieldChange, opts: RevertOptions): Promise<{ plan: RevertPlan; row: Record<string, unknown> }> => {
  const entity = change.entity as HistoryEntity;
  const meta = ENTITY_CONFIG[entity] ? fieldMeta(entity, change.field) : undefined;
  if (!meta) throw new RevertError(400, 'FIELD_NOT_REVERTABLE');
  if (change.sensitive && !canUnmask(viewer)) throw new RevertError(403, 'SENSITIVE_FIELD');
  if (entity === 'USER' && SUPER_ONLY_USER_FIELDS.has(change.field) && viewer.role !== 'SUPER_ADMIN') throw new RevertError(403, 'SUPER_ADMIN_ONLY');
  if (change.revertedAt) throw new RevertError(409, 'ALREADY_REVERTED', { revertedById: change.revertedById });

  const column = change.field.split('.')[0]!;
  const row = await currentColumn(entity, change.entityId, column);
  if (!row) throw new RevertError(404, 'RECORD_NOT_FOUND');
  const current = pathValue(row, change.field);
  const expected = openValue(change.newValue);
  const target = openValue(change.oldValue);
  const shown = (v: unknown) => (change.sensitive && !canUnmask(viewer) ? maskValue(v) : v);

  if (entity === 'USER') {
    if (change.entityId === viewer.id && (change.field === 'role' || change.field === 'isActive')) throw new RevertError(400, 'CANNOT_CHANGE_SELF');
    const u = await prisma.user.findUnique({ where: { id: change.entityId }, select: { role: true } });
    if (u?.role === 'SUPER_ADMIN' && (change.field === 'role' || change.field === 'isActive')) throw new RevertError(400, 'CANNOT_CHANGE_SUPER_ADMIN');
    if (change.field === 'role' && target === 'SUPER_ADMIN') throw new RevertError(400, 'CANNOT_CHANGE_SUPER_ADMIN');
  }

  if (entity === 'CASE' && change.field === 'status') {
    // A status is never set blindly: only the latest status change, only while it is still the current status,
    // and only through a step the workflow offers.
    const latest = await prisma.fieldChange.findFirst({ where: { entity: 'CASE', entityId: change.entityId, field: 'status' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
    if (latest?.id !== change.id) throw new RevertError(409, 'TRANSITION_NOT_ALLOWED', { reason: 'NOT_LATEST_STATUS_CHANGE', current }, 'Only the most recent status change can be reverted');
    if (!sameValue(current, expected)) throw new RevertError(409, 'CHANGED_SINCE', { current, canForce: false });
    const via = statusStepBack(current as CaseStatus, target as CaseStatus);
    if (!via) {
      throw new RevertError(409, 'TRANSITION_NOT_ALLOWED', { reason: 'NO_WORKFLOW_STEP', from: current, to: target }, `The case workflow has no step from ${String(current)} back to ${String(target)}`);
    }
    return { plan: { changeId: change.id, entity, entityId: change.entityId, field: change.field, current, target, via, forced: false }, row };
  }

  if (sameValue(current, target)) throw new RevertError(409, 'ALREADY_AT_OLD_VALUE', { current: shown(current) });
  if (!sameValue(current, expected) && !opts.force) throw new RevertError(409, 'CHANGED_SINCE', { current: shown(current), canForce: true });
  return {
    plan: { changeId: change.id, entity, entityId: change.entityId, field: change.field, current: shown(current), target: shown(target), forced: !sameValue(current, expected) },
    row,
  };
};

const applyRevert = async (viewer: Viewer, change: FieldChange, plan: RevertPlan, row: Record<string, unknown>, opts: RevertOptions) => {
  const entity = plan.entity;
  const revertOf = new Map([[`${entity}:${change.entityId}:${change.field}`, change.id]]);
  await withHistory({ source: 'revert', actorId: viewer.id, actorRole: viewer.role, revertOf }, async () => {
    if (plan.via) {
      const note = opts.note?.trim() || 'Status reverted';
      const to = plan.target as CaseStatus;
      if (plan.via === 'REQUEST_CHANGES') await staffRequestChanges(change.entityId, viewer.id, note);
      else if (plan.via === 'REJECT_SIGNATURE') await staffRejectSignature(change.entityId, viewer.id, note);
      else if (plan.via === 'REOPEN') await staffReopen(change.entityId, viewer.id, to as 'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS', note);
      else await staffCancel(change.entityId, viewer.id, note);
      return;
    }
    const data = await updateInput(entity, change.field, openValue(change.oldValue), row);
    const cfg = ENTITY_CONFIG[entity];
    const delegate = prisma[cfg.delegate] as unknown as { update(a: unknown): Promise<unknown> };
    await delegate.update({ where: { id: change.entityId }, data });
  });
  // Side effects the normal edit routes have.
  if (entity === 'CASE') {
    await prisma.caseEvent.create({ data: { caseId: change.entityId, type: 'CASE_UPDATED', note: `history revert: ${change.field}`, actorId: viewer.id, visibleToClient: false } }).catch(() => undefined);
    if (change.field === 'visaCategoryId') void syncCaseFolder(change.entityId);
  }
  if (entity === 'USER') {
    if (change.field === 'isActive' && openValue(change.oldValue) === false) await revokeUserSessions(change.entityId);
    if (['firstName', 'lastName', 'passportNumber'].includes(change.field)) void syncClientFolders(change.entityId);
  }
  // Mark the original even when the write produced no history row of its own (e.g. a workflow step that
  // landed on the old value through another field path).
  const own = await prisma.fieldChange.findFirst({ where: { revertOfId: change.id }, select: { id: true } });
  if (!own) await prisma.fieldChange.updateMany({ where: { id: change.id, revertedAt: null }, data: { revertedAt: new Date() } });
  return own?.id ?? null;
};

export const revertChange = async (viewer: Viewer, changeId: string, opts: RevertOptions) => {
  const change = await prisma.fieldChange.findUnique({ where: { id: changeId } });
  if (!change) throw new RevertError(404, 'CHANGE_NOT_FOUND');
  const { plan, row } = await planRevert(viewer, change, opts);
  if (opts.dryRun) return { plan, revertChangeId: null };
  const revertChangeId = await applyRevert(viewer, change, plan, row, opts);
  return { plan, revertChangeId };
};

/**
 * "Revert everything this action did": every not yet reverted change of one request (optionally limited to
 * one record), newest first, case status last (it goes through the workflow and may rewrite the note).
 * Each change is checked on its own; the result lists what was reverted and what was not.
 */
export const revertRequest = async (viewer: Viewer, requestId: string, scope: { entity?: HistoryEntity; entityId?: string }, opts: RevertOptions) => {
  const changes = await prisma.fieldChange.findMany({
    where: { requestId, revertedAt: null, ...(scope.entity ? { entity: scope.entity } : {}), ...(scope.entityId ? { entityId: scope.entityId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (!changes.length) throw new RevertError(404, 'NOTHING_TO_REVERT');
  const ordered = [...changes.filter((c) => !(c.entity === 'CASE' && c.field === 'status')), ...changes.filter((c) => c.entity === 'CASE' && c.field === 'status')];
  const results: { changeId: string; entity: string; entityId: string; field: string; ok: boolean; error?: string; details?: Record<string, unknown>; plan?: RevertPlan }[] = [];
  for (const change of ordered) {
    try {
      const { plan, row } = await planRevert(viewer, change, opts);
      if (!opts.dryRun) await applyRevert(viewer, change, plan, row, opts);
      results.push({ changeId: change.id, entity: change.entity, entityId: change.entityId, field: change.field, ok: true, plan });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      results.push({
        changeId: change.id,
        entity: change.entity,
        entityId: change.entityId,
        field: change.field,
        ok: false,
        error: err.code,
        ...(err instanceof RevertError ? { details: err.details } : {}),
      });
    }
  }
  return { results, reverted: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
};
