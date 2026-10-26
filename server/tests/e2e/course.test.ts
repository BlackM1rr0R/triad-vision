import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { PNG_BUFFER, binaryParser } from '../helpers/files';
import { PDFDocument } from 'pdf-lib';
import { STARTER_COURSE, STARTER_SLUG } from '../../src/lib/course/starter.js';
import { runCourseReminders } from '../../src/jobs/course.js';

const L = (s: string) => ({ az: `${s} az`, de: `${s} de`, en: `${s} en`, ru: `${s} ru` });
const LOCALES = ['az', 'de', 'en', 'ru'] as const;

/** Smallest thing that passes the MP4 sniffing: an "ftyp" box with a video brand, padded to 2 KB. */
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(2048, 1)]);
const VTT = Buffer.from('WEBVTT\n\n00:00.000 --> 00:02.000\nSalam\n', 'utf8');

interface BuilderCourse {
  id: string;
  published: boolean;
  problems: string[];
  completeness: Record<string, number>;
  modules: { id: string; lessons: { id: string; kind: string; video: unknown; poster: boolean; subtitles: string[]; questions: unknown[]; completeness: Record<string, number> }[] }[];
}

/** A published course: module 1 = TEXT + VIDEO, module 2 = QUIZ (q1 single → 1, q2 multiple → 0 + 2), pass mark 60 %. */
const buildCourse = async (admin: Agent, opts: { autoEnroll?: string[] } = {}) => {
  let course = expectStatus(
    await admin.post('/api/admin/course/courses').send({ title: L('Course'), description: L('About'), disclaimer: L('Not legal advice'), autoEnrollStatuses: opts.autoEnroll ?? [] }),
    201,
  ).body.course as BuilderCourse;
  const m1 = expectStatus(await admin.post(`/api/admin/course/courses/${course.id}/modules`).send({ title: L('Module 1') }), 201).body.module.id as string;
  const m2 = expectStatus(await admin.post(`/api/admin/course/courses/${course.id}/modules`).send({ title: L('Module 2') }), 201).body.module.id as string;
  const text = expectStatus(await admin.post(`/api/admin/course/modules/${m1}/lessons`).send({ kind: 'TEXT', title: L('Read'), body: L('Body'), minutes: 3 }), 201).body.lesson.id as string;
  const video = expectStatus(await admin.post(`/api/admin/course/modules/${m1}/lessons`).send({ kind: 'VIDEO', title: L('Watch') }), 201).body.lesson.id as string;
  const quiz = expectStatus(await admin.post(`/api/admin/course/modules/${m2}/lessons`).send({ kind: 'QUIZ', title: L('Quiz'), passMark: 60 }), 201).body.lesson.id as string;

  // Not publishable yet: the video and the questions are missing.
  const refused = expectStatus(await admin.post(`/api/admin/course/courses/${course.id}/publish`).send({ published: true }), 400);
  expect(refused.body.error).toBe('COURSE_INCOMPLETE');
  expect(refused.body.message).toContain(`VIDEO_MISSING:${video}`);
  expect(refused.body.message).toContain(`QUIZ_EMPTY:${quiz}`);

  // Quiz validation: a single-choice question has exactly one right option; keys within the options.
  const bad = [{ kind: 'SINGLE', prompt: L('Q'), options: [L('a'), L('b')], correct: [0, 1] }];
  expectStatus(await admin.put(`/api/admin/course/lessons/${quiz}/questions`).send({ questions: bad }), 400);
  expectStatus(await admin.put(`/api/admin/course/lessons/${quiz}/questions`).send({ questions: [{ prompt: L('Q'), options: [L('a'), L('b')], correct: [4] }] }), 400);
  course = expectStatus(
    await admin.put(`/api/admin/course/lessons/${quiz}/questions`).send({
      questions: [
        { kind: 'SINGLE', prompt: L('Q1'), options: [L('a'), L('b'), L('c')], correct: [1], explanation: L('Because b') },
        { kind: 'MULTIPLE', prompt: L('Q2'), options: [L('x'), L('y'), L('z')], correct: [2, 0] },
      ],
    }),
    200,
  ).body.course;

  // Files: a non-video is refused, the video, a poster and German subtitles are stored.
  expectStatus(await admin.post(`/api/admin/course/lessons/${video}/video`).attach('file', Buffer.alloc(4096, 7), { filename: 'fake.mp4', contentType: 'video/mp4' }), 400);
  expectStatus(await admin.post(`/api/admin/course/lessons/${video}/video`).field('duration', '100').attach('file', MP4, { filename: 'lesson.mp4', contentType: 'video/mp4' }), 201);
  expectStatus(await admin.post(`/api/admin/course/lessons/${video}/poster`).attach('file', PNG_BUFFER, { filename: 'poster.png', contentType: 'image/png' }), 201);
  expectStatus(await admin.post(`/api/admin/course/lessons/${video}/subtitles/de`).attach('file', Buffer.from('not vtt'), { filename: 'x.vtt', contentType: 'text/vtt' }), 400);
  course = expectStatus(await admin.post(`/api/admin/course/lessons/${video}/subtitles/de`).attach('file', VTT, { filename: 'de.vtt', contentType: 'text/vtt' }), 201).body.course;
  const v = course.modules[0].lessons.find((l) => l.id === video)!;
  expect(v).toMatchObject({ video: { mime: 'video/mp4', duration: 100 }, poster: true, subtitles: ['de'] });
  expect(course.problems).toEqual([]);

  course = expectStatus(await admin.post(`/api/admin/course/courses/${course.id}/publish`).send({ published: true }), 200).body.course;
  expect(course.published).toBe(true);
  return { courseId: course.id, m1, m2, text, video, quiz };
};

