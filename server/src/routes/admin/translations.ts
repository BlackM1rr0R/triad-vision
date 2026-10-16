import { Router, type Request } from 'express';
import type { Prisma, TranslationStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import {
  MAX_FILES_PER_KIND,
  OPEN_STATUSES,
  WORKING_STATUSES,
  canTransition,
  deleteStoredFile,
  discardUploads,
  isOverdue,
  loadOrder,
  notifyOrderClient,
  notifyOrderStaff,
  orderKey,
  parseOrderKey,
  recordChange,
  staffView,
  translationUpload,
  uploadedFiles,
  verifyUploads,
} from '../../lib/translations/core.js';
import { SERVICES } from '../../lib/translations/pricing.js';
import { decodeOriginalName } from '../../middleware/upload.js';

/** Staff side of translation & apostille orders (/api/admin/translations; the admin router requires STAFF). */
export const adminTranslationsRouter = Router();

const STATUSES = ['NEW', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'] as const;
const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

const getOrder = async (req: Request) => {
  const order = await loadOrder(String(req.params.id));
  if (!order) throw notFound('ORDER_NOT_FOUND');
  return order;
};

const respond = async (id: string) => ({ order: staffView((await loadOrder(id))!) });

/** GET /api/admin/translations/summary → counters for the dashboard. */
adminTranslationsRouter.get('/summary', async (_req, res) => {
  const now = new Date();
  const [open, toQuote, overdue, ready] = await Promise.all([
    prisma.translationOrder.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.translationOrder.count({ where: { status: 'NEW' } }),
    prisma.translationOrder.count({ where: { status: { in: WORKING_STATUSES }, dueAt: { lt: now } } }),
    prisma.translationOrder.count({ where: { status: 'READY' } }),
  ]);
  res.json({ open, new: toQuote, overdue, ready });
});

const listQuery = z.object({
  status: z.string().max(200).optional(), // one status or a comma list; "open" = every open status
  service: z.enum(SERVICES).optional(),
  assignee: z.string().max(40).optional(), // user id | "me" | "none"
  search: z.string().trim().max(100).optional(),
  overdue: z.enum(['1', 'true', '0', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /api/admin/translations → filtered list (status, service, assignee, search, overdue). */
adminTranslationsRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const and: Prisma.TranslationOrderWhereInput[] = [];
  if (q.status) {
    const wanted = q.status === 'open' ? OPEN_STATUSES : q.status.split(',').map((s) => s.trim().toUpperCase());
    const valid = wanted.filter((s): s is TranslationStatus => (STATUSES as readonly string[]).includes(s));
    if (!valid.length) throw badRequest('INVALID_STATUS');
    and.push({ status: { in: valid } });
  }
  if (q.service) and.push({ service: q.service });
  if (q.assignee === 'me') and.push({ assignedStaffId: req.user!.id });
  else if (q.assignee === 'none') and.push({ assignedStaffId: null });
  else if (q.assignee) and.push({ assignedStaffId: q.assignee });
  if (q.overdue === '1' || q.overdue === 'true') and.push({ status: { in: WORKING_STATUSES }, dueAt: { lt: new Date() } });
  if (q.search) {
    // "TR-12" / "12" looks up the order number; anything else searches the client's name and email.
    const num = parseOrderKey(q.search);
    if (num != null) and.push({ number: num });
    else {
      const words = q.search.split(/\s+/).filter(Boolean).slice(0, 4);
      and.push({
        AND: words.map((w) => ({
          OR: [{ client: { firstName: { contains: w } } }, { client: { lastName: { contains: w } } }, { client: { email: { contains: w } } }],
        })),
      });
    }
  }
  const where: Prisma.TranslationOrderWhereInput = and.length ? { AND: and } : {};
  const [total, rows] = await Promise.all([
    prisma.translationOrder.count({ where }),
    prisma.translationOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedStaff: { select: { id: true, firstName: true, lastName: true } },
        case: { select: { id: true, number: true } },
        _count: { select: { files: true } },
      },
    }),
  ]);
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((o) => ({
      id: o.id,
      number: o.number,
      key: orderKey(o.number),
      service: o.service,
      sourceLang: o.sourceLang,
      targetLang: o.targetLang,
      pages: o.pages,
      urgency: o.urgency,
      status: o.status,
      priceCents: o.priceCents,
      currency: o.currency,
      dueAt: o.dueAt,
      deliveryMethod: o.deliveryMethod,
      createdAt: o.createdAt,
      overdue: isOverdue(o),
      client: o.client,
      assignedStaff: o.assignedStaff,
      case: o.case,
      fileCount: o._count.files,
    })),
  });
});

