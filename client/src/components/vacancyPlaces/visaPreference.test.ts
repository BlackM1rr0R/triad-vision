import { describe, expect, it } from 'vitest';
import { orderForVisa, preselectForVisa } from './visaPreference';

type V = { id: string; visaCategoryId: string | null; free: number };
const full = (v: V) => v.free <= 0;
const rows: V[] = [
  { id: 'a', visaCategoryId: 'work', free: 2 },
  { id: 'b', visaCategoryId: 'ausb', free: 1 },
  { id: 'c', visaCategoryId: 'ausb', free: 0 },
  { id: 'd', visaCategoryId: null, free: 3 },
];

describe('vacancy picker and the visa chosen in the calculator', () => {
  it('puts the vacancies of that visa first, full ones stay last', () => {
    expect(orderForVisa(rows, 'ausb', full).map((v) => v.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(orderForVisa(rows, '', full)).toBe(rows);
  });

  it('preselects only when exactly one vacancy of that visa has a free place', () => {
    expect(preselectForVisa(rows, 'ausb', full)).toBe('b');
    expect(preselectForVisa(rows, 'none', full)).toBe('');
    expect(preselectForVisa([...rows, { id: 'e', visaCategoryId: 'work', free: 1 }], 'work', full)).toBe('');
    expect(preselectForVisa(rows, null, full)).toBe('');
  });
});
