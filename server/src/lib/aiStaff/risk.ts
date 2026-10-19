import type { CaseStatus, Locale, Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { riskText } from './texts.js';

/**
 * Risky / stuck case detection — deterministic rules, no AI.
 *
 *   REVIEW_WAITING            documents (or a signed contract) waiting for staff review > 3 days
 *   CLIENT_SILENT             the client has not reacted to a change request > 7 days
 *   NO_ACTIVITY               no activity at all on an open case > 14 days
 *   APPOINTMENT_DOCS_MISSING  embassy appointment in < 7 days and required embassy documents missing
 *   PASSPORT_EXPIRING         the client's passport expires within 6 months (or already expired)
 *   SIGNATURE_EXPIRING        a sent signature request expires within 3 days
 *   TRANSLATION_OVERDUE       a translation order is past its due date
 *
 * `evaluateRisks` is pure (facts + now → risks) and unit-tested; `loadRiskFacts` builds the facts from the DB.
 * Used by the dashboard widget, the daily briefing, the case summary and the admin AI tool `risky_cases`.
 */

export type RiskCode =
  | 'REVIEW_WAITING'
  | 'CLIENT_SILENT'
  | 'NO_ACTIVITY'
  | 'APPOINTMENT_DOCS_MISSING'
  | 'PASSPORT_EXPIRING'
  | 'SIGNATURE_EXPIRING'
  | 'TRANSLATION_OVERDUE';

export type Severity = 'high' | 'medium' | 'low';

export type RiskAction =
  | 'REVIEW_DOCUMENTS'
  | 'REMIND_CLIENT'
  | 'CONTACT_CLIENT'
  | 'CHECK_EMBASSY'
  | 'COLLECT_EMBASSY_DOCS'
  | 'RENEW_PASSPORT'
  | 'REMIND_SIGNER'
  | 'CHASE_TRANSLATION';

export interface Risk {
  code: RiskCode;
  severity: Severity;
  action: RiskAction;
  /** Days waiting / silent / left / overdue, depending on the code. */
  days: number;
  /** Date the risk refers to (YYYY-MM-DD): appointment, expiry, due date … */
  date?: string;
  /** Extra detail: document count, signature title, translation number. */
  detail?: string;
}

export interface RiskFacts {
  caseId: string;
  number: string;
  status: CaseStatus;
  visaType: VisaType;
  clientName: string;
  staffId: string | null;
  staffName: string | null;
  createdAt: Date;
  /** Latest event, message or upload on the case. */
  lastActivityAt: Date;
  /** Since when the case waits for a staff review (null when it does not). */
  reviewWaitingSince: Date | null;
  pendingReviewCount: number;
  /** When staff last sent the case back to the client (change request), if the case is still there. */
  changeRequestAt: Date | null;
  /** Latest upload / message / action of the client. */
  lastClientActivityAt: Date | null;
  appointmentAt: Date | null;
  /** Required embassy requirements without a pending or accepted document. */
  missingEmbassyDocs: number;
  passportExpiresAt: Date | null;
  signatures: { title: string; expiresAt: Date | null }[];
  translations: { number: number; dueAt: Date | null }[];
}

const DAY = 24 * 60 * 60 * 1000;
export const RISK_LIMITS = { reviewDays: 3, silentDays: 7, inactiveDays: 14, appointmentDays: 7, passportDays: 180, signatureDays: 3 } as const;

const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);
const daysUntil = (at: Date, now: Date) => Math.ceil((at.getTime() - now.getTime()) / DAY);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