/** GET /api/admin/translations/:id → full order incl. internal notes and events. */
adminTranslationsRouter.get('/:id', async (req, res) => {
  res.json({ order: staffView(await getOrder(req)) });
});

const patchSchema = z
  .object({
    assignedStaffId: z.string().min(1).max(40).nullable().optional(),
    staffNote: z.string().trim().max(5000).nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    trackingNumber: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

/** PATCH /api/admin/translations/:id → assignee, internal note, due date, tracking number. */
adminTranslationsRouter.patch('/:id', async (req, res) => {
  const body = parse(patchSchema, req.body);
  const order = await getOrder(req);
  if (body.assignedStaffId) {
    const ok = await prisma.user.findFirst({ where: { id: body.assignedStaffId, isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true } });
    if (!ok) throw badRequest('INVALID_ASSIGNEE');
  }
  const data: Prisma.TranslationOrderUncheckedUpdateInput = {};
  const changed: string[] = [];
  if (body.assignedStaffId !== undefined && body.assignedStaffId !== order.assignedStaffId) {
    data.assignedStaffId = body.assignedStaffId;
    changed.push('assignee');
  }
  if (body.staffNote !== undefined && (body.staffNote || null) !== order.staffNote) {
    data.staffNote = body.staffNote || null;
    changed.push('staffNote');
  }
  if (body.dueAt !== undefined && (body.dueAt?.getTime() ?? null) !== (order.dueAt?.getTime() ?? null)) {
    data.dueAt = body.dueAt;
    changed.push('dueAt');
  }
  if (body.trackingNumber !== undefined && (body.trackingNumber || null) !== order.trackingNumber) {
    data.trackingNumber = body.trackingNumber || null;
    changed.push('trackingNumber');
  }
  if (!changed.length) return void res.json({ order: staffView(order) });

  const updated = await prisma.translationOrder.update({ where: { id: order.id }, data });
  await recordChange(req, order, 'TRANSLATION_UPDATED', { note: `updated: ${changed.join(', ')}`, visibleToClient: false }, { changed });
  if (changed.includes('assignee') && updated.assignedStaffId && updated.assignedStaffId !== req.user!.id) {
    await notifyOrderStaff(updated, 'ASSIGNED', { recipients: [updated.assignedStaffId] }).catch(() => undefined);
  }
  res.json(await respond(order.id));
});

/** POST /api/admin/translations/:id/quote { priceCents, dueAt, quoteNote } → NEW/QUOTED → QUOTED, client notified. */
adminTranslationsRouter.post('/:id/quote', async (req, res) => {
  const body = parse(
    z.object({
      priceCents: z.coerce.number().int().min(0).max(100_000_000),
      dueAt: z.coerce.date(),
      quoteNote: z.string().trim().max(2000).nullable().optional(),
      currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()).optional(),
    }),
    req.body,
  );
  const order = await getOrder(req);
  if (body.dueAt.getTime() < Date.now() - 24 * 3600_000) throw badRequest('DUE_IN_PAST');
  const { count } = await prisma.translationOrder.updateMany({
    where: { id: order.id, status: { in: ['NEW', 'QUOTED'] } },
    data: { status: 'QUOTED', priceCents: body.priceCents, dueAt: body.dueAt, quoteNote: body.quoteNote || null, ...(body.currency ? { currency: body.currency } : {}) },
  });
  if (!count) throw conflict('INVALID_TRANSITION');
  const updated = await prisma.translationOrder.findUniqueOrThrow({ where: { id: order.id } });
  await recordChange(req, order, 'TRANSLATION_QUOTED', { status: 'QUOTED', note: body.quoteNote || null }, { priceCents: body.priceCents, dueAt: body.dueAt.toISOString() });
  await notifyOrderClient(updated, 'QUOTED', body.quoteNote).catch((e) => console.error('[translations] notify failed', e));
  res.json(await respond(order.id));
});

/** POST /api/admin/translations/:id/status { status, note, visibleToClient } → follows STATUS_TRANSITIONS. */
adminTranslationsRouter.post('/:id/status', async (req, res) => {
  const body = parse(
    z.object({
      status: z.enum(STATUSES),
      note: z.string().trim().max(2000).nullable().optional(),
      visibleToClient: z.boolean().default(true),
    }),
    req.body,
  );
  const order = await getOrder(req);
  if (!canTransition(order.status, body.status)) throw conflict('INVALID_TRANSITION');
  const note = body.note || null;
  if (body.status === 'CANCELLED' && !note) throw badRequest('REASON_REQUIRED');
  if (body.status === 'READY' && order.deliveryMethod === 'DIGITAL' && !order.files.some((f) => f.kind === 'RESULT')) throw conflict('RESULT_FILE_REQUIRED');

  const terminal = body.status === 'DELIVERED' || body.status === 'CANCELLED';
  const { count } = await prisma.translationOrder.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: body.status, ...(terminal ? { completedAt: new Date() } : {}) },
  });
  if (!count) throw conflict('INVALID_TRANSITION');
  // Client-facing statuses are always shown to the client; the toggle only hides the note of in-between steps.
  const visible = body.status === 'IN_PROGRESS' ? body.visibleToClient : true;
  await recordChange(req, order, 'TRANSLATION_STATUS', { status: body.status, note, visibleToClient: visible }, { from: order.status, to: body.status });
  if (body.status === 'READY' || body.status === 'DELIVERED' || body.status === 'CANCELLED') {
    const updated = await prisma.translationOrder.findUniqueOrThrow({ where: { id: order.id } });
    await notifyOrderClient(updated, body.status, note).catch((e) => console.error('[translations] notify failed', e));
  }
  res.json(await respond(order.id));
});

