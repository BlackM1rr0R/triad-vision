import { describe, expect, it } from 'vitest';
import { History, writeCells, type Snapshot } from './history';
import { applyStructOp, type Rows, type Sheet } from './model';

const sheet = (key: string, rows: Rows): Sheet => ({ key, name: key, rows, rowCount: 100, colCount: 10, colWidths: {}, frozenRows: 0, frozenCols: 0, merges: [] });

describe('patch-based undo', () => {
  it('stores only the written cells and restores them on undo / redo', () => {
    const rows: Rows = {};
    for (let r = 0; r < 1000; r++) rows[r] = { 0: { v: r } };
    let cur: Snapshot = { sheets: [sheet('a', rows), sheet('b', { 0: { 0: { v: 'x' } } })], active: 0 };
    const h = new History();
    const writes = [
      { r: 3, c: 0, cell: { v: 'three' } },
      { r: 3, c: 1, cell: { v: 'new' } },
      { r: 5, c: 0, cell: undefined },
    ];
    const { sheet: s1, before } = writeCells(cur.sheets[0], writes);
    h.push({ kind: 'cells', sheetKey: 'a', before, after: writes, idBefore: 1, idAfter: 2 });
    // The entry holds the three cells, not a copy of the 1000-row sheet.
    expect(before).toEqual([
      { r: 3, c: 0, cell: { v: 3 } },
      { r: 3, c: 1, cell: undefined },
      { r: 5, c: 0, cell: { v: 5 } },
    ]);
    const after: Snapshot = { sheets: [s1, cur.sheets[1]], active: 0 };
    expect(after.sheets[0].rows[3]).toEqual({ 0: { v: 'three' }, 1: { v: 'new' } });
    expect(after.sheets[0].rows[5]).toBeUndefined();
    expect(after.sheets[0].rows[4]).toBe(rows[4]); // untouched rows are shared

    const undone = h.undo(after)!;
    expect(undone.id).toBe(1);
    expect(undone.snap.sheets[0].rows[3]).toEqual({ 0: { v: 3 } });
    expect(undone.snap.sheets[0].rows[5]).toEqual({ 0: { v: 5 } });
    expect(undone.snap.sheets[1]).toBe(cur.sheets[1]);
    const redone = h.redo(undone.snap)!;
    expect(redone.id).toBe(2);
    expect(redone.snap.sheets[0].rows[3]).toEqual({ 0: { v: 'three' }, 1: { v: 'new' } });
    expect(redone.snap.sheets[0].rows[5]).toBeUndefined();
    cur = redone.snap;
    expect(h.redo(cur)).toBeNull();
  });

  it('undoes a patch on the right sheet after the tabs moved, and switches to it', () => {
    const a = sheet('a', { 0: { 0: { v: 1 } } });
    const b = sheet('b', { 0: { 0: { v: 2 } } });
    const h = new History();
    const { sheet: b2, before } = writeCells(b, [{ r: 0, c: 0, cell: { v: 20 } }]);
    h.push({ kind: 'cells', sheetKey: 'b', before, after: [{ r: 0, c: 0, cell: { v: 20 } }], idBefore: 1, idAfter: 2 });
    // Current state: tabs swapped (as if by a later step that was already undone), sheet a active.
    const out = h.undo({ sheets: [b2, a], active: 1 })!;
    expect(out.snap.active).toBe(0);
    expect(out.snap.sheets[0].rows[0][0]).toEqual({ v: 2 });
  });

  it('mixes patches and snapshot steps in order', () => {
    const s0: Snapshot = { sheets: [sheet('a', { 0: { 0: { v: 'top' } }, 1: { 0: { f: 'A1' } } })], active: 0 };
    const h = new History();
    // 1: insert a row (snapshot step)
    const s1: Snapshot = { sheets: applyStructOp(s0.sheets, 0, { axis: 'row', at: 0, count: 1 }), active: 0 };
    h.push({ kind: 'snapshot', before: s0, after: s1, idBefore: 1, idAfter: 2 });
    // 2: type into the new row (patch)
    const w = [{ r: 0, c: 0, cell: { v: 'header' } }];
    const { sheet: t2, before } = writeCells(s1.sheets[0], w);
    h.push({ kind: 'cells', sheetKey: 'a', before, after: w, idBefore: 2, idAfter: 3 });
    const s2: Snapshot = { sheets: [t2], active: 0 };
    expect(s2.sheets[0].rows[2][0].f).toBe('A2');

    const u1 = h.undo(s2)!;
    expect(u1.id).toBe(2);
    expect(u1.snap.sheets[0].rows[0]).toBeUndefined();
    const u2 = h.undo(u1.snap)!;
    expect(u2.id).toBe(1);
    expect(u2.snap).toBe(s0);
    const r1 = h.redo(u2.snap)!;
    const r2 = h.redo(r1.snap)!;
    expect(r2.id).toBe(3);
    expect(r2.snap.sheets[0].rows[0][0]).toEqual({ v: 'header' });
    expect(r2.snap.sheets[0].rows[2][0].f).toBe('A2');
  });

  it('drops the redo branch on a new step and caps the history', () => {
    const h = new History(3);
    const s: Snapshot = { sheets: [sheet('a', {})], active: 0 };
    for (let i = 0; i < 5; i++) h.push({ kind: 'snapshot', before: s, after: s, idBefore: i, idAfter: i + 1 });
    expect(h.past).toHaveLength(3);
    h.undo(s);
    expect(h.future).toHaveLength(1);
    h.push({ kind: 'snapshot', before: s, after: s, idBefore: 9, idAfter: 10 });
    expect(h.future).toHaveLength(0);
  });
});
