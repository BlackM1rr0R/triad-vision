import { describe, expect, it } from 'vitest';
import { Engine } from './formula';
import { setCells, type Rows, type Sheet } from './model';
import { toApi, toApiPatch } from './useWorkbook';

const sheet = (key: string, rows: Rows, id?: number): Sheet => ({ id, key, name: key, rows, rowCount: 100, colCount: 10, colWidths: {}, frozenRows: 0, frozenCols: 0, merges: [] });

describe('save payloads', () => {
  it('sends only changed cells of existing sheets and whole new sheets', () => {
    const rows: Rows = {};
    for (let r = 0; r < 500; r++) rows[r] = { 0: { v: r }, 1: { f: `A${r + 1}*2` } };
    const saved = [sheet('Data', rows, 1)];
    const engine = new Engine(saved);
    const edited = { ...saved[0], rows: setCells(saved[0].rows, [
      { r: 3, c: 0, cell: { v: 100 } },
      { r: 4, c: 0, cell: undefined },
      { r: 600, c: 2, cell: { f: 'SUM(A1:A5)' } },
    ]) };
    const added = sheet('Neu', { 0: { 0: { v: 'x' } } });
    const payload = toApiPatch([edited, added], saved, engine);
    expect(payload[0]).toMatchObject({ id: 1, name: 'Data' });
    expect(payload[0]).not.toHaveProperty('rows');
    expect((payload[0] as { patch: unknown }).patch).toEqual({
      3: { 0: { v: 100 } },
      4: { 0: null },
      600: { 2: { f: 'SUM(A1:A5)', v: 0 + 1 + 2 + 100 } },
    });
    expect(payload[1]).toEqual({ name: 'Neu', colWidths: {}, frozenRows: 0, frozenCols: 0, rows: { 0: { 0: { v: 'x' } } } });
    // A full payload still carries every cell with formula results.
    const full = toApi([edited], engine)[0];
    expect(Object.keys(full.rows)).toHaveLength(501);
    expect(full.rows[3][1]).toEqual({ f: 'A4*2', v: 200 });
  });
});
