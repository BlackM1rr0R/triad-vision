import type { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError, badRequest, forbidden } from '../http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { dateKey, dayRange, relativeRange } from './dates.js';
import { datasetByKey } from './datasets.js';
import type { Masker } from './mask.js';
import {
  AGG_FNS,
  FILTER_OPS,
  GRANULARITIES,
  L,
  MAX_ROWS,
  OPS_BY_TYPE,
  QUERY_TIMEOUT_MS,
  RELATIVE_RANGES,
  type AggFn,
  type ColType,
  type ColumnDef,
  type DatasetDef,
  type FilterOp,
  type Granularity,
  type L10n,
  type Lang,
  type Rec,
  type RunCtx,
} from './types.js';

/**
 * Runs a report: validates the config against the dataset definition (only listed columns, operators allowed
 * for the column type, masked columns never filterable / groupable), builds one Prisma query (filters on
 * database paths, relations resolved in the same query), applies computed-column filters and sorting in
 * memory, groups and aggregates, and computes the totals row. At most MAX_ROWS records are read.
 */

const colKey = z.string().min(1).max(80);

export const reportConfigSchema = z.object({
  columns: z.array(colKey).max(40).default([]),
  filters: z.array(z.object({ column: colKey, op: z.enum(FILTER_OPS), value: z.unknown().optional() })).max(20).default([]),
  groupBy: z.array(z.object({ column: colKey, granularity: z.enum(GRANULARITIES).optional() })).max(2).default([]),
  aggregations: z.array(z.object({ column: colKey, fn: z.enum(AGG_FNS) })).max(12).default([]),
  sort: z.object({ column: colKey, dir: z.enum(['asc', 'desc']) }).nullable().optional(),
  chart: z.object({ type: z.enum(['bar', 'line', 'pie']), metric: colKey.optional() }).nullable().optional(),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

export interface OutColumn {
  key: string;
  label: L10n;
  type: ColType | 'period';
  /** Source column (grouped results). */
  column?: string;
  fn?: AggFn;
  enumLabels?: Record<string, L10n>;
  masked?: boolean;
}

export interface ReportResult {
  dataset: string;
  grouped: boolean;
  columns: OutColumn[];
  rows: Rec[];
  /** Matching records (ungrouped) or groups (grouped). */
  total: number;
  /** Records counted before grouping. */
  records: number;
  /** More than MAX_ROWS records matched: only the first MAX_ROWS were used. */
  truncated: boolean;
  totals: Rec | null;
  masked: string[];
}

export const AGG_LABEL: Record<AggFn, L10n> = {
  count: L('Say', 'Anzahl', 'Count', 'Количество'),
  sum: L('Cəmi', 'Summe', 'Sum', 'Сумма'),
  avg: L('Orta', 'Durchschnitt', 'Average', 'Среднее'),
  min: L('Minimum', 'Minimum', 'Minimum', 'Минимум'),
  max: L('Maksimum', 'Maximum', 'Maximum', 'Максимум'),
};

export const aggKey = (fn: AggFn, column: string) => (fn === 'count' ? 'count' : `${fn}_${column}`);

// ─── Validation ─────────────────────────────────────────────────────────

interface NormFilter {
  col: ColumnDef;
  op: FilterOp;
  /** string | number (money: cents) | [lo, hi] | string[] | boolean | { start, end } */
  v: unknown;
}

const bad = (code: string, detail?: string) => badRequest(code, detail);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const normValue = (col: ColumnDef, op: FilterOp, raw: unknown, ctx: RunCtx): unknown => {
  if (op === 'empty' || op === 'notEmpty') return null;
  const num = (x: unknown) => {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw bad('REPORT_FILTER_VALUE', col.key);
    return col.type === 'money' ? Math.round(n * 100) : n;
  };
  switch (col.type) {
    case 'string': {
      const s = String(raw ?? '').trim();
      if (!s || s.length > 200) throw bad('REPORT_FILTER_VALUE', col.key);
      return s;
    }
    case 'number':
    case 'money': {
      if (op === 'between') {
        if (!Array.isArray(raw) || raw.length !== 2) throw bad('REPORT_FILTER_VALUE', col.key);
        const [lo, hi] = [num(raw[0]), num(raw[1])];
        if (lo === null && hi === null) throw bad('REPORT_FILTER_VALUE', col.key);
        return [lo, hi];
      }
      const n = num(raw);
      if (n === null) throw bad('REPORT_FILTER_VALUE', col.key);
      return n;
    }
    case 'date': {
      if (op === 'relative') {
        if (!(RELATIVE_RANGES as readonly string[]).includes(String(raw))) throw bad('REPORT_FILTER_VALUE', col.key);
        return relativeRange(raw as (typeof RELATIVE_RANGES)[number], ctx.now);
      }
      if (op === 'between') {
        const o = (raw ?? {}) as { from?: unknown; to?: unknown };
        const from = typeof o.from === 'string' && ISO_DAY.test(o.from) ? o.from : null;
        const to = typeof o.to === 'string' && ISO_DAY.test(o.to) ? o.to : null;
        if (!from && !to) throw bad('REPORT_FILTER_VALUE', col.key);
        return { start: from ? dayRange(from, from).start : null, end: to ? dayRange(to, to).end : null };
      }
      if (typeof raw !== 'string' || !ISO_DAY.test(raw)) throw bad('REPORT_FILTER_VALUE', col.key);
      const r = dayRange(raw, raw);
      return op === 'before' ? { start: null, end: r.start } : { start: r.end, end: null };
    }
    case 'enum':
    case 'user': {
      const list = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x ?? '')).filter(Boolean);
      if (!list.length || list.length > 100) throw bad('REPORT_FILTER_VALUE', col.key);
      if (col.type === 'enum' && col.enumValues && list.some((x) => !col.enumValues!.includes(x))) throw bad('REPORT_FILTER_VALUE', col.key);
      return col.type === 'user' ? list.map((x) => (x === 'me' ? (ctx.userId ?? '') : x)) : list;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'false') return raw === 'true';
      throw bad('REPORT_FILTER_VALUE', col.key);
  }
};

