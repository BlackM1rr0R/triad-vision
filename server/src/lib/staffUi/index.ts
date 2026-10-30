import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Per-user admin UI state without a schema change (Setting rows, JSON):
 *
 *   savedViews:<userId>   { views: SavedView[], pins: string[] }   private views + the ids pinned to the own sidebar
 *   savedViews:team       { views: SavedView[] }                   views shared with the whole team (owner = ownerId)
 *   staffUi:<userId>      { tables: { [tableId]: TablePrefs }, whatsNewSeen: string | null }
 *
 * The keys contain ":" so the generic settings route (PUT /api/admin/settings/:key, [a-zA-Z0-9_.-]) can never
 * write them, and its listing leaves them out (STAFF_UI_PREFIXES).
 */

export const STAFF_UI_PREFIXES = ['savedViews:', 'staffUi:'] as const;
export const TEAM_VIEWS_KEY = 'savedViews:team';
export const userViewsKey = (userId: string) => `savedViews:${userId}`;
export const staffUiKey = (userId: string) => `staffUi:${userId}`;

/** List pages that can save views / table settings (client: components/staffPower/pages.ts). */
export const VIEW_PAGES = ['cases', 'inquiries', 'candidates', 'vacancies', 'companies', 'clientInvoices'] as const;
export type ViewPage = (typeof VIEW_PAGES)[number];

export const VIEWS_PER_USER_MAX = 60;
export const TEAM_VIEWS_MAX = 120;
export const PARAMS_MAX = 24;

const COL_ID = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/);
export const tablePrefsSchema = z.object({
  order: z.array(COL_ID).max(40).optional(),
  hidden: z.array(COL_ID).max(40).optional(),
  widths: z.record(COL_ID, z.number().int().min(40).max(1200)).optional(),
  /** List pages with a card / list view next to the table. */
  mode: z.enum(['table', 'list']).optional(),
});
export type TablePrefs = z.infer<typeof tablePrefsSchema>;

const PARAM_KEY = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/);
export const viewInputSchema = z.object({
  page: z.enum(VIEW_PAGES),
  name: z.string().trim().min(1).max(80),
  /** URL search params of the list (filters / sort); page / selection params are dropped. */
  params: z.record(PARAM_KEY, z.string().max(200)).refine((p) => Object.keys(p).length <= PARAMS_MAX, 'TOO_MANY_PARAMS'),
  columns: tablePrefsSchema.nullish(),
  shared: z.boolean().default(false),
  pinned: z.boolean().default(false),
});
export const viewPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  params: viewInputSchema.shape.params.optional(),
  columns: tablePrefsSchema.nullish(),
  shared: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export interface SavedView {
  id: string;
  page: ViewPage;
  name: string;
  params: Record<string, string>;
  columns: TablePrefs | null;
  ownerId: string;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
}

/** Params that never belong in a saved view (pagination, open drawers, the selected row, the view marker). */
export const TRANSIENT_PARAMS = new Set(['page', 'selected', 'open', 'id', 'sv']);
export const cleanParams = (p: Record<string, string>) =>
  Object.fromEntries(Object.entries(p).filter(([k, v]) => !TRANSIENT_PARAMS.has(k) && v !== ''));

const storedViewSchema = z.object({
  id: z.string().min(1).max(40),
  page: z.enum(VIEW_PAGES),
  name: z.string().min(1).max(80),
  params: z.record(z.string(), z.string()),
  columns: tablePrefsSchema.nullable().catch(null),
  ownerId: z.string().max(40),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const asViews = (raw: unknown): SavedView[] => {
  if (!Array.isArray(raw)) return [];
  const out: SavedView[] = [];
  for (const v of raw) {
    const r = storedViewSchema.safeParse(v);
    if (r.success) out.push(r.data);
  }
  return out;
};

interface UserViewsDoc {
  views: SavedView[];
  pins: string[];
}
interface TeamViewsDoc {
  views: SavedView[];
}
export interface StaffUiDoc {
  tables: Record<string, TablePrefs>;
  whatsNewSeen: string | null;
}

type Db = Prisma.TransactionClient | typeof prisma;
const read = async (key: string, db: Db = prisma) => (await db.setting.findUnique({ where: { key } }))?.value as Record<string, unknown> | undefined;
const write = (key: string, value: object, db: Db = prisma) =>
  db.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });

export const readUserViews = async (userId: string, db: Db = prisma): Promise<UserViewsDoc> => {
  const raw = await read(userViewsKey(userId), db);
  return { views: asViews(raw?.views), pins: Array.isArray(raw?.pins) ? (raw.pins as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 200) : [] };
};
export const readTeamViews = async (db: Db = prisma): Promise<TeamViewsDoc> => ({ views: asViews((await read(TEAM_VIEWS_KEY, db))?.views) });
export const writeUserViews = (userId: string, doc: UserViewsDoc, db: Db = prisma) => write(userViewsKey(userId), doc, db);
export const writeTeamViews = (doc: TeamViewsDoc, db: Db = prisma) => write(TEAM_VIEWS_KEY, doc, db);

/**
 * Saved views are read-modify-write JSON documents (the team one is shared by everyone): two colleagues saving
 * at the same moment would overwrite each other. Every change runs in a transaction holding SELECT … FOR UPDATE
 * on the Setting rows it touches. Missing rows are created first (outside the transaction, INSERT IGNORE: an
 * insert's shared lock on an existing row followed by FOR UPDATE would deadlock two writers). Keys are locked in
 * sorted order so two transactions never wait on each other crosswise.
 */
