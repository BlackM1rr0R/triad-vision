import type { CaseStatus, Locale, Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole } from '../middleware/auth.js';
import { FINAL_STATUSES } from './caseFlow.js';
import { currentTurn } from './esign/service.js';
import { pendingCountersignatures } from './esign/countersign.js';
import { l10nTitle, trackedDocuments, daysLeft, kindForKey, toneOf } from './expiry/index.js';
import { presentAlert } from './aiMgmt/security/alerts.js';
import { taskKey } from './tasks/core.js';
import { acceleratedWork, recognitionWork } from './recognition/work.js'; // recognition + § 81a deadlines
import { stageLabel } from './caseProcessing/texts.js'; // team document workflow (Schon geschrieben → Fertig)
import { partnerContractWork } from './partnerRecords/work.js'; // employer / partner contracts ending or at their notice deadline

/**
 * "My work today" (GET /api/admin/my-work): one queue of everything that waits for the signed-in staff
 * member (or, scope=all for ADMIN+, the whole team). Items are read from the existing models only; every
 * action points at an EXISTING endpoint, which the client calls — no business logic is duplicated here.
 */

export const WORK_KINDS = [
  'doc_review',
  'case_waiting',
  'case_stuck',
  'appointment',
  'sign_mine',
  'sign_waiting',
  'countersign', // service contract signed by the client, waiting for the Triad Vision countersignature (lib/esign/countersign)
  'task',
  'mail_triage',
  'mail_unread',
  'inquiry',
  'booking',
  'application',
  'employer_decision',
  'candidate_request',
  'expiring',
  'security_alert',
  'privacy',
  'arrival_issue', // post-arrival check-in answered "Problem var" (lib/checkIns)
  'embassy_review', // four-eyes check of an embassy package waiting for the viewer (lib/caseNext/fourEyes)
  'client_task_overdue',
  'handover', // cases covered for an absent colleague with a handover note / open checklist (lib/shifts/handoverNotes)
  'recognition_deadline', // Anerkennung: next deadline / end of the adaptation measure (lib/recognition)
  'accelerated_deadline', // § 81a: embassy appointment / decision, fee, reply to the authority (lib/recognition)
  'processing', // team document workflow: a colleague handed the case to the viewer ("Schon geschrieben", lib/caseProcessing)
  'partner_contract', // employer / referral partner contract: end date or notice deadline within its reminder lead time (lib/partnerRecords)
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export const WORK_CATEGORIES = ['documents', 'tasks', 'mail', 'signatures', 'bookings', 'leads', 'other'] as const;
export type WorkCategory = (typeof WORK_CATEGORIES)[number];

const CATEGORY: Record<WorkKind, WorkCategory> = {
  doc_review: 'documents',
  expiring: 'documents',
  task: 'tasks',
  mail_triage: 'mail',
  mail_unread: 'mail',
  sign_mine: 'signatures',
  sign_waiting: 'signatures',
  countersign: 'signatures',
  booking: 'bookings',
  inquiry: 'leads',
  application: 'leads',
  employer_decision: 'leads',
  candidate_request: 'leads',
  case_waiting: 'other',
  case_stuck: 'other',
  appointment: 'other',
  security_alert: 'other',
  privacy: 'other',
  arrival_issue: 'other',
  embassy_review: 'documents',
  client_task_overdue: 'tasks',
  handover: 'other',
  recognition_deadline: 'documents',
  accelerated_deadline: 'documents',
  processing: 'documents',
  partner_contract: 'documents',
};

/** Page that lists all items of a kind (the "+N more" link). */
const MORE_LINK: Record<WorkKind, string> = {
  doc_review: '/admin/cases?status=DOCUMENTS_REVIEW',
  expiring: '/admin/expiring',
  task: '/workspace/tasks',
  mail_triage: '/workspace/mail?ai=open',
  mail_unread: '/workspace/mail',
  sign_mine: '/admin/signatures',
  sign_waiting: '/admin/signatures?status=SENT',
  countersign: '/admin/countersign',
  booking: '/admin/bookings',
  inquiry: '/admin/inquiries',
  application: '/admin/candidates',
  employer_decision: '/admin/candidates',
  candidate_request: '/admin/candidate-requests',
  case_waiting: '/admin/cases',
  case_stuck: '/admin/cases',
  appointment: '/admin/cases?status=APPOINTMENT_SCHEDULED',
  security_alert: '/admin/security-alerts',
  privacy: '/admin/privacy-requests',
  arrival_issue: '/admin/check-ins?status=issue',
  embassy_review: '/admin/cases?status=APPOINTMENT_SCHEDULED',
  client_task_overdue: '/admin/client-tasks?filter=overdue',
  handover: '/workspace/team?tab=handover',
  recognition_deadline: '/admin/recognition?soon=14',
  accelerated_deadline: '/admin/accelerated?soon=7',
  processing: '/admin/cases?processingAssignee=me',
  partner_contract: '/admin/companies',
};

export type WorkPriority = 'URGENT' | 'HIGH' | 'NORMAL';
export type WorkBucket = 'overdue' | 'today' | 'week' | 'later';

/**
 * One button. `api`: the client calls method+endpoint with body (paths relative to /api);
 * `reject`: like api, but the client first asks for a reason from a short select and sends it as `note`;
 * `link`: in-app navigation; `url`: opens an external / file URL in a new tab.
 */
export interface WorkAction {
  key: string;
  /** i18n key under today.action.* */
  label: string;
  type: 'api' | 'reject' | 'link' | 'url';
  method?: 'POST' | 'PATCH';
  endpoint?: string;
  body?: Record<string, unknown>;
  href?: string;
  confirm?: boolean;
  primary?: boolean;
  /** The server refuses the action before this instant (e.g. booking "done" before it started). */
  notBefore?: string;
  /** Label parameters (e.g. the name of the suggested assignee). */
  params?: Record<string, string>;
}

export interface WorkItem {
  id: string;
  kind: WorkKind;
  category: WorkCategory;
  title: string;
  subtitle: string | null;
  /** Optional i18n key (today.note.*) with params for an extra line (status, type…). */
  note?: { key: string; params?: Record<string, string | number> };
  priority: WorkPriority;
  dueAt: string | null;
  /** Since when it waits (age is counted from here). */
  since: string;
  ageHours: number;
  overdue: boolean;
  bucket: WorkBucket;
  link: string;
  refs: Record<string, string | null>;
  assignee: { id: string; name: string } | null;
  actions: WorkAction[];
}

export interface WorkResult {
  scope: 'mine' | 'all';
  generatedAt: string;
  items: WorkItem[];
  counts: { total: number; urgent: number; overdue: number; byKind: Partial<Record<WorkKind, number>>; byCategory: Record<WorkCategory, number> };
  more: { kind: WorkKind; count: number; link: string }[];
}

export interface WorkViewer {
  id: string;
  role: Role;
  locale: Locale;
  firstName: string;
  lastName: string;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const LIMIT_PER_KIND = 25;
/** Cases in a staff-action status show up after this long without an update. */
export const WAIT_HOURS = 24;
/** … and are overdue after this long (the dashboard's "waiting > 3 days"). */
export const WAIT_SLA_HOURS = 72;
export const STUCK_DAYS = 14;
export const SIGN_WAIT_DAYS = 3;
export const APPLICATION_WAIT_DAYS = 2;
export const EMPLOYER_WAIT_DAYS = 3;
export const EXPIRY_WINDOW_DAYS = 30;
/** A manual or automatic expiry reminder hides the row for this long. */
export const EXPIRY_REMIND_QUIET_DAYS = 7;
export const MAIL_WINDOW_DAYS = 7;
const WAITING_STATUSES: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'];

const name = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
const person = (u: { id: string; firstName: string; lastName: string } | null | undefined) => (u ? { id: u.id, name: name(u) } : null);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const join = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(' · ') || null;

interface Clock {
  now: Date;
  endOfToday: Date;
  endOfWeek: Date;
}

/** `tz` = the browser's Date.getTimezoneOffset() (minutes); default Asia/Baku (UTC+4). */
export const clockFor = (tz: number | undefined, now = new Date()): Clock => {
  const offset = tz ?? -240;
  const local = new Date(now.getTime() - offset * 60_000);
  const startOfToday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offset * 60_000;
  return { now, endOfToday: new Date(startOfToday + DAY), endOfWeek: new Date(startOfToday + 7 * DAY) };
};

const bucketOf = (due: Date | null, c: Clock): WorkBucket => {
  if (!due) return 'today';
  if (due.getTime() < c.now.getTime()) return 'overdue';
  if (due < c.endOfToday) return 'today';
  if (due < c.endOfWeek) return 'week';
  return 'later';
};

type Draft = Omit<WorkItem, 'category' | 'ageHours' | 'overdue' | 'bucket' | 'dueAt' | 'since'> & { dueAt: Date | null; since: Date };

const finish = (d: Draft, c: Clock): WorkItem => {
  const overdue = !!d.dueAt && d.dueAt.getTime() < c.now.getTime();
  // Anything past its deadline is at least HIGH.
  const priority: WorkPriority = overdue && d.priority === 'NORMAL' ? 'HIGH' : d.priority;
  return {
    ...d,
    priority,
    category: CATEGORY[d.kind],
    dueAt: iso(d.dueAt),
    since: d.since.toISOString(),
    ageHours: Math.max(0, Math.floor((c.now.getTime() - d.since.getTime()) / HOUR)),
    overdue,
    bucket: bucketOf(d.dueAt, c),
  };
};

const RANK: Record<WorkPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2 };

/** Overdue first, then priority, then the nearest deadline, then the oldest. */
export const compareItems = (a: WorkItem, b: WorkItem) =>
  Number(b.overdue) - Number(a.overdue) ||
  RANK[a.priority] - RANK[b.priority] ||
  (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
  b.ageHours - a.ageHours ||
  a.id.localeCompare(b.id);

const caseLink = (id: string) => `/admin/cases/${id}`;
const open = (href: string, primary = false): WorkAction => ({ key: 'open', label: 'open', type: 'link', href, primary });

// ─── Sources ──────────────────────────────────────────────────────────

interface Ctx {
  viewer: WorkViewer;
  team: boolean;
  isAdmin: boolean;
  isSuper: boolean;
  c: Clock;
}

interface Source {
  kind: WorkKind;
  items: Draft[];
  /** Total before the per-kind limit. */
  total: number;
}

/** Cases the viewer looks after: own cases (+ unassigned ones for ADMIN+), every case for the team view. */
const myCases = (ctx: Ctx): Prisma.CaseWhereInput =>
  ctx.team ? {} : ctx.isAdmin ? { OR: [{ assignedStaffId: ctx.viewer.id }, { assignedStaffId: null }] } : { assignedStaffId: ctx.viewer.id };

const staffSelect = { select: { id: true, firstName: true, lastName: true } } as const;

const docReviews = async (ctx: Ctx): Promise<Source> => {
  const where: Prisma.DocumentWhereInput = {
    status: 'PENDING',
    stage: { in: ['INITIAL', 'EMBASSY'] },
    case: { status: { notIn: FINAL_STATUSES }, documentsPurgedAt: null, ...myCases(ctx) },
  };
  const [rows, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: LIMIT_PER_KIND,
      select: {
        id: true,
        originalName: true,
        stage: true,
        createdAt: true,
        requirement: { select: { title: true } },
        case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true, locale: true } }, assignedStaff: staffSelect } },
      },
    }),
    prisma.document.count({ where }),
  ]);
  return {
    kind: 'doc_review',
    total,
    items: rows.map((d) => {
      const endpoint = `/admin/cases/${d.case.id}/documents/${d.id}/review`;
      return {
        id: `doc_review:${d.id}`,
        kind: 'doc_review',
        title: l10nTitle(d.requirement?.title, ctx.viewer.locale) || d.originalName,
        subtitle: join(name(d.case.client), d.case.number, d.originalName),
        note: { key: `stage.${d.stage}` },
        // Review within two days of the upload.
        priority: 'NORMAL',
        dueAt: new Date(d.createdAt.getTime() + 2 * DAY),
        since: d.createdAt,
        link: caseLink(d.case.id),
        refs: { caseId: d.case.id, caseNumber: d.case.number, documentId: d.id, clientLocale: d.case.client.locale },
        assignee: person(d.case.assignedStaff),
        actions: [
          { key: 'accept', label: 'accept', type: 'api', method: 'POST', endpoint, body: { status: 'ACCEPTED' }, primary: true },
          { key: 'reject', label: 'reject', type: 'reject', method: 'POST', endpoint, body: { status: 'REJECTED' } },
          { key: 'view', label: 'view', type: 'url', href: `/api/files/${d.id}` },
        ],
      } satisfies Draft;
    }),
  };
};

