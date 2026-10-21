import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { hasMinRole, requireAuth, requireMinRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { HttpError, notFound, parse } from '../lib/http.js';
import { ORIGINAL_ACTIONS, ORIGINAL_KINDS, ORIGINAL_STATUSES, trackingUrl } from '../lib/originals/constants.js';
import { readAct } from '../lib/originals/acts.js';
import { LABEL_LAYOUTS, buildLabelPdf } from '../lib/originals/labelPdf.js';
import { actLabel, applyAction, listForCase, loadOriginal, originalDto, overdueOriginals, overview, receiveOriginals, signAct, type ActOptions } from '../lib/originals/service.js';
import { storageReport } from '../lib/originals/storageReport.js';
import { driveRetentionSchema, getDriveRetentionSettings, getLegalHolds, previewDriveRetention, setDriveRetentionSettings, setLegalHold } from '../lib/retention/drive.js';
import type { OriginalStatus } from '@prisma/client';

/**
 * Physical originals (passport, diploma …): register per case, movements with hand-over acts, QR labels
 * for the paper folders, the overview with overdue items; plus the drive retention settings / preview and
 * the drive storage report (ADMIN+). Clients only see their own originals and acts under /my.
 */
export const originalsRouter = Router();

const param = (req: Request, key: string) => String((req.params as Record<string, unknown>)[key] ?? '');

const pdfHeaders = (res: import('express').Response, filename: string, download: boolean) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
};

// ─── Client portal (own cases only) ────────────────────────────────────────

const ownCase = async (req: Request, caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!c || c.clientId !== req.user!.id) throw notFound('CASE_NOT_FOUND');
  return c;
};

originalsRouter.get('/my/cases/:caseId', requireAuth, async (req, res) => {
  await ownCase(req, param(req, 'caseId'));
  const rows = await prisma.originalDocument.findMany({
    where: { caseId: param(req, 'caseId') },
    include: { events: { orderBy: { at: 'desc' } } },
    orderBy: { receivedAt: 'asc' },
  });
  const acts = new Map<string, { eventId: string; action: string; at: Date; titles: string[] }>();
  for (const o of rows) {
    for (const e of o.events) {
      if (!e.actNodeId) continue;
      const cur = acts.get(e.actNodeId);
      if (cur) cur.titles.push(o.title);
      else acts.set(e.actNodeId, { eventId: e.id, action: e.action, at: e.at, titles: [o.title] });
    }
  }
  // Only acts whose file still exists.
  const liveActs = await prisma.driveNode.findMany({ where: { id: { in: [...acts.keys()] }, deletedAt: null }, select: { id: true } });
  const live = new Set(liveActs.map((n) => n.id));
  res.json({
    originals: rows.map((o) => ({
      id: o.id,
      title: o.title,
      kind: o.kind,
      status: o.status,
      receivedAt: o.receivedAt,
      updatedAt: o.updatedAt,
      carrier: o.status === 'IN_TRANSIT' ? o.carrier : null,
      trackingNo: o.status === 'IN_TRANSIT' ? o.trackingNo : null,
      trackingUrl: o.status === 'IN_TRANSIT' ? trackingUrl(o.carrier, o.trackingNo) : null,
    })),
    acts: [...acts.entries()]
      .filter(([nodeId]) => live.has(nodeId))
      .map(([, a]) => a)
      .sort((a, b) => b.at.getTime() - a.at.getTime()),
  });
});

originalsRouter.get('/my/acts/:eventId', requireAuth, async (req, res) => {
  const ev = await prisma.originalEvent.findUnique({ where: { id: param(req, 'eventId') }, include: { original: { select: { caseId: true } } } });
  if (!ev?.actNodeId) throw notFound('ACT_NOT_FOUND');
  await ownCase(req, ev.original.caseId);
  const node = await prisma.driveNode.findUnique({ where: { id: ev.actNodeId }, select: { deletedAt: true } });
  if (!node || node.deletedAt) throw notFound('ACT_NOT_FOUND');
  const { row, buf } = await readAct(ev.actNodeId);
  pdfHeaders(res, row.name, req.query.download === '1');
  res.send(buf);
});

// ─── QR resolver: staff only; anybody else gets 404 (the QR code reveals nothing) ──────

originalsRouter.get('/qr/:caseId', requireAuth, async (req, res) => {
  if (!hasMinRole(req.user!.role, 'STAFF')) throw notFound('NOT_FOUND');
  if (!req.user!.twoFactorEnabled) throw new HttpError(403, 'TWO_FACTOR_ENROLLMENT_REQUIRED');
  const c = await prisma.case.findUnique({ where: { id: param(req, 'caseId') }, select: { id: true, number: true, driveFolderId: true } });
  if (!c) throw notFound('NOT_FOUND');
  const folder = c.driveFolderId ? await prisma.driveNode.findFirst({ where: { id: c.driveFolderId, deletedAt: null }, select: { id: true } }) : null;
  res.json({ caseId: c.id, number: c.number, driveFolderId: folder?.id ?? null });
});

