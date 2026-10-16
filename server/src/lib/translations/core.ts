import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Prisma, TranslationOrder, TranslationOrderFile, TranslationStatus } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { audit } from '../audit.js';
import { CASE_DOC_MIME, INLINE_MIME, resolveMime } from '../fileCheck.js';
import { badRequest, notFound } from '../http.js';
import { publish } from '../messaging/realtime.js';
import { notifyUser } from '../notifications.js';
import { decodeOriginalName, verifyUploadedFile } from '../../middleware/upload.js';
import { formatDay, formatMoney, translationNotice, type NoticeParams, type TranslationNoticeKind } from './texts.js';

// ─── Numbers ───────────────────────────────────────────────────────────

export const orderKey = (n: number) => `TR-${String(n).padStart(4, '0')}`;

/** Parses "TR-12", "tr12" or "12" into the order number. */
export const parseOrderKey = (s: string) => {
  const m = /^(?:tr-?)?(\d{1,9})$/i.exec(s.trim());
  return m ? Number(m[1]) : null;
};

/** Next free number (max + 1) inside a transaction; retried when two orders race for the same number. */
export const createNumberedOrder = async <T>(create: (tx: Prisma.TransactionClient, number: number) => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const max = await tx.translationOrder.aggregate({ _max: { number: true } });
        return create(tx, (max._max.number ?? 0) + 1);
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? '');
      if (code === 'P2002' && attempt < 6 && (target.includes('number') || target === '')) continue;
      throw err;
    }
  }
};

// ─── Status flow ───────────────────────────────────────────────────────

export const OPEN_STATUSES: TranslationStatus[] = ['NEW', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'READY'];
export const WORKING_STATUSES: TranslationStatus[] = ['ACCEPTED', 'IN_PROGRESS'];

