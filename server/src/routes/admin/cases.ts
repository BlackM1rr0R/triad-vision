import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { decodeOriginalName, documentUpload } from '../../middleware/upload.js';
import {
  staffCancel,
  staffConfirmContract,
  staffDecide,
  staffMarkLodged,
  staffRejectSignature,
  staffReopen,
  staffRequestChanges,
  staffScheduleAppointment,
  staffSendContract,
} from '../../lib/caseFlow.js';
import { loadCaseDetail } from '../../lib/caseView.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { notifyClient } from '../../lib/notifications.js';

export const adminCasesRouter = Router();

const l10n = z.object({ az: z.string(), de: z.string(), en: z.string(), ru: z.string() });
const STATUSES = [
  'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED',
] as const;

adminCasesRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      search: z.string().trim().optional(),
      mine: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
      page: z.coerce.number().int().min(1).default(1),
    }),
    req.query,
  );
  const where: Prisma.CaseWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.mine ? { assignedStaffId: req.user!.id } : {}),
    ...(q.search
      ? {
          OR: [
            { number: { contains: q.search } },
            { profession: { contains: q.search } },
            { client: { email: { contains: q.search } } },
            { client: { firstName: { contains: q.search } } },
            { client: { lastName: { contains: q.search } } },
          ],
        }
      : {}),
  };
  const pageSize = 25;
  const [items, total, byStatus] = await Promise.all([
    prisma.case.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { firstName: true, lastName: true, email: true, phone: true } },
        assignedStaff: { select: { firstName: true, lastName: true } },
        visaCategory: { select: { title: true, visaLabel: true } },
      },
    }),
    prisma.case.count({ where }),
    prisma.case.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({
    items,
    total,
    pageSize,
    counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
  });
});

adminCasesRouter.get('/:id', async (req, res) => {
  res.json({ case: await loadCaseDetail(req.params.id, { forStaff: true }) });
});

adminCasesRouter.patch('/:id', async (req, res) => {
  const body = parse(
    z.object({
      profession: z.string().trim().min(2).max(120).optional(),
      visaCategoryId: z.string().nullable().optional(),
      assignedStaffId: z.string().nullable().optional(),
    }),
    req.body,
  );
  if (body.assignedStaffId) {
    const staff = await prisma.user.findUnique({ where: { id: body.assignedStaffId } });
    if (!staff || staff.role === 'CLIENT') throw badRequest('INVALID_STAFF');
  }
  if (body.visaCategoryId && !(await prisma.visaCategory.count({ where: { id: body.visaCategoryId } }))) {
    throw badRequest('INVALID_VISA_CATEGORY');
  }
  const updated = await prisma.case.update({ where: { id: req.params.id }, data: body });
  await prisma.caseEvent.create({
    data: { caseId: updated.id, type: 'CASE_UPDATED', actorId: req.user!.id, visibleToClient: false },
  });
  res.json({ case: updated });
});

// ─── Requirements (which documents the client must upload) ─────────────