export interface Plan {
  def: DatasetDef;
  config: ReportConfig;
  columns: ColumnDef[];
  filters: NormFilter[];
  groupBy: { col: ColumnDef; granularity: Granularity }[];
  aggregations: { col: ColumnDef | null; fn: AggFn }[];
  sort: { key: string; dir: 'asc' | 'desc' };
}

/** Whether a column is masked for this masker (platform masking group, or personal data for external recipients). */
export const isColumnMasked = (c: ColumnDef, masker: Masker) => (!!c.maskField && masker.masks(c.maskField)) || (!!c.personal && !!masker.personal);

export const datasetFor = (key: string, role: Role) => {
  const def = datasetByKey(key);
  if (!def) throw new HttpError(404, 'REPORT_DATASET_NOT_FOUND');
  if (!hasMinRole(role, def.minRole)) throw forbidden('REPORT_DATASET_FORBIDDEN');
  return def;
};

export const planReport = (def: DatasetDef, rawConfig: unknown, ctx: RunCtx, masker: Masker): Plan => {
  const config = reportConfigSchema.parse(rawConfig ?? {});
  const byKey = new Map(def.columns.map((c) => [c.key, c]));
  const colOf = (k: string) => {
    const c = byKey.get(k);
    if (!c) throw bad('REPORT_UNKNOWN_COLUMN', k);
    return c;
  };
  const isMasked = (c: ColumnDef) => isColumnMasked(c, masker);
  const columns = [...new Set(config.columns.length ? config.columns : def.columns.filter((c) => c.default).map((c) => c.key))].map(colOf);
  const filters = config.filters.map((f) => {
    const col = colOf(f.column);
    if (col.noFilter || isMasked(col)) throw bad('REPORT_FILTER_NOT_ALLOWED', col.key);
    if (!OPS_BY_TYPE[col.type].includes(f.op)) throw bad('REPORT_FILTER_OPERATOR', `${col.key}:${f.op}`);
    return { col, op: f.op, v: normValue(col, f.op, f.value, ctx) };
  });
  const groupBy = config.groupBy.map((g) => {
    const col = colOf(g.column);
    if (col.noGroup || isMasked(col) || col.type === 'number' || col.type === 'money') throw bad('REPORT_GROUP_NOT_ALLOWED', col.key);
    return { col, granularity: g.granularity ?? ('month' as Granularity) };
  });
  const aggregations = config.aggregations.map((a) => {
    if (a.fn === 'count') return { col: null, fn: a.fn };
    const col = colOf(a.column);
    const okType = a.fn === 'min' || a.fn === 'max' ? ['number', 'money', 'date'] : ['number', 'money'];
    if (!okType.includes(col.type)) throw bad('REPORT_AGGREGATION_NOT_ALLOWED', `${a.fn}:${col.key}`);
    return { col, fn: a.fn };
  });
  if (groupBy.length && !aggregations.some((a) => a.fn === 'count')) aggregations.unshift({ col: null, fn: 'count' });
  const uniqueAggs = aggregations.filter((a, i) => aggregations.findIndex((b) => b.fn === a.fn && b.col?.key === a.col?.key) === i);

  let sort = { key: def.defaultSort.column, dir: def.defaultSort.dir } as Plan['sort'];
  if (config.sort) {
    const validKeys = groupBy.length ? [...groupBy.map((g) => g.col.key), ...uniqueAggs.map((a) => aggKey(a.fn, a.col?.key ?? ''))] : def.columns.map((c) => c.key);
    if (!validKeys.includes(config.sort.column)) throw bad('REPORT_SORT_INVALID', config.sort.column);
    sort = { key: config.sort.column, dir: config.sort.dir };
  } else if (groupBy.length) sort = { key: groupBy[0].col.key, dir: 'asc' };
  return { def, config, columns, filters, groupBy, aggregations: uniqueAggs, sort };
};

