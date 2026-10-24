import type { CaseStatus } from '@/lib/types';

/**
 * Client portal structure in one place: the client's stage (derived from their cases and the arrival),
 * the five main sections, the sub-tabs of each section and which of them a stage shows.
 *
 * Pure and dependency-free (type imports only): the server test suite loads this file directly
 * (tests/unit/portalStage.test.ts), like lib/docCheck.ts.
 */

export type PortalStage = 'LEAD' | 'PREPARING' | 'AT_EMBASSY' | 'TRAVEL' | 'IN_GERMANY' | 'CLOSED';

export const SECTIONS = ['home', 'documents', 'messages', 'learn', 'profile'] as const;
export type SectionKey = (typeof SECTIONS)[number];

export type SubKey =
  // home
  | 'overview'
  | 'application'
  | 'arrival'
  | 'onboarding'
  // documents
  | 'caseDocs'
  | 'signatures'
  | 'vault'
  | 'translations'
  | 'letterExplain'
  // messages
  | 'chat'
  | 'notifications'
  // learn
  | 'waitingRoom'
  | 'german'
  | 'interviewPrep'
  | 'interviews'
  | 'jobs'
  | 'cv'
  | 'letters'
  | 'guides'
  // profile
  | 'personal'
  | 'family'
  | 'privacy'
  | 'referral';

/** Every sub-tab in display order, grouped by section. */
export const SECTION_SUBS: Record<SectionKey, readonly SubKey[]> = {
  home: ['overview', 'application', 'arrival', 'onboarding'],
  documents: ['caseDocs', 'signatures', 'vault', 'translations', 'letterExplain'],
  messages: ['chat', 'notifications'],
  learn: ['waitingRoom', 'german', 'interviewPrep', 'interviews', 'jobs', 'cv', 'letters', 'guides'],
  profile: ['personal', 'family', 'privacy', 'referral'],
};

export const sectionOfSub = (sub: SubKey): SectionKey => SECTIONS.find((s) => SECTION_SUBS[s].includes(sub)) ?? 'home';

const PREPARING: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS'];
const AT_EMBASSY: CaseStatus[] = ['EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'];
const FINAL: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

export interface StageCase {
  status: CaseStatus;
  /** Family-member case (Familiennachzug) under a main application. */
  parentCaseId?: string | null;
}

const openStage = (status: CaseStatus): PortalStage | null => (PREPARING.includes(status) ? 'PREPARING' : AT_EMBASSY.includes(status) ? 'AT_EMBASSY' : null);

/**
 * The client's stage. Order matters: in Germany beats everything (a renewal or a family case is shown
 * as "still open" there); an open main application beats an older approval; an approval waiting for
 * travel beats open family-member cases.
 */
export const derivePortalStage = (cases: readonly StageCase[], arrived: boolean): PortalStage => {
  if (!cases.length) return 'LEAD';
  if (arrived) return 'IN_GERMANY';
  const main = cases.find((c) => !c.parentCaseId && !FINAL.includes(c.status));
  if (main) return openStage(main.status) ?? 'PREPARING';
  if (cases.some((c) => c.status === 'APPROVED')) return 'TRAVEL';
  const member = cases.find((c) => !FINAL.includes(c.status));
  if (member) return openStage(member.status) ?? 'PREPARING';
  return 'CLOSED';
};

export interface VisibilityContext {
  /** The client has at least one case (any status). */
  hasCase: boolean;
  /** At least one case is still open (not approved / rejected / cancelled). */
  hasOpenCase: boolean;
  /** Something was ever sent to the client for signature. */
  hasSignatures: boolean;
  /** Open document actions (upload / fix / submit / contract) on a case. */
  openDocActions: boolean;
}

const PRE_APPROVAL: PortalStage[] = ['LEAD', 'PREPARING', 'AT_EMBASSY'];
const JOB_SEARCH: PortalStage[] = ['LEAD', 'PREPARING', 'AT_EMBASSY', 'CLOSED'];

/** Does the stage show this sub-tab? (Routes stay reachable either way; this only decides the menus.) */
export const isSubVisible = (sub: SubKey, stage: PortalStage, ctx: VisibilityContext): boolean => {
  switch (sub) {
    case 'overview':
    case 'vault':
    case 'translations':
    case 'letterExplain':
    case 'notifications':
    case 'german':
    case 'guides':
    case 'personal':
    case 'privacy':
    case 'referral':
      return true;
    case 'application':
    case 'chat':
      return ctx.hasCase;
    case 'arrival':
      return stage === 'TRAVEL';
    case 'onboarding':
      return stage === 'TRAVEL' || stage === 'IN_GERMANY';
    case 'caseDocs':
      // In Germany only while something is still open there (renewal, family member, missing file).
      if (!ctx.hasCase) return false;
      return stage === 'IN_GERMANY' ? ctx.hasOpenCase || ctx.openDocActions : true;
    case 'signatures':
      return ctx.hasSignatures;
    case 'waitingRoom':
      return stage === 'PREPARING' || stage === 'AT_EMBASSY';
    case 'interviewPrep':
      return PRE_APPROVAL.includes(stage);
    case 'interviews':
    case 'jobs':
    case 'cv':
    case 'letters':
      return JOB_SEARCH.includes(stage);
    case 'family':
      // Family reunification: from the first application on, and above all once in Germany.
      return ctx.hasCase;
  }
};

