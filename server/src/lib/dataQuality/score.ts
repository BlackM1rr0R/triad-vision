/**
 * Data-quality score of an active case (admin page /admin/data-quality). Pure (unit tested:
 * tests/unit/dataQuality.test.ts).
 *
 * Starts at 100 and subtracts capped penalties, so one category alone can never zero a case:
 *   missing profile field (VIDEX summary needs it)  −5 each, at most −30
 *   missing required document (current stage)       −8 each, at most −40
 *   expired document                                −15 each, at most −30
 *   document expiring within 60 days                −5 each, at most −15
 *   passport expiry unknown                         −10
 *   passport expires within 6 months                −10 (expired passport: −20)
 * Lower = worse; the list sorts worst first.
 */

export interface QualityInput {
  missingProfile: string[];
  missingDocs: number;
  expiredDocs: number;
  expiringDocs: number;
  passportExpiry: Date | null;
}

export type IssueKey = 'PROFILE' | 'DOCS_MISSING' | 'DOCS_EXPIRED' | 'DOCS_EXPIRING' | 'PASSPORT_EXPIRY_MISSING' | 'PASSPORT_EXPIRING' | 'PASSPORT_EXPIRED';

export interface QualityIssue {
  key: IssueKey;
  count: number;
  penalty: number;
}

const DAY = 24 * 60 * 60 * 1000;
export const EXPIRING_DAYS = 60;
export const PASSPORT_WARN_MONTHS = 6;

const capped = (n: number, each: number, cap: number) => Math.min(cap, Math.max(0, n) * each);

const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + m);
  return x;
};

export const qualityScore = (input: QualityInput, now = new Date()) => {
  const issues: QualityIssue[] = [];
  const add = (key: IssueKey, count: number, penalty: number) => {
    if (penalty > 0) issues.push({ key, count, penalty });
  };
  add('PROFILE', input.missingProfile.length, capped(input.missingProfile.length, 5, 30));
  add('DOCS_MISSING', input.missingDocs, capped(input.missingDocs, 8, 40));
  add('DOCS_EXPIRED', input.expiredDocs, capped(input.expiredDocs, 15, 30));
  add('DOCS_EXPIRING', input.expiringDocs, capped(input.expiringDocs, 5, 15));
  if (!input.passportExpiry) add('PASSPORT_EXPIRY_MISSING', 1, 10);
  else if (input.passportExpiry.getTime() <= now.getTime()) add('PASSPORT_EXPIRED', 1, 20);
  else if (input.passportExpiry.getTime() <= addMonths(now, PASSPORT_WARN_MONTHS).getTime()) add('PASSPORT_EXPIRING', 1, 10);
  const score = Math.max(0, 100 - issues.reduce((s, i) => s + i.penalty, 0));
  return { score, issues, grade: score >= 85 ? ('good' as const) : score >= 60 ? ('fair' as const) : ('poor' as const) };
};

/** Expired / expiring split of document validity dates. */
export const expiryCounts = (dates: (Date | null)[], now = new Date()) => {
  let expired = 0;
  let expiring = 0;
  const soon = now.getTime() + EXPIRING_DAYS * DAY;
  for (const d of dates) {
    if (!d) continue;
    if (d.getTime() <= now.getTime()) expired++;
    else if (d.getTime() <= soon) expiring++;
  }
  return { expired, expiring };
};

/** Which document stages count as "required now" for a case status. */
export const stagesDue = (status: string): ('INITIAL' | 'EMBASSY')[] =>
  ['EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'].includes(status) ? ['INITIAL', 'EMBASSY'] : ['INITIAL'];

/** A requirement is satisfied by any document that was not rejected. */
export const missingRequired = (reqs: { required: boolean; stage: string; documents: { status: string }[] }[], stages: string[]) =>
  reqs.filter((r) => r.required && stages.includes(r.stage) && !r.documents.some((d) => d.status !== 'REJECTED')).length;
