import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';
import { HttpError } from '../http.js';

/**
 * Request-scoped "an admin is viewing a client's portal" flag (see lib/privacy/impersonation.ts).
 * Kept free of database imports: db.ts installs the read-only write guard below.
 */
export interface ImpersonationContext {
  sessionId: string;
  adminId: string;
  targetUserId: string;
}

export const impersonationStore = new AsyncLocalStorage<ImpersonationContext>();

export const isImpersonating = () => !!impersonationStore.getStore();

/**
 * Runs `fn` outside the impersonation context (no guard, isImpersonating() false). Only for process-wide work that
 * merely starts during an impersonated request and is shared with every other visitor — e.g. a public cache built on
 * first read (real salaries snapshot, city-cost seed, CBAR rate, job feeds) or a timer scheduled from a request.
 * Never for the viewed user's own data.
 */
export const outsideImpersonation = <T>(fn: () => T): T => impersonationStore.exit(fn);

export const IMPERSONATION_READ_ONLY = 'IMPERSONATION_READ_ONLY';

export const WRITE_OPERATIONS: ReadonlySet<string> = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  '$executeRaw',
  '$executeRawUnsafe',
  '$runCommandRaw',
]);

/**
 * Models that may still be written while impersonating:
 *  - ImpersonationSession / ImpersonationLog: the view's own bookkeeping (request count, viewed paths, end).
 *  - AuditLog (create only): the audit trail. Rows are always attributed to the admin (actorId rewritten below,
 *    the viewed user noted in details.impersonating), so the client never gets an audit row of their own.
 * Everything else — including the staff access logs (DocumentAccessLog: support views are listed from
 * ImpersonationSession instead) and Session (the admin's own lastSeenAt touch runs in loadUser, before the
 * context is entered; the client's sessions are never touched) — is refused.
 */
export const IMPERSONATION_WRITABLE_MODELS: ReadonlySet<string> = new Set(['AuditLog', 'ImpersonationSession', 'ImpersonationLog']);
const AUDIT_OPERATIONS = new Set(['create', 'createMany']);

type AuditRow = { actorId?: string | null; details?: unknown };

/** The audit row as written under impersonation: the admin is the actor, the viewed user is noted. */
const asAdminAudit = (row: AuditRow, ctx: ImpersonationContext): AuditRow => {
  if (row.actorId === ctx.adminId) return row;
  const d = row.details;
  const details = d && typeof d === 'object' && !Array.isArray(d) ? { ...(d as object), impersonating: ctx.targetUserId } : { value: d ?? null, impersonating: ctx.targetUserId };
  return { ...row, actorId: ctx.adminId, details };
};

/** Pure decision (unit-tested): may this operation run inside the given impersonation context? */
export const impersonationAllows = (model: string | undefined, operation: string) => {
  if (!WRITE_OPERATIONS.has(operation)) return true;
  if (!model || !IMPERSONATION_WRITABLE_MODELS.has(model)) return false;
  return model !== 'AuditLog' || AUDIT_OPERATIONS.has(operation);
};

/**
 * Safety net under the route-level guard: inside an impersonated request no database write may happen
 * (lazy "get or create" on a GET, a read receipt, a view counter …). The request fails with
 * 403 IMPERSONATION_READ_ONLY instead of changing the client's data. Call sites with an optional lazy write
 * skip it explicitly with isImpersonating(); this guard catches the ones that were missed.
 * Outside an impersonated request it only costs one AsyncLocalStorage lookup.
 */
export const impersonationQueryHook = <R>({ model, operation, args, query }: { model?: string; operation: string; args: unknown; query: (args: unknown) => R }): R => {
  const ctx = impersonationStore.getStore();
  if (!ctx || !WRITE_OPERATIONS.has(operation)) return query(args);
  if (!impersonationAllows(model, operation)) {
    console.warn(`[impersonation] blocked ${model ?? 'raw'}.${operation} while viewing user ${ctx.targetUserId}`);
    throw new HttpError(403, IMPERSONATION_READ_ONLY);
  }
  if (model === 'AuditLog') {
    const a = args as { data: AuditRow | AuditRow[] };
    a.data = Array.isArray(a.data) ? a.data.map((r) => asAdminAudit(r, ctx)) : asAdminAudit(a.data, ctx);
  }
  return query(args);
};

export const impersonationWriteGuard = Prisma.defineExtension({
  name: 'impersonation-read-only',
  query: { $allOperations: impersonationQueryHook },
});
