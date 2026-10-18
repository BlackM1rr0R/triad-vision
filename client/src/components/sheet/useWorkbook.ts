import { useCallback, useMemo, useRef, useState } from 'react';
import { Engine } from './formula';
import {
  DEFAULT_COL_WIDTH,
  MAX_COLS,
  MAX_ROWS,
  MIN_COLS,
  MIN_ROWS,
  applyStructOp,
  getCell,
  newKey,
  parseInput,
  setCells,
  sortSheetRows,
  usedSize,
  type Cell,
  type CellStyle,
  type Pos,
  type Rows,
  type Sheet,
  type StructOp,
} from './model';
import type { CellChange } from './types';

/** Sheet as the API sends it (/api/drive/sheets/:id). */
export interface ApiSheet {
  id?: number;
  name: string;
  rows: Record<string, Record<string, Cell>>;
  rowCount?: number;
  colCount?: number;
  colWidths?: Record<string, number>;
  frozenRows?: number;
  frozenCols?: number;
  merges?: string[];
}

export const fromApi = (s: ApiSheet): Sheet => {
  const rows: Rows = {};
  for (const [r, cols] of Object.entries(s.rows ?? {})) {
    const line: Record<number, Cell> = {};
    for (const [c, cell] of Object.entries(cols)) line[Number(c)] = cell;
    rows[Number(r)] = line;
  }
  const used = usedSize(rows);
  const colWidths: Record<number, number> = {};
  for (const [c, w] of Object.entries(s.colWidths ?? {})) colWidths[Number(c)] = w;
  return {
    id: s.id,
    key: newKey(),
    name: s.name,
    rows,
    rowCount: Math.min(MAX_ROWS, Math.max(MIN_ROWS, used.rows + 50, s.rowCount ?? 0)),
    colCount: Math.min(MAX_COLS, Math.max(MIN_COLS, used.cols + 5, s.colCount ?? 0)),
    colWidths,
    frozenRows: s.frozenRows ?? 0,
    frozenCols: s.frozenCols ?? 0,
    merges: s.merges ?? [],
  };
};

/** Save payload: formula cells carry their computed value (Excel shows it until it recalculates). */
export const toApi = (sheets: Sheet[]) => {
  const engine = new Engine(sheets);
  return sheets.map((s, si) => {
    const rows: Record<string, Record<string, Cell>> = {};
    for (const [r, cols] of Object.entries(s.rows)) {
      const line: Record<string, Cell> = {};
      for (const [c, cell] of Object.entries(cols)) {
        if (cell.f) {
          const v = engine.value(si, Number(r), Number(c));
          line[c] = { ...cell, v: v === null || (typeof v === 'number' && !Number.isFinite(v)) ? undefined : v };
        } else line[c] = cell;
      }
      if (Object.keys(line).length) rows[r] = line;
    }
    const colWidths: Record<string, number> = {};
    for (const [c, w] of Object.entries(s.colWidths)) colWidths[c] = Math.max(10, Math.min(2000, Math.round(w)));
    return { ...(s.id ? { id: s.id } : {}), name: s.name, rows, colWidths, frozenRows: s.frozenRows, frozenCols: s.frozenCols };
  });
};

interface Snapshot {
  sheets: Sheet[];
  active: number;
}

const HISTORY = 100;
const INVALID_NAME = /[\\/?*[\]:]/;

export const validSheetName = (name: string, sheets: Sheet[], exceptKey?: string) => {
  const n = name.trim();
  if (!n || n.length > 31 || INVALID_NAME.test(n)) return false;
  return !sheets.some((s) => s.key !== exceptKey && s.name.toLocaleLowerCase() === n.toLocaleLowerCase());
};

const freeSheetName = (sheets: Sheet[], base = 'Sheet') => {
  for (let i = sheets.length + 1; i < 1000; i++) {
    const n = `${base}${i}`;
    if (validSheetName(n, sheets)) return n;
  }
  return `${base}${Date.now() % 100000}`;
};

/** Typed text → cell, keeping the cell's style (a "@" text format keeps everything as text). */
const cellFromRaw = (raw: string, cur: Cell | undefined): Cell | undefined => {
  const style: CellStyle | undefined = cur?.s ? { ...cur.s } : undefined;
  if (style?.numFmt === '@' && !raw.startsWith('=')) return { ...(raw ? { v: raw } : {}), s: style };
  const p = parseInput(raw, style?.numFmt);
  const cell: Cell = {};
  if (p.f) cell.f = p.f;
  else if (p.v !== undefined) cell.v = p.v;
  const s = { ...(style ?? {}), ...(p.numFmt ? { numFmt: p.numFmt } : {}) };
  if (Object.keys(s).length) cell.s = s;
  return cell;
};

