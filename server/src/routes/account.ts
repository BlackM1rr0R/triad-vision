import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { CaseStatus, DocStage, DocStatus, User } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { FINAL_STATUSES } from '../lib/caseFlow.js';
import { parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { publicUser } from './auth.js';

export const accountRouter = Router();
accountRouter.use(requireAuth);

// ─── Profile completeness ──────────────────────────────────────────────

/** Profile fields that help staff match a candidate (name and email are always present). */
export const PROFILE_FIELDS = [
  'phone',
  'birthDate',
  'nationality',
  'city',
  'address',
  'profession',
  'experienceYears',
  'germanLevel',
  'education',
  'about',
] as const satisfies readonly (keyof User)[];

export const profileCompleteness = (u: User) => {
  const missing = PROFILE_FIELDS.filter((f) => {
    const v = u[f];
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  });
  const percent = Math.round(((PROFILE_FIELDS.length - missing.length) / PROFILE_FIELDS.length) * 100);
  return { percent, missing: [...missing] };
};

// ─── Case journey ──────────────────────────────────────────────────────

/** 0..5 = documents, contract, embassy documents, appointment, decision, result; -1 = cancelled. */
export const STATUS_STEP: Record<CaseStatus, number> = {
  DOCUMENTS_PENDING: 0,
  DOCUMENTS_REVIEW: 0,
  CONTRACT_SENT: 1,
  CONTRACT_SIGNED: 1,
  EMBASSY_DOCUMENTS: 2,
  EMBASSY_REVIEW: 2,
  APPOINTMENT_SCHEDULED: 3,
  DECISION_PENDING: 4,
  APPROVED: 5,
  REJECTED: 5,
  CANCELLED: -1,
};
export const STEP_COUNT = 6;

const CLIENT_TURN: CaseStatus[] = ['DOCUMENTS_PENDING', 'CONTRACT_SENT', 'EMBASSY_DOCUMENTS'];
const STAFF_TURN: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'];

type ReqWithDocs = {
  id: string;
  stage: DocStage;
  title: unknown;
  required: boolean;
  sortOrder: number;
  documents: { status: DocStatus; reviewNote: string | null; createdAt: Date }[];
};

type ItemState = 'missing' | 'pending' | 'accepted' | 'rejected';

/** Same rules as the workflow: a requirement counts as uploaded while it has a non-rejected file. */
const requirementState = (r: ReqWithDocs): ItemState => {
  if (r.documents.some((d) => d.status === 'ACCEPTED')) return 'accepted';
  if (r.documents.some((d) => d.status === 'PENDING')) return 'pending';
  if (r.documents.length > 0) return 'rejected';
  return 'missing';
};

/** Which document stage the dashboard summarises for a status. */
const summaryStage = (status: CaseStatus, hasEmbassy: boolean): 'INITIAL' | 'EMBASSY' => {
  if (status === 'DOCUMENTS_PENDING' || status === 'DOCUMENTS_REVIEW' || status === 'CONTRACT_SENT' || status === 'CONTRACT_SIGNED') {
    return 'INITIAL';
  }
  return hasEmbassy ? 'EMBASSY' : 'INITIAL';
};

export const documentSummary = (requirements: ReqWithDocs[], stage: 'INITIAL' | 'EMBASSY') => {
  const reqs = requirements.filter((r) => r.stage === stage).sort((a, b) => a.sortOrder - b.sortOrder);
  const items = reqs.map((r) => {
    const state = requirementState(r);
    const latest = [...r.documents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      id: r.id,
      title: r.title,
      required: r.required,
      state,
      note: state === 'rejected' ? latest?.reviewNote ?? null : null,
    };
  });
  const required = items.filter((i) => i.required);
  return {
    stage,
    total: items.length,
    required: required.length,
    uploaded: items.filter((i) => i.state === 'pending' || i.state === 'accepted').length,
    requiredUploaded: required.filter((i) => i.state === 'pending' || i.state === 'accepted').length,
    accepted: items.filter((i) => i.state === 'accepted').length,
    rejected: items.filter((i) => i.state === 'rejected').length,
    missingRequired: required.filter((i) => i.state === 'missing' || i.state === 'rejected').length,
    items,
  };
};

export type NextActionKind =
  | 'UPLOAD_DOCUMENTS'
  | 'FIX_DOCUMENTS'
  | 'SUBMIT_DOCUMENTS'
  | 'SIGN_CONTRACT'
  | 'PREPARE_APPOINTMENT'
  | 'WAIT_REVIEW'
  | 'WAIT_DECISION'
  | 'VIEW_RESULT'
  | 'CONTACT_MANAGER';

/** The single next thing the client should do, with the case-page anchor it deep-links to. */
export const nextAction = (
  status: CaseStatus,
  docs: ReturnType<typeof documentSummary>,
): { kind: NextActionKind; owner: 'client' | 'staff' | null; anchor: string | null } => {
  const docsAnchor = `#docs-${docs.stage.toLowerCase()}`;
  switch (status) {
    case 'DOCUMENTS_PENDING':
    case 'EMBASSY_DOCUMENTS':
      if (docs.rejected > 0) return { kind: 'FIX_DOCUMENTS', owner: 'client', anchor: docsAnchor };
      if (docs.missingRequired === 0) return { kind: 'SUBMIT_DOCUMENTS', owner: 'client', anchor: docsAnchor };
      return { kind: 'UPLOAD_DOCUMENTS', owner: 'client', anchor: docsAnchor };
    case 'CONTRACT_SENT':
      return { kind: 'SIGN_CONTRACT', owner: 'client', anchor: '#contract' };
    case 'DOCUMENTS_REVIEW':
    case 'EMBASSY_REVIEW':
      return { kind: 'WAIT_REVIEW', owner: 'staff', anchor: docsAnchor };
    case 'CONTRACT_SIGNED':
      return { kind: 'WAIT_REVIEW', owner: 'staff', anchor: '#contract' };
    case 'APPOINTMENT_SCHEDULED':
      return { kind: 'PREPARE_APPOINTMENT', owner: 'client', anchor: '#appointment' };
    case 'DECISION_PENDING':
      return { kind: 'WAIT_DECISION', owner: 'staff', anchor: null };
    case 'APPROVED':
    case 'REJECTED':
      return { kind: 'VIEW_RESULT', owner: null, anchor: '#decision' };
    case 'CANCELLED':
      return { kind: 'CONTACT_MANAGER', owner: null, anchor: '#messages' };
  }
};

/** Overall progress 0..100: completed steps plus a share of the current one. */
export const progressPercent = (status: CaseStatus, docs: ReturnType<typeof documentSummary>) => {
  if (status === 'CANCELLED') return 0;
  if (status === 'APPROVED' || status === 'REJECTED') return 100;
  const step = STATUS_STEP[status];
  let inStep = 0.5;
  if (status === 'DOCUMENTS_PENDING' || status === 'EMBASSY_DOCUMENTS') {
    inStep = docs.required ? 0.5 * ((docs.required - docs.missingRequired) / docs.required) : 0;
  } else if (status === 'CONTRACT_SENT') inStep = 0.25;
  else if (status === 'CONTRACT_SIGNED') inStep = 0.75;
  return Math.round(((step + inStep) / STEP_COUNT) * 100);
};

const caseSummarySelect = {
  id: true,
  number: true,
  profession: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  decisionAt: true,
  visaCategory: { select: { id: true, slug: true, title: true, visaLabel: true } },
} as const;

// ─── Routes ────────────────────────────────────────────────────────────

/** Everything the client dashboard needs, in one request. */
accountRouter.get('/overview', async (req, res) => {
  const userId = req.user!.id;
  const [user, cases, unread, notifications, lastMessage] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.case.findMany({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: caseSummarySelect }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.caseMessage.findFirst({
      where: { case: { clientId: userId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { author: { select: { id: true, firstName: true, lastName: true, role: true } }, case: { select: { number: true } } },
    }),
  ]);

  const activeRow = cases.find((c) => !FINAL_STATUSES.includes(c.status));
  let activeCase = null;
  if (activeRow) {
    const c = await prisma.case.findUniqueOrThrow({
      where: { id: activeRow.id },
      include: {
        assignedStaff: { select: { firstName: true, lastName: true } },
        contract: { select: { version: true, sentAt: true, signedAt: true } },
        requirements: { include: { documents: { select: { status: true, reviewNote: true, createdAt: true } } } },
      },
    });
    const hasEmbassy = c.requirements.some((r) => r.stage === 'EMBASSY');
    const docs = documentSummary(c.requirements, summaryStage(c.status, hasEmbassy));
    activeCase = {
      ...activeRow,
      step: STATUS_STEP[c.status],
      stepCount: STEP_COUNT,
      percent: progressPercent(c.status, docs),
      turn: CLIENT_TURN.includes(c.status) ? 'client' : STAFF_TURN.includes(c.status) ? 'staff' : null,
      nextAction: nextAction(c.status, docs),
      staffNote: c.staffNote,
      documents: docs,
      appointment: c.appointmentAt ? { at: c.appointmentAt, place: c.appointmentPlace } : null,
      manager: c.assignedStaff ? { firstName: c.assignedStaff.firstName, lastName: c.assignedStaff.lastName } : null,
      contract: c.contract,
    };
  }

  res.json({
    user: publicUser(user),
    profile: profileCompleteness(user),
    activeCase,
    cases,
    notifications: { unread, items: notifications },
    lastMessage: lastMessage && {
      id: lastMessage.id,
      caseId: lastMessage.caseId,
      caseNumber: lastMessage.case.number,
      body: lastMessage.body.length > 240 ? `${lastMessage.body.slice(0, 240)}…` : lastMessage.body,
      createdAt: lastMessage.createdAt,
      fromTeam: lastMessage.author.id !== userId,
      author: { firstName: lastMessage.author.firstName, lastName: lastMessage.author.lastName },
    },
  });
});

/** GDPR export: everything stored about the user, as a JSON download (file metadata only, no contents). */
accountRouter.get('/export', async (req, res) => {
  const userId = req.user!.id;
  const [user, cases, notifications, devices] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.case.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'asc' },
      include: {
        visaCategory: { select: { slug: true, title: true, visaLabel: true } },
        assignedStaff: { select: { firstName: true, lastName: true } },
        requirements: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }], select: { id: true, stage: true, title: true, required: true } },
        documents: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, requirementId: true, stage: true, originalName: true, mimeType: true, size: true, status: true, reviewNote: true, createdAt: true },
        },
        contract: {
          select: { version: true, sentAt: true, signedAt: true, signerName: true, signerIp: true, signerUserAgent: true },
        },
        events: {
          where: { visibleToClient: true },
          orderBy: { createdAt: 'asc' },
          select: { type: true, fromStatus: true, toStatus: true, note: true, createdAt: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { body: true, createdAt: true, author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    prisma.pushDevice.findMany({ where: { userId }, select: { platform: true, createdAt: true, lastSeenAt: true } }),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    service: 'Triad Vision',
    profile: { ...publicUser(user), isActive: user.isActive, updatedAt: user.updatedAt },
    cases: cases.map(({ clientId: _clientId, assignedStaffId: _staffId, visaCategoryId: _visaId, messages, ...c }) => ({
      ...c,
      messages: messages.map((m) => ({
        body: m.body,
        createdAt: m.createdAt,
        from: m.author.id === userId ? 'me' : 'Triad Vision',
        authorName: `${m.author.firstName} ${m.author.lastName}`,
      })),
    })),
    notifications,
    devices,
  };

  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="triad-vision-my-data-${day}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(data, null, 2));
});

const deleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  handler: (_req, res) => {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
  },
});

/** Asks staff to delete the account. Nothing is deleted automatically. */
accountRouter.post('/delete-request', deleteLimiter, async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(1000).optional() }), req.body ?? {});
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const activeCases = await prisma.case.findMany({
    where: { clientId: user.id, status: { notIn: FINAL_STATUSES } },
    select: { number: true },
  });
  const lines = [
    `Müştəri hesabının silinməsini istəyir.`,
    `Ad: ${user.firstName} ${user.lastName}\nE-poçt: ${user.email}\nTelefon: ${user.phone ?? '—'}\nİstifadəçi ID: ${user.id}`,
    activeCases.length ? `Aktiv müraciətlər: ${activeCases.map((c) => c.number).join(', ')}` : 'Aktiv müraciət yoxdur.',
    reason ? `Səbəb: ${reason}` : 'Səbəb göstərilməyib.',
  ];
  await notifyStaff(`Hesabın silinməsi sorğusu: ${user.email}`, lines.join('\n\n'), {
    link: '/admin/users',
    type: 'ACCOUNT_DELETE_REQUEST',
  });
  res.json({ ok: true });
});
