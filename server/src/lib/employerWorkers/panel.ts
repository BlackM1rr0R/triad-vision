import type { CaseStatus, CheckInAudience, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { computeForecast, rangesFor, stepOf, type StatusPoint } from '../journey/forecast.js';
import { isExpired as signatureExpired } from '../esign/service.js';
import { getCheckInSettings, ANSWER_TTL_DAYS } from '../checkIns/service.js';
import { RISK_RULES, scoreRisk, type RiskCheckIn, type RiskReason } from '../checkIns/risk.js';
import { listWorkers, plannedArrival, workerSummary, type Stage, type WorkerRow } from '../requests/workers.js';
import { employerAccelerated, employerAcceleratedTodos } from '../recognition/accelerated.js';

/**
 * "My workers" panel of the employer portal (/company/workers) and the data of the monthly employer report.
 *
 * Builds on the stage rows of lib/requests/workers.ts (anonymised name "Ali M.", profession, stage, key dates)
 * and adds only employment-relevant facts the employer needs to plan with:
 *   - phase (in process → travelling → working → left / closed) and the next expected milestone
 *     (visa forecast of lib/journey, embassy appointment, planned arrival, probation end, title expiry);
 *   - arrival date, validity of the visa / residence title (warning at 90 / 30 days), probation end
 *     (EmploymentContract.probationEndsAt, warning at 14 days);
 *   - check-in status: the employer's own answers; for the worker only answered / pending / overdue — never
 *     whether the worker reported a problem, nor topics or comments (so a complaint cannot backfire);
 *   - churn risk level with reasons rewritten in employer-safe wording (no topics, so nothing about health,
 *     homesickness or other private matters);
 *   - open items the employer has to do (documents to sign, forms to complete, check-ins to answer) and the
 *     resulting next action.
 * Never included: passport data, birth data, contact details of the worker, documents of the worker,
 * messages, flight numbers or pickup details.
 */

const DAY = 24 * 60 * 60 * 1000;

export const PHASES = ['IN_PROCESS', 'TRAVELLING', 'WORKING', 'LEFT', 'CLOSED'] as const;
export type Phase = (typeof PHASES)[number];

export type DateWarn = 'OK' | 'WARN' | 'CRITICAL' | 'EXPIRED';
export type CheckInState = 'OK' | 'ISSUE' | 'RESOLVED' | 'ANSWERED' | 'OVERDUE' | 'PENDING';
export const SAFE_RISK_CODES = ['EMPLOYER_FEEDBACK', 'WORKER_FEEDBACK', 'OPEN_ISSUE', 'NO_RESPONSE', 'TREND_WORSE', 'PROBATION_SOON'] as const;
export type SafeRiskCode = (typeof SAFE_RISK_CODES)[number];
export const NEXT_ACTIONS = ['SIGN_DOCUMENT', 'COMPLETE_FORM', 'ACCELERATED_STEP', 'ANSWER_CHECKIN', 'PREPARE_ARRIVAL', 'PROBATION_REVIEW', 'CONFIRM_EMPLOYMENT', 'TALK_TO_MANAGER', 'NONE'] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];
export type MilestoneCode = 'CONTRACT' | 'EMBASSY' | 'APPOINTMENT' | 'DECISION' | 'ARRIVAL' | 'PROBATION_END' | 'TITLE_EXPIRY' | 'CHECKIN';

export const TITLE_WARN_DAYS = 90;
export const TITLE_CRITICAL_DAYS = 30;
export const PROBATION_WARN_DAYS = 14;

export interface OpenItem {
  /** ACCELERATED: § 81a step of the employer (title = SIGN_AGREEMENT | PAY_FEE, translated by the portal). */
  kind: 'SIGNATURE' | 'FORM' | 'CHECKIN' | 'ACCELERATED';
  id: string;
  title: string;
  /** Portal link of the item (sign page / check-in page) when there is one. */
  link: string | null;
  since: Date | null;
}

export interface PanelRow extends WorkerRow {
  phase: Phase;
  position: string;
  arrivedAt: Date | null;
  leftAt: Date | null;
  title: { kind: 'VISA' | 'RESIDENCE'; validUntil: Date; warn: DateWarn; daysLeft: number } | null;
  probation: { endsAt: Date; warn: DateWarn; daysLeft: number } | null;
  contractStart: Date | null;
  checkIn: { employer: CheckInState | null; worker: CheckInState | null; overall: CheckInState | null; lastAt: Date | null };
  risk: { level: 'LOW' | 'MEDIUM' | 'HIGH'; reasons: { code: SafeRiskCode; params?: Record<string, number> }[] } | null;
  next: { code: MilestoneCode; at: Date | null; from: Date | null; to: Date | null } | null;
  openItems: OpenItem[];
  nextAction: NextAction;
  manager: { name: string; email: string } | null;
}

