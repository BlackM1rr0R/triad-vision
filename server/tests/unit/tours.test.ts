import { describe, expect, it } from 'vitest';
import { TOURS_MAX, TooManyToursError, applyTourUpdate, cleanToursDoc, tourUpdateSchema, type ToursDoc } from '../../src/lib/tours.js';

const NOW = new Date('2026-11-14T10:00:00.000Z');

describe('guided-tour progress (lib/tours)', () => {
  it('records progress, then done; the step is kept', () => {
    let doc: ToursDoc = {};
    doc = applyTourUpdate(doc, 'admin', { status: 'progress', step: 2 }, NOW);
    expect(doc.admin).toEqual({ status: 'progress', step: 2, at: NOW.toISOString() });
    doc = applyTourUpdate(doc, 'admin', { status: 'done' }, NOW);
    expect(doc.admin).toMatchObject({ status: 'done', step: 2 });
  });

  it('a stray progress from an old tab does not reopen a finished or dismissed tour; a restart does', () => {
    const done: ToursDoc = { client: { status: 'done', step: 4, at: NOW.toISOString() } };
    expect(applyTourUpdate(done, 'client', { status: 'progress', step: 1 }, NOW).client.status).toBe('done');
    const never: ToursDoc = { client: { status: 'never', step: 0, at: NOW.toISOString() } };
    expect(applyTourUpdate(never, 'client', { status: 'progress', step: 1 }, NOW).client.status).toBe('never');
    expect(applyTourUpdate(done, 'client', { status: 'progress', step: 0, restart: true }, NOW).client).toMatchObject({ status: 'progress', step: 0 });
  });

  it('reset forgets the tour and does not mutate the input', () => {
    const doc: ToursDoc = { client: { status: 'done', step: 4, at: '' } };
    const next = applyTourUpdate(doc, 'client', { status: 'reset' }, NOW);
    expect(next).toEqual({});
    expect(doc.client.status).toBe('done');
  });

  it('caps the number of tours per user', () => {
    const doc: ToursDoc = {};
    for (let i = 0; i < TOURS_MAX; i++) doc[`t${i}`] = { status: 'done', step: 0, at: '' };
    expect(() => applyTourUpdate(doc, 'one-more', { status: 'done' }, NOW)).toThrow(TooManyToursError);
    // an existing tour can still change
    expect(applyTourUpdate(doc, 't0', { status: 'never' }, NOW).t0.status).toBe('never');
  });

  it('cleans malformed stored JSON', () => {
    expect(cleanToursDoc(null)).toEqual({});
    expect(cleanToursDoc([1, 2])).toEqual({});
    expect(
      cleanToursDoc({ ok: { status: 'done', step: 3, at: 'x' }, 'Bad Id': { status: 'done', step: 0, at: '' }, bad: { status: 'weird' }, neg: { status: 'progress', step: -4 } }),
    ).toEqual({ ok: { status: 'done', step: 3, at: 'x' }, neg: { status: 'progress', step: 0, at: '' } });
  });

  it('validates updates', () => {
    expect(tourUpdateSchema.safeParse({ status: 'progress', step: 3 }).success).toBe(true);
    expect(tourUpdateSchema.safeParse({ status: 'started' }).success).toBe(false);
    expect(tourUpdateSchema.safeParse({ status: 'progress', step: 1.5 }).success).toBe(false);
    expect(tourUpdateSchema.safeParse({ status: 'progress', step: 999 }).success).toBe(false);
  });
});