// ─── Prisma query building ──────────────────────────────────────────────

const nest = (path: string, cond: unknown): Record<string, unknown> => {
  const parts = path.split('.');
  return parts.reduceRight<unknown>((acc, p) => ({ [p]: acc }), cond) as Record<string, unknown>;
};

/** Conditions that are true when the path is null (incl. a missing relation on the way). */
const nullConds = (path: string) => {
  const parts = path.split('.');
  const out = [nest(path, null)];
  for (let i = 1; i < parts.length; i++) out.push(nest(parts.slice(0, i).join('.'), { is: null }));
  return out;
};

const dateCond = (v: { start: Date | null; end: Date | null }) => ({ ...(v.start ? { gte: v.start } : {}), ...(v.end ? { lt: v.end } : {}) });

const dbCondition = (f: NormFilter): Record<string, unknown> | null => {
  const custom = f.col.where?.(f.op, f.v);
  if (custom) return custom;
  const path = f.col.path;
  if (!path || f.col.get) {
    // Getter columns are filtered on the computed value (in memory) — except user columns, whose path is the id.
    if (!(path && f.col.type === 'user')) return null;
  }
  const p = path!;
  const isText = f.col.type === 'string';
  switch (f.op) {
    case 'eq':
      return nest(p, { equals: f.v });
    case 'neq':
      return { OR: [nest(p, { not: f.v }), ...nullConds(p)] };
    case 'contains':
      return nest(p, { contains: f.v });
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return nest(p, { [f.op]: f.v });
    case 'between': {
      if (f.col.type === 'date') return nest(p, dateCond(f.v as { start: Date | null; end: Date | null }));
      const [lo, hi] = f.v as [number | null, number | null];
      return nest(p, { ...(lo !== null ? { gte: lo } : {}), ...(hi !== null ? { lte: hi } : {}) });
    }
    case 'relative':
    case 'before':
    case 'after':
      return nest(p, dateCond(f.v as { start: Date | null; end: Date | null }));
    case 'in':
      return nest(p, { in: f.v });
    case 'notIn':
      return { OR: [nest(p, { notIn: f.v }), ...nullConds(p)] };
    case 'empty':
      return { OR: [...nullConds(p), ...(isText ? [nest(p, '')] : [])] };
    case 'notEmpty':
      return { AND: [nest(p, { not: null }), ...(isText ? [nest(p, { not: '' })] : [])] };
    case 'is':
      return nest(p, f.v);
  }
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/** Deep-merges Prisma select fragments ({ a: true } + { a: { select: … } } → the nested one). */
const mergeSelect = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    if (isObj(cur) && isObj(v)) out[k] = mergeSelect(cur, v);
    else if (isObj(v) || cur === undefined) out[k] = v;
  }
  return out;
};

