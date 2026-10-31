import type { ArrivalStatus, CaseStatus, DocStage, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { CLIENT_UPLOAD_STAGE, FINAL_STATUSES } from '../caseFlow.js';
import { ballInCourtFor, type BallInCourt } from '../clientProcess/ballInCourt.js';
import { currentTurn } from '../esign/service.js';
import { isExpired as checkInExpired } from '../checkIns/service.js';
import { forecastForCase, travelRange, travelWindow, type Forecast } from '../journey/forecast.js';
import { normaliseOrigin } from '../marketing/originMap.js';
import { onboardingForCase } from '../journey/onboarding.js';
import { pendingAcceptances } from '../legal/documents.js';
import { getRenewalSettings } from '../renewals/service.js';
import { openInvoicesOf } from '../billing/service.js';
import { isPastDue } from '../billing/math.js';
import { recognitionClientAction } from '../recognition/service.js';
import { documentSummary, profileCompleteness, progressPercent, STATUS_STEP, STEP_COUNT } from '../../routes/account.js';

/**
 * "What is the one thing I should do now?" for the client portal home (GET /api/account/next-step).
 * Collects the client's open items across the case (ball in court: documents, contract, appointment),
 * signatures, data confirmation, questionnaires, client tasks, legal re-acceptance, post-arrival
 * check-ins, the arrival plan, the onboarding checklist and the residence-title renewal, and ranks
 * them: the first one is the big card, the next two are the secondary actions.
 *
 * `pickNextStep` is pure (unit-tested); `loadNextStep` gathers the facts with a fixed set of queries.
 */

export type NextKind =
  | 'ACCEPT_LEGAL'
  | 'PAY_INVOICE'
  | 'FIX_DOCS'
  | 'UPLOAD_DOCS'
  | 'SUBMIT_DOCS'
  | 'SIGN_CONTRACT'
  | 'ATTEND_APPOINTMENT'
  | 'SIGN_DOCUMENTS'
  | 'CONFIRM_DATA'
  | 'FILL_FORM'
  | 'CLIENT_TASK'
  | 'RECOGNITION_DOCS'
  | 'ANSWER_CHECKIN'
  | 'ARRIVAL_PLAN'
  | 'RENEW_RESIDENCE'
  | 'ONBOARDING'
  | 'START_CASE'
  | 'PASSPORT_EXPIRY'
  | 'COMPLETE_PROFILE';

type L10nLike = Record<string, string>;

export interface NextAction {
  kind: NextKind;
  /** Portal route the primary button opens (straight to the action). */
  to: string;
  dueAt: string | null;
  overdue: boolean;
  count: number;
  /** What exactly: a document / form / onboarding title (L10n) or a plain title (task, signature, place). */
  detail: string | L10nLike | null;
}

/** Base rank of each kind (lower = more important). An overdue action jumps right behind ACCEPT_LEGAL. */
export const KIND_RANK: Record<NextKind, number> = {
  ACCEPT_LEGAL: 0,
  // Client invoices: right after legal re-acceptance and overdue items (an overdue invoice is itself an overdue item).
  PAY_INVOICE: 5,
  FIX_DOCS: 10,
  UPLOAD_DOCS: 11,
  SUBMIT_DOCS: 12,
  SIGN_CONTRACT: 13,
  ATTEND_APPOINTMENT: 14,
  SIGN_DOCUMENTS: 15,
  CONFIRM_DATA: 16,
  FILL_FORM: 17,
  CLIENT_TASK: 18,
  // Recognition (Anerkennung): a document the client still has to send (certified translation, certificate …).
  RECOGNITION_DOCS: 19,
  ANSWER_CHECKIN: 20,
  ARRIVAL_PLAN: 21,
  RENEW_RESIDENCE: 22,
  ONBOARDING: 23,
  START_CASE: 30,
  PASSPORT_EXPIRY: 40,
  COMPLETE_PROFILE: 41,
};
const OVERDUE_RANK = 1;
/** Nudges, not tasks: never counted in the "open actions" badge. */
const SOFT: NextKind[] = ['PASSPORT_EXPIRY', 'COMPLETE_PROFILE', 'START_CASE'];

const DAY = 24 * 3600 * 1000;
export const PASSPORT_WARN_DAYS = 180;
export const ONBOARDING_SOON_DAYS = 14;

export interface NextStepFacts {
  now: Date;
  pendingLegal: number;
  hasCases: boolean;
  /** Any case ever approved (then no "start a case" nudge). */
  hasApproved: boolean;
  primary: { id: string; status: CaseStatus; appointmentAt: Date | null; appointmentPlace: string | null } | null;
  ball: Pick<BallInCourt, 'side' | 'items' | 'eta'> | null;
  firstMissingDoc: L10nLike | null;
  firstRejectedDoc: L10nLike | null;
  confirmation: { fields: number } | null;
  forms: { id: string; caseId: string; title: L10nLike; dueAt: Date | null }[];
  signatures: { signerId: string; title: string; expiresAt: Date | null }[];
  tasks: { id: string; caseId: string; title: string; dueAt: Date | null }[];
  checkIns: { id: string; dueAt: Date }[];
  /** Approved case waiting for travel: the arrival plan state (null = not started). */
  arrival: { caseId: string; planStatus: ArrivalStatus | null } | null;
  arrived: boolean;
  onboarding: { open: { title: L10nLike; dueAt: Date | null }[] } | null;
  residence: { caseId: string; expiresAt: Date; leadDays: number; renewalOpened: boolean } | null;
  passportExpiry: Date | null;
  profilePercent: number;
  /** Open client invoices (lib/billing): issued, not fully paid. */
  invoices?: { id: string; number: string; openCents: number; dueAt: Date; overdue: boolean }[];
  /** Running recognition process with checklist items the client provides (lib/recognition): the first one names the card. */
  recognition?: { caseId: string; count: number; key: string; dueAt: Date | null } | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const caseUrl = (id: string, tab?: 'docs' | 'messages', anchor = '') => `/account/cases/${id}${tab ? `?tab=${tab}` : ''}${anchor}`;
const docsUrl = (id: string, status: CaseStatus) => {
  const stage: DocStage | undefined = CLIENT_UPLOAD_STAGE[status];
  return caseUrl(id, 'docs', stage ? `#docs-${stage.toLowerCase()}` : '');
};

/** Pure: every open action of the client, most important first. */
export const collectActions = (f: NextStepFacts): NextAction[] => {
  const now = f.now;
  const out: NextAction[] = [];
  const add = (kind: NextKind, to: string, o: { dueAt?: Date | null; count?: number; detail?: NextAction['detail']; overdue?: boolean } = {}) =>
    out.push({ kind, to, dueAt: iso(o.dueAt), overdue: o.overdue ?? (!!o.dueAt && o.dueAt < now), count: o.count ?? 1, detail: o.detail ?? null });

  if (f.pendingLegal > 0) add('ACCEPT_LEGAL', '/account/privacy#legal', { count: f.pendingLegal });
  if (f.invoices?.length) {
    const first = [...f.invoices].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
    add('PAY_INVOICE', '/account/payments', { count: f.invoices.length, dueAt: first.dueAt, overdue: f.invoices.some((i) => i.overdue), detail: first.number });
  }

  const p = f.primary;
  if (p) {
    for (const b of f.ball?.items ?? []) {
      if (b.side !== 'CLIENT') continue;
      const due = b.dueAt ? new Date(b.dueAt) : null;
      switch (b.reason) {
        case 'FIX_DOCS':
          add('FIX_DOCS', docsUrl(p.id, p.status), { count: b.count, dueAt: due, overdue: b.overdue, detail: f.firstRejectedDoc });
          break;
        case 'UPLOAD_DOCS':
          add('UPLOAD_DOCS', docsUrl(p.id, p.status), { count: b.count, dueAt: due, overdue: b.overdue, detail: f.firstMissingDoc });
          break;
        case 'SUBMIT_DOCS':
          add('SUBMIT_DOCS', docsUrl(p.id, p.status), { count: b.count, dueAt: due, overdue: b.overdue });
          break;
        case 'SIGN_CONTRACT':
          add('SIGN_CONTRACT', caseUrl(p.id, 'docs', '#contract'), { dueAt: due, overdue: b.overdue });
          break;
        case 'ATTEND_APPOINTMENT':
          // The appointment date is not a deadline that can be "overdue" for the client.
          add('ATTEND_APPOINTMENT', caseUrl(p.id, undefined, '#appointment'), { dueAt: p.appointmentAt, overdue: false, detail: p.appointmentPlace });
          break;
        default:
          break; // SIGN_DOCUMENTS / CLIENT_TASKS: listed one by one below
      }
    }
    if (f.confirmation) add('CONFIRM_DATA', `/account/cases/${p.id}/confirm`, { count: f.confirmation.fields });
  }
  for (const form of f.forms) add('FILL_FORM', `/account/cases/${form.caseId}/forms/${form.id}`, { dueAt: form.dueAt, detail: form.title });
  if (f.signatures.length) {
    const one = f.signatures.length === 1 ? f.signatures[0] : null;
    const soonest = f.signatures.reduce<Date | null>((m, s) => (s.expiresAt && (!m || s.expiresAt < m) ? s.expiresAt : m), null);
    add('SIGN_DOCUMENTS', one ? `/account/signatures/${one.signerId}` : '/account/signatures', {
      count: f.signatures.length,
      dueAt: soonest,
      overdue: false, // an expired request is no longer signable, so never "overdue"
      detail: one?.title ?? null,
    });
  }
  for (const task of f.tasks) add('CLIENT_TASK', caseUrl(task.caseId, undefined, '#client-tasks'), { dueAt: task.dueAt, detail: task.title });
  if (f.recognition) add('RECOGNITION_DOCS', caseUrl(f.recognition.caseId, undefined, '#recognition'), { count: f.recognition.count, dueAt: f.recognition.dueAt, detail: f.recognition.key });

  if (f.checkIns.length) {
    const first = [...f.checkIns].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
    add('ANSWER_CHECKIN', `/check-in/${first.id}`, { count: f.checkIns.length, overdue: false });
  }
  if (f.arrival && !f.arrived && (f.arrival.planStatus === null || f.arrival.planStatus === 'DRAFT')) add('ARRIVAL_PLAN', '/account/arrival');
  if (f.residence && !f.residence.renewalOpened && f.residence.expiresAt.getTime() - now.getTime() <= f.residence.leadDays * DAY) {
    add('RENEW_RESIDENCE', caseUrl(f.residence.caseId, 'messages'), { dueAt: f.residence.expiresAt });
  }
  if (f.onboarding?.open.length) {
    // After arrival every open item counts; before it only the ones due soon (prepare the first days).
    const open = [...f.onboarding.open].sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
    const relevant = f.arrived ? open : open.filter((o) => o.dueAt && o.dueAt.getTime() - now.getTime() <= ONBOARDING_SOON_DAYS * DAY);
    if (relevant.length) add('ONBOARDING', '/account/onboarding', { count: relevant.length, dueAt: relevant[0].dueAt, detail: relevant[0].title });
  }
  if (!f.hasApproved && !(p && !FINAL_STATUSES.includes(p.status))) add('START_CASE', '/account#start', { overdue: false });
  if (f.passportExpiry && f.passportExpiry.getTime() - now.getTime() <= PASSPORT_WARN_DAYS * DAY) {
    add('PASSPORT_EXPIRY', '/account/profile', { dueAt: f.passportExpiry, overdue: f.passportExpiry < now });
  }
  if (f.profilePercent < 100 && f.hasCases) add('COMPLETE_PROFILE', '/account/profile', { count: f.profilePercent, overdue: false });

  const rank = (a: NextAction) => (a.overdue && a.kind !== 'ACCEPT_LEGAL' ? OVERDUE_RANK : KIND_RANK[a.kind]);
  const due = (a: NextAction) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity);
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a) - rank(y.a) || due(x.a) - due(y.a) || x.i - y.i)
    .map((x) => x.a);
};

