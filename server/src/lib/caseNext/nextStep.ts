import type { CaseStatus, DocStage, DocStatus, Locale, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { checklistFor, getCaseAiSettings, STATUTORY, type ChecklistItem } from '../ai/features/caseAi/config.js';
import type { L10n } from '../ai/features/caseAi/texts.js';
import { PACKAGE_EVENT } from './embassyPackage.js';
import { CHANGES_NOTE, fmtDate, fmtDateTime, message, MESSAGE_TEXT, TRANSLATION_TITLE } from './texts.js';

/**
 * "Next step" of a case: 1–3 concrete recommended actions computed by deterministic rules from the case state
 * (status, documents, requirements, contract, appointment, passport, client activity, tasks, time in status).
 * Every action is a button the admin UI runs through an EXISTING endpoint (review, request documents, case
 * message, task, status transition, embassy package). The AI (lib/caseNext/ai.ts) only adds an explanation
 * and a message draft on top. Facts are loaded in batches so the cases list gets a summary per row cheaply.
 */

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

/** Typical days in a status before it counts as slow (case manager experience; DECISION_PENDING per visa category). */
export const TYPICAL_DAYS: Record<CaseStatus, number> = {
  DOCUMENTS_PENDING: 14,
  DOCUMENTS_REVIEW: 2,
  CONTRACT_SENT: 5,
  CONTRACT_SIGNED: 2,
  EMBASSY_DOCUMENTS: 21,
  EMBASSY_REVIEW: 3,
  APPOINTMENT_SCHEDULED: 45,
  DECISION_PENDING: 56,
  APPROVED: 0,
  REJECTED: 0,
  CANCELLED: 0,
};

/** Statuses where the case waits for the client. */
const CLIENT_SIDE: CaseStatus[] = ['DOCUMENTS_PENDING', 'CONTRACT_SENT', 'EMBASSY_DOCUMENTS'];
const TRANSLATION_RE = /(übersetz|uebersetz|translat|tərcümə|tercume|перев)/i;

// ─── Facts ────────────────────────────────────────────────────────

export interface FactDoc {
  id: string;
  name: string;
  status: DocStatus;
  stage: DocStage;
  createdAt: Date;
  byClient: boolean;
  reviewNote: string | null;
}

export interface FactRequirement {
  id: string;
  key: string | null;
  stage: DocStage;
  required: boolean;
  title: L10n;
  docs: FactDoc[];
}

export interface CaseFacts {
  id: string;
  number: string;
  status: CaseStatus;
  visaType: VisaType;
  createdAt: Date;
  statusSince: Date;
  daysInStatus: number;
  typicalDays: number;
  assignedStaffId: string | null;
  client: { id: string; firstName: string; lastName: string; locale: Locale };
  passportExpiry: Date | null;
  plannedEntry: Date;
  appointmentAt: Date | null;
  appointmentPlace: string | null;
  contract: { sentAt: Date; signedAt: Date | null } | null;
  requirements: FactRequirement[];
  lastClientActivityAt: Date | null;
  lastClientMessageAt: Date | null;
  lastStaffMessageAt: Date | null;
  openTasks: number;
  overdueTasks: number;
  packageBuiltAt: Date | null;
  translationOrdered: boolean;
  /** Any document / requirement that looks like a translation. */
  translationPresent: boolean;
  checklist: ChecklistItem[];
  purged: boolean;
}

const l10n = (v: unknown): L10n => {
  const t = (v ?? {}) as Partial<L10n>;
  const fb = t.de || t.en || t.az || t.ru || '';
  return { az: t.az || fb, de: t.de || fb, en: t.en || fb, ru: t.ru || fb };
};

const maxDate = (...ds: (Date | null | undefined)[]) => ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);