/** All risks of one case at `now`, most severe first. Closed cases have none. */
export const evaluateRisks = (f: RiskFacts, now = new Date()): Risk[] => {
  if (FINAL_STATUSES.includes(f.status)) return [];
  const out: Risk[] = [];

  if (f.reviewWaitingSince) {
    const d = daysBetween(f.reviewWaitingSince, now);
    if (d > RISK_LIMITS.reviewDays) out.push({ code: 'REVIEW_WAITING', severity: d > 7 ? 'high' : 'medium', action: 'REVIEW_DOCUMENTS', days: d, detail: String(f.pendingReviewCount) });
  }

  if (f.changeRequestAt && (!f.lastClientActivityAt || f.lastClientActivityAt <= f.changeRequestAt)) {
    const d = daysBetween(f.changeRequestAt, now);
    if (d > RISK_LIMITS.silentDays) out.push({ code: 'CLIENT_SILENT', severity: d > 14 ? 'high' : 'medium', action: 'REMIND_CLIENT', days: d, date: iso(f.changeRequestAt) });
  }

  const idle = daysBetween(f.lastActivityAt, now);
  if (idle > RISK_LIMITS.inactiveDays) {
    // Waiting for the embassy's decision is normally quiet: only a low-severity nudge to check the status.
    const waitingEmbassy = f.status === 'DECISION_PENDING';
    out.push({
      code: 'NO_ACTIVITY',
      severity: waitingEmbassy ? 'low' : idle > 30 ? 'high' : 'medium',
      action: waitingEmbassy ? 'CHECK_EMBASSY' : 'CONTACT_CLIENT',
      days: idle,
      date: iso(f.lastActivityAt),
    });
  }

  if (f.appointmentAt && f.appointmentAt > now && f.missingEmbassyDocs > 0) {
    const left = daysUntil(f.appointmentAt, now);
    if (left < RISK_LIMITS.appointmentDays) out.push({ code: 'APPOINTMENT_DOCS_MISSING', severity: 'high', action: 'COLLECT_EMBASSY_DOCS', days: left, date: iso(f.appointmentAt), detail: String(f.missingEmbassyDocs) });
  }

  if (f.passportExpiresAt) {
    const left = daysUntil(f.passportExpiresAt, now);
    if (left <= RISK_LIMITS.passportDays) out.push({ code: 'PASSPORT_EXPIRING', severity: left <= 90 ? 'high' : 'medium', action: 'RENEW_PASSPORT', days: left, date: iso(f.passportExpiresAt) });
  }

  for (const s of f.signatures) {
    if (!s.expiresAt) continue;
    const left = daysUntil(s.expiresAt, now);
    if (left <= RISK_LIMITS.signatureDays) out.push({ code: 'SIGNATURE_EXPIRING', severity: left <= 1 ? 'high' : 'medium', action: 'REMIND_SIGNER', days: left, date: iso(s.expiresAt), detail: s.title });
  }

  for (const t of f.translations) {
    if (!t.dueAt || t.dueAt >= now) continue;
    const late = Math.max(1, daysBetween(t.dueAt, now));
    out.push({ code: 'TRANSLATION_OVERDUE', severity: late > 3 ? 'high' : 'medium', action: 'CHASE_TRANSLATION', days: late, date: iso(t.dueAt), detail: `TR-${String(t.number).padStart(4, '0')}` });
  }

  return out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
};

/** Highest severity of a list (null when empty). */
export const topSeverity = (risks: Risk[]): Severity | null => (risks.length ? risks.reduce((m, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[m] ? r.severity : m), 'low' as Severity) : null);

// ─── Facts from the database ─────────────────────────────────────────────

const REVIEW_STATUSES: CaseStatus[] = ['DOCUMENTS_REVIEW', 'EMBASSY_REVIEW', 'CONTRACT_SIGNED'];
/** Status the case is in after a change request → the review status it came from. */
const CHANGE_REQUEST_FROM: Partial<Record<CaseStatus, CaseStatus>> = { DOCUMENTS_PENDING: 'DOCUMENTS_REVIEW', EMBASSY_DOCUMENTS: 'EMBASSY_REVIEW' };

const factsSelect = {
  id: true,
  number: true,
  status: true,
  visaType: true,
  createdAt: true,
  updatedAt: true,
  appointmentAt: true,
  clientId: true,
  client: { select: { firstName: true, lastName: true, passportExpiry: true } },
  assignedStaff: { select: { id: true, firstName: true, lastName: true } },
  requirements: { where: { stage: 'EMBASSY', required: true }, select: { documents: { select: { status: true } } } },
  documents: { select: { status: true, stage: true, createdAt: true, uploadedById: true, expiresAt: true, requirement: { select: { key: true } } } },
  events: { orderBy: { createdAt: 'desc' }, take: 40, select: { type: true, fromStatus: true, toStatus: true, createdAt: true, actorId: true } },
  messages: { orderBy: { createdAt: 'desc' }, take: 30, select: { authorId: true, createdAt: true } },
  signatureRequests: { where: { status: 'SENT' }, select: { title: true, expiresAt: true } },
  translationOrders: { where: { status: { notIn: ['READY', 'DELIVERED', 'CANCELLED'] }, dueAt: { not: null } }, select: { number: true, dueAt: true } },
} satisfies Prisma.CaseSelect;

type FactsRow = Prisma.CaseGetPayload<{ select: typeof factsSelect }>;

const maxDate = (...ds: (Date | null | undefined)[]) => ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);
const minDate = (...ds: (Date | null | undefined)[]) => ds.reduce<Date | null>((m, d) => (d && (!m || d < m) ? d : m), null);

