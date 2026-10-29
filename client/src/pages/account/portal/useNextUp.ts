import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, CalendarCheck, ClipboardList, FileSignature, FileUp, ListChecks, PenLine, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail, CaseStatus, L10n } from '@/lib/types';
import { UPLOAD_STAGE } from '@/components/portal/CaseDocuments';
import { useMyTasks } from '@/components/clientProcess/PortalTasks';
import { useBallLine } from '@/components/clientProcess/Ball';
import type { BallInCourt, BallReason } from '@/components/clientProcess/api';
import { clientTasksKey, type FormStatus } from '@/components/clientData/api';
import { useMySignatures } from '@/components/esign/MySignatures';
import { lessonHref, useMyCourses } from '@/components/course/api';
import { registerCopy } from '@/i18n';
import { pagesCourse } from '@/i18n/pagesCourse';

registerCopy(pagesCourse); // the "continue the course" item

/** GET /cases/:id — same key and shape as the case page, so both share one cache entry. */
export const useCaseDetail = (caseId: string | null | undefined, opts: { refetchInterval?: number } = {}) =>
  useQuery({
    queryKey: ['case', caseId ?? ''],
    queryFn: async () => (await api.get<{ case: CaseDetail }>(`/cases/${caseId}`)).data.case,
    enabled: !!caseId,
    staleTime: 20_000,
    refetchInterval: opts.refetchInterval,
  });

