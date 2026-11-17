import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { OPEN_STATUSES as OPEN_INVOICE } from '../billing/math.js';

/**
 * Stage-based client portal: which of the many portal tools a client sees prominently (the portal
 * navigation and the home "for this stage" grid). Everything else stays reachable under "All tools"
 * (/account/all) and by deep link; nothing is removed.
 *
 * Single source of truth: the server decides the stage and the featured tools; the client renders
 * them (GET /api/account/stage, also embedded as `portal` in GET /api/account/next-step).
 *
 *   EXPLORING    no case yet (phase LEAD)
 *   APPLYING     an open case before the visa decision (phases PREPARING, AT_EMBASSY)
 *   DEPARTURE    visa approved, not in Germany yet (phase TRAVEL)
 *   IN_GERMANY   arrived (renewals / family cases still show their documents)
 *   CLOSED       every case rejected / cancelled
 *
 * The finer `phase` is the one the portal used before (client/src/lib/portalStage.ts derivePortalStage):
 * same algorithm, so headers and sub-pages keep their wording.
 */

export type PortalPhase = 'LEAD' | 'PREPARING' | 'AT_EMBASSY' | 'TRAVEL' | 'IN_GERMANY' | 'CLOSED';
export type PortalStage = 'EXPLORING' | 'APPLYING' | 'DEPARTURE' | 'IN_GERMANY' | 'CLOSED';

/**
 * Every portal tool, by stable key. The client catalogue (client/src/lib/portalTools.ts) maps each key to
 * its route, group and copy; tests/unit/portalStage.server.test.ts keeps both lists in sync.
 */
export const PORTAL_TOOLS = [
  // application
  'cases',
  'documents',
  'checklist',
  'signatures',
  'payments',
  'messages',
  'family',
  // learning & preparation
  'german',
  'germanyReady',
  'interviewPrep',
  'course',
  'waitingRoom',
  'readiness',
  'badges',
  'guides',
  // jobs
  'interviews',
  'jobs',
  'savedJobs',
  'externalJobs',
  'cv',
  'letters',
  // departure
  'arrivalPrep',
  'arrivalPlan',
  'arrivalCard',
  'housing',
  'budget',
  'futureLetter',
  'pocketGuide',
  'emergencyWallpaper',
  'visaStory',
  // in Germany
  'onboarding',
  'payslip',
  'letterExplain',
  'rateAlerts',
  'vault',
  'ruleChanges',
  'residenceCard',
  // account
  'profile',
  'notifications',
  'privacy',
  'referral',
] as const;
export type PortalTool = (typeof PORTAL_TOOLS)[number];

/** At most this many featured tools (plus Home and "All tools" in the navigation). */
export const MAX_FEATURED = 7;

const PREPARING: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS'];
const AT_EMBASSY: CaseStatus[] = ['EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'];

export interface StageCase {
  status: CaseStatus;
  parentCaseId?: string | null;
}

const openPhase = (s: CaseStatus): PortalPhase | null => (PREPARING.includes(s) ? 'PREPARING' : AT_EMBASSY.includes(s) ? 'AT_EMBASSY' : null);

/**
 * Pure: the client's phase. In Germany beats everything; an open main application beats an older
 * approval; an approval waiting for travel beats open family-member cases.
 */
export const derivePhase = (cases: readonly StageCase[], arrived: boolean): PortalPhase => {
  if (!cases.length) return 'LEAD';
  if (arrived) return 'IN_GERMANY';
  const main = cases.find((c) => !c.parentCaseId && !FINAL_STATUSES.includes(c.status));
  if (main) return openPhase(main.status) ?? 'PREPARING';
  if (cases.some((c) => c.status === 'APPROVED')) return 'TRAVEL';
  const member = cases.find((c) => !FINAL_STATUSES.includes(c.status));
  if (member) return openPhase(member.status) ?? 'PREPARING';
  return 'CLOSED';
};

export const STAGE_OF_PHASE: Record<PortalPhase, PortalStage> = {
  LEAD: 'EXPLORING',
  PREPARING: 'APPLYING',
  AT_EMBASSY: 'APPLYING',
  TRAVEL: 'DEPARTURE',
  IN_GERMANY: 'IN_GERMANY',
  CLOSED: 'CLOSED',
};

/** The base selection per phase, most relevant first (4–7 each). */
export const PHASE_TOOLS: Record<PortalPhase, readonly PortalTool[]> = {
  LEAD: ['savedJobs', 'cv', 'german', 'interviewPrep', 'readiness', 'guides'],
  PREPARING: ['documents', 'checklist', 'messages', 'german', 'interviewPrep', 'cv', 'readiness'],
  AT_EMBASSY: ['messages', 'interviewPrep', 'documents', 'german', 'waitingRoom', 'readiness', 'checklist'],
  TRAVEL: ['arrivalPrep', 'arrivalPlan', 'messages', 'futureLetter', 'pocketGuide', 'emergencyWallpaper', 'visaStory'],
  IN_GERMANY: ['onboarding', 'messages', 'payslip', 'letterExplain', 'rateAlerts', 'germanyReady', 'vault'],
  CLOSED: ['cases', 'messages', 'savedJobs', 'cv', 'german', 'guides'],
};

