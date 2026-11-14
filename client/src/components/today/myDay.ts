import type { WorkItem, WorkKind } from './api';

/**
 * "Bu günüm" (/admin/my-day): the my-work queue (GET /api/admin/my-work) regrouped as a day plan.
 * No extra endpoint: every row and button is the queue's own, only the grouping differs.
 */

export const MY_DAY_SECTIONS = ['tasks', 'cases', 'messages', 'agenda', 'leads'] as const;
export type MyDaySection = (typeof MY_DAY_SECTIONS)[number];

const TASK_KINDS = new Set<WorkKind>(['task', 'client_task_overdue']);
/** Case work that counts once it is late; a stuck case is late by definition. */
const CASE_KINDS = new Set<WorkKind>(['case_waiting', 'case_stuck', 'doc_review', 'embassy_review', 'processing', 'recognition_deadline', 'accelerated_deadline']);
const AGENDA_KINDS = new Set<WorkKind>(['appointment', 'interview', 'booking']);
const LEAD_KINDS = new Set<WorkKind>(['inquiry', 'application', 'employer_decision', 'candidate_request']);

/** When an agenda row happens: interviews carry their start in refs, bookings in the "done" button's notBefore. */
export const startOf = (item: WorkItem): string | null => item.refs.startsAt ?? item.actions.find((a) => a.notBefore)?.notBefore ?? item.dueAt;

/** Local calendar day "YYYY-MM-DD" of an instant (the browser's time zone, like the queue's buckets). */
export const localDay = (iso: string | number | Date) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface AgendaDay {
  day: string;
  /** 0 = today, 1 = tomorrow, … */
  offset: number;
  items: WorkItem[];
}

export interface MyDay {
  tasks: WorkItem[];
  cases: WorkItem[];
  messages: WorkItem[];
  agenda: AgendaDay[];
  leads: WorkItem[];
  /** Rows per section (agenda: all days). */
  counts: Record<MyDaySection, number>;
  /** Agenda rows of today only (the header figure). */
  agendaToday: number;
}

const dayOffset = (day: string, today: string) => Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000);

export const buildMyDay = (items: WorkItem[], now = Date.now()): MyDay => {
  const today = localDay(now);
  const tasks = items.filter((i) => TASK_KINDS.has(i.kind) && (i.bucket === 'overdue' || i.bucket === 'today'));
  const cases = items.filter((i) => CASE_KINDS.has(i.kind) && (i.overdue || i.kind === 'case_stuck'));
  const messages = items.filter((i) => i.kind === 'client_message').sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
  const leads = items.filter((i) => LEAD_KINDS.has(i.kind));

  const byDay = new Map<string, WorkItem[]>();
  for (const i of items) {
    if (!AGENDA_KINDS.has(i.kind)) continue;
    const at = startOf(i);
    if (!at) continue;
    // Something that already started today stays on today; nothing beyond the 7-day window.
    const day = Date.parse(at) < now ? today : localDay(at);
    const offset = dayOffset(day, today);
    if (offset < 0 || offset > 6) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(i);
  }
  const agenda = [...byDay.entries()]
    .map(([day, list]) => ({ day, offset: dayOffset(day, today), items: list.sort((a, b) => Date.parse(startOf(a)!) - Date.parse(startOf(b)!)) }))
    .sort((a, b) => a.offset - b.offset);

  const agendaCount = agenda.reduce((n, d) => n + d.items.length, 0);
  return {
    tasks,
    cases,
    messages,
    agenda,
    leads,
    counts: { tasks: tasks.length, cases: cases.length, messages: messages.length, agenda: agendaCount, leads: leads.length },
    agendaToday: agenda.find((d) => d.offset === 0)?.items.length ?? 0,
  };
};

/** Greeting by the local hour. */
export const greetingKey = (now = new Date()) => {
  const h = now.getHours();
  return h < 5 ? 'evening' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
};
