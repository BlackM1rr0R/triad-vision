import { describe, expect, it } from 'vitest';
import { Engine } from './formula';
import { formatValue } from './format';
import { todaySerial, type Rows, type Sheet } from './model';

const sheet = (name: string, rows: Rows): Sheet => ({ key: name, name, rows, rowCount: 100, colCount: 10, colWidths: {}, frozenRows: 0, frozenCols: 0, merges: [] });

describe('formula engine', () => {
  it('evaluates the common functions with cell and range references', () => {
    const rows: Rows = {
      0: { 0: { v: 10 }, 1: { v: 'Aysel' } },
      1: { 0: { v: 20 }, 1: { v: 'Murad' } },
      2: { 0: { v: 30.456 } },
      3: { 0: { f: 'SUM(A1:A3)' }, 1: { f: 'AVERAGE(A1:A2)' }, 2: { f: 'COUNT(A1:B3)' }, 3: { f: 'MIN(A1:A3)' }, 4: { f: 'MAX(A1:A3)' } },
      4: { 0: { f: 'IF(A4>50,"big","small")' }, 1: { f: 'CONCAT(B1," & ",B2)' }, 2: { f: 'ROUND(A3,1)' }, 3: { f: 'TODAY()' }, 4: { f: 'A4*2' } },
      5: { 0: { f: 'A1/0' }, 1: { f: 'SUM(A:A)' }, 2: { f: 'NOSUCH(1)' }, 3: { f: 'B1+1' } },
    };
    const e = new Engine([sheet('S1', rows)]);
    expect(e.value(0, 3, 0)).toBeCloseTo(60.456);
    expect(e.value(0, 3, 1)).toBe(15);
    expect(e.value(0, 3, 2)).toBe(3);
    expect(e.value(0, 3, 3)).toBe(10);
    expect(e.value(0, 3, 4)).toBeCloseTo(30.456);
    expect(e.value(0, 4, 0)).toBe('big');
    expect(e.value(0, 4, 1)).toBe('Aysel & Murad');
    expect(e.value(0, 4, 2)).toBe(30.5);
    expect(e.value(0, 4, 3)).toBe(todaySerial());
    expect(e.value(0, 4, 4)).toBeCloseTo(120.912);
    expect(e.value(0, 5, 0)).toBe('#DIV/0!');
    // Whole-column refs include formulas in the column (here the SUM row itself is not in column A).
    expect(e.value(0, 5, 2)).toMatch(/^#/);
    expect(e.value(0, 5, 3)).toBe('#VALUE!');
  });

  it('follows references across sheets and long chains, and reports cycles', () => {
    const chain: Rows = { 0: { 0: { v: 1 } } };
    for (let r = 1; r < 3000; r++) chain[r] = { 0: { f: `A${r}+1` } };
    const other: Rows = { 0: { 0: { f: "'Chain Sheet'!A3000*2" } }, 1: { 0: { f: 'A3' }, 1: { f: 'A2' } }, 2: { 0: { f: 'B2' } } };
    const e = new Engine([sheet('Chain Sheet', chain), sheet('Other', other)]);
    expect(e.value(1, 0, 0)).toBe(6000);
    expect(e.value(0, 2999, 0)).toBe(3000);
    expect(e.value(1, 1, 0)).toBe('#CYCLE!');
  });

  it('formats values with Excel number formats', () => {
    expect(formatValue(1234.5, '#,##0.00')).toBe('1,234.50');
    expect(formatValue(0.125, '0.00%')).toBe('12.50%');
    expect(formatValue(46053, 'dd.mm.yyyy')).toBe('31.01.2026');
    expect(formatValue(1 / 3)).toBe('0.33333333333');
    expect(formatValue(true)).toBe('TRUE');
    expect(formatValue(null)).toBe('');
  });
});
