import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { runHandovers } from '../../src/lib/assignment/handover.js';
import { buildMyWork } from '../../src/lib/myWork.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Noon in Baku on a September 2026 day. */
const sep = (d: number, h = 12) => new Date(Date.UTC(2026, 8, d, h - 4));

// ─── KPI ───────────────────────────────────────────────────────────────

describe('staff KPI', () => {
  it('consolidates cases, documents, replies, surveys, revenue, hours, tasks and four-eyes checks per month', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const other = await asStaff();
    const client = await asClient();

    // Closed + approved in September: created 1 Sep, documents review 3 Sep, decision 11 Sep.
    const c1 = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c1.id }, data: { assignedStaffId: staff.user.id, createdAt: sep(1), status: 'APPROVED', decisionAt: sep(11), closedAt: sep(11) } });
    await prisma.caseEvent.createMany({
      data: [
        { caseId: c1.id, type: 'STATUS_CHANGED', fromStatus: 'DOCUMENTS_PENDING', toStatus: 'DOCUMENTS_REVIEW', createdAt: sep(3), actorId: staff.user.id },
        { caseId: c1.id, type: 'STATUS_CHANGED', fromStatus: 'DOCUMENTS_REVIEW', toStatus: 'APPROVED', createdAt: sep(11), actorId: staff.user.id },
        { caseId: c1.id, type: 'DOCUMENT_ACCEPTED', createdAt: sep(4), actorId: staff.user.id },
        { caseId: c1.id, type: 'DOCUMENT_REJECTED', createdAt: sep(4), actorId: staff.user.id },
        { caseId: c1.id, type: 'DOCUMENT_ACCEPTED', createdAt: sep(4), actorId: other.user.id },
      ],
    });
    // Cancelled in September (not counted in the decision duration). And one closed in August.
    const c2 = await createCaseVia((await asClient()).agent);
    await prisma.case.update({ where: { id: c2.id }, data: { assignedStaffId: staff.user.id, createdAt: sep(5), status: 'CANCELLED', closedAt: sep(20) } });
    const c3 = await createCaseVia((await asClient()).agent);
    await prisma.case.update({ where: { id: c3.id }, data: { assignedStaffId: staff.user.id, createdAt: new Date(Date.UTC(2026, 6, 1)), status: 'REJECTED', decisionAt: new Date(Date.UTC(2026, 7, 10)), closedAt: new Date(Date.UTC(2026, 7, 10)) } });

    // Client wrote at 09:00, staff replied 3 h later.
    await prisma.caseMessage.createMany({
      data: [
        { caseId: c1.id, authorId: client.user.id, body: 'Salam', createdAt: sep(6, 9) },
        { caseId: c1.id, authorId: staff.user.id, body: 'Salam!', createdAt: sep(6, 12) },
      ],
    });
    await prisma.satisfactionSurvey.create({
      data: { caseId: c1.id, clientId: client.user.id, staffId: staff.user.id, trigger: 'VISA_APPROVED', tokenHash: 'a'.repeat(64), score: 10, ratings: { communication: 5, speed: 4 }, sentAt: sep(12), answeredAt: sep(13) },
    });
    await prisma.timeEntry.create({ data: { userId: staff.user.id, caseId: c1.id, startedAt: sep(7, 9), endedAt: sep(7, 11), minutes: 120, source: 'MANUAL' } });
    // Costs: a courier expense (plus the labour of the time entry) → negative margin, no revenue.
    await prisma.caseCost.create({ data: { caseId: c1.id, category: 'COURIER', amountCents: 5000, currency: 'EUR', fxRate: 2, incurredAt: sep(9) } });
    const done = await prisma.task.create({ data: { number: 90001, title: 'Done', status: 'DONE', completedAt: sep(8), dueAt: sep(9), assignees: { create: { userId: staff.user.id } } } });
    await prisma.task.create({ data: { number: 90002, title: 'Late', status: 'TODO', dueAt: sep(15), assignees: { create: { userId: staff.user.id } } } });
    await prisma.embassyPackageApproval.create({ data: { caseId: c2.id, requestedById: other.user.id, reviewerId: staff.user.id, status: 'APPROVED', reviewedAt: sep(18) } });

    const card = expectStatus(await admin.agent.get(`/api/admin/kpi/staff/${staff.user.id}?month=2026-09`), 200).body;
    expect(card.month).toBe('2026-09');
    expect(card.months).toHaveLength(6);
    expect(card.current).toMatchObject({
      closed: 2,
      approved: 1,
      cancelled: 1,
      rejected: 0,
      assigned: 2,
      avgCaseDays: 10,
      docsReviewed: 2,
      docsAccepted: 1,
      docsRejected: 1,
      responses: 1,
      avgFirstResponseHours: 3,
      surveys: 1,
      nps: 100,
      csat: 4.5,
      minutes: 120,
      tasksDone: 1,
      tasksOverdue: 1,
      approvalsGiven: 1,
    });
    // c1: 2 days pending + 8 in review; c2 (cancelled, no status changes): 15 days pending → average 8.5.
    expect(card.current.stageDays).toMatchObject({ DOCUMENTS_PENDING: 8.5, DOCUMENTS_REVIEW: 8 });
    expect(card.current.revenueCents).toBe(0);
    expect(card.current.marginCents).toBeLessThanOrEqual(-5000);
    expect(card.previous).toMatchObject({ closed: 1, rejected: 1 });
    expect(card.deltas.closed).toEqual({ diff: 1, pct: 100 });
    expect(card.team.size).toBeGreaterThanOrEqual(3);
    expect(card.team.average.closed).toBeLessThan(card.current.closed);
    expect(done.id).toBeTruthy();

    // Staff see their own card only; the team view is ADMIN+.
    const mine = expectStatus(await staff.agent.get('/api/admin/kpi/me?month=2026-09'), 200).body;
    expect(mine.current.closed).toBe(2);
    expectStatus(await staff.agent.get('/api/admin/kpi/team'), 403);
    expectStatus(await staff.agent.get(`/api/admin/kpi/staff/${other.user.id}`), 403);

    const team = expectStatus(await admin.agent.get('/api/admin/kpi/team?month=2026-09'), 200).body;
    const row = team.rows.find((r: { staff: { id: string } }) => r.staff.id === staff.user.id);
    expect(row.series.map((s: { closed: number }) => s.closed)).toEqual([0, 0, 0, 0, 1, 2]);

    const csv = expectStatus(await admin.agent.get('/api/admin/kpi/team/export.csv?month=2026-09'), 200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('approvalsGiven');
    expect(csv.text).toContain('"2026-09"');
    expectStatus(await admin.agent.get('/api/admin/kpi/team?month=2026-13'), 400);
    await prisma.embassyPackageApproval.deleteMany({ where: { reviewerId: staff.user.id } });
  });
});

