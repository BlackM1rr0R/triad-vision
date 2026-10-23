import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { decodeOriginalName, documentUpload, verifyUploadedFile } from '../../middleware/upload.js';
import { HttpError, badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { isValidTimeZone } from '../../lib/ics.js';
import { ballInCourtFor } from '../../lib/clientProcess/ballInCourt.js';
import { completeTask, DUE_SOON_DAYS, loadTask, notifyTaskCreated, parseDue, staffView, taskInclude } from '../../lib/clientProcess/tasks.js';
import { getClientProcessSettings, saveClientProcessSettings, settingsSchema, DEFAULT_ETA } from '../../lib/clientProcess/settings.js';
import { cancelOfficeVisit, listOffices, loadVisit, officeLocation, visitInclude, visitView } from '../../lib/clientProcess/office.js';
import { TASK_TEMPLATES, asReason } from '../../lib/clientProcess/texts.js';
import { expandTemplate, templateSchema } from './booking.js';
import { invalidateMyWork } from '../../lib/myWork.js';

/**
 * Staff side of the client-process features — mounted at /api/admin/client-process (STAFF+):
 * client tasks per case and across cases, office-visit slots and the day's visits, ETA settings (ADMIN+).
 */
export const adminClientProcessRouter = Router();

const DAY = 24 * 3600 * 1000;
const MIN = 60 * 1000;
const isAdmin = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');
const viewerLocale = async (req: Request) => (await prisma.user.findUnique({ where: { id: req.user!.id }, select: { locale: true } }))?.locale ?? 'az';

const removeFile = (storedName: string) => fs.unlink(path.join(config.uploads.privateDir, storedName)).catch(() => undefined);

// ─── Ball in court ────────────────────────────────────────────────────

adminClientProcessRouter.get('/cases/:caseId/ball', async (req, res) => {
  if (!(await prisma.case.count({ where: { id: req.params.caseId } }))) throw notFound('CASE_NOT_FOUND');
  res.json({ ball: await ballInCourtFor(req.params.caseId) });
});

// ─── Client tasks ─────────────────────────────────────────────────────

adminClientProcessRouter.get('/templates', async (_req, res) => {
  res.json({ templates: TASK_TEMPLATES });
});

adminClientProcessRouter.get('/cases/:caseId/tasks', async (req, res) => {
  const c = await prisma.case.findUnique({ where: { id: req.params.caseId }, select: { id: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const tasks = await prisma.clientTask.findMany({ where: { caseId: c.id }, include: taskInclude, orderBy: [{ createdAt: 'desc' }], take: 200 });
  const locale = await viewerLocale(req);
  const now = new Date();
  res.json({ tasks: tasks.map((t) => staffView(t, locale, now)) });
});

const dueSchema = z.string().trim().max(40).nullable().optional();
const urlSchema = z.string().trim().max(1000).url().refine((u) => /^https?:\/\//i.test(u), 'INVALID_URL');

const taskBody = z.object({
  template: z.string().trim().max(40).nullable().optional(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  dueAt: dueSchema,
  requirementId: z.string().trim().max(40).nullable().optional(),
  linkUrl: urlSchema.nullable().optional().or(z.literal('').transform(() => null)),
  notify: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
});

const checkRequirement = async (caseId: string, requirementId: string | null | undefined) => {
  if (!requirementId) return;
  const r = await prisma.documentRequirement.findUnique({ where: { id: requirementId }, select: { caseId: true } });
  if (!r || r.caseId !== caseId) throw badRequest('INVALID_REQUIREMENT');
};

/** Create a task (JSON, or multipart with an optional "file" attachment the client can download). */
adminClientProcessRouter.post('/cases/:caseId/tasks', documentUpload.single('file'), async (req, res) => {
  const file = req.file;
  try {
    const body = parse(taskBody, req.body ?? {});
    const c = await prisma.case.findUnique({ where: { id: String(req.params.caseId) }, select: { id: true, status: true } });
    if (!c) throw notFound('CASE_NOT_FOUND');
    if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(c.status)) throw badRequest('CASE_CLOSED');
    if (body.template && !TASK_TEMPLATES.some((t) => t.key === body.template)) throw badRequest('INVALID_TEMPLATE');
    await checkRequirement(c.id, body.requirementId);
    const dueAt = parseDue(body.dueAt);
    if (body.dueAt && !dueAt) throw badRequest('INVALID_DUE');
    let attachmentId: string | null = null;
    if (file) {
      await verifyUploadedFile(file);
      const doc = await prisma.document.create({
        data: { caseId: c.id, stage: 'OTHER', status: 'ACCEPTED', originalName: decodeOriginalName(file.originalname).slice(0, 200), storedName: file.filename, mimeType: file.mimetype, size: file.size, uploadedById: req.user!.id },
      });
      attachmentId = doc.id;
    }
    const created = await prisma.clientTask.create({
      data: {
        caseId: c.id,
        template: body.template ?? null,
        title: body.title,
        description: body.description || null,
        dueAt,
        requirementId: body.requirementId ?? null,
        linkUrl: body.linkUrl ?? null,
        attachmentId,
        createdById: req.user!.id,
      },
      include: taskInclude,
    });
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'CLIENT_TASK_CREATED', note: created.title, actorId: req.user!.id, visibleToClient: true } });
    await audit(req, 'CLIENT_TASK_CREATE', created.id, { caseId: c.id, template: created.template, dueAt: created.dueAt?.toISOString() ?? null });
    if (body.notify !== false && body.notify !== 'false') await notifyTaskCreated(created).catch((e) => console.error('[client-tasks] notify failed', e));
    invalidateMyWork();
    res.status(201).json({ task: staffView(created, await viewerLocale(req)) });
  } catch (err) {
    if (file) await removeFile(file.filename);
    throw err;
  }
});

adminClientProcessRouter.patch('/tasks/:id', async (req, res) => {
  const body = parse(
    taskBody.partial().omit({ notify: true }).extend({ status: z.enum(['OPEN', 'DONE', 'CANCELLED']).optional() }),
    req.body,
  );
  const t = await loadTask(req.params.id);
  if (!t) throw notFound('TASK_NOT_FOUND');
  if (body.requirementId !== undefined) await checkRequirement(t.caseId, body.requirementId);
  const dueAt = body.dueAt === undefined ? undefined : parseDue(body.dueAt);
  if (body.dueAt && !dueAt) throw badRequest('INVALID_DUE');
  const data: Prisma.ClientTaskUncheckedUpdateInput = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description || null } : {}),
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(body.requirementId !== undefined ? { requirementId: body.requirementId } : {}),
    ...(body.linkUrl !== undefined ? { linkUrl: body.linkUrl } : {}),
    ...(body.template !== undefined ? { template: body.template } : {}),
  };
  if (body.status && body.status !== t.status) {
    if (body.status === 'DONE') {
      await completeTask(t.id, { userId: req.user!.id, via: 'STAFF' });
    } else {
      Object.assign(data, { status: body.status, ...(body.status === 'OPEN' ? { completedAt: null, completedById: null, completedVia: null } : {}) });
    }
  }
  if (Object.keys(data).length) await prisma.clientTask.update({ where: { id: t.id }, data });
  await audit(req, 'CLIENT_TASK_UPDATE', t.id, { caseId: t.caseId, fields: Object.keys(body) });
  invalidateMyWork();
  res.json({ task: staffView((await loadTask(t.id))!, await viewerLocale(req)) });
});