// ─── Staff ────────────────────────────────────────────────────────────────

originalsRouter.use(requireMinRole('STAFF'));

const pngDataUrl = z
  .string()
  .max(1_500_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'INVALID_SIGNATURE');
const decodePng = (v: string | null | undefined) => (v ? Buffer.from(v.slice(v.indexOf(',') + 1), 'base64') : null);

const actFields = {
  act: z.boolean().optional(),
  condition: z.string().trim().max(2000).nullish(),
  signatures: z.object({ client: pngDataUrl.nullish(), staff: pngDataUrl.nullish() }).optional(),
  email: z.boolean().optional(),
};
type ActBody = { act?: boolean; condition?: string | null; signatures?: { client?: string | null; staff?: string | null }; email?: boolean };
const actOptions = (b: ActBody, actorId: string): ActOptions & { actorId: string } => ({
  generate: b.act,
  condition: b.condition ?? null,
  signatures: b.signatures ? { client: decodePng(b.signatures.client), staff: decodePng(b.signatures.staff) } : undefined,
  email: b.email,
  actorId,
});

const optText = (max: number) => z.string().trim().max(max).nullish();
const kindSchema = z.enum(ORIGINAL_KINDS);
const itemSchema = z.object({ title: z.string().trim().min(1).max(160), kind: kindSchema, note: optText(2000) });

const eventSchema = z.object({
  action: z.enum(ORIGINAL_ACTIONS),
  location: optText(120),
  holder: optText(160),
  carrier: optText(60),
  trackingNo: optText(80),
  note: optText(2000),
  at: z.coerce.date().optional(),
  ...actFields,
});

const caseExists = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
};

// Overview across all cases
originalsRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(ORIGINAL_STATUSES as [OriginalStatus, ...OriginalStatus[]]).optional(),
      location: z.string().trim().max(120).optional(),
      staff: z.string().trim().max(40).optional(),
      q: z.string().trim().max(120).optional(),
      overdue: z.enum(['1', 'true']).optional(),
      caseId: z.string().max(40).optional(),
    }),
    req.query,
  );
  res.json(await overview({ status: q.status, location: q.location || undefined, staff: q.staff || undefined, q: q.q || undefined, overdue: !!q.overdue, caseId: q.caseId }));
});

originalsRouter.get('/overdue', async (_req, res) => {
  const rows = await overdueOriginals();
  res.json({ items: rows.map((r) => originalDto(r)) });
});

// ─── Admin: drive retention + storage report ─────────────────────────────

const adminOnly = requireMinRole('ADMIN');

originalsRouter.get('/retention/preview', adminOnly, async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
  res.json(await previewDriveRetention(new Date(), days));
});

originalsRouter.get('/retention/settings', adminOnly, async (_req, res) => {
  res.json({ settings: await getDriveRetentionSettings() });
});

originalsRouter.put('/retention/settings', adminOnly, async (req, res) => {
  const body = parse(driveRetentionSchema, req.body);
  const settings = await setDriveRetentionSettings(body);
  await audit(req, 'DRIVE_RETENTION_SETTINGS', undefined, settings);
  res.json({ settings });
});

originalsRouter.get('/retention/legal-hold', adminOnly, async (_req, res) => {
  res.json({ folderIds: await getLegalHolds() });
});

originalsRouter.put('/retention/legal-hold', adminOnly, async (req, res) => {
  const body = parse(z.object({ folderId: z.string().min(1).max(40), hold: z.boolean() }), req.body);
  const node = await prisma.driveNode.findUnique({ where: { id: body.folderId }, select: { id: true, kind: true } });
  if (!node || node.kind !== 'FOLDER') throw notFound('FOLDER_NOT_FOUND');
  const folderIds = await setLegalHold(body.folderId, body.hold);
  await audit(req, body.hold ? 'DRIVE_LEGAL_HOLD_SET' : 'DRIVE_LEGAL_HOLD_REMOVED', `drive:${body.folderId}`);
  res.json({ folderIds, hold: body.hold });
});

originalsRouter.get('/storage-report', adminOnly, async (_req, res) => {
  res.json(await storageReport());
});

// ─── Acts ────────────────────────────────────────────────────────────────

originalsRouter.post('/events/bulk', async (req, res) => {
  const body = parse(eventSchema.extend({ ids: z.array(z.string().min(1).max(40)).min(1).max(100) }), req.body);
  const r = await applyAction(body.ids, body.action, body, actOptions(body, req.user!.id));
  await audit(req, 'ORIGINAL_EVENT', undefined, { action: body.action, ids: r.ids, act: r.act?.nodeId ?? null });
  res.json(r);
});

originalsRouter.get('/events/:eventId/act', async (req, res) => {
  const ev = await prisma.originalEvent.findUnique({ where: { id: param(req, 'eventId') }, select: { actNodeId: true } });
  if (!ev?.actNodeId) throw notFound('ACT_NOT_FOUND');
  const { row, buf } = await readAct(ev.actNodeId);
  pdfHeaders(res, row.name, req.query.download === '1');
  res.send(buf);
});

