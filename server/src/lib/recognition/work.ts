import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import type { WorkAction } from '../myWork.js';
import { ACCEL_FINAL, FINAL_PROCESS_STATUSES, accelDeadlines, effectiveDeadline } from './rules.js';
import { DAY, fullName } from './common.js';
import { openReplyDue } from './accelerated.js';

/**
 * "My work today" sources (lib/myWork.ts kinds `recognition_deadline` and `accelerated_deadline`): recognition
 * and § 81a deadlines on the viewer's cases that are overdue or due soon. Items carry only links (the case
 * card sections #case-recognition / #case-81a), no own business logic.
 */

export const RECOGNITION_WORK_DAYS = 14;
export const ACCELERATED_WORK_DAYS = 7;
const LIMIT = 25;

interface WorkDraft<K extends string> {
  id: string;
  kind: K;
  title: string;
  subtitle: string | null;
  note?: { key: string; params?: Record<string, string | number> };
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  dueAt: Date | null;
  since: Date;
  link: string;
  refs: Record<string, string | null>;
  assignee: { id: string; name: string } | null;
  actions: WorkAction[];
}

const caseSelect = { id: true, number: true, client: { select: { firstName: true, lastName: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } } as const;
const person = (u: { id: string; firstName: string; lastName: string } | null) => (u ? { id: u.id, name: fullName(u) } : null);
const join = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(' · ') || null;
const prio = (at: Date, now: Date): 'HIGH' | 'NORMAL' => (at.getTime() - now.getTime() <= 2 * DAY ? 'HIGH' : 'NORMAL');

export const recognitionWork = async (caseWhere: Prisma.CaseWhereInput, now: Date) => {
  const horizon = new Date(now.getTime() + RECOGNITION_WORK_DAYS * DAY);
  const rows = await prisma.recognitionProcess.findMany({
    where: { status: { notIn: [...FINAL_PROCESS_STATUSES] }, OR: [{ nextDeadline: { lte: horizon } }, { status: 'ADAPTATION', nextDeadline: null, adaptationUntil: { lte: horizon } }] },
    orderBy: { nextDeadline: 'asc' },
    take: 300,
  });
  const cases = rows.length ? await prisma.case.findMany({ where: { AND: [{ id: { in: [...new Set(rows.map((r) => r.caseId))] } }, caseWhere] }, select: caseSelect }) : [];
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const mine = rows.filter((r) => caseOf.has(r.caseId));
  return {
    kind: 'recognition_deadline' as const,
    total: mine.length,
    items: mine.slice(0, LIMIT).flatMap((r): WorkDraft<'recognition_deadline'>[] => {
      const d = effectiveDeadline(r);
      const c = caseOf.get(r.caseId)!;
      if (!d) return [];
      const href = `/admin/cases/${c.id}#case-recognition`;
      return [
        {
          id: `recognition_deadline:${r.id}`,
          kind: 'recognition_deadline',
          title: fullName(c.client) || c.number,
          subtitle: join(c.number, r.authority, d.kind === 'NEXT' ? r.nextDeadlineNote : null),
          note: { key: `recognition.${d.kind}`, params: { procedure: r.procedureType } },
          priority: prio(d.at, now),
          dueAt: d.at,
          since: r.updatedAt,
          link: href,
          refs: { caseId: c.id, caseNumber: c.number, recognitionId: r.id },
          assignee: person(c.assignedStaff),
          actions: [{ key: 'open', label: 'open', type: 'link', href, primary: true }],
        },
      ];
    }),
  };
};

export const acceleratedWork = async (caseWhere: Prisma.CaseWhereInput, now: Date) => {
  const procs = await prisma.acceleratedProcedure.findMany({ where: { status: { notIn: [...ACCEL_FINAL] } }, take: 500 });
  const horizon = now.getTime() + ACCELERATED_WORK_DAYS * DAY;
  const due: { p: (typeof procs)[number]; kind: string; at: Date }[] = [];
  for (const p of procs) {
    const next = accelDeadlines(p, await openReplyDue(p.id))[0];
    if (next && next.at.getTime() <= horizon) due.push({ p, kind: next.kind, at: next.at });
  }
  const cases = due.length ? await prisma.case.findMany({ where: { AND: [{ id: { in: due.map((d) => d.p.caseId) } }, caseWhere] }, select: caseSelect }) : [];
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const mine = due.filter((d) => caseOf.has(d.p.caseId)).sort((a, b) => a.at.getTime() - b.at.getTime());
  return {
    kind: 'accelerated_deadline' as const,
    total: mine.length,
    items: mine.slice(0, LIMIT).map(({ p, kind, at }): WorkDraft<'accelerated_deadline'> => {
      const c = caseOf.get(p.caseId)!;
      const href = `/admin/cases/${c.id}#case-81a`;
      return {
        id: `accelerated_deadline:${p.id}:${kind}`,
        kind: 'accelerated_deadline',
        title: fullName(c.client) || c.number,
        subtitle: join(c.number, p.authority, p.reference),
        note: { key: `accelerated.${kind}` },
        priority: prio(at, now),
        dueAt: at,
        since: p.updatedAt,
        link: href,
        refs: { caseId: c.id, caseNumber: c.number, acceleratedId: p.id },
        assignee: person(c.assignedStaff),
        actions: [{ key: 'open', label: 'open', type: 'link', href, primary: true }],
      };
    }),
  };
};