const caseItems = async (ctx: Ctx): Promise<Source[]> => {
  const { now } = ctx.c;
  const waitCutoff = new Date(now.getTime() - WAIT_HOURS * HOUR);
  const stuckCutoff = new Date(now.getTime() - STUCK_DAYS * DAY);
  const base = { ...myCases(ctx) };
  const waitingWhere: Prisma.CaseWhereInput = { ...base, status: { in: WAITING_STATUSES }, updatedAt: { lt: waitCutoff } };
  const stuckWhere: Prisma.CaseWhereInput = {
    ...base,
    status: { notIn: [...FINAL_STATUSES, ...WAITING_STATUSES] },
    updatedAt: { lt: stuckCutoff },
    events: { none: { createdAt: { gte: stuckCutoff } } },
    messages: { none: { createdAt: { gte: stuckCutoff } } },
  };
  const apptWhere: Prisma.CaseWhereInput = { ...base, status: 'APPOINTMENT_SCHEDULED', appointmentAt: { gte: new Date(now.getTime() - 12 * HOUR), lte: new Date(now.getTime() + 7 * DAY) } };
  const select = {
    id: true,
    number: true,
    status: true,
    updatedAt: true,
    appointmentAt: true,
    appointmentPlace: true,
    client: { select: { firstName: true, lastName: true } },
    assignedStaff: staffSelect,
  } satisfies Prisma.CaseSelect;
  const [waiting, waitingTotal, stuck, stuckTotal, appts, apptTotal] = await Promise.all([
    prisma.case.findMany({ where: waitingWhere, orderBy: { updatedAt: 'asc' }, take: LIMIT_PER_KIND, select }),
    prisma.case.count({ where: waitingWhere }),
    prisma.case.findMany({ where: stuckWhere, orderBy: { updatedAt: 'asc' }, take: LIMIT_PER_KIND, select }),
    prisma.case.count({ where: stuckWhere }),
    prisma.case.findMany({ where: apptWhere, orderBy: { appointmentAt: 'asc' }, take: LIMIT_PER_KIND, select }),
    prisma.case.count({ where: apptWhere }),
  ]);
  const common = (c: (typeof waiting)[number]) => ({
    title: `${c.number} · ${name(c.client)}`,
    link: caseLink(c.id),
    refs: { caseId: c.id, caseNumber: c.number },
    assignee: person(c.assignedStaff),
    actions: [open(caseLink(c.id), true)],
  });
  return [
    {
      kind: 'case_waiting',
      total: waitingTotal,
      items: waiting.map((c) => ({
        ...common(c),
        id: `case_waiting:${c.id}`,
        kind: 'case_waiting' as const,
        subtitle: null,
        note: { key: `status.${c.status}` },
        priority: 'NORMAL' as const,
        dueAt: new Date(c.updatedAt.getTime() + WAIT_SLA_HOURS * HOUR),
        since: c.updatedAt,
      })),
    },
    {
      kind: 'case_stuck',
      total: stuckTotal,
      items: stuck.map((c) => ({
        ...common(c),
        id: `case_stuck:${c.id}`,
        kind: 'case_stuck' as const,
        subtitle: null,
        note: { key: 'stuck', params: { days: Math.floor((now.getTime() - c.updatedAt.getTime()) / DAY), status: c.status } },
        priority: 'NORMAL' as const,
        dueAt: null,
        since: c.updatedAt,
      })),
    },
    {
      kind: 'appointment',
      total: apptTotal,
      items: appts.map((c) => {
        const left = c.appointmentAt!.getTime() - now.getTime();
        return {
          ...common(c),
          id: `appointment:${c.id}`,
          kind: 'appointment' as const,
          subtitle: c.appointmentPlace ?? null,
          priority: left < DAY ? ('URGENT' as const) : left < 3 * DAY ? ('HIGH' as const) : ('NORMAL' as const),
          dueAt: c.appointmentAt,
          since: c.updatedAt,
        };
      }),
    },
  ];
};