/** Visible sub-tabs of every section for a stage (each section keeps at least one). */
export const visibleSubs = (stage: PortalStage, ctx: VisibilityContext): Record<SectionKey, SubKey[]> => {
  const out = {} as Record<SectionKey, SubKey[]>;
  for (const s of SECTIONS) out[s] = SECTION_SUBS[s].filter((k) => isSubVisible(k, stage, ctx));
  return out;
};

// ─── Where am I? ─────────────────────────────────────────────────────────

const CASE_PAGE = /^\/account\/cases\/[^/]+\/?$/;

/** The sub-tab a portal URL belongs to (old URLs included); null outside the portal. */
export const subOfLocation = (pathname: string, search = ''): SubKey | null => {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/account') return 'overview';
  if (!p.startsWith('/account/')) return null;
  if (CASE_PAGE.test(pathname)) {
    const tab = new URLSearchParams(search).get('tab');
    if (tab === 'docs') return 'caseDocs';
    if (tab === 'messages') return 'chat';
    if (tab === 'family') return 'family';
    return 'application';
  }
  const seg = p.split('/')[2] ?? '';
  switch (seg) {
    case 'cases': // list, forms and data confirmation of a case
      return 'application';
    case 'arrival':
      return 'arrival';
    case 'onboarding':
      return 'onboarding';
    case 'signatures':
      return 'signatures';
    case 'vault':
      return 'vault';
    case 'translations':
      return 'translations';
    case 'letters-explain':
      return 'letterExplain';
    case 'notifications':
      return 'notifications';
    case 'waiting-room':
      return 'waitingRoom';
    case 'german':
      return 'german';
    case 'interview-prep':
      return 'interviewPrep';
    case 'interviews':
      return 'interviews';
    case 'applications':
      return 'jobs';
    case 'cv':
      return 'cv';
    case 'letters':
      return 'letters';
    case 'guides':
      return 'guides';
    case 'profile':
      return 'personal';
    case 'privacy':
      return 'privacy';
    case 'referral':
      return 'referral';
    default:
      return null;
  }
};

export const sectionOfLocation = (pathname: string, search = ''): SectionKey | null => {
  const sub = subOfLocation(pathname, search);
  return sub ? sectionOfSub(sub) : null;
};

/** Where a sub-tab links to. `caseId` = the case the portal is about; `caseCount` > 1 opens the case list. */
export const subPath = (sub: SubKey, caseId: string | null, caseCount = caseId ? 1 : 0): string => {
  const kase = (tab?: string) => (caseId ? `/account/cases/${caseId}${tab ? `?tab=${tab}` : ''}` : '/account');
  switch (sub) {
    case 'overview':
      return '/account';
    case 'application':
      return caseCount > 1 || !caseId ? '/account/cases' : kase();
    case 'arrival':
      return '/account/arrival';
    case 'onboarding':
      return '/account/onboarding';
    case 'caseDocs':
      return kase('docs');
    case 'signatures':
      return '/account/signatures';
    case 'vault':
      return '/account/vault';
    case 'translations':
      return '/account/translations';
    case 'letterExplain':
      return '/account/letters-explain';
    case 'chat':
      return kase('messages');
    case 'notifications':
      return '/account/notifications';
    case 'waitingRoom':
      return '/account/waiting-room';
    case 'german':
      return '/account/german';
    case 'interviewPrep':
      return '/account/interview-prep';
    case 'interviews':
      return '/account/interviews';
    case 'jobs':
      return '/account/applications';
    case 'cv':
      return '/account/cv';
    case 'letters':
      return '/account/letters';
    case 'guides':
      return '/account/guides';
    case 'personal':
      return '/account/profile';
    case 'family':
      // The case page opens the family tab (members) or, without members yet, the "add a member" block.
      return caseId ? `/account/cases/${caseId}#family-members` : '/account/profile';
    case 'privacy':
      return '/account/privacy';
    case 'referral':
      return '/account/referral';
  }
};

export interface SectionBadges {
  unreadMessages: number;
  unreadNotifications: number;
  pendingSignatures: number;
  pendingLegal: number;
  actions: number;
}

/** Counter per sub-tab (0 = none). */
export const subBadge = (sub: SubKey, b: SectionBadges): number => {
  switch (sub) {
    case 'chat':
      return b.unreadMessages;
    case 'notifications':
      return b.unreadNotifications;
    case 'signatures':
      return b.pendingSignatures;
    case 'privacy':
      return b.pendingLegal;
    case 'overview':
      return b.actions;
    default:
      return 0;
  }
};

/**
 * Counter per section: the sum of its visible sub-tabs' counters. Messages take the larger one: a new
 * chat message also creates a notification, so adding them up would count it twice.
 */
export const sectionBadge = (section: SectionKey, subs: readonly SubKey[], b: SectionBadges): number => {
  const counts = subs.filter((s) => sectionOfSub(s) === section).map((s) => subBadge(s, b));
  return section === 'messages' ? Math.max(0, ...counts) : counts.reduce((n, c) => n + c, 0);
};