/** GET /client-data/cases/:id/tasks — same key and shape as ClientDataTasks. */
interface DataTasks {
  forms: { id: string; title: L10n; status: FormStatus; sentAt: string; submittedAt: string | null; dueAt: string | null }[];
  confirmation: { id: string; status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED'; requestedAt: string; submittedAt: string | null; fields: number } | null;
}
const useDataTasks = (caseId: string | null | undefined) =>
  useQuery({
    queryKey: clientTasksKey(caseId ?? ''),
    queryFn: async () => (await api.get<DataTasks>(`/client-data/cases/${caseId}/tasks`)).data,
    enabled: !!caseId,
    refetchInterval: 60_000,
  });

export type CaseTab = 'overview' | 'docs' | 'messages' | 'family' | 'other';

/** Where a hash anchor of the case page lives (old links: notifications, e-mails, cards). */
export const tabOfAnchor = (hash: string): CaseTab | null => {
  const id = hash.replace(/^#/, '');
  if (!id) return null;
  if (id.startsWith('docs-') || id === 'contract' || id === 'other-files' || id === 'originals' || id === 'doc-intel') return 'docs';
  if (id === 'messages') return 'messages';
  if (id === 'family-members' || id === 'family') return 'family';
  if (id === 'office-visits' || id === 'timeline') return 'other';
  return 'overview';
};

/** Case-page link to a tab (and an anchor inside it). */
export const caseHref = (caseId: string, tab: CaseTab, anchor?: string | null) =>
  `/account/cases/${caseId}${tab === 'overview' ? '' : `?tab=${tab}`}${anchor ?? ''}`;

export interface NextItem {
  key: string;
  icon: LucideIcon;
  title: string;
  due: string | null;
  overdue: boolean;
  to: string;
  action: string;
}

const REASON_ICON: Partial<Record<BallReason, LucideIcon>> = {
  UPLOAD_DOCS: FileUp,
  FIX_DOCS: FileUp,
  SUBMIT_DOCS: FileUp,
  SIGN_CONTRACT: PenLine,
  SIGN_DOCUMENTS: FileSignature,
  CLIENT_TASKS: ListChecks,
  ATTEND_APPOINTMENT: CalendarCheck,
};

const cap = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

const reasonHref = (caseId: string, status: CaseStatus, reason: BallReason) => {
  const stage = UPLOAD_STAGE[status];
  switch (reason) {
    case 'UPLOAD_DOCS':
    case 'FIX_DOCS':
    case 'SUBMIT_DOCS':
      return caseHref(caseId, 'docs', stage ? `#docs-${stage.toLowerCase()}` : null);
    case 'SIGN_CONTRACT':
      return caseHref(caseId, 'docs', '#contract');
    case 'SIGN_DOCUMENTS':
      return '/account/signatures';
    case 'CLIENT_TASKS':
      return caseHref(caseId, 'overview', '#client-tasks');
    case 'ATTEND_APPOINTMENT':
      return caseHref(caseId, 'overview', '#appointment');
    default:
      return caseHref(caseId, 'overview');
  }
};

/**
 * "What do I need to do now?" for one case: the ball-in-court answer plus the concrete open items
 * (signatures, data confirmation, questionnaires, client tasks), most urgent first.
 */
export const useNextUp = (caseId: string | null | undefined) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const { user } = useAuth();
  const line = useBallLine('client');
  const detail = useCaseDetail(caseId);
  const tasks = useMyTasks();
  const dataTasks = useDataTasks(caseId);
  const sigs = useMySignatures({ enabled: !!user });
  const courses = useMyCourses(user?.role === 'CLIENT');

  const c = detail.data;
  const ball = (c as (CaseDetail & { ballInCourt?: BallInCourt | null }) | undefined)?.ballInCourt ?? null;
  const short = (iso: string) => date(iso, { day: 'numeric', month: 'short' });
  const now = Date.now();
  const items: NextItem[] = [];

  if (c && caseId) {
    // Ball items that are not listed one by one below.
    for (const b of ball?.items ?? []) {
      if (b.side !== 'CLIENT' || b.reason === 'CLIENT_TASKS' || b.reason === 'SIGN_DOCUMENTS') continue;
      items.push({
        key: `ball-${b.reason}`,
        icon: REASON_ICON[b.reason] ?? ListChecks,
        title: cap(t(`cp.reason.${b.reason}`, { count: b.count })),
        due: b.dueAt,
        overdue: b.overdue,
        to: reasonHref(caseId, c.status, b.reason),
        action: t(`pux.next.action.${b.reason}`, { defaultValue: t('pux.next.open') }),
      });
    }
    const conf = dataTasks.data?.confirmation;
    if (conf?.status === 'PENDING') {
      items.push({
        key: `confirm-${conf.id}`,
        icon: ShieldCheck,
        title: t('pux.next.item.confirm', { count: conf.fields }),
        due: null,
        overdue: false,
        to: `/account/cases/${caseId}/confirm`,
        action: t('pux.next.action.confirm'),
      });
    }
    for (const f of dataTasks.data?.forms ?? []) {
      if (f.status !== 'SENT' && f.status !== 'DRAFT') continue;
      items.push({
        key: `form-${f.id}`,
        icon: ClipboardList,
        title: t('pux.next.item.form', { title: tr(f.title) }),
        due: f.dueAt,
        overdue: !!f.dueAt && new Date(f.dueAt).getTime() < now,
        to: `/account/cases/${caseId}/forms/${f.id}`,
        action: t('pux.next.action.form'),
      });
    }
  }
  for (const s of sigs.data ?? []) {
    if (!s.myTurn) continue;
    items.push({
      key: `sig-${s.signerId}`,
      icon: FileSignature,
      title: t('pux.next.item.signature', { title: s.title }),
      due: s.expiresAt,
      overdue: false,
      to: `/account/signatures/${s.signerId}`,
      action: t('pux.next.action.signature'),
    });
  }
  for (const task of tasks.data?.tasks ?? []) {
    if (task.status !== 'OPEN') continue;
    items.push({
      key: `task-${task.id}`,
      icon: ListChecks,
      title: task.title,
      due: task.dueAt,
      overdue: task.state === 'overdue',
      to: caseHref(task.caseId, 'overview', '#client-tasks'),
      action: t('pux.next.action.task'),
    });
  }
  // Overdue first, then by due date (undated last); the ball items keep their place among equals.
  const rank = (i: NextItem) => (i.overdue ? 0 : 1);
  items.sort((a, b) => rank(a) - rank(b) || (a.due ? new Date(a.due).getTime() : Infinity) - (b.due ? new Date(b.due).getTime() : Infinity));

  // The hero: the ball answer when it is the client's move, else the most urgent concrete item.
  type Hero =
    | { kind: 'client'; title: string; overdue: boolean; to: string; action: string; icon: LucideIcon }
    | { kind: 'wait'; side: 'TEAM' | 'EMBASSY' | 'NONE'; title: string };
  let hero: Hero | null = null;
  if (c && caseId && ball?.side === 'CLIENT') {
    hero = {
      kind: 'client',
      title: line(ball),
      overdue: ball.overdue,
      to: reasonHref(caseId, c.status, ball.reason),
      action: t(`pux.next.action.${ball.reason}`, { defaultValue: t('pux.next.open') }),
      icon: REASON_ICON[ball.reason] ?? ListChecks,
    };
  } else if (items.length) {
    const first = items[0];
    hero = {
      kind: 'client',
      title: first.due ? `${first.title} · ${t('pux.next.item.due', { date: short(first.due) })}` : first.title,
      overdue: first.overdue,
      to: first.to,
      action: first.action,
      icon: first.icon,
    };
  } else if (c) {
    const side = ball?.side === 'TEAM' || ball?.side === 'EMBASSY' || ball?.side === 'NONE' ? ball.side : 'TEAM';
    hero = { kind: 'wait', side, title: ball && ball.side !== 'NONE' ? line(ball) : '' };
  }
  // The hero's own item is not repeated in the list.
  const rest =
    ball?.side === 'CLIENT' ? items.filter((i) => i.key !== `ball-${ball.reason}`) : hero?.kind === 'client' ? items.slice(1) : items;

  // Lowest priority: continue (or start) the pre-departure course — never the hero, always last, not counted as a to-do.
  const course = (courses.data ?? []).find((x) => x.next && !x.certificate);
  const courseItem: NextItem | null = course?.next
    ? {
        key: `course-${course.id}`,
        icon: BookOpenCheck,
        title: t(course.started ? 'course.next.continue' : 'course.next.start', { title: tr(course.started ? course.next.title : course.title) }),
        due: null,
        overdue: false,
        to: lessonHref(course.id, course.next.lessonId),
        action: t('course.next.action'),
      }
    : null;

  return { loading: detail.isLoading, detail: c ?? null, ball, hero, items: courseItem ? [...rest, courseItem] : rest, allItems: items, short };
};