const clientWithCase = async (status: 'DOCUMENTS_PENDING' | 'CONTRACT_SIGNED' = 'DOCUMENTS_PENDING', opts: { firstName?: string; lastName?: string } = {}) => {
  const client = await asClient(opts);
  const c = await createCaseVia(client.agent);
  if (status !== 'DOCUMENTS_PENDING') await prisma.case.update({ where: { id: c.id }, data: { status } });
  return { ...client, caseId: c.id };
};

/** Lets the wall-clock cap on watched seconds allow a big jump (as if `seconds` had passed since the last report). */
const ageProgress = (userId: string, lessonId: string, seconds: number) =>
  prisma.$executeRaw`UPDATE CourseLessonProgress SET updatedAt = DATE_SUB(updatedAt, INTERVAL ${seconds} SECOND) WHERE userId = ${userId} AND lessonId = ${lessonId}`;

describe('course — roles', () => {
  it('ADMIN+ edits courses, STAFF reads and reports, clients and anonymous users are kept out', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const client = await asClient();
    expectStatus(await staff.agent.post('/api/admin/course/courses').send({ title: L('x') }), 403);
    expectStatus(await staff.agent.post('/api/admin/course/courses/starter'), 403);
    const c = expectStatus(await admin.agent.post('/api/admin/course/courses').send({ title: L('x') }), 201).body.course;
    expectStatus(await staff.agent.patch(`/api/admin/course/courses/${c.id}`).send({ title: L('y') }), 403);
    expectStatus(await staff.agent.post(`/api/admin/course/courses/${c.id}/modules`).send({ title: L('m') }), 403);
    expectStatus(await staff.agent.get('/api/admin/course/courses'), 200);
    expectStatus(await staff.agent.get(`/api/admin/course/courses/${c.id}`), 200);
    expectStatus(await staff.agent.get('/api/admin/course/report'), 200);
    expectStatus(await client.agent.get('/api/admin/course/courses'), 403);
    expectStatus(await client.agent.get('/api/admin/course/report'), 403);
    expectStatus(await anon().get('/api/course'), 401);
    expectStatus(await staff.agent.get('/api/course'), 403);
    // Staff without 2FA are stopped by the enrollment gate like on every admin route.
    const no2fa = await asStaff({ twoFactor: false });
    expectStatus(await no2fa.agent.get('/api/admin/course/report'), 403);
    // An empty AZ title is refused.
    expectStatus(await admin.agent.post('/api/admin/course/courses').send({ title: { az: '', de: 'x', en: 'x', ru: 'x' } }), 400);
    expect(await prisma.auditLog.count({ where: { action: 'COURSE_CREATED' } })).toBe(1);
  });
});

