import type { Prisma } from '@prisma/client';
import { FINAL_STATUSES } from './caseFlow.js';

/**
 * "Waits for staff action" of a case, shown as an orange badge in the cases list, in the case page header and as the
 * count on the admin sidebar item "Müraciətlər" (GET /admin/cases/attention-count, restricted to the viewer's case scope).
 *
 *   CLIENT_SIGNED  the client signed the contract and Triad Vision has to sign / approve it
 *   DOCS_REVIEW    uploaded documents wait for the review
 *
 * The list badge derives the kind from the case's "ball in court" (same facts as the queue "Bu günün işləri");
 * the count uses the equivalent database conditions below (no per-case computation).
 */
export type AttentionKind = 'CLIENT_SIGNED' | 'DOCS_REVIEW';

const SIGNATURE_REASONS = new Set(['TRIAD_SIGN_CONTRACT', 'CHECK_SIGNATURE', 'APPROVE_WORK_CONTRACT']);

export const attentionOfBall = (ball: { side: string; reason: string } | null | undefined): AttentionKind | null => {
  if (!ball || ball.side !== 'TEAM') return null;
  if (SIGNATURE_REASONS.has(ball.reason)) return 'CLIENT_SIGNED';
  if (ball.reason === 'REVIEW_DOCS') return 'DOCS_REVIEW';
  return null;
};

/** Open cases that wait for staff action (combine with the viewer's case scope). */
export const attentionWhere = (): Prisma.CaseWhereInput => ({
  status: { notIn: FINAL_STATUSES },
  OR: [
    // documents to review
    { status: { in: ['DOCUMENTS_REVIEW', 'EMBASSY_REVIEW'] }, documents: { some: { status: 'PENDING', stage: { in: ['INITIAL', 'EMBASSY'] } } } },
    // V2 Əmək müqaviləsi: the client signed first, Triad Vision has to sign next
    { status: 'CONTRACT_SENT', signatureRequests: { some: { contractKind: { not: null }, status: 'SENT', signers: { some: { role: 'CANDIDATE', status: 'SIGNED' } } } } },
    // signed by everyone, waiting for the approval
    { status: { in: ['CONTRACT_SENT', 'CONTRACT_SIGNED'] }, signatureRequests: { some: { contractKind: { not: null }, status: 'COMPLETED', approvedAt: null } } },
  ],
});

/**
 * Sidebar count on "Müraciətlər": cases waiting for staff action PLUS open cases created since the staff member last
 * opened the cases list. One query condition, so a case in both groups counts once (combine with the case scope).
 */
export const casesNavWhere = (since: Date): Prisma.CaseWhereInput => ({
  OR: [attentionWhere(), { status: { notIn: FINAL_STATUSES }, createdAt: { gt: since } }],
});
