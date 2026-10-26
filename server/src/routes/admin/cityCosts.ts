import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { clearCache } from '../../lib/cache.js';
import { conflict, notFound, parse } from '../../lib/http.js';
import { cityCostSchema, DEFAULT_CITY_COSTS, ensureCityCosts, toCityCostData } from '../../lib/budget/cities.js';

/**
 * City cost data of the first-month budget — mounted at /api/admin/city-costs (ADMIN+ via the admin index).
 * Every write is audited and clears the public cache, so /budget shows the new figures right away.
 *   GET    /                 all rows (incl. inactive) + the default rows for "restore"
 *   POST   /                 create
 *   PUT    /:id              update (full row)
 *   DELETE /:id              delete
 *   POST   /restore-defaults add the default rows whose slug is missing (existing rows stay as they are)
 */
export const adminCityCostsRouter = Router();

const isUniqueError = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

adminCityCostsRouter.get('/', async (_req, res) => {
  await ensureCityCosts();
  const rows = await prisma.cityCost.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  res.json({ rows, defaultSlugs: DEFAULT_CITY_COSTS.map((d) => d.slug) });
});

adminCityCostsRouter.post('/', async (req, res) => {
  const body = parse(cityCostSchema, req.body);
  try {
    const row = await prisma.cityCost.create({ data: toCityCostData(body) });
    clearCache();
    await audit(req, 'CITY_COST_CREATED', row.id, { slug: row.slug, name: row.name });
    res.status(201).json({ row });
  } catch (err) {
    if (isUniqueError(err)) throw conflict('SLUG_TAKEN');
    throw err;
  }
});

adminCityCostsRouter.put('/:id', async (req, res) => {
  const before = await prisma.cityCost.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound('CITY_COST_NOT_FOUND');
  const data = toCityCostData(parse(cityCostSchema, req.body));
  try {
    const row = await prisma.cityCost.update({ where: { id: before.id }, data });
    clearCache();
    // Audit only the fields that changed (old → new).
    const changes: Record<string, { from: Prisma.JsonValue; to: Prisma.JsonValue }> = {};
    for (const [k, v] of Object.entries(data)) {
      const old = (before as Record<string, unknown>)[k];
      const norm = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : (x ?? null)) as Prisma.JsonValue;
      if (JSON.stringify(norm(old)) !== JSON.stringify(norm(v))) changes[k] = { from: norm(old), to: norm(v) };
    }
    await audit(req, 'CITY_COST_UPDATED', row.id, { slug: row.slug, changes } as Prisma.InputJsonValue);
    res.json({ row });
  } catch (err) {
    if (isUniqueError(err)) throw conflict('SLUG_TAKEN');
    throw err;
  }
});

adminCityCostsRouter.delete('/:id', async (req, res) => {
  const row = await prisma.cityCost.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('CITY_COST_NOT_FOUND');
  await prisma.cityCost.delete({ where: { id: row.id } });
  clearCache();
  await audit(req, 'CITY_COST_DELETED', row.id, { slug: row.slug, name: row.name });
  res.json({ ok: true });
});

adminCityCostsRouter.post('/restore-defaults', async (req, res) => {
  const existing = new Set((await prisma.cityCost.findMany({ select: { slug: true } })).map((r) => r.slug));
  const missing = DEFAULT_CITY_COSTS.filter((d) => !existing.has(d.slug));
  if (missing.length) await prisma.cityCost.createMany({ data: missing, skipDuplicates: true });
  clearCache();
  await audit(req, 'CITY_COST_DEFAULTS_RESTORED', undefined, { added: missing.map((m) => m.slug) });
  res.json({ added: missing.length });
});
