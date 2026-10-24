import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { clearCache } from '../../lib/cache.js';
import {
  activateOrder,
  adminPackageView,
  cancelOrder,
  createPackage,
  deletePackage,
  listOrders,
  updatePackage,
} from '../../lib/billing/packages.js';
import { remindRequest, type Actor } from '../../lib/esign/service.js';

/**
 * Service packages and their online orders — mounted at /api/admin/packages (ADMIN+). Package texts are
 * L10n (az / de / en / ru; the public site shows English to tr / uk visitors like other CMS content).
 * Writes clear the public cache (packages page, SEO head / body / sitemap).
 */
export const adminPackagesRouter = Router();

const id = (req: Request) => String(req.params.id);
const actorOf = (req: Request): Actor => ({ id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName });

adminPackagesRouter.get('/', async (_req, res) => {
  const [packages, templates, orderCounts] = await Promise.all([
    prisma.servicePackage.findMany({ orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] }),
    prisma.contractTemplate.findMany({ where: { kind: 'SERVICE' }, select: { id: true, name: true, language: true, active: true, isDefault: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    prisma.packageOrder.groupBy({ by: ['packageId'], _count: { _all: true } }),
  ]);
  const counts = new Map(orderCounts.map((c) => [c.packageId, c._count._all]));
  res.json({ packages: packages.map((p) => ({ ...adminPackageView(p), orders: counts.get(p.id) ?? 0 })), templates });
});

adminPackagesRouter.post('/', async (req, res) => {
  const p = await createPackage(req.body ?? {});
  clearCache();
  await audit(req, 'SERVICE_PACKAGE_CREATE', p.id, { slug: p.slug });
  res.status(201).json({ package: adminPackageView(p) });
});

adminPackagesRouter.put('/:id', async (req, res) => {
  const p = await updatePackage(id(req), req.body ?? {});
  clearCache();
  await audit(req, 'SERVICE_PACKAGE_UPDATE', p.id, { slug: p.slug, published: p.published });
  res.json({ package: adminPackageView(p) });
});

adminPackagesRouter.delete('/:id', async (req, res) => {
  await deletePackage(id(req));
  clearCache();
  await audit(req, 'SERVICE_PACKAGE_DELETE', id(req));
  res.json({ ok: true });
});

// ─── Orders ──────────────────────────────────────────────────────────

adminPackagesRouter.get('/orders/list', async (req, res) => {
  const q = parse(z.object({ status: z.enum(['STARTED', 'SIGNED', 'ACTIVE', 'CANCELLED']).optional(), q: z.string().trim().max(80).optional() }), req.query);
  res.json(await listOrders(q));
});

adminPackagesRouter.post('/orders/:id/cancel', async (req, res) => {
  const o = await cancelOrder(id(req), actorOf(req));
  await audit(req, 'PACKAGE_ORDER_CANCEL', o.id);
  res.json({ ok: true, status: o.status });
});

/** Activation again (after a failure: e.g. the e-mail belonged to a staff account and was fixed). */
adminPackagesRouter.post('/orders/:id/retry', async (req, res) => {
  const o = await activateOrder(id(req));
  if (!o) throw notFound('ORDER_NOT_FOUND');
  await audit(req, 'PACKAGE_ORDER_RETRY', o.id, { status: o.status });
  res.json({ ok: true, status: o.status });
});

/** New signing link to the client. */
adminPackagesRouter.post('/orders/:id/remind', async (req, res) => {
  const o = await prisma.packageOrder.findUnique({ where: { id: id(req) } });
  if (!o?.signatureRequestId) throw notFound('ORDER_NOT_FOUND');
  const r = await remindRequest(o.signatureRequestId, actorOf(req), null, { actorId: req.user!.id });
  await audit(req, 'PACKAGE_ORDER_REMIND', o.id);
  res.json(r);
});
