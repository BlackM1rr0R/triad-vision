import { getCell, setCells, type Cell, type Sheet } from './model';

/**
 * Undo / redo history of the workbook editor. Cell edits (typing, paste, clear, formatting) are stored
 * as patches — the written cells with their previous content — not as copies of the workbook; only
 * operations that touch whole sheets (insert / delete rows, sort, sheet tabs, column widths) keep the
 * two snapshots, which share every untouched row with the live state anyway.
 *
 * Every state has an id: undo returns to the id of the state before, so "unsaved changes" is simply
 * "current id ≠ id at the last save", whatever the path back.
 */

export interface Snapshot {
  sheets: Sheet[];
  active: number;
}

export interface CellWrite {
  r: number;
  c: number;
  cell: Cell | undefined;
}

export type HistoryEntry =
  | { kind: 'cells'; sheetKey: string; before: CellWrite[]; after: CellWrite[]; idBefore: number; idAfter: number }
  | { kind: 'snapshot'; before: Snapshot; after: Snapshot; idBefore: number; idAfter: number };

/** Applies cell writes to one sheet; returns the new sheet and the writes that undo them. */
export const writeCells = (s: Sheet, writes: CellWrite[]) => {
  const before = writes.map(({ r, c }) => ({ r, c, cell: getCell(s.rows, r, c) }));
  return { sheet: { ...s, rows: setCells(s.rows, writes) }, before };
};

const applyWrites = (snap: Snapshot, sheetKey: string, writes: CellWrite[]): Snapshot | null => {
  const i = snap.sheets.findIndex((s) => s.key === sheetKey);
  if (i < 0) return null;
  const sheets = snap.sheets.slice();
  sheets[i] = { ...sheets[i], rows: setCells(sheets[i].rows, writes) };
  return { sheets, active: i };
};

/** The state before `e`, rebuilt from the current state (which is the state after `e`). */
export const undoEntry = (cur: Snapshot, e: HistoryEntry): Snapshot | null =>
  e.kind === 'snapshot' ? e.before : applyWrites(cur, e.sheetKey, e.before.slice().reverse());

/** The state after `e`, rebuilt from the current state (which is the state before `e`). */
export const redoEntry = (cur: Snapshot, e: HistoryEntry): Snapshot | null => (e.kind === 'snapshot' ? e.after : applyWrites(cur, e.sheetKey, e.after));

export class History {
  past: HistoryEntry[] = [];
  future: HistoryEntry[] = [];
  constructor(private limit = 100) {}

  push(e: HistoryEntry) {
    this.past.push(e);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  /** Steps back: the restored state and its id, or null when there is nothing to undo. */
  undo(cur: Snapshot): { snap: Snapshot; id: number } | null {
    const e = this.past.pop();
    if (!e) return null;
    const snap = undoEntry(cur, e);
    if (!snap) return null;
    this.future.push(e);
    return { snap, id: e.idBefore };
  }

  redo(cur: Snapshot): { snap: Snapshot; id: number } | null {
    const e = this.future.pop();
    if (!e) return null;
    const snap = redoEntry(cur, e);
    if (!snap) return null;
    this.past.push(e);
    return { snap, id: e.idAfter };
  }
}
