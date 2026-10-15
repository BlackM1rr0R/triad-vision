import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { DEFAULT_REQUIREMENTS, seedDefaultTemplates } from '../../lib/docsIntel/requirementTemplates.js';

/**
 * Requirement templates: which documents a NEW case asks for, per stage, globally or per visa type.
 * Staff may read; only admins change them. Existing cases keep their own requirement rows.
 */
export const adminRequirementsRouter = Router();
adminRequirementsRouter.use(requireMinRole('STAFF'));
adminRequirementsRouter.use((req, res, next) => (req.method === 'GET' ? next() : requireMinRole('ADMIN')(req, res, next)));

export const REQUIREMENT_KEYS = [
  'PASSPORT', 'PHOTO', 'CV', 'DIPLOMA', 'EMPLOYMENT_REF', 'DRIVING_LICENCE', 'LANGUAGE_CERT',
  'VIDEX', 'PHOTO_2', 'HEALTH_INSURANCE', 'SIGNED_CONTRACT', 'ANERKENNUNG', 'GERMAN_CERT', 'ACCOMMODATION',
] as const;

const l10n = z.object({ az: z.string().trim().min(1).max(200), de: z.string().trim().max(200), en: z.string().trim().max(200), ru: z.string().trim().max(200) });
const l10nDesc = z.object({ az: z.string().trim().max(1000), de: z.string().trim().max(1000), en: z.string().trim().max(1000), ru: z.string().trim().max(1000) });
const key = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use A-Z, 0-9 and _');
const stage = z.enum(['INITIAL', 'EMBASSY']);

const bodySchema = z.object({
  visaCategoryId: z.string().nullable().optional(),
  stage,
  key: key.nullable().optional(),
  title: l10n,
  description: l10nDesc.nullable().optional(),
  required: z.boolean().default(true),
});

const grouped = (rows: { stage: string }[]) => ({
  INITIAL: rows.filter((r) => r.stage === 'INITIAL'),
  EMBASSY: rows.filter((r) => r.stage === 'EMBASSY'),
});

const ensureVisa = async (id: string | null | undefined) => {
  if (!id) return null;
  const v = await prisma.visaCategory.findUnique({ where: { id }, select: { id: true } });
  if (!v) throw badRequest('INVALID_VISA_CATEGORY');
  return v.id;
};

const isEmptyDesc = (d: z.infer<typeof l10nDesc> | null | undefined) => !d || !Object.values(d).some((s) => s.trim());