/** Facts of several cases with a fixed number of queries (no AI, no file reads). */
export const loadFacts = async (caseIds: string[], opts: { statusSince?: Map<string, Date>; now?: Date } = {}): Promise<CaseFacts[]> => {
  if (!caseIds.length) return [];
  const now = opts.now ?? new Date();
  const ids = [...new Set(caseIds)];
  const [cases, entered, msgs, actorEvents, tasks, packages, translations, settings] = await Promise.all([
    prisma.case.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, number: true, status: true, visaType: true, createdAt: true, clientId: true, assignedStaffId: true, appointmentAt: true, appointmentPlace: true, documentsPurgedAt: true,
        client: { select: { id: true, firstName: true, lastName: true, locale: true, passportExpiry: true } },
        contract: { select: { sentAt: true, signedAt: true } },
        arrivalPlan: { select: { flightDate: true } },
        visaCategory: { select: { processingMax: true } },
        requirements: {
          orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
          select: {
            id: true, key: true, stage: true, required: true, title: true,
            documents: { orderBy: { createdAt: 'desc' }, select: { id: true, originalName: true, status: true, stage: true, createdAt: true, uploadedById: true, reviewNote: true, expiresAt: true } },
          },
        },
        documents: { where: { requirementId: null }, select: { originalName: true } },
      },
    }),
    opts.statusSince
      ? Promise.resolve([] as { caseId: string; toStatus: CaseStatus | null; createdAt: Date }[])
      : prisma.caseEvent.findMany({ where: { caseId: { in: ids }, toStatus: { not: null } }, orderBy: { createdAt: 'desc' }, select: { caseId: true, toStatus: true, createdAt: true } }),
    prisma.caseMessage.groupBy({ by: ['caseId', 'authorId'], where: { caseId: { in: ids } }, _max: { createdAt: true } }),
    prisma.caseEvent.groupBy({ by: ['caseId', 'actorId'], where: { caseId: { in: ids } }, _max: { createdAt: true } }),
    prisma.task.findMany({ where: { caseId: { in: ids }, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } }, select: { caseId: true, dueAt: true } }),
    prisma.caseEvent.groupBy({ by: ['caseId'], where: { caseId: { in: ids }, type: PACKAGE_EVENT }, _max: { createdAt: true } }),
    prisma.translationOrder.groupBy({ by: ['caseId'], where: { caseId: { in: ids }, status: { not: 'CANCELLED' } }, _count: { _all: true } }),
    getCaseAiSettings(),
  ]);

  return cases.map((c) => {
    const since = opts.statusSince?.get(c.id) ?? entered.find((e) => e.caseId === c.id && e.toStatus === c.status)?.createdAt ?? c.createdAt;
    const clientMsg = msgs.find((m) => m.caseId === c.id && m.authorId === c.clientId)?._max.createdAt ?? null;
    const staffMsg = maxDate(...msgs.filter((m) => m.caseId === c.id && m.authorId !== c.clientId).map((m) => m._max.createdAt));
    const clientEvent = actorEvents.find((e) => e.caseId === c.id && e.actorId === c.clientId)?._max.createdAt ?? null;
    const requirements: FactRequirement[] = c.requirements.map((r) => ({
      id: r.id,
      key: r.key,
      stage: r.stage,
      required: r.required,
      title: l10n(r.title),
      docs: c.documentsPurgedAt
        ? []
        : r.documents.map((d) => ({ id: d.id, name: d.originalName, status: d.status, stage: d.stage, createdAt: d.createdAt, byClient: d.uploadedById === c.clientId, reviewNote: d.reviewNote })),
    }));
    const clientUpload = maxDate(...requirements.flatMap((r) => r.docs.filter((d) => d.byClient).map((d) => d.createdAt)));
    const passportDoc = c.requirements.find((r) => r.key === 'PASSPORT')?.documents.find((d) => d.status !== 'REJECTED' && d.expiresAt);
    const passportExpiry = c.client.passportExpiry ?? passportDoc?.expiresAt ?? null;
    const plannedEntry = c.arrivalPlan?.flightDate ?? (c.appointmentAt ? new Date(c.appointmentAt.getTime() + 28 * DAY) : new Date(now.getTime() + (c.visaCategory?.processingMax ?? 12) * 7 * DAY));
    const caseTasks = tasks.filter((t) => t.caseId === c.id);
    const typicalDays = c.status === 'DECISION_PENDING' && c.visaCategory?.processingMax ? c.visaCategory.processingMax * 7 : TYPICAL_DAYS[c.status];
    return {
      id: c.id,
      number: c.number,
      status: c.status,
      visaType: c.visaType,
      createdAt: c.createdAt,
      statusSince: since,
      daysInStatus: Math.floor((now.getTime() - since.getTime()) / DAY),
      typicalDays,
      assignedStaffId: c.assignedStaffId,
      client: { id: c.client.id, firstName: c.client.firstName, lastName: c.client.lastName, locale: c.client.locale },
      passportExpiry,
      plannedEntry,
      appointmentAt: c.appointmentAt,
      appointmentPlace: c.appointmentPlace,
      contract: c.contract,
      requirements,
      lastClientActivityAt: maxDate(clientMsg, clientEvent, clientUpload),
      lastClientMessageAt: clientMsg,
      lastStaffMessageAt: staffMsg,
      openTasks: caseTasks.length,
      overdueTasks: caseTasks.filter((t) => t.dueAt && t.dueAt < now).length,
      packageBuiltAt: packages.find((p) => p.caseId === c.id)?._max.createdAt ?? null,
      translationOrdered: translations.some((t) => t.caseId === c.id && t._count._all > 0),
      translationPresent:
        requirements.some((r) => TRANSLATION_RE.test(Object.values(r.title).join(' ')) || r.key === 'DIPLOMA_TRANSLATION' || r.docs.some((d) => d.status !== 'REJECTED' && TRANSLATION_RE.test(d.name))) ||
        c.documents.some((d) => TRANSLATION_RE.test(d.originalName)),
      checklist: checklistFor(settings, c.visaType),
      purged: !!c.documentsPurgedAt,
    };
  });
};

