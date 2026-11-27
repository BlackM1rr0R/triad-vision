import { useQuery } from '@tanstack/react-query';
import { api, getImpersonation } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CaseDetail, CaseStatus, L10n } from '@/lib/types';
import {
  derivePortalStage,
  SECTIONS,
  sectionBadge,
  subBadge,
  visibleSubs,
  type PortalStage,
  type SectionBadges,
  type SectionKey,
  type SubKey,
} from '@/lib/portalStage';
import { useMySignatures } from '@/components/esign/MySignatures';
import { PENDING_KEY, type PendingAcceptance } from '@/components/legal/api';
import { useNotifications } from './useNotifications';
import { useOverview } from './useOverview';
import type { JourneyData } from './journey';
import { useMyCourses } from '@/components/course/api';
import { useChosenCase } from '@/lib/caseContext';
import { PORTAL_TOOL_KEYS, hiddenBadge, toolBadge, type PortalStageKey, type PortalToolKey } from '@/lib/portalTools';
import { mainApprovedCaseId } from '@/pages/account/portal/celebration'; // own approved main case (visa story)

/** Kinds of GET /api/account/next-step (server: lib/account/nextStep.ts). */
export type NextKind =
  | 'ACCEPT_LEGAL'
  | 'PAY_INVOICE'
  | 'FIX_DOCS'
  | 'UPLOAD_DOCS'
  | 'SUBMIT_DOCS'
  | 'SIGN_CONTRACT'
  | 'PAY_CASE'
  | 'ATTEND_APPOINTMENT'
  | 'BOOK_INTERVIEW'
  | 'PREP_INTERVIEW'
  | 'SIGN_DOCUMENTS'
  | 'CONFIRM_DATA'
  | 'ANSWER_MESSAGE'
  | 'FILL_FORM'
  | 'CLIENT_TASK'
  | 'RECOGNITION_DOCS'
  | 'ANSWER_CHECKIN'
  | 'ARRIVAL_PLAN'
  | 'ARRIVAL_PREP'
  | 'RENEW_RESIDENCE'
  | 'ONBOARDING'
  | 'START_CASE'
  | 'PASSPORT_EXPIRY'
  | 'COMPLETE_PROFILE';

export interface NextAction {
  kind: NextKind;
  to: string;
  dueAt: string | null;
  overdue: boolean;
  count: number;
  detail: string | L10n | null;
}

export interface NextStep {
  case: { id: string; number: string; status: CaseStatus; visaType: string | null; step: number; stepCount: number } | null;
  progress: number | null;
  milestone: { key: string; from: string | null; to: string | null } | null;
  arrived: boolean;
  arrivedAt: string | null;
  onboarding: { done: number; total: number; percent: number } | null;
  /** Home city → German city and dated steps for the journey map (components/portal/JourneyCard). */
  journey?: JourneyData | null;
  primary: NextAction | null;
  secondary: NextAction[];
  /** Every further open action after the first three ("+N more"; older servers: absent). */
  more?: NextAction[];
  /** reason: the ball reason (e.g. TRIAD_SIGN_CONTRACT: Triad Vision signs the contract first). */
  waiting: { side: 'TEAM' | 'EMBASSY' | 'NONE'; expectedBy: string | null; reason?: string } | null;
  /** Status line of the cabinet header (older servers: absent). */
  statusLine?: StatusLineData;
  /** Stage-based portal (server: lib/account/portalStage.ts; older servers: absent). */
  portal?: PortalInfo;
  counts: { actions: number; unreadMessages: number; unreadNotifications: number; pendingSignatures: number; pendingLegal: number; openCheckIns: number; openInvoices?: number; hasBilling?: boolean };
}

/** Plain status line of the cabinet (server: lib/account/statusLine.ts): the stage and what the client has to do. */
export interface StatusLineData {
  stage: string;
  required: boolean;
  detail: string | L10n | null;
  to: string | null;
  action: { kind: NextKind; detail: string | L10n | null; to: string } | null;
}

/** The client's stage, the finer phase and the 4–7 tools the portal features now (decided on the server). */
export interface PortalInfo {
  stage: PortalStageKey;
  phase: PortalStage;
  featured: PortalToolKey[];
}

// Under the overview key: every invalidation of the overview (upload, signature, status change) refreshes it too.
export const NEXT_STEP_KEY = ['account-overview', 'next-step'] as const;

/** GET /api/account/next-step — the portal home card and the section badges (?case= = the family switcher's case). */
export const useNextStep = (enabled = true) => {
  const { user } = useAuth();
  const chosen = useChosenCase(user?.id);
  return useQuery({
    queryKey: chosen ? [...NEXT_STEP_KEY, chosen] : NEXT_STEP_KEY,
    queryFn: async () => (await api.get<NextStep>('/account/next-step', { params: chosen ? { case: chosen } : undefined })).data,
    staleTime: 20_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    enabled,
  });
};

const DOC_KINDS: NextKind[] = ['FIX_DOCS', 'UPLOAD_DOCS', 'SUBMIT_DOCS', 'SIGN_CONTRACT'];
const FINAL: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

type MsgWithRead = CaseDetail['messages'][number] & { readAt?: string | null };

