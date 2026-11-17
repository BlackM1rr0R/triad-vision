import { describe, expect, it } from 'vitest';
import { READY_ACTIVITIES, readyActivity } from './activities';
import { toPayload } from './sync';

describe('Germany Ready sync payloads', () => {
  const now = new Date('2026-11-18T10:00:00Z');

  it('registry: unique ids, items only where declared', () => {
    const ids = READY_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(readyActivity('traffic-signs')?.source).toBe('client');
    expect(readyActivity('nope')).toBeUndefined();
  });

  it('builds the server shape and drops what the server would refuse', () => {
    expect(toPayload({ activityId: 'traffic-signs', score: 27.4, max: 30 }, now)).toEqual({ activityId: 'traffic-signs', score: 27, max: 30, completedAt: now.toISOString() });
    expect(toPayload({ activityId: 'german-simulator', item: 'bank', score: 80, max: 100, completedAt: '2026-11-01T00:00:00.000Z' }, now)).toMatchObject({ item: 'bank', completedAt: '2026-11-01T00:00:00.000Z' });
    expect(toPayload({ activityId: 'german-simulator', item: 'casino', score: 80, max: 100 }, now)).toBeNull();
    expect(toPayload({ activityId: 'german-simulator', score: 80, max: 100 }, now)).toBeNull();
    expect(toPayload({ activityId: 'price-game', item: 'x', score: 1, max: 10 }, now)).toBeNull();
    expect(toPayload({ activityId: 'pronunciation', item: 'bad id!', score: 1, max: 10 }, now)).toBeNull();
    expect(toPayload({ activityId: 'vocabulary', score: 1, max: 10 }, now)).toBeNull(); // computed by the server
    expect(toPayload({ activityId: 'price-game', score: 1, max: 0 }, now)).toBeNull();
  });
});
