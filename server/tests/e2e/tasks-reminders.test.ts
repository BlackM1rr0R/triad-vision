import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../helpers/db';
import { createStaff } from '../helpers/factories';
import { nextMorningAfter, runTaskDeadlineReminders, runTaskDigest } from '../../src/jobs/tasks.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

const HOUR = 3600_000;
let n = 0;

const makeTask = (data: Partial<Prisma.TaskUncheckedCreateInput> & { assigneeIds?: string[] }) => {
  const { assigneeIds = [], ...rest } = data;
  return prisma.task.create({
    data: {
      number: ++n + 1000,
      title: 'Prepare contract',
      ...rest,
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
    },
  });
};

const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type }, orderBy: { createdAt: 'asc' } });

describe('task reminder job', () => {
  it('is registered', () => {
    expect(registeredJobs()).toContain('task-reminders');
  });

  it('computes the next 09:00 Baku after a deadline', () => {
    expect(nextMorningAfter(new Date('2030-03-10T10:00:00Z')).toISOString()).toBe('2030-03-11T05:00:00.000Z'); // 14:00 Baku → next day 09:00
    expect(nextMorningAfter(new Date('2030-03-10T03:00:00Z')).toISOString()).toBe('2030-03-10T05:00:00.000Z'); // 07:00 Baku → same day 09:00
    expect(nextMorningAfter(new Date('2030-03-10T05:00:00Z')).toISOString()).toBe('2030-03-11T05:00:00.000Z'); // exactly 09:00 → next day
  });

  it('sends 24 h, due-now and overdue reminders once each, to assignees in their language; a new deadline re-arms them', async () => {
    const { user: de } = await createStaff({ locale: 'de' });
    const { user: az } = await createStaff({ locale: 'az' });
    const due = new Date('2030-03-12T10:00:00Z'); // 14:00 Baku
    const t = await makeTask({ dueAt: due, assigneeIds: [de.id, az.id] });

    await runTaskDeadlineReminders(new Date(due.getTime() - 30 * HOUR)); // too early
    expect(await notes(de.id, 'TASK_DUE_SOON')).toHaveLength(0);

    const soon = new Date(due.getTime() - 20 * HOUR);
    await runTaskDeadlineReminders(soon);
    await runTaskDeadlineReminders(soon);
    const [d1] = await notes(de.id, 'TASK_DUE_SOON');
    expect(d1.title).toBe('Frist rückt näher: T-1001');
    expect(d1.body).toContain('12. März 2030, 14:00 (Baku)');
    expect(d1.link).toBe('/workspace/tasks/T-1001');
    const [a1] = await notes(az.id, 'TASK_DUE_SOON');
    expect(a1.body).toContain('12 mar 2030, 14:00 (Bakı)');
    expect(await notes(de.id, 'TASK_DUE_SOON')).toHaveLength(1);

    // at the deadline
    await runTaskDeadlineReminders(new Date(due.getTime() + 10 * 60_000));
    await runTaskDeadlineReminders(new Date(due.getTime() + 20 * 60_000));
    expect(await notes(de.id, 'TASK_DUE_NOW')).toHaveLength(1);
    expect((await notes(az.id, 'TASK_DUE_NOW'))[0].title).toBe('Tapşırığın vaxtı çatdı: T-1001');

    // overdue: not in the evening, but once the next morning at 09:00 Baku
    await runTaskDeadlineReminders(new Date('2030-03-12T16:00:00Z'));
    expect(await notes(de.id, 'TASK_OVERDUE')).toHaveLength(0);
    await runTaskDeadlineReminders(new Date('2030-03-13T05:05:00Z'));
    await runTaskDeadlineReminders(new Date('2030-03-13T05:20:00Z'));
    expect(await notes(de.id, 'TASK_OVERDUE')).toHaveLength(1);
    expect((await notes(de.id, 'TASK_OVERDUE'))[0].title).toBe('Aufgabe überfällig: T-1001');

    // moving the deadline re-arms the 24 h reminder
    const newDue = new Date('2030-03-20T10:00:00Z');
    await prisma.task.update({ where: { id: t.id }, data: { dueAt: newDue } });
    await runTaskDeadlineReminders(new Date(newDue.getTime() - 5 * HOUR));
    expect(await notes(de.id, 'TASK_DUE_SOON')).toHaveLength(2);
  });

  it('skips finished tasks and inactive users; falls back to the creator when no active assignee', async () => {
    const { user: creator } = await createStaff({ locale: 'en' });
    const { user: gone } = await createStaff({ isActive: false });
    const due = new Date('2030-04-01T10:00:00Z');
    await makeTask({ dueAt: due, status: 'DONE', assigneeIds: [creator.id] });
    await makeTask({ dueAt: due, assigneeIds: [gone.id], createdById: creator.id, title: 'Inactive assignee' });
    await makeTask({ dueAt: due, createdById: creator.id, title: 'Nobody assigned' });
    await runTaskDeadlineReminders(new Date(due.getTime() - 3 * HOUR));
    const got = await notes(creator.id, 'TASK_DUE_SOON');
    // the inactive assignee is skipped, so the creator is reminded about both open tasks
    expect(got.map((x) => x.body)).toEqual([expect.stringContaining('Inactive assignee'), expect.stringContaining('Nobody assigned')]);
    expect(got[1].title).toBe('Deadline approaching: T-1004');
    expect(await notes(gone.id, 'TASK_DUE_SOON')).toHaveLength(0);
  });

  it('does not send a 24 h reminder when less than an hour is left, nor stale due-now reminders', async () => {
    const { user: s } = await createStaff();
    const due = new Date('2030-05-01T10:00:00Z');
    await makeTask({ dueAt: due, assigneeIds: [s.id] });
    await runTaskDeadlineReminders(new Date(due.getTime() - 30 * 60_000));
    expect(await notes(s.id, 'TASK_DUE_SOON')).toHaveLength(0);
    await runTaskDeadlineReminders(new Date(due.getTime() + 3 * HOUR));
    expect(await notes(s.id, 'TASK_DUE_NOW')).toHaveLength(0);
  });
});