// ─── Steps and actions ────────────────────────────────────────────

export type RuleCode =
  | 'PASSPORT_EXPIRED'
  | 'PASSPORT_BEFORE_ENTRY'
  | 'APPOINTMENT_PASSED'
  | 'DOCS_TO_REVIEW'
  | 'APPOINTMENT_PACKAGE'
  | 'APPOINTMENT_REMIND'
  | 'UNANSWERED_MESSAGE'
  | 'CONFIRM_CONTRACT'
  | 'SEND_CONTRACT'
  | 'RETURN_FOR_CHANGES'
  | 'BOOK_APPOINTMENT'
  | 'CLIENT_IDLE'
  | 'OVERDUE_TASKS'
  | 'CONTRACT_NOT_SIGNED'
  | 'MISSING_DOCS'
  | 'DECISION_OVERDUE'
  | 'CHECKLIST_GAP'
  | 'TRANSLATION_MISSING'
  | 'STATUS_OVERDUE'
  | 'AWAIT_CLIENT_SUBMIT'
  | 'AWAIT_DECISION'
  | 'VISA_APPROVED'
  | 'VISA_REFUSED';

export type ActionId =
  | 'REVIEW_NOW'
  | 'REQUEST_DOCS'
  | 'REMIND_DOCS'
  | 'SEND_MESSAGE'
  | 'ASK_NEW_PASSPORT'
  | 'REQUEST_PASSPORT'
  | 'MARK_LODGED'
  | 'CONFIRM_CONTRACT'
  | 'RETURN_FOR_CHANGES'
  | 'OPEN_ACTIONS'
  | 'OPEN_MESSAGES'
  | 'OPEN_TASKS'
  | 'OPEN_ONBOARDING'
  | 'BUILD_PACKAGE'
  | 'CREATE_TASK'
  | 'REQUEST_TRANSLATION'
  | 'ORDER_TRANSLATION';

export interface ApiCall {
  method: 'POST';
  /** Relative to /api. */
  path: string;
  body: Record<string, unknown>;
}

export type NextAction =
  | { id: ActionId; kind: 'review'; documentIds: string[] }
  | { id: ActionId; kind: 'request'; request: ApiCall; items: L10n[] }
  | { id: ActionId; kind: 'message'; request: ApiCall; draft: string; locale: Locale }
  | { id: ActionId; kind: 'task'; request: ApiCall; title: string }
  | { id: ActionId; kind: 'transition'; request: ApiCall; confirm: true; note?: string }
  | { id: ActionId; kind: 'package' }
  | { id: ActionId; kind: 'scroll'; target: 'case-actions' | 'case-messages' | 'case-tasks' | 'case-onboarding' };

