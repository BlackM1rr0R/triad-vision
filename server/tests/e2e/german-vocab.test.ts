import { describe, expect, it } from 'vitest';
import { asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { germanVocabulary, seedGermanVocabulary } from '../../prisma/seed/germanVocabulary.js';
import { addDays, dayKey } from '../../src/lib/german/vocab.js';

type Card = { id: string; de: string; level: string; field: string; state: 'new' | 'review'; translations: { az: string; ru: string; en: string }; preview: { good: number } };

describe('German vocabulary trainer', () => {
  it('session → reviews (SM-2, daily new-word allowance) → streak; staff see the activity', async () => {
    expect((await seedGermanVocabulary(prisma)).words).toBe(germanVocabulary.length);
    await seedGermanVocabulary(prisma); // idempotent (upsert by slug)
    expect(await prisma.germanWord.count()).toBe(germanVocabulary.length);

    const client = await asClient();
    const empty = expectStatus(await client.agent.get('/api/german/vocab'), 200).body;
    expect(empty).toMatchObject({ total: germanVocabulary.length, started: 0, learned: 0, due: 0, recommendedLevel: 'A1', streak: { current: 0, practisedToday: false } });
    expect(empty.levels.find((l: { key: string }) => l.key === 'A1').total).toBeGreaterThan(0);
    expect(empty.activity).toHaveLength(14);

    // No level yet → A1 words only, 10 new words a day.
    const s1 = expectStatus(await client.agent.get('/api/german/vocab/session'), 200).body as { cards: Card[]; newLeft: number };
    expect(s1.cards).toHaveLength(10);
    expect(s1.cards.every((c) => c.state === 'new' && c.level === 'A1' && c.translations.az && c.translations.ru)).toBe(true);
    expect(s1.cards[0].preview.good).toBe(1);

    const first = expectStatus(await client.agent.post('/api/german/vocab/review').send({ wordId: s1.cards[0].id, grade: 4 }), 200).body;
    expect(first).toMatchObject({ correct: true, progress: { repetitions: 1, intervalDays: 1, learned: false } });
    expect(first.summary).toMatchObject({ started: 1, today: { reviews: 1, correct: 1, newWords: 1 }, streak: { current: 1, practisedToday: true } });

    const wrong = expectStatus(await client.agent.post('/api/german/vocab/review').send({ wordId: s1.cards[1].id, grade: 1 }), 200).body;
    expect(wrong).toMatchObject({ correct: false, progress: { repetitions: 0, intervalDays: 0 } });
    // Reviewing the same word again is not a new word.
    const again = expectStatus(await client.agent.post('/api/german/vocab/review').send({ wordId: s1.cards[1].id, grade: 4 }), 200).body;
    expect(again.summary.today).toMatchObject({ reviews: 3, correct: 2, newWords: 2 });

    for (const c of s1.cards.slice(2)) expectStatus(await client.agent.post('/api/german/vocab/review').send({ wordId: c.id, grade: 5 }), 200);
    const s2 = expectStatus(await client.agent.get('/api/german/vocab/session'), 200).body as { cards: Card[]; newLeft: number };
    expect(s2.newLeft).toBe(0);
    expect(s2.cards).toHaveLength(0); // allowance used up, nothing due yet

    // A word that became due comes back as a review.
    await prisma.germanWordProgress.update({ where: { userId_wordId: { userId: client.user.id, wordId: s1.cards[0].id } }, data: { dueAt: new Date(Date.now() - 60_000) } });
    const s3 = expectStatus(await client.agent.get('/api/german/vocab/session'), 200).body as { cards: Card[] };
    expect(s3.cards.map((c) => [c.id, c.state])).toEqual([[s1.cards[0].id, 'review']]);
    const second = expectStatus(await client.agent.post('/api/german/vocab/review').send({ wordId: s1.cards[0].id, grade: 4 }), 200).body;
    expect(second.progress).toMatchObject({ repetitions: 2, intervalDays: 6 });

    // Field and level filters (a fresh client still has the daily allowance).
    const other = await asClient();
    await prisma.user.update({ where: { id: other.user.id }, data: { germanLevel: 'A2' } });
    const care = expectStatus(await other.agent.get('/api/german/vocab/session?field=CARE&limit=30'), 200).body as { cards: Card[] };
    expect(care.cards.length).toBe(10);
    expect(care.cards.every((c) => c.field === 'CARE' && ['A1', 'A2', 'B1'].includes(c.level))).toBe(true);
    const b1 = expectStatus(await other.agent.get('/api/german/vocab/session?level=B1&field=DRIVING'), 200).body as { cards: Card[] };
    expect(b1.cards.every((c) => c.level === 'B1' && c.field === 'DRIVING')).toBe(true);
    expect((await other.agent.get('/api/german/vocab/session?field=ROCKET')).status).toBe(400);

    // Streak: yesterday + the day before + today = 3.
    const today = dayKey(new Date());
    await prisma.germanPracticeDay.createMany({
      data: [1, 2].map((n) => ({ userId: client.user.id, day: addDays(today, -n), reviews: 5, correct: 4 })),
    });
    const summary = expectStatus(await client.agent.get('/api/german/vocab'), 200).body;
    expect(summary.streak).toMatchObject({ current: 3, best: 3, practisedToday: true });
    expect(summary.activity.at(-1)).toMatchObject({ day: today, reviews: 12 });

    // Validation and access.
    expect((await client.agent.post('/api/german/vocab/review').send({ wordId: s1.cards[0].id, grade: 7 })).status).toBe(400);
    expect((await client.agent.post('/api/german/vocab/review').send({ wordId: 'nope', grade: 4 })).status).toBe(404);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/german/vocab')).status).toBe(403);

    // Unpublished words leave sessions and counts.
    await prisma.germanWord.update({ where: { id: s1.cards[0].id }, data: { published: false } });
    expect(expectStatus(await client.agent.get('/api/german/vocab'), 200).body.total).toBe(germanVocabulary.length - 1);

    // Staff: practice activity + the stored self-test attempt.
    await prisma.germanQuestion.createMany({ data: ['A1', 'A1', 'A2', 'A2'].map((level, i) => ({ level, question: { az: 'q', de: 'q', en: 'q', ru: 'q' }, options: ['a', 'b'], answer: 0, sortOrder: i })) });
    const qs = await prisma.germanQuestion.findMany();
    const answers = Object.fromEntries(qs.map((q) => [q.id, q.level === 'A1' ? 0 : 1]));
    expectStatus(await client.agent.post('/api/journey/german/test').send({ answers }), 200);
    expectStatus(await staff.agent.post('/api/journey/german/test').send({ answers }), 200); // staff trying the test: not stored
    const practice = expectStatus(await staff.agent.get(`/api/admin/german/users/${client.user.id}/practice`), 200).body;
    expect(practice.vocab).toMatchObject({ streak: { current: 3 }, today: { reviews: 12 } });
    expect(practice.vocab.lastPracticeAt).toBeTruthy();
    expect(practice.attempts).toHaveLength(1);
    expect(practice.attempts[0]).toMatchObject({ estimated: 'A1', correct: 2, total: 4, percent: 50 });
    expect((await staff.agent.get(`/api/admin/german/users/${staff.user.id}/practice`)).status).toBe(404);
    expect((await client.agent.get(`/api/admin/german/users/${client.user.id}/practice`)).status).toBe(403);
  });

  it('a client marks a published exam date as registered', async () => {
    const client = await asClient();
    const date = await prisma.germanExamDate.create({
      data: { provider: 'GOETHE', level: 'B1', city: 'Baku', examDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), registrationDeadline: new Date(Date.now() + 10 * 24 * 3600 * 1000) },
    });
    const upcoming = expectStatus(await client.agent.get('/api/german/exam-dates'), 200).body.items;
    expect(upcoming.map((d: { id: string }) => d.id)).toContain(date.id);
    const created = expectStatus(await client.agent.post('/api/german/me/exams').send({ examDateId: date.id, status: 'REGISTERED' }), 201).body;
    const exam = created.exams.find((e: { id: string }) => e.id === created.id);
    expect(exam).toMatchObject({ provider: 'GOETHE', level: 'B1', status: 'REGISTERED', examDateId: date.id });
    expect(exam.registeredAt).toBeTruthy();
  });
});
