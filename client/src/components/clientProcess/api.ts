import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesClientProcess } from '@/i18n/pagesClientProcess';

registerCopy(pagesClientProcess);

// ─── Types (server: lib/clientProcess) ──────────────────────────────

export type BallSide = 'CLIENT' | 'TEAM' | 'EMBASSY' | 'NONE';
export type BallReason =
  | 'UPLOAD_DOCS' | 'FIX_DOCS' | 'SUBMIT_DOCS' | 'SIGN_CONTRACT' | 'SIGN_DOCUMENTS' | 'CLIENT_TASKS' | 'ATTEND_APPOINTMENT'
  | 'REVIEW_DOCS' | 'CHECK_SIGNATURE' | 'LODGE_APPLICATION' | 'REPLY_MESSAGE' | 'DECISION' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface BallItem {
  side: Exclude<BallSide, 'NONE'>;
  reason: BallReason;
  count: number;
  dueAt: string | null;
  overdue: boolean;
}

export interface BallInCourt {
  side: BallSide;
  reason: BallReason;
  count: number;
  dueAt: string | null;
  overdue: boolean;
  since: string;
  days: number;
  eta: { minHours: number; maxHours: number; expectedBy: string; late: boolean } | null;
  items: BallItem[];
  totals: Record<'CLIENT' | 'TEAM' | 'EMBASSY', number>;
  timeline?: { side: BallSide; from: string; to: string | null; days: number }[];
}

export type TaskState = 'open' | 'due_soon' | 'overdue' | 'done' | 'cancelled';

export interface ClientTaskView {
  id: string;
  caseId: string;
  caseNumber: string;
  template: string | null;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  state: TaskState;
  requirement: { id: string; stage: string; title: string } | null;
  linkUrl: string | null;
  attachmentId: string | null;
  clientDocumentId: string | null;
  clientNote: string | null;
  completedAt: string | null;
  completedVia: 'CLIENT' | 'STAFF' | 'UPLOAD' | null;
  createdAt: string;
}

export interface StaffTaskView extends ClientTaskView {
  rawTitle: string;
  rawDescription: string | null;
  client: { id: string; name: string; locale: string };
  assignedStaff: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
}

export interface TaskTemplate {
  key: string;
  title: Record<string, string>;
  description: Record<string, string>;
  dueDays: number;
}

export type VisitReason = 'originals' | 'passport' | 'sign' | 'other';
export const VISIT_REASONS: VisitReason[] = ['originals', 'passport', 'sign', 'other'];

export interface OfficeSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  free: number;
}

export interface OfficeVisit {
  id: string;
  caseId: string | null;
  caseNumber: string | null;
  status: 'BOOKED' | 'CANCELLED' | 'DONE' | 'NO_SHOW';
  reason: VisitReason;
  message: string | null;
  startsAt: string;
  endsAt: string;
  location: string | null;
  staffName: string;
  canCancel: boolean;
}

// ─── Query keys ───────────────────────────────────────────────────────

export const cpKeys = {
  myTasks: (caseId?: string) => ['client-process', 'tasks', caseId ?? 'all'] as const,
  visits: (caseId: string) => ['client-process', 'visits', caseId] as const,
  officeSlots: ['client-process', 'office-slots'] as const,
  caseTasks: (caseId: string) => ['admin', 'client-process', 'case-tasks', caseId] as const,
  allTasks: (q: string) => ['admin', 'client-process', 'tasks', q] as const,
  templates: ['admin', 'client-process', 'templates'] as const,
  settings: ['admin', 'client-process', 'settings'] as const,
  officeAdmin: ['admin', 'client-process', 'office'] as const,
};

// ─── Text helpers ─────────────────────────────────────────────────────

/** "24 hours", "2–3 days", "4–8 weeks" for an ETA range. */
export const useEtaText = () => {
  const { t } = useTranslation();
  return useCallback(
    (eta: { minHours: number; maxHours: number }) => {
      const { minHours: a, maxHours: b } = eta;
      const unit = b < 72 ? 'h' : b < 21 * 24 ? 'd' : 'w';
      const div = unit === 'h' ? 1 : unit === 'd' ? 24 : 24 * 7;
      const lo = Math.max(1, Math.round(a / div));
      const hi = Math.max(lo, Math.round(b / div));
      const v = lo === hi ? String(hi) : `${lo}–${hi}`;
      return t(lo === hi ? 'cp.ball.about' : 'cp.ball.usually', { value: t(`cp.ball.unit.${unit}`, { v }) });
    },
    [t],
  );
};

/** Error text: cp.errors.CODE, then the portal / admin catalogues, then the generic message. */
export const useCpError = (area: 'portal' | 'admin' = 'portal') => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      const keys = [`cp.errors.${code}`, `${area}.errors.${code}`];
      const key = keys.find((k) => i18n.exists(k));
      toast.error(key ? t(key) : area === 'admin' ? t('admin.common.opFailed') : t('common.error'));
    },
    [t, i18n, area],
  );
};

export const STATE_TONE: Record<TaskState, string> = {
  open: 'bg-slate-100 text-slate-700',
  due_soon: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-700',
  done: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-100 text-slate-500',
};

export const SIDE_TONE: Record<BallSide, { chip: string; bar: string }> = {
  CLIENT: { chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-400' },
  TEAM: { chip: 'bg-sky-100 text-sky-800', bar: 'bg-sky-400' },
  EMBASSY: { chip: 'bg-violet-100 text-violet-800', bar: 'bg-violet-400' },
  NONE: { chip: 'bg-slate-100 text-slate-600', bar: 'bg-slate-300' },
};
