import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { loadStarterContent, WR_KINDS, WR_STAGES, WR_TOPICS, WR_VISA_TYPES } from '../../lib/waitingRoom/index.js';
import { STARTER_ITEMS } from '../../lib/waitingRoom/starter.js';

/**
 * Waiting room CMS — mounted at /api/admin/waiting-room (STAFF+ to read, ADMIN+ to write).
 *   GET    /                ?kind=&topic=&published=   items + completion counts
 *   POST   /                create
 *   PUT    /:id             update (partial)
 *   PATCH  /:id/publish     { published }
 *   POST   /reorder         { ids: [...] } — sortOrder follows the given order
 *   POST   /starter         load the starter set (idempotent: existing German titles are skipped)
 *   DELETE /:id             item + its progress rows
 */
export const adminWaitingRoomRouter = Router();
const adminOnly = requireMinRole('ADMIN');

const text = (max: number) => z.string().trim().max(max);
const l10nRequired = z.object({ az: text(300).min(1), de: text(300).min(1), en: text(300).min(1), ru: text(300).min(1) });
const l10nText = (max: number) => z.object({ az: text(max), de: text(max), en: text(max), ru: text(max) });
/** YouTube (shown via youtube-nocookie.com) or Vimeo only: the portal embeds nothing else. */
const videoUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com)\//i.test(u), 'VIDEO_URL_NOT_ALLOWED');

const questionSchema = z
  .object({ q: l10nText(500), options: z.array(l10nText(300)).min(2).max(6), answer: z.number().int().min(0).max(5) })
  .refine((q) => q.answer < q.options.length, 'ANSWER_OUT_OF_RANGE');

const itemSchema = z.object({
  kind: z.enum(WR_KINDS),
  topic: z.enum(WR_TOPICS),
  title: l10nRequired,
  body: l10nText(20_000).nullable().optional(),
  videoUrl: videoUrl.nullable().optional().or(z.literal('').transform(() => null)),
  exercise: z.array(questionSchema).max(30).nullable().optional(),
  minutes: z.number().int().min(1).max(240).nullable().optional(),
  visaTypes: z.array(z.enum(WR_VISA_TYPES)).max(WR_VISA_TYPES.length).nullable().optional(),
  stages: z.array(z.enum(WR_STAGES)).max(WR_STAGES.length).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  published: z.boolean().optional(),
});
type ItemInput = Partial<z.infer<typeof itemSchema>>;

/** Empty texts / lists are stored as NULL (no body, every visa type, every stage). */
const jsonOrNull = (v: unknown) => {
  if (v === null || v === undefined) return Prisma.DbNull;
  if (Array.isArray(v)) return v.length ? (Array.from(new Set(v as unknown[])) as Prisma.InputJsonValue) : Prisma.DbNull;
  if (typeof v === 'object') return Object.values(v as Record<string, string>).some((s) => s) ? (v as Prisma.InputJsonValue) : Prisma.DbNull;
  return Prisma.DbNull;
};

const toData = (d: ItemInput) => {
  const { body, exercise, visaTypes, stages, ...rest } = d;
  const out: Prisma.WaitingRoomItemUpdateInput = { ...rest };
  if (body !== undefined) out.body = jsonOrNull(body);
  if (exercise !== undefined) out.exercise = exercise && exercise.length ? (exercise as Prisma.InputJsonValue) : Prisma.DbNull;
  if (visaTypes !== undefined) out.visaTypes = jsonOrNull(visaTypes);
  if (stages !== undefined) out.stages = jsonOrNull(stages);
  return out;
};

const checkKind = (kind: string | undefined, d: ItemInput) => {
  if (kind === 'EXERCISE' && d.exercise !== undefined && !d.exercise?.length) throw badRequest('EXERCISE_QUESTIONS_REQUIRED');
  if (kind === 'VIDEO' && d.videoUrl !== undefined && !d.videoUrl) throw badRequest('VIDEO_URL_REQUIRED');
};