const signatures = async (ctx: Ctx): Promise<Source[]> => {
  const { now } = ctx.c;
  const live = { status: 'SENT' as const, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const signerSel = { select: { id: true, order: true, status: true, name: true, userId: true, invitedAt: true, role: true } } as const;
  const waitingWhere: Prisma.SignatureRequestWhereInput = {
    ...live,
    sentAt: { lt: new Date(now.getTime() - SIGN_WAIT_DAYS * DAY) },
    ...(ctx.team ? {} : { AND: [{ OR: [{ createdById: ctx.viewer.id }, { case: { assignedStaffId: ctx.viewer.id } }] }] }),
  };
  const [mine, waiting] = await Promise.all([
    prisma.signatureSigner.findMany({
      where: { userId: ctx.viewer.id, status: { in: ['PENDING', 'VIEWED'] }, request: live },
      take: 200,
      select: {
        id: true,
        request: {
          select: {
            id: true,
            title: true,
            order: true,
            sentAt: true,
            createdAt: true,
            expiresAt: true,
            case: { select: { id: true, number: true } },
            company: { select: { name: true } },
            createdBy: staffSelect,
            signers: signerSel,
          },
        },
      },
    }),
    prisma.signatureRequest.findMany({
      where: waitingWhere,
      orderBy: { sentAt: 'asc' },
      take: 200,
      select: {
        id: true,
        title: true,
        order: true,
        sentAt: true,
        createdAt: true,
        expiresAt: true,
        case: { select: { id: true, number: true } },
        company: { select: { name: true } },
        createdBy: staffSelect,
        signers: signerSel,
      },
    }),
  ]);
  // Countersignatures (client signed, Triad Vision open): the assigned signer sees them under "sign" (with a
  // countersign note + button); every other authorised signatory gets them as their own kind.
  const pendingCs = await pendingCountersignatures({ id: ctx.viewer.id, role: ctx.viewer.role });
  const csBySigner = new Map(pendingCs.map((p) => [p.signerId, p]));
  const counter = pendingCs.filter((p) => !p.mine && (ctx.team || p.canSign));
  const myTurn = mine.filter((s) => currentTurn(s.request.signers, s.request.order).some((x) => x.id === s.id));
  // Waiting on others = somebody else's turn (the viewer's own turn is listed as "sign").
  const others = waiting
    .map((r) => ({ r, turn: currentTurn(r.signers, r.order) }))
    .filter(({ turn }) => turn.length > 0 && !turn.some((s) => s.userId === ctx.viewer.id));
  const soon = (d: Date | null) => !!d && d.getTime() - now.getTime() < 2 * DAY;
  return [
    {
      kind: 'sign_mine',
      total: myTurn.length,
      items: myTurn.slice(0, LIMIT_PER_KIND).map((s) => {
        const r = s.request;
        const href = `/admin/signatures/sign/${s.id}`;
        return {
          id: `sign_mine:${s.id}`,
          kind: 'sign_mine' as const,
          title: r.title,
          subtitle: join(r.case?.number, r.company?.name),
          priority: soon(r.expiresAt) ? ('URGENT' as const) : ('HIGH' as const),
          dueAt: r.expiresAt,
          since: r.sentAt ?? r.createdAt,
          link: href,
          refs: { requestId: r.id, signerId: s.id, caseId: r.case?.id ?? null },
          assignee: person(ctx.viewer),
          ...(csBySigner.has(s.id) ? { note: { key: 'countersign', params: { days: csBySigner.get(s.id)!.waitingDays } } } : {}),
          actions: [
            { key: 'sign', label: 'sign', type: 'link' as const, href, primary: true },
            ...(csBySigner.has(s.id) ? [{ key: 'countersign', label: 'countersign', type: 'link' as const, href: `/admin/countersign?open=${s.id}` }] : []),
          ],
        };
      }),
    },
    {
      kind: 'sign_waiting',
      total: others.length,
      items: others.slice(0, LIMIT_PER_KIND).map(({ r, turn }) => ({
        id: `sign_waiting:${r.id}`,
        kind: 'sign_waiting' as const,
        title: r.title,
        subtitle: join(r.case?.number, r.company?.name),
        note: { key: 'waitingOn', params: { names: turn.map((s) => s.name).join(', ') } },
        priority: soon(r.expiresAt) ? ('HIGH' as const) : ('NORMAL' as const),
        dueAt: r.expiresAt,
        since: r.sentAt ?? r.createdAt,
        link: `/admin/signatures?open=${r.id}`,
        refs: { requestId: r.id, caseId: r.case?.id ?? null },
        assignee: person(r.createdBy),
        actions: [
          { key: 'remind', label: 'remind', type: 'api' as const, method: 'POST' as const, endpoint: `/admin/signatures/${r.id}/remind`, body: {}, primary: true },
          open(`/admin/signatures?open=${r.id}`),
        ],
      })),
    },
    {
      kind: 'countersign',
      total: counter.length,
      items: counter.slice(0, LIMIT_PER_KIND).map((p) => {
        const href = `/admin/countersign?open=${p.signerId}`;
        return {
          id: `countersign:${p.signerId}`,
          kind: 'countersign' as const,
          title: p.title,
          subtitle: join(p.case?.number, p.clientSigners.map((x) => x.name).join(', ')),
          note: { key: 'countersign', params: { days: p.waitingDays } },
          priority: p.overdue ? ('URGENT' as const) : ('HIGH' as const),
          dueAt: null,
          since: p.since,
          link: href,
          refs: { requestId: p.requestId, signerId: p.signerId, caseId: p.case?.id ?? null },
          assignee: p.assignedTo.userId ? { id: p.assignedTo.userId, name: p.assignedTo.name } : null,
          actions: [{ key: 'countersign', label: 'countersign', type: 'link' as const, href, primary: true }],
        };
      }),
    },
  ];
};

const TASK_PRIORITY: Record<string, WorkPriority> = { URGENT: 'URGENT', HIGH: 'HIGH', NORMAL: 'NORMAL', LOW: 'NORMAL' };

const tasks = async (ctx: Ctx): Promise<Source> => {
  const where: Prisma.TaskWhereInput = {
    status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] },
    dueAt: { not: null, lt: ctx.c.endOfWeek },
    ...(ctx.team ? {} : { assignees: { some: { userId: ctx.viewer.id } } }),
  };
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { dueAt: 'asc' },
      take: LIMIT_PER_KIND,
      select: {
        id: true,
        number: true,
        title: true,
        priority: true,
        status: true,
        dueAt: true,
        createdAt: true,
        case: { select: { id: true, number: true } },
        assignees: { select: { user: staffSelect }, orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.task.count({ where }),
  ]);
  return {
    kind: 'task',
    total,
    items: rows.map((t) => {
      const key = taskKey(t.number);
      const me = t.assignees.find((a) => a.user.id === ctx.viewer.id)?.user;
      return {
        id: `task:${t.id}`,
        kind: 'task',
        title: t.title,
        subtitle: join(key, t.case?.number),
        note: { key: `taskStatus.${t.status}` },
        priority: TASK_PRIORITY[t.priority] ?? 'NORMAL',
        dueAt: t.dueAt,
        since: t.createdAt,
        link: `/workspace/tasks/${key}`,
        refs: { taskId: t.id, taskKey: key, caseId: t.case?.id ?? null },
        assignee: person(me ?? t.assignees[0]?.user),
        actions: [
          { key: 'done', label: 'done', type: 'api', method: 'PATCH', endpoint: `/tasks/${t.id}`, body: { status: 'DONE' }, primary: true },
          { key: 'snooze', label: 'snooze', type: 'api', method: 'POST', endpoint: `/admin/my-work/tasks/${t.id}/snooze`, body: { days: 1 } },
        ],
      } satisfies Draft;
    }),
  };
};

