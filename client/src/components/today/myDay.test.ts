import { describe, expect, it } from 'vitest';
import type { WorkItem } from './api';
import { buildMyDay, greetingKey, localDay, startOf } from './myDay';

const HOUR = 3_600_000;
// A fixed local noon keeps "today" / "tomorrow" stable in any time zone.
const NOW = new Date(2030, 4, 15, 12, 0, 0).getTime();
const at = (h: number) => new Date(NOW + h * HOUR).toISOString();

const item = (id: string, kind: WorkItem['kind'], extra: Partial<WorkItem> = {}): WorkItem => ({
  id,
  kind,
  category: 'other',
  title: id,
  subtitle: null,
  priority: 'NORMAL',
  dueAt: null,
  since: at(-48),
  ageHours: 48,
  overdue: false,
  bucket: 'today',
  link: '/',
  refs: {},
  assignee: null,
  actions: [],
  ...extra,
});

describe('buildMyDay', () => {
  it('keeps today\'s and overdue tasks, not the rest of the week', () => {
    const d = buildMyDay(
      [
        item('t-over', 'task', { bucket: 'overdue', overdue: true }),
        item('t-today', 'task', { bucket: 'today' }),
        item('t-week', 'task', { bucket: 'week' }),
        item('ct', 'client_task_overdue', { bucket: 'overdue', overdue: true }),
      ],
      NOW,
    );
    expect(d.tasks.map((i) => i.id)).toEqual(['t-over', 't-today', 'ct']);
  });

  it('lists late case work and every stuck case; unanswered messages oldest first; new leads', () => {
    const d = buildMyDay(
      [
        item('waiting-late', 'case_waiting', { overdue: true }),
        item('waiting-ok', 'case_waiting'),
        item('stuck', 'case_stuck'),
        item('doc-late', 'doc_review', { overdue: true }),
        item('m-new', 'client_message', { since: at(-2) }),
        item('m-old', 'client_message', { since: at(-30) }),
        item('lead', 'inquiry'),
        item('app', 'application'),
        item('mail', 'mail_unread'),
      ],
      NOW,
    );
    expect(d.cases.map((i) => i.id)).toEqual(['waiting-late', 'stuck', 'doc-late']);
    expect(d.messages.map((i) => i.id)).toEqual(['m-old', 'm-new']);
    expect(d.leads.map((i) => i.id)).toEqual(['lead', 'app']);
    expect(d.counts).toMatchObject({ cases: 3, messages: 2, leads: 2, tasks: 0, agenda: 0 });
  });

  it('puts appointments, interviews and consultations on their day of the coming week, by time', () => {
    const d = buildMyDay(
      [
        item('embassy-tomorrow', 'appointment', { dueAt: at(24) }),
        item('interview-later', 'interview', { dueAt: at(3.5), refs: { startsAt: at(3) } }),
        item('interview-running', 'interview', { dueAt: at(0.5), refs: { startsAt: at(-0.25) } }),
        item('booking', 'booking', { dueAt: at(1), actions: [{ key: 'done', label: 'done', type: 'api', notBefore: at(1) }] }),
        item('far', 'appointment', { dueAt: at(24 * 9) }),
      ],
      NOW,
    );
    expect(d.agenda.map((g) => [g.offset, g.items.map((i) => i.id)])).toEqual([
      [0, ['interview-running', 'booking', 'interview-later']],
      [1, ['embassy-tomorrow']],
    ]);
    expect(d.agenda[0].day).toBe(localDay(NOW));
    expect(d.agendaToday).toBe(3);
    expect(d.counts.agenda).toBe(4);
  });

  it('reads the start of a row', () => {
    expect(startOf(item('a', 'interview', { dueAt: at(1), refs: { startsAt: at(0.5) } }))).toBe(at(0.5));
    expect(startOf(item('b', 'appointment', { dueAt: at(2) }))).toBe(at(2));
  });

  it('greets by the time of day', () => {
    expect(greetingKey(new Date(2030, 0, 1, 8))).toBe('morning');
    expect(greetingKey(new Date(2030, 0, 1, 14))).toBe('afternoon');
    expect(greetingKey(new Date(2030, 0, 1, 21))).toBe('evening');
  });
});
