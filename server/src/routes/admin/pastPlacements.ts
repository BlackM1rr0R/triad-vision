import { Router } from 'express';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { clearCache } from '../../lib/cache.js';
import { notFound, parse } from '../../lib/http.js';
import { auditView, formOptions, pastPlacementSchema, publicPreview, toPastPlacementData } from '../../lib/pastPlacements/service.js';

/**
 * Past placements — mounted at /api/admin/past-placements (STAFF+ read via the admin index, writes ADMIN+).
 * Every write is audited and clears the public cache, so the globe / map show the new totals right away.
 *   GET    /       rows, form options (cities, professions, Bundesländer) and the public map preview
 *   POST   /       create
 *   PUT    /:id    update (full row)
 *   DELETE /:id    delete
 */
export const adminPastPlacementsRouter = Router();
const adminOnly = requireMinRole('ADMIN');

adminPastPlacementsRouter.get('/', async (_req, res) => {
  const [rows, options, preview] = await Promise.all([
    prisma.pastPlacement.findMany({ orderBy: [{ city: 'asc' }, { year: 'desc' }, { createdAt: 'asc' }] }),
    formOptions(),
    publicPreview(),
  ]);
  res.json({ rows, total: rows.reduce((s, r) => s + r.count, 0), options, preview });
});

adminPastPlacementsRouter.post('/', adminOnly, async (req, res) => {
  const data = await toPastPlacementData(parse(pastPlacementSchema, req.body));
  const row = await prisma.pastPlacement.create({ data: { ...data, createdById: req.user?.id ?? null, updatedById: req.user?.id ?? null } });
  clearCache();
  await audit(req, 'PAST_PLACEMENT_CREATED', row.id, auditView(row));
  res.status(201).json({ row });
});

adminPastPlacementsRouter.put('/:id', adminOnly, async (req, res) => {
  const before = await prisma.pastPlacement.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound('PAST_PLACEMENT_NOT_FOUND');
  const data = await toPastPlacementData(parse(pastPlacementSchema, req.body));
  const row = await prisma.pastPlacement.update({ where: { id: before.id }, data: { ...data, updatedById: req.user?.id ?? null } });
  clearCache();
  await audit(req, 'PAST_PLACEMENT_UPDATED', row.id, { from: auditView(before), to: auditView(row) });
  res.json({ row });
});

adminPastPlacementsRouter.delete('/:id', adminOnly, async (req, res) => {
  const row = await prisma.pastPlacement.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('PAST_PLACEMENT_NOT_FOUND');
  await prisma.pastPlacement.delete({ where: { id: row.id } });
  clearCache();
  await audit(req, 'PAST_PLACEMENT_DELETED', row.id, auditView(row));
  res.json({ ok: true });
});