export interface NextStep {
  code: RuleCode;
  /** 0–100, higher first. */
  priority: number;
  tone: 'urgent' | 'action' | 'info';
  params: Record<string, string | number>;
  /** Requirement titles / document names the step is about. */
  items: L10n[];
  actions: NextAction[];
}

const TASK_TEXT: Record<Locale, Record<'appointment' | 'translation' | 'decision' | 'idle' | 'overdue', (n: string) => string>> = {
  az: { appointment: (n) => `Səfirlik görüşü təyin et – ${n}`, translation: (n) => `Diplomun təsdiqli tərcüməsini sifariş et – ${n}`, decision: (n) => `Səfirlikdən qərarın vəziyyətini soruş – ${n}`, idle: (n) => `Müştəriyə zəng et (cavab yoxdur) – ${n}`, overdue: (n) => `Müraciəti irəlilət – ${n}` },
  de: { appointment: (n) => `Botschaftstermin buchen – ${n}`, translation: (n) => `Beglaubigte Übersetzung des Diploms beauftragen – ${n}`, decision: (n) => `Bei der Botschaft nach dem Stand fragen – ${n}`, idle: (n) => `Kunden anrufen (keine Antwort) – ${n}`, overdue: (n) => `Akte voranbringen – ${n}` },
  en: { appointment: (n) => `Book the embassy appointment – ${n}`, translation: (n) => `Order a certified translation of the diploma – ${n}`, decision: (n) => `Ask the embassy about the decision – ${n}`, idle: (n) => `Call the client (no response) – ${n}`, overdue: (n) => `Move the case forward – ${n}` },
  ru: { appointment: (n) => `Записать на приём в посольство – ${n}`, translation: (n) => `Заказать заверенный перевод диплома – ${n}`, decision: (n) => `Узнать в посольстве о решении – ${n}`, idle: (n) => `Позвонить клиенту (нет ответа) – ${n}`, overdue: (n) => `Продвинуть дело – ${n}` },
};

const casePath = (f: CaseFacts, sub: string) => `/admin/cases/${f.id}${sub}`;

const messageAction = (f: CaseFacts, id: ActionId, body: string): NextAction => {
  const draft = message(f.client.locale, f.client.firstName, body);
  return { id, kind: 'message', request: { method: 'POST', path: casePath(f, '/messages'), body: { body: draft } }, draft, locale: f.client.locale };
};

const requestAction = (f: CaseFacts, id: ActionId, items: { requirementId?: string; requirementKey?: string; title: L10n }[]): NextAction => ({
  id,
  kind: 'request',
  request: { method: 'POST', path: casePath(f, '/next-step/request-documents'), body: { items: items.map((i) => (i.requirementId ? { requirementId: i.requirementId } : { requirementKey: i.requirementKey, title: i.title })) } },
  items: items.map((i) => i.title),
});

const taskAction = (f: CaseFacts, kind: keyof (typeof TASK_TEXT)['de'], staffLocale: Locale, dueInDays = 1, now = new Date()): NextAction => {
  const title = TASK_TEXT[staffLocale][kind](`${f.number} ${f.client.firstName} ${f.client.lastName}`.trim());
  return {
    id: kind === 'translation' ? 'ORDER_TRANSLATION' : 'CREATE_TASK',
    kind: 'task',
    title,
    request: {
      method: 'POST',
      path: '/tasks',
      body: { title: title.slice(0, 200), caseId: f.id, priority: 'HIGH', dueAt: new Date(now.getTime() + dueInDays * DAY).toISOString(), assigneeIds: f.assignedStaffId ? [f.assignedStaffId] : [] },
    },
  };
};

const transition = (f: CaseFacts, id: ActionId, body: Record<string, unknown>, note?: string): NextAction => ({ id, kind: 'transition', confirm: true, request: { method: 'POST', path: casePath(f, '/actions'), body }, ...(note ? { note } : {}) });

