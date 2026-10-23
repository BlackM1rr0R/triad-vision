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

/** The running impersonation, when the current code runs on behalf of an admin viewing a client. */
export const currentImpersonation = () => impersonationStore.getStore();
export const isImpersonating = () => !!impersonationStore.getStore();

const WRITE_OPERATIONS = new Set([
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

/** Rows that may still be written while impersonating: the audit trail and the impersonation records. */
const ALLOWED_MODELS = new Set(['AuditLog', 'ImpersonationSession', 'ImpersonationLog', 'Session']);

/**
 * Safety net under the route-level guard: inside an impersonated request no database write may happen
 * (lazy "get or create" on a GET, a read receipt, a view counter …). The request fails with
 * 403 IMPERSONATION_READ_ONLY instead of changing the client's data.
 */
export const impersonationWriteGuard = Prisma.defineExtension({
  name: 'impersonation-read-only',
  query: {
    $allOperations({ model, operation, args, query }) {
      if (impersonationStore.getStore() && WRITE_OPERATIONS.has(operation) && !(model && ALLOWED_MODELS.has(model))) {
        throw new HttpError(403, 'IMPERSONATION_READ_ONLY');
      }
      return query(args);
    },
  },
});
