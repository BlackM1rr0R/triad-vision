import { expect } from 'vitest';
import { emailsTo, prisma, waitFor } from './db';

/**
 * Asserts the client got exactly one more in-app notification of `type` (title in their locale)
 * and, unless it is in-app only, an email row with the same title.
 */
export const expectClientNotified = async (
  user: { id: string; email: string },
  type: string,
  title: string | RegExp,
  opts: { email?: boolean; bodyContains?: string } = {},
) => {
  const n = await prisma.notification.findFirst({ where: { userId: user.id, type }, orderBy: { createdAt: 'desc' } });
  expect(n, `notification ${type}`).not.toBeNull();
  if (typeof title === 'string') expect(n!.title).toBe(title);
  else expect(n!.title).toMatch(title);
  if (opts.bodyContains) expect(n!.body).toContain(opts.bodyContains);
  if (opts.email !== false) {
    await waitFor(() =>
      prisma.emailLog.findFirst({ where: { to: user.email, subject: `Triad Vision · ${n!.title}`, status: 'CONSOLE' } }),
    );
  }
  return n!;
};

/** Notification types the client has received so far, oldest first. */
export const clientNotificationTypes = async (userId: string) =>
  (await prisma.notification.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map((n) => n.type);

export const staffNotifications = (userId: string) =>
  prisma.notification.findMany({ where: { userId, type: 'STAFF' }, orderBy: { createdAt: 'asc' } });

export { emailsTo };