/** POST /api/admin/translations/:id/files (multipart "file", up to 10) → finished RESULT files. */
adminTranslationsRouter.post('/:id/files', translationUpload.array('file', 10), async (req, res) => {
  const files = uploadedFiles(req);
  try {
    const order = await getOrder(req);
    if (!files.length) throw badRequest('FILE_REQUIRED');
    if (!['ACCEPTED', 'IN_PROGRESS', 'READY'].includes(order.status)) throw conflict('ORDER_LOCKED');
    const count = order.files.filter((f) => f.kind === 'RESULT').length;
    if (count + files.length > MAX_FILES_PER_KIND) throw badRequest('TOO_MANY_FILES');
    await verifyUploads(files);
    await prisma.translationOrderFile.createMany({
      data: files.map((f) => ({ orderId: order.id, kind: 'RESULT' as const, storageKey: f.filename, filename: decodeOriginalName(f.originalname).slice(0, 255), mimeType: f.mimetype, size: f.size })),
    });
    await recordChange(req, order, 'TRANSLATION_FILE_UPLOADED', { note: files.map((f) => decodeOriginalName(f.originalname)).join(', '), visibleToClient: false }, { kind: 'RESULT', count: files.length });
    res.status(201).json(await respond(order.id));
  } catch (err) {
    await discardUploads(files);
    throw err;
  }
});

/** DELETE /api/admin/translations/:id/files/:fileId → remove a result file (not after delivery). */
adminTranslationsRouter.delete('/:id/files/:fileId', async (req, res) => {
  const order = await getOrder(req);
  const file = order.files.find((f) => f.id === String(req.params.fileId));
  if (!file || file.kind !== 'RESULT') throw notFound('FILE_NOT_FOUND');
  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') throw conflict('ORDER_LOCKED');
  await prisma.translationOrderFile.delete({ where: { id: file.id } });
  await deleteStoredFile(file);
  await recordChange(req, order, 'TRANSLATION_FILE_DELETED', { note: file.filename, visibleToClient: false }, { filename: file.filename });
  res.json(await respond(order.id));
});