const pathSelect = (path: string): Record<string, unknown> => {
  const parts = path.split('.');
  return parts.reduceRight<unknown>((acc, p, i) => (i === parts.length - 1 ? { [p]: true } : { [p]: { select: acc } }), null) as Record<string, unknown>;
};

const readPath = (rec: Rec, path: string): unknown => path.split('.').reduce<unknown>((acc, p) => (acc && typeof acc === 'object' ? (acc as Rec)[p] : undefined), rec) ?? null;

const valueOf = (c: ColumnDef, rec: Rec, ctx: RunCtx, memory: boolean) => {
  if (memory) return rec[c.key] ?? null;
  if (c.get) return c.get(rec, ctx) ?? null;
  return c.path ? readPath(rec, c.path) : null;
};

// ─── In-memory filter / sort ────────────────────────────────────────────

const cmp = (a: unknown, b: unknown) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'az');
};

const matches = (f: NormFilter, value: unknown, userIdOf?: unknown): boolean => {
  const v = f.col.type === 'user' ? userIdOf : value;
  const empty = v === null || v === undefined || v === '';
  switch (f.op) {
    case 'empty':
      return empty;
    case 'notEmpty':
      return !empty;
    case 'eq':
      return !empty && (typeof f.v === 'string' ? String(v).toLowerCase() === f.v.toLowerCase() : v === f.v);
    case 'neq':
      return empty || (typeof f.v === 'string' ? String(v).toLowerCase() !== f.v.toLowerCase() : v !== f.v);
    case 'contains':
      return !empty && String(v).toLowerCase().includes(String(f.v).toLowerCase());
    case 'gt':
      return !empty && (v as number) > (f.v as number);
    case 'gte':
      return !empty && (v as number) >= (f.v as number);
    case 'lt':
      return !empty && (v as number) < (f.v as number);
    case 'lte':
      return !empty && (v as number) <= (f.v as number);
    case 'between': {
      if (empty) return false;
      if (f.col.type === 'date') {
        const r = f.v as { start: Date | null; end: Date | null };
        const t = (v as Date).getTime();
        return (!r.start || t >= r.start.getTime()) && (!r.end || t < r.end.getTime());
      }
      const [lo, hi] = f.v as [number | null, number | null];
      return (lo === null || (v as number) >= lo) && (hi === null || (v as number) <= hi);
    }
    case 'relative':
    case 'before':
    case 'after': {
      if (empty || !(v instanceof Date)) return false;
      const r = f.v as { start: Date | null; end: Date | null };
      return (!r.start || v >= r.start) && (!r.end || v < r.end);
    }
    case 'in':
      return !empty && (f.v as string[]).includes(String(v));
    case 'notIn':
      return empty || !(f.v as string[]).includes(String(v));
    case 'is':
      return !!v === f.v;
  }
};

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new HttpError(503, 'REPORT_TIMEOUT')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

// ─── Run ────────────────────────────────────────────────────────────────

interface Fetched {
  rows: Rec[];
  truncated: boolean;
}