export const withViewLocks = async <T>(keys: string[], fn: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
  const sorted = [...new Set(keys)].sort();
  for (const k of sorted) await prisma.$executeRaw`INSERT IGNORE INTO \`Setting\` (\`key\`, \`value\`) VALUES (${k}, JSON_OBJECT())`;
  return prisma.$transaction(async (tx) => {
    for (const k of sorted) await tx.$queryRaw`SELECT \`key\` FROM \`Setting\` WHERE \`key\` = ${k} FOR UPDATE`;
    return fn(tx);
  });
};

export const newViewId = () => `v${crypto.randomBytes(8).toString('hex')}`;

/** The views a user sees: own private ones + every team view; `pinned` / `mine` / `shared` per row. */
export const viewsFor = async (userId: string, page?: ViewPage) => {
  const [own, team] = await Promise.all([readUserViews(userId), readTeamViews()]);
  const pins = new Set(own.pins);
  const ownerIds = [...new Set(team.views.map((v) => v.ownerId))];
  const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const nameOf = new Map(owners.map((o) => [o.id, `${o.firstName} ${o.lastName}`.trim()]));
  const rows = [
    ...own.views.map((v) => ({ ...v, shared: false, mine: true, pinned: pins.has(v.id) })),
    ...team.views.map((v) => ({ ...v, ownerName: nameOf.get(v.ownerId) ?? '', shared: true, mine: v.ownerId === userId, pinned: pins.has(v.id) })),
  ];
  return rows.filter((v) => !page || v.page === page);
};

// ─── Table settings + "what's new" ─────────────────────────────────────

export const readStaffUi = async (userId: string): Promise<StaffUiDoc> => {
  const raw = await read(staffUiKey(userId));
  const tables: Record<string, TablePrefs> = {};
  const src = raw?.tables && typeof raw.tables === 'object' ? (raw.tables as Record<string, unknown>) : {};
  for (const [id, v] of Object.entries(src)) {
    const r = tablePrefsSchema.safeParse(v);
    if (r.success && /^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/.test(id)) tables[id] = r.data;
  }
  return { tables, whatsNewSeen: typeof raw?.whatsNewSeen === 'string' ? raw.whatsNewSeen : null };
};
export const writeStaffUi = (userId: string, doc: StaffUiDoc) => write(staffUiKey(userId), doc);

/** Normalises table prefs: unique column ids, no width for unknown keys beyond the limit. */
export const normalizeTablePrefs = (p: TablePrefs): TablePrefs => {
  const uniq = (a?: string[]) => (a ? [...new Set(a)] : undefined);
  return {
    ...(p.order ? { order: uniq(p.order) } : {}),
    ...(p.hidden ? { hidden: uniq(p.hidden) } : {}),
    ...(p.widths ? { widths: p.widths } : {}),
    ...(p.mode ? { mode: p.mode } : {}),
  };
};

// ─── Release notes ("Yeniliklər") ──────────────────────────────────────

/**
 * Release-note ids shipped with the code (texts: client i18n `sp.whatsNew.items.<id>`), newest first. A super admin
 * may add / hide entries with the Setting `whatsNew.overrides` ({ hidden: string[], extra: [{ id, date, title, body }] }).
 */
export const RELEASE_NOTES: { id: string; date: string; tour?: string }[] = [
  { id: '2026-10-review', date: '2026-10-30', tour: 'sp-review' },
  { id: '2026-10-bulk', date: '2026-10-30', tour: 'sp-bulk' },
  { id: '2026-10-views', date: '2026-10-30', tour: 'sp-views' },
  { id: '2026-10-tables', date: '2026-10-30' },
  { id: '2026-10-undo', date: '2026-10-30' },
  { id: '2026-10-docflow', date: '2026-10-29', tour: 'sp-docflow' },
];
export const WHATS_NEW_OVERRIDES_KEY = 'whatsNew.overrides';
const l10nText = z.object({ az: z.string().max(400), de: z.string().max(400), en: z.string().max(400), ru: z.string().max(400) });
export const overridesSchema = z.object({
  hidden: z.array(z.string().max(40)).max(100).default([]),
  extra: z
    .array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_.-]{1,40}$/), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: l10nText, body: l10nText }))
    .max(30)
    .default([]),
});
export type WhatsNewOverrides = z.infer<typeof overridesSchema>;

export const readOverrides = async (): Promise<WhatsNewOverrides> => {
  const r = overridesSchema.safeParse((await read(WHATS_NEW_OVERRIDES_KEY)) ?? {});
  return r.success ? r.data : { hidden: [], extra: [] };
};

/** The visible notes (code + extra, newest first) and the number the user has not seen yet. */
export const whatsNewFeed = (overrides: WhatsNewOverrides, seen: string | null) => {
  const hidden = new Set(overrides.hidden);
  const items = [
    ...RELEASE_NOTES.filter((n) => !hidden.has(n.id)).map((n) => ({ ...n, custom: null as null | { title: Record<string, string>; body: Record<string, string> } })),
    ...overrides.extra.filter((e) => !hidden.has(e.id)).map((e) => ({ id: e.id, date: e.date, tour: undefined, custom: { title: e.title, body: e.body } })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const idx = seen ? items.findIndex((i) => i.id === seen) : -1;
  const unread = seen === null ? items.length : idx < 0 ? items.length : idx;
  return { items, unread, latest: items[0]?.id ?? null };
};
