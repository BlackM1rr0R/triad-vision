import { Router } from 'express';
import type { ArrivalStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { STAFF_ROLES, STAFF_TRANSITIONS, loadPlan, notifyPlanClient, notifyPlanStaff, planInclude, staffView } from '../../lib/arrival/core.js';
import { progressByCase, staffChecklist } from '../../lib/employerArrival.js';

/** Staff side of arrival planning (/api/admin/arrivals; the admin router requires STAFF). */
export const adminArrivalsRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const STATUSES = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
const HOUSING = ['NONE', 'REQUESTED', 'SEARCHING', 'OFFERED', 'ARRANGED'] as const;

const flag = z.enum(['1', 'true', '0', 'false']).optional().transform((v) => v === '1' || v === 'true');

const listQuery = z.object({
  status: z.string().max(100).optional(), // one status, a comma list, "open" (default) or "all"
  upcoming: flag, // arrival within the next 14 days
  pickup: flag, // pickup requested
  housing: flag, // accommodation requested
  mine: flag,
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

/** GET /api/admin/arrivals → filtered list (soonest arrivals first) plus counters. */
adminArrivalsRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const now = new Date();
  const and: Prisma.ArrivalPlanWhereInput[] = [];
  const status = q.status ?? 'open';
  if (status === 'open') and.push({ status: { in: ['SUBMITTED', 'CONFIRMED'] } });
  else if (status !== 'all') {
    const list = status.split(',').filter((s): s is ArrivalStatus => (STATUSES as readonly string[]).includes(s));
    if (!list.length) throw badRequest('INVALID_STATUS');
    and.push({ status: { in: list } });
  }
  if (q.upcoming) and.push({ arrivalTime: { gt: now, lte: new Date(now.getTime() + 14 * DAY) } });
  if (q.pickup) and.push({ pickupRequested: true });
  if (q.housing) and.push({ housingStatus: { not: 'NONE' } });
  if (q.mine) and.push({ OR: [{ handledById: req.user!.id }, { handledById: null, case: { assignedStaffId: req.user!.id } }] });
  if (q.search) {
    const s = q.search;
    and.push({
      OR: [
        { client: { firstName: { contains: s } } },
        { client: { lastName: { contains: s } } },
        { client: { email: { contains: s } } },
        { case: { number: { contains: s } } },
        { flightNumber: { contains: s.toUpperCase() } },
      ],
    });
  }
  const where: Prisma.ArrivalPlanWhereInput = { AND: and };
  const in14 = new Date(now.getTime() + 14 * DAY);
  const [items, total, submitted, confirmed, upcoming, pickupOpen, housingOpen] = await Promise.all([
    prisma.arrivalPlan.findMany({
      where,
      include: planInclude,
      // Soonest arrival first; plans without a date at the end.
      orderBy: [{ arrivalTime: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.arrivalPlan.count({ where }),
    prisma.arrivalPlan.count({ where: { status: 'SUBMITTED' } }),
    prisma.arrivalPlan.count({ where: { status: 'CONFIRMED' } }),
    prisma.arrivalPlan.count({ where: { status: { in: ['SUBMITTED', 'CONFIRMED'] }, arrivalTime: { gt: now, lte: in14 } } }),
    prisma.arrivalPlan.count({ where: { status: { in: ['SUBMITTED', 'CONFIRMED'] }, pickupRequested: true, pickupConfirmed: false } }),
    prisma.arrivalPlan.count({ where: { status: { in: ['SUBMITTED', 'CONFIRMED'] }, housingStatus: { in: ['REQUESTED', 'SEARCHING'] } } }),
  ]);
  const checklists = await progressByCase(items.map((p) => p.caseId)); // employer arrival checklist progress
  res.json({
    items: items.map((p) => ({ ...staffView(p, now), employerChecklist: checklists.get(p.caseId) ?? null })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    counts: { submitted, confirmed, upcoming, pickupOpen, housingOpen },
  });
});

/** GET /api/admin/arrivals/staff → people a plan can be handed to. */
adminArrivalsRouter.get('/staff', async (_req, res) => {
  const people = await prisma.user.findMany({
    where: { isActive: true, role: { in: [...STAFF_ROLES] } },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  res.json({ people });
});

adminArrivalsRouter.get('/:caseId', async (req, res) => {
  const plan = await loadPlan(String(req.params.caseId));
  if (!plan) throw notFound('PLAN_NOT_FOUND');
  res.json({ plan: staffView(plan), employerChecklist: await staffChecklist(plan.caseId) });
});

const text = (max: number) => z.string().trim().max(max).nullable().optional();

const patchSchema = z
  .object({
    status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
    pickupConfirmed: z.boolean().optional(),
    pickupDetails: text(2000),
    housingStatus: z.enum(HOUSING).optional(),
    housingDetails: text(4000),
    staffNote: text(4000),
    handledById: z.string().min(1).max(40).nullable().optional(),
    note: text(1000), // message for the client, sent with the notification only
  })
  .strict();

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);

/** PATCH /api/admin/arrivals/:caseId → status, pickup, housing, internal note, handler. */
adminArrivalsRouter.patch('/:caseId', async (req, res) => {
  const body = parse(patchSchema, req.body);
  const plan = await loadPlan(String(req.params.caseId));
  if (!plan) throw notFound('PLAN_NOT_FOUND');

  const data: Prisma.ArrivalPlanUncheckedUpdateInput = {};
  if (body.status && body.status !== plan.status) {
    if (!STAFF_TRANSITIONS[body.status].includes(plan.status)) throw conflict('INVALID_TRANSITION');
    data.status = body.status;
    if (!plan.submittedAt) data.submittedAt = new Date();
  }
  if (body.pickupConfirmed !== undefined) {
    if (body.pickupConfirmed && !plan.pickupRequested) throw badRequest('PICKUP_NOT_REQUESTED');
    data.pickupConfirmed = body.pickupConfirmed;
  }
  if (body.pickupDetails !== undefined) data.pickupDetails = blankToNull(body.pickupDetails);
  if (body.housingStatus !== undefined) data.housingStatus = body.housingStatus;
  if (body.housingDetails !== undefined) data.housingDetails = blankToNull(body.housingDetails);
  if (body.staffNote !== undefined) data.staffNote = blankToNull(body.staffNote);
  if (body.handledById !== undefined) {
    if (body.handledById) {
      const staff = await prisma.user.findFirst({ where: { id: body.handledById, isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true } });
      if (!staff) throw badRequest('INVALID_HANDLER');
    }
    data.handledById = body.handledById;
  }

  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => k !== 'submittedAt' && (plan as unknown as Record<string, unknown>)[k] !== (data as Record<string, unknown>)[k]);
  if (!changed.length && !body.note) {
    res.json({ plan: staffView(plan) });
    return;
  }
  if (changed.length) await prisma.arrivalPlan.update({ where: { id: plan.id }, data });
  const fresh = (await loadPlan(plan.caseId))!;
  await audit(req, 'ARRIVAL_PLAN_UPDATED', plan.id, { caseId: plan.caseId, fields: changed as string[], status: fresh.status });

  // What the client can see changed?
  const pickupVisible = (p: typeof plan) => (p.pickupConfirmed ? `1:${p.pickupDetails ?? ''}` : '0');
  const housingVisible = (p: typeof plan) => `${p.housingStatus}:${p.housingStatus === 'OFFERED' || p.housingStatus === 'ARRANGED' ? (p.housingDetails ?? '') : ''}`;
  const statusChanged = fresh.status !== plan.status;
  const visibleChange = pickupVisible(fresh) !== pickupVisible(plan) || housingVisible(fresh) !== housingVisible(plan);
  const note = blankToNull(body.note) ?? null;
  if (statusChanged && (fresh.status === 'CONFIRMED' || fresh.status === 'COMPLETED' || fresh.status === 'CANCELLED')) {
    await notifyPlanClient(fresh, fresh.status, note);
  } else if (visibleChange || note) {
    await notifyPlanClient(fresh, 'UPDATED', note);
  }
  if (fresh.handledById && fresh.handledById !== plan.handledById && fresh.handledById !== req.user!.id) {
    await notifyPlanStaff(fresh, 'ASSIGNED', [fresh.handledById]);
  }
  res.json({ plan: staffView(fresh) });
});