originalsRouter.post('/events/:eventId/sign', async (req, res) => {
  const body = parse(z.object({ client: pngDataUrl.nullish(), staff: pngDataUrl.nullish(), email: z.boolean().optional() }), req.body);
  const r = await signAct(param(req, 'eventId'), { client: decodePng(body.client), staff: decodePng(body.staff) }, req.user!.id, body.email);
  await audit(req, 'ORIGINAL_ACT_SIGNED', `drive:${r.nodeId}`, { eventId: param(req, 'eventId') });
  res.json(r);
});

// ─── Per case ────────────────────────────────────────────────────────────

originalsRouter.get('/cases/:caseId', async (req, res) => {
  await caseExists(param(req, 'caseId'));
  res.json({ items: await listForCase(param(req, 'caseId')) });
});

/** One original (RECEIVED; an act only when `act: true`). */
originalsRouter.post('/cases/:caseId', async (req, res) => {
  const body = parse(itemSchema.extend({ location: optText(120), receivedAt: z.coerce.date().optional(), ...actFields }), req.body);
  const r = await receiveOriginals(param(req, 'caseId'), [body], {
    ...actOptions({ ...body, act: body.act ?? false }, req.user!.id),
    location: body.location,
    receivedAt: body.receivedAt,
  });
  await audit(req, 'ORIGINAL_CREATED', `case:${param(req, 'caseId')}`, { ids: r.ids });
  res.status(201).json({ original: originalDto(await loadOriginal(r.ids[0])), act: r.act });
});

/** Bulk receive: several originals into one act. */
originalsRouter.post('/cases/:caseId/receive', async (req, res) => {
  const body = parse(z.object({ items: z.array(itemSchema).min(1).max(50), location: optText(120), receivedAt: z.coerce.date().optional(), ...actFields }), req.body);
  const r = await receiveOriginals(param(req, 'caseId'), body.items, { ...actOptions(body, req.user!.id), location: body.location, receivedAt: body.receivedAt });
  await audit(req, 'ORIGINAL_CREATED', `case:${param(req, 'caseId')}`, { ids: r.ids, act: r.act?.nodeId ?? null });
  res.status(201).json({ ids: r.ids, act: r.act, items: await listForCase(param(req, 'caseId')) });
});

originalsRouter.get('/cases/:caseId/label.pdf', async (req, res) => {
  const { layout } = parse(z.object({ layout: z.enum(LABEL_LAYOUTS).default('a4-1') }), req.query);
  const c = await prisma.case.findUnique({
    where: { id: param(req, 'caseId') },
    select: { id: true, number: true, visaType: true, visaCategory: { select: { visaLabel: true } }, client: { select: { firstName: true, lastName: true } } },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const pdf = await buildLabelPdf(
    { url: `${config.clientUrl}/q/${c.id}`, clientName: `${c.client.firstName} ${c.client.lastName}`.trim(), caseNumber: c.number, visaType: c.visaType, category: c.visaCategory?.visaLabel ?? null },
    layout,
  );
  pdfHeaders(res, `Etikett ${c.number}.pdf`, req.query.download === '1');
  res.send(pdf);
});

// ─── One original ────────────────────────────────────────────────────────

originalsRouter.get('/:id', async (req, res) => {
  res.json({ original: originalDto(await loadOriginal(param(req, 'id'))) });
});

originalsRouter.patch('/:id', async (req, res) => {
  const body = parse(z.object({ title: z.string().trim().min(1).max(160).optional(), kind: kindSchema.optional(), note: optText(2000), location: optText(120) }), req.body);
  await loadOriginal(param(req, 'id'));
  await prisma.originalDocument.update({
    where: { id: param(req, 'id') },
    data: { title: body.title, kind: body.kind, note: body.note === undefined ? undefined : body.note || null, location: body.location === undefined ? undefined : body.location || null },
  });
  await audit(req, 'ORIGINAL_UPDATED', `original:${param(req, 'id')}`, body);
  res.json({ original: originalDto(await loadOriginal(param(req, 'id'))) });
});

originalsRouter.delete('/:id', adminOnly, async (req, res) => {
  const o = await loadOriginal(param(req, 'id'));
  await prisma.originalDocument.delete({ where: { id: o.id } });
  await audit(req, 'ORIGINAL_DELETED', `original:${o.id}`, { caseId: o.caseId, title: o.title });
  res.status(204).end();
});

originalsRouter.post('/:id/events', async (req, res) => {
  const body = parse(eventSchema, req.body);
  const r = await applyAction([param(req, 'id')], body.action, body, actOptions(body, req.user!.id));
  await audit(req, 'ORIGINAL_EVENT', `original:${param(req, 'id')}`, { action: body.action, label: actLabel(body.action).de, act: r.act?.nodeId ?? null });
  res.json({ original: originalDto(await loadOriginal(param(req, 'id'))), act: r.act });
});