adminClientProcessRouter.delete('/tasks/:id', async (req, res) => {
  const t = await prisma.clientTask.findUnique({ where: { id: req.params.id }, select: { id: true, caseId: true, title: true } });
  if (!t) throw notFound('TASK_NOT_FOUND');
  await prisma.clientTask.delete({ where: { id: t.id } });
  await audit(req, 'CLIENT_TASK_DELETE', t.id, { caseId: t.caseId, title: t.title });
  invalidateMyWork();
  res.json({ ok: true });
});

/** Re-sends the "new task" notice (e.g. after editing). */
adminClientProcessRouter.post('/tasks/:id/remind', async (req, res) => {
  const t = await loadTask(req.params.id);
  if (!t || t.status !== 'OPEN') throw notFound('TASK_NOT_FOUND');
  await notifyTaskCreated(t);
  await audit(req, 'CLIENT_TASK_REMIND', t.id, { caseId: t.caseId });
  res.json({ ok: true });
});

/** Cross-case list: overdue | due_soon (≤ 2 days) | open | done; mine = cases assigned to me. */
adminClientProcessRouter.get('/tasks', async (req, res) => {
  const q = parse(
    z.object({
      filter: z.enum(['overdue', 'due_soon', 'open', 'done', 'all']).default('open'),
      mine: z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1').optional(),
      search: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).default(1),
    }),
    req.query,
  );
  const now = new Date();
  const statusWhere: Prisma.ClientTaskWhereInput =
    q.filter === 'overdue'
      ? { status: 'OPEN', dueAt: { lt: now } }
      : q.filter === 'due_soon'
        ? { status: 'OPEN', dueAt: { gte: now, lte: new Date(now.getTime() + DUE_SOON_DAYS * DAY) } }
        : q.filter === 'open'
          ? { status: 'OPEN' }
          : q.filter === 'done'
            ? { status: 'DONE' }
            : {};
  const where: Prisma.ClientTaskWhereInput = {
    ...statusWhere,
    ...(q.mine ? { case: { assignedStaffId: req.user!.id } } : {}),
    ...(q.search
      ? {
          OR: [
            { title: { contains: q.search } },
            { case: { number: { contains: q.search } } },
            { case: { client: { firstName: { contains: q.search } } } },
            { case: { client: { lastName: { contains: q.search } } } },
          ],
        }
      : {}),
  };
  const pageSize = 50;
  const baseCounts: Prisma.ClientTaskWhereInput = q.mine ? { case: { assignedStaffId: req.user!.id } } : {};
  const [rows, total, overdue, dueSoon, open] = await Promise.all([
    prisma.clientTask.findMany({
      where,
      include: taskInclude,
      orderBy: q.filter === 'done' ? [{ completedAt: 'desc' }] : [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      skip: (q.page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.clientTask.count({ where }),
    prisma.clientTask.count({ where: { ...baseCounts, status: 'OPEN', dueAt: { lt: now } } }),
    prisma.clientTask.count({ where: { ...baseCounts, status: 'OPEN', dueAt: { gte: now, lte: new Date(now.getTime() + DUE_SOON_DAYS * DAY) } } }),
    prisma.clientTask.count({ where: { ...baseCounts, status: 'OPEN' } }),
  ]);
  const locale = await viewerLocale(req);
  res.json({ tasks: rows.map((t) => staffView(t, locale, now)), total, pageSize, counts: { overdue, dueSoon, open } });
});

// ─── ETA settings ─────────────────────────────────────────────────────

adminClientProcessRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getClientProcessSettings(), defaults: DEFAULT_ETA });
});