describe('course — starter content', () => {
  it('creates "Almaniyaya hazırlıq" once, as a draft, complete in four languages', async () => {
    const admin = await asAdmin();
    const first = expectStatus(await admin.agent.post('/api/admin/course/courses/starter'), 200).body;
    expect(first.created).toBe(true);
    expect(expectStatus(await admin.agent.post('/api/admin/course/courses/starter'), 200).body).toEqual({ created: false, courseId: first.courseId });
    const course = expectStatus(await admin.agent.get(`/api/admin/course/courses/${first.courseId}`), 200).body.course as BuilderCourse & { slug: string; disclaimer: Record<string, string> };
    expect(course.slug).toBe(STARTER_SLUG);
    expect(course.published).toBe(false);
    expect(course.modules).toHaveLength(4);
    expect(course.problems).toEqual([]);
    for (const l of LOCALES) {
      expect(course.completeness[l], l).toBe(100);
      expect(course.disclaimer[l]).toMatch(/.{40,}/);
    }
    for (const m of course.modules) {
      expect(m.lessons.filter((x) => x.kind === 'QUIZ')).toHaveLength(1);
      expect(m.lessons.filter((x) => x.kind === 'TEXT').length).toBeGreaterThanOrEqual(2);
    }
    for (const m of STARTER_COURSE.modules) {
      for (const lesson of m.lessons) {
        for (const q of 'questions' in lesson ? (lesson.questions ?? []) : []) {
          expect(q.correct.every((i) => i < q.options.length)).toBe(true);
          if ((q as { kind?: string }).kind !== 'MULTIPLE') expect(q.correct).toHaveLength(1);
        }
      }
    }
    // The year-bound minimum wage is marked with its year in every language.
    const wage = STARTER_COURSE.modules[0].lessons[1].body!;
    for (const l of LOCALES) expect(wage[l]).toMatch(/2026[\s\S]*13,90|13\.90/);
  });
});