const LEAD_CATEGORIES = new Set(['CANDIDATE', 'EMPLOYER', 'PARTNER']);

/** Mail is private to its mailbox owner: always the viewer's own mailboxes, also in the team view. */
const mail = async (ctx: Ctx): Promise<Source[]> => {
  const { now } = ctx.c;
  const accounts = await prisma.mailAccount.findMany({ where: { userId: ctx.viewer.id }, select: { id: true } });
  if (!accounts.length) return [];
  const accountIds = accounts.map((a) => a.id);
  const since = new Date(now.getTime() - MAIL_WINDOW_DAYS * DAY);
  const inbox = { accountId: { in: accountIds }, isDraft: false, date: { gte: since }, folder: { role: 'INBOX' as const }, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  const triageWhere: Prisma.MailTriageWhereInput = { status: 'NEW', message: inbox };
  // Unread, unanswered, and not (yet) a triage card — a triaged one is listed as mail_triage.
  const unreadWhere: Prisma.MailMessageWhereInput = {
    ...inbox,
    seen: false,
    answered: false,
    AND: [{ OR: [{ triage: { is: null } }, { triage: { is: { status: { in: ['PENDING', 'FAILED'] } } } }] }],
  };
  const msgSelect = { id: true, accountId: true, subject: true, fromName: true, fromAddr: true, date: true, snippet: true } as const;
  const [triaged, triageTotal, unread, unreadTotal] = await Promise.all([
    prisma.mailTriage.findMany({
      where: triageWhere,
      orderBy: { createdAt: 'asc' },
      take: LIMIT_PER_KIND,
      select: { id: true, category: true, urgency: true, summary: true, leadInquiryId: true, suggestedAssigneeId: true, message: { select: msgSelect } },
    }),
    prisma.mailTriage.count({ where: triageWhere }),
    prisma.mailMessage.findMany({ where: unreadWhere, orderBy: { date: 'asc' }, take: LIMIT_PER_KIND, select: msgSelect }),
    prisma.mailMessage.count({ where: unreadWhere }),
  ]);
  const suggestedIds = [...new Set(triaged.map((t) => t.suggestedAssigneeId).filter((x): x is string => !!x && x !== ctx.viewer.id))];
  const suggested = suggestedIds.length
    ? await prisma.user.findMany({ where: { id: { in: suggestedIds }, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const me = person(ctx.viewer);
  const mailHref = (m: { accountId: string; id: string }) => `/workspace/mail/${m.accountId}/v-inbox/${m.id}`;
  const summaryText = (s: unknown) => {
    const v = (s ?? null) as { lang?: string; text?: string; en?: string } | null;
    return (v?.lang === ctx.viewer.locale ? v?.text : v?.en || v?.text) ?? null;
  };
  return [
    {
      kind: 'mail_triage',
      total: triageTotal,
      items: triaged.map((t) => {
        const m = t.message;
        const sugg = suggested.find((u) => u.id === t.suggestedAssigneeId);
        const base = `/ai-mail/messages/${m.id}`;
        const actions: WorkAction[] = [open(mailHref(m), true)];
        if (t.category && LEAD_CATEGORIES.has(t.category) && !t.leadInquiryId) actions.push({ key: 'lead', label: 'createLead', type: 'api', method: 'POST', endpoint: `${base}/lead`, body: {} });
        if (sugg) actions.push({ key: 'assign', label: 'assignTo', type: 'api', method: 'POST', endpoint: `${base}/assign`, body: { userId: sugg.id, mode: 'task' }, params: { name: name(sugg) } });
        actions.push({ key: 'dismiss', label: 'dismiss', type: 'api', method: 'POST', endpoint: `${base}/dismiss`, body: {} });
        return {
          id: `mail_triage:${m.id}`,
          kind: 'mail_triage' as const,
          title: m.subject || m.fromAddr || '—',
          subtitle: join(m.fromName || m.fromAddr, summaryText(t.summary)),
          note: t.category ? { key: `mailCategory.${t.category}` } : undefined,
          priority: t.urgency === 'URGENT' ? ('URGENT' as const) : ('NORMAL' as const),
          dueAt: new Date(m.date.getTime() + (t.urgency === 'URGENT' ? 4 * HOUR : DAY)),
          since: m.date,
          link: mailHref(m),
          refs: { messageId: m.id, accountId: m.accountId, triageId: t.id },
          assignee: me,
          actions,
        };
      }),
    },
    {
      kind: 'mail_unread',
      total: unreadTotal,
      items: unread.map((m) => ({
        id: `mail_unread:${m.id}`,
        kind: 'mail_unread' as const,
        title: m.subject || m.fromAddr || '—',
        subtitle: join(m.fromName || m.fromAddr, m.snippet),
        priority: 'NORMAL' as const,
        dueAt: new Date(m.date.getTime() + DAY),
        since: m.date,
        link: mailHref(m),
        refs: { messageId: m.id, accountId: m.accountId },
        assignee: me,
        actions: [open(mailHref(m), true), { key: 'read', label: 'markRead', type: 'api' as const, method: 'POST' as const, endpoint: `/mail/messages/${m.id}/read`, body: {} }],
      })),
    },
  ];
};

/**
 * New leads. Mine: the new ones assigned to me plus the unassigned new ones (anyone may take those); team view:
 * every new lead. "Take" makes the lead mine and IN_PROGRESS.
 */
const inquiries = async (ctx: Ctx): Promise<Source> => {
  const where: Prisma.InquiryWhereInput = ctx.team ? { status: 'NEW' } : { status: 'NEW', OR: [{ assignedStaffId: ctx.viewer.id }, { assignedStaffId: null }] };
  const [rows, total] = await Promise.all([prisma.inquiry.findMany({ where, orderBy: { createdAt: 'asc' }, take: LIMIT_PER_KIND }), prisma.inquiry.count({ where })]);
  return {
    kind: 'inquiry',
    total,
    items: rows.map((q) => {
      const endpoint = `/admin/inquiries/${q.id}`;
      return {
        id: `inquiry:${q.id}`,
        kind: 'inquiry',
        title: q.companyName ? `${q.companyName} · ${q.contactName}` : q.contactName,
        subtitle: join(q.email, q.phone, q.message.slice(0, 140)),
        note: { key: `inquiryKind.${q.kind === 'company' ? 'company' : 'contact'}`, params: { workers: q.workersNeeded ?? 0 } },
        priority: q.kind === 'company' ? 'HIGH' : 'NORMAL',
        dueAt: new Date(q.createdAt.getTime() + DAY),
        since: q.createdAt,
        link: '/admin/inquiries?status=NEW',
        refs: { inquiryId: q.id, phone: q.phone ?? null }, // phone: "call" button (components/calls)
        assignee: q.assignedStaffId === ctx.viewer.id ? person(ctx.viewer) : null,
        actions: [
          { key: 'take', label: 'take', type: 'api', method: 'PATCH', endpoint, body: { status: 'IN_PROGRESS', assignToMe: true }, primary: true },
          { key: 'done', label: 'done', type: 'api', method: 'PATCH', endpoint, body: { status: 'DONE' } },
          { key: 'archive', label: 'archive', type: 'api', method: 'PATCH', endpoint, body: { status: 'ARCHIVED' } },
        ],
      } satisfies Draft;
    }),
  };
};

/** Consultations of today (local day) that are still BOOKED, plus earlier ones of the last 3 days never marked. */
const bookings = async (ctx: Ctx): Promise<Source> => {
  const { now, endOfToday } = ctx.c;
  const where: Prisma.BookingWhereInput = {
    status: 'BOOKED',
    slot: { startsAt: { gte: new Date(now.getTime() - 3 * DAY), lt: endOfToday }, ...(ctx.team ? {} : { staffId: ctx.viewer.id }) },
  };
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { slot: { startsAt: 'asc' } },
      take: LIMIT_PER_KIND,
      select: { id: true, name: true, email: true, phone: true, topic: true, meetingUrl: true, createdAt: true, caseId: true, slot: { select: { startsAt: true, endsAt: true, kind: true, location: true, staff: staffSelect } } },
    }),
    prisma.booking.count({ where }),
  ]);
  return {
    kind: 'booking',
    total,
    items: rows.map((b) => {
      const endpoint = `/admin/booking/bookings/${b.id}`;
      const startsIn = b.slot.startsAt.getTime() - now.getTime();
      const notBefore = b.slot.startsAt.toISOString();
      return {
        id: `booking:${b.id}`,
        kind: 'booking',
        title: b.name,
        subtitle: join(b.email, b.phone),
        // Office visits (client portal): the reason as note (lib/clientProcess/office).
        note: b.slot.kind === 'OFFICE' ? { key: `officeVisit.${['originals', 'passport', 'sign'].includes(b.topic ?? '') ? b.topic : 'other'}` } : b.topic ? { key: `bookingTopic.${['candidate', 'company'].includes(b.topic) ? b.topic : 'other'}` } : undefined,
        priority: startsIn < HOUR ? 'URGENT' : 'HIGH',
        // A past consultation still to be marked is due at its end.
        dueAt: startsIn > 0 ? b.slot.startsAt : b.slot.endsAt,
        since: b.createdAt,
        link: b.slot.kind === 'OFFICE' && b.caseId ? caseLink(b.caseId) : '/admin/bookings',
        refs: { bookingId: b.id, phone: b.phone ?? null, ...(b.caseId ? { caseId: b.caseId } : {}) },
        assignee: person(b.slot.staff),
        actions: [
          ...(b.meetingUrl && startsIn > -2 * HOUR ? [{ key: 'join', label: 'join', type: 'url' as const, href: b.meetingUrl, primary: startsIn < 15 * 60_000 }] : []),
          { key: 'done', label: 'done', type: 'api', method: 'PATCH', endpoint, body: { status: 'DONE' }, notBefore, primary: startsIn <= 0 },
          { key: 'noshow', label: 'noShow', type: 'api', method: 'PATCH', endpoint, body: { status: 'NO_SHOW' }, notBefore },
        ],
      } satisfies Draft;
    }),
  };
};

