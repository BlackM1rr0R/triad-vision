import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyUser } from '../lib/notifications.js';
import { l10nText, syncAutoEnrollments, type CourseLocale } from '../lib/course/service.js';
import { REMINDER } from '../lib/course/texts.js';
import { claimReminder } from './reminders.js';

/**
 * Pre-departure course, hourly:
 *  - automatic enrollment of clients whose case reached one of a course's statuses;
 *  - one reminder per idle period to enrolled clients who have not progressed for 7 days (never started:
 *    7 days after enrollment). The ReminderLog key carries the last activity, so a client who continues
 *    and stops again gets one new reminder, never a daily one.
 * Takes `now` so tests can drive time.
 */

const HOUR = 60 * 60 * 1000;
export const COURSE_IDLE_DAYS = 7;

export const runCourseReminders = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - COURSE_IDLE_DAYS * 24 * HOUR);
  const idle = await prisma.courseEnrollment.findMany({
    where: { removedAt: null, completedAt: null, OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null, enrolledAt: { lt: cutoff } }] },
    take: 2000,
  });
  if (!idle.length) return 0;
  const [courses, users] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: [...new Set(idle.map((e) => e.courseId))] }, published: true }, select: { id: true, title: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(idle.map((e) => e.userId))] }, isActive: true, role: 'CLIENT' }, select: { id: true, locale: true } }),
  ]);
  let sent = 0;
  for (const e of idle) {
    const course = courses.find((c) => c.id === e.courseId);
    const user = users.find((u) => u.id === e.userId);
    if (!course || !user) continue;
    const since = (e.lastActivityAt ?? e.enrolledAt).toISOString();
    if (!(await claimReminder(`course-idle:${e.id}:${since}`, now))) continue;
    const locale = user.locale as CourseLocale;
    const t = (REMINDER[locale] ?? REMINDER.az)({ course: l10nText(course.title, locale) });
    await notifyUser(user.id, { type: 'COURSE_REMINDER', title: t.title, body: t.body, link: `/account/course/${course.id}` }).catch((err) => console.error('[job:course] notification failed', err));
    sent++;
  }
  return sent;
};

registerJob({
  name: 'course',
  everyMs: HOUR,
  run: async () => {
    await syncAutoEnrollments();
    await runCourseReminders();
  },
});