const latest = (r: FactRequirement) => r.docs[0] ?? null;
const hasAccepted = (r: FactRequirement) => r.docs.some((d) => d.status === 'ACCEPTED');
const hasLive = (r: FactRequirement) => r.docs.some((d) => d.status !== 'REJECTED');

/** All matching rules of one case, highest priority first. */
export const computeSteps = (f: CaseFacts, opts: { now?: Date; staffLocale?: Locale } = {}): NextStep[] => {
  const now = opts.now ?? new Date();
  const staffLocale = opts.staffLocale ?? 'az';
  const L = f.client.locale;
  const T = MESSAGE_TEXT[L] ?? MESSAGE_TEXT.de;
  const steps: NextStep[] = [];
  const add = (s: Omit<NextStep, 'items' | 'params'> & { items?: L10n[]; params?: NextStep['params'] }) => steps.push({ items: [], params: {}, ...s });
  const final = FINAL_STATUSES.includes(f.status);
  const slow = f.typicalDays > 0 && f.daysInStatus > f.typicalDays;
  const daysSince = (d: Date | null) => (d ? Math.floor((now.getTime() - d.getTime()) / DAY) : null);

  if (f.status === 'CANCELLED') return [];
  if (f.status === 'APPROVED') {
    add({ code: 'VISA_APPROVED', priority: 20, tone: 'info', actions: [{ id: 'OPEN_ONBOARDING', kind: 'scroll', target: 'case-onboarding' }] });
    return steps;
  }
  if (f.status === 'REJECTED') {
    add({ code: 'VISA_REFUSED', priority: 20, tone: 'info', actions: [{ id: 'OPEN_ACTIONS', kind: 'scroll', target: 'case-actions' }] });
    return steps;
  }

  // Passport validity (before the case is lodged at the embassy).
  if (!final && f.status !== 'DECISION_PENDING' && f.passportExpiry) {
    const passportReq = f.requirements.find((r) => r.key === 'PASSPORT');
    const reqItem = passportReq ? [{ requirementId: passportReq.id, title: passportReq.title }] : [];
    const date = fmtDate(f.passportExpiry, L);
    const minValid = new Date(f.plannedEntry.getTime() + STATUTORY.passportMonthsAfterEntry * 30.44 * DAY);
    if (f.passportExpiry < now) {
      add({ code: 'PASSPORT_EXPIRED', priority: 97, tone: 'urgent', params: { date: f.passportExpiry.toISOString() }, actions: [messageAction(f, 'ASK_NEW_PASSPORT', T.passport(date)), ...(reqItem.length ? [requestAction(f, 'REQUEST_PASSPORT', reqItem)] : [])] });
    } else if (f.passportExpiry < minValid) {
      add({ code: 'PASSPORT_BEFORE_ENTRY', priority: 86, tone: 'urgent', params: { date: f.passportExpiry.toISOString(), entry: f.plannedEntry.toISOString() }, actions: [messageAction(f, 'ASK_NEW_PASSPORT', T.passport(date)), ...(reqItem.length ? [requestAction(f, 'REQUEST_PASSPORT', reqItem)] : [])] });
    }
  }

  // Appointment
  if (f.status === 'APPOINTMENT_SCHEDULED' && f.appointmentAt) {
    const ms = f.appointmentAt.getTime() - now.getTime();
    if (ms < -2 * HOUR) {
      add({ code: 'APPOINTMENT_PASSED', priority: 92, tone: 'urgent', params: { days: Math.max(0, Math.floor(-ms / DAY)), date: f.appointmentAt.toISOString() }, actions: [transition(f, 'MARK_LODGED', { action: 'MARK_LODGED' }), { id: 'OPEN_ACTIONS', kind: 'scroll', target: 'case-actions' }] });
    } else if (ms <= 7 * DAY) {
      const days = Math.max(0, Math.ceil(ms / DAY));
      const remind = messageAction(f, 'SEND_MESSAGE', T.appointment(fmtDateTime(f.appointmentAt, L), f.appointmentPlace));
      if (!f.packageBuiltAt || f.packageBuiltAt < f.statusSince) {
        add({ code: 'APPOINTMENT_PACKAGE', priority: days <= 3 ? 90 : 82, tone: days <= 3 ? 'urgent' : 'action', params: { days, date: f.appointmentAt.toISOString() }, actions: [{ id: 'BUILD_PACKAGE', kind: 'package' }, remind] });
      } else {
        add({ code: 'APPOINTMENT_REMIND', priority: 45, tone: 'info', params: { days, date: f.appointmentAt.toISOString() }, actions: [remind] });
      }
    }
  }

  // Documents waiting for staff review
  const pending = f.requirements.filter((r) => r.stage === 'INITIAL' || r.stage === 'EMBASSY').flatMap((r) => r.docs.filter((d) => d.status === 'PENDING').map((d) => ({ d, r })));
  if (pending.length) {
    const reviewStatus = f.status === 'DOCUMENTS_REVIEW' || f.status === 'EMBASSY_REVIEW';
    add({
      code: 'DOCS_TO_REVIEW',
      priority: reviewStatus ? 91 : 72,
      tone: reviewStatus && slow ? 'urgent' : 'action',
      params: { count: pending.length, ...(slow && reviewStatus ? { days: f.daysInStatus, typical: f.typicalDays } : {}) },
      items: pending.slice(0, 6).map(({ r }) => r.title),
      actions: [{ id: 'REVIEW_NOW', kind: 'review', documentIds: pending.map(({ d }) => d.id) }],
    });
  }

  // Unanswered client message
  if (f.lastClientMessageAt && (!f.lastStaffMessageAt || f.lastClientMessageAt > f.lastStaffMessageAt)) {
    const hours = Math.floor((now.getTime() - f.lastClientMessageAt.getTime()) / HOUR);
    add({ code: 'UNANSWERED_MESSAGE', priority: hours >= 24 ? 88 : 76, tone: hours >= 24 ? 'urgent' : 'action', params: { hours }, actions: [{ id: 'OPEN_MESSAGES', kind: 'scroll', target: 'case-messages' }] });
  }

  // Stage-specific workflow steps
  const stageOf: Partial<Record<CaseStatus, DocStage>> = { DOCUMENTS_REVIEW: 'INITIAL', EMBASSY_REVIEW: 'EMBASSY', DOCUMENTS_PENDING: 'INITIAL', EMBASSY_DOCUMENTS: 'EMBASSY' };
  const stage = stageOf[f.status];
  const stageReqs = stage ? f.requirements.filter((r) => r.stage === stage) : [];
  if ((f.status === 'DOCUMENTS_REVIEW' || f.status === 'EMBASSY_REVIEW') && !pending.length) {
    const notAccepted = stageReqs.filter((r) => r.required && !hasAccepted(r));
    if (!notAccepted.length) {
      if (f.status === 'DOCUMENTS_REVIEW') {
        add({ code: 'SEND_CONTRACT', priority: slow ? 89 : 84, tone: slow ? 'urgent' : 'action', params: { days: f.daysInStatus }, actions: [{ id: 'OPEN_ACTIONS', kind: 'scroll', target: 'case-actions' }] });
      } else {
        add({ code: 'BOOK_APPOINTMENT', priority: slow ? 89 : 84, tone: slow ? 'urgent' : 'action', params: { days: f.daysInStatus }, actions: [{ id: 'OPEN_ACTIONS', kind: 'scroll', target: 'case-actions' }, taskAction(f, 'appointment', staffLocale, 1, now), { id: 'BUILD_PACKAGE', kind: 'package' }] });
      }
    } else {
      const lines = notAccepted.map((r) => {
        const d = latest(r);
        const title = r.title[L] || r.title.de;
        return d?.status === 'REJECTED' && d.reviewNote ? `${title}: ${d.reviewNote}` : title;
      });
      const note = CHANGES_NOTE[L](lines).slice(0, 2000);
      add({ code: 'RETURN_FOR_CHANGES', priority: 83, tone: 'action', params: { count: notAccepted.length }, items: notAccepted.map((r) => r.title), actions: [transition(f, 'RETURN_FOR_CHANGES', { action: 'REQUEST_CHANGES', note }, note)] });
    }
  }

  if (f.status === 'CONTRACT_SIGNED') {
    const signedDays = f.contract?.signedAt ? Math.max(0, Math.floor((now.getTime() - f.contract.signedAt.getTime()) / DAY)) : f.daysInStatus;
    add({ code: 'CONFIRM_CONTRACT', priority: slow ? 90 : 85, tone: slow ? 'urgent' : 'action', params: { days: signedDays }, actions: [transition(f, 'CONFIRM_CONTRACT', { action: 'CONFIRM_CONTRACT' }), { id: 'OPEN_ACTIONS', kind: 'scroll', target: 'case-actions' }] });
  }

  if (f.status === 'CONTRACT_SENT' && f.daysInStatus >= 3) {
    add({ code: 'CONTRACT_NOT_SIGNED', priority: f.daysInStatus >= f.typicalDays ? 70 : 62, tone: 'action', params: { days: f.daysInStatus }, actions: [messageAction(f, 'SEND_MESSAGE', T.sign)] });
  }

  // Missing documents while the client uploads
  const missing = (f.status === 'DOCUMENTS_PENDING' || f.status === 'EMBASSY_DOCUMENTS') ? stageReqs.filter((r) => r.required && !hasLive(r)) : [];
  if (missing.length) {
    const titles = missing.map((r) => r.title[L] || r.title.de);
    add({
      code: 'MISSING_DOCS',
      priority: 60 + (slow ? 8 : 0),
      tone: 'action',
      params: { count: missing.length, days: f.daysInStatus },
      items: missing.map((r) => r.title),
      actions: [requestAction(f, 'REMIND_DOCS', missing.map((r) => ({ requirementId: r.id, title: r.title }))), messageAction(f, 'SEND_MESSAGE', T.docs(titles))],
    });
  } else if (f.status === 'DOCUMENTS_PENDING' || f.status === 'EMBASSY_DOCUMENTS') {
    // Everything uploaded, but the client has not pressed "submit for review" yet.
    if (stageReqs.some((r) => r.required) && f.daysInStatus >= 2) add({ code: 'AWAIT_CLIENT_SUBMIT', priority: 40, tone: 'info', params: { days: f.daysInStatus }, actions: [{ id: 'OPEN_MESSAGES', kind: 'scroll', target: 'case-messages' }] });
  }

  // Client silent while the case waits for them
  if (CLIENT_SIDE.includes(f.status)) {
    const idle = daysSince(f.lastClientActivityAt ?? f.statusSince);
    const staffRecent = f.lastStaffMessageAt && now.getTime() - f.lastStaffMessageAt.getTime() < 3 * DAY;
    if (idle !== null && idle >= 7 && !staffRecent) {
      const body = missing.length ? T.docs(missing.map((r) => r.title[L] || r.title.de)) : f.status === 'CONTRACT_SENT' ? T.sign : T.idle;
      add({ code: 'CLIENT_IDLE', priority: 75 + Math.min(10, idle - 7), tone: idle >= 14 ? 'urgent' : 'action', params: { days: idle }, actions: [messageAction(f, 'SEND_MESSAGE', body), taskAction(f, 'idle', staffLocale, 1, now)] });
    }
  }

  // Embassy checklist items that were never requested in this case
  if (f.status === 'EMBASSY_DOCUMENTS' || f.status === 'EMBASSY_REVIEW') {
    const keys = new Set(f.requirements.map((r) => r.key).filter(Boolean));
    const gaps = f.checklist.filter((i) => i.requirementKey && !keys.has(i.requirementKey) && !(i.requirementKey === 'SIGNED_CONTRACT' && f.contract?.signedAt));
    if (gaps.length) {
      add({ code: 'CHECKLIST_GAP', priority: 55, tone: 'action', params: { count: gaps.length }, items: gaps.map((g) => g.label), actions: [requestAction(f, 'REQUEST_DOCS', gaps.map((g) => ({ requirementKey: g.requirementKey!, title: g.label }))), { id: 'BUILD_PACKAGE', kind: 'package' }] });
    }
  }

  // Diploma without a German translation (skilled-work / training / study visas)
  if ((f.status === 'EMBASSY_DOCUMENTS' || f.status === 'EMBASSY_REVIEW') && ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'STUDY', 'JOB_SEEKER'].includes(f.visaType) && !f.translationPresent && !f.translationOrdered) {
    const diploma = f.requirements.find((r) => r.key === 'DIPLOMA' && hasLive(r));
    if (diploma) {
      const title = TRANSLATION_TITLE(diploma.title);
      add({
        code: 'TRANSLATION_MISSING',
        priority: 52,
        tone: 'action',
        items: [diploma.title],
        actions: [requestAction(f, 'REQUEST_TRANSLATION', [{ requirementKey: 'DIPLOMA_TRANSLATION', title }]), taskAction(f, 'translation', staffLocale, 3, now), messageAction(f, 'SEND_MESSAGE', T.translation(diploma.title[L] || diploma.title.de))],
      });
    }
  }

  if (f.overdueTasks > 0) add({ code: 'OVERDUE_TASKS', priority: 68, tone: 'action', params: { count: f.overdueTasks }, actions: [{ id: 'OPEN_TASKS', kind: 'scroll', target: 'case-tasks' }] });

  if (f.status === 'DECISION_PENDING') {
    if (slow) add({ code: 'DECISION_OVERDUE', priority: 58, tone: 'action', params: { days: f.daysInStatus, typical: f.typicalDays }, actions: [taskAction(f, 'decision', staffLocale, 1, now), { id: 'OPEN_ACTIONS', kind: 'scroll', target: 'case-actions' }] });
    else add({ code: 'AWAIT_DECISION', priority: 15, tone: 'info', params: { days: f.daysInStatus, typical: f.typicalDays }, actions: [{ id: 'OPEN_ACTIONS', kind: 'scroll', target: 'case-actions' }] });
  }

  // Slow in a staff-side status with nothing more specific to do.
  if (slow && !steps.some((s) => s.priority >= 80) && ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'].includes(f.status)) {
    add({ code: 'STATUS_OVERDUE', priority: 64, tone: 'action', params: { days: f.daysInStatus, typical: f.typicalDays }, actions: [taskAction(f, 'overdue', staffLocale, 1, now)] });
  }

  return steps.sort((a, b) => b.priority - a.priority);
};