const applications = async (ctx: Ctx): Promise<Source[]> => {
  const { now } = ctx.c;
  const decisionWhere: Prisma.VacancyApplicationWhereInput = { status: { in: ['NEW', 'SHORTLISTED'] }, updatedAt: { lt: new Date(now.getTime() - APPLICATION_WAIT_DAYS * DAY) } };
  const employerWhere: Prisma.VacancyApplicationWhereInput = { status: 'PROPOSED', updatedAt: { lt: new Date(now.getTime() - EMPLOYER_WAIT_DAYS * DAY) } };
  const requestWhere: Prisma.CandidateRequestWhereInput = { status: 'OPEN' };
  const appSelect = {
    id: true,
    status: true,
    matchScore: true,
    createdAt: true,
    updatedAt: true,
    user: { select: { firstName: true, lastName: true, profession: true } },
    vacancy: { select: { id: true, title: true, company: { select: { name: true } } } },
  } as const;
  const [decide, decideTotal, employer, employerTotal, requests, requestTotal] = await Promise.all([
    prisma.vacancyApplication.findMany({ where: decisionWhere, orderBy: { updatedAt: 'asc' }, take: LIMIT_PER_KIND, select: appSelect }),
    prisma.vacancyApplication.count({ where: decisionWhere }),
    prisma.vacancyApplication.findMany({ where: employerWhere, orderBy: { updatedAt: 'asc' }, take: LIMIT_PER_KIND, select: appSelect }),
    prisma.vacancyApplication.count({ where: employerWhere }),
    prisma.candidateRequest.findMany({ where: requestWhere, orderBy: { createdAt: 'asc' }, take: LIMIT_PER_KIND, select: { id: true, title: true, profession: true, quantity: true, createdAt: true, startDate: true, company: { select: { name: true } } } }),
    prisma.candidateRequest.count({ where: requestWhere }),
  ]);
  const vacancyTitle = (v: { title: unknown }) => l10nTitle(v.title, ctx.viewer.locale);
  return [
    {
      kind: 'application',
      total: decideTotal,
      items: decide.map((a) => {
        const endpoint = `/admin/candidates/applications/${a.id}`;
        const next: WorkAction =
          a.status === 'NEW'
            ? { key: 'shortlist', label: 'shortlist', type: 'api', method: 'PATCH', endpoint, body: { status: 'SHORTLISTED' }, primary: true }
            : { key: 'propose', label: 'propose', type: 'api', method: 'PATCH', endpoint, body: { status: 'PROPOSED' }, primary: true, confirm: true };
        return {
          id: `application:${a.id}`,
          kind: 'application' as const,
          title: name(a.user),
          subtitle: join(vacancyTitle(a.vacancy), a.vacancy.company?.name, a.user.profession),
          note: { key: `appStatus.${a.status}`, params: { score: a.matchScore ?? '—' } },
          priority: 'NORMAL' as const,
          dueAt: new Date(a.updatedAt.getTime() + 4 * DAY),
          since: a.updatedAt,
          link: `/admin/vacancies?id=${a.vacancy.id}`,
          refs: { applicationId: a.id, vacancyId: a.vacancy.id },
          assignee: null,
          actions: [next, { key: 'rejectApp', label: 'reject', type: 'api' as const, method: 'PATCH' as const, endpoint, body: { status: 'REJECTED' }, confirm: true }],
        };
      }),
    },
    {
      kind: 'employer_decision',
      total: employerTotal,
      items: employer.map((a) => ({
        id: `employer_decision:${a.id}`,
        kind: 'employer_decision' as const,
        title: name(a.user),
        subtitle: join(a.vacancy.company?.name, vacancyTitle(a.vacancy)),
        note: { key: 'employerWaiting', params: { days: Math.floor((now.getTime() - a.updatedAt.getTime()) / DAY) } },
        priority: 'NORMAL' as const,
        dueAt: new Date(a.updatedAt.getTime() + 7 * DAY),
        since: a.updatedAt,
        link: `/admin/vacancies?id=${a.vacancy.id}`,
        refs: { applicationId: a.id, vacancyId: a.vacancy.id },
        assignee: null,
        actions: [open(`/admin/vacancies?id=${a.vacancy.id}`, true)],
      })),
    },
    {
      kind: 'candidate_request',
      total: requestTotal,
      items: requests.map((r) => ({
        id: `candidate_request:${r.id}`,
        kind: 'candidate_request' as const,
        title: `${r.company.name} · ${r.title}`,
        subtitle: join(`${r.quantity} × ${r.profession}`),
        priority: 'HIGH' as const,
        dueAt: new Date(r.createdAt.getTime() + 2 * DAY),
        since: r.createdAt,
        link: `/admin/candidate-requests/${r.id}`,
        refs: { requestId: r.id },
        assignee: null,
        actions: [
          { key: 'start', label: 'start', type: 'api' as const, method: 'PATCH' as const, endpoint: `/admin/candidate-requests/${r.id}`, body: { status: 'IN_PROGRESS' }, primary: true },
          open(`/admin/candidate-requests/${r.id}`),
        ],
      })),
    },
  ];
};

