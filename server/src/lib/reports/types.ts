import type { Role } from '@prisma/client';

/**
 * Report builder (Hesabat qurucusu): curated, server-side dataset definitions. A dataset never exposes a raw
 * table — only its listed columns, each with labels in the four UI languages, a type (drives filters,
 * formats and aggregations), how it is read (Prisma path / select + getter) and whether it is sensitive.
 */

export const LANGS = ['az', 'de', 'en', 'ru'] as const;
export type Lang = (typeof LANGS)[number];
export type L10n = Record<Lang, string>;

export const L = (az: string, de: string, en: string, ru: string): L10n => ({ az, de, en, ru });

export const pickLang = (v: unknown, fallback: Lang = 'az'): Lang => {
  const s = String(v ?? '').slice(0, 2);
  return (LANGS as readonly string[]).includes(s) ? (s as Lang) : fallback;
};

export type ColType = 'string' | 'number' | 'money' | 'date' | 'enum' | 'boolean' | 'user';

/** Context of one report run (rates, the viewer). */
export interface RunCtx {
  /** AZN per 1 EUR (settlement / profitability setting). */
  eurAzn: number;
  userId: string | null;
  role: Role;
  now: Date;
}

/** Any record as returned by Prisma (or a flat row of a memory dataset). */
export type Rec = Record<string, unknown>;

export interface ColumnDef {
  key: string;
  label: L10n;
  type: ColType;
  /**
   * Prisma field path ("status", "client.lastName", to-one relations only). Used for database filters and
   * sorting, and read as the value unless `get` is given. For `user` columns it is the user id field.
   */
  path?: string;
  /** Prisma select fragment needed by `get` (merged into the query). */
  select?: Record<string, unknown>;
  /** Computes the value from the fetched record (money in cents, dates as Date). */
  get?: (rec: Rec, ctx: RunCtx) => unknown;
  /** Custom database condition (e.g. a name that spans two fields). Return null to filter in memory. */
  where?: (op: FilterOp, value: unknown) => Record<string, unknown> | null;
  enumValues?: readonly string[];
  enumLabels?: Record<string, L10n>;
  /**
   * Field name of the platform masking (lib/privacy/mask.ts): 'passportNumber' | 'iban' | 'vatId' | 'placeOfBirth'.
   * Masked for viewers whose role masks that group; never filterable / groupable for them.
   */
  maskField?: string;
  /** Personal data (phone, birth date, address): masked in e-mails to external recipients. */
  personal?: boolean;
  /** Part of the dataset's default column set. */
  default?: boolean;
  /** Not usable in filters / group by (e.g. long free text). */
  noFilter?: boolean;
  noGroup?: boolean;
  /** Totals row of number / money columns: sum (default), average or none. */
  total?: 'sum' | 'avg' | 'none';
}

export interface DatasetDef {
  key: string;
  label: L10n;
  description: L10n;
  category: 'operations' | 'finance';
  /** Minimum role to use the dataset (finance datasets: ADMIN). */
  minRole: Role;
  /** Prisma delegate name (prisma[model].findMany) for database datasets. */
  model?: string;
  /** Always-applied condition (e.g. role = CLIENT). */
  baseWhere?: Record<string, unknown>;
  /** Memory datasets: loads all flat rows (keyed by column key); filters / sorting run in memory. */
  load?: (ctx: RunCtx & { limit: number }) => Promise<Rec[]>;
  /** False hides the dataset (optional models that may not exist at runtime). */
  available?: () => boolean;
  columns: ColumnDef[];
  defaultSort: { column: string; dir: 'asc' | 'desc' };
  /** Date column suggested for period filters in the UI. */
  dateColumn?: string;
}

export const FILTER_OPS = [
  'eq',
  'neq',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'in',
  'notIn',
  'empty',
  'notEmpty',
  'before',
  'after',
  'relative',
  'is',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export const OPS_BY_TYPE: Record<ColType, readonly FilterOp[]> = {
  string: ['contains', 'eq', 'neq', 'empty', 'notEmpty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'],
  money: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'],
  date: ['relative', 'between', 'before', 'after', 'empty', 'notEmpty'],
  enum: ['in', 'notIn', 'empty', 'notEmpty'],
  boolean: ['is'],
  user: ['in', 'notIn', 'empty', 'notEmpty'],
};

export const RELATIVE_RANGES = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'lastYear',
] as const;
export type RelativeRange = (typeof RELATIVE_RANGES)[number];

export const AGG_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type AggFn = (typeof AGG_FNS)[number];

export const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

/** Rows the builder fetches at most (exports, grouping); the preview shows the first PREVIEW_ROWS. */
export const MAX_ROWS = 50_000;
export const PREVIEW_ROWS = 1000;
export const QUERY_TIMEOUT_MS = 25_000;