/** Flat rows (keyed by column key; user columns also carry `<key>__id`) of all needed columns. */
const fetchRows = async (plan: Plan, ctx: RunCtx, limit: number): Promise<Fetched> => {
  const { def } = plan;
  const needed = new Map<string, ColumnDef>();
  for (const c of plan.columns) needed.set(c.key, c);
  for (const f of plan.filters) needed.set(f.col.key, f.col);
  for (const g of plan.groupBy) needed.set(g.col.key, g.col);
  for (const a of plan.aggregations) if (a.col) needed.set(a.col.key, a.col);
  const sortCol = def.columns.find((c) => c.key === plan.sort.key);
  if (sortCol) needed.set(sortCol.key, sortCol);
  const cols = [...needed.values()];

  if (def.load) {
    const all = await def.load({ ...ctx, limit: limit + 1 });
    const rows = all.map((r) => {
      const out: Rec = {};
      for (const c of cols) {
        out[c.key] = r[c.key] ?? null;
        if (c.type === 'user') out[`${c.key}__id`] = r[`${c.key}Id`] ?? null;
      }
      return out;
    });
    const filtered = rows.filter((r) => plan.filters.every((f) => matches(f, r[f.col.key], r[`${f.col.key}__id`])));
    return { rows: filtered.slice(0, limit), truncated: all.length > limit };
  }

  const dbFilters: Record<string, unknown>[] = [];
  const memFilters: NormFilter[] = [];
  for (const f of plan.filters) {
    const c = dbCondition(f);
    if (c) dbFilters.push(c);
    else memFilters.push(f);
  }
  let select: Record<string, unknown> = { id: true };
  for (const c of cols) {
    if (c.path) select = mergeSelect(select, pathSelect(c.path));
    if (c.select) select = mergeSelect(select, c.select);
  }
  const dbSortable = !!sortCol?.path && !sortCol.get && !plan.groupBy.length;
  const where = { AND: [def.baseWhere ?? {}, ...dbFilters] };
  const orderBy = dbSortable ? [nest(sortCol!.path!, plan.sort.dir), { id: 'asc' }] : [{ id: 'asc' }];
  const delegate = (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Rec[]> }>)[def.model!];
  const recs = await delegate.findMany({ where, select, orderBy, take: limit + 1 });
  const truncated = recs.length > limit;
  const rows: Rec[] = [];
  for (const rec of recs.slice(0, limit)) {
    const out: Rec = {};
    for (const c of cols) {
      out[c.key] = valueOf(c, rec, ctx, false);
      if (c.type === 'user' && c.path) out[`${c.key}__id`] = readPath(rec, c.path);
    }
    if (memFilters.every((f) => matches(f, out[f.col.key], out[`${f.col.key}__id`]))) rows.push(out);
  }
  if (!dbSortable && sortCol && !plan.groupBy.length) rows.sort((a, b) => (plan.sort.dir === 'asc' ? 1 : -1) * cmp(a[sortCol.key], b[sortCol.key]) || 0);
  return { rows, truncated };
};

const aggregate = (fn: AggFn, values: unknown[], n: number): number | Date | null => {
  if (fn === 'count') return n;
  const xs = values.filter((v) => v !== null && v !== undefined) as (number | Date)[];
  if (!xs.length) return fn === 'sum' ? 0 : null;
  if (fn === 'min' || fn === 'max') {
    const sorted = [...xs].sort((a, b) => cmp(a, b));
    return fn === 'min' ? sorted[0] : sorted[sorted.length - 1];
  }
  const nums = xs.map(Number);
  const sum = nums.reduce((a, b) => a + b, 0);
  return fn === 'sum' ? Math.round(sum * 100) / 100 : Math.round((sum / nums.length) * 100) / 100;
};

const groupValue = (g: Plan['groupBy'][number], row: Rec) => {
  const v = row[g.col.key];
  if (v === null || v === undefined || v === '') return null;
  if (g.col.type === 'date') return v instanceof Date ? dateKey(v, g.granularity) : null;
  return v;
};

