import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { progressStats } from '../../src/lib/waitingRoom/index.js';
import { STARTER_ITEMS } from '../../src/lib/waitingRoom/starter.js';

const L = (s: string) => ({ az: `${s} az`, de: `${s} de`, en: `${s} en`, ru: `${s} ru` });
const exercise = [
  { q: L('Q1'), options: [L('a'), L('b'), L('c')], answer: 2 },
  { q: L('Q2'), options: [L('a'), L('b')], answer: 0 },
];

describe('waiting room — admin CMS', () => {
  it('creates, validates, reorders, publishes and deletes items (ADMIN writes, STAFF reads)', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const lesson = expectStatus(await admin.agent.post('/api/admin/waiting-room').send({ kind: 'LESSON', topic: 'life', title: L('Anmeldung'), body: L('Text'), minutes: 3 }), 201).body.item;
    const ex = expectStatus(await admin.agent.post('/api/admin/waiting-room').send({ kind: 'EXERCISE', topic: 'language', title: L('A1'), exercise }), 201).body.item;
    expect(ex.sortOrder).toBe(lesson.sortOrder + 1);
    expectStatus(await admin.agent.post('/api/admin/waiting-room').send({ kind: 'EXERCISE', topic: 'language', title: L('Empty') }), 400);
    expectStatus(await admin.agent.post('/api/admin/waiting-room').send({ kind: 'VIDEO', topic: 'culture', title: L('Video'), videoUrl: 'https://evil.example/v.mp4' }), 400);
    const video = expectStatus(
      await admin.agent.post('/api/admin/waiting-room').send({ kind: 'VIDEO', topic: 'culture', title: L('Video'), videoUrl: 'https://www.youtube.com/watch?v=abc123', visaTypes: ['STUDY'] }),
      201,
    ).body.item;
    expect(video.visaTypes).toEqual(['STUDY']);
    expectStatus(await admin.agent.post('/api/admin/waiting-room').send({ kind: 'EXERCISE', topic: 'language', title: L('Bad'), exercise: [{ q: L('Q'), options: [L('a'), L('b')], answer: 5 }] }), 400);

    expectStatus(await staff.agent.post('/api/admin/waiting-room').send({ kind: 'LESSON', topic: 'life', title: L('x') }), 403);
    expect(expectStatus(await staff.agent.get('/api/admin/waiting-room'), 200).body.items).toHaveLength(3);

    expectStatus(await admin.agent.post('/api/admin/waiting-room/reorder').send({ ids: [video.id, ex.id, lesson.id] }), 200);
    const order = expectStatus(await admin.agent.get('/api/admin/waiting-room'), 200).body.items.map((i: { id: string }) => i.id);
    expect(order).toEqual([video.id, ex.id, lesson.id]);

    expect(expectStatus(await admin.agent.patch(`/api/admin/waiting-room/${lesson.id}/publish`).send({ published: false }), 200).body.item.published).toBe(false);
    expect(expectStatus(await admin.agent.put(`/api/admin/waiting-room/${lesson.id}`).send({ stages: ['DECISION_PENDING'], visaTypes: [] }), 200).body.item).toMatchObject({ stages: ['DECISION_PENDING'], visaTypes: null });
    expectStatus(await admin.agent.get('/api/admin/waiting-room?topic=culture'), 200);
    expectStatus(await admin.agent.delete(`/api/admin/waiting-room/${video.id}`), 200);
    expect(await prisma.waitingRoomItem.count()).toBe(2);
  });

  it('loads the starter content idempotently', async () => {
    const admin = await asAdmin();
    const first = expectStatus(await admin.agent.post('/api/admin/waiting-room/starter'), 200).body;
    expect(first).toEqual({ created: STARTER_ITEMS.length, skipped: 0 });
    expect(STARTER_ITEMS.length).toBeGreaterThanOrEqual(15);
    const again = expectStatus(await admin.agent.post('/api/admin/waiting-room/starter'), 200).body;
    expect(again).toEqual({ created: 0, skipped: STARTER_ITEMS.length });
    // Every starter item is complete in all four languages.
    for (const it of STARTER_ITEMS) {
      for (const l of ['az', 'de', 'en', 'ru'] as const) {
        expect(it.title[l].trim()).not.toBe('');
        if (it.body) expect(it.body[l].trim()).not.toBe('');
        for (const q of it.exercise ?? []) {
          expect(q.q[l].trim()).not.toBe('');
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
    }
  });
});

describe('waiting room — client', () => {
  it('filters by visa type and case status, hides answers, grades exercises on the server and tracks progress', async () => {
    await prisma.waitingRoomItem.createMany({
      data: [
        { kind: 'LESSON', topic: 'life', title: L('General'), sortOrder: 0 },
        { kind: 'EXERCISE', topic: 'language', title: L('Quiz'), exercise, sortOrder: 1 },
        { kind: 'LESSON', topic: 'work', title: L('Study only'), visaTypes: ['STUDY'], sortOrder: 2 },
        { kind: 'CHECKLIST', topic: 'bureaucracy', title: L('Late stage'), stages: ['DECISION_PENDING'], sortOrder: 3 },
        { kind: 'LESSON', topic: 'life', title: L('Hidden'), published: false, sortOrder: 4 },
      ],
    });
    const client = await asClient();
    expectStatus(await anon().get('/api/waiting-room'), 401);
    const staff = await asStaff();
    expectStatus(await staff.agent.get('/api/waiting-room'), 403);

    // No case: only unrestricted items.
    let res = expectStatus(await client.agent.get('/api/waiting-room'), 200).body;
    expect(res.items.map((i: { title: { de: string } }) => i.title.de)).toEqual(['General de', 'Quiz de']);

    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { visaType: 'STUDY', status: 'DOCUMENTS_PENDING' } });
    res = expectStatus(await client.agent.get('/api/waiting-room'), 200).body;
    expect(res.case).toMatchObject({ visaType: 'STUDY', status: 'DOCUMENTS_PENDING' });
    expect(res.items.map((i: { title: { de: string } }) => i.title.de)).toEqual(['General de', 'Quiz de', 'Study only de']);
    const quiz = res.items.find((i: { kind: string }) => i.kind === 'EXERCISE');
    expect(quiz.exercise).toHaveLength(2);
    expect(quiz.exercise[0].answer).toBeUndefined(); // answers never reach the browser
    expect(res.nextId).toBe(res.items[0].id);
    expect(res.stats).toMatchObject({ completed: 0, total: 3, points: 0, streak: 0 });

    await prisma.case.update({ where: { id: c.id }, data: { status: 'DECISION_PENDING' } });
    res = expectStatus(await client.agent.get('/api/waiting-room'), 200).body;
    expect(res.items).toHaveLength(4);

    // Lesson done (idempotent).
    const general = res.items[0];
    const done = expectStatus(await client.agent.post(`/api/waiting-room/${general.id}/complete`), 200).body;
    expect(done.progress.completedAt).toBeTruthy();
    expect(done.stats).toMatchObject({ completed: 1, points: 10, streak: 1 });
    expectStatus(await client.agent.post(`/api/waiting-room/${general.id}/complete`), 200);
    expect(await prisma.waitingRoomProgress.count({ where: { userId: client.user.id } })).toBe(1);

    // Exercise: instant feedback, best score kept.
    const graded = expectStatus(await client.agent.post(`/api/waiting-room/${quiz.id}/answer`).send({ answers: [2, 1] }), 200).body;
    expect(graded).toMatchObject({ right: 1, total: 2, score: 50, best: 50 });
    expect(graded.results).toEqual([
      { correct: true, answer: 2, chosen: 2 },
      { correct: false, answer: 0, chosen: 1 },
    ]);
    const perfect = expectStatus(await client.agent.post(`/api/waiting-room/${quiz.id}/answer`).send({ answers: [2, 0] }), 200).body;
    expect(perfect).toMatchObject({ score: 100, best: 100 });
    const worse = expectStatus(await client.agent.post(`/api/waiting-room/${quiz.id}/answer`).send({ answers: [0, 1] }), 200).body;
    expect(worse).toMatchObject({ score: 0, best: 100 });
    expect(worse.stats).toMatchObject({ completed: 2, points: 10 + 10 + 10 });

    // Items outside the client's filter cannot be completed.
    const hidden = await prisma.waitingRoomItem.findFirstOrThrow({ where: { published: false } });
    expectStatus(await client.agent.post(`/api/waiting-room/${hidden.id}/complete`), 404);
    expectStatus(await client.agent.post(`/api/waiting-room/${general.id}/answer`).send({ answers: [0] }), 404);
  });

  it('counts the streak in consecutive days (unit)', () => {
    const now = new Date('2026-10-24T10:00:00Z');
    const d = (iso: string) => ({ completedAt: new Date(iso), updatedAt: new Date(iso), score: null });
    expect(progressStats([d('2026-10-24T08:00:00Z'), d('2026-10-23T08:00:00Z'), d('2026-10-21T08:00:00Z')], 5, now)).toMatchObject({ streak: 2, completed: 3, percent: 60 });
    // Nothing today yet: yesterday's streak still counts.
    expect(progressStats([d('2026-10-23T08:00:00Z'), d('2026-10-22T08:00:00Z')], 2, now).streak).toBe(2);
    expect(progressStats([d('2026-10-20T08:00:00Z')], 2, now).streak).toBe(0);
    expect(progressStats([{ completedAt: new Date('2026-10-24T08:00:00Z'), updatedAt: new Date('2026-10-24T08:00:00Z'), score: 80 }], 1, now).points).toBe(18);
  });
});
