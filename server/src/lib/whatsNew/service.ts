import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { RELEASE_NOTES, WHATS_NEW_OVERRIDES_KEY, overridesSchema, readOverrides, readStaffUi, type WhatsNewOverrides } from '../staffUi/index.js';
import { STAFF_ROLES, WHATS_NEW_ENTRIES, type StaffRole } from './entries.js';

/**
 * "Yeniliklər" feed (/api/admin/whats-new): the code registry (entries.ts) + entries admins wrote in the UI
 * (WhatsNewEntry) + the older notes of lib/staffUi (texts in the client i18n, sp.whatsNew.items.<id>) and the
 * legacy Setting extras. Filtered by the viewer's role; "seen" per user and entry (WhatsNewSeen). Code entries can
 * be hidden by an admin (Setting whatsNew.overrides.hidden, shared with the older panel).
 *
 * New staff are not flooded: entries dated more than NEW_USER_GRACE_DAYS before the account was created count as
 * seen. The older notes count as seen once the user had opened the old panel (staffUi whatsNewSeen pointer).
 */

export const NEW_USER_GRACE_DAYS = 14;
export const MODAL_MAX = 8;

type Text = Record<string, string>;
export type FeedSource = 'code' | 'custom' | 'legacy';
export interface FeedEntry {
  id: string;
  date: string;
  source: FeedSource;
  /** null → the client takes the texts from its i18n (sp.whatsNew.items.<id>) */
  title: Text | null;
  body: Text | null;
  roles: string[];
  link: string | null;
  tour?: string;
}
export interface FeedItem extends FeedEntry {
  seen: boolean;
}

const byDateDesc = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export const isStaffRole = (r: string): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r);

/** Every entry from every source (before role filter); hidden ones flagged. */
export const allEntries = (custom: FeedEntry[], overrides: WhatsNewOverrides): (FeedEntry & { hidden: boolean })[] => {
  const hidden = new Set(overrides.hidden);
  const code: FeedEntry[] = WHATS_NEW_ENTRIES.map((e) => ({ id: e.id, date: e.date, source: 'code', title: { ...e.title }, body: { ...e.body }, roles: [...e.roles], link: e.link }));
  const legacy: FeedEntry[] = [
    ...RELEASE_NOTES.map((n) => ({ id: n.id, date: n.date, source: 'legacy' as const, title: null, body: null, roles: [...STAFF_ROLES], link: null, ...(n.tour ? { tour: n.tour } : {}) })),
    ...overrides.extra.map((e) => ({ id: e.id, date: e.date, source: 'legacy' as const, title: e.title, body: e.body, roles: [...STAFF_ROLES], link: null })),
  ];
  // stable: within the same date code entries keep their registry order, custom ones come first (newest admin notes)
  return [...custom, ...code, ...legacy].map((e) => ({ ...e, hidden: hidden.has(e.id) })).sort(byDateDesc);
};

export interface SeenContext {
  role: string;
  seenIds: Set<string>;
  /** the user opened the older panel (staffUi whatsNewSeen) */
  legacySeen: boolean;
  userCreatedAt: Date;
}

/** Pure: the visible feed of one user with the seen flag per entry and the unseen count. */
export const buildFeed = (entries: (FeedEntry & { hidden?: boolean })[], ctx: SeenContext) => {
  const graceLimit = new Date(ctx.userCreatedAt.getTime() - NEW_USER_GRACE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const items: FeedItem[] = entries
    .filter((e) => !e.hidden && e.roles.includes(ctx.role))
    .map(({ hidden: _h, ...e }) => ({
      ...e,
      seen: ctx.seenIds.has(e.id) || (e.source === 'legacy' && ctx.legacySeen) || e.date < graceLimit,
    }));
  const unseen = items.filter((i) => !i.seen);
  return { items, unseen: unseen.length, modal: unseen.slice(0, MODAL_MAX).map((i) => i.id) };
};

// ─── Database ──────────────────────────────────────────────────────────

const customRows = async (): Promise<FeedEntry[]> => {
  const rows = await prisma.whatsNewEntry.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 300 });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    source: 'custom' as const,
    title: (r.title ?? {}) as Text,
    body: (r.body ?? {}) as Text,
    roles: Array.isArray(r.roles) ? (r.roles as string[]).filter(isStaffRole) : [...STAFF_ROLES],
    link: r.link,
  }));
};

