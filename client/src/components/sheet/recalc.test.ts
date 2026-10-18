import { describe, expect, it } from 'vitest';
import { Engine } from './formula';
import { applyStructOp, setCells, type Cell, type Rows, type Sheet } from './model';

const sheet = (name: string, rows: Rows, key = name): Sheet => ({ key, name, rows, rowCount: 100, colCount: 10, colWidths: {}, frozenRows: 0, frozenCols: 0, merges: [] });

/** A new workbook snapshot with some cells of one sheet replaced (as the editor does: rows shared). */
const edit = (sheets: Sheet[], si: number, writes: { r: number; c: number; cell: Cell | undefined }[]) => {
  const next = sheets.slice();
  next[si] = { ...sheets[si], rows: setCells(sheets[si].rows, writes) };
  return next;
};

describe('incremental recalculation', () => {
  it('recomputes only the formulas depending on a changed cell', () => {
    const rows: Rows = {};
    for (let r = 0; r < 100; r++) rows[r] = { 0: { v: r }, 1: { v: 1 }, 2: { f: `A${r + 1}*2` } };
    rows[100] = { 0: { f: 'SUM(A1:A100)' }, 1: { f: 'SUM(B1:B100)' } };
    let sheets = [sheet('S', rows)];
    const e = new Engine(sheets);
    for (let r = 0; r < 100; r++) e.value(0, r, 2);
    expect(e.value(0, 100, 0)).toBe(4950);
    expect(e.value(0, 100, 1)).toBe(100);
    const before = e.evaluations;

    sheets = edit(sheets, 0, [{ r: 5, c: 0, cell: { v: 1000 } }]);
    expect(e.sync(sheets)).toBe(true);
    // Read everything again: only C6 and the column A total are re-evaluated.
    for (let r = 0; r < 100; r++) e.value(0, r, 2);
    expect(e.value(0, 5, 2)).toBe(2000);
    expect(e.value(0, 100, 0)).toBe(4950 - 5 + 1000);
    expect(e.value(0, 100, 1)).toBe(100);
    expect(e.evaluations - before).toBe(2);
  });

  it('follows chains transitively and across sheets', () => {
    let sheets = [sheet('Data', { 0: { 0: { v: 1 } }, 1: { 0: { f: 'A1+1' } }, 2: { 0: { f: 'A2+1' } } }), sheet('Sum', { 0: { 0: { f: 'Data!A3*10' } }, 1: { 0: { f: 'SUM(Data!A1:A3)' } } })];
    const e = new Engine(sheets);
    expect(e.value(1, 0, 0)).toBe(30);
    expect(e.value(1, 1, 0)).toBe(6);
    sheets = edit(sheets, 0, [{ r: 0, c: 0, cell: { v: 5 } }]);
    e.sync(sheets);
    expect(e.value(0, 2, 0)).toBe(7);
    expect(e.value(1, 0, 0)).toBe(70);
    expect(e.value(1, 1, 0)).toBe(18);
  });

  it('notices new cells inside a referenced range, also below the used area', () => {
    let sheets = [sheet('S', { 0: { 0: { v: 1 } }, 1: { 0: { v: 2 } }, 0o12: { 2: { f: 'SUM(A:A)' } } })];
    const e = new Engine(sheets);
    expect(e.value(0, 10, 2)).toBe(3);
    sheets = edit(sheets, 0, [{ r: 500, c: 0, cell: { v: 10 } }]);
    e.sync(sheets);
    expect(e.value(0, 10, 2)).toBe(13);
    sheets = edit(sheets, 0, [{ r: 500, c: 0, cell: undefined }]);
    e.sync(sheets);
    expect(e.value(0, 10, 2)).toBe(3);
  });

  it('updates when a formula itself changes and drops its old dependencies', () => {
    let sheets = [sheet('S', { 0: { 0: { v: 1 }, 1: { v: 2 }, 2: { f: 'A1' } } })];
    const e = new Engine(sheets);
    expect(e.value(0, 0, 2)).toBe(1);
    sheets = edit(sheets, 0, [{ r: 0, c: 2, cell: { f: 'B1*3' } }]);
    e.sync(sheets);
    expect(e.value(0, 0, 2)).toBe(6);
    const n = e.evaluations;
    // A1 is no longer read by C1: changing it does not re-evaluate C1.
    sheets = edit(sheets, 0, [{ r: 0, c: 0, cell: { v: 99 } }]);
    e.sync(sheets);
    expect(e.value(0, 0, 2)).toBe(6);
    expect(e.evaluations).toBe(n);
  });

  it('keeps detecting cycles after edits and recovers when the cycle is broken', () => {
    let sheets = [sheet('S', { 0: { 0: { f: 'B1+1' }, 1: { v: 1 } } })];
    const e = new Engine(sheets);
    expect(e.value(0, 0, 0)).toBe(2);
    sheets = edit(sheets, 0, [{ r: 0, c: 1, cell: { f: 'A1+1' } }]);
    e.sync(sheets);
    expect(e.value(0, 0, 0)).toBe('#CYCLE!');
    sheets = edit(sheets, 0, [{ r: 0, c: 1, cell: { v: 10 } }]);
    e.sync(sheets);
    expect(e.value(0, 0, 0)).toBe(11);
  });

  it('ignores style-only changes and resets on structural ones', () => {
    let sheets = [sheet('S', { 0: { 0: { v: 2 } }, 1: { 0: { f: 'A1*2' } } }), sheet('T', { 0: { 0: { f: 'S!A2' } } })];
    const e = new Engine(sheets);
    expect(e.value(1, 0, 0)).toBe(4);
    sheets = edit(sheets, 0, [{ r: 0, c: 0, cell: { v: 2, s: { b: true } } }]);
    expect(e.sync(sheets)).toBe(false);
    // Insert a row above: formulas are rewritten by applyStructOp, the engine follows.
    sheets = applyStructOp(sheets, 0, { axis: 'row', at: 0, count: 1 });
    e.sync(sheets);
    expect(sheets[1].rows[0][0].f).toBe('S!A3');
    expect(e.value(0, 2, 0)).toBe(4);
    expect(e.value(1, 0, 0)).toBe(4);
    // Renaming a sheet resets the name lookup.
    sheets = [sheets[0], { ...sheets[1], name: 'U' }];
    e.sync(sheets);
    expect(e.value(1, 0, 0)).toBe(4);
  });

  it('gives the same results as a fresh engine after many random edits', () => {
    const rows: Rows = {};
    for (let r = 0; r < 30; r++) rows[r] = { 0: { v: r }, 1: { f: r ? `B${r}+A${r + 1}` : 'A1' }, 2: { f: `SUM(A1:A${r + 1})` } };
    let sheets = [sheet('S', rows)];
    const e = new Engine(sheets);
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 16807) % 2147483647) % n);
    for (let i = 0; i < 200; i++) {
      for (let r = 0; r < 30; r += 3) e.value(0, r, rnd(3));
      sheets = edit(sheets, 0, [{ r: rnd(30), c: 0, cell: rnd(5) === 0 ? undefined : { v: rnd(100) } }]);
      e.sync(sheets);
    }
    const fresh = new Engine(sheets);
    for (let r = 0; r < 30; r++) for (let c = 0; c < 3; c++) expect(e.value(0, r, c)).toEqual(fresh.value(0, r, c));
  });
});