export interface StageContext {
  /** Signature requests waiting for the client (their turn). */
  pendingSignatures: number;
  /** Open client invoices. */
  openInvoices: number;
  /** A case is still open (renewal, family member) — in Germany its documents stay up front. */
  hasOpenCase: boolean;
  /** Open document actions on a case (upload / fix / submit / contract). */
  openDocActions: boolean;
  /** Employer interviews to book, confirm or attend. */
  interviewsAhead: boolean;
}

export const EMPTY_CONTEXT: StageContext = { pendingSignatures: 0, openInvoices: 0, hasOpenCase: false, openDocActions: false, interviewsAhead: false };

/**
 * Pure: the featured tools of a phase. Urgent extras go first (something to sign, an invoice, documents
 * of a case still open in Germany, employer interviews), then the base list; duplicates dropped, capped.
 */
export const featuredTools = (phase: PortalPhase, ctx: StageContext = EMPTY_CONTEXT): PortalTool[] => {
  const urgent: PortalTool[] = [];
  if (ctx.pendingSignatures > 0) urgent.push('signatures');
  if (ctx.openInvoices > 0) urgent.push('payments');
  if (phase === 'IN_GERMANY' && (ctx.hasOpenCase || ctx.openDocActions)) urgent.push('documents');
  if (ctx.interviewsAhead && phase !== 'TRAVEL' && phase !== 'IN_GERMANY') urgent.push('interviews');
  const out: PortalTool[] = [];
  for (const t of [...urgent, ...PHASE_TOOLS[phase]]) if (!out.includes(t)) out.push(t);
  return out.slice(0, MAX_FEATURED);
};

export interface PortalStageInfo {
  stage: PortalStage;
  phase: PortalPhase;
  featured: PortalTool[];
}

/** Pure: stage, phase and featured tools in one. */
export const portalStageOf = (cases: readonly StageCase[], arrived: boolean, ctx: StageContext = EMPTY_CONTEXT): PortalStageInfo => {
  const phase = derivePhase(cases, arrived);
  return { stage: STAGE_OF_PHASE[phase], phase, featured: featuredTools(phase, ctx) };
};

/**
 * Pure: has the client arrived in Germany? Same rule as the next-step card: a post-arrival follow-up whose
 * date has passed, or a completed arrival plan of the approved case.
 */
export const hasArrived = (followUpArrivedAt: Date | null | undefined, planStatus: string | null | undefined, now: Date) =>
  (!!followUpArrivedAt && followUpArrivedAt <= now) || planStatus === 'COMPLETED';

/**
 * GET /api/account/stage: the facts with a handful of small queries (lighter than the full next-step).
 * Works the same while staff "view as client" (req.user is the client then).
 */
export const loadPortalStage = async (userId: string, now = new Date()): Promise<PortalStageInfo & { arrived: boolean }> => {
  const cases = await prisma.case.findMany({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, parentCaseId: true } });
  const approved = cases.find((c) => c.status === 'APPROVED' && !c.parentCaseId) ?? cases.find((c) => c.status === 'APPROVED') ?? null;
  const openIds = cases.filter((c) => !FINAL_STATUSES.includes(c.status)).map((c) => c.id);
  const [followUp, plan, signatures, invoices, invites, interviews, openDocs] = await Promise.all([
    prisma.arrivalFollowUp.findFirst({ where: { clientId: userId }, orderBy: { arrivedAt: 'desc' }, select: { arrivedAt: true } }),
    approved ? prisma.arrivalPlan.findUnique({ where: { caseId: approved.id }, select: { status: true } }) : Promise.resolve(null),
    prisma.signatureSigner.count({ where: { userId, status: { in: ['PENDING', 'VIEWED'] }, request: { status: 'SENT', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } }),
    prisma.clientInvoice.count({ where: { clientId: userId, status: { in: OPEN_INVOICE } } }),
    prisma.interviewInvite.count({ where: { candidateId: userId, status: 'OPEN' } }),
    prisma.interview.count({ where: { candidateId: userId, status: { in: ['PROPOSED', 'CONFIRMED'] }, startsAt: { gt: now } } }),
    // Client-side document work on an open case (statuses where the client uploads / signs).
    openIds.length ? prisma.case.count({ where: { id: { in: openIds }, status: { in: ['DOCUMENTS_PENDING', 'CONTRACT_SENT', 'EMBASSY_DOCUMENTS'] } } }) : Promise.resolve(0),
  ]);
  const arrived = hasArrived(followUp?.arrivedAt, plan?.status, now);
  const info = portalStageOf(cases, arrived, {
    pendingSignatures: signatures,
    openInvoices: invoices,
    hasOpenCase: openIds.length > 0,
    openDocActions: openDocs > 0,
    interviewsAhead: invites + interviews > 0,
  });
  return { ...info, arrived };
};
