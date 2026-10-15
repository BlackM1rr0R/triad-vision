import { JOIN_BEFORE_MS, canConfirm, canDecline, canJoin, minutesBetween, nextInterview } from '@/lib/interviews';
import type { Interview } from '@/types';

const base = (over: Partial<Interview>): Interview => ({
  id: 'i1',
  status: 'CONFIRMED',
  startsAt: '2026-10-20T10:00:00.000Z',
  endsAt: '2026-10-20T10:45:00.000Z',
  meetingUrl: 'https://meet.jit.si/TriadVision-abc',
  notes: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  company: { id: 'co', name: 'Bosch' },
  application: null,
  candidate: { id: 'u', name: 'Ali Aliyev', profession: null },
  staff: null,
  createdBy: null,
  ...over,
});

const START = Date.parse('2026-10-20T10:00:00.000Z');

describe('interview helpers', () => {
  it('computes the duration in minutes', () => {
    expect(minutesBetween('2026-10-20T10:00:00Z', '2026-10-20T10:45:00Z')).toBe(45);
    expect(minutesBetween('2026-10-20T10:00:00Z', '2026-10-20T09:00:00Z')).toBe(0);
  });

  it('allows joining only around a confirmed interview with a link', () => {
    const i = base({});
    expect(canJoin(i, START - JOIN_BEFORE_MS - 1)).toBe(false);
    expect(canJoin(i, START - JOIN_BEFORE_MS)).toBe(true);
    expect(canJoin(i, START + 20 * 60_000)).toBe(true);
    expect(canJoin(i, START + 3 * 60 * 60_000)).toBe(false);
    expect(canJoin(base({ status: 'PROPOSED' }), START)).toBe(false);
    expect(canJoin(base({ meetingUrl: null }), START)).toBe(false);
  });

  it('lets the candidate confirm a proposal until it starts and decline live ones until they end', () => {
    expect(canConfirm(base({ status: 'PROPOSED' }), START - 1)).toBe(true);
    expect(canConfirm(base({ status: 'PROPOSED' }), START + 1)).toBe(false);
    expect(canConfirm(base({ status: 'CONFIRMED' }), START - 1)).toBe(false);
    expect(canDecline(base({ status: 'CONFIRMED' }), START)).toBe(true);
    expect(canDecline(base({ status: 'CANCELLED' }), START)).toBe(false);
    expect(canDecline(base({ status: 'PROPOSED' }), START + 60 * 60_000)).toBe(false);
  });

  it('picks the earliest live interview for the home card', () => {
    const list = [
      base({ id: 'done', status: 'DONE', startsAt: '2026-10-18T10:00:00.000Z' }),
      base({ id: 'later', status: 'PROPOSED', startsAt: '2026-10-22T10:00:00.000Z' }),
      base({ id: 'soon', status: 'CONFIRMED', startsAt: '2026-10-21T10:00:00.000Z' }),
    ];
    expect(nextInterview(list)?.id).toBe('soon');
    expect(nextInterview([])).toBeUndefined();
  });
});