/**
 * Workbook state of the .xlsx editor: sheets, active tab, undo / redo history and the dirty flag.
 * Every change produces a new immutable snapshot (untouched rows and sheets are shared).
 */
export function useWorkbook() {
  const [snap, setSnapState] = useState<Snapshot>({ sheets: [], active: 0 });
  const snapRef = useRef(snap);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [savedSheets, setSavedSheets] = useState<Sheet[] | null>(null);

  // The ref is the source of truth (updaters stay free of side effects, StrictMode-safe).
  const setSnap = useCallback((next: Snapshot) => {
    snapRef.current = next;
    setSnapState(next);
  }, []);

  const apply = useCallback(
    (fn: (s: Snapshot) => Snapshot | null) => {
      const cur = snapRef.current;
      const next = fn(cur);
      if (!next || next === cur) return;
      past.current.push(cur);
      if (past.current.length > HISTORY) past.current.shift();
      future.current = [];
      setSnap(next);
    },
    [setSnap],
  );

  const updateSheet = useCallback(
    (fn: (s: Sheet, all: Sheet[]) => Sheet | null) =>
      apply((cur) => {
        const s = cur.sheets[cur.active];
        if (!s) return null;
        const next = fn(s, cur.sheets);
        if (!next || next === s) return null;
        const sheets = cur.sheets.slice();
        sheets[cur.active] = next;
        return { ...cur, sheets };
      }),
    [apply],
  );

  const load = useCallback(
    (sheets: Sheet[]) => {
      past.current = [];
      future.current = [];
      setSnap({ sheets, active: 0 });
      setSavedSheets(sheets);
    },
    [setSnap],
  );

  const markSaved = useCallback((sheets: Sheet[]) => setSavedSheets(sheets), []);

  const commit = useCallback(
    (changes: CellChange[]) =>
      updateSheet((s) => {
        const writes = changes.map(({ r, c, raw }) => ({ r, c, cell: cellFromRaw(raw, getCell(s.rows, r, c)) }));
        const rows = setCells(s.rows, writes);
        const maxR = Math.max(...changes.map((x) => x.r)) + 1;
        const maxC = Math.max(...changes.map((x) => x.c)) + 1;
        return { ...s, rows, rowCount: Math.max(s.rowCount, maxR + 20), colCount: Math.max(s.colCount, maxC) };
      }),
    [updateSheet],
  );

  const format = useCallback(
    (cells: Pos[], patch: Partial<CellStyle>) =>
      updateSheet((s) => {
        const writes = cells.map(({ r, c }) => {
          const cur = getCell(s.rows, r, c);
          const style: CellStyle = { ...(cur?.s ?? {}), ...patch };
          for (const k of Object.keys(style) as (keyof CellStyle)[]) if (style[k] === undefined || style[k] === false) delete style[k];
          const cell: Cell = { ...(cur ?? {}) };
          if (Object.keys(style).length) cell.s = style;
          else delete cell.s;
          return { r, c, cell };
        });
        return { ...s, rows: setCells(s.rows, writes) };
      }),
    [updateSheet],
  );

  const structure = useCallback(
    (op: StructOp) =>
      apply((cur) => {
        const s = cur.sheets[cur.active];
        if (!s) return null;
        if (op.count < 0 && (op.axis === 'row' ? s.rowCount : s.colCount) + op.count < 1) return null;
        return { ...cur, sheets: applyStructOp(cur.sheets, cur.active, op) };
      }),
    [apply],
  );

  const sort = useCallback(
    (c: number, dir: 'asc' | 'desc', engine: Engine) =>
      updateSheet((s, all) => {
        const si = all.indexOf(s);
        const to = Math.max(usedSize(s.rows).rows, s.frozenRows);
        return { ...s, rows: sortSheetRows(s.rows, s.frozenRows, to, (r) => engine.value(si, r, c), dir) };
      }),
    [updateSheet],
  );

  const setColWidth = useCallback((c: number, w: number) => updateSheet((s) => ({ ...s, colWidths: { ...s.colWidths, [c]: w } })), [updateSheet]);
  const toggleFreeze = useCallback(() => updateSheet((s) => ({ ...s, frozenRows: s.frozenRows ? 0 : 1 })), [updateSheet]);

  /** Grows the grid (not an undo step: an empty area is not a change). */
  const grow = useCallback(
    (rows: number, cols: number) => {
      const cur = snapRef.current;
      const s = cur.sheets[cur.active];
      if (!s) return;
      const next = { ...s, rowCount: Math.min(MAX_ROWS, Math.max(s.rowCount, rows)), colCount: Math.min(MAX_COLS, Math.max(s.colCount, cols)) };
      if (next.rowCount === s.rowCount && next.colCount === s.colCount) return;
      const sheets = cur.sheets.slice();
      sheets[cur.active] = next;
      setSnap({ ...cur, sheets });
    },
    [setSnap],
  );

  const setActive = useCallback(
    (i: number) => {
      if (i !== snapRef.current.active) setSnap({ ...snapRef.current, active: i });
    },
    [setSnap],
  );

  const addSheet = useCallback(
    () =>
      apply((cur) => {
        const s: Sheet = { key: newKey(), name: freeSheetName(cur.sheets), rows: {}, rowCount: MIN_ROWS, colCount: MIN_COLS, colWidths: {}, frozenRows: 0, frozenCols: 0, merges: [] };
        return { sheets: [...cur.sheets, s], active: cur.sheets.length };
      }),
    [apply],
  );

  const renameSheet = useCallback(
    (key: string, name: string) =>
      apply((cur) => {
        if (!validSheetName(name, cur.sheets, key)) return null;
        const old = cur.sheets.find((s) => s.key === key);
        if (!old || old.name === name.trim()) return null;
        const newName = name.trim();
        // References to the old name in formulas follow the rename.
        const quoted = (n: string) => (/^[A-Za-z_][\w.]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);
        const pattern = new RegExp(`(^|[^\\w'])(${old.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|'${old.name.replace(/'/g, "''").replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}')!`, 'gi');
        const sheets = cur.sheets.map((s) => {
          let changed = false;
          const rows: Rows = { ...s.rows };
          for (const [r, cols] of Object.entries(s.rows)) {
            let line: Record<number, Cell> | null = null;
            for (const [c, cell] of Object.entries(cols)) {
              if (!cell.f || !cell.f.toLocaleLowerCase().includes(old.name.toLocaleLowerCase())) continue;
              const f = cell.f.replace(pattern, (_m, pre: string) => `${pre}${quoted(newName)}!`);
              if (f !== cell.f) {
                line ??= { ...cols };
                line[Number(c)] = { ...cell, f };
              }
            }
            if (line) {
              rows[Number(r)] = line;
              changed = true;
            }
          }
          const base = changed ? { ...s, rows } : s;
          return s.key === key ? { ...base, name: newName } : base;
        });
        return { ...cur, sheets };
      }),
    [apply],
  );

  const deleteSheet = useCallback(
    (key: string) =>
      apply((cur) => {
        if (cur.sheets.length <= 1) return null;
        const i = cur.sheets.findIndex((s) => s.key === key);
        if (i < 0) return null;
        const sheets = cur.sheets.filter((s) => s.key !== key);
        return { sheets, active: Math.min(cur.active >= i ? Math.max(0, cur.active - 1) : cur.active, sheets.length - 1) };
      }),
    [apply],
  );

  const moveSheet = useCallback(
    (key: string, to: number) =>
      apply((cur) => {
        const from = cur.sheets.findIndex((s) => s.key === key);
        if (from < 0 || to < 0 || to >= cur.sheets.length || to === from) return null;
        const sheets = cur.sheets.slice();
        const [s] = sheets.splice(from, 1);
        sheets.splice(to, 0, s);
        return { sheets, active: to };
      }),
    [apply],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(snapRef.current);
    setSnap(prev);
  }, [setSnap]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(snapRef.current);
    setSnap(next);
  }, [setSnap]);

  const engine = useMemo(() => new Engine(snap.sheets), [snap.sheets]);

  return {
    sheets: snap.sheets,
    active: snap.active,
    sheet: snap.sheets[snap.active] as Sheet | undefined,
    engine,
    dirty: savedSheets !== null && savedSheets !== snap.sheets && !sameContent(savedSheets, snap.sheets),
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    load,
    markSaved,
    commit,
    format,
    structure,
    sort,
    setColWidth,
    toggleFreeze,
    grow,
    setActive,
    addSheet,
    renameSheet,
    deleteSheet,
    moveSheet,
    undo,
    redo,
  };
}

/** Same saved content (grid size growth alone is not a change). */
const sameContent = (a: Sheet[], b: Sheet[]) =>
  a.length === b.length &&
  a.every((s, i) => {
    const t = b[i];
    return s.key === t.key && s.name === t.name && s.rows === t.rows && s.colWidths === t.colWidths && s.frozenRows === t.frozenRows;
  });

export { DEFAULT_COL_WIDTH };
