import type { TaskStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { activeStaff, activityRow, createNumbered, taskKey } from '../tasks/core.js';
import { notifyAssigned } from '../tasks/notify.js';

/**
 * "Create a task" from a drive comment: the same steps as POST /api/tasks (numbering with retry, the
 * "created" activity entry, assignee notifications) with the drive file attached the way task
 * attachments are stored (TaskAttachment → DriveNode).
 */

const GAP = 1024;

export interface TaskFromDriveInput {
  title: string;
  description: string | null;
  assigneeIds: string[];
  dueAt: Date | null;
  nodeId: string;
  actor: { id: string; firstName: string; lastName: string };
}

export const createTaskWithFile = async (input: TaskFromDriveInput) => {
  const unique = [...new Set(input.assigneeIds)];
  const assignees = await activeStaff(unique);
  if (assignees.length !== unique.length) throw badRequest('INVALID_ASSIGNEE');
  const status: TaskStatus = 'TODO';
  const task = await createNumbered(async (tx, number) => {
    const min = await tx.task.aggregate({ where: { status }, _min: { sortOrder: true } });
    const t = await tx.task.create({
      data: {
        number,
        title: input.title,
        description: input.description,
        status,
        priority: 'NORMAL',
        dueAt: input.dueAt,
        sortOrder: min._min.sortOrder === null ? 0 : min._min.sortOrder - GAP,
        createdById: input.actor.id,
        assignees: { create: assignees.map((a) => ({ userId: a.id })) },
        attachments: { create: [{ nodeId: input.nodeId }] },
      },
    });
    await tx.taskComment.create({ data: activityRow(t.id, input.actor.id, { type: 'created' }) });
    return t;
  });
  await notifyAssigned(task, assignees.map((a) => a.id), input.actor);
  return task;
};

/** Status chips for comments that became tasks. */
export const taskChips = async (taskIds: string[]) => {
  const ids = [...new Set(taskIds.filter(Boolean))];
  if (!ids.length) return new Map<string, { id: string; number: number; key: string; title: string; status: TaskStatus; dueAt: Date | null }>();
  const rows = await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, title: true, status: true, dueAt: true } });
  return new Map(rows.map((r) => [r.id, { ...r, key: taskKey(r.number) }]));
};
