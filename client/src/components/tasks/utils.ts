import i18n, { currentLocale } from '@/i18n';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { errorCode } from '@/lib/api';
import type { Person, TaskFilters, TaskPriority, TaskStatus } from './types';

const t = (key: string, opts?: Record<string, unknown>): string => String(i18n.t(key, opts));

export const fullName = (p: Pick<Person, 'firstName' | 'lastName'> | null | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : '');
export const initials = (p: Pick<Person, 'firstName' | 'lastName'>) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase() || '?';

const AVATAR_TONES = [
  'bg-brand-100 text-brand-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-800',
  'bg-red-100 text-red-700',
];
export const avatarTone = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

export const statusLabel = (s: TaskStatus) => t(`tasks.status.${s}`);
export const priorityLabel = (p: TaskPriority) => t(`tasks.priority.${p}`);

export const STATUS_TONE: Record<TaskStatus, string> = toneClasses(STATUS_TONES.task);
export const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: 'bg-slate-400',
  IN_PROGRESS: 'bg-brand-500',
  REVIEW: 'bg-violet-500',
  DONE: 'bg-emerald-500',
  CANCELLED: 'bg-slate-300',
};
export const PRIORITY_TONE: Record<TaskPriority, string> = toneClasses(STATUS_TONES.taskPriority);

export const errorText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`tasks.errors.${code}`) ? t(`tasks.errors.${code}`) : t('tasks.toast.failed');
};

// ─── Dates (always the browser's local time) ───────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const DEFAULT_DUE_TIME = '18:00';

export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toDateInput = (iso: string | null | undefined) => (iso ? dayKey(new Date(iso)) : '');
export const toTimeInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Local date ('YYYY-MM-DD') + time ('HH:MM') → ISO (UTC). */
export const fromInputs = (date: string, time: string) => {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || DEFAULT_DUE_TIME).split(':').map(Number);
  const v = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  return Number.isNaN(v.getTime()) ? null : v.toISOString();
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dayDiff = (iso: string, now = new Date()) =>
  Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(now).getTime()) / 86_400_000);

const monthsShort = () => i18n.t('tasks.calendar.monthsShort', { returnObjects: true }) as unknown as string[];
export const monthNames = () => i18n.t('tasks.calendar.months', { returnObjects: true }) as unknown as string[];
export const weekdayNames = () => i18n.t('tasks.calendar.weekdays', { returnObjects: true }) as unknown as string[];

/** "15 okt" / "15. Okt." / "Oct 15"-style short day, with the year when not the current one. */
export const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const m = monthsShort()[d.getMonth()] ?? '';
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return currentLocale() === 'de' ? `${d.getDate()}. ${m}${year}` : `${d.getDate()} ${m}${year}`;
};
export const fmtTime = (iso: string) => toTimeInput(iso);
export const fmtDayTime = (iso: string) => `${fmtDay(iso)}, ${fmtTime(iso)}`;

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'done';

export const dueState = (dueAt: string | null, status: TaskStatus, now = new Date()): DueState | null => {
  if (!dueAt) return null;
  if (status === 'DONE' || status === 'CANCELLED') return 'done';
  if (new Date(dueAt).getTime() < now.getTime()) return 'overdue';
  const diff = dayDiff(dueAt, now);
  if (diff === 0) return 'today';
  if (diff <= 2) return 'soon';
  return 'later';
};

export const DUE_TONE: Record<DueState, string> = toneClasses(STATUS_TONES.taskDue);

/** "Today 14:00", "Tomorrow", "15 Oct", … for chips. */
export const dueLabel = (dueAt: string) => {
  const diff = dayDiff(dueAt);
  const time = fmtTime(dueAt);
  if (diff === 0) return `${t('tasks.due.today')}, ${time}`;
  if (diff === 1) return `${t('tasks.due.tomorrow')}, ${time}`;
  if (diff === -1) return t('tasks.due.yesterday');
  return fmtDay(dueAt);
};

// ─── Filters ⇄ URL ─────────────────────────────────────────────────────

export const EMPTY_FILTERS: TaskFilters = { assignee: '', priority: [], status: [], due: '', caseId: '', search: '', cancelled: false };

export const activeFilterCount = (f: TaskFilters) =>
  [f.assignee && f.assignee !== 'me', f.priority.length, f.status.length, f.due, f.caseId, f.cancelled].filter(Boolean).length;

/** Query string for GET /api/tasks from UI filters (assignee 'me' is decided by the scope switch). */
export const filterParams = (f: TaskFilters, mine: boolean): Record<string, string> => {
  const p: Record<string, string> = { tzOffset: String(new Date().getTimezoneOffset()) };
  const assignee = mine ? 'me' : f.assignee;
  if (assignee) p.assignee = assignee;
  if (f.priority.length) p.priority = f.priority.join(',');
  const statuses = f.status.length ? f.status : [];
  if (statuses.length) p.status = (f.cancelled && !statuses.includes('CANCELLED') ? [...statuses, 'CANCELLED'] : statuses).join(',');
  else if (f.cancelled) p.status = 'TODO,IN_PROGRESS,REVIEW,DONE,CANCELLED';
  if (f.due) p.due = f.due;
  if (f.caseId) p.caseId = f.caseId;
  if (f.search.trim()) p.search = f.search.trim();
  return p;
};

// ─── Comment text: URLs and @mentions ──────────────────────────────────

export type RichPart = { type: 'text'; text: string } | { type: 'link'; href: string; text: string } | { type: 'mention'; id: string; name: string };

const MENTION_RE = /@\[([^\]\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,40})\)/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

const linkParts = (text: string): RichPart[] => {
  const out: RichPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // Trailing punctuation belongs to the sentence, not the URL.
    const trail = /[).,;:!?»”'"]+$/.exec(url);
    if (trail) url = url.slice(0, -trail[0].length);
    const start = m.index ?? 0;
    if (start > last) out.push({ type: 'text', text: text.slice(last, start) });
    out.push({ type: 'link', href: url, text: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
};

/** Splits plain text into text, safe http(s) links and mention chips (rendered as React nodes, never HTML). */
export const richParts = (text: string): RichPart[] => {
  const out: RichPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(...linkParts(text.slice(last, start)));
    out.push({ type: 'mention', name: m[1], id: m[2] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push(...linkParts(text.slice(last)));
  return out;
};

/** Token form stored on the server. */
export const mentionToken = (p: Person) => `@[${fullName(p).replace(/[[\]\n]/g, '')}](user:${p.id})`;
/** Editor form: tokens become "@Full Name"; returns the people mentioned so they can be restored. */
export const tokensToEditor = (body: string) => {
  const people: Person[] = [];
  const text = body.replace(MENTION_RE, (_m, name: string, id: string) => {
    const [firstName, ...rest] = name.split(' ');
    people.push({ id, firstName, lastName: rest.join(' ') });
    return `@${name}`;
  });
  return { text, people };
};
/** Editor text → stored body: "@Full Name" of picked people becomes a token. */
export const editorToTokens = (text: string, picked: Person[]) => {
  let out = text;
  const sorted = [...picked].sort((a, b) => fullName(b).length - fullName(a).length);
  for (const p of sorted) {
    const plain = `@${fullName(p)}`;
    out = out.split(plain).join(`\u0000${p.id}\u0000`);
  }
  for (const p of sorted) out = out.split(`\u0000${p.id}\u0000`).join(mentionToken(p));
  return out;
};