const expiring = async (ctx: Ctx): Promise<Source> => {
  const { now } = ctx.c;
  const quiet = now.getTime() - EXPIRY_REMIND_QUIET_DAYS * DAY;
  const docs = (await trackedDocuments({ until: new Date(now.getTime() + EXPIRY_WINDOW_DAYS * DAY), caseWhere: myCases(ctx) })).filter(
    (d) => !d.expiryRemindedAt || d.expiryRemindedAt.getTime() < quiet,
  );
  return {
    kind: 'expiring',
    total: docs.length,
    items: docs.slice(0, LIMIT_PER_KIND).map((d) => {
      const kind = kindForKey(d.requirement?.key);
      const tone = toneOf(kind, d.expiresAt!, now);
      const left = daysLeft(d.expiresAt!, now);
      return {
        id: `expiring:${d.id}`,
        kind: 'expiring' as const,
        title: l10nTitle(d.requirement?.title, ctx.viewer.locale) || d.originalName,
        subtitle: join(name(d.case.client), d.case.number),
        note: { key: left <= 0 ? 'expired' : 'expiresIn', params: { days: Math.max(0, left) } },
        priority: tone === 'expired' || tone === 'urgent' ? ('URGENT' as const) : ('HIGH' as const),
        // Remind at least a week before the end.
        dueAt: new Date(Math.max(d.expiresAt!.getTime() - 7 * DAY, d.createdAt.getTime())),
        since: d.expiryRemindedAt ?? d.createdAt,
        link: caseLink(d.case.id),
        refs: { caseId: d.case.id, caseNumber: d.case.number, documentId: d.id },
        assignee: person(d.case.assignedStaff),
        actions: [
          { key: 'remind', label: 'remindClient', type: 'api' as const, method: 'POST' as const, endpoint: `/admin/my-work/expiry/${d.id}/remind`, body: {}, primary: true },
          open(caseLink(d.case.id)),
        ],
      };
    }),
  };
};

const SEVERITY: Record<string, WorkPriority> = { HIGH: 'URGENT', MEDIUM: 'HIGH', LOW: 'NORMAL' };

const securityAlerts = async (ctx: Ctx): Promise<Source> => {
  const where = { status: 'OPEN' };
  const [rows, total] = await Promise.all([prisma.securityAlert.findMany({ where, orderBy: { lastSeenAt: 'desc' }, take: LIMIT_PER_KIND }), prisma.securityAlert.count({ where })]);
  return {
    kind: 'security_alert',
    total,
    items: rows.map((a) => {
      const p = presentAlert(a, ctx.viewer.locale);
      const base = `/admin/mgmt/security/alerts/${a.id}`;
      return {
        id: `security_alert:${a.id}`,
        kind: 'security_alert' as const,
        title: p.title,
        subtitle: join(typeof p.summary === 'string' ? p.summary : null, a.ip),
        priority: SEVERITY[a.severity] ?? 'NORMAL',
        dueAt: new Date(a.firstSeenAt.getTime() + DAY),
        since: a.firstSeenAt,
        link: `/admin/security-alerts?id=${a.id}`,
        refs: { alertId: a.id },
        assignee: null,
        actions: [
          { key: 'ack', label: 'acknowledge', type: 'api' as const, method: 'POST' as const, endpoint: `${base}/ack`, body: {}, primary: true },
          { key: 'falsePositive', label: 'falsePositive', type: 'api' as const, method: 'POST' as const, endpoint: `${base}/false-positive`, body: {} },
          open(`/admin/security-alerts?id=${a.id}`),
        ],
      };
    }),
  };
};

const privacyRequests = async (ctx: Ctx): Promise<Source> => {
  const where: Prisma.PrivacyRequestWhereInput = { status: { in: ['OPEN', 'IN_PROGRESS'] } };
  const [rows, total] = await Promise.all([
    prisma.privacyRequest.findMany({ where, orderBy: { dueAt: 'asc' }, take: LIMIT_PER_KIND, select: { id: true, type: true, status: true, email: true, dueAt: true, createdAt: true, handledBy: staffSelect } }),
    prisma.privacyRequest.count({ where }),
  ]);
  const { now } = ctx.c;
  return {
    kind: 'privacy',
    total,
    items: rows.map((r) => {
      const left = r.dueAt.getTime() - now.getTime();
      const href = `/admin/privacy-requests/${r.id}`;
      return {
        id: `privacy:${r.id}`,
        kind: 'privacy' as const,
        title: r.email,
        subtitle: null,
        note: { key: `privacyType.${r.type}` },
        priority: left < 3 * DAY ? ('URGENT' as const) : left < 10 * DAY ? ('HIGH' as const) : ('NORMAL' as const),
        dueAt: r.dueAt,
        since: r.createdAt,
        link: href,
        refs: { privacyRequestId: r.id },
        assignee: person(r.handledBy),
        actions: [
          ...(r.status === 'OPEN'
            ? [{ key: 'start', label: 'start', type: 'api' as const, method: 'POST' as const, endpoint: `/admin/privacy/requests/${r.id}/status`, body: { status: 'IN_PROGRESS' }, primary: true }]
            : []),
          open(href, r.status !== 'OPEN'),
        ],
      };
    }),
  };
};

