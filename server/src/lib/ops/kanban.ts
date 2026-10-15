import type { CaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';

/**
 * Kanban board figures. The per-row logic mirrors what the admin case list computes (days in the
 * current status, pending documents) and adds "the client wrote last" so a column can show who the
 * ball is with. Kept here so the board and the workload preview share one implementation.
 */

export const KANBAN_STATUSES: CaseStatus[] = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

/** Statuses where the next move is the client's (the rest wait for staff, final ones for nobody). */
export const CLIENT_TURN: CaseStatus[] = ['DOCUMENTS_PENDING', 'CONTRACT_SENT', 'EMBASSY_DOCUMENTS'];

/** Days in a status after which a card is "overdue" (amber) and "critical" (red). */
export const OVERDUE_DAYS = 3;
export const CRITICAL_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

export interface KanbanFilter {
  staffId?: string;
  visaCategoryId?: string;
  /** Include closed cases (APPROVED / REJECTED / CANCELLED) — only the ones touched in the last 14 days. */
  includeFinal?: boolean;
}

export interface KanbanCard {
  id: string;
  number: string;
  status: CaseStatus;
  clientName: string;
  profession: string;
  visaLabel: string | null;
  visaCategoryId: string | null;
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  daysInStatus: number;
  pendingDocs: number;
  unansweredClientMessage: boolean;
  waitingFor: 'client' | 'staff' | null;
  appointmentAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

/** Cases as board cards, grouped by status (every status is present, possibly empty). */
export const kanbanBoard = async (filter: KanbanFilter = {}, now = new Date()) => {
  const where: Prisma.CaseWhereInput = {
    ...(filter.staffId ? { assignedStaffId: filter.staffId } : {}),
    ...(filter.visaCategoryId ? { visaCategoryId: filter.visaCategoryId } : {}),
    ...(filter.includeFinal
      ? { OR: [{ status: { notIn: FINAL_STATUSES } }, { closedAt: { gte: new Date(now.getTime() - 14 * DAY) } }] }
      : { status: { notIn: FINAL_STATUSES } }),
  };
  const items = await prisma.case.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 1000,
    include: {
      client: { select: { firstName: true, lastName: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true } },
      visaCategory: { select: { visaLabel: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { authorId: true } },
      _count: { select: { documents: { where: { status: 'PENDING', stage: { in: ['INITIAL', 'EMBASSY'] } } } } },
    },
  });
  const entered = items.length
    ? await prisma.caseEvent.findMany({
        where: { caseId: { in: items.map((c) => c.id) }, toStatus: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { caseId: true, toStatus: true, createdAt: true },
      })
    : [];
  const statusSince = new Map<string, Date>();
  for (const e of entered) {
    const c = items.find((x) => x.id === e.caseId);
    if (c && c.status === e.toStatus && !statusSince.has(c.id)) statusSince.set(c.id, e.createdAt);
  }
  const columns = Object.fromEntries(KANBAN_STATUSES.map((s) => [s, [] as KanbanCard[]])) as Record<CaseStatus, KanbanCard[]>;
  for (const c of items) {
    const since = statusSince.get(c.id) ?? c.createdAt;
    const card: KanbanCard = {
      id: c.id,
      number: c.number,
      status: c.status,
      clientName: `${c.client.firstName} ${c.client.lastName}`.trim(),
      profession: c.profession,
      visaLabel: c.visaCategory?.visaLabel ?? null,
      visaCategoryId: c.visaCategoryId,
      assignedStaff: c.assignedStaff,
      daysInStatus: Math.floor((now.getTime() - since.getTime()) / DAY),
      pendingDocs: c._count.documents,
      unansweredClientMessage: c.messages[0]?.authorId === c.clientId,
      waitingFor: FINAL_STATUSES.includes(c.status) ? null : CLIENT_TURN.includes(c.status) ? 'client' : 'staff',
      appointmentAt: c.appointmentAt,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
    };
    columns[c.status].push(card);
  }
  return {
    columns: KANBAN_STATUSES.map((status) => ({ status, count: columns[status].length, cards: columns[status] })),
    total: items.length,
  };
};

/** Open cases per active staff member (for the "balance" preview next to the auto-assignment settings). */
export const staffWorkload = async () => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const [open, waiting, unassigned] = await Promise.all([
    prisma.case.groupBy({ by: ['assignedStaffId'], where: { status: { notIn: FINAL_STATUSES }, assignedStaffId: { not: null } }, _count: { _all: true } }),
    prisma.case.groupBy({
      by: ['assignedStaffId'],
      where: { status: { in: ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'] }, assignedStaffId: { not: null } },
      _count: { _all: true },
    }),
    prisma.case.count({ where: { status: { notIn: FINAL_STATUSES }, assignedStaffId: null } }),
  ]);
  const openBy = new Map(open.map((o) => [o.assignedStaffId as string, o._count._all]));
  const waitingBy = new Map(waiting.map((o) => [o.assignedStaffId as string, o._count._all]));
  return {
    staff: staff.map((s) => ({ ...s, open: openBy.get(s.id) ?? 0, waitingForStaff: waitingBy.get(s.id) ?? 0 })),
    unassigned,
  };
};