export const toRiskFacts = (c: FactsRow): RiskFacts => {
  const clientDocs = c.documents.filter((d) => d.uploadedById === c.clientId);
  const clientMsgs = c.messages.filter((m) => m.authorId === c.clientId);
  const clientEvents = c.events.filter((e) => e.actorId === c.clientId);
  const lastClientActivityAt = maxDate(...clientDocs.map((d) => d.createdAt), clientMsgs[0]?.createdAt, clientEvents[0]?.createdAt);
  const lastActivityAt = maxDate(c.createdAt, c.events[0]?.createdAt, c.messages[0]?.createdAt, ...c.documents.map((d) => d.createdAt)) ?? c.createdAt;

  // Since when the case is in its current status (latest event that moved it there).
  const entered = c.events.find((e) => e.toStatus === c.status);
  const pending = clientDocs.filter((d) => d.status === 'PENDING' && (d.stage === 'INITIAL' || d.stage === 'EMBASSY'));
  let reviewWaitingSince: Date | null = null;
  if (REVIEW_STATUSES.includes(c.status) && (pending.length || c.status === 'CONTRACT_SIGNED')) {
    reviewWaitingSince = entered?.createdAt ?? minDate(...pending.map((d) => d.createdAt)) ?? c.updatedAt;
  }

  let changeRequestAt: Date | null = null;
  const from = CHANGE_REQUEST_FROM[c.status];
  if (from && entered && entered.fromStatus === from) changeRequestAt = entered.createdAt;
  if (c.status === 'CONTRACT_SENT' && entered?.type === 'SIGNATURE_REJECTED') changeRequestAt = entered.createdAt;

  const passportDocs = c.documents.filter((d) => d.requirement?.key === 'PASSPORT' && d.status !== 'REJECTED' && d.expiresAt);
  // The newest passport counts (a renewed passport replaces the old one).
  const newestPassport = passportDocs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const passportExpiresAt = newestPassport?.expiresAt ?? c.client.passportExpiry ?? null;

  return {
    caseId: c.id,
    number: c.number,
    status: c.status,
    visaType: c.visaType,
    clientName: `${c.client.firstName} ${c.client.lastName}`.trim(),
    staffId: c.assignedStaff?.id ?? null,
    staffName: c.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}`.trim() : null,
    createdAt: c.createdAt,
    lastActivityAt,
    reviewWaitingSince,
    pendingReviewCount: pending.length,
    changeRequestAt,
    lastClientActivityAt,
    appointmentAt: c.appointmentAt,
    missingEmbassyDocs: c.requirements.filter((r) => !r.documents.some((d) => d.status === 'PENDING' || d.status === 'ACCEPTED')).length,
    passportExpiresAt,
    signatures: c.signatureRequests.map((s) => ({ title: s.title, expiresAt: s.expiresAt })),
    translations: c.translationOrders.map((t) => ({ number: t.number, dueAt: t.dueAt })),
  };
};

export const loadRiskFacts = async (where: Prisma.CaseWhereInput) => (await prisma.case.findMany({ where, select: factsSelect, orderBy: { createdAt: 'asc' }, take: 3000 })).map(toRiskFacts);

export interface RiskyCase {
  caseId: string;
  number: string;
  status: CaseStatus;
  visaType: VisaType;
  clientName: string;
  staff: { id: string; name: string } | null;
  severity: Severity;
  risks: (Risk & { title: string; suggestion: string })[];
}

/** Open cases with at least one risk (optionally of one staff member, 'none' = unassigned), most severe first. */
export const listRiskyCases = async (opts: { staffId?: string | null; minSeverity?: Severity; locale?: Locale; now?: Date; limit?: number } = {}): Promise<RiskyCase[]> => {
  const now = opts.now ?? new Date();
  const locale = opts.locale ?? 'az';
  const where: Prisma.CaseWhereInput = { status: { notIn: FINAL_STATUSES } };
  if (opts.staffId) where.assignedStaffId = opts.staffId === 'none' ? null : opts.staffId;
  const min = SEVERITY_RANK[opts.minSeverity ?? 'low'];
  const out: RiskyCase[] = [];
  for (const f of await loadRiskFacts(where)) {
    const risks = evaluateRisks(f, now).filter((r) => SEVERITY_RANK[r.severity] >= min);
    if (!risks.length) continue;
    out.push({
      caseId: f.caseId,
      number: f.number,
      status: f.status,
      visaType: f.visaType,
      clientName: f.clientName,
      staff: f.staffId ? { id: f.staffId, name: f.staffName ?? '' } : null,
      severity: topSeverity(risks)!,
      risks: risks.map((r) => ({ ...r, ...riskText(r, locale) })),
    });
  }
  out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.risks.length - a.risks.length || a.number.localeCompare(b.number));
  return opts.limit ? out.slice(0, opts.limit) : out;
};
