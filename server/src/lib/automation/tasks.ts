import type { TaskPriority } from '@prisma/client';
import { prisma } from '../../db.js';
import { activeStaff, activityRow, createNumbered, taskKey } from '../tasks/core.js';
import { notifyAssigned } from '../tasks/notify.js';

/** Actor shown in task notifications for work created by automation rules / auto-assignment. */
export const AUTOMATION_ACTOR = { id: 'automation', firstName: 'Triad Vision', lastName: '' };

/** Creates a team task (top of the TODO column) and notifies the assignees, like a staff-created task. */
export const createAutomationTask = async (input: {
  title: string;
  description?: string | null;
  assigneeIds: string[];
  dueAt?: Date | null;
  priority?: TaskPriority;
  caseId?: string | null;
  createdById?: string | null;
}) => {
  const assignees = await activeStaff([...new Set(input.assigneeIds)]);
  const task = await createNumbered(async (tx, number) => {
    const min = await tx.task.aggregate({ where: { status: 'TODO' }, _min: { sortOrder: true } });
    const t = await tx.task.create({
      data: {
        number,
        title: input.title.slice(0, 200),
        description: input.description?.slice(0, 8000) || null,
        status: 'TODO',
        priority: input.priority ?? 'NORMAL',
        dueAt: input.dueAt ?? null,
        sortOrder: min._min.sortOrder === null ? 0 : min._min.sortOrder - 1024,
        caseId: input.caseId ?? null,
        createdById: input.createdById ?? null,
        assignees: { create: assignees.map((a) => ({ userId: a.id })) },
      },
    });
    if (input.createdById) await tx.taskComment.create({ data: activityRow(t.id, input.createdById, { type: 'created' }) });
    return t;
  });
  await notifyAssigned(task, assignees.map((a) => a.id), AUTOMATION_ACTOR);
  return { id: task.id, number: task.number, key: taskKey(task.number), assigneeIds: assignees.map((a) => a.id) };
};