export const feedFor = async (user: { id: string; role: string }) => {
  const [custom, overrides, seen, ui, u] = await Promise.all([
    customRows(),
    readOverrides(),
    prisma.whatsNewSeen.findMany({ where: { userId: user.id }, select: { entryId: true } }),
    readStaffUi(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true } }),
  ]);
  return buildFeed(allEntries(custom, overrides), {
    role: user.role,
    seenIds: new Set(seen.map((s) => s.entryId)),
    legacySeen: ui.whatsNewSeen !== null,
    userCreatedAt: u?.createdAt ?? new Date(),
  });
};

/** Marks entries as seen (only ids of the user's visible feed; `all` = every visible entry). Returns the new feed. */
export const markSeen = async (user: { id: string; role: string }, ids: string[] | 'all') => {
  const feed = await feedFor(user);
  const visible = new Set(feed.items.map((i) => i.id));
  const target = ids === 'all' ? [...visible] : ids.filter((id) => visible.has(id));
  if (target.length) await prisma.whatsNewSeen.createMany({ data: target.map((entryId) => ({ userId: user.id, entryId })), skipDuplicates: true });
  return feedFor(user);
};

// ─── Admin: custom entries + hiding ─────────────────────────────────────

const l10nInput = (max: number) =>
  z.object({
    az: z.string().trim().min(1).max(max),
    ru: z.string().trim().max(max).default(''),
    en: z.string().trim().max(max).default(''),
    de: z.string().trim().max(max).default(''),
  });

export const entryInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  title: l10nInput(120),
  body: l10nInput(600),
  roles: z.array(z.enum(STAFF_ROLES)).min(1).max(3),
  link: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/admin(\/[A-Za-z0-9/_\-?=&#.%]*)?$/, 'LINK_INVALID')
    .nullable()
    .optional(),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

export const manageList = async () => {
  const [custom, overrides] = await Promise.all([customRows(), readOverrides()]);
  return { entries: allEntries(custom, overrides) };
};

export const createEntry = async (input: EntryInput, byId: string, today = new Date()) =>
  prisma.whatsNewEntry.create({
    data: {
      date: input.date ?? today.toISOString().slice(0, 10),
      title: input.title,
      body: input.body,
      roles: [...new Set(input.roles)] as Prisma.InputJsonValue,
      link: input.link || null,
      createdById: byId,
    },
  });

export const updateEntry = async (id: string, input: Partial<EntryInput>) => {
  const row = await prisma.whatsNewEntry.findUnique({ where: { id } });
  if (!row) throw notFound('ENTRY_NOT_FOUND');
  return prisma.whatsNewEntry.update({
    where: { id },
    data: {
      ...(input.date ? { date: input.date } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.roles ? { roles: [...new Set(input.roles)] as Prisma.InputJsonValue } : {}),
      ...(input.link !== undefined ? { link: input.link || null } : {}),
    },
  });
};

export const deleteEntry = async (id: string) => {
  const row = await prisma.whatsNewEntry.findUnique({ where: { id } });
  if (!row) throw notFound('ENTRY_NOT_FOUND');
  await prisma.$transaction([prisma.whatsNewSeen.deleteMany({ where: { entryId: id } }), prisma.whatsNewEntry.delete({ where: { id } })]);
};

/** Hides / shows a code (or older) entry; stored in the Setting shared with the older panel. */
export const setHidden = async (id: string, hidden: boolean) => {
  const overrides = await readOverrides();
  const known = allEntries([], overrides).some((e) => e.id === id);
  if (!known) throw notFound('ENTRY_NOT_FOUND');
  const set = new Set(overrides.hidden);
  if (hidden) set.add(id);
  else set.delete(id);
  const value = overridesSchema.parse({ ...overrides, hidden: [...set] });
  await prisma.setting.upsert({ where: { key: WHATS_NEW_OVERRIDES_KEY }, create: { key: WHATS_NEW_OVERRIDES_KEY, value }, update: { value } });
  return value;
};