const daysUntil = (d: Date, now: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);

export const titleWarn = (days: number): DateWarn => (days < 0 ? 'EXPIRED' : days <= TITLE_CRITICAL_DAYS ? 'CRITICAL' : days <= TITLE_WARN_DAYS ? 'WARN' : 'OK');
export const probationWarn = (days: number): DateWarn => (days < 0 ? 'EXPIRED' : days <= PROBATION_WARN_DAYS ? 'WARN' : 'OK');

type CheckInLite = { id: string; audience: CheckInAudience; offsetDays: number; dueAt: Date; sentAt: Date | null; answer: 'OK' | 'ISSUE' | null; answeredAt: Date | null; resolvedAt: Date | null; createdAt: Date };

/** Status of the latest sent check-in of one audience (answered OK / issue, resolved, overdue after 7 days, pending). */
export const checkInState = (list: CheckInLite[], now: Date): CheckInState | null => {
  const sent = list.filter((c) => c.sentAt).sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  const last = sent[0];
  if (!last) return null;
  if (last.answer === 'ISSUE') return last.resolvedAt ? 'RESOLVED' : 'ISSUE';
  if (last.answer === 'OK') return 'OK';
  return now.getTime() - last.sentAt!.getTime() > RISK_RULES.noAnswerAfterDays * DAY ? 'OVERDUE' : 'PENDING';
};

/** The worker's side as the employer may see it: answered, pending or overdue — never the answer itself. */
export const workerCheckInState = (list: CheckInLite[], now: Date): CheckInState | null => {
  const s = checkInState(list, now);
  return s === 'OK' || s === 'ISSUE' || s === 'RESOLVED' ? 'ANSWERED' : s;
};

const overallState = (a: CheckInState | null, b: CheckInState | null): CheckInState | null => {
  const order: CheckInState[] = ['ISSUE', 'OVERDUE', 'PENDING', 'RESOLVED', 'ANSWERED', 'OK'];
  for (const s of order) if (a === s || b === s) return s;
  return null;
};

/** Staff-side churn reasons → wording an employer may see (no topics, no counts of the worker's answers). */
export const safeRiskReasons = (raw: unknown): { code: SafeRiskCode; params?: Record<string, number> }[] => {
  const list = Array.isArray(raw) ? (raw as RiskReason[]) : [];
  const out: { code: SafeRiskCode; params?: Record<string, number> }[] = [];
  for (const r of list) {
    const num = (k: string) => (typeof r.params?.[k] === 'number' ? (r.params[k] as number) : undefined);
    if (r.code === 'EMPLOYER_ISSUE') out.push({ code: 'EMPLOYER_FEEDBACK', params: num('count') !== undefined ? { count: num('count')! } : undefined });
    else if (r.code === 'OPEN_ISSUE') out.push({ code: 'OPEN_ISSUE' });
    else if (r.code === 'NO_ANSWER') out.push({ code: 'NO_RESPONSE' });
    else if (r.code === 'TREND_WORSE') out.push({ code: 'TREND_WORSE' });
    else if (r.code === 'PROBATION_SOON') out.push({ code: 'PROBATION_SOON', params: num('days') !== undefined ? { days: num('days')! } : undefined });
  }
  return out.filter((r, i) => out.findIndex((x) => x.code === r.code) === i).map((r) => (r.params ? r : { code: r.code }));
};

const NEXT_STAGE: Partial<Record<Stage, MilestoneCode>> = { DOCUMENTS: 'CONTRACT', CONTRACT: 'EMBASSY', EMBASSY: 'APPOINTMENT', APPOINTMENT: 'DECISION', DECISION: 'DECISION' };

const l10nText = (v: unknown, lang = 'de') => {
  if (!v || typeof v !== 'object') return typeof v === 'string' ? v : '';
  const o = v as Record<string, string>;
  return o[lang] || o.de || o.en || o.az || '';
};

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

