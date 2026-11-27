import type { CaseStatus } from '@prisma/client';
import type { ContractTurn } from '../caseContracts/flow.js';
import type { NextAction, NextKind } from './nextStep.js';

/**
 * The plain status line of the client cabinet (home, header next to "Profili tamamla"): what is happening in the
 * current stage and whether something is required from the client — and if so exactly what. Built from the same
 * facts as the next-step card (lib/account/nextStep.ts: ball in court, open actions) and the contract turn
 * (lib/caseContracts/turn), so it never disagrees with them. Pure (unit-tested); the client turns the code into
 * text (i18n `pstatus.*`, six languages).
 *
 *   stage     what is happening (code)
 *   required  true = the stage itself needs the client (sign, upload, fix, submit, attend)
 *   detail    what exactly (document title, appointment date …)
 *   action    the stage needs nothing, but another open task does (signature, form, invoice …): its kind + detail
 */
export type StatusStage =
  | 'NO_CASE'
  | 'FIX_DOCS'
  | 'UPLOAD_DOCS'
  | 'SUBMIT_DOCS'
  | 'DOCS_REVIEW'
  | 'JOB_SEARCH'
  | 'CONTRACT_PREP'
  | 'SIGN_LABOUR'
  | 'LABOUR_TRIAD'
  | 'PAY'
  | 'PAID_PREP'
  | 'WORK_PREP'
  | 'SIGN_WORK'
  | 'WORK_REVIEW'
  | 'EMBASSY_UPLOAD'
  | 'EMBASSY_FIX'
  | 'EMBASSY_SUBMIT'
  | 'EMBASSY_REVIEW'
  | 'APPOINTMENT'
  | 'DECISION'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface StatusLine {
  stage: StatusStage;
  required: boolean;
  detail: string | Record<string, string> | null;
  /** Portal route of the thing to do (stage or other action). */
  to: string | null;
  action: { kind: NextKind; detail: NextAction['detail']; to: string } | null;
}

export interface StatusFacts {
  now: Date;
  primary: { id: string; status: CaseStatus; appointmentAt: Date | null } | null;
  actions: NextAction[];
  /** Files of the case waiting for the team's review. */
  pendingDocs: number;
  /** An employer is linked to the case (never named here: the client may not see it yet). */
  hasEmployer: boolean;
  /** lib/caseContracts/turn for the case (CONTRACT_SENT / V2 CONTRACT_SIGNED); null/undefined = none. */
  contractTurn?: ContractTurn | null;
  /** The İş müqaviləsi documents are all signed by the client and wait for the team's approval (V2). */
  workSigned?: boolean;
  /** Single-contract flow after the Əmək müqaviləsi: DUE = the client pays in the office, PAID = staff recorded it (lib/casePayment). */
  payment?: 'DUE' | 'PAID' | null;
}

/** Stage kinds the status line itself describes (not repeated as "also required"). */
const STAGE_KINDS: NextKind[] = ['FIX_DOCS', 'UPLOAD_DOCS', 'SUBMIT_DOCS', 'SIGN_CONTRACT', 'PAY_CASE', 'ATTEND_APPOINTMENT'];
/** Nudges that never count as "required" (same as the next-step card's soft kinds). */
const SOFT: NextKind[] = ['PASSPORT_EXPIRY', 'COMPLETE_PROFILE', 'START_CASE', 'PREP_INTERVIEW', 'ARRIVAL_PREP'];

const caseUrl = (id: string, anchor = '') => `/account/cases/${id}${anchor}`;

export const buildStatusLine = (f: StatusFacts): StatusLine => {
  const p = f.primary;
  const find = (k: NextKind) => f.actions.find((a) => a.kind === k) ?? null;
  const other = f.actions.find((a) => !STAGE_KINDS.includes(a.kind) && !SOFT.includes(a.kind)) ?? null;
  // "Bax" goes straight to the case's current-step card (not the top of the page with the portal header).
  const done = (stage: StatusStage, to: string | null = p ? caseUrl(p.id, '#current-step') : null): StatusLine => ({
    stage,
    required: false,
    detail: null,
    to: other ? other.to : to,
    action: other ? { kind: other.kind, detail: other.detail, to: other.to } : null,
  });
  const need = (stage: StatusStage, a: NextAction | null, fallbackTo: string, detail: StatusLine['detail'] = a?.detail ?? null): StatusLine => ({
    stage,
    required: true,
    detail: typeof detail === 'string' || (detail && typeof detail === 'object') ? detail : null,
    to: a?.to ?? fallbackTo,
    action: null,
  });

  if (!p) return { ...done('NO_CASE', '/jobs'), to: other?.to ?? '/jobs' };
  const embassy = p.status === 'EMBASSY_DOCUMENTS' || p.status === 'EMBASSY_REVIEW';
  // Documents the team rejected come first in every stage (they can be replaced right away).
  const fix = find('FIX_DOCS');
  if (fix) return need(embassy ? 'EMBASSY_FIX' : 'FIX_DOCS', fix, caseUrl(p.id, '?tab=docs'));

  switch (p.status) {
    case 'DOCUMENTS_PENDING': {
      const up = find('UPLOAD_DOCS');
      if (up) return need('UPLOAD_DOCS', up, caseUrl(p.id, '?tab=docs'));
      return need('SUBMIT_DOCS', find('SUBMIT_DOCS'), caseUrl(p.id, '?tab=docs'), null);
    }
    case 'DOCUMENTS_REVIEW':
      if (f.pendingDocs > 0) return done('DOCS_REVIEW');
      // All documents accepted: the next step is the Əmək müqaviləsi with Triad Vision (lib/caseContracts).
      return done('CONTRACT_PREP');
    case 'CONTRACT_SENT':
      if (f.contractTurn === 'TRIAD' || f.contractTurn === 'STAFF') return done('LABOUR_TRIAD');
      return need('SIGN_LABOUR', find('SIGN_CONTRACT'), caseUrl(p.id, '?tab=docs#contract'), null);
    case 'CONTRACT_SIGNED':
      if (f.contractTurn === 'CLIENT') return need('SIGN_WORK', find('SIGN_CONTRACT'), caseUrl(p.id, '?tab=docs#contract'), null);
      if (f.payment === 'DUE') return need('PAY', find('PAY_CASE'), caseUrl(p.id, '#payment'), null);
      if (f.payment === 'PAID') return done('PAID_PREP');
      return done(f.workSigned ? 'WORK_REVIEW' : 'WORK_PREP');
    case 'EMBASSY_DOCUMENTS': {
      const up = find('UPLOAD_DOCS');
      if (up) return need('EMBASSY_UPLOAD', up, caseUrl(p.id, '?tab=docs'));
      return need('EMBASSY_SUBMIT', find('SUBMIT_DOCS'), caseUrl(p.id, '?tab=docs'), null);
    }
    case 'EMBASSY_REVIEW':
      return done('EMBASSY_REVIEW');
    case 'APPOINTMENT_SCHEDULED':
      if (p.appointmentAt && p.appointmentAt > f.now) return need('APPOINTMENT', find('ATTEND_APPOINTMENT'), caseUrl(p.id, '#appointment'), p.appointmentAt.toISOString());
      return done('DECISION');
    case 'DECISION_PENDING':
      return done('DECISION');
    case 'APPROVED':
      return done('APPROVED');
    case 'REJECTED':
      return done('REJECTED');
    case 'CANCELLED':
      return done('CANCELLED');
  }
};