/**
 * Everything the portal navigation needs (desktop tabs, sub-tabs, phone bottom bar): the client's stage,
 * the visible sub-tabs per section and the badges. Live sources (notifications, signatures, the open case
 * page's messages, pending legal texts) win over the next-step counters, which refresh once a minute.
 */
export function usePortalNav() {
  const { user } = useAuth();
  const isClient = user?.role === 'CLIENT';
  const { data: overview } = useOverview(!!user && isClient);
  const next = useNextStep(!!user && isClient);
  const { data: notif } = useNotifications(!!user);
  const { data: signatures } = useMySignatures({ enabled: !!user });
  const impersonating = getImpersonation() !== null;
  const courses = useMyCourses(!!user && isClient); // Learn › Course appears once the client is enrolled
  // Learn › External applications also after the job search stages, once one was sent (same query as the page).
  const externalApps = useQuery({
    queryKey: ['my-external-applications'],
    queryFn: async () => (await api.get<{ items: unknown[]; linked: number }>('/external-applications')).data,
    staleTime: 5 * 60_000,
    enabled: !!user && isClient,
    retry: false,
  });
  const legal = useQuery({
    queryKey: PENDING_KEY,
    queryFn: async () => (await api.get<{ pending: PendingAcceptance[]; blocking: boolean }>('/legal/me/pending')).data,
    staleTime: 5 * 60_000,
    enabled: !!user && !impersonating,
    retry: false,
  });

  const cases = overview?.cases ?? [];
  // Family switcher: the chosen case (own cases only) is the case every section links to.
  const chosen = useChosenCase(user?.id);
  const chosenOwn = chosen && cases.some((c) => c.id === chosen) ? chosen : null;
  const caseId = chosenOwn ?? next.data?.case?.id ?? cases.find((c) => !FINAL.includes(c.status))?.id ?? cases[0]?.id ?? null;
  // The case page's own query (same key): read its messages while it is cached, never fetch it from here.
  const caseQ = useQuery({
    queryKey: ['case', caseId ?? ''],
    queryFn: async () => (await api.get<{ case: CaseDetail }>(`/cases/${caseId}`)).data.case,
    enabled: false,
  });
  const caseUnread = caseQ.data ? caseQ.data.messages.filter((m) => m.author.id !== user?.id && !(m as MsgWithRead).readAt).length : null;

  const arrived = next.data?.arrived ?? false;
  // The server decides the stage (single source); the local derivation only bridges the first load.
  const portal = next.data?.portal ?? null;
  const stage: PortalStage = portal?.phase ?? derivePortalStage(cases, arrived);
  // Featured tools of the stage (unknown keys from a newer server are dropped).
  const featured: PortalToolKey[] = (portal?.featured ?? []).filter((k) => (PORTAL_TOOL_KEYS as readonly string[]).includes(k));
  const hasSignatures = (signatures?.length ?? 0) > 0;
  const actions = [next.data?.primary, ...(next.data?.secondary ?? [])].filter(Boolean) as NextAction[];
  const subs = visibleSubs(stage, {
    hasCase: cases.length > 0,
    hasOpenCase: cases.some((c) => !FINAL.includes(c.status)),
    hasSignatures,
    openDocActions: actions.some((a) => DOC_KINDS.includes(a.kind)),
    hasPayments: !!next.data?.counts.hasBilling,
    hasCourse: (courses.data?.length ?? 0) > 0,
    hasExternalApplications: (externalApps.data?.items.length ?? 0) > 0,
  });

  const badges: SectionBadges = {
    unreadMessages: caseUnread ?? next.data?.counts.unreadMessages ?? 0,
    unreadNotifications: notif?.unread ?? next.data?.counts.unreadNotifications ?? 0,
    pendingSignatures: signatures ? signatures.filter((s) => s.myTurn).length : (next.data?.counts.pendingSignatures ?? 0),
    pendingLegal: legal.data ? legal.data.pending.length : (next.data?.counts.pendingLegal ?? 0),
    actions: next.data?.counts.actions ?? 0,
    openInvoices: next.data?.counts.openInvoices ?? 0,
  };
  const allSubs = SECTIONS.flatMap((s) => subs[s]);
  const sectionBadges = Object.fromEntries(SECTIONS.map((s) => [s, sectionBadge(s, allSubs, badges)])) as Record<SectionKey, number>;
  const subBadges = (sub: SubKey) => subBadge(sub, badges);
  const toolBadges = (k: PortalToolKey) => toolBadge(k, badges);
  const allBadge = hiddenBadge(featured, badges);
  // Visa story link: only the own main application has one (a family member's case would 404).
  const approvedCaseId = mainApprovedCaseId(cases);

  // With a family (several cases) and a chosen case, section links go straight to that case, not to the case list.
  const caseCount = chosenOwn ? 1 : cases.length;
  return {
    stage,
    portalStage: portal?.stage ?? null,
    featured,
    toolBadges,
    allBadge,
    approvedCaseId,
    subs,
    badges,
    sectionBadges,
    subBadges,
    caseId,
    caseCount,
    next,
    overview,
    cases,
    isClient,
  };
}
