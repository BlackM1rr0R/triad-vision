import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { isStaff, requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../lib/http.js';
import {
  MAX_FILES_PER_KIND,
  clientView,
  createNumberedOrder,
  deleteStoredFile,
  discardUploads,
  loadOrder,
  notifyOrderStaff,
  orderInclude,
  recordChange,
  sendOrderFile,
  translationUpload,
  uploadedFiles,
  verifyUploads,
} from '../lib/translations/core.js';
import { SERVICES, estimatePrice, loadPricing, needsDistinctLanguages } from '../lib/translations/pricing.js';
import { decodeOriginalName } from '../middleware/upload.js';

/**
 * Translation & apostille orders for clients (/api/translations). A client only ever sees their own
 * orders; staff may download files here too (the admin API lives in routes/admin/translations.ts).
 */
export const translationsRouter = Router();

translationsRouter.use(requireAuth);

/** Staff access counts only once 2FA is enrolled (same gate as /api/admin and case files). */
const staffAccess = (req: Request) => isStaff(req.user) && !!req.user!.twoFactorEnabled;

/** The caller's own order (404 for anybody else's, so ids cannot be probed). */
const ownOrder = async (req: Request) => {
  const order = await loadOrder(String(req.params.id));
  if (!order || order.clientId !== req.user!.id) throw notFound('ORDER_NOT_FOUND');
  return order;
};

/** GET /api/translations/pricing → languages, document types, per-page prices, express surcharge. */
translationsRouter.get('/pricing', async (_req, res) => {
  res.json({ pricing: await loadPricing() });
});

/** GET /api/translations/estimate?service=&pages=&urgency= → estimate (not binding). */
translationsRouter.get('/estimate', async (req, res) => {
  const q = parse(
    z.object({ service: z.enum(SERVICES), pages: z.coerce.number().int().min(1).max(200), urgency: z.enum(['STANDARD', 'EXPRESS']).default('STANDARD') }),
    req.query,
  );
  const pricing = await loadPricing();
  res.json({ currency: pricing.currency, ...estimatePrice(pricing, q) });
});

/** GET /api/translations/case-documents → my cases and their documents (to reuse as sources). */
translationsRouter.get('/case-documents', async (req, res) => {
  const cases = await prisma.case.findMany({
    where: { clientId: req.user!.id, documentsPurgedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      profession: true,
      documents: { orderBy: { createdAt: 'desc' }, select: { id: true, originalName: true, mimeType: true, size: true, stage: true, status: true, createdAt: true } },
    },
  });
  res.json({ cases });
});

/** GET /api/translations → my orders, newest first. */
translationsRouter.get('/', async (req, res) => {
  const orders = await prisma.translationOrder.findMany({
    where: { clientId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: orderInclude,
    take: 200,
  });
  res.json({ items: orders.map(clientView) });
});

const createSchema = z
  .object({
    service: z.enum(SERVICES),
    sourceLang: z.string().trim().toLowerCase().min(2).max(8),
    targetLang: z.string().trim().toLowerCase().min(2).max(8),
    documentTypes: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
    pages: z.coerce.number().int().min(1).max(200),
    urgency: z.enum(['STANDARD', 'EXPRESS']).default('STANDARD'),
    deliveryMethod: z.enum(['DIGITAL', 'PICKUP', 'COURIER']).default('DIGITAL'),
    deliveryAddress: z.string().trim().max(300).optional().nullable(),
    caseId: z.string().min(1).max(40).optional().nullable(),
    clientNote: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

/** POST /api/translations → new order (status NEW) with a price estimate. */
translationsRouter.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);
  const pricing = await loadPricing();
  if (!pricing.languages.includes(body.sourceLang) || !pricing.languages.includes(body.targetLang)) throw badRequest('UNSUPPORTED_LANGUAGE');
  if (needsDistinctLanguages(body.service) && body.sourceLang === body.targetLang) throw badRequest('SAME_LANGUAGE');
  const documentTypes = [...new Set(body.documentTypes)];
  if (documentTypes.some((d) => !pricing.documentTypes.includes(d))) throw badRequest('UNSUPPORTED_DOCUMENT_TYPE');
  const address = body.deliveryAddress?.trim() || null;
  if (body.deliveryMethod === 'COURIER' && (!address || address.length < 5)) throw badRequest('DELIVERY_ADDRESS_REQUIRED');
  if (body.caseId) {
    const own = await prisma.case.findFirst({ where: { id: body.caseId, clientId: req.user!.id }, select: { id: true } });
    if (!own) throw badRequest('CASE_NOT_FOUND');
  }

  const order = await createNumberedOrder((tx, number) =>
    tx.translationOrder.create({
      data: {
        number,
        clientId: req.user!.id,
        caseId: body.caseId ?? null,
        service: body.service,
        sourceLang: body.sourceLang,
        targetLang: body.targetLang,
        documentTypes,
        pages: body.pages,
        urgency: body.urgency,
        currency: pricing.currency,
        deliveryMethod: body.deliveryMethod,
        deliveryAddress: body.deliveryMethod === 'COURIER' ? address : null,
        clientNote: body.clientNote?.trim() || null,
      },
    }),
  );
  const estimate = estimatePrice(pricing, body);
  await recordChange(req, order, 'TRANSLATION_CREATED', { status: 'NEW' }, { service: order.service, estimateCents: estimate.totalCents });
  await notifyOrderStaff(order, 'NEW').catch((e) => console.error('[translations] notify failed', e));
  res.status(201).json({ order: clientView((await loadOrder(order.id))!), estimate: { currency: pricing.currency, ...estimate } });
});

/** GET /api/translations/files/:fileId → download (owner or staff; results only once ready for the client). */
translationsRouter.get('/files/:fileId', async (req, res) => {
  const file = await prisma.translationOrderFile.findUnique({
    where: { id: String(req.params.fileId) },
    include: { order: { select: { clientId: true, status: true } } },
  });
  if (!file) throw notFound('FILE_NOT_FOUND');
  if (!staffAccess(req)) {
    if (file.order.clientId !== req.user!.id) throw notFound('FILE_NOT_FOUND');
    if (file.kind === 'RESULT' && file.order.status !== 'READY' && file.order.status !== 'DELIVERED') throw notFound('FILE_NOT_FOUND');
  }
  await sendOrderFile(req, res, file);
});

/** GET /api/translations/:id → my order with files and the client-visible timeline. */
translationsRouter.get('/:id', async (req, res) => {
  res.json({ order: clientView(await ownOrder(req)) });
});

const ensureSourceRoom = async (orderId: string, adding: number) => {
  const count = await prisma.translationOrderFile.count({ where: { orderId, kind: 'SOURCE' } });
  if (count + adding > MAX_FILES_PER_KIND) throw badRequest('TOO_MANY_FILES');
};

/** POST /api/translations/:id/files (multipart "file", up to 10) → source documents, while NEW / QUOTED. */
translationsRouter.post('/:id/files', translationUpload.array('file', 10), async (req, res) => {
  const files = uploadedFiles(req);
  try {
    const order = await ownOrder(req);
    if (!files.length) throw badRequest('FILE_REQUIRED');
    if (order.status !== 'NEW' && order.status !== 'QUOTED') throw conflict('ORDER_LOCKED');
    await ensureSourceRoom(order.id, files.length);
    await verifyUploads(files);
    await prisma.translationOrderFile.createMany({
      data: files.map((f) => ({ orderId: order.id, kind: 'SOURCE' as const, storageKey: f.filename, filename: decodeOriginalName(f.originalname).slice(0, 255), mimeType: f.mimetype, size: f.size })),
    });
    await recordChange(req, order, 'TRANSLATION_FILE_UPLOADED', { note: null, visibleToClient: false }, { kind: 'SOURCE', count: files.length });
    res.status(201).json({ order: clientView((await loadOrder(order.id))!) });
  } catch (err) {
    await discardUploads(files);
    throw err;
  }
});

/** POST /api/translations/:id/files/from-case { documentIds } → reuse my case documents (no copy of the bytes). */
translationsRouter.post('/:id/files/from-case', async (req, res) => {
  const { documentIds } = parse(z.object({ documentIds: z.array(z.string().min(1).max(40)).min(1).max(MAX_FILES_PER_KIND) }), req.body);
  const order = await ownOrder(req);
  if (order.status !== 'NEW' && order.status !== 'QUOTED') throw conflict('ORDER_LOCKED');
  const ids = [...new Set(documentIds)];
  const docs = await prisma.document.findMany({
    where: { id: { in: ids }, case: { clientId: req.user!.id, documentsPurgedAt: null } },
    select: { id: true, originalName: true, mimeType: true, size: true },
  });
  if (docs.length !== ids.length) throw badRequest('DOCUMENT_NOT_FOUND');
  const already = new Set(order.files.filter((f) => f.documentId).map((f) => f.documentId));
  const fresh = docs.filter((d) => !already.has(d.id));
  await ensureSourceRoom(order.id, fresh.length);
  if (fresh.length) {
    await prisma.translationOrderFile.createMany({
      data: fresh.map((d) => ({ orderId: order.id, kind: 'SOURCE' as const, documentId: d.id, filename: d.originalName.slice(0, 255), mimeType: d.mimeType, size: d.size })),
    });
    await recordChange(req, order, 'TRANSLATION_FILE_LINKED', { visibleToClient: false }, { documentIds: fresh.map((d) => d.id) });
  }
  res.status(201).json({ order: clientView((await loadOrder(order.id))!) });
});

/** DELETE /api/translations/:id/files/:fileId → remove one of my source files while the order is NEW. */
translationsRouter.delete('/:id/files/:fileId', async (req, res) => {
  const order = await ownOrder(req);
  const file = order.files.find((f) => f.id === String(req.params.fileId));
  if (!file || file.kind !== 'SOURCE') throw notFound('FILE_NOT_FOUND');
  if (order.status !== 'NEW') throw conflict('ORDER_LOCKED');
  await prisma.translationOrderFile.delete({ where: { id: file.id } });
  await deleteStoredFile(file);
  await recordChange(req, order, 'TRANSLATION_FILE_DELETED', { visibleToClient: false }, { filename: file.filename });
  res.json({ order: clientView((await loadOrder(order.id))!) });
});

/** POST /api/translations/:id/accept → accept the staff quote (QUOTED → ACCEPTED). */
translationsRouter.post('/:id/accept', async (req, res) => {
  const order = await ownOrder(req);
  const { count } = await prisma.translationOrder.updateMany({
    where: { id: order.id, status: 'QUOTED' },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });
  if (!count) throw conflict('INVALID_TRANSITION');
  await recordChange(req, order, 'TRANSLATION_ACCEPTED', { status: 'ACCEPTED' }, { priceCents: order.priceCents });
  await notifyOrderStaff(order, 'ACCEPTED').catch((e) => console.error('[translations] notify failed', e));
  res.json({ order: clientView((await loadOrder(order.id))!) });
});

/** POST /api/translations/:id/cancel { reason? } → only before work starts (NEW / QUOTED). */
translationsRouter.post('/:id/cancel', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(1000).optional().nullable() }), req.body ?? {});
  const order = await ownOrder(req);
  const { count } = await prisma.translationOrder.updateMany({
    where: { id: order.id, status: { in: ['NEW', 'QUOTED'] } },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
  if (!count) throw conflict('INVALID_TRANSITION');
  await recordChange(req, order, 'TRANSLATION_CANCELLED', { status: 'CANCELLED', note: reason || null }, { by: 'client' });
  if (order.assignedStaffId) await notifyOrderStaff(order, 'CLIENT_CANCELLED', { note: reason, assigneeOnly: true }).catch(() => undefined);
  res.json({ order: clientView((await loadOrder(order.id))!) });
});
