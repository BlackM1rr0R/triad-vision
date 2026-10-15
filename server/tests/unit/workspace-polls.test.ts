import { describe, expect, it } from 'vitest';
import { isOpen, toPoll, type PollRow } from '../../src/lib/workspace/polls.js';
import { overlapWhere, weekdaysBetween } from '../../src/lib/workspace/team.js';

const user = (id: string) => ({ id, firstName: id.toUpperCase(), lastName: 'X' });

const row = (over: Partial<PollRow> = {}): PollRow => ({
  id: 'p1',
  authorId: 'a',
  channelId: null,
  question: 'Q',
  multiple: false,
  anonymous: false,
  closesAt: null,
  closedAt: null,
  createdAt: new Date('2030-01-01T00:00:00Z'),
  author: user('a'),
  options: [
    { id: 'o1', pollId: 'p1', text: 'One', sortOrder: 0, votes: [{ userId: 'a', user: user('a') }, { userId: 'b', user: user('b') }] },
    { id: 'o2', pollId: 'p1', text: 'Two', sortOrder: 1, votes: [{ userId: 'b', user: user('b') }] },
  ],
  ...over,
});

describe('workspace: poll shape', () => {
  it('counts votes and voters, marks my votes and exposes voters unless anonymous', () => {
    const p = toPoll(row(), { id: 'b', role: 'STAFF' });
    expect(p).toMatchObject({ totalVotes: 3, voterCount: 2, myVotes: ['o1', 'o2'], open: true, canClose: false, canDelete: false });
    expect(p.options[0]).toMatchObject({ count: 2, mine: true });
    expect(p.options[0].voters?.map((v) => v.id)).toEqual(['a', 'b']);
    const anon = toPoll(row({ anonymous: true }), { id: 'a', role: 'STAFF' });
    expect(anon.options.every((o) => o.voters === null)).toBe(true);
    expect(anon).toMatchObject({ canClose: true, canDelete: true, myVotes: ['o1'] });
    expect(toPoll(row(), { id: 'z', role: 'ADMIN' })).toMatchObject({ canClose: true, canDelete: true, myVotes: [] });
  });

  it('is open until closedAt or closesAt is reached', () => {
    const now = new Date('2030-06-01T12:00:00Z');
    expect(isOpen({ closedAt: null, closesAt: null }, now)).toBe(true);
    expect(isOpen({ closedAt: null, closesAt: new Date('2030-06-01T13:00:00Z') }, now)).toBe(true);
    expect(isOpen({ closedAt: null, closesAt: new Date('2030-06-01T12:00:00Z') }, now)).toBe(false);
    expect(isOpen({ closedAt: new Date('2030-05-01T00:00:00Z'), closesAt: null }, now)).toBe(false);
    expect(toPoll(row({ closesAt: new Date('2030-06-01T11:00:00Z') }), { id: 'a', role: 'STAFF' }, now)).toMatchObject({ open: false, canClose: false });
  });
});

describe('workspace: leave rules', () => {
  it('overlap filter covers pending and approved requests and may exclude one id', () => {
    const w = overlapWhere('u1', new Date('2030-06-03T00:00:00Z'), new Date('2030-06-07T23:59:59Z'), 'self');
    expect(w).toEqual({
      userId: 'u1',
      status: { in: ['PENDING', 'APPROVED'] },
      startsAt: { lte: new Date('2030-06-07T23:59:59Z') },
      endsAt: { gte: new Date('2030-06-03T00:00:00Z') },
      id: { not: 'self' },
    });
    expect(overlapWhere('u1', new Date(), new Date())).not.toHaveProperty('id');
    // Two full weeks → ten working days.
    expect(weekdaysBetween(new Date('2030-06-03T00:00:00Z'), new Date('2030-06-16T23:59:59Z'))).toBe(10);
  });
});
