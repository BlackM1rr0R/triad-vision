import { describe, expect, it } from 'vitest';
import {
  applyStructOp,
  colIndex,
  colName,
  compareValues,
  filterRows,
  isDateFormat,
  matchesFilter,
  parseA1,
  parseInput,
  parseRange,
  parseTsv,
  rangeOf,
  rangeToA1,
  rawOf,
  serialOf,
  setCell,
  setCells,
  shiftFormula,
  sortIndices,
  sortSheetRows,
  toA1,
  toTsv,
  translateFormula,
  usedSize,
  type Rows,
  type Sheet,
} from './model';

describe('A1 addressing', () => {
  it('converts column indices and names both ways', () => {
    expect([0, 25, 26, 51, 701, 702, 16383].map(colName)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA', 'XFD']);
    expect(['A', 'z', 'AA', 'XFD', '', 'A1'].map(colIndex)).toEqual([0, 25, 26, 16383, -1, -1]);
    expect(toA1(2, 1)).toBe('B3');
    expect(parseA1('$B$3')).toEqual({ r: 2, c: 1 });
    expect(parseA1('B0')).toBeNull();
    expect(parseA1('XFE1')).toBeNull();
  });

  it('normalises ranges', () => {
    expect(rangeOf({ r: 5, c: 3 }, { r: 1, c: 0 })).toEqual({ r0: 1, c0: 0, r1: 5, c1: 3 });
    expect(parseRange('C3:A1')).toEqual({ r0: 0, c0: 0, r1: 2, c1: 2 });
    expect(rangeToA1({ r0: 0, c0: 0, r1: 0, c1: 0 })).toBe('A1');
    expect(rangeToA1({ r0: 0, c0: 0, r1: 9, c1: 1 })).toBe('A1:B10');
  });
});

describe('TSV', () => {
  it('round-trips quoted fields with tabs, newlines and quotes', () => {
    const grid = [
      ['a', 'b\tc', 'say "hi"'],
      ['line1\nline2', '', '3'],
    ];
    const text = toTsv(grid);
    expect(text).toBe('a\t"b\tc"\t"say ""hi"""\r\n"line1\nline2"\t\t3');
    expect(parseTsv(text)).toEqual(grid);
  });

  it('parses Excel clipboard text with a trailing newline', () => {
    expect(parseTsv('1\t2\r\n3\t4\r\n')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(parseTsv('')).toEqual([]);
  });
});

describe('sorting and filtering', () => {
  it('orders numbers before text before booleans, blanks last in both directions', () => {
    const vals = ['b', 10, null, 2, 'A', true, ''];
    const idx = vals.map((_, i) => i);
    expect(sortIndices(idx, (i) => vals[i], 'asc').map((i) => vals[i])).toEqual([2, 10, 'A', 'b', true, null, '']);
    expect(sortIndices(idx, (i) => vals[i], 'desc').map((i) => vals[i])).toEqual([true, 'b', 'A', 10, 2, null, '']);
    expect(compareValues('item 2', 'item 10')).toBeLessThan(0);
  });

  it('filters by substring and picked values, keeping frozen rows', () => {
    expect(matchesFilter('Berlin', { contains: 'erl' })).toBe(true);
    expect(matchesFilter('Berlin', { values: ['Baku'] })).toBe(false);
    const data = [['City'], ['Berlin'], ['Baku'], ['Bonn']];
    expect(filterRows(4, 1, { 0: { contains: 'b', values: ['Baku', 'Bonn'] } }, (r, c) => data[r][c])).toEqual([0, 2, 3]);
  });

  it('physically sorts sheet rows below the header', () => {
    const rows: Rows = { 0: { 0: { v: 'Name' } }, 1: { 0: { v: 'c' } }, 2: { 0: { v: 'a' } }, 3: { 0: { v: 'b' } } };
    const sorted = sortSheetRows(rows, 1, 4, (r) => rows[r]?.[0]?.v, 'asc');
    expect([0, 1, 2, 3].map((r) => sorted[r][0].v)).toEqual(['Name', 'a', 'b', 'c']);
  });
});

describe('cells and structure', () => {
  it('sets and removes cells immutably', () => {
    const a: Rows = {};
    const b = setCell(a, 1, 2, { v: 5 });
    expect(a).toEqual({});
    expect(b).toEqual({ 1: { 2: { v: 5 } } });
    expect(setCell(b, 1, 2, { v: '' })).toEqual({});
    expect(setCells(b, [{ r: 0, c: 0, cell: { v: 1 } }, { r: 1, c: 2, cell: undefined }])).toEqual({ 0: { 0: { v: 1 } } });
    expect(usedSize({ 4: { 7: { v: 1 } }, 1: { 0: { v: 1 } } })).toEqual({ rows: 5, cols: 8 });
  });

  it('shifts formula references on insert / delete, only for the affected sheet', () => {
    expect(shiftFormula('SUM(A1:A10)+B5', { axis: 'row', at: 2, count: 3 }, 'S1', 'S1')).toBe('SUM(A1:A13)+B8');
    expect(shiftFormula('A1+$C$4', { axis: 'col', at: 1, count: 1 }, 'S1', 'S1')).toBe('A1+$D$4');
    expect(shiftFormula('A5*2', { axis: 'row', at: 4, count: -1 }, 'S1', 'S1')).toBe('#REF!*2');
    expect(shiftFormula('A5+S2!A5', { axis: 'row', at: 0, count: 1 }, 'S1', 'S2')).toBe('A5+S2!A6');
    expect(shiftFormula('"A1"&A1', { axis: 'row', at: 0, count: 1 }, 'S1', 'S1')).toBe('"A1"&A2');
    expect(shiftFormula('LOG10(A1)', { axis: 'row', at: 0, count: 1 }, 'S1', 'S1')).toBe('LOG10(A2)');
  });

  it('translates relative references when pasting', () => {
    expect(translateFormula('A1+$B$1+C$2+$D3', 2, 1)).toBe('B3+$B$1+D$2+$D5');
    expect(translateFormula('A1', -1, 0)).toBe('#REF!');
    expect(translateFormula("'My Sheet'!A1*2", 1, 1)).toBe("'My Sheet'!B2*2");
  });

  it('inserts and deletes rows and columns in a workbook and fixes formulas everywhere', () => {
    const mk = (name: string, rows: Rows): Sheet => ({ key: name, name, rows, rowCount: 10, colCount: 5, colWidths: { 2: 150 }, frozenRows: 0, frozenCols: 0, merges: [] });
    const sheets = [mk('A', { 0: { 0: { v: 1 } }, 1: { 0: { v: 2 } }, 2: { 0: { f: 'SUM(A1:A2)' } } }), mk('B', { 0: { 0: { f: 'A!A3*2' } } })];
    const ins = applyStructOp(sheets, 0, { axis: 'row', at: 1, count: 1 });
    expect(ins[0].rows[3][0].f).toBe('SUM(A1:A3)');
    expect(ins[0].rows[2][0].v).toBe(2);
    expect(ins[0].rowCount).toBe(11);
    expect(ins[1].rows[0][0].f).toBe('A!A4*2');
    const delCol = applyStructOp(sheets, 0, { axis: 'col', at: 0, count: -1 });
    expect(delCol[0].rows).toEqual({});
    expect(delCol[0].colWidths).toEqual({ 1: 150 });
    expect(delCol[1].rows[0][0].f).toBe('A!#REF!*2');
  });
});

describe('typed input', () => {
  it('recognises formulas, numbers, percentages, dates, booleans and forced text', () => {
    expect(parseInput('=SUM(A1:A3)')).toEqual({ f: 'SUM(A1:A3)' });
    expect(parseInput('42.5')).toEqual({ v: 42.5 });
    expect(parseInput('15%')).toEqual({ v: 0.15, numFmt: '0%' });
    expect(parseInput('31.01.2026')).toEqual({ v: serialOf(2026, 1, 31), numFmt: 'dd.mm.yyyy' });
    expect(parseInput('2026-01-31', 'yyyy-mm-dd')).toEqual({ v: 46053 });
    expect(parseInput('31.02.2026')).toEqual({ v: '31.02.2026' });
    expect(parseInput('true')).toEqual({ v: true });
    expect(parseInput("'0123")).toEqual({ v: '0123' });
    expect(parseInput('')).toEqual({});
    expect(isDateFormat('dd.mm.yyyy')).toBe(true);
    expect(isDateFormat('#,##0.00 "€"')).toBe(false);
    expect(rawOf({ v: 46053, s: { numFmt: 'dd.mm.yyyy' } })).toBe('31.01.2026');
    expect(rawOf({ f: 'A1+1', v: 3 })).toBe('=A1+1');
  });
});
