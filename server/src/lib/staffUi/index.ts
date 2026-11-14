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

export const STAFF_UI_PREFIXES = ['savedViews:', 'staffUi:', 'tours:'] as const; // tours: lib/tours.ts
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
  /** List pages whose default views were already added once (deleting a default does not bring it back). */
  seeded?: string[];
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
  const strings = (v: unknown, max: number) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, max) : []);
  return { views: asViews(raw?.views), pins: strings(raw?.pins, 200), seeded: strings(raw?.seeded, VIEW_PAGES.length) };
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

// ─── Default views ("Gecikən tanınmalar", "Bu həftə səfirlik" …) ───────

type Locale4 = 'az' | 'de' | 'en' | 'ru';
/**
 * Saved filters every staff member starts with on a list page, added once to their private views (then
 * renamed / deleted like their own). Params are list filters that stay relative (this week, overdue now).
 */
export const DEFAULT_VIEWS: Partial<Record<ViewPage, { key: string; params: Record<string, string>; name: Record<Locale4, string> }[]>> = {
  cases: [
    { key: 'mine', params: { scope: 'open', assignee: 'me' }, name: { az: 'Mənim aktiv müraciətlərim', de: 'Meine offenen Fälle', en: 'My open cases', ru: 'Мои активные заявки' } },
    { key: 'recognitionOverdue', params: { recognition: 'overdue' }, name: { az: 'Gecikən tanınmalar', de: 'Überfällige Anerkennungen', en: 'Overdue recognitions', ru: 'Просроченные признания' } },
    { key: 'embassyWeek', params: { appointment: 'week' }, name: { az: 'Bu həftə səfirlik', de: 'Botschaft diese Woche', en: 'Embassy this week', ru: 'Посольство на этой неделе' } },
    { key: 'unassigned', params: { scope: 'open', assignee: 'none' }, name: { az: 'Təyinatsız', de: 'Ohne Zuständigen', en: 'Unassigned', ru: 'Без ответственного' } },
    { key: 'pendingDocs', params: { scope: 'open', pendingDocs: '1' }, name: { az: 'Yoxlanılacaq sənədlər', de: 'Dokumente zu prüfen', en: 'Documents to review', ru: 'Документы на проверку' } },
  ],
  inquiries: [
    { key: 'new', params: { status: 'NEW' }, name: { az: 'Yeni sorğular', de: 'Neue Anfragen', en: 'New inquiries', ru: 'Новые запросы' } },
    { key: 'mine', params: { assignee: 'me' }, name: { az: 'Mənim sorğularım', de: 'Meine Anfragen', en: 'My inquiries', ru: 'Мои запросы' } },
    { key: 'unassigned', params: { assignee: 'none' }, name: { az: 'Təyinatsız', de: 'Ohne Zuständigen', en: 'Unassigned', ru: 'Без ответственного' } },
  ],
};

/**
 * Adds the default views of `page` to the user's private views once (or, with `restore`, the defaults whose
 * filters the user no longer has). Returns how many were added.
 */
export const seedDefaultViews = async (userId: string, page: ViewPage, locale: string, restore = false) => {
  const defs = DEFAULT_VIEWS[page] ?? [];
  const lang: Locale4 = (['az', 'de', 'en', 'ru'] as const).find((l) => l === locale) ?? 'az';
  return withViewLocks([userViewsKey(userId)], async (db) => {
    const own = await readUserViews(userId, db);
    const seeded = own.seeded ?? [];
    if (seeded.includes(page) && !restore) return 0;
    const now = new Date().toISOString();
    const have = own.views.filter((v) => v.page === page);
    const missing = defs.filter((d) => !have.some((v) => sameViewParams(v.params, d.params)));
    const room = Math.max(0, VIEWS_PER_USER_MAX - own.views.length);
    const added = missing.slice(0, room).map((d) => ({ id: newViewId(), page, name: d.name[lang], params: { ...d.params }, columns: null, ownerId: userId, createdAt: now, updatedAt: now }));
    own.views.push(...added);
    own.seeded = [...new Set([...seeded, page])];
    await writeUserViews(userId, own, db);
    return added.length;
  });
};

const sameViewParams = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

/** List pages whose defaults the user already received. */
export const seededPages = async (userId: string) => (await readUserViews(userId)).seeded ?? [];

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
