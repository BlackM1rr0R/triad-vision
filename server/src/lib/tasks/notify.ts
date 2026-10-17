import type { TaskStatus } from '@prisma/client';
import { notifyUser } from '../notifications.js';
import { activeStaff, fullName, plainText, taskKey } from './core.js';
import { formatTaskDue, taskTexts } from './texts.js';

/**
 * Task notifications (in-app always; push and email follow each recipient's preferences, in the
 * recipient's language). The actor never gets a notification about their own action. Failures are
 * logged and never break the request that triggered them.
 */

export interface TaskRef {
  id: string;
  number: number;
  title: string;
  dueAt: Date | null;
  createdById: string | null;
}

type Person = { id: string; firstName: string; lastName: string };

export const taskLink = (number: number) => `/workspace/tasks/${taskKey(number)}`;

export const TASK_NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_STATUS',
  'TASK_COMMENT',
  'TASK_MENTION',
  'TASK_DUE_SOON',
  'TASK_DUE_NOW',
  'TASK_OVERDUE',
  'TASK_DIGEST',
] as const;

const safely = async (what: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (err) {
    console.error(`[tasks] notification failed: ${what}`, err);
  }
};

const others = (ids: (string | null | undefined)[], actorId: string) =>
  [...new Set(ids.filter((x): x is string => !!x && x !== actorId))];

export const notifyAssigned = (task: TaskRef, userIds: string[], actor: Person) =>
  safely('assigned', async () => {
    for (const u of await activeStaff(others(userIds, actor.id))) {
      const tx = taskTexts(u.locale);
      const msg = tx.assigned({
        key: taskKey(task.number),
        title: task.title,
        actor: fullName(actor),
        due: task.dueAt ? formatTaskDue(task.dueAt, u.locale) : undefined,
      });
      // Being assigned is work, not a newsletter: the e-mail goes out whatever the notification settings say.
      await notifyUser(u.id, { type: 'TASK_ASSIGNED', ...msg, link: taskLink(task.number), ctaLabel: tx.cta.task, forceEmail: true });
    }
  });

export const notifyStatus = (task: TaskRef, assigneeIds: string[], status: TaskStatus, actor: Person) =>
  safely('status', async () => {
    for (const u of await activeStaff(others([task.createdById, ...assigneeIds], actor.id))) {
      const tx = taskTexts(u.locale);
      const msg = tx.status({ key: taskKey(task.number), title: task.title, actor: fullName(actor), status });
      await notifyUser(u.id, { type: 'TASK_STATUS', ...msg, link: taskLink(task.number), ctaLabel: tx.cta.task });
    }
  });

/** Mentioned people get a "mentioned you" message; the creator and assignees get "new comment". */
export const notifyComment = (task: TaskRef, assigneeIds: string[], body: string, mentioned: string[], actor: Person) =>
  safely('comment', async () => {
    const excerpt = plainText(body);
    const mentionedSet = new Set(mentioned);
    for (const u of await activeStaff(others(mentioned, actor.id))) {
      const tx = taskTexts(u.locale);
      const msg = tx.mention({ key: taskKey(task.number), title: task.title, actor: fullName(actor), excerpt });
      await notifyUser(u.id, { type: 'TASK_MENTION', ...msg, link: taskLink(task.number), ctaLabel: tx.cta.task });
    }
    const watchers = others([task.createdById, ...assigneeIds], actor.id).filter((id) => !mentionedSet.has(id));
    for (const u of await activeStaff(watchers)) {
      const tx = taskTexts(u.locale);
      const msg = tx.comment({ key: taskKey(task.number), title: task.title, actor: fullName(actor), excerpt });
      await notifyUser(u.id, { type: 'TASK_COMMENT', ...msg, link: taskLink(task.number), ctaLabel: tx.cta.task });
    }
  });