adminRequirementsRouter.get('/', async (_req, res) => {
  const [visaCategories, templates] = await Promise.all([
    prisma.visaCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, title: true, visaLabel: true } }),
    prisma.requirementTemplate.findMany({ orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  const byVisa: Record<string, ReturnType<typeof grouped>> = {};
  for (const v of visaCategories) byVisa[v.id] = grouped(templates.filter((t) => t.visaCategoryId === v.id));
  res.json({
    visaCategories,
    keys: REQUIREMENT_KEYS,
    builtIn: DEFAULT_REQUIREMENTS,
    templates: { global: grouped(templates.filter((t) => t.visaCategoryId === null)), byVisa },
  });
});

adminRequirementsRouter.post('/', async (req, res) => {
  const body = parse(bodySchema, req.body);
  const visaCategoryId = await ensureVisa(body.visaCategoryId);
  const max = await prisma.requirementTemplate.aggregate({ where: { visaCategoryId, stage: body.stage }, _max: { sortOrder: true } });
  const template = await prisma.requirementTemplate.create({
    data: {
      visaCategoryId,
      stage: body.stage,
      key: body.key ?? null,
      title: body.title,
      description: isEmptyDesc(body.description) ? Prisma.DbNull : body.description!,
      required: body.required,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  await audit(req, 'REQUIREMENT_TEMPLATE_CREATED', template.id, { visaCategoryId, stage: body.stage, key: body.key ?? null });
  res.status(201).json({ template });
});

adminRequirementsRouter.put('/:id', async (req, res) => {
  const body = parse(bodySchema.partial().omit({ visaCategoryId: true }), req.body);
  const existing = await prisma.requirementTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound('TEMPLATE_NOT_FOUND');
  const template = await prisma.requirementTemplate.update({
    where: { id: existing.id },
    data: {
      ...(body.stage ? { stage: body.stage } : {}),
      ...(body.key !== undefined ? { key: body.key } : {}),
      ...(body.title ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: isEmptyDesc(body.description) ? Prisma.DbNull : body.description! } : {}),
      ...(body.required !== undefined ? { required: body.required } : {}),
    },
  });
  await audit(req, 'REQUIREMENT_TEMPLATE_UPDATED', template.id, { changed: Object.keys(body) });
  res.json({ template });
});

adminRequirementsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.requirementTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound('TEMPLATE_NOT_FOUND');
  await prisma.requirementTemplate.delete({ where: { id: existing.id } });
  await audit(req, 'REQUIREMENT_TEMPLATE_DELETED', existing.id, { visaCategoryId: existing.visaCategoryId, stage: existing.stage, key: existing.key });
  res.json({ ok: true });
});

/** New order of a list: ids in the wanted order (all of one visa type + stage). */
adminRequirementsRouter.post('/reorder', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string()).min(1).max(200) }), req.body);
  const rows = await prisma.requirementTemplate.findMany({ where: { id: { in: ids } } });
  if (rows.length !== new Set(ids).size) throw badRequest('TEMPLATE_NOT_FOUND');
  const first = rows[0];
  if (rows.some((r) => r.visaCategoryId !== first.visaCategoryId || r.stage !== first.stage)) throw badRequest('MIXED_LISTS');
  await prisma.$transaction(ids.map((id, i) => prisma.requirementTemplate.update({ where: { id }, data: { sortOrder: i } })));
  await audit(req, 'REQUIREMENT_TEMPLATE_REORDERED', first.visaCategoryId ?? 'global', { stage: first.stage, count: ids.length });
  res.json({ ok: true });
});

/** Copies the global set (or the built-in defaults when there is none) to a visa type. */
adminRequirementsRouter.post('/copy-defaults', async (req, res) => {
  const { visaCategoryId, replace } = parse(z.object({ visaCategoryId: z.string(), replace: z.boolean().default(false) }), req.body);
  await ensureVisa(visaCategoryId);
  const existing = await prisma.requirementTemplate.count({ where: { visaCategoryId } });
  if (existing && !replace) throw conflict('TEMPLATES_EXIST');
  const global = await prisma.requirementTemplate.findMany({ where: { visaCategoryId: null }, orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }] });
  const source = global.length
    ? global.map((g) => ({ stage: g.stage, key: g.key, title: g.title as Prisma.InputJsonValue, description: (g.description ?? undefined) as Prisma.InputJsonValue | undefined, required: g.required, sortOrder: g.sortOrder }))
    : (['INITIAL', 'EMBASSY'] as const).flatMap((s) => DEFAULT_REQUIREMENTS[s].map((r, i) => ({ stage: s, key: r.key, title: r.title as Prisma.InputJsonValue, description: r.description as Prisma.InputJsonValue | undefined, required: r.required, sortOrder: i })));
  await prisma.$transaction(async (tx) => {
    if (existing) await tx.requirementTemplate.deleteMany({ where: { visaCategoryId } });
    await tx.requirementTemplate.createMany({ data: source.map((s) => ({ ...s, visaCategoryId })) });
  });
  await audit(req, 'REQUIREMENT_TEMPLATES_COPIED', visaCategoryId, { count: source.length, replaced: existing > 0 });
  const rows = await prisma.requirementTemplate.findMany({ where: { visaCategoryId }, orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }] });
  res.status(201).json({ templates: grouped(rows), count: source.length });
});

/** Creates the global set from the built-in defaults when it is empty. */
adminRequirementsRouter.post('/seed-defaults', async (req, res) => {
  const created = await seedDefaultTemplates();
  await audit(req, 'REQUIREMENT_TEMPLATES_SEEDED', 'global', { created });
  const rows = await prisma.requirementTemplate.findMany({ where: { visaCategoryId: null }, orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }] });
  res.json({ created, templates: grouped(rows) });
});