export interface NextStepView {
  caseId: string;
  status: CaseStatus;
  /** The top 3. */
  steps: NextStep[];
  /** Further matching rules (shown on "more"). */
  rest: NextStep[];
  total: number;
  clientLocale: Locale;
  daysInStatus: number;
  typicalDays: number;
  generatedAt: string;
}

export const nextStepView = (f: CaseFacts, opts: { now?: Date; staffLocale?: Locale } = {}): NextStepView => {
  const all = computeSteps(f, opts);
  return { caseId: f.id, status: f.status, steps: all.slice(0, 3), rest: all.slice(3), total: all.length, clientLocale: f.client.locale, daysInStatus: f.daysInStatus, typicalDays: f.typicalDays, generatedAt: (opts.now ?? new Date()).toISOString() };
};

export const nextStepFor = async (caseId: string, opts: { now?: Date; staffLocale?: Locale } = {}) => {
  const [f] = await loadFacts([caseId], { now: opts.now });
  return f ? { facts: f, view: nextStepView(f, opts) } : null;
};

/** Compact summary for list rows (rules only). */
export interface NextStepSummary {
  code: RuleCode;
  tone: NextStep['tone'];
  params: NextStep['params'];
  more: number;
}

export const nextStepSummaries = async (caseIds: string[], opts: { statusSince?: Map<string, Date>; now?: Date } = {}) => {
  const facts = await loadFacts(caseIds, opts);
  const out = new Map<string, NextStepSummary | null>();
  for (const f of facts) {
    const steps = computeSteps(f, { now: opts.now });
    out.set(f.id, steps[0] ? { code: steps[0].code, tone: steps[0].tone, params: steps[0].params, more: steps.length - 1 } : null);
  }
  return out;
};