/** Everything about the company's cases the panel needs, in a handful of batched queries. */
const loadExtras = async (companyId: string, caseIds: string[]) => {
  if (!caseIds.length) return null;
  const [cases, contracts, followUps, signatures, fills, companyUsers] = await Promise.all([
    prisma.case.findMany({
      where: { id: { in: caseIds }, companyId },
      select: {
        id: true,
        visaCategoryId: true,
        visaType: true,
        status: true,
        visaValidTo: true,
        residenceTitleExpiresAt: true,
        assignedStaff: { select: { firstName: true, lastName: true, email: true, isActive: true } },
        events: { where: { toStatus: { not: null } }, orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
      },
    }),
    prisma.employmentContract.findMany({ where: { caseId: { in: caseIds } }, select: { caseId: true, jobTitle: true, startDate: true, probationEndsAt: true, signedAt: true } }),
    prisma.arrivalFollowUp.findMany({
      where: { caseId: { in: caseIds } },
      select: {
        id: true,
        caseId: true,
        arrivedAt: true,
        leftJobAt: true,
        riskLevel: true,
        riskReasons: true,
        checkIns: { select: { id: true, audience: true, offsetDays: true, dueAt: true, sentAt: true, answer: true, answeredAt: true, resolvedAt: true, createdAt: true, topics: true } },
      },
    }),
    prisma.signatureRequest.findMany({
      where: {
        caseId: { in: caseIds },
        status: { not: 'DRAFT' },
        OR: [{ companyId }, { signers: { some: { role: 'COMPANY', user: { companyId } } } }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        caseId: true,
        title: true,
        status: true,
        order: true,
        isCaseContract: true,
        expiresAt: true,
        sentAt: true,
        completedAt: true,
        finalKey: true,
        signers: { select: { id: true, role: true, status: true, userId: true, order: true, name: true, signedAt: true } },
      },
    }),
    prisma.officialFormFill.findMany({
      where: { caseId: { in: caseIds }, companyId, status: { in: ['SENT_TO_EMPLOYER', 'SIGNED', 'SUBMITTED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, caseId: true, templateId: true, status: true, signatureRequestId: true, fileKey: true, generatedAt: true, updatedAt: true },
    }),
    prisma.user.findMany({ where: { companyId, role: 'COMPANY' }, select: { id: true } }),
  ]);
  const templateIds = [...new Set(fills.map((f) => f.templateId))];
  const templates = templateIds.length ? await prisma.officialFormTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, title: true, key: true } }) : [];
  return {
    cases: new Map(cases.map((c) => [c.id, c])),
    contracts: new Map(contracts.map((c) => [c.caseId, c])),
    followUps: new Map(followUps.map((f) => [f.caseId, f])),
    signatures,
    fills,
    templates: new Map(templates.map((t) => [t.id, t])),
    companyUserIds: new Set(companyUsers.map((u) => u.id)),
  };
};

type Extras = NonNullable<Awaited<ReturnType<typeof loadExtras>>>;

/** Signature requests where a user of this company still has to sign (running, not expired). */
const pendingSignatures = (x: Extras, caseId: string, now: Date): OpenItem[] =>
  x.signatures
    .filter((r) => r.caseId === caseId && r.status === 'SENT' && !signatureExpired(r, now))
    .flatMap((r) => {
      const mine = r.signers.filter((s) => s.role === 'COMPANY' && s.userId && x.companyUserIds.has(s.userId) && (s.status === 'PENDING' || s.status === 'VIEWED'));
      return mine.length ? [{ kind: 'SIGNATURE' as const, id: r.id, title: r.title, link: `/company/contracts/${mine[0].id}`, since: r.sentAt }] : [];
    });

export const buildPanel = async (companyId: string, now = new Date()): Promise<PanelRow[]> => {
  const base = await listWorkers(companyId, now);
  const x = await loadExtras(
    companyId,
    base.map((w) => w.id),
  );
  if (!x) return [];
  const settings = await getCheckInSettings();
  // § 81a accelerated procedure: what the employer still has to do (lib/recognition/accelerated).
  const accelTodos = await employerAcceleratedTodos(
    companyId,
    base.map((w) => w.id),
  );
  // Forecast ranges per (visa category, type): cached in lib/journey, one lookup per distinct pair.
  const rangeCache = new Map<string, Awaited<ReturnType<typeof rangesFor>>>();
  const ranges = async (visaCategoryId: string | null, visaType: Parameters<typeof rangesFor>[1]) => {
    const key = `${visaCategoryId ?? ''}|${visaType}`;
    if (!rangeCache.has(key)) rangeCache.set(key, await rangesFor(visaCategoryId, visaType));
    return rangeCache.get(key)!;
  };

  const rows: PanelRow[] = [];
  for (const w of base) {
    const c = x.cases.get(w.id);
    if (!c) continue;
    const contract = x.contracts.get(w.id) ?? null;
    const f = x.followUps.get(w.id) ?? null;

    const inProcess = ['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION'].includes(w.stage);
    const phase: Phase = f?.leftJobAt
      ? 'LEFT'
      : w.stage === 'REJECTED' || w.stage === 'CANCELLED'
        ? 'CLOSED'
        : w.stage === 'ARRIVED' || (f && c.status === 'APPROVED')
          ? 'WORKING'
          : w.stage === 'APPROVED'
            ? 'TRAVELLING'
            : 'IN_PROCESS';
    const arrivedAt = f?.arrivedAt ?? (w.stage === 'ARRIVED' ? plannedArrival(w) : null);

    // Visa (before / at entry) or residence title (after arrival): whichever applies to the phase.
    const titleDate = phase === 'WORKING' ? (c.residenceTitleExpiresAt ?? c.visaValidTo) : phase === 'TRAVELLING' ? c.visaValidTo : null;
    const titleKind: 'VISA' | 'RESIDENCE' = phase === 'WORKING' && c.residenceTitleExpiresAt ? 'RESIDENCE' : 'VISA';
    const title = titleDate ? { kind: titleKind, validUntil: titleDate, daysLeft: daysUntil(titleDate, now), warn: titleWarn(daysUntil(titleDate, now)) } : null;

    const probation =
      contract?.probationEndsAt && (phase === 'WORKING' || phase === 'TRAVELLING')
        ? { endsAt: contract.probationEndsAt, daysLeft: daysUntil(contract.probationEndsAt, now), warn: probationWarn(daysUntil(contract.probationEndsAt, now)) }
        : null;

    const checkIns = (f?.checkIns ?? []) as CheckInLite[];
    const employerState = checkInState(checkIns.filter((ci) => ci.audience === 'EMPLOYER'), now);
    const workerState = workerCheckInState(checkIns.filter((ci) => ci.audience === 'WORKER'), now);
    const lastAt = checkIns.reduce<Date | null>((a, ci) => (ci.answeredAt && (!a || ci.answeredAt > a) ? ci.answeredAt : a), null);

    // The employer's risk view is scored from the employer's own answers and the probation date only: the
    // staff-side score also weighs the worker's answers, which the employer must not be able to infer.
    const employerRisk = f && !f.leftJobAt ? scoreRisk(checkIns.filter((ci) => ci.audience === 'EMPLOYER') as unknown as RiskCheckIn[], contract?.probationEndsAt ?? null, now) : null;
    const risk = phase === 'WORKING' && employerRisk ? { level: employerRisk.level, reasons: safeRiskReasons(employerRisk.reasons) } : null;

    // Next milestone.
    let next: PanelRow['next'] = null;
    if (inProcess) {
      if (w.stage === 'APPOINTMENT' && w.appointmentAt && w.appointmentAt > now) next = { code: 'APPOINTMENT', at: w.appointmentAt, from: null, to: null };
      else {
        const history: StatusPoint[] = [{ status: 'DOCUMENTS_PENDING' as CaseStatus, at: w.startedAt }, ...c.events.map((e) => ({ status: e.toStatus as CaseStatus, at: e.createdAt }))];
        const fc = computeForecast({ status: c.status, history, ranges: await ranges(c.visaCategoryId, c.visaType), now });
        const cur = fc.steps.find((s) => s.key === stepOf(c.status));
        const code = NEXT_STAGE[w.stage]!;
        const win = code === 'DECISION' ? fc.estimatedDecision : cur?.expectedFrom && cur.expectedTo ? { from: cur.expectedFrom, to: cur.expectedTo } : null;
        next = { code, at: null, from: win?.from ?? null, to: win?.to ?? null };
      }
    } else if (phase === 'TRAVELLING') {
      next = { code: 'ARRIVAL', at: plannedArrival(w), from: null, to: null };
    } else if (phase === 'WORKING') {
      const candidates: { code: MilestoneCode; at: Date }[] = [];
      if (probation && probation.daysLeft >= 0) candidates.push({ code: 'PROBATION_END', at: probation.endsAt });
      if (title && title.daysLeft >= 0) candidates.push({ code: 'TITLE_EXPIRY', at: title.validUntil });
      if (f && settings.enabled) {
        const done = new Set(checkIns.filter((ci) => ci.audience === 'EMPLOYER').map((ci) => ci.offsetDays));
        const due = (settings.employerEnabled ? settings.employerOffsets : []).filter((o) => !done.has(o)).map((o) => new Date(f.arrivedAt.getTime() + o * DAY)).filter((d) => d > now);
        if (due.length) candidates.push({ code: 'CHECKIN', at: due.sort((a, b) => a.getTime() - b.getTime())[0] });
      }
      candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
      if (candidates[0]) next = { code: candidates[0].code, at: candidates[0].at, from: null, to: null };
    }

    // Open items the employer has to do.
    const openItems: OpenItem[] = [...pendingSignatures(x, w.id, now)];
    for (const fill of x.fills.filter((ff) => ff.caseId === w.id && ff.status === 'SENT_TO_EMPLOYER')) {
      // A form sent out for signature is already listed as a signature item.
      if (fill.signatureRequestId && openItems.some((i) => i.id === fill.signatureRequestId)) continue;
      const tpl = x.templates.get(fill.templateId);
      openItems.push({ kind: 'FORM', id: fill.id, title: tpl?.title ?? 'Formular', link: `/company/forms/${fill.id}`, since: fill.generatedAt ?? fill.updatedAt });
    }
    if (phase !== 'LEFT') {
      for (const ci of checkIns.filter((cc) => cc.audience === 'EMPLOYER' && cc.sentAt && !cc.answeredAt && now.getTime() - cc.sentAt.getTime() <= ANSWER_TTL_DAYS * DAY)) {
        openItems.push({ kind: 'CHECKIN', id: ci.id, title: `Check-in ${ci.offsetDays}`, link: `/check-in/${ci.id}`, since: ci.sentAt });
      }
    }

    // id = `<caseId>:<SIGN_AGREEMENT | PAY_FEE>` (the portal translates the code); the title is the German label (reports, CSV).
    for (const a of accelTodos.get(w.id) ?? []) {
      const title = a.todo === 'PAY_FEE' ? 'Gebühr für das beschleunigte Fachkräfteverfahren zahlen' : 'Vereinbarung mit der Ausländerbehörde unterzeichnen';
      openItems.push({ kind: 'ACCELERATED', id: `${w.id}:${a.todo}`, title, link: null, since: a.since });
    }

    const arrival = plannedArrival(w);
    const nextAction: NextAction = openItems.some((i) => i.kind === 'SIGNATURE')
      ? 'SIGN_DOCUMENT'
      : openItems.some((i) => i.kind === 'FORM')
        ? 'COMPLETE_FORM'
        : openItems.some((i) => i.kind === 'ACCELERATED')
          ? 'ACCELERATED_STEP'
        : openItems.some((i) => i.kind === 'CHECKIN')
          ? 'ANSWER_CHECKIN'
          : phase === 'TRAVELLING' && arrival && arrival.getTime() - now.getTime() <= 14 * DAY && arrival > now
            ? 'PREPARE_ARRIVAL'
            : probation && probation.warn === 'WARN'
              ? 'PROBATION_REVIEW'
              : phase === 'WORKING' && title && title.warn !== 'OK'
                ? 'CONFIRM_EMPLOYMENT'
                : risk?.level === 'HIGH'
                  ? 'TALK_TO_MANAGER'
                  : 'NONE';

    const staff = c.assignedStaff?.isActive ? c.assignedStaff : null;
    rows.push({
      ...w,
      phase,
      position: contract?.jobTitle?.trim() || (w.vacancy ? l10nText(w.vacancy.title) : '') || w.profession,
      arrivedAt,
      leftAt: f?.leftJobAt ?? null,
      title,
      probation,
      contractStart: contract?.startDate ?? null,
      checkIn: { employer: employerState, worker: workerState, overall: overallState(employerState, workerState), lastAt },
      risk,
      next,
      openItems,
      nextAction,
      manager: staff ? { name: fullName(staff), email: staff.email } : null,
    });
  }
  return rows;
};

export const panelSummary = (rows: PanelRow[], now = new Date()) => {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    // Keys of the earlier panel stay (inProcess / approved / arrivingThisMonth / arrived).
    ...workerSummary(rows, now),
    travelling: rows.filter((r) => r.phase === 'TRAVELLING').length,
    arrivingThisMonth: rows.filter((r) => {
      const a = plannedArrival(r);
      return r.phase === 'TRAVELLING' && !!a && a >= monthStart && a < monthEnd;
    }).length,
    working: rows.filter((r) => r.phase === 'WORKING').length,
    left: rows.filter((r) => r.phase === 'LEFT').length,
    probationSoon: rows.filter((r) => r.probation?.warn === 'WARN').length,
    titlesExpiring: rows.filter((r) => r.title && r.title.warn !== 'OK').length,
    atRisk: rows.filter((r) => r.risk && r.risk.level !== 'LOW').length,
    openItems: rows.reduce((a, r) => a + r.openItems.length, 0),
  };
};

// ─── Worker detail (drawer) ─────────────────────────────────────────────

export interface TimelineItem {
  code: string;
  at: Date;
  params?: Record<string, string | number>;
}

/** One worker of the company with timeline, upcoming dates, the employer's documents and check-in history. */
export const workerDetail = async (companyId: string, caseId: string, now = new Date()) => {
  const rows = await buildPanel(companyId, now);
  const row = rows.find((r) => r.id === caseId);
  if (!row) return null;
  const [signatures, fills, followUp, contact] = await Promise.all([
    prisma.signatureRequest.findMany({
      where: { caseId, status: { not: 'DRAFT' }, OR: [{ companyId }, { signers: { some: { role: 'COMPANY', user: { companyId } } } }] },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        isCaseContract: true,
        expiresAt: true,
        sentAt: true,
        completedAt: true,
        finalKey: true,
        signers: { select: { id: true, role: true, status: true, userId: true, user: { select: { companyId: true } } } },
      },
    }),
    prisma.officialFormFill.findMany({
      where: { caseId, companyId, status: { in: ['SENT_TO_EMPLOYER', 'SIGNED', 'SUBMITTED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, templateId: true, status: true, fileKey: true, generatedAt: true, updatedAt: true, signatureRequestId: true },
    }),
    prisma.arrivalFollowUp.findUnique({
      where: { caseId },
      select: {
        checkIns: {
          orderBy: { dueAt: 'asc' },
          select: { id: true, audience: true, offsetDays: true, dueAt: true, sentAt: true, answer: true, answeredAt: true, resolvedAt: true, createdAt: true, topics: true, comment: true },
        },
      },
    }),
    prisma.setting.findUnique({ where: { key: 'contact' } }),
  ]);
  const templates = fills.length ? await prisma.officialFormTemplate.findMany({ where: { id: { in: [...new Set(fills.map((f) => f.templateId))] } }, select: { id: true, title: true } }) : [];

  // Timeline: stages, contract signed, arrival, check-ins answered by the employer, left.
  const timeline: TimelineItem[] = row.timeline.map((t) => ({ code: `STAGE_${t.stage}`, at: t.at }));
  for (const s of signatures) if (s.completedAt) timeline.push({ code: s.isCaseContract ? 'CONTRACT_SIGNED' : 'DOCUMENT_SIGNED', at: s.completedAt, params: { title: s.title } });
  if (row.arrivedAt && !timeline.some((t) => t.code === 'STAGE_ARRIVED')) timeline.push({ code: 'STAGE_ARRIVED', at: row.arrivedAt });
  if (row.leftAt) timeline.push({ code: 'LEFT', at: row.leftAt });
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Upcoming dates.
  const upcoming: TimelineItem[] = [];
  const add = (code: string, at: Date | null | undefined, params?: Record<string, string | number>) => {
    if (at && at > now) upcoming.push({ code, at, ...(params ? { params } : {}) });
  };
  if (row.phase === 'IN_PROCESS') {
    add('APPOINTMENT', row.appointmentAt);
    if (row.next?.code === 'DECISION' && row.next.to) add('DECISION', row.next.from ?? row.next.to, { to: row.next.to.toISOString() });
  }
  if (row.phase === 'TRAVELLING' || row.phase === 'IN_PROCESS') add('ARRIVAL', plannedArrival(row));
  add('CONTRACT_START', row.contractStart);
  if (row.probation) add('PROBATION_END', row.probation.endsAt);
  if (row.title) add(row.title.kind === 'RESIDENCE' ? 'RESIDENCE_EXPIRY' : 'VISA_EXPIRY', row.title.validUntil);
  if (row.next?.code === 'CHECKIN') add('CHECKIN', row.next.at);
  upcoming.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Documents the employer may see: own signature requests (download once completed) and official forms.
  const companyUserIds = new Set(signatures.flatMap((s) => s.signers.filter((x) => x.user?.companyId === companyId).map((x) => x.userId!)));
  const documents = [
    ...signatures.map((s) => {
      const status = s.status === 'SENT' && signatureExpired(s, now) ? 'EXPIRED' : s.status;
      const pending = s.signers.find((x) => x.role === 'COMPANY' && x.userId && companyUserIds.has(x.userId) && (x.status === 'PENDING' || x.status === 'VIEWED'));
      return {
        kind: 'SIGNATURE' as const,
        id: s.id,
        title: s.title,
        status,
        isContract: s.isCaseContract,
        date: s.completedAt ?? s.sentAt,
        signLink: status === 'SENT' && pending ? `/company/contracts/${pending.id}` : null,
        downloadable: s.status === 'COMPLETED' && !!s.finalKey,
      };
    }),
    ...fills.map((f) => ({
      kind: 'FORM' as const,
      id: f.id,
      title: templates.find((t) => t.id === f.templateId)?.title ?? 'Formular',
      status: f.status,
      isContract: false,
      date: f.generatedAt ?? f.updatedAt,
      // The employer completes / checks the form on its own page (official forms flow).
      signLink: f.status === 'SENT_TO_EMPLOYER' ? `/company/forms/${f.id}` : null,
      downloadable: !!f.fileKey,
    })),
  ];

  // Check-in history: the employer's own answers in full, the worker's only as a status.
  const checkIns = (followUp?.checkIns ?? [])
    .filter((c) => c.sentAt)
    .map((c) =>
      c.audience === 'EMPLOYER'
        ? {
            id: c.id,
            audience: 'EMPLOYER' as const,
            offsetDays: c.offsetDays,
            dueAt: c.dueAt,
            state: checkInState([c], now),
            answeredAt: c.answeredAt,
            topics: (c.topics as string[] | null) ?? [],
            comment: c.comment,
            link: !c.answeredAt && now.getTime() - c.sentAt!.getTime() <= ANSWER_TTL_DAYS * DAY ? `/check-in/${c.id}` : null,
          }
        : { id: c.id, audience: 'WORKER' as const, offsetDays: c.offsetDays, dueAt: c.dueAt, state: workerCheckInState([c], now), answeredAt: c.answeredAt, topics: [], comment: null, link: null },
    );

  const contactValue = (contact?.value ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    worker: row,
    timeline,
    upcoming,
    documents,
    checkIns,
    contact: { manager: row.manager, office: { phone: str(contactValue.phone), email: str(contactValue.email) } },
    // § 81a accelerated procedure (read-only steps + what the employer has to do), null when none runs.
    accelerated: await employerAccelerated(companyId, caseId),
  };
};

/** The stored file of an employer-visible document (completed signature request / official form), or null. */
export const employerDocumentFile = async (companyId: string, caseId: string, kind: 'signature' | 'form', id: string) => {
  const kase = await prisma.case.findFirst({ where: { id: caseId, companyId }, select: { id: true, number: true } });
  if (!kase) return null;
  if (kind === 'signature') {
    const where: Prisma.SignatureRequestWhereInput = {
      id,
      caseId,
      status: 'COMPLETED',
      OR: [{ companyId }, { signers: { some: { role: 'COMPANY', user: { companyId } } } }],
    };
    const r = await prisma.signatureRequest.findFirst({ where, select: { title: true, finalKey: true } });
    return r?.finalKey ? { key: r.finalKey, name: `${r.title}.pdf` } : null;
  }
  const f = await prisma.officialFormFill.findFirst({ where: { id, caseId, companyId, status: { in: ['SENT_TO_EMPLOYER', 'SIGNED', 'SUBMITTED'] } }, select: { fileKey: true, templateId: true } });
  if (!f?.fileKey) return null;
  const tpl = await prisma.officialFormTemplate.findUnique({ where: { id: f.templateId }, select: { title: true } });
  return { key: f.fileKey, name: `${tpl?.title ?? 'Formular'}.pdf` };
};