adminClientProcessRouter.put('/settings', async (req, res) => {
  if (!isAdmin(req)) throw forbidden();
  const body = parse(settingsSchema, req.body);
  const settings = await saveClientProcessSettings(body);
  await audit(req, 'CLIENT_PROCESS_SETTINGS', 'clientProcess', body as unknown as Prisma.InputJsonValue);
  res.json({ settings });
});

// ─── Office visits ────────────────────────────────────────────────────

adminClientProcessRouter.get('/offices', async (req, res) => {
  res.json({ offices: await listOffices(await viewerLocale(req)) });
});

const targetStaffId = async (req: Request, requested?: string | null) => {
  if (!requested || requested === req.user!.id) return req.user!.id;
  if (!isAdmin(req)) throw forbidden();
  const staff = await prisma.user.findUnique({ where: { id: requested }, select: { role: true } });
  if (!staff || !hasMinRole(staff.role, 'STAFF')) throw notFound('STAFF_NOT_FOUND');
  return requested;
};

const officeAt = async (index: number) => {
  const offices = await listOffices('az');
  const o = offices.find((x) => x.index === index);
  if (!o) throw badRequest('INVALID_OFFICE');
  return officeLocation(o);
};

const capacitySchema = z.coerce.number().int().min(1).max(10).default(1);
const officeMinutes = z.coerce.number().int().refine((n) => [15, 20, 30, 45, 60, 90, 120].includes(n), 'INVALID_LENGTH');

/** Slot rows (one per seat) for [startsAt, endsAt) unless the staff member already has anything overlapping. */
const seatRows = (staffId: string, startsAt: Date, endsAt: Date, capacity: number, location: string) =>
  Array.from({ length: capacity }, (_, seat) => ({ staffId, startsAt, endsAt, kind: 'OFFICE' as const, location, seat }));

