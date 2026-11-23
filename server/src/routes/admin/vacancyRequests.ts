import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { can } from '../../lib/access/index.js';
import { PAGE_SIZE, REQUEST_STATUSES, adminListQuery, adminRows, adminWhere, offerVacancy } from '../../lib/vacancyRequests/service.js';

/**
 * Admin: "Vakansiya sorğusu" — mounted at /api/admin/vacancies/requests (lib/vacancyRequests/service.ts). Access Center:
 * the vacancies router's area (employers); contacts are plain only with the "clients" view permission, masked otherwise.
 *   GET   /              list (?type &sector &status &assigned &q &from &to &page) + counts per status
 *   PATCH /:id           { status?, staffNote?, assignedStaffId? }
 *   POST  /:id/offer     { vacancyId } offer an open vacancy (cabinet notification + e-mail with the apply link; no case)
 */
export const adminVacancyRequestsRouter = Router();

const include = { notices: { orderBy: { sentAt: 'desc' as const } } };

adminVacancyRequestsRouter.get('/', async (req, res) => {
  const q = parse(adminListQuery, req.query);
  const where = adminWhere(q);
  const [rows, total, grouped] = await Promise.all([
    prisma.vacancyRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE, include }),
    prisma.vacancyRequest.count({ where }),
    prisma.vacancyRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const plainContacts = await can(req.user, 'clients', 'view');
  const counts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]));
  res.json({ items: await adminRows(rows, plainContacts), total, page: q.page, pageSize: PAGE_SIZE, counts });
});

adminVacancyRequestsRouter.patch('/:id', async (req, res) => {
  const body = parse(
    z.object({ status: z.enum(REQUEST_STATUSES).optional(), staffNote: z.string().trim().max(4000).nullable().optional(), assignedStaffId: z.string().max(40).nullable().optional() }),
    req.body,
  );
  const r = await prisma.vacancyRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound('REQUEST_NOT_FOUND');
  if (body.assignedStaffId) {
    const staff = await prisma.user.findFirst({ where: { id: body.assignedStaffId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true } });
    if (!staff) throw badRequest('INVALID_STAFF');
  }
  const closing = body.status === 'CLOSED' && r.status !== 'CLOSED';
  const reopening = !!body.status && body.status !== 'CLOSED' && r.status === 'CLOSED';
  if (reopening && r.cancelledAt) throw conflict('REQUEST_CANCELLED'); // the requester withdrew it (consent withdrawn)
  const updated = await prisma.vacancyRequest.update({
    where: { id: r.id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(closing ? { closedAt: new Date() } : reopening ? { closedAt: null } : {}),
      ...(body.staffNote !== undefined ? { staffNote: body.staffNote || null } : {}),
      ...(body.assignedStaffId !== undefined ? { assignedStaffId: body.assignedStaffId } : {}),
    },
    include,
  });
  await audit(req, 'VACANCY_REQUEST_UPDATED', `vacancy-request:${r.id}`, { status: body.status ?? null, assigned: body.assignedStaffId ?? null, noteChanged: body.staffNote !== undefined });
  const [row] = await adminRows([updated], await can(req.user, 'clients', 'view'));
  res.json({ item: row });
});

adminVacancyRequestsRouter.post('/:id/offer', async (req, res) => {
  const { vacancyId } = parse(z.object({ vacancyId: z.string().min(1).max(40) }), req.body);
  const r = await offerVacancy(String(req.params.id), vacancyId, req.user!.id);
  if (!r.ok) throw r.code === 'VACANCY_NOT_FOUND' ? notFound(r.code) : conflict(r.code);
  await audit(req, 'VACANCY_REQUEST_OFFERED', `vacancy-request:${r.request.id}`, { vacancyId, delivered: r.delivered });
  const full = await prisma.vacancyRequest.findUniqueOrThrow({ where: { id: r.request.id }, include });
  const [row] = await adminRows([full], await can(req.user, 'clients', 'view'));
  res.json({ item: row, delivered: r.delivered });
});
