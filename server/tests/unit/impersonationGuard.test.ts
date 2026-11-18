import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../src/lib/http.js';
import {
  IMPERSONATION_WRITABLE_MODELS,
  impersonationAllows,
  impersonationQueryHook,
  impersonationStore,
  isImpersonating,
  outsideImpersonation,
  WRITE_OPERATIONS,
} from '../../src/lib/privacy/impersonationContext.js';
import { prisma } from '../../src/db.js';

const ctx = { sessionId: 'imp-1', adminId: 'admin-1', targetUserId: 'client-1' };
const viewing = <T>(fn: () => T) => impersonationStore.run(ctx, fn);

/** Runs the guard hook with a fake `query` that records what reached the database. */
const call = (model: string | undefined, operation: string, args: unknown = {}) => {
  const query = vi.fn((a: unknown) => ({ ran: true, args: a }));
  const result = impersonationQueryHook({ model, operation, args, query });
  return { query, result };
};

const forbidden = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
    expect((err as HttpError).message).toBe('IMPERSONATION_READ_ONLY');
    return;
  }
  throw new Error('expected IMPERSONATION_READ_ONLY');
};

describe('impersonation write guard', () => {
  it('leaves a normal (non-impersonated) request completely alone: every operation reaches the database unchanged', () => {
    expect(isImpersonating()).toBe(false);
    for (const op of [...WRITE_OPERATIONS, 'findMany', 'findUnique', 'count', 'aggregate', '$queryRaw']) {
      for (const model of ['Document', 'CaseMessage', 'AuditLog', 'Session', undefined]) {
        const args = { data: { actorId: 'client-1', details: { a: 1 } } };
        const { query, result } = call(model, op, args);
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][0]).toBe(args);
        expect(args.data).toEqual({ actorId: 'client-1', details: { a: 1 } }); // not rewritten
        expect(result).toEqual({ ran: true, args });
      }
    }
  });

  it('blocks every write on a non-allowlisted model while viewing as the client', () =>
    viewing(() => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      for (const model of ['Document', 'CaseMessage', 'Notification', 'User', 'Session', 'PushDevice', 'DocumentAccessLog', 'FamilyMember']) {
        for (const op of WRITE_OPERATIONS) {
          const query = vi.fn();
          forbidden(() => impersonationQueryHook({ model, operation: op, args: {}, query }));
          expect(query).not.toHaveBeenCalled();
        }
      }
      // Raw writes have no model.
      for (const op of ['$executeRaw', '$executeRawUnsafe']) forbidden(() => call(undefined, op));
      warn.mockRestore();
    }));

  it('still allows reads while viewing', () =>
    viewing(() => {
      for (const op of ['findMany', 'findUnique', 'findFirst', 'count', 'aggregate', 'groupBy', '$queryRaw']) {
        expect(call('Document', op).query).toHaveBeenCalledTimes(1);
      }
    }));

  it('allows the impersonation bookkeeping and audit rows, the latter always attributed to the admin', () =>
    viewing(() => {
      expect([...IMPERSONATION_WRITABLE_MODELS].sort()).toEqual(['AuditLog', 'ImpersonationLog', 'ImpersonationSession']);
      for (const op of ['create', 'update', 'updateMany', 'createMany']) {
        expect(call('ImpersonationSession', op).query).toHaveBeenCalledTimes(1);
        expect(call('ImpersonationLog', op).query).toHaveBeenCalledTimes(1);
      }

      const own = { data: { actorId: 'admin-1', action: 'X', details: { impersonating: 'client-1' } } };
      call('AuditLog', 'create', own);
      expect(own.data.actorId).toBe('admin-1');

      const asClient = { data: { actorId: 'client-1', action: 'CV_DOWNLOADED', details: { lang: 'de' } } };
      call('AuditLog', 'create', asClient);
      expect(asClient.data).toEqual({ actorId: 'admin-1', action: 'CV_DOWNLOADED', details: { lang: 'de', impersonating: 'client-1' } });

      const many = { data: [{ actorId: null, action: 'A', details: 'x' }] };
      call('AuditLog', 'createMany', many);
      expect(many.data[0]).toEqual({ actorId: 'admin-1', action: 'A', details: { value: 'x', impersonating: 'client-1' } });

      // The audit trail itself cannot be changed or erased.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      for (const op of ['update', 'updateMany', 'upsert', 'delete', 'deleteMany']) forbidden(() => call('AuditLog', op));
      warn.mockRestore();
    }));

  it('impersonationAllows is the pure decision behind it', () => {
    expect(impersonationAllows('Document', 'findMany')).toBe(true);
    expect(impersonationAllows('Document', 'create')).toBe(false);
    expect(impersonationAllows(undefined, '$executeRaw')).toBe(false);
    expect(impersonationAllows('AuditLog', 'create')).toBe(true);
    expect(impersonationAllows('AuditLog', 'deleteMany')).toBe(false);
    expect(impersonationAllows('ImpersonationLog', 'create')).toBe(true);
    expect(impersonationAllows('Session', 'update')).toBe(false);
  });

  it('outsideImpersonation leaves the context (shared caches, timers), and the context does not leak after the request', async () => {
    await viewing(async () => {
      expect(isImpersonating()).toBe(true);
      expect(outsideImpersonation(() => isImpersonating())).toBe(false);
      expect(outsideImpersonation(() => call('RealSalarySnapshot', 'create').query)).toHaveBeenCalledTimes(1);
      // A timer scheduled outside the context does not inherit it.
      const seen = await new Promise<boolean>((resolve) => outsideImpersonation(() => setTimeout(() => resolve(isImpersonating()), 0)));
      expect(seen).toBe(false);
      // …one scheduled inside does (which is why shared timers use outsideImpersonation).
      expect(await new Promise<boolean>((resolve) => setTimeout(() => resolve(isImpersonating()), 0))).toBe(true);
    });
    expect(isImpersonating()).toBe(false);
  });

  it('is installed on the shared Prisma client, before the field-history hook (no database needed: the write is refused first)', async () =>
    viewing(async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      // Case is a field-history model: the history hook would open a transaction on the base client if it ran first.
      await expect(prisma.case.update({ where: { id: 'nope' }, data: { profession: 'x' } })).rejects.toMatchObject({ status: 403, message: 'IMPERSONATION_READ_ONLY' });
      await expect(prisma.document.deleteMany({ where: { id: 'nope' } })).rejects.toMatchObject({ status: 403, message: 'IMPERSONATION_READ_ONLY' });
      await expect(prisma.notification.create({ data: { userId: 'u', type: 'INFO', title: 't', body: 'b' } })).rejects.toMatchObject({ status: 403 });
      await expect(prisma.$executeRawUnsafe('DELETE FROM `Document` WHERE id = ?', 'nope')).rejects.toMatchObject({ status: 403 });
      warn.mockRestore();
    }));
});