adminCasesRouter.post('/:id/requirements', async (req, res) => {
  const body = parse(
    z.object({
      stage: z.enum(['INITIAL', 'EMBASSY']),
      title: l10n,
      description: l10n.optional(),
      required: z.boolean().default(true),
    }),
    req.body,
  );
  const c = await prisma.case.findUnique({ where: { id: req.params.id } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const max = await prisma.documentRequirement.aggregate({
    where: { caseId: c.id, stage: body.stage },
    _max: { sortOrder: true },
  });
  const requirement = await prisma.documentRequirement.create({
    data: { caseId: c.id, ...body, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  res.status(201).json({ requirement });
});

adminCasesRouter.patch('/:id/requirements/:reqId', async (req, res) => {
  const body = parse(
    z.object({ title: l10n.optional(), description: l10n.nullable().optional(), required: z.boolean().optional() }),
    req.body,
  );
  const r = await prisma.documentRequirement.findUnique({ where: { id: req.params.reqId } });
  if (!r || r.caseId !== req.params.id) throw notFound();
  const requirement = await prisma.documentRequirement.update({
    where: { id: r.id },
    data: { ...body, description: body.description === null ? undefined : body.description },
  });
  res.json({ requirement });
});

adminCasesRouter.delete('/:id/requirements/:reqId', async (req, res) => {
  const r = await prisma.documentRequirement.findUnique({
    where: { id: req.params.reqId },
    include: { _count: { select: { documents: true } } },
  });
  if (!r || r.caseId !== req.params.id) throw notFound();
  if (r._count.documents > 0) throw conflict('REQUIREMENT_HAS_DOCUMENTS');
  await prisma.documentRequirement.delete({ where: { id: r.id } });
  res.json({ ok: true });
});

// ─── Documents ─────────────────────────────────────────────────────────

adminCasesRouter.post('/:id/documents/:docId/review', async (req, res) => {
  const body = parse(
    z.object({ status: z.enum(['ACCEPTED', 'REJECTED', 'PENDING']), note: z.string().trim().max(1000).optional() }),
    req.body,
  );
  if (body.status === 'REJECTED' && !body.note) throw badRequest('NOTE_REQUIRED');
  const doc = await prisma.document.findUnique({ where: { id: req.params.docId }, include: { requirement: true } });
  if (!doc || doc.caseId !== req.params.id) throw notFound('DOCUMENT_NOT_FOUND');

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { status: body.status, reviewNote: body.status === 'REJECTED' ? body.note : null },
  });
  await prisma.caseEvent.create({
    data: {
      caseId: doc.caseId,
      type: `DOCUMENT_${body.status}`,
      note: body.status === 'REJECTED' ? `${doc.originalName}: ${body.note}` : doc.originalName,
      actorId: req.user!.id,
    },
  });
  if (body.status !== 'PENDING') {
    const client = await prisma.user.findFirstOrThrow({ where: { cases: { some: { id: doc.caseId } } } });
    const title = (doc.requirement?.title as Record<string, string> | null)?.[client.locale] ?? doc.originalName;
    await notifyClient(doc.caseId, body.status === 'ACCEPTED' ? 'DOCUMENT_ACCEPTED' : 'DOCUMENT_REJECTED', {
      doc: title,
      note: body.note,
    });
  }
  res.json({ document: updated });
});

/**
 * Staff upload. stage=CONTRACT also sends the contract to the client (moves the case to CONTRACT_SENT).
 * stage=INITIAL/EMBASSY uploads on behalf of the client (auto-accepted). VISA/OTHER attach files for the client.
 */
adminCasesRouter.post('/:id/documents', documentUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  try {
    const body = parse(
      z.object({
        stage: z.enum(['INITIAL', 'EMBASSY', 'CONTRACT', 'VISA', 'OTHER']),
        requirementId: z.string().optional(),
      }),
      req.body,
    );
    const c = await prisma.case.findUnique({ where: { id: String(req.params.id) } });
    if (!c) throw notFound('CASE_NOT_FOUND');
    if (body.stage === 'CONTRACT' && file.mimetype !== 'application/pdf') throw badRequest('CONTRACT_MUST_BE_PDF');
    if (body.requirementId) {
      const r = await prisma.documentRequirement.findUnique({ where: { id: body.requirementId } });
      if (!r || r.caseId !== c.id || r.stage !== body.stage) throw badRequest('INVALID_REQUIREMENT');
    } else if (body.stage === 'INITIAL' || body.stage === 'EMBASSY') {
      throw badRequest('REQUIREMENT_REQUIRED');
    }

    const doc = await prisma.document.create({
      data: {
        caseId: c.id,
        requirementId: body.requirementId ?? null,
        stage: body.stage,
        originalName: decodeOriginalName(file.originalname).slice(0, 200),
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        status: body.stage === 'CONTRACT' ? 'PENDING' : 'ACCEPTED',
        uploadedById: req.user!.id,
      },
    });

    if (body.stage === 'CONTRACT') {
      try {
        await staffSendContract(c.id, req.user!.id, doc.id);
      } catch (err) {
        await prisma.document.delete({ where: { id: doc.id } });
        throw err;
      }
    } else {
      await prisma.caseEvent.create({
        data: {
          caseId: c.id,
          type: 'STAFF_DOCUMENT_UPLOADED',
          note: doc.originalName,
          actorId: req.user!.id,
          visibleToClient: body.stage === 'VISA' || body.stage === 'OTHER',
        },
      });
    }
    res.status(201).json({ document: doc });
  } catch (err) {
    await fs.unlink(path.join(config.uploads.privateDir, file.filename)).catch(() => undefined);
    throw err;
  }
});

// ─── Workflow actions ──────────────────────────────────────────────────

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('REQUEST_CHANGES'), note: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal('REJECT_SIGNATURE'), note: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal('CONFIRM_CONTRACT') }),
  z.object({
    action: z.literal('SCHEDULE_APPOINTMENT'),
    at: z.coerce.date(),
    place: z.string().trim().min(3).max(300),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({ action: z.literal('MARK_LODGED') }),
  z.object({
    action: z.literal('DECIDE'),
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().max(2000).optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
  }),
  z.object({ action: z.literal('CANCEL'), reason: z.string().trim().min(3).max(2000) }),
  z.object({
    action: z.literal('REOPEN'),
    to: z.enum(['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS']),
    note: z.string().trim().max(2000).optional(),
  }),
]);

adminCasesRouter.post('/:id/actions', async (req, res) => {
  const a = parse(actionSchema, req.body);
  const id = req.params.id;
  const actor = req.user!.id;
  switch (a.action) {
    case 'REQUEST_CHANGES':
      await staffRequestChanges(id, actor, a.note);
      break;
    case 'REJECT_SIGNATURE':
      await staffRejectSignature(id, actor, a.note);
      break;
    case 'CONFIRM_CONTRACT':
      await staffConfirmContract(id, actor);
      break;
    case 'SCHEDULE_APPOINTMENT':
      await staffScheduleAppointment(id, actor, { at: a.at, place: a.place, note: a.note });
      break;
    case 'MARK_LODGED':
      await staffMarkLodged(id, actor);
      break;
    case 'DECIDE':
      await staffDecide(id, actor, a);
      break;
    case 'CANCEL':
      await staffCancel(id, actor, a.reason);
      break;
    case 'REOPEN':
      await staffReopen(id, actor, a.to, a.note);
      break;
  }
  res.json({ case: await loadCaseDetail(id, { forStaff: true }) });
});

// ─── Messages & internal notes ─────────────────────────────────────────

adminCasesRouter.post('/:id/messages', async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const c = await prisma.case.findUnique({ where: { id: req.params.id } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const message = await prisma.caseMessage.create({ data: { caseId: c.id, authorId: req.user!.id, body } });
  await notifyClient(c.id, 'NEW_MESSAGE');
  res.status(201).json({ message });
});

adminCasesRouter.post('/:id/notes', async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().min(1).max(4000) }), req.body);
  if (!(await prisma.case.count({ where: { id: req.params.id } }))) throw notFound('CASE_NOT_FOUND');
  const event = await prisma.caseEvent.create({
    data: { caseId: req.params.id, type: 'INTERNAL_NOTE', note, actorId: req.user!.id, visibleToClient: false },
  });
  res.status(201).json({ event });
});