describe('task morning digest', () => {
  it('lists open tasks due today or overdue once per day per assignee, only in the morning', async () => {
    const { user: s } = await createStaff({ locale: 'ru' });
    const { user: free } = await createStaff();
    const day = new Date('2030-06-10T00:00:00Z');
    await makeTask({ title: 'Old one', dueAt: new Date('2030-06-08T08:00:00Z'), assigneeIds: [s.id] });
    await makeTask({ title: 'Today one', dueAt: new Date('2030-06-10T12:00:00Z'), assigneeIds: [s.id] });
    await makeTask({ title: 'Next week', dueAt: new Date('2030-06-17T12:00:00Z'), assigneeIds: [s.id] });
    await makeTask({ title: 'Done', status: 'DONE', dueAt: new Date('2030-06-10T12:00:00Z'), assigneeIds: [s.id] });

    await runTaskDigest(new Date(day.getTime() + 2 * HOUR)); // 06:00 Baku: too early
    expect(await notes(s.id, 'TASK_DIGEST')).toHaveLength(0);
    await runTaskDigest(new Date(day.getTime() + 4.5 * HOUR)); // 08:30 Baku
    await runTaskDigest(new Date(day.getTime() + 5 * HOUR));
    const got = await notes(s.id, 'TASK_DIGEST');
    expect(got).toHaveLength(1);
    expect(got[0].title).toBe('Ваши задачи на сегодня: 2 (просрочено: 1)');
    expect(got[0].body).toContain('Old one');
    expect(got[0].body).toContain('Today one');
    expect(got[0].body).not.toContain('Next week');
    expect(got[0].body).not.toContain('Done');
    expect(await notes(free.id, 'TASK_DIGEST')).toHaveLength(0);

    // the next day again
    await runTaskDigest(new Date(day.getTime() + 24 * HOUR + 5 * HOUR));
    expect(await notes(s.id, 'TASK_DIGEST')).toHaveLength(2);
    // afternoon: no digest
    await prisma.reminderLog.deleteMany();
    await runTaskDigest(new Date(day.getTime() + 2 * 24 * HOUR + 10 * HOUR)); // 14:00 Baku
    expect(await notes(s.id, 'TASK_DIGEST')).toHaveLength(2);
  });
});