/** Pure: the big card, up to two secondary actions, the waiting state and the badge count. */
export const pickNextStep = (f: NextStepFacts) => {
  const actions = collectActions(f);
  const primary = actions[0] ?? null;
  const secondary = actions.slice(1, 3);
  // Nothing for the client on an open case: say who has it and until when.
  const clientMove = !!primary && !SOFT.includes(primary.kind);
  const waiting =
    !clientMove && f.primary && f.ball && f.ball.side !== 'CLIENT'
      ? { side: f.ball.side, expectedBy: f.ball.eta?.expectedBy ?? null }
      : null;
  return { primary, secondary, waiting, actionCount: actions.filter((a) => !SOFT.includes(a.kind)).length };
};

// ─── Data ──────────────────────────────────────────────────────────────

const caseSelect = {
  id: true,
  number: true,
  status: true,
  visaType: true,
  parentCaseId: true,
  createdAt: true,
  decisionAt: true,
  visaValidFrom: true,
  appointmentAt: true,
  appointmentPlace: true,
  residenceTitleExpiresAt: true,
  renewalCaseCreatedAt: true,
  // German destination of the portal journey map (employer city, else the vacancy city).
  company: { select: { city: true } },
  vacancy: { select: { city: true } },
} as const;

/** The case the portal is about: the open main application, else an open member case, else the latest approval, else the latest. */
export const choosePrimary = <C extends { status: CaseStatus; parentCaseId: string | null }>(cases: C[]): C | null =>
  cases.find((c) => !FINAL_STATUSES.includes(c.status) && !c.parentCaseId) ??
  cases.find((c) => !FINAL_STATUSES.includes(c.status)) ??
  cases.find((c) => c.status === 'APPROVED' && !c.parentCaseId) ??
  cases.find((c) => c.status === 'APPROVED') ??
  cases[0] ??
  null;