// ─── Training ──────────────────────────────────────────────────────────

describe('training', () => {
  it('authoring, visibility by role, server-side quiz grading without leaking answers, progress matrix', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();

    const course = expectStatus(await admin.agent.post('/api/admin/training/courses').send({ title: 'Onboarding', required: true }), 201).body.course;
    const l1 = expectStatus(await admin.agent.post(`/api/admin/training/courses/${course.id}/lessons`).send({ title: 'Read me', body: '# Hi', videoUrl: 'https://youtu.be/abc' }), 201).body.lesson;
    const l2 = expectStatus(
      await admin.agent.post(`/api/admin/training/courses/${course.id}/lessons`).send({
        title: 'Quiz',
        quiz: [
          { q: 'One?', options: ['a', 'b'], answer: 1 },
          { q: 'Two?', options: ['a', 'b', 'c'], answer: 0 },
        ],
        passScore: 100,
      }),
      201,
    ).body.lesson;
    expectStatus(await admin.agent.post(`/api/admin/training/courses/${course.id}/lessons`).send({ title: 'Bad', videoUrl: 'https://example.com/x' }), 400);
    expectStatus(await staff.agent.post('/api/admin/training/courses').send({ title: 'Nope' }), 403);

    // Drafts are invisible to learners.
    expect(expectStatus(await staff.agent.get('/api/admin/training/learn'), 200).body.courses).toHaveLength(0);
    expectStatus(await staff.agent.get(`/api/admin/training/learn/lessons/${l1.id}`), 404);
    expectStatus(await admin.agent.patch(`/api/admin/training/courses/${course.id}`).send({ published: true }), 200);
    expect(expectStatus(await staff.agent.get('/api/admin/training/learn/pending'), 200).body.count).toBe(1);

    const lesson = expectStatus(await staff.agent.get(`/api/admin/training/learn/lessons/${l2.id}`), 200).body;
    expect(lesson.lesson.quiz).toEqual([
      { q: 'One?', options: ['a', 'b'] },
      { q: 'Two?', options: ['a', 'b', 'c'] },
    ]);
    expect(JSON.stringify(lesson)).not.toContain('"answer"');
    expect(lesson.prev.id).toBe(l1.id);

    expectStatus(await staff.agent.post(`/api/admin/training/learn/lessons/${l2.id}/complete`), 400); // has a quiz
    const fail = expectStatus(await staff.agent.post(`/api/admin/training/learn/lessons/${l2.id}/quiz`).send({ answers: [1, 2] }), 200).body;
    expect(fail).toMatchObject({ score: 50, passed: false, correct: [true, false], attempts: 1, completedAt: null });
    expect(JSON.stringify(fail)).not.toContain('"answer"');
    const pass = expectStatus(await staff.agent.post(`/api/admin/training/learn/lessons/${l2.id}/quiz`).send({ answers: [1, 0] }), 200).body;
    expect(pass).toMatchObject({ score: 100, passed: true, attempts: 2 });
    expectStatus(await staff.agent.post(`/api/admin/training/learn/lessons/${l1.id}/complete`), 200);

    const learn = expectStatus(await staff.agent.get('/api/admin/training/learn'), 200).body.courses[0];
    expect(learn.progress).toMatchObject({ lessons: 2, completed: 2, percent: 100, complete: true, avgScore: 100 });
    expect(expectStatus(await staff.agent.get('/api/admin/training/learn/pending'), 200).body.count).toBe(0);

    const matrix = expectStatus(await admin.agent.get('/api/admin/training/progress'), 200).body;
    const row = matrix.rows.find((r: { user: { id: string } }) => r.user.id === staff.user.id);
    expect(row.cells[course.id]).toMatchObject({ complete: true, attempts: 2, applies: true });

    // Roles: an ADMIN-only course is hidden from STAFF.
    expectStatus(await admin.agent.patch(`/api/admin/training/courses/${course.id}`).send({ roles: ['ADMIN'] }), 200);
    expect(expectStatus(await staff.agent.get('/api/admin/training/learn'), 200).body.courses).toHaveLength(0);

    // Admin view includes the answer keys; reorder; delete cascades.
    const full = expectStatus(await admin.agent.get(`/api/admin/training/courses/${course.id}`), 200).body.course;
    expect(full.lessons[1].quiz[0].answer).toBe(1);
    expectStatus(await admin.agent.post(`/api/admin/training/courses/${course.id}/lessons/reorder`).send({ ids: [l2.id, l1.id] }), 200);
    expect(expectStatus(await admin.agent.get(`/api/admin/training/courses/${course.id}`), 200).body.course.lessons[0].id).toBe(l2.id);
    expectStatus(await admin.agent.delete(`/api/admin/training/courses/${course.id}`), 200);
    expect(await prisma.trainingProgress.count()).toBe(0);
  });

  it('starter courses are created once', async () => {
    const admin = await asAdmin();
    const first = expectStatus(await admin.agent.post('/api/admin/training/courses/starter'), 200).body;
    expect(first.created).toBe(2);
    const again = expectStatus(await admin.agent.post('/api/admin/training/courses/starter'), 200).body;
    expect(again).toMatchObject({ created: 0, skipped: 2 });
    const courses = expectStatus(await admin.agent.get('/api/admin/training/courses'), 200).body.courses;
    expect(courses).toHaveLength(2);
    expect(courses.every((c: { published: boolean; lessons: number }) => !c.published && c.lessons >= 3)).toBe(true);
  });
});