adminClientProcessRouter.post('/office/slots', async (req, res) => {
  const body = parse(
    z.object({ startsAt: z.coerce.date(), minutes: officeMinutes, capacity: capacitySchema, officeIndex: z.coerce.number().int().min(0).max(20).default(0), staffId: z.string().max(64).nullable().optional() }),
    req.body,
  );
  const staffId = await targetStaffId(req, body.staffId);
  if (body.startsAt.getTime() <= Date.now()) throw badRequest('SLOT_IN_PAST');
  if (body.startsAt.getTime() > Date.now() + 366 * DAY) throw badRequest('SLOT_TOO_FAR');
  const endsAt = new Date(body.startsAt.getTime() + body.minutes * MIN);
  const clash = await prisma.consultationSlot.findFirst({ where: { staffId, startsAt: { lt: endsAt }, endsAt: { gt: body.startsAt } }, select: { id: true } });
  if (clash) throw new HttpError(409, 'SLOT_OVERLAP');
  const location = await officeAt(body.officeIndex);
  const r = await prisma.consultationSlot.createMany({ data: seatRows(staffId, body.startsAt, endsAt, body.capacity, location), skipDuplicates: true });
  await audit(req, 'OFFICE_SLOT_CREATE', staffId, { startsAt: body.startsAt.toISOString(), capacity: body.capacity });
  res.status(201).json({ created: r.count });
});

/** Weekly template (same shape as the consultation template) + capacity + office. */
adminClientProcessRouter.post('/office/slots/template', async (req, res) => {
  const t = parse(
    templateSchema.omit({ minutes: true }).extend({ minutes: officeMinutes, capacity: capacitySchema, officeIndex: z.coerce.number().int().min(0).max(20).default(0) }),
    req.body,
  );
  if (!isValidTimeZone(t.timeZone)) throw badRequest('INVALID_TIMEZONE');
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  for (const d of t.days) for (const r of d.ranges) if (toMin(r.to) <= toMin(r.from)) throw badRequest('INVALID_RANGE');
  const staffId = await targetStaffId(req, t.staffId);
  const location = await officeAt(t.officeIndex);
  const candidates = expandTemplate(t, new Date());
  if (candidates.length * t.capacity > 2000) throw badRequest('TOO_MANY_SLOTS');
  if (!candidates.length) {
    res.status(201).json({ created: 0, skipped: 0 });
    return;
  }
  const existing = await prisma.consultationSlot.findMany({
    where: { staffId, startsAt: { lt: candidates.at(-1)!.endsAt }, endsAt: { gt: candidates[0].startsAt } },
    select: { startsAt: true, endsAt: true },
  });
  const taken = existing.map((s) => [s.startsAt.getTime(), s.endsAt.getTime()] as const);
  const fresh: ReturnType<typeof seatRows> = [];
  let skipped = 0;
  for (const c of candidates) {
    const a = c.startsAt.getTime();
    const b = c.endsAt.getTime();
    if (taken.some(([s, e]) => s < b && e > a)) {
      skipped++;
      continue;
    }
    taken.push([a, b]);
    fresh.push(...seatRows(staffId, c.startsAt, c.endsAt, t.capacity, location));
  }
  const r = fresh.length ? await prisma.consultationSlot.createMany({ data: fresh, skipDuplicates: true }) : { count: 0 };
  await audit(req, 'OFFICE_SLOT_TEMPLATE', staffId, { slots: candidates.length - skipped, capacity: t.capacity, weeks: t.weeks });
  res.status(201).json({ created: candidates.length - skipped, seats: r.count, skipped });
});