/** Transitions staff may make through POST /status (quote and acceptance have their own endpoints). */
export const STATUS_TRANSITIONS: Record<TranslationStatus, TranslationStatus[]> = {
  NEW: ['CANCELLED'],
  QUOTED: ['CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'CANCELLED'],
  READY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const canTransition = (from: TranslationStatus, to: TranslationStatus) => STATUS_TRANSITIONS[from].includes(to);

export const isOverdue = (o: Pick<TranslationOrder, 'status' | 'dueAt'>, now = new Date()) =>
  !!o.dueAt && WORKING_STATUSES.includes(o.status) && o.dueAt.getTime() < now.getTime();

// ─── File storage ──────────────────────────────────────────────────────

export const TRANSLATIONS_DIR = path.join(config.uploads.privateDir, 'translations');
fs.mkdirSync(TRANSLATIONS_DIR, { recursive: true });

export const MAX_FILES_PER_KIND = 20;

export const translationUpload = multer({
  storage: multer.diskStorage({
    // Re-created on demand, so a removed folder (fresh volume, cleanup) never breaks uploads.
    destination: (_req, _file, cb) => {
      fs.mkdir(TRANSLATIONS_DIR, { recursive: true }, (err) => cb(err, TRANSLATIONS_DIR));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: config.uploads.maxFileSize, files: 10 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && CASE_DOC_MIME.has(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

/** Removes stored uploads (e.g. when a request fails after multer wrote them). */
export const discardUploads = async (files: Express.Multer.File[]) => {
  await Promise.all(files.map((f) => fsp.unlink(f.path).catch(() => undefined)));
};

/** Verifies every uploaded file's bytes; on any mismatch all of them are removed and a 400 raised. */
export const verifyUploads = async (files: Express.Multer.File[]) => {
  try {
    for (const f of files) await verifyUploadedFile(f);
  } catch (err) {
    await discardUploads(files);
    throw err;
  }
};

export const uploadedFiles = (req: Request) => (Array.isArray(req.files) ? req.files : req.file ? [req.file] : []);

export const deleteStoredFile = async (f: Pick<TranslationOrderFile, 'storageKey'>) => {
  if (f.storageKey) await fsp.unlink(path.join(TRANSLATIONS_DIR, f.storageKey)).catch(() => undefined);
};

/** Streams an order file (own upload or a reused case document) with safe download headers. */
export const sendOrderFile = async (req: Request, res: Response, f: TranslationOrderFile) => {
  let filePath: string;
  if (f.storageKey) filePath = path.join(TRANSLATIONS_DIR, f.storageKey);
  else if (f.documentId) {
    const doc = await prisma.document.findUnique({ where: { id: f.documentId }, select: { storedName: true } });
    if (!doc) throw notFound('FILE_NOT_FOUND');
    filePath = path.join(config.uploads.privateDir, doc.storedName);
  } else throw notFound('FILE_NOT_FOUND');
  if (!fs.existsSync(filePath)) throw notFound('FILE_NOT_FOUND');

  const inline = !req.query.download && INLINE_MIME.has(f.mimeType);
  res.setHeader('Content-Type', f.mimeType);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.sendFile(filePath);
};

// ─── Response shapes ───────────────────────────────────────────────────

const person = { id: true, firstName: true, lastName: true } satisfies Prisma.UserSelect;

export const orderInclude = {
  files: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { ...person, role: true } } } },
  case: { select: { id: true, number: true } },
  client: { select: { ...person, email: true, phone: true, locale: true } },
  assignedStaff: { select: person },
} satisfies Prisma.TranslationOrderInclude;

export type OrderFull = Prisma.TranslationOrderGetPayload<{ include: typeof orderInclude }>;

const fileShape = (f: TranslationOrderFile) => ({
  id: f.id,
  kind: f.kind,
  filename: f.filename,
  mimeType: f.mimeType,
  size: f.size,
  fromCase: !!f.documentId,
  documentId: f.documentId,
  createdAt: f.createdAt,
});

const baseShape = (o: TranslationOrder) => ({
  id: o.id,
  number: o.number,
  key: orderKey(o.number),
  caseId: o.caseId,
  service: o.service,
  sourceLang: o.sourceLang,
  targetLang: o.targetLang,
  documentTypes: Array.isArray(o.documentTypes) ? (o.documentTypes as string[]) : [],
  pages: o.pages,
  urgency: o.urgency,
  status: o.status,
  priceCents: o.priceCents,
  currency: o.currency,
  quoteNote: o.quoteNote,
  dueAt: o.dueAt,
  deliveryMethod: o.deliveryMethod,
  deliveryAddress: o.deliveryAddress,
  trackingNumber: o.trackingNumber,
  clientNote: o.clientNote,
  acceptedAt: o.acceptedAt,
  completedAt: o.completedAt,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
  overdue: isOverdue(o),
});

/** What the client sees: no internal note, no internal events, result files only once ready. */
export const clientView = (o: OrderFull) => {
  const resultsVisible = o.status === 'READY' || o.status === 'DELIVERED';
  return {
    ...baseShape(o),
    case: o.case,
    files: o.files.filter((f) => f.kind === 'SOURCE' || resultsVisible).map(fileShape),
    events: o.events
      .filter((e) => e.visibleToClient)
      .map((e) => ({ id: e.id, status: e.status, note: e.note, createdAt: e.createdAt, byStaff: !!e.actor && e.actor.role !== 'CLIENT' })),
  };
};

export const staffView = (o: OrderFull) => ({
  ...baseShape(o),
  staffNote: o.staffNote,
  case: o.case,
  client: o.client,
  assignedStaff: o.assignedStaff,
  files: o.files.map(fileShape),
  events: o.events.map((e) => ({
    id: e.id,
    status: e.status,
    note: e.note,
    visibleToClient: e.visibleToClient,
    createdAt: e.createdAt,
    actor: e.actor ? { id: e.actor.id, firstName: e.actor.firstName, lastName: e.actor.lastName, role: e.actor.role } : null,
  })),
});

export const loadOrder = (id: string) => prisma.translationOrder.findUnique({ where: { id }, include: orderInclude });

// ─── Events, audit, notifications ──────────────────────────────────────

/** Every change: an order event, an audit row and a realtime nudge to the client's open pages. */
export const recordChange = async (
  req: Request,
  order: Pick<TranslationOrder, 'id' | 'number' | 'clientId'>,
  action: string,
  event: { status?: TranslationStatus | null; note?: string | null; visibleToClient?: boolean },
  details: Prisma.InputJsonValue = {},
) => {
  await prisma.translationOrderEvent.create({
    data: { orderId: order.id, status: event.status ?? null, note: event.note ?? null, visibleToClient: event.visibleToClient ?? true, actorId: req.user?.id ?? null },
  });
  await audit(req, action, `translation:${order.id}`, { number: orderKey(order.number), ...(details as object) });
  publish(order.clientId, 'translation', { id: order.id, status: event.status ?? null });
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

type NotifyOrder = Pick<TranslationOrder, 'id' | 'number' | 'clientId' | 'priceCents' | 'currency' | 'dueAt' | 'deliveryMethod' | 'trackingNumber'>;

/** Client notification in the client's language (in-app + push + email per their preferences). */
export const notifyOrderClient = async (order: NotifyOrder, kind: Extract<TranslationNoticeKind, 'QUOTED' | 'READY' | 'DELIVERED' | 'CANCELLED'>, note?: string | null) => {
  const client = await prisma.user.findUnique({ where: { id: order.clientId }, select: { locale: true } });
  if (!client) return;
  const p: NoticeParams = {
    number: orderKey(order.number),
    price: order.priceCents != null ? formatMoney(order.priceCents, order.currency, client.locale) : undefined,
    due: order.dueAt ? formatDay(order.dueAt, client.locale) : undefined,
    note,
    delivery: order.deliveryMethod,
    tracking: order.trackingNumber,
  };
  const { title, body } = translationNotice(kind, client.locale, p);
  await notifyUser(order.clientId, { type: `TRANSLATION_${kind}`, title, body, link: `/account/translations/${order.id}` });
};

/** Staff notification: the assignee (when active staff) plus, unless `assigneeOnly`, every admin. */
export const notifyOrderStaff = async (
  order: Pick<TranslationOrder, 'id' | 'number' | 'clientId' | 'dueAt' | 'assignedStaffId'>,
  kind: Extract<TranslationNoticeKind, 'NEW' | 'ACCEPTED' | 'ASSIGNED' | 'OVERDUE' | 'CLIENT_CANCELLED'>,
  opts: { note?: string | null; assigneeOnly?: boolean; recipients?: string[] } = {},
) => {
  const client = await prisma.user.findUnique({ where: { id: order.clientId }, select: { firstName: true, lastName: true } });
  let ids = opts.recipients;
  if (!ids) {
    const assignee = order.assignedStaffId
      ? await prisma.user.findFirst({ where: { id: order.assignedStaffId, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } })
      : null;
    const admins = opts.assigneeOnly && assignee ? [] : await prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
    ids = [...new Set([...(assignee ? [assignee.id] : []), ...admins.map((a) => a.id)])];
  }
  if (!ids.length) return;
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, locale: true } });
  await Promise.all(
    users.map((u) => {
      const { title, body } = translationNotice(kind, u.locale, {
        number: orderKey(order.number),
        client: client ? fullName(client) : '—',
        due: order.dueAt ? formatDay(order.dueAt, u.locale) : undefined,
        note: opts.note,
      });
      return notifyUser(u.id, { type: `TRANSLATION_${kind}`, title, body, link: `/admin/translations/${order.id}` }).catch((e) =>
        console.error('[translations] staff notification failed', e),
      );
    }),
  );
};
