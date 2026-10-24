import { describe, expect, it } from 'vitest';
import {
  averageStages,
  delta,
  emptyMetrics,
  firstResponses,
  monthOf,
  monthRange,
  monthsEnding,
  stageDurations,
  surveyScores,
  teamAverage,
} from '../../src/lib/kpi/compute.js';
import { addDays, awayOn, coverage, daysBetween, normalizeCoverage, overlaps, weekStart, weekdayOf } from '../../src/lib/shifts/coverage.js';
import { gradeQuiz, parseQuiz, publicQuiz, videoEmbed } from '../../src/lib/training/service.js';
import { draftFor, mergeChecklist, parseDraft } from '../../src/lib/shifts/handoverNotes.js';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

describe('KPI: months (Baku calendar)', () => {
  it('assigns instants to Baku months and builds ranges', () => {
    // 2026-09-30 21:00 UTC is already 1 October 01:00 in Baku (UTC+4).
    expect(monthOf(at('2026-09-30T21:00:00Z'))).toBe('2026-10');
    expect(monthOf(at('2026-09-30T19:59:00Z'))).toBe('2026-09');
    const r = monthRange('2026-10');
    expect(r.start.toISOString()).toBe('2026-09-30T20:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-31T20:00:00.000Z');
    expect(monthsEnding('2026-02', 6)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('KPI: time per stage', () => {
  it('measures each status between changes and ignores the final status', () => {
    const created = at('2026-01-01T00:00:00Z');
    const events = [
      { createdAt: new Date(created.getTime() + 2 * DAY), fromStatus: 'DOCUMENTS_PENDING' as const, toStatus: 'DOCUMENTS_REVIEW' as const },
      { createdAt: new Date(created.getTime() + 3 * DAY), fromStatus: 'DOCUMENTS_REVIEW' as const, toStatus: 'DOCUMENTS_PENDING' as const },
      { createdAt: new Date(created.getTime() + 4 * DAY), fromStatus: 'DOCUMENTS_PENDING' as const, toStatus: 'DECISION_PENDING' as const },
      { createdAt: new Date(created.getTime() + 10 * DAY), fromStatus: 'DECISION_PENDING' as const, toStatus: 'APPROVED' as const },
    ];
    // Unsorted input is fine.
    const d = stageDurations(created, [...events].reverse(), new Date(created.getTime() + 10 * DAY));
    expect(d).toEqual({ DOCUMENTS_PENDING: 3, DOCUMENTS_REVIEW: 1, DECISION_PENDING: 6 });
  });

  it('averages per stage only over cases that visited it', () => {
    expect(averageStages([{ DOCUMENTS_PENDING: 2 }, { DOCUMENTS_PENDING: 4, EMBASSY_REVIEW: 1.25 }])).toEqual({ DOCUMENTS_PENDING: 3, EMBASSY_REVIEW: 1.3 });
  });
});

describe('KPI: first response to client messages', () => {
  it('counts from the first unanswered client message and credits the replier', () => {
    const t0 = at('2026-03-02T08:00:00Z').getTime();
    const rows = [
      { caseId: 'c1', authorId: 'client1', clientId: 'client1', createdAt: new Date(t0) },
      { caseId: 'c1', authorId: 'client1', clientId: 'client1', createdAt: new Date(t0 + 3600_000) },
      { caseId: 'c1', authorId: 'staffA', clientId: 'client1', createdAt: new Date(t0 + 2 * 3600_000) },
      { caseId: 'c1', authorId: 'staffB', clientId: 'client1', createdAt: new Date(t0 + 3 * 3600_000) }, // not a reply: nobody waiting
      { caseId: 'c1', authorId: 'client1', clientId: 'client1', createdAt: new Date(t0 + 5 * 3600_000) },
      { caseId: 'c1', authorId: 'staffB', clientId: 'client1', createdAt: new Date(t0 + 5.5 * 3600_000) },
      { caseId: 'c2', authorId: 'client2', clientId: 'client2', createdAt: new Date(t0) }, // never answered
    ];
    const out = firstResponses(rows);
    expect(out.map((r) => [r.responderId, r.hours])).toEqual([
      ['staffA', 2],
      ['staffB', 0.5],
    ]);
  });
});

describe('KPI: surveys, deltas and team averages', () => {
  it('computes CSAT from the ratings and NPS from the scores', () => {
    const s = surveyScores([
      { score: 10, ratings: { communication: 5, speed: 4, clarity: 5, support: 5 } }, // 4.75
      { score: 6, ratings: { communication: 3, speed: 3 } }, // 3
      { score: 9, ratings: null },
    ]);
    expect(s).toEqual({ csat: 3.9, nps: 33, surveys: 3 });
  });

  it('compares months', () => {
    expect(delta(12, 8)).toEqual({ diff: 4, pct: 50 });
    expect(delta(3, 0)).toEqual({ diff: 3, pct: null });
    expect(delta(null, 5)).toEqual({ diff: null, pct: null });
  });

  it('averages counts over everyone and averages over people with a value', () => {
    const a = { ...emptyMetrics(), closed: 4, minutes: 600, avgCaseDays: 10, revenueCents: 1001 };
    const b = { ...emptyMetrics(), closed: 1, minutes: 0, avgCaseDays: null, revenueCents: 0 };
    const avg = teamAverage([a, b]);
    expect(avg.closed).toBe(2.5);
    expect(avg.minutes).toBe(300);
    expect(avg.avgCaseDays).toBe(10);
    expect(avg.revenueCents).toBe(501);
  });
});

describe('shifts: calendar maths and coverage', () => {
  it('weeks start on Monday', () => {
    expect(weekdayOf('2026-10-24')).toBe(6); // Saturday
    expect(weekStart('2026-10-24')).toBe('2026-10-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-10-19', '2026-10-25')).toHaveLength(7);
    expect(overlaps(540, 1080, 1080, 1200)).toBe(false);
    expect(overlaps(540, 1080, 1000, 1200)).toBe(true);
  });

  it('warns when a working day has nobody in the office / on call; leave removes the shift', () => {
    const cfg = normalizeCoverage({ requireOffice: true, requireOnCall: true });
    const days = ['2026-10-19', '2026-10-20', '2026-10-24']; // Mon, Tue, Sat
    const shifts = [
      { userId: 'a', day: '2026-10-19', kind: 'OFFICE' },
      { userId: 'b', day: '2026-10-19', kind: 'ON_CALL' },
      { userId: 'a', day: '2026-10-20', kind: 'OFFICE' },
      { userId: 'c', day: '2026-10-20', kind: 'REMOTE' },
    ];
    const leave = [{ userId: 'a', status: 'APPROVED', type: 'VACATION', startsAt: new Date('2026-10-20T00:00:00Z'), endsAt: new Date('2026-10-20T23:59:59.999Z') }];
    const out = coverage(days, shifts, leave, cfg);
    expect(out[0]).toMatchObject({ office: 1, onCall: 1, warnings: [] });
    expect(out[1]).toMatchObject({ office: 0, remote: 1, warnings: ['NO_OFFICE', 'NO_ON_CALL'] });
    expect(out[2]).toMatchObject({ checked: false, warnings: [] }); // Saturday is not a working day
    // Pending or remote leave does not make anyone absent.
    expect(awayOn([{ ...leave[0], status: 'PENDING' }], 'a', '2026-10-20')).toBe(false);
    expect(awayOn([{ ...leave[0], type: 'REMOTE' }], 'a', '2026-10-20')).toBe(false);
  });

  it('normalizes the coverage rule', () => {
    expect(normalizeCoverage(null)).toEqual({ requireOffice: true, requireOnCall: false, weekdays: [1, 2, 3, 4, 5] });
    expect(normalizeCoverage({ requireOffice: false, weekdays: [7, 6, 6, 9] })).toEqual({ requireOffice: false, requireOnCall: false, weekdays: [6, 7] });
  });
});

describe('training: quiz grading and video links', () => {
  const quiz = parseQuiz([
    { q: 'A?', options: ['x', 'y'], answer: 1 },
    { q: 'B?', options: ['x', 'y', 'z'], answer: 2 },
    { q: 'broken', options: ['only one'], answer: 0 },
  ]);

  it('drops malformed questions and hides the answer keys from learners', () => {
    expect(quiz).toHaveLength(2);
    expect(JSON.stringify(publicQuiz(quiz))).not.toContain('answer');
  });

  it('grades in percent', () => {
    expect(gradeQuiz(quiz, [1, 2])).toEqual({ score: 100, correct: [true, true] });
    expect(gradeQuiz(quiz, [1, 0])).toEqual({ score: 50, correct: [true, false] });
    expect(gradeQuiz(quiz, [null, null]).score).toBe(0);
  });

  it('turns YouTube / Vimeo / mp4 links into embeddable sources', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=abc123')).toEqual({ kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/abc123' });
    expect(videoEmbed('https://youtu.be/abc123')?.src).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(videoEmbed('https://vimeo.com/123456789')).toEqual({ kind: 'vimeo', src: 'https://player.vimeo.com/video/123456789' });
    expect(videoEmbed('https://cdn.example.com/intro.mp4')?.kind).toBe('file');
    expect(videoEmbed('javascript:alert(1)')).toBeNull();
    expect(videoEmbed('https://example.com/page')).toBeNull();
  });
});

describe('handover notes: drafts and checklists', () => {
  const draft = parseDraft({
    general: { note: 'All cases: call the client weekly', checklist: [{ text: 'Check mail' }] },
    cases: { c1: { note: 'Embassy appointment on Monday', checklist: [{ text: 'Print package', done: false }] }, c2: { note: '  ', checklist: [] } },
  });

  it('uses the case note when there is one, else the note for all cases', () => {
    expect(draftFor(draft, 'c1')).toMatchObject({ note: 'Embassy appointment on Monday', checklist: [{ text: 'Print package', done: false }] });
    expect(draftFor(draft, 'c2')).toMatchObject({ note: 'All cases: call the client weekly' });
    expect(draftFor(null, 'c1')).toEqual({});
  });

  it('keeps ticks when the checklist text is edited', () => {
    const merged = mergeChecklist(
      [
        { text: 'Print package', done: false },
        { text: 'New item', done: false },
      ],
      [{ text: 'Print package', done: true, doneAt: '2026-10-01T10:00:00.000Z', doneById: 'u1' }],
    );
    expect(merged).toEqual([
      { text: 'Print package', done: true, doneAt: '2026-10-01T10:00:00.000Z', doneById: 'u1' },
      { text: 'New item', done: false, doneAt: null, doneById: null },
    ]);
  });
});