describe('course — enrollment, progress, quiz, certificate', () => {
  it('enrolls automatically by case status, lets staff enroll / remove, and keeps removed enrollments removed', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const { courseId } = await buildCourse(admin.agent, { autoEnroll: ['CONTRACT_SIGNED'] });
    const matching = await clientWithCase('CONTRACT_SIGNED');
    const early = await clientWithCase('DOCUMENTS_PENDING');

    const list = expectStatus(await matching.agent.get('/api/course'), 200).body.courses;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: courseId, progress: { done: 0, total: 3, percent: 0 }, certificate: null });
    expect(expectStatus(await early.agent.get('/api/course'), 200).body.courses).toHaveLength(0);
    expectStatus(await early.agent.get(`/api/course/${courseId}`), 404);

    // Manual enrollment by staff (audited), shown on the case card, then removed.
    expectStatus(await staff.agent.post('/api/admin/course/enrollments').send({ courseId, userId: early.user.id }), 201);
    expect(expectStatus(await early.agent.get('/api/course'), 200).body.courses).toHaveLength(1);
    const card = expectStatus(await staff.agent.get(`/api/admin/course/users/${early.user.id}`), 200).body;
    expect(card.enrollments).toHaveLength(1);
    expect(card.enrollments[0]).toMatchObject({ source: 'MANUAL', progress: { percent: 0 } });
    expectStatus(await staff.agent.post('/api/admin/course/enrollments').send({ courseId, userId: staff.user.id }), 400); // not a client

    const autoId = card.enrollments[0].enrollmentId as string;
    expectStatus(await staff.agent.delete(`/api/admin/course/enrollments/${autoId}`), 200);
    expect(expectStatus(await early.agent.get('/api/course'), 200).body.courses).toHaveLength(0);
    // An automatically enrolled client stays removed even though the case status still matches.
    const matchingEnrollment = await prisma.courseEnrollment.findFirstOrThrow({ where: { userId: matching.user.id } });
    expectStatus(await staff.agent.delete(`/api/admin/course/enrollments/${matchingEnrollment.id}`), 200);
    expect(expectStatus(await matching.agent.get('/api/course'), 200).body.courses).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { action: { in: ['COURSE_ENROLLED', 'COURSE_UNENROLLED'] } } })).toBe(3);
  });

  it('tracks text / video / quiz progress, grades on the server, issues a certificate and verifies it publicly without PII', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const { courseId, text, video, quiz } = await buildCourse(admin.agent, { autoEnroll: ['DOCUMENTS_PENDING'] });
    const client = await clientWithCase('DOCUMENTS_PENDING', { firstName: 'Elvin', lastName: 'Məmmədov' });

    // Opening a lesson marks it started; the quiz comes without answer keys.
    const q = expectStatus(await client.agent.get(`/api/course/lessons/${quiz}`), 200).body.lesson;
    expect(q.questions).toHaveLength(2);
    expect(JSON.stringify(q.questions)).not.toMatch(/correct|explanation/);
    expect(q.progress.startedAt).toBeTruthy();
    expect(q.course.disclaimer.az).toBe('Not legal advice az');

    // Text lesson: done with a click (idempotent).
    expect(expectStatus(await client.agent.post(`/api/course/lessons/${text}/complete`), 200).body.progress).toMatchObject({ done: 1, total: 3 });
    expectStatus(await client.agent.post(`/api/course/lessons/${text}/complete`), 200);
    expectStatus(await client.agent.post(`/api/course/lessons/${video}/complete`), 400); // not a text lesson

    // Video: range requests work; skipping to the end does not count (capped by wall time).
    const ranged = await client.agent.get(`/api/course/lessons/${video}/video`).set('Range', 'bytes=0-99');
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-type']).toBe('video/mp4');
    expectStatus(await client.agent.get(`/api/course/lessons/${video}/subtitles/de.vtt`), 200);
    expectStatus(await client.agent.get(`/api/course/lessons/${video}/subtitles/ru`), 404);
    expectStatus(await client.agent.get(`/api/course/lessons/${video}/poster`), 200);
    let p = expectStatus(await client.agent.post(`/api/course/lessons/${video}/progress`).send({ position: 95, watched: 95 }), 200).body;
    expect(p.progress.watchedSeconds).toBe(30);
    expect(p.progress.positionSeconds).toBe(95);
    expect(p.progress.completedAt).toBeNull();
    await ageProgress(client.user.id, video, 60);
    p = expectStatus(await client.agent.post(`/api/course/lessons/${video}/progress`).send({ position: 89, watched: 89 }), 200).body;
    expect(p.progress.watchedSeconds).toBe(89);
    expect(p.progress.completedAt).toBeNull(); // 89 % < 90 %
    p = expectStatus(await client.agent.post(`/api/course/lessons/${video}/progress`).send({ position: 91, watched: 91 }), 200).body;
    expect(p.progress.completedAt).toBeTruthy();
    expect(p.justCompleted).toBe(true);
    // The resume position stays available on the lesson.
    expect(expectStatus(await client.agent.get(`/api/course/lessons/${video}`), 200).body.lesson.progress.positionSeconds).toBe(91);

    // Quiz: a failed attempt gives right / wrong per question but not the right options.
    const failed = expectStatus(await client.agent.post(`/api/course/lessons/${quiz}/quiz`).send({ answers: [[0], [0]] }), 200).body;
    expect(failed).toMatchObject({ score: 0, passed: false, passMark: 60 });
    expect(failed.results.map((r: { correct: boolean }) => r.correct)).toEqual([false, false]);
    expect(failed.results.every((r: { correctOptions: unknown }) => r.correctOptions === null)).toBe(true);
    expect(failed.results[0].explanation.az).toBe('Because b az');
    expect(failed.certificate).toBeNull();
    // Half right is below 60 %; a multiple-choice answer needs exactly the right set.
    expect(expectStatus(await client.agent.post(`/api/course/lessons/${quiz}/quiz`).send({ answers: [[1], [0]] }), 200).body).toMatchObject({ score: 50, passed: false });
    const passed = expectStatus(await client.agent.post(`/api/course/lessons/${quiz}/quiz`).send({ answers: [[1], [2, 0]] }), 200).body;
    expect(passed).toMatchObject({ score: 100, passed: true, best: { score: 100, attempts: 3 } });
    expect(passed.results[1].correctOptions).toEqual([0, 2]);
    expect(passed.course).toMatchObject({ done: 3, total: 3, percent: 100 });
    expect(passed.certificate.number).toMatch(/^CRS-\d{4}-[A-Z2-9]{6}$/);

    // Certificate: on the course, as a PDF in each language, and publicly verifiable with initials only.
    const view = expectStatus(await client.agent.get(`/api/course/${courseId}`), 200).body.course;
    expect(view.progress.percent).toBe(100);
    const code = view.certificate.code as string;
    expect(code).toMatch(/^[A-Z2-9]{12}$/);
    for (const lang of ['de', 'ru']) {
      const pdf = await client.agent.get(`/api/course/${courseId}/certificate.pdf?lang=${lang}`).buffer(true).parse(binaryParser);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      // The text is drawn with a subset font (not extractable): check the document metadata instead.
      const doc = await PDFDocument.load(pdf.body as Buffer);
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getTitle()).toBe(`${lang === 'de' ? 'ZERTIFIKAT' : 'СЕРТИФИКАТ'} · Course ${lang}`);
      expect(doc.getSubject()).toBe(passed.certificate.number);
    }
    const pub = expectStatus(await anon().get(`/api/certificates/${code}`), 200).body;
    expect(Object.keys(pub).sort()).toEqual(['course', 'initials', 'issuedAt', 'valid']);
    expect(pub).toMatchObject({ valid: true, initials: 'E. M.', course: { de: 'Course de' } });
    const raw = JSON.stringify(pub);
    for (const secret of ['Elvin', 'Məmmədov', client.user.email, client.user.id, passed.certificate.number]) expect(raw).not.toContain(secret);
    expectStatus(await anon().get('/api/certificates/AAAAAAAAAAAA'), 404);
    expectStatus(await anon().get('/api/certificates/bad'), 404);

    // Another client cannot download it; the certificate notification went out once.
    const other = await clientWithCase('DOCUMENTS_PENDING');
    expectStatus(await other.agent.get(`/api/course/${courseId}/certificate.pdf`), 404);
    await expect.poll(() => prisma.notification.count({ where: { userId: client.user.id, type: 'COURSE_CERTIFICATE' } })).toBe(1);

    // Report (STAFF): percent, quiz score, certificate; filters and CSV export.
    const rows = expectStatus(await staff.agent.get(`/api/admin/course/report?courseId=${courseId}`), 200).body.rows;
    const mine = rows.find((r: { user: { id: string } }) => r.user.id === client.user.id);
    expect(mine).toMatchObject({ percent: 100, avgQuiz: 100, certificate: { number: passed.certificate.number }, case: { status: 'DOCUMENTS_PENDING' } });
    expect(rows.find((r: { user: { id: string } }) => r.user.id === other.user.id)).toMatchObject({ percent: 0, certificate: null });
    expect(expectStatus(await staff.agent.get(`/api/admin/course/report?status=APPROVED`), 200).body.rows).toHaveLength(0);
    expect(expectStatus(await staff.agent.get('/api/admin/course/report?staffId=nobody'), 200).body.rows).toHaveLength(0);
    expect(expectStatus(await staff.agent.get(`/api/admin/course/report?q=elvin`), 200).body.rows).toHaveLength(1);
    const csv = expectStatus(await staff.agent.get(`/api/admin/course/report.csv?courseId=${courseId}`), 200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Certificate no.');
    expect(csv.text).toContain(passed.certificate.number);
    expect(await prisma.auditLog.count({ where: { action: 'COURSE_REPORT_EXPORTED' } })).toBe(1);

    // A course with certificates cannot be deleted (verification links must keep working).
    expectStatus(await admin.agent.delete(`/api/admin/course/courses/${courseId}`), 409);
  });

  it('reminds enrolled clients after 7 days without progress, once per idle period', async () => {
    const admin = await asAdmin();
    const { courseId, text } = await buildCourse(admin.agent, { autoEnroll: ['DOCUMENTS_PENDING'] });
    const client = await clientWithCase('DOCUMENTS_PENDING');
    expectStatus(await client.agent.get('/api/course'), 200);
    expectStatus(await client.agent.post(`/api/course/lessons/${text}/complete`), 200);
    const DAY = 24 * 60 * 60 * 1000;
    expect(await runCourseReminders(new Date(Date.now() + 3 * DAY))).toBe(0);
    expect(await runCourseReminders(new Date(Date.now() + 8 * DAY))).toBe(1);
    expect(await runCourseReminders(new Date(Date.now() + 9 * DAY))).toBe(0);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'COURSE_REMINDER' } });
    expect(n.link).toBe(`/account/course/${courseId}`);
    expect(n.title).toBe('Kursa davam edin');
  });

  it('builder: reorders modules / lessons, moves a lesson, deletes, and reports per-language completeness', async () => {
    const admin = await asAdmin();
    let c = expectStatus(await admin.agent.post('/api/admin/course/courses').send({ title: { az: 'Kurs', de: '', en: '', ru: '' } }), 201).body.course as BuilderCourse;
    expect(c.completeness).toMatchObject({ az: 100, de: 0 });
    const a = expectStatus(await admin.agent.post(`/api/admin/course/courses/${c.id}/modules`).send({ title: L('A') }), 201).body.module.id;
    const b = expectStatus(await admin.agent.post(`/api/admin/course/courses/${c.id}/modules`).send({ title: L('B') }), 201).body.module.id;
    const l1 = expectStatus(await admin.agent.post(`/api/admin/course/modules/${a}/lessons`).send({ kind: 'TEXT', title: L('1'), body: { az: 'mətn', de: '', en: '', ru: '' } }), 201).body.lesson.id;
    const l2 = expectStatus(await admin.agent.post(`/api/admin/course/modules/${a}/lessons`).send({ kind: 'TEXT', title: L('2'), body: L('b') }), 201).body.lesson.id;
    c = expectStatus(await admin.agent.post(`/api/admin/course/courses/${c.id}/modules/reorder`).send({ ids: [b, a] }), 200).body.course;
    expect(c.modules.map((m) => m.id)).toEqual([b, a]);
    expectStatus(await admin.agent.post(`/api/admin/course/courses/${c.id}/modules/reorder`).send({ ids: [a] }), 400);
    c = expectStatus(await admin.agent.post(`/api/admin/course/modules/${a}/lessons/reorder`).send({ ids: [l2, l1] }), 200).body.course;
    expect(c.modules[1].lessons.map((l) => l.id)).toEqual([l2, l1]);
    expect(c.modules[1].lessons[1].completeness).toMatchObject({ az: 100, de: 50 });
    c = expectStatus(await admin.agent.patch(`/api/admin/course/lessons/${l1}`).send({ moduleId: b }), 200).body.course;
    expect(c.modules[0].lessons.map((l) => l.id)).toEqual([l1]);
    c = expectStatus(await admin.agent.delete(`/api/admin/course/modules/${a}`), 200).body.course;
    expect(c.modules).toHaveLength(1);
    expect(await prisma.courseLesson.count({ where: { id: l2 } })).toBe(0);
    expectStatus(await admin.agent.delete(`/api/admin/course/courses/${c.id}`), 200);
    expect(await prisma.course.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'COURSE_' } } })).toBeGreaterThanOrEqual(8);
  });
});