/** Client tasks past their deadline on the viewer's cases (lib/clientProcess). */
const clientTasksOverdue = async (ctx: Ctx): Promise<Source> => {
  const where: Prisma.ClientTaskWhereInput = { status: 'OPEN', dueAt: { lt: ctx.c.now }, case: { status: { notIn: FINAL_STATUSES }, ...myCases(ctx) } };
  const [rows, total] = await Promise.all([
    prisma.clientTask.findMany({
      where,
      orderBy: { dueAt: 'asc' },
      take: LIMIT_PER_KIND,
      select: { id: true, title: true, dueAt: true, createdAt: true, case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } }, assignedStaff: staffSelect } } },
    }),
    prisma.clientTask.count({ where }),
  ]);
  return {
    kind: 'client_task_overdue',
    total,
    items: rows.map((t) => ({
      id: `client_task_overdue:${t.id}`,
      kind: 'client_task_overdue' as const,
      title: t.title,
      subtitle: join(name(t.case.client), t.case.number),
      note: { key: 'clientTaskOverdue', params: { days: Math.max(1, Math.floor((ctx.c.now.getTime() - t.dueAt!.getTime()) / DAY)) } },
      priority: 'HIGH' as const,
      dueAt: t.dueAt,
      since: t.createdAt,
      link: `${caseLink(t.case.id)}#client-tasks`,
      refs: { caseId: t.case.id, caseNumber: t.case.number, clientTaskId: t.id },
      assignee: person(t.case.assignedStaff),
      actions: [
        { key: 'remind', label: 'remindClient', type: 'api' as const, method: 'POST' as const, endpoint: `/admin/client-process/tasks/${t.id}/remind`, body: {}, primary: true },
        { key: 'done', label: 'done', type: 'api' as const, method: 'PATCH' as const, endpoint: `/admin/client-process/tasks/${t.id}`, body: { status: 'DONE' }, confirm: true },
        open(`${caseLink(t.case.id)}#client-tasks`),
      ],
    })),
  };
};

/** Post-arrival check-ins answered "Problem var" that nobody marked resolved yet (lib/checkIns). */
const arrivalIssues = async (ctx: Ctx): Promise<Source> => {
  const where: Prisma.ArrivalCheckInWhereInput = { answer: 'ISSUE', resolvedAt: null, followUp: { case: myCases(ctx) } };
  const [rows, total] = await Promise.all([
    prisma.arrivalCheckIn.findMany({
      where,
      orderBy: { answeredAt: 'asc' },
      take: LIMIT_PER_KIND,
      select: { id: true, audience: true, offsetDays: true, topics: true, comment: true, answeredAt: true, createdAt: true, followUp: { select: { case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } }, assignedStaff: staffSelect } } } } },
    }),
    prisma.arrivalCheckIn.count({ where }),
  ]);
  return {
    kind: 'arrival_issue',
    total,
    items: rows.map((r) => {
      const c = r.followUp.case;
      const since = r.answeredAt ?? r.createdAt;
      return {
        id: `arrival_issue:${r.id}`,
        kind: 'arrival_issue' as const,
        title: name(c.client) || c.number,
        subtitle: join(c.number, ((r.topics as string[] | null) ?? []).join(', ') || null, r.comment),
        note: { key: `checkIn.${r.audience}`, params: { days: r.offsetDays } },
        priority: 'URGENT' as const,
        dueAt: new Date(since.getTime() + DAY),
        since,
        link: caseLink(c.id),
        refs: { caseId: c.id, caseNumber: c.number, checkInId: r.id },
        assignee: person(c.assignedStaff),
        actions: [
          { key: 'resolve', label: 'resolveIssue', type: 'api' as const, method: 'POST' as const, endpoint: `/admin/check-ins/${r.id}/resolve`, body: {}, primary: true, confirm: true },
          open(caseLink(c.id)),
        ],
      };
    }),
  };
};

/** Embassy packages waiting for the viewer's four-eyes review (assigned to them, or unassigned and asked by someone else). */
const embassyReviews = async (ctx: Ctx): Promise<Source> => {
  const where: Prisma.EmbassyPackageApprovalWhereInput = ctx.team
    ? { status: 'PENDING' }
    : { status: 'PENDING', requestedById: { not: ctx.viewer.id }, OR: [{ reviewerId: ctx.viewer.id }, { reviewerId: null }] };
  const [rows, total] = await Promise.all([
    prisma.embassyPackageApproval.findMany({ where, orderBy: { requestedAt: 'asc' }, take: LIMIT_PER_KIND }),
    prisma.embassyPackageApproval.count({ where }),
  ]);
  const ids = [...new Set(rows.flatMap((r) => [r.requestedById, r.reviewerId]).filter((x): x is string => !!x))];
  const [cases, users] = await Promise.all([
    prisma.case.findMany({ where: { id: { in: rows.map((r) => r.caseId) } }, select: { id: true, number: true, appointmentAt: true, client: { select: { firstName: true, lastName: true } } } }),
    ids.length ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [],
  ]);
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const byUser = new Map(users.map((u) => [u.id, u]));
  return {
    kind: 'embassy_review',
    total,
    items: rows
      .filter((r) => byCase.has(r.caseId))
      .map((r) => {
        const c = byCase.get(r.caseId)!;
        const href = `${caseLink(c.id)}?tab=documents#case-four-eyes`;
        // Due a day before the embassy appointment (else one working day after the request).
        const due = c.appointmentAt ? new Date(c.appointmentAt.getTime() - DAY) : new Date(r.requestedAt.getTime() + DAY);
        return {
          id: `embassy_review:${r.id}`,
          kind: 'embassy_review' as const,
          title: name(c.client) || c.number,
          subtitle: join(c.number, name(byUser.get(r.requestedById))),
          note: { key: 'embassyReview', params: { by: name(byUser.get(r.requestedById)) } },
          priority: c.appointmentAt && c.appointmentAt.getTime() - ctx.c.now.getTime() < 3 * DAY ? ('URGENT' as const) : ('HIGH' as const),
          dueAt: due,
          since: r.requestedAt,
          link: href,
          refs: { caseId: c.id, caseNumber: c.number, approvalId: r.id },
          assignee: person(r.reviewerId ? byUser.get(r.reviewerId) : null),
          actions: [{ key: 'review', label: 'reviewPackage', type: 'link' as const, href, primary: true }],
        };
      }),
  };
};