/** Office slots in a range, grouped per staff + time (seats with their visits). */
adminClientProcessRouter.get('/office/slots', async (req, res) => {
  const q = parse(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), staffId: z.string().max(64).optional() }), req.query);
  const from = q.from ?? new Date(Date.now() - DAY);
  const to = q.to ?? new Date(from.getTime() + 35 * DAY);
  if (to.getTime() - from.getTime() > 120 * DAY) throw badRequest('RANGE_TOO_LARGE');
  const staffId = !isAdmin(req) ? req.user!.id : q.staffId && q.staffId !== 'all' ? q.staffId : undefined;
  const rows = await prisma.consultationSlot.findMany({
    where: { kind: 'OFFICE', startsAt: { gte: from, lt: to }, ...(staffId ? { staffId } : {}) },
    orderBy: [{ startsAt: 'asc' }, { seat: 'asc' }],
    include: {
      staff: { select: { id: true, firstName: true, lastName: true } },
      booking: { include: { case: { select: { id: true, number: true } } } },
    },
    take: 5000,
  });
  const groups = new Map<string, { id: string; staff: (typeof rows)[number]['staff']; startsAt: Date; endsAt: Date; location: string | null; capacity: number; seatIds: string[]; visits: unknown[] }>();
  for (const r of rows) {
    const k = `${r.staffId}|${r.startsAt.toISOString()}`;
    let g = groups.get(k);
    if (!g) {
      g = { id: r.id, staff: r.staff, startsAt: r.startsAt, endsAt: r.endsAt, location: r.location, capacity: 0, seatIds: [], visits: [] };
      groups.set(k, g);
    }
    g.capacity++;
    g.seatIds.push(r.id);
    if (r.booking && r.booking.status !== 'CANCELLED') {
      const { manageToken: _t, ...b } = r.booking;
      g.visits.push({ ...b, reason: asReason(b.topic) });
    }
  }
  res.json({ slots: [...groups.values()] });
});

/** Deletes the free seats of an office slot (seats with an active visit are kept). */
adminClientProcessRouter.delete('/office/slots/:id', async (req, res) => {
  const slot = await prisma.consultationSlot.findUnique({ where: { id: req.params.id } });
  if (!slot || slot.kind !== 'OFFICE') throw notFound('SLOT_NOT_FOUND');
  if (slot.staffId !== req.user!.id && !isAdmin(req)) throw notFound('SLOT_NOT_FOUND');
  const seats = await prisma.consultationSlot.findMany({
    where: { kind: 'OFFICE', staffId: slot.staffId, startsAt: slot.startsAt },
    include: { booking: { select: { status: true } } },
  });
  const free = seats.filter((s) => !s.booking || s.booking.status === 'CANCELLED').map((s) => s.id);
  if (!free.length) throw new HttpError(409, 'SLOT_BOOKED');
  await prisma.consultationSlot.deleteMany({ where: { id: { in: free } } });
  await audit(req, 'OFFICE_SLOT_DELETE', slot.id, { deleted: free.length });
  res.json({ deleted: free.length, kept: seats.length - free.length });
});

/** Office visits of one Baku day (default today), every staff member for admins, own slots otherwise. */
adminClientProcessRouter.get('/office/visits', async (req, res) => {
  const q = parse(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.enum(['BOOKED', 'CANCELLED', 'DONE', 'NO_SHOW']).optional(), all: z.enum(['true', 'false']).optional() }), req.query);
  const day = q.day ?? new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+04:00`);
  const end = new Date(start.getTime() + DAY);
  const mineOnly = !isAdmin(req) || q.all === 'false';
  const visits = await prisma.booking.findMany({
    where: { ...(q.status ? { status: q.status } : { status: { not: 'CANCELLED' } }), slot: { kind: 'OFFICE', startsAt: { gte: start, lt: end }, ...(mineOnly ? { staffId: req.user!.id } : {}) } },
    include: visitInclude,
    orderBy: { slot: { startsAt: 'asc' } },
    take: 500,
  });
  const now = new Date();
  res.json({
    day,
    visits: visits.map((v) => ({
      ...visitView(v, now),
      client: v.case?.client ? { id: v.case.client.id, name: `${v.case.client.firstName} ${v.case.client.lastName}`.trim(), email: v.case.client.email } : { id: null, name: v.name, email: v.email },
      phone: v.phone,
      staff: { id: v.slot.staff.id, name: `${v.slot.staff.firstName} ${v.slot.staff.lastName}`.trim() },
    })),
  });
});

adminClientProcessRouter.post('/office/visits/:id/cancel', async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().max(2000).optional() }), req.body);
  const v = await loadVisit(req.params.id);
  if (v.slot.staffId !== req.user!.id && !isAdmin(req)) throw notFound('BOOKING_NOT_FOUND');
  await cancelOfficeVisit(v, 'staff', message ?? null);
  await audit(req, 'OFFICE_VISIT_CANCEL', v.id, { caseId: v.caseId });
  invalidateMyWork();
  res.json({ ok: true });
});
