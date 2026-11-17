import { describe, expect, it } from 'vitest';
import { segmentsOf, sortForList, STATE_OF, STATE_TONE } from './model';

describe('docProgress model', () => {
  it('turns counts into ordered segments with shares (empty parts left out)', () => {
    const s = segmentsOf({ total: 4, missing: 1, pending: 0, accepted: 2, rejected: 1, required: 4, requiredAccepted: 2 });
    expect(s).toEqual([
      { state: 'accepted', count: 2, share: 0.5 },
      { state: 'rejected', count: 1, share: 0.25 },
      { state: 'waiting', count: 1, share: 0.25 },
    ]);
    expect(segmentsOf({ total: 0, missing: 0, pending: 0, accepted: 0, rejected: 0, required: 0, requiredAccepted: 0 })).toEqual([]);
  });

  it('lists what needs the client first, required before optional', () => {
    const items = [
      { id: 'a', status: 'ACCEPTED' as const, required: true },
      { id: 'b', status: 'MISSING' as const, required: false },
      { id: 'c', status: 'MISSING' as const, required: true },
      { id: 'd', status: 'REJECTED' as const, required: true },
      { id: 'e', status: 'PENDING' as const, required: true },
    ];
    expect(sortForList(items).map((i) => i.id)).toEqual(['d', 'c', 'b', 'e', 'a']);
  });

  it('uses the same state words and tones as the case page chips', () => {
    expect(STATE_OF).toEqual({ MISSING: 'waiting', PENDING: 'review', ACCEPTED: 'accepted', REJECTED: 'rejected' });
    expect(STATE_TONE).toEqual({ waiting: 'neutral', review: 'warning', accepted: 'success', rejected: 'danger' });
  });
});
