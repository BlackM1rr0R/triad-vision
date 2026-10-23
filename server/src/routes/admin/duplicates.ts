import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { scanAllDuplicates } from '../../lib/duplicates/detect.js';
import { getDuplicateSettings, saveDuplicateSettings } from '../../lib/duplicates/settings.js';
import { MERGE_FIELDS, mergeNoticeText, mergePreview, mergeUsers, resolveMergedUser } from '../../lib/userMerge.js';

/**
 * Admin → Dublikatlar (ADMIN+, mounted with requireMinRole('ADMIN')): possible duplicate client accounts,
 * side-by-side comparison, "not a duplicate", and the one-click merge (SUPER_ADMIN, or ADMIN when the
 * super admin allows it in the settings).
 */
export const adminDuplicatesRouter = Router();

const userBrief = { id: true, email: true, firstName: true, lastName: true, phone: true, birthDate: true, passportNumber: true, city: true, isActive: true, createdAt: true, mergedIntoId: true, _count: { select: { cases: true } } } as const;

adminDuplicatesRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(['OPEN', 'NOT_DUPLICATE', 'MERGED']).default('OPEN'),
      userId: z.string().max(40).optional(),
      search: z.string().trim().max(120).optional(),
      minScore: z.coerce.number().int().min(0).max(100).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }),
    req.query,
  );
  const userMatch = (s: string): Prisma.UserWhereInput => ({ OR: [{ email: { contains: s } }, { firstName: { contains: s } }, { lastName: { contains: s } }, { phone: { contains: s } }, { passportNumber: { contains: s } }] });
  const where: Prisma.DuplicatePairWhereInput = {
    status: q.status,
    ...(q.minScore !== undefined ? { score: { gte: q.minScore } } : {}),
    ...(q.userId ? { OR: [{ userAId: q.userId }, { userBId: q.userId }] } : {}),
    ...(q.search ? { AND: [{ OR: [{ userA: userMatch(q.search) }, { userB: userMatch(q.search) }] }] } : {}),
  };
  const take = 50;
  const [items, total, byStatus] = await Promise.all([
    prisma.duplicatePair.findMany({
      where,
      orderBy: [{ score: 'desc' }, { detectedAt: 'desc' }],
      skip: (q.page - 1) * take,
      take,
      include: { userA: { select: userBrief }, userB: { select: userBrief } },
    }),
    prisma.duplicatePair.count({ where }),
    prisma.duplicatePair.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const settings = await getDuplicateSettings();
  res.json({
    items,
    total,
    page: q.page,
    pageSize: take,
    counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
    canMerge: hasMinRole(req.user!.role, settings.mergeMinRole),
    settings,
  });
});

/** "Scan now": full detection run (the nightly job does the same). */
adminDuplicatesRouter.post('/scan', async (req, res) => {
  const r = await scanAllDuplicates();
  await audit(req, 'DUPLICATES_SCANNED', undefined, r);
  res.json(r);
});

adminDuplicatesRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getDuplicateSettings() });
});

adminDuplicatesRouter.put('/settings', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(z.object({ mergeMinRole: z.enum(['ADMIN', 'SUPER_ADMIN']) }), req.body);
  const settings = await saveDuplicateSettings(body);
  await audit(req, 'DUPLICATE_SETTINGS_UPDATED', undefined, settings);
  res.json({ settings });
});

/** Side-by-side comparison of two accounts (with conflicting fields and the suggested primary). */
adminDuplicatesRouter.get('/compare', async (req, res) => {
  const q = parse(z.object({ a: z.string().min(1).max(40), b: z.string().min(1).max(40) }), req.query);
  const settings = await getDuplicateSettings();
  const preview = await mergePreview(q.a, q.b);
  res.json({ ...preview, canMerge: hasMinRole(req.user!.role, settings.mergeMinRole) });
});

/** Default text of the optional "your accounts were combined" e-mail, in the primary client's language. */
adminDuplicatesRouter.get('/notice-template', async (req, res) => {
  const q = parse(z.object({ userId: z.string().min(1).max(40) }), req.query);
  const u = await prisma.user.findUnique({ where: { id: q.userId }, select: { email: true, locale: true } });
  if (!u) throw notFound('USER_NOT_FOUND');
  res.json({ locale: u.locale, ...mergeNoticeText(u.locale, u.email) });
});