// ─── Shifts ────────────────────────────────────────────────────────────

describe('shift calendar', () => {
  it('CRUD with overlap check, staff read-only, copy week, repeat, coverage warnings with leave', async () => {
    const admin = await asAdmin();
    const a = await asStaff();
    const b = await asStaff();
    const mon = '2026-11-02';

    const s1 = expectStatus(await admin.agent.post('/api/admin/shifts').send({ userId: a.user.id, date: mon, startMin: 540, endMin: 1080, kind: 'OFFICE' }), 201).body.shift;
    expect(s1).toMatchObject({ date: mon, startMin: 540, endMin: 1080, kind: 'OFFICE' });
    expectStatus(await admin.agent.post('/api/admin/shifts').send({ userId: a.user.id, date: mon, startMin: 1000, endMin: 1200, kind: 'ON_CALL' }), 409);
    expectStatus(await admin.agent.post('/api/admin/shifts').send({ userId: a.user.id, date: mon, startMin: 600, endMin: 500 }), 400);
    expectStatus(await a.agent.post('/api/admin/shifts').send({ userId: a.user.id, date: mon, startMin: 540, endMin: 600 }), 403);
    const s2 = expectStatus(await admin.agent.post('/api/admin/shifts').send({ userId: b.user.id, date: '2026-11-03', startMin: 600, endMin: 900, kind: 'REMOTE', note: 'Home' }), 201).body.shift;
    expect(expectStatus(await admin.agent.patch(`/api/admin/shifts/${s2.id}`).send({ kind: 'OFFICE' }), 200).body.shift.kind).toBe('OFFICE');

    expectStatus(await admin.agent.put('/api/admin/shifts/coverage').send({ requireOffice: true, requireOnCall: false, weekdays: [1, 2, 3, 4, 5] }), 200);
    // b is on approved vacation on Tuesday → the office shift does not count.
    await prisma.leaveRequest.create({ data: { userId: b.user.id, type: 'VACATION', status: 'APPROVED', startsAt: new Date('2026-11-03T00:00:00Z'), endsAt: new Date('2026-11-03T23:59:59.999Z') } });
    const cal = expectStatus(await a.agent.get(`/api/admin/shifts/calendar?from=${mon}&to=2026-11-08`), 200).body;
    expect(cal.days).toHaveLength(7);
    expect(cal.shifts).toHaveLength(2);
    expect(cal.leave).toHaveLength(1);
    const cov = Object.fromEntries(cal.coverage.map((c: { day: string; warnings: string[] }) => [c.day, c.warnings]));
    expect(cov[mon]).toEqual([]);
    expect(cov['2026-11-03']).toEqual(['NO_OFFICE']);
    expect(cov['2026-11-07']).toEqual([]); // Saturday not checked
    expectStatus(await a.agent.get('/api/admin/shifts/calendar?from=2026-01-01&to=2026-12-31'), 200); // clipped to 62 days

    const copy = expectStatus(await admin.agent.post('/api/admin/shifts/copy-week').send({ from: '2026-11-04', to: '2026-11-12' }), 200).body;
    expect(copy).toMatchObject({ created: 2, skipped: 0, from: mon, to: '2026-11-09' });
    expect(expectStatus(await admin.agent.post('/api/admin/shifts/copy-week').send({ from: mon, to: '2026-11-09' }), 200).body).toMatchObject({ created: 0, skipped: 2 });
    const rep = expectStatus(await admin.agent.post('/api/admin/shifts/repeat').send({ week: mon, weeks: 3 }), 200).body;
    expect(rep).toMatchObject({ created: 4, skipped: 2 });
    expect(await prisma.staffShift.count()).toBe(8);

    expectStatus(await admin.agent.delete(`/api/admin/shifts/${s1.id}`), 200);
    expectStatus(await admin.agent.delete(`/api/admin/shifts/${s1.id}`), 404);
  });
});