export const runReport = async (
  def: DatasetDef,
  rawConfig: unknown,
  ctx: RunCtx,
  masker: Masker,
  opts: { limit?: number } = {},
): Promise<ReportResult> => {
  const plan = planReport(def, rawConfig, ctx, masker);
  const limit = Math.min(opts.limit ?? MAX_ROWS, MAX_ROWS);
  const { rows, truncated } = await withTimeout(fetchRows(plan, ctx, limit), QUERY_TIMEOUT_MS);
  const maskedKeys = def.columns.filter((c) => isColumnMasked(c, masker)).map((c) => c.key);

  if (plan.groupBy.length) {
    const groups = new Map<string, { values: unknown[]; rows: Rec[] }>();
    for (const r of rows) {
      const values = plan.groupBy.map((g) => groupValue(g, r));
      const k = JSON.stringify(values);
      let grp = groups.get(k);
      if (!grp) groups.set(k, (grp = { values, rows: [] }));
      grp.rows.push(r);
    }
    const out: Rec[] = [...groups.values()].map((grp) => {
      const o: Rec = {};
      plan.groupBy.forEach((g, i) => (o[g.col.key] = grp.values[i]));
      for (const a of plan.aggregations) o[aggKey(a.fn, a.col?.key ?? '')] = aggregate(a.fn, a.col ? grp.rows.map((r) => r[a.col!.key]) : [], grp.rows.length);
      return o;
    });
    const dir = plan.sort.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => dir * cmp(a[plan.sort.key], b[plan.sort.key]));
    const totals: Rec = {};
    for (const a of plan.aggregations) totals[aggKey(a.fn, a.col?.key ?? '')] = aggregate(a.fn, a.col ? rows.map((r) => r[a.col!.key]) : [], rows.length);
    const columns: OutColumn[] = [
      ...plan.groupBy.map((g) => ({ key: g.col.key, label: g.col.label, type: (g.col.type === 'date' ? 'period' : g.col.type) as OutColumn['type'], column: g.col.key, enumLabels: g.col.enumLabels })),
      ...plan.aggregations.map((a) => ({
        key: aggKey(a.fn, a.col?.key ?? ''),
        label: a.col
          ? (Object.fromEntries((Object.keys(a.col.label) as Lang[]).map((l) => [l, `${AGG_LABEL[a.fn][l]} · ${a.col!.label[l]}`])) as L10n)
          : AGG_LABEL.count,
        type: (a.fn === 'count' ? 'number' : a.fn === 'avg' && a.col!.type === 'number' ? 'number' : a.col!.type) as OutColumn['type'],
        column: a.col?.key,
        fn: a.fn,
      })),
    ];
    return { dataset: def.key, grouped: true, columns, rows: out, total: out.length, records: rows.length, truncated, totals, masked: [] };
  }

  const masked = new Set(maskedKeys);
  const outRows = rows.map((r) => {
    const o: Rec = {};
    for (const c of plan.columns) o[c.key] = masked.has(c.key) ? masker.apply(c.maskField ?? c.key, r[c.key]) : r[c.key];
    return o;
  });
  const totals: Rec = {};
  let anyTotal = false;
  for (const c of plan.columns) {
    if (c.type !== 'money' && c.type !== 'number') continue;
    const mode = c.total ?? 'sum';
    if (mode === 'none') continue;
    totals[c.key] = aggregate(mode === 'avg' ? 'avg' : 'sum', rows.map((r) => r[c.key]), rows.length);
    anyTotal = true;
  }
  const columns: OutColumn[] = plan.columns.map((c) => ({ key: c.key, label: c.label, type: c.type, enumLabels: c.enumLabels, ...(masked.has(c.key) ? { masked: true } : {}) }));
  return {
    dataset: def.key,
    grouped: false,
    columns,
    rows: outRows,
    total: outRows.length,
    records: outRows.length,
    truncated,
    totals: anyTotal ? totals : null,
    masked: plan.columns.filter((c) => masked.has(c.key)).map((c) => c.key),
  };
};

/** Public description of a dataset for the builder UI (labels in all languages, filter operators). */
export const describeDataset = (def: DatasetDef, masker: Masker) => ({
  key: def.key,
  label: def.label,
  description: def.description,
  category: def.category,
  dateColumn: def.dateColumn ?? null,
  defaultSort: def.defaultSort,
  columns: def.columns.map((c) => {
    const masked = isColumnMasked(c, masker);
    return {
      key: c.key,
      label: c.label,
      type: c.type,
      default: !!c.default,
      enumValues: c.enumValues ?? null,
      enumLabels: c.enumLabels ?? null,
      ops: c.noFilter || masked ? [] : OPS_BY_TYPE[c.type],
      groupable: !c.noGroup && !masked && c.type !== 'number' && c.type !== 'money',
      aggregatable: c.type === 'number' || c.type === 'money' ? ['sum', 'avg', 'min', 'max'] : c.type === 'date' ? ['min', 'max'] : [],
      sensitive: !!c.maskField,
      masked,
    };
  }),
});