export const loadNextStep = async (userId: string, now = new Date(), opts: { caseId?: string } = {}) => {
  const [user, cases, legal] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.case.findMany({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: caseSelect }),
    pendingAcceptances(userId),
  ]);
  // Family switcher: a chosen case of the same client wins over the automatic choice.
  const primary = (opts.caseId && cases.find((c) => c.id === opts.caseId)) || choosePrimary(cases);
  const open = primary && !FINAL_STATUSES.includes(primary.status) ? primary : null;
  const approved = cases.find((c) => c.status === 'APPROVED' && !c.parentCaseId) ?? cases.find((c) => c.status === 'APPROVED') ?? null;
  const caseIds = cases.map((c) => c.id);

  const [ball, requirements, conf, forms, signers, tasks, followUp, plan, checkIns, unreadMessages, unreadNotifications, invoices, billedCount] = await Promise.all([
    open ? ballInCourtFor(open.id) : Promise.resolve(null),
    open
      ? prisma.documentRequirement.findMany({
          where: { caseId: open.id },
          select: { id: true, stage: true, title: true, required: true, sortOrder: true, documents: { select: { status: true, reviewNote: true, createdAt: true } } },
        })
      : Promise.resolve([]),
    open ? prisma.dataConfirmation.findFirst({ where: { caseId: open.id, status: { not: 'CANCELLED' } }, orderBy: { requestedAt: 'desc' } }) : Promise.resolve(null),
    caseIds.length
      ? prisma.caseForm.findMany({ where: { caseId: { in: caseIds }, status: { in: ['SENT', 'DRAFT'] } }, orderBy: { sentAt: 'desc' }, select: { id: true, caseId: true, title: true, dueAt: true } })
      : Promise.resolve([]),
    prisma.signatureSigner.findMany({
      where: { userId, status: { in: ['PENDING', 'VIEWED'] }, request: { status: 'SENT' } },
      include: { request: { select: { title: true, order: true, expiresAt: true, status: true, isCaseContract: true, caseId: true, signers: { select: { id: true, order: true, status: true } } } } },
      take: 50,
    }),
    caseIds.length
      ? prisma.clientTask.findMany({ where: { caseId: { in: caseIds }, status: 'OPEN' }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }], select: { id: true, caseId: true, title: true, dueAt: true }, take: 20 })
      : Promise.resolve([]),
    prisma.arrivalFollowUp.findFirst({ where: { clientId: userId }, orderBy: { arrivedAt: 'desc' }, select: { caseId: true, arrivedAt: true } }),
    approved ? prisma.arrivalPlan.findUnique({ where: { caseId: approved.id }, select: { status: true, flightDate: true, arrivalTime: true } }) : Promise.resolve(null),
    prisma.arrivalCheckIn.findMany({ where: { audience: 'WORKER', answeredAt: null, sentAt: { not: null }, followUp: { clientId: userId } }, orderBy: { sentAt: 'desc' }, take: 10 }),
    prisma.caseMessage.count({ where: { case: { clientId: userId }, authorId: { not: userId }, readAt: null } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    openInvoicesOf(userId),
    prisma.clientInvoice.count({ where: { clientId: userId, status: { not: 'DRAFT' } } }),
  ]);

  const arrived = (!!followUp && followUp.arrivedAt <= now) || plan?.status === 'COMPLETED';
  const onboardingCase = approved;
  const onboarding = onboardingCase ? await onboardingForCase(onboardingCase) : null;

  // Documents of the open upload step: the first missing / rejected required one names the card ("Upload: Passport").
  const stage = open ? CLIENT_UPLOAD_STAGE[open.status] : undefined;
  const reqs = requirements.filter((r) => r.stage === stage && r.required).sort((a, b) => a.sortOrder - b.sortOrder);
  // Same rule as the workflow: a requirement counts as uploaded while it has a non-rejected file.
  const rejected = reqs.find((r) => r.documents.length > 0 && r.documents.every((d) => d.status === 'REJECTED'));
  const missing = reqs.find((r) => r.documents.length === 0) ?? rejected;

  const mySignatures = signers.filter((s) => {
    const r = s.request;
    if (r.expiresAt && r.expiresAt <= now) return false;
    // The case contract is the SIGN_CONTRACT card while the case waits for it.
    if (r.isCaseContract && open && r.caseId === open.id && open.status === 'CONTRACT_SENT') return false;
    return currentTurn(r.signers, r.order).some((x) => x.id === s.id);
  });

  const renewal = await (approved?.residenceTitleExpiresAt ? getRenewalSettings() : Promise.resolve(null));
  const recognition = await recognitionClientAction(cases.filter((c) => !FINAL_STATUSES.includes(c.status)).map((c) => c.id));
  const facts: NextStepFacts = {
    now,
    pendingLegal: legal.length,
    hasCases: cases.length > 0,
    hasApproved: !!approved,
    primary: open ? { id: open.id, status: open.status, appointmentAt: open.appointmentAt, appointmentPlace: open.appointmentPlace } : null,
    ball: ball ? { side: ball.side, items: ball.items, eta: ball.eta } : null,
    firstMissingDoc: (missing?.title as L10nLike | undefined) ?? null,
    firstRejectedDoc: (rejected?.title as L10nLike | undefined) ?? null,
    confirmation: conf?.status === 'PENDING' ? { fields: Array.isArray(conf.fields) ? conf.fields.length : 0 } : null,
    forms: forms.map((x) => ({ id: x.id, caseId: x.caseId, title: x.title as L10nLike, dueAt: x.dueAt })),
    signatures: mySignatures.map((s) => ({ signerId: s.id, title: s.request.title, expiresAt: s.request.expiresAt })),
    tasks,
    checkIns: checkIns.filter((c) => !checkInExpired(c, now)).map((c) => ({ id: c.id, dueAt: c.dueAt })),
    arrival: approved ? { caseId: approved.id, planStatus: plan?.status ?? null } : null,
    arrived,
    onboarding: onboarding ? { open: onboarding.items.filter((i) => !i.done).map((i) => ({ title: i.title as L10nLike, dueAt: i.dueAt })) } : null,
    residence:
      approved?.residenceTitleExpiresAt && renewal?.enabled !== false
        ? { caseId: approved.id, expiresAt: approved.residenceTitleExpiresAt, leadDays: renewal?.residenceLeadDays ?? 90, renewalOpened: !!approved.renewalCaseCreatedAt }
        : null,
    passportExpiry: user.passportExpiry,
    profilePercent: profileCompleteness(user).percent,
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, openCents: i.grossCents - i.paidCents, dueAt: i.dueDate, overdue: i.status === 'OVERDUE' || isPastDue(i.dueDate, now) })),
    recognition,
  };
  const { actionCount, ...picked } = pickNextStep(facts);

  // Progress of the case the portal is about, and the next date to expect.
  let progress: number | null = null;
  let milestone: { key: string; from: string | null; to: string | null } | null = null;
  // Forecast of the case the portal is about (open or decided): the milestone below and the journey map.
  let fc: Forecast | null = null;
  if (primary) {
    try {
      fc = await forecastForCase(primary.id);
    } catch {
      fc = null; // the forecast is a nice-to-have
    }
  }
  const flight = plan?.arrivalTime ?? plan?.flightDate ?? null;
  // Expected travel / arrival window on the journey map until a flight is booked (decision → arrival history).
  let travelExpected: { from: Date; to: Date } | null = null;
  if (primary && !arrived && !flight && (primary.status === 'APPROVED' || fc?.estimatedDecision)) {
    try {
      const outcome = primary.status === 'APPROVED' ? ('APPROVED' as const) : null;
      travelExpected = travelWindow({ outcome, decisionAt: primary.decisionAt, estimatedDecision: fc?.estimatedDecision ?? null, range: await travelRange(), booked: false, now });
    } catch {
      travelExpected = null; // a nice-to-have like the forecast
    }
  }
  if (primary) {
    if (open) {
      const hasEmbassy = requirements.some((r) => r.stage === 'EMBASSY');
      const docsStage = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'].includes(open.status) || !hasEmbassy ? 'INITIAL' : 'EMBASSY';
      progress = progressPercent(open.status, documentSummary(requirements, docsStage));
      if (fc) {
        const current = fc.steps.find((s) => s.status === 'current');
        if (current?.expectedTo) milestone = { key: current.key, from: iso(current.expectedFrom), to: iso(current.expectedTo) };
        else if (fc.estimatedDecision) milestone = { key: 'DECISION', from: iso(fc.estimatedDecision.from), to: iso(fc.estimatedDecision.to) };
      }
    } else {
      progress = primary.status === 'CANCELLED' ? 0 : 100;
      if (approved && !arrived && flight && flight > now) milestone = { key: 'ARRIVAL', from: null, to: iso(flight) };
      else if (approved?.residenceTitleExpiresAt && arrived) milestone = { key: 'RESIDENCE_EXPIRY', from: null, to: iso(approved.residenceTitleExpiresAt) };
    }
  }

  return {
    case: primary
      ? {
          id: primary.id,
          number: primary.number,
          status: primary.status,
          visaType: primary.visaType as VisaType,
          step: STATUS_STEP[primary.status],
          stepCount: STEP_COUNT,
        }
      : null,
    progress,
    milestone,
    arrived,
    arrivedAt: arrived ? iso(followUp?.arrivedAt ?? null) : null,
    onboarding: onboarding?.progress ?? null,
    journey: primary
      ? buildJourney(user, primary, fc, { flight, arrived, arrivedAt: followUp?.arrivedAt ?? null, travelPlanned: !!plan && plan.status !== 'DRAFT', travelExpected, now })
      : null,
    ...picked,
    counts: {
      actions: actionCount,
      unreadMessages,
      unreadNotifications,
      pendingSignatures: facts.signatures.length,
      pendingLegal: legal.length,
      openCheckIns: facts.checkIns.length,
      openInvoices: invoices.length,
      hasBilling: billedCount > 0,
    },
  };
};