// ─── Handover notes ────────────────────────────────────────────────────

describe('handover notes', () => {
  it('draft before the leave → copied onto the handover → substitute ticks → owner sees the changes', async () => {
    const admin = await asAdmin();
    const owner = await asStaff();
    const sub = await asStaff();
    await expectStatus(await admin.agent.put('/api/admin/assignment/config').send({ mode: 'leastLoaded', staffIds: [owner.user.id, sub.user.id], handover: true }), 200);
    const c1 = await createCaseVia((await asClient()).agent);
    const c2 = await createCaseVia((await asClient()).agent);
    await prisma.case.updateMany({ where: { id: { in: [c1.id, c2.id] } }, data: { assignedStaffId: owner.user.id } });

    const leave = await prisma.leaveRequest.create({ data: { userId: owner.user.id, type: 'VACATION', status: 'APPROVED', startsAt: new Date(Date.now() + 2 * DAY), endsAt: new Date(Date.now() + 9 * DAY) } });
    const mine = expectStatus(await owner.agent.get('/api/admin/handover-notes/mine'), 200).body;
    expect(mine.leaves.map((l: { id: string }) => l.id)).toEqual([leave.id]);

    const draft = expectStatus(await owner.agent.get(`/api/admin/handover-notes/leave/${leave.id}`), 200).body;
    expect(draft.cases.map((c: { id: string }) => c.id).sort()).toEqual([c1.id, c2.id].sort());
    expectStatus(await sub.agent.get(`/api/admin/handover-notes/leave/${leave.id}`), 403);
    expectStatus(
      await owner.agent.put(`/api/admin/handover-notes/leave/${leave.id}`).send({
        general: { note: 'Hamısı üçün: hər gün poçta baxın', checklist: [{ text: 'Poçt' }] },
        cases: { [c1.id]: { note: 'Bazar ertəsi səfirlik görüşü', checklist: [{ text: 'Paketi çap et' }, { text: 'Müştəriyə zəng' }] } },
      }),
      200,
    );

    // The leave starts: the job hands the cases over and copies the notes.
    await prisma.leaveRequest.update({ where: { id: leave.id }, data: { startsAt: new Date(Date.now() - HOUR) } });
    await runHandovers();
    const rows = await prisma.caseHandover.findMany({ where: { leaveId: leave.id } });
    expect(rows).toHaveLength(2);
    const h1 = rows.find((h) => h.caseId === c1.id)!;
    expect(h1.substituteId).toBe(sub.user.id);
    expect(h1.note).toBe('Bazar ertəsi səfirlik görüşü');
    expect(rows.find((h) => h.caseId === c2.id)!.note).toBe('Hamısı üçün: hər gün poçta baxın');

    // The substitute sees it on the case and in "my work".
    const info = expectStatus(await sub.agent.get(`/api/admin/handover-notes/case/${c1.id}`), 200).body;
    expect(info.active).toMatchObject({ id: h1.id, open: 2, originalStaffId: owner.user.id });
    const work = await buildMyWork({ id: sub.user.id, role: 'STAFF' } as never, { team: false });
    const item = work.items.find((i) => i.kind === 'handover' && i.refs.caseId === c1.id);
    expect(item?.priority).toBe('HIGH');

    // Ticks: substitute yes, an unrelated staff member no; editing the note keeps the ticks.
    const other = await asStaff();
    expectStatus(await other.agent.patch(`/api/admin/handover-notes/${h1.id}/checklist`).send({ index: 0, done: true }), 403);
    const ticked = expectStatus(await sub.agent.patch(`/api/admin/handover-notes/${h1.id}/checklist`).send({ index: 0, done: true }), 200).body.handover;
    expect(ticked.checklist[0]).toMatchObject({ done: true, doneById: sub.user.id });
    expectStatus(await sub.agent.patch(`/api/admin/handover-notes/${h1.id}`).send({ note: 'x' }), 403);
    const edited = expectStatus(
      await owner.agent.patch(`/api/admin/handover-notes/${h1.id}`).send({ note: 'Yeni qeyd', checklist: [{ text: 'Paketi çap et' }, { text: 'Müştəriyə zəng' }, { text: 'Tərcümə' }] }),
      200,
    ).body.handover;
    expect(edited.checklist.map((x: { done: boolean }) => x.done)).toEqual([true, false, false]);

    // Something happens on the case, then the leave ends: the owner sees the change.
    await prisma.caseEvent.create({ data: { caseId: c1.id, type: 'STATUS_CHANGED', fromStatus: 'DOCUMENTS_PENDING', toStatus: 'DOCUMENTS_REVIEW', actorId: sub.user.id } });
    await prisma.leaveRequest.update({ where: { id: leave.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await runHandovers();
    const back = expectStatus(await owner.agent.get('/api/admin/handover-notes/mine'), 200).body;
    const r1 = back.returned.find((r: { caseId: string }) => r.caseId === c1.id);
    expect(r1.status).toBe('RETURNED');
    expect(r1.changes.statusChanges).toEqual([expect.objectContaining({ from: 'DOCUMENTS_PENDING', to: 'DOCUMENTS_REVIEW' })]);
    const caseInfo = expectStatus(await owner.agent.get(`/api/admin/handover-notes/case/${c1.id}`), 200).body;
    expect(caseInfo.active).toBeNull();
    expect(caseInfo.returned.changes.events).toBeGreaterThanOrEqual(1);
  });

  it('approving leave prompts the owner of open cases to write a handover note', async () => {
    const admin = await asAdmin();
    const owner = await asStaff();
    const c = await createCaseVia((await asClient()).agent);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: owner.user.id } });
    const req = expectStatus(await owner.agent.post('/api/workspace/leave').send({ type: 'VACATION', startsAt: '2026-12-01', endsAt: '2026-12-05' }), 201).body.leave;
    expectStatus(await admin.agent.post(`/api/workspace/leave/${req.id}/approve`).send({}), 200);
    const n = await prisma.notification.findFirst({ where: { userId: owner.user.id, type: 'HANDOVER_NOTE_PROMPT' } });
    expect(n?.link).toContain(`leave=${req.id}`);
  });
});
