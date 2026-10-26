import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { csvSafe } from '../csvSafe.js';
import { asL10n, l10nText, outlineOf, progressOf, syncAutoEnrollments, type L10n } from './service.js';

/**
 * Progress report for staff: who is enrolled, % complete, quiz scores, certificate yes / no — filterable by
 * course, the client's case status and the assigned staff member; CSV export with the same filters.
 */

export interface ReportFilter {
  courseId?: string;
  status?: CaseStatus;
  staffId?: string;
  q?: string;
}

export interface ReportRow {
  enrollmentId: string;
  course: { id: string; title: L10n | null };
  user: { id: string; firstName: string; lastName: string; email: string };
  case: { id: string; number: string; status: CaseStatus; staff: { id: string; name: string } | null } | null;
  source: string;
  enrolledAt: Date;
  lastActivityAt: Date | null;
  completedAt: Date | null;
  done: number;
  total: number;
  percent: number;
  quizzes: { lessonId: string; title: L10n | null; best: number | null; passed: boolean; attempts: number }[];
  avgQuiz: number | null;
  certificate: { number: string; issuedAt: Date } | null;
}

/** The case a client is mostly about: the newest open main case, else the newest one. */
const mainCaseOf = <T extends { closedAt: Date | null; parentCaseId: string | null; createdAt: Date }>(cases: T[]) =>
  [...cases].sort((a, b) => Number(!!a.closedAt) - Number(!!b.closedAt) || Number(!!a.parentCaseId) - Number(!!b.parentCaseId) || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

export const courseReport = async (f: ReportFilter): Promise<ReportRow[]> => {
  await syncAutoEnrollments({ courseId: f.courseId });
  const enrollments = await prisma.courseEnrollment.findMany({ where: { removedAt: null, ...(f.courseId ? { courseId: f.courseId } : {}) }, orderBy: { enrolledAt: 'desc' }, take: 5000 });
  if (!enrollments.length) return [];
  const userIds = [...new Set(enrollments.map((e) => e.userId))];
  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  const [users, cases, courses, progress, attempts, certs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.case.findMany({
      where: { clientId: { in: userIds } },
      select: { id: true, number: true, status: true, clientId: true, closedAt: true, parentCaseId: true, createdAt: true, assignedStaff: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.course.findMany({ where: { id: { in: courseIds } } }),
    prisma.courseLessonProgress.findMany({ where: { userId: { in: userIds }, courseId: { in: courseIds } }, select: { userId: true, courseId: true, lessonId: true, completedAt: true } }),
    prisma.courseQuizAttempt.groupBy({ by: ['userId', 'lessonId'], where: { userId: { in: userIds }, courseId: { in: courseIds } }, _max: { score: true }, _count: { _all: true } }),
    prisma.courseCertificate.findMany({ where: { userId: { in: userIds }, courseId: { in: courseIds } } }),
  ]);
  const outlines = new Map(await Promise.all(courseIds.map(async (id) => [id, await outlineOf(id)] as const)));
  const userById = new Map(users.map((u) => [u.id, u]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const q = f.q?.trim().toLowerCase();

  const rows: ReportRow[] = [];
  for (const e of enrollments) {
    const u = userById.get(e.userId);
    const course = courseById.get(e.courseId);
    if (!u || !course) continue;
    const c = mainCaseOf(cases.filter((x) => x.clientId === e.userId));
    if (f.status && c?.status !== f.status) continue;
    if (f.staffId && c?.assignedStaff?.id !== f.staffId) continue;
    if (q && ![u.firstName, u.lastName, u.email, c?.number ?? ''].some((s) => s.toLowerCase().includes(q)) && !`${u.firstName} ${u.lastName}`.toLowerCase().includes(q)) continue;
    const { lessons } = outlines.get(e.courseId)!;
    const p = progressOf(lessons, progress.filter((r) => r.userId === e.userId && r.courseId === e.courseId));
    const done = new Set(progress.filter((r) => r.userId === e.userId && r.completedAt).map((r) => r.lessonId));
    const quizzes = lessons
      .filter((l) => l.kind === 'QUIZ')
      .map((l) => {
        const a = attempts.find((x) => x.userId === e.userId && x.lessonId === l.id);
        return { lessonId: l.id, title: asL10n(l.title), best: a?._max.score ?? null, passed: done.has(l.id), attempts: a?._count._all ?? 0 };
      });
    const scored = quizzes.filter((x) => x.best !== null);
    const cert = certs.find((x) => x.userId === e.userId && x.courseId === e.courseId);
    rows.push({
      enrollmentId: e.id,
      course: { id: course.id, title: asL10n(course.title) },
      user: { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email },
      case: c ? { id: c.id, number: c.number, status: c.status, staff: c.assignedStaff ? { id: c.assignedStaff.id, name: `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}`.trim() } : null } : null,
      source: e.source,
      enrolledAt: e.enrolledAt,
      lastActivityAt: e.lastActivityAt,
      completedAt: e.completedAt,
      done: p.done,
      total: p.total,
      percent: p.percent,
      quizzes,
      avgQuiz: scored.length ? Math.round(scored.reduce((n, x) => n + (x.best ?? 0), 0) / scored.length) : null,
      certificate: cert ? { number: cert.number, issuedAt: cert.issuedAt } : null,
    });
  }
  return rows;
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const cell = (v: string | number | null) => {
  const s = csvSafe(String(v ?? ''));
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (semicolon-separated, UTF-8 with BOM for Excel), labels in the requested language. */
export const reportCsv = (rows: ReportRow[], locale: string) => {
  const quizCount = Math.max(0, ...rows.map((r) => r.quizzes.length));
  const head = ['Course', 'First name', 'Last name', 'E-mail', 'Case', 'Case status', 'Staff', 'Source', 'Enrolled', 'Last activity', 'Lessons done', 'Lessons total', 'Percent', 'Average quiz %', ...Array.from({ length: quizCount }, (_, i) => `Quiz ${i + 1} best %`), 'Certificate', 'Certificate no.', 'Completed'];
  const lines = [head.map(cell).join(';')];
  for (const r of rows) {
    lines.push(
      [
        l10nText(r.course.title, locale),
        r.user.firstName,
        r.user.lastName,
        r.user.email,
        r.case?.number ?? '',
        r.case?.status ?? '',
        r.case?.staff?.name ?? '',
        r.source,
        iso(r.enrolledAt),
        iso(r.lastActivityAt),
        r.done,
        r.total,
        r.percent,
        r.avgQuiz ?? '',
        ...Array.from({ length: quizCount }, (_, i) => r.quizzes[i]?.best ?? ''),
        r.certificate ? 'yes' : 'no',
        r.certificate?.number ?? '',
        iso(r.completedAt),
      ]
        .map(cell)
        .join(';'),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
};