export type NextStepResponse = Awaited<ReturnType<typeof loadNextStep>>;

/**
 * Data of the portal journey map: where the client starts (User.city / nationality, normalised like the
 * public origin map), where in Germany they go (employer / vacancy city) and the dated steps of the case
 * (forecast) plus travel and arrival. The client turns it into milestones (components/portal/journey.ts).
 */
export const buildJourney = (
  user: { city: string | null; nationality: string | null },
  c: {
    status: CaseStatus;
    decisionAt: Date | null;
    appointmentAt?: Date | null;
    appointmentPlace?: string | null;
    company: { city: string | null } | null;
    vacancy: { city: string | null } | null;
  },
  fc: Forecast | null,
  o: { flight: Date | null; arrived: boolean; arrivedAt: Date | null; travelPlanned: boolean; travelExpected?: { from: Date; to: Date } | null; now: Date },
) => {
  const origin = normaliseOrigin(user.city, user.nationality);
  const rawCity = user.city?.trim() || null;
  const dest = c.company?.city?.trim() || c.vacancy?.city?.trim() || null;
  return {
    origin: origin
      ? { country: origin.country, city: origin.city ?? rawCity, lat: origin.lat, lng: origin.lng, exact: !!origin.cityKey }
      : { country: null, city: rawCity, lat: null, lng: null, exact: false },
    destination: { city: dest ? dest.split(',')[0].trim() : null },
    outcome: c.status === 'APPROVED' ? ('APPROVED' as const) : c.status === 'REJECTED' ? ('REJECTED' as const) : c.status === 'CANCELLED' ? ('CANCELLED' as const) : null,
    decisionAt: iso(c.decisionAt),
    steps: (fc?.steps ?? []).map((st) => ({
      key: st.key,
      status: st.status,
      enteredAt: iso(st.enteredAt),
      leftAt: iso(st.leftAt),
      expectedFrom: iso(st.expectedFrom),
      expectedTo: iso(st.expectedTo),
    })),
    // The booked Botschaft appointment (shown on the embassy milestone while it is still ahead or just passed).
    appointment: c.appointmentAt ? { at: iso(c.appointmentAt), place: c.appointmentPlace ?? null } : null,
    travel: {
      at: iso(o.flight),
      planned: o.travelPlanned,
      done: o.arrived || (!!o.flight && o.flight <= o.now),
      expectedFrom: iso(o.travelExpected?.from ?? null),
      expectedTo: iso(o.travelExpected?.to ?? null),
    },
    arrival: { at: iso(o.arrivedAt), done: o.arrived },
  };
};
