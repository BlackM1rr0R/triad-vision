import { describe, expect, it } from 'vitest';
import { SEEN_FALLBACK_MS, seenSince } from '../../src/lib/staffSeen.js';
import { casesNavWhere } from '../../src/lib/staffAttention.js';

describe('seenSince', () => {
  const now = new Date('2026-12-10T10:00:00Z');
  it('uses the stored mark', () => {
    const seen = new Date('2026-12-09T08:00:00Z');
    expect(seenSince(seen, now)).toBe(seen);
  });
  it('falls back to the last week when the page was never opened', () => {
    expect(seenSince(null, now).getTime()).toBe(now.getTime() - SEEN_FALLBACK_MS);
    expect(seenSince(undefined, now).getTime()).toBe(now.getTime() - SEEN_FALLBACK_MS);
  });
});

describe('casesNavWhere', () => {
  it('is one OR of the attention cases and the open cases created since the mark (no double count)', () => {
    const since = new Date('2026-12-09T00:00:00Z');
    const w = casesNavWhere(since);
    expect(w.OR).toHaveLength(2);
    expect(JSON.stringify(w.OR![1])).toContain('"gt":"2026-12-09T00:00:00.000Z"');
  });
});
