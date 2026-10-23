import crypto from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { historyContext } from './context.js';
import { ENTITY_CONFIG, MODEL_ENTITY, touchedColumns, type EntityConfig } from './fields.js';
import { sameValue, sealValue, toJsonValue } from './values.js';

/**
 * Field-level change capture as a Prisma client extension (installed in src/db.ts).
 *
 * update / updateMany / upsert on Case, User and Company:
 *   1. no tracked column in `data` → the query runs untouched (no extra query at all);
 *   2. otherwise the tracked columns of the affected rows are read before and after the write and one
 *      FieldChange row per changed field is written — in the caller's interactive transaction when there is
 *      one, else in a small transaction of its own, so the history commits (or rolls back) with the change.
 * Actor, source and request id come from the AsyncLocalStorage request context (lib/history/context.ts).
 * Nested writes (e.g. `company.update({ data: { users: { update … } } })`) are not followed.
 */

type Row = Record<string, unknown> & { id: string };
interface Delegate {
  findMany(args: unknown): Promise<Row[]>;
  findUnique(args: unknown): Promise<Row | null>;
}
interface FieldChangeDelegate {
  createMany(args: { data: Prisma.FieldChangeCreateManyInput[] }): Promise<unknown>;
  updateMany(args: { where: Prisma.FieldChangeWhereInput; data: Prisma.FieldChangeUpdateManyMutationInput }): Promise<unknown>;
}
type Client = Record<string, unknown> & { fieldChange: FieldChangeDelegate };

/** updateMany over more rows than this records only the first ones (bulk maintenance jobs). */
const MAX_ROWS = 500;

let idSeq = 0;
/** Time-ordered ids (timestamp · counter · random), so rows written in the same millisecond keep their order. */
const changeId = () =>
  `${Date.now().toString(36).padStart(9, '0')}${(idSeq++ % 1679616).toString(36).padStart(4, '0')}${crypto.randomBytes(5).toString('hex')}`;

type HookParams = {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: unknown) => Promise<unknown>;
  __internalParams?: { transaction?: { kind?: string } };
};

const diffRows = (cfg: EntityConfig, columns: string[], before: Row[], after: Row[]) => {
  const ctx = historyContext();
  const requestId = ctx?.requestId ?? crypto.randomUUID();
  const afterById = new Map(after.map((r) => [r.id, r]));
  const rows: Prisma.FieldChangeCreateManyInput[] = [];
  const reverted: { originalId: string; changeId: string }[] = [];
  for (const b of before) {
    const a = afterById.get(b.id);
    if (!a) continue;
    for (const column of columns) {
      const meta = cfg.fields[column]!;
      const pairs: [string, unknown, unknown][] = [];
      if (cfg.expand.includes(column)) {
        const bo = (b[column] && typeof b[column] === 'object' ? b[column] : {}) as Record<string, unknown>;
        const ao = (a[column] && typeof a[column] === 'object' ? a[column] : {}) as Record<string, unknown>;
        for (const key of new Set([...Object.keys(bo), ...Object.keys(ao)])) pairs.push([`${column}.${key}`, bo[key] ?? null, ao[key] ?? null]);
      } else {
        pairs.push([column, b[column] ?? null, a[column] ?? null]);
      }
      for (const [field, oldV, newV] of pairs) {
        if (sameValue(oldV, newV)) continue;
        const id = changeId();
        const revertOfId = ctx?.revertOf?.get(`${cfg.entity}:${b.id}:${field}`) ?? null;
        if (revertOfId) reverted.push({ originalId: revertOfId, changeId: id });
        rows.push({
          id,
          entity: cfg.entity,
          entityId: b.id,
          field,
          oldValue: (meta.sensitive ? sealValue(oldV) : toJsonValue(oldV)) as Prisma.InputJsonValue,
          newValue: (meta.sensitive ? sealValue(newV) : toJsonValue(newV)) as Prisma.InputJsonValue,
          actorId: ctx?.actorId ?? null,
          actorRole: ctx?.actorRole ?? null,
          source: ctx?.source ?? 'system',
          requestId,
          revertOfId,
          sensitive: !!meta.sensitive,
        });
      }
    }
  }
  // JSON null must be Prisma.JsonNull (a plain null is rejected for Json? columns in createMany).
  for (const r of rows) {
    if (r.oldValue === null) r.oldValue = Prisma.JsonNull;
    if (r.newValue === null) r.newValue = Prisma.JsonNull;
  }
  return { rows, reverted };
};

const capture = async (
  client: Client,
  cfg: EntityConfig,
  operation: string,
  args: Record<string, unknown>,
  columns: string[],
  run: () => Promise<unknown>,
) => {
  const delegate = client[cfg.delegate] as Delegate;
  const select = { id: true, ...Object.fromEntries(columns.map((c) => [c, true])) };
  const before =
    operation === 'updateMany'
      ? await delegate.findMany({ where: args.where, select, take: MAX_ROWS })
      : await delegate.findUnique({ where: args.where, select }).then((r) => (r ? [r] : []));
  const result = await run();
  if (!before.length) return result; // nothing matched, or an upsert that created the row
  const after = await delegate.findMany({ where: { id: { in: before.map((r) => r.id) } }, select });
  const { rows, reverted } = diffRows(cfg, columns, before, after);
  if (rows.length) {
    try {
      await client.fieldChange.createMany({ data: rows });
      for (const r of reverted) {
        await client.fieldChange.updateMany({ where: { id: r.originalId }, data: { revertedById: r.changeId, revertedAt: new Date() } });
      }
    } catch (err) {
      // History must never break the change itself.
      console.error('[history] could not record changes', cfg.entity, err);
    }
  }
  return result;
};

type ItxCapable = PrismaClient & { _createItxClient?: (tx: unknown) => Client };

export const historyExtension = (base: PrismaClient) => {
  const hook = async (params: HookParams) => {
    const { operation, args, query } = params;
    if (operation !== 'update' && operation !== 'updateMany' && operation !== 'upsert') return query(args);
    const entity = params.model ? MODEL_ENTITY[params.model] : undefined;
    if (!entity) return query(args);
    const cfg = ENTITY_CONFIG[entity];
    const columns = touchedColumns(cfg, operation === 'upsert' ? args.update : args.data);
    if (!columns.length) return query(args);

    const tx = params.__internalParams?.transaction;
    const itxFactory = (base as ItxCapable)._createItxClient;
    if (tx?.kind === 'itx' && typeof itxFactory === 'function') {
      // Inside prisma.$transaction(async (tx) => …): read and write through the same transaction.
      return capture(itxFactory.call(base, tx), cfg, operation, args, columns, () => query(args));
    }
    if (tx) {
      // Batch transaction (prisma.$transaction([…])): history is written next to it (not atomically).
      return capture(base as unknown as Client, cfg, operation, args, columns, () => query(args));
    }
    return base.$transaction(async (t) => {
      const client = t as unknown as Client;
      const delegate = client[cfg.delegate] as Record<string, (a: unknown) => Promise<unknown>>;
      return capture(client, cfg, operation, args, columns, () => delegate[operation]!(args));
    });
  };
  return Prisma.defineExtension({
    name: 'field-history',
    query: {
      case: { $allOperations: hook as never },
      user: { $allOperations: hook as never },
      company: { $allOperations: hook as never },
    },
  });
};
