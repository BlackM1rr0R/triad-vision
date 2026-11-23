import { describe, expect, it } from 'vitest';
import { inboxSearchWhere } from '../../src/lib/inboxSearch.js';

describe('inboxSearchWhere', () => {
  it('adds no condition for an empty search', () => {
    expect(inboxSearchWhere(undefined)).toEqual({});
    expect(inboxSearchWhere('   ')).toEqual({});
  });

  it('requires every word to match the name, the case number or the phone', () => {
    const where = inboxSearchWhere('  Aysel   TV-2026 ');
    expect(where.AND).toHaveLength(2);
    expect((where.AND as { OR: unknown[] }[])[0]!.OR).toEqual([
      { number: { contains: 'Aysel' } },
      { client: { firstName: { contains: 'Aysel' } } },
      { client: { lastName: { contains: 'Aysel' } } },
      { client: { phone: { contains: 'Aysel' } } },
    ]);
  });

  it('caps the number of words', () => {
    expect(inboxSearchWhere('a b c d e f g h').AND).toHaveLength(5);
  });
});
