import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, parse } from '../../lib/http.js';

/**
 * Embassy / operations layer of the workspace calendar — mounted at /api/admin/ops-calendar (STAFF+ via the admin
 * router; every staff role sees every case, as in the cases list).
 *
 *   GET /?from=&to=&staffId=me|none|<id>&types=embassy,interview,arrival,consultation
 *
 * One item per embassy appointment (Case.appointmentAt), employer interview, client arrival (flight) and
 * consultation / office visit (Booking). `movable` says whether the date can be changed by drag and drop, and
 * through which existing flow (the client calls it, so notifications, case events and audit stay as they are):
 *   embassy   POST /api/admin/cases/:id/actions { action: SCHEDULE_APPOINTMENT } (only while APPOINTMENT_SCHEDULED)
 *   interview PATCH /api/interviews/:id { startsAt, endsAt } (proposed / confirmed, back to "proposed")
 * Arrivals are the client's flight data and consultations are booked slots: read-only here.
 */
export const adminOpsCalendarRouter = Router();

const TYPES = ['embassy', 'interview', 'arrival', 'consultation'] as const;
type OpsType = (typeof TYPES)[number];
const MAX_RANGE = 120 * 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const querySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  staffId: z.string().trim().min(1).max(40).optional(),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter((t): t is OpsType => (TYPES as readonly string[]).includes(t)) : [...TYPES])),
});

const name = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
const person = (u: { id: string; firstName: string; lastName: string } | null | undefined) => (u ? { id: u.id, name: name(u)! } : null);
const staffSel = { select: { id: true, firstName: true, lastName: true } } as const;

export interface OpsItem {
  key: string;
  type: OpsType;
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  status: string;
  client: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;
  caseId: string | null;
  caseNumber: string | null;
  link: string;
  movable: boolean;
  /** Embassy: the place the reschedule keeps. */
  place?: string | null;
}

adminOpsCalendarRouter.get('/', async (req, res) => {
  const q = parse(querySchema, req.query);
  if (q.to <= q.from || q.to.getTime() - q.from.getTime() > MAX_RANGE) throw badRequest('INVALID_RANGE');
  const staffId = q.staffId === 'me' ? req.user!.id : q.staffId;
  const want = new Set(q.types);
  const now = Date.now();
  const caseStaff = (field: 'assignedStaffId'): Prisma.CaseWhereInput => (staffId ? { [field]: staffId === 'none' ? null : staffId } : {});

  const [cases, interviews, arrivals, bookings] = await Promise.all([
    want.has('embassy')
      ? prisma.case.findMany({
          where: { appointmentAt: { gte: q.from, lt: q.to }, status: { not: 'CANCELLED' }, ...caseStaff('assignedStaffId') },
          select: { id: true, number: true, status: true, appointmentAt: true, appointmentPlace: true, client: staffSel, assignedStaff: staffSel },
          take: 500,
        })
      : [],
    want.has('interview')
      ? prisma.interview.findMany({
          where: { startsAt: { gte: q.from, lt: q.to }, status: { in: ['PROPOSED', 'CONFIRMED', 'DONE'] }, ...(staffId ? { staffId: staffId === 'none' ? null : staffId } : {}) },
          select: { id: true, status: true, startsAt: true, endsAt: true, meetingUrl: true, candidate: staffSel, staff: staffSel, company: { select: { name: true } } },
          take: 500,
        })
      : [],
    want.has('arrival')
      ? prisma.arrivalPlan.findMany({
          where: {
            arrivalTime: { gte: q.from, lt: q.to },
            status: { in: ['SUBMITTED', 'CONFIRMED', 'COMPLETED'] },
            ...(staffId ? (staffId === 'none' ? { handledById: null, case: { assignedStaffId: null } } : { OR: [{ handledById: staffId }, { handledById: null, case: { assignedStaffId: staffId } }] }) : {}),
          },
          select: { id: true, caseId: true, status: true, arrivalTime: true, flightNumber: true, arrivalAirport: true, client: staffSel, handledBy: staffSel, case: { select: { number: true, assignedStaff: staffSel } } },
          take: 500,
        })
      : [],
    want.has('consultation')
      ? prisma.booking.findMany({
          where: { status: { in: ['BOOKED', 'DONE'] }, slot: { startsAt: { gte: q.from, lt: q.to }, ...(staffId && staffId !== 'none' ? { staffId } : {}) } },
          select: { id: true, name: true, topic: true, status: true, meetingUrl: true, userId: true, caseId: true, case: { select: { number: true } }, slot: { select: { startsAt: true, endsAt: true, kind: true, staff: staffSel } } },
          take: 500,
        })
      : [],
  ]);
  if (staffId === 'none') bookings.length = 0; // every slot has a staff member

  const items: OpsItem[] = [];
  for (const c of cases) {
    items.push({
      key: `embassy:${c.id}`,
      type: 'embassy',
      id: c.id,
      title: `${name(c.client)} · ${c.number}`,
      startsAt: c.appointmentAt!,
      endsAt: new Date(c.appointmentAt!.getTime() + HOUR),
      location: c.appointmentPlace,
      place: c.appointmentPlace,
      status: c.status,
      client: person(c.client),
      staff: person(c.assignedStaff),
      caseId: c.id,
      caseNumber: c.number,
      link: `/admin/cases/${c.id}`,
      movable: c.status === 'APPOINTMENT_SCHEDULED' && !!c.appointmentPlace && c.appointmentPlace.trim().length >= 3,
    });
  }
  for (const i of interviews) {
    items.push({
      key: `interview:${i.id}`,
      type: 'interview',
      id: i.id,
      title: `${name(i.candidate)}${i.company ? ` · ${i.company.name}` : ''}`,
      startsAt: i.startsAt,
      endsAt: i.endsAt,
      location: i.meetingUrl,
      status: i.status,
      client: person(i.candidate),
      staff: person(i.staff),
      caseId: null,
      caseNumber: null,
      link: `/admin/interviews?id=${i.id}`,
      movable: (i.status === 'PROPOSED' || i.status === 'CONFIRMED') && i.startsAt.getTime() > now,
    });
  }
  for (const a of arrivals) {
    items.push({
      key: `arrival:${a.id}`,
      type: 'arrival',
      id: a.id,
      title: `${name(a.client)}${a.flightNumber ? ` · ${a.flightNumber}` : ''}`,
      startsAt: a.arrivalTime!,
      endsAt: new Date(a.arrivalTime!.getTime() + HOUR),
      location: a.arrivalAirport,
      status: a.status,
      client: person(a.client),
      staff: person(a.handledBy ?? a.case.assignedStaff),
      caseId: a.caseId,
      caseNumber: a.case.number,
      link: `/admin/arrivals/${a.caseId}`,
      movable: false,
    });
  }
  for (const b of bookings) {
    items.push({
      key: `consultation:${b.id}`,
      type: 'consultation',
      id: b.id,
      title: `${b.name}${b.case ? ` · ${b.case.number}` : ''}`,
      startsAt: b.slot.startsAt,
      endsAt: b.slot.endsAt,
      location: b.slot.kind === 'OFFICE' ? null : b.meetingUrl,
      status: b.status,
      client: b.userId ? { id: b.userId, name: b.name } : null,
      staff: person(b.slot.staff),
      caseId: b.caseId,
      caseNumber: b.case?.number ?? null,
      link: '/admin/bookings',
      movable: false,
    });
  }
  items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const counts = Object.fromEntries(TYPES.map((t) => [t, items.filter((i) => i.type === t).length])) as Record<OpsType, number>;
  res.json({ items, counts });
});