adminWaitingRoomRouter.get('/', async (req, res) => {
  const q = parse(z.object({ kind: z.enum(WR_KINDS).optional(), topic: z.enum(WR_TOPICS).optional(), published: z.enum(['true', 'false']).optional() }), req.query);
  const items = await prisma.waitingRoomItem.findMany({
    where: { ...(q.kind ? { kind: q.kind } : {}), ...(q.topic ? { topic: q.topic } : {}), ...(q.published ? { published: q.published === 'true' } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const done = await prisma.waitingRoomProgress.groupBy({ by: ['itemId'], where: { completedAt: { not: null } }, _count: { _all: true } });
  res.json({ items: items.map((i) => ({ ...i, completedCount: done.find((d) => d.itemId === i.id)?._count._all ?? 0 })) });
});

adminWaitingRoomRouter.post('/starter', adminOnly, async (req, res) => {
  const result = await loadStarterContent(STARTER_ITEMS);
  await audit(req, 'WAITING_ROOM_STARTER_LOADED', undefined, result);
  res.json(result);
});

adminWaitingRoomRouter.post('/', adminOnly, async (req, res) => {
  const d = parse(itemSchema, req.body ?? {});
  if (d.kind === 'EXERCISE' && !d.exercise?.length) throw badRequest('EXERCISE_QUESTIONS_REQUIRED');
  if (d.kind === 'VIDEO' && !d.videoUrl) throw badRequest('VIDEO_URL_REQUIRED');
  const sortOrder = d.sortOrder ?? ((await prisma.waitingRoomItem.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
  const item = await prisma.waitingRoomItem.create({
    data: {
      kind: d.kind,
      topic: d.topic,
      title: d.title,
      body: jsonOrNull(d.body),
      videoUrl: d.videoUrl ?? null,
      exercise: d.exercise?.length ? (d.exercise as Prisma.InputJsonValue) : Prisma.DbNull,
      minutes: d.minutes ?? null,
      visaTypes: jsonOrNull(d.visaTypes),
      stages: jsonOrNull(d.stages),
      sortOrder,
      published: d.published ?? true,
    },
  });
  await audit(req, 'WAITING_ROOM_ITEM_CREATED', `waitingRoom:${item.id}`);
  res.status(201).json({ item });
});

adminWaitingRoomRouter.post('/reorder', adminOnly, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(1000) }), req.body ?? {});
  const unique = Array.from(new Set(ids));
  const found = await prisma.waitingRoomItem.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw notFound('ITEM_NOT_FOUND');
  await prisma.$transaction(unique.map((id, i) => prisma.waitingRoomItem.update({ where: { id }, data: { sortOrder: i } })));
  await audit(req, 'WAITING_ROOM_REORDERED', undefined, { count: unique.length });
  res.json({ ok: true });
});

adminWaitingRoomRouter.put('/:id', adminOnly, async (req, res) => {
  const existing = await prisma.waitingRoomItem.findUnique({ where: { id: String(req.params.id) }, select: { id: true, kind: true } });
  if (!existing) throw notFound('ITEM_NOT_FOUND');
  const d = parse(itemSchema.partial(), req.body ?? {});
  checkKind(d.kind ?? existing.kind, d);
  const item = await prisma.waitingRoomItem.update({ where: { id: existing.id }, data: toData(d) });
  await audit(req, 'WAITING_ROOM_ITEM_UPDATED', `waitingRoom:${item.id}`);
  res.json({ item });
});

adminWaitingRoomRouter.patch('/:id/publish', adminOnly, async (req, res) => {
  const { published } = parse(z.object({ published: z.boolean() }), req.body ?? {});
  const existing = await prisma.waitingRoomItem.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) throw notFound('ITEM_NOT_FOUND');
  const item = await prisma.waitingRoomItem.update({ where: { id: existing.id }, data: { published } });
  await audit(req, published ? 'WAITING_ROOM_ITEM_PUBLISHED' : 'WAITING_ROOM_ITEM_UNPUBLISHED', `waitingRoom:${item.id}`);
  res.json({ item });
});

adminWaitingRoomRouter.delete('/:id', adminOnly, async (req, res) => {
  const existing = await prisma.waitingRoomItem.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) throw notFound('ITEM_NOT_FOUND');
  await prisma.$transaction([prisma.waitingRoomProgress.deleteMany({ where: { itemId: existing.id } }), prisma.waitingRoomItem.delete({ where: { id: existing.id } })]);
  await audit(req, 'WAITING_ROOM_ITEM_DELETED', `waitingRoom:${existing.id}`);
  res.json({ ok: true });
});
