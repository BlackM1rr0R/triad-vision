import { toast } from 'sonner';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import i18n from '@/i18n';
import { errorCode } from '@/lib/api';
import { errorMessage } from '@/components/admin/labels';
import type { L10n } from '@/lib/types';

/**
 * Shared bits of the operations module (kanban, interviews, knowledge base, integrations).
 * Copy lives in i18n/pagesOps.ts (`ops.*`); every page registers it.
 */

export type InterviewStatus = 'PROPOSED' | 'CONFIRMED' | 'CANCELLED' | 'DONE' | 'NO_SHOW';
export const INTERVIEW_STATUSES: InterviewStatus[] = ['PROPOSED', 'CONFIRMED', 'CANCELLED', 'DONE', 'NO_SHOW'];

export interface Interview {
  id: string;
  status: InterviewStatus;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; name: string } | null;
  application: { id: string; status: string; vacancy: { id: string; title: L10n; slug: string } } | null;
  candidate: { id: string; name: string; email?: string; profession: string | null };
  staff: { id: string; name: string } | null;
  createdBy: { id: string; name: string; role: string } | null;
  /** Set when the candidate picked the time from the employer's free slots. */
  inviteId?: string | null;
}

export const INTERVIEW_TONE: Record<InterviewStatus, string> = toneClasses(STATUS_TONES.interview);

/** Error toast that knows the ops error codes first, then the admin catalogue. */
export const opsErrorMessage = (err: unknown) => {
  const code = errorCode(err);
  const key = `ops.errors.${code}`;
  return i18n.exists(key) ? String(i18n.t(key)) : errorMessage(err);
};

export const toastOpsError = (err: unknown) => {
  toast.error(opsErrorMessage(err));
};

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: fall back to a temporary textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
};

/** Minutes between two ISO timestamps. */
export const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

/** Browser-local "HH:MM". */
export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Monday 00:00 (local) of the week containing `d`. */
export const startOfWeek = (d: Date) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = (r.getDay() + 6) % 7; // Monday = 0
  r.setDate(r.getDate() - day);
  return r;
};

export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Default start for a new interview: next full hour at least one hour ahead, as a datetime-local value. */
export const defaultStart = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const icsUrl = (interviewId: string) => `/api/interviews/${interviewId}/ics`;

/** True while the meeting may be joined: from 15 minutes before the start until the end. */
export const canJoin = (i: Pick<Interview, 'status' | 'startsAt' | 'endsAt' | 'meetingUrl'>) => {
  if (!i.meetingUrl || i.status === 'CANCELLED') return false;
  const now = Date.now();
  return now >= new Date(i.startsAt).getTime() - 15 * 60 * 1000 && now <= new Date(i.endsAt).getTime();
};

/** Solid dot per status (week view). */
export const INTERVIEW_DOT: Record<InterviewStatus, string> = {
  PROPOSED: 'bg-amber-500',
  CONFIRMED: 'bg-emerald-500',
  CANCELLED: 'bg-slate-400',
  DONE: 'bg-brand-500',
  NO_SHOW: 'bg-red-500',
};