/** Cases the viewer covers for an absent colleague that carry a handover note or open checklist items. */
const handovers = async (ctx: Ctx): Promise<Source> => {
  const rows = await prisma.caseHandover.findMany({
    where: { status: 'ACTIVE', ...(ctx.team ? {} : { substituteId: ctx.viewer.id }) },
    orderBy: { startedAt: 'asc' },
    select: { id: true, caseId: true, originalStaffId: true, substituteId: true, startedAt: true, plannedEndAt: true, note: true, checklist: true },
  });
  const withNotes = rows.filter((h) => h.note || (Array.isArray(h.checklist) && h.checklist.length));
  const openItems = (h: (typeof rows)[number]) => (Array.isArray(h.checklist) ? (h.checklist as { done?: boolean }[]).filter((x) => !x?.done).length : 0);
  const list = withNotes.slice(0, LIMIT_PER_KIND);
  const [cases, people] = await Promise.all([
    prisma.case.findMany({ where: { id: { in: list.map((h) => h.caseId) } }, select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(list.flatMap((h) => [h.originalStaffId, h.substituteId]))] } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const personOf = new Map(people.map((p) => [p.id, p]));
  return {
    kind: 'handover',
    total: withNotes.length,
    items: list.flatMap((h) => {
      const c = caseOf.get(h.caseId);
      if (!c) return [];
      const n = openItems(h);
      return [
        {
          id: `handover:${h.id}`,
          kind: 'handover' as const,
          title: name(c.client) || c.number,
          subtitle: join(c.number, h.note ? h.note.slice(0, 140) : null),
          note: { key: n ? 'handoverOpen' : 'handoverNote', params: { owner: name(personOf.get(h.originalStaffId)), count: n } },
          priority: n ? ('HIGH' as const) : ('NORMAL' as const),
          dueAt: h.plannedEndAt,
          since: h.startedAt,
          link: `${caseLink(c.id)}#case-handover`,
          refs: { caseId: c.id, caseNumber: c.number, handoverId: h.id },
          assignee: person(personOf.get(h.substituteId)),
          actions: [open(`${caseLink(c.id)}#case-handover`, true)],
        },
      ];
    }),
  };
};

/** Team document workflow: cases a colleague handed to the viewer (assignee) that still wait (In Bearbeitung / Schon geschrieben). */
const processingHandoffs = async (ctx: Ctx): Promise<Source> => {
  const where: Prisma.CaseWhereInput = {
    processingStage: { in: ['IN_PROGRESS', 'WRITTEN'] },
    processingAssigneeId: ctx.team ? { not: null } : ctx.viewer.id,
  };
  const [rows, total] = await Promise.all([
    prisma.case.findMany({
      where,
      orderBy: { processingStageAt: 'asc' },
      take: LIMIT_PER_KIND,
      select: { id: true, number: true, driveFolderId: true, processingStage: true, processingStageAt: true, processingStageById: true, processingAssigneeId: true, updatedAt: true, client: { select: { firstName: true, lastName: true } } },
    }),
    prisma.case.count({ where }),
  ]);
  const ids = [...new Set(rows.flatMap((r) => [r.processingStageById, r.processingAssigneeId]).filter((x): x is string => !!x))];
  const people = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : []).map((u) => [u.id, u]));
  return {
    kind: 'processing',
    total,
    items: rows.map((r) => {
      const since = r.processingStageAt ?? r.updatedAt;
      const caseHref = `${caseLink(r.id)}#case-processing`;
      // The work happens in the client folder of the documents section; the case page stays one click away.
      const href = r.driveFolderId ? `/workspace/drive/f/${encodeURIComponent(r.driveFolderId)}` : caseHref;
      const by = name(r.processingStageById ? people.get(r.processingStageById) : null);
      return {
        id: `processing:${r.id}`,
        kind: 'processing' as const,
        title: name(r.client) || r.number,
        subtitle: join(r.number, by),
        note: { key: 'processing', params: { by: by || '—', stage: stageLabel(r.processingStage) } },
        priority: r.processingStage === 'WRITTEN' ? ('HIGH' as const) : ('NORMAL' as const),
        // One working day to pick it up.
        dueAt: new Date(since.getTime() + DAY),
        since,
        link: href,
        refs: { caseId: r.id, caseNumber: r.number },
        assignee: person(r.processingAssigneeId ? people.get(r.processingAssigneeId) : null),
        actions: r.driveFolderId ? [open(href, true), { key: 'case', label: 'view', type: 'link' as const, href: caseHref }] : [open(href, true)],
      };
    }),
  };
};

// ─── Assembly ─────────────────────────────────────────────────────────

export const buildMyWork = async (viewer: WorkViewer, opts: { team: boolean; tz?: number; now?: Date }): Promise<WorkResult> => {
  const ctx: Ctx = {
    viewer,
    team: opts.team,
    isAdmin: hasMinRole(viewer.role, 'ADMIN'),
    isSuper: viewer.role === 'SUPER_ADMIN',
    c: clockFor(opts.tz, opts.now),
  };
  const groups = await Promise.all([
    docReviews(ctx),
    caseItems(ctx),
    signatures(ctx),
    tasks(ctx),
    mail(ctx),
    inquiries(ctx),
    bookings(ctx),
    applications(ctx),
    expiring(ctx),
    clientTasksOverdue(ctx),
    ctx.isSuper ? securityAlerts(ctx) : null,
    ctx.isAdmin ? privacyRequests(ctx) : null,
    arrivalIssues(ctx), // post-arrival check-ins
    handovers(ctx), // absence handover notes / checklists
    embassyReviews(ctx), // four-eyes check of embassy packages
    processingHandoffs(ctx), // "X sent you Schon geschrieben" (team document workflow)
    recognitionWork({ status: { not: 'CANCELLED' }, ...myCases(ctx) }, ctx.c.now), // Anerkennung deadlines (lib/recognition/work)
    acceleratedWork({ status: { not: 'CANCELLED' }, ...myCases(ctx) }, ctx.c.now), // § 81a deadlines
    partnerContractWork({ team: ctx.team, viewerId: ctx.viewer.id, isAdmin: ctx.isAdmin }, ctx.c.now), // employer / partner contracts ending (lib/partnerRecords/work)
  ]);
  const sources = groups.flat().filter((s): s is Source => !!s);
  const items = sources.flatMap((s) => s.items.map((d) => finish(d, ctx.c))).sort(compareItems);

  const byKind: Partial<Record<WorkKind, number>> = {};
  const byCategory = Object.fromEntries(WORK_CATEGORIES.map((k) => [k, 0])) as Record<WorkCategory, number>;
  const more: WorkResult['more'] = [];
  for (const s of sources) {
    if (!s.total) continue;
    byKind[s.kind] = s.total;
    byCategory[CATEGORY[s.kind]] += s.total;
    if (s.total > s.items.length) more.push({ kind: s.kind, count: s.total - s.items.length, link: MORE_LINK[s.kind] });
  }
  return {
    scope: opts.team ? 'all' : 'mine',
    generatedAt: ctx.c.now.toISOString(),
    items,
    counts: {
      total: Object.values(byKind).reduce((a, b) => a + (b ?? 0), 0),
      urgent: items.filter((i) => i.priority === 'URGENT').length,
      overdue: items.filter((i) => i.overdue).length,
      byKind,
      byCategory,
    },
    more,
  };
};

// ─── Per-user cache (30 s) ────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: WorkResult }>();
const inflight = new Map<string, Promise<WorkResult>>();

export const cachedMyWork = async (viewer: WorkViewer, opts: { team: boolean; tz?: number; fresh?: boolean }): Promise<WorkResult> => {
  const key = `${viewer.id}|${opts.team ? 'all' : 'mine'}|${opts.tz ?? ''}|${viewer.locale}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const pending = !opts.fresh && inflight.get(key);
  if (pending) return pending;
  const p = buildMyWork(viewer, opts)
    .then((value) => {
      if (cache.size >= CACHE_MAX) for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_TTL_MS || cache.size >= CACHE_MAX) cache.delete(k);
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

/** Drops the cached queues of one user (after their own action) — the next read is fresh. */
export const invalidateMyWork = (userId?: string) => {
  if (!userId) return cache.clear();
  for (const k of cache.keys()) if (k.startsWith(`${userId}|`)) cache.delete(k);
};