const choice = z.enum(['primary', 'secondary']);
const fieldsSchema = z.object(Object.fromEntries(MERGE_FIELDS.map((f) => [f, choice.optional()])) as Record<(typeof MERGE_FIELDS)[number], z.ZodOptional<typeof choice>>).strict();

adminDuplicatesRouter.post('/merge', async (req, res) => {
  const settings = await getDuplicateSettings();
  if (!hasMinRole(req.user!.role, settings.mergeMinRole)) throw forbidden('MERGE_NOT_ALLOWED');
  const body = parse(
    z.object({
      primaryId: z.string().min(1).max(40),
      secondaryId: z.string().min(1).max(40),
      fields: fieldsSchema.default({}),
      confirm: z.string(),
      allowTwoActiveCases: z.boolean().default(false),
      driveFolders: z.enum(['MERGE', 'KEEP']).optional(),
      informClient: z.boolean().default(false),
      clientMessage: z.string().trim().max(4000).nullable().optional(),
    }),
    req.body,
  );
  if (body.confirm !== 'MERGE') throw badRequest('CONFIRMATION_MISMATCH');
  const r = await mergeUsers(req.user!.id, body, req.ip);
  res.json({ ok: true, ...r });
});

adminDuplicatesRouter.post('/:id/not-duplicate', async (req, res) => {
  const pair = await prisma.duplicatePair.findUnique({ where: { id: String(req.params.id) } });
  if (!pair) throw notFound('PAIR_NOT_FOUND');
  if (pair.status === 'MERGED') throw badRequest('ALREADY_MERGED');
  const item = await prisma.duplicatePair.update({ where: { id: pair.id }, data: { status: 'NOT_DUPLICATE', decidedById: req.user!.id, decidedAt: new Date() } });
  await audit(req, 'DUPLICATE_DISMISSED', `user:${pair.userAId}`, { pairId: pair.id, userAId: pair.userAId, userBId: pair.userBId });
  res.json({ item });
});

adminDuplicatesRouter.post('/:id/reopen', async (req, res) => {
  const pair = await prisma.duplicatePair.findUnique({ where: { id: String(req.params.id) } });
  if (!pair) throw notFound('PAIR_NOT_FOUND');
  if (pair.status !== 'NOT_DUPLICATE') throw badRequest('NOT_DISMISSED');
  const item = await prisma.duplicatePair.update({ where: { id: pair.id }, data: { status: 'OPEN', decidedById: req.user!.id, decidedAt: new Date() } });
  await audit(req, 'DUPLICATE_REOPENED', `user:${pair.userAId}`, { pairId: pair.id });
  res.json({ item });
});

/**
 * One account: the id it resolves to now (merged accounts → their primary, for old links), its open pairs
 * (the "possible duplicate" badge) and the merges it took part in (support trace).
 */
adminDuplicatesRouter.get('/user/:id', async (req, res) => {
  const id = String(req.params.id);
  const resolvedId = await resolveMergedUser(id);
  if (!resolvedId) throw notFound('USER_NOT_FOUND');
  const [open, merges] = await Promise.all([
    prisma.duplicatePair.findMany({
      where: { status: 'OPEN', OR: [{ userAId: resolvedId }, { userBId: resolvedId }] },
      orderBy: { score: 'desc' },
      select: { id: true, score: true, reasons: true, userAId: true, userBId: true },
    }),
    prisma.userMerge.findMany({
      where: { OR: [{ primaryId: { in: [id, resolvedId] } }, { secondaryId: { in: [id, resolvedId] } }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, primaryId: true, secondaryId: true, actorId: true, createdAt: true, counts: true, fields: true, snapshot: true, secondary: true },
    }),
  ]);
  res.json({ id, resolvedId, merged: resolvedId !== id, openPairs: open, merges });
});

/** Which of these users have an open pair (badges in lists). */
adminDuplicatesRouter.post('/open-users', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().max(40)).max(500) }), req.body);
  if (!ids.length) {
    res.json({ ids: [] });
    return;
  }
  const rows = await prisma.duplicatePair.findMany({
    where: { status: 'OPEN', OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
    select: { userAId: true, userBId: true },
  });
  const wanted = new Set(ids);
  res.json({ ids: [...new Set(rows.flatMap((r) => [r.userAId, r.userBId]).filter((x) => wanted.has(x)))] });
});
