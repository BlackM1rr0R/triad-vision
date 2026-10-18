import { useCallback, useRef, useState } from 'react';
import { Engine } from './formula';
import {
  DEFAULT_COL_WIDTH,
  MAX_COLS,
  MAX_ROWS,
  MIN_COLS,
  MIN_ROWS,
  applyStructOp,
  diffRows,
  getCell,
  newKey,
  parseInput,
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
import { History, writeCells, type CellWrite, type Snapshot } from './history';

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

/** Value of a formula cell as saved (Excel shows it until it recalculates). */
const savedValue = (engine: Engine, si: number, r: number, c: number) => {
  const v = engine.value(si, r, c);
  return v === null || (typeof v === 'number' && !Number.isFinite(v)) ? undefined : v;
};

const sheetMeta = (s: Sheet) => {
  const colWidths: Record<string, number> = {};
  for (const [c, w] of Object.entries(s.colWidths)) colWidths[c] = Math.max(10, Math.min(2000, Math.round(w)));
  return { ...(s.id ? { id: s.id } : {}), name: s.name, colWidths, frozenRows: s.frozenRows, frozenCols: s.frozenCols };
};

/** Every cell of a sheet as saved (formula cells carry their computed value). */
const fullRows = (s: Sheet, si: number, engine: Engine) => {
  const rows: Record<string, Record<string, Cell>> = {};
  for (const [r, cols] of Object.entries(s.rows)) {
    const line: Record<string, Cell> = {};
    for (const [c, cell] of Object.entries(cols)) line[c] = cell.f ? { ...cell, v: savedValue(engine, si, Number(r), Number(c)) } : cell;
    if (Object.keys(line).length) rows[r] = line;
  }
  return rows;
};

/** Save payload: every cell of every sheet. */
export const toApi = (sheets: Sheet[], engine: Engine = new Engine(sheets)) => {
  engine.sync(sheets);
  return sheets.map((s, si) => ({ ...sheetMeta(s), rows: fullRows(s, si, engine) }));
};

/**
 * Save payload with only the cells changed since `saved` (the workbook as last loaded / saved) for
 * sheets that already exist in the file: `patch[r][c]` is the new cell or null (cleared). Sheets added
 * in the browser are sent whole. The server applies a patch on top of the stored version.
 */
export const toApiPatch = (sheets: Sheet[], saved: Sheet[], engine: Engine) => {
  engine.sync(sheets);
  const byKey = new Map(saved.map((s) => [s.key, s]));
  return sheets.map((s, si) => {
    const base = byKey.get(s.key);
    if (!s.id || !base || base.id !== s.id) return { ...sheetMeta(s), rows: fullRows(s, si, engine) };
    const patch: Record<string, Record<string, Cell | null>> = {};
    diffRows(base.rows, s.rows, (r, c, cell) => {
      (patch[r] ??= {})[c] = !cell ? null : cell.f ? { ...cell, v: savedValue(engine, si, r, c) } : cell;
    });
    return { ...sheetMeta(s), patch };
  });
};

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
 * Every change produces a new immutable snapshot (untouched rows and sheets are shared); the history
 * stores cell edits as patches (see history.ts). One formula engine lives as long as the editor and is
 * moved to each new snapshot incrementally (only changed cells and their dependents are recomputed).
 */
export function useWorkbook() {
  const [snap, setSnapState] = useState<Snapshot & { id: number }>({ sheets: [], active: 0, id: 0 });
  const snapRef = useRef(snap);
  const history = useRef(new History(HISTORY));
  const idSeq = useRef(0);
  /** The workbook as last loaded / saved (base of the next patch save) and its state id. */
  const saved = useRef<{ sheets: Sheet[]; id: number } | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const engineOf = useCallback((sheets: Sheet[]) => {
    if (!engineRef.current) engineRef.current = new Engine(sheets);
    else engineRef.current.sync(sheets);
    return engineRef.current;
  }, []);

  // The ref is the source of truth (updaters stay free of side effects, StrictMode-safe).
  const setSnap = useCallback((next: Snapshot, id: number) => {
    const s = { sheets: next.sheets, active: next.active, id };
    snapRef.current = s;
    setSnapState(s);
  }, []);

  /** Whole-snapshot change (structure, sort, tabs): both snapshots go into the history. */
  const apply = useCallback(
    (fn: (s: Snapshot) => Snapshot | null) => {
      const cur = snapRef.current;
      const next = fn(cur);
      if (!next || (next.sheets === cur.sheets && next.active === cur.active)) return;
      const id = ++idSeq.current;
      history.current.push({ kind: 'snapshot', before: { sheets: cur.sheets, active: cur.active }, after: { sheets: next.sheets, active: next.active }, idBefore: cur.id, idAfter: id });
      setSnap(next, id);
    },
    [setSnap],
  );

  /** Cell writes on the active sheet: stored as a patch. */
  const writeActive = useCallback(
    (fn: (s: Sheet) => { writes: CellWrite[]; rowCount?: number; colCount?: number } | null) => {
      const cur = snapRef.current;
      const s = cur.sheets[cur.active];
      if (!s) return;
      const out = fn(s);
      if (!out || !out.writes.length) return;
      const { sheet, before } = writeCells(s, out.writes);
      const next = { ...sheet, rowCount: Math.min(MAX_ROWS, Math.max(s.rowCount, out.rowCount ?? 0)), colCount: Math.min(MAX_COLS, Math.max(s.colCount, out.colCount ?? 0)) };
      const sheets = cur.sheets.slice();
      sheets[cur.active] = next;
      const id = ++idSeq.current;
      history.current.push({ kind: 'cells', sheetKey: s.key, before, after: out.writes, idBefore: cur.id, idAfter: id });
      setSnap({ sheets, active: cur.active }, id);
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
      history.current.clear();
      const id = ++idSeq.current;
      engineRef.current = new Engine(sheets);
      saved.current = { sheets, id };
      setSnap({ sheets, active: 0 }, id);
      setSavedId(id);
    },
    [setSnap],
  );

  /** Marks the given state (the one that was sent) as saved. */
  const markSaved = useCallback((state: { sheets: Sheet[]; id: number }) => {
    saved.current = state;
    setSavedId(state.id);
  }, []);

  /** Current state for saving: sheets, id, the last saved state (patch base) and a synced engine. */
  const saveState = useCallback(() => {
    const cur = snapRef.current;
    return { sheets: cur.sheets, id: cur.id, saved: saved.current, engine: engineOf(cur.sheets) };
  }, [engineOf]);

  const commit = useCallback(
    (changes: CellChange[]) =>
      writeActive((s) => {
        if (!changes.length) return null;
        const writes = changes.map(({ r, c, raw }) => ({ r, c, cell: cellFromRaw(raw, getCell(s.rows, r, c)) }));
        let maxR = 0;
        let maxC = 0;
        for (const x of changes) {
          if (x.r + 1 > maxR) maxR = x.r + 1;
          if (x.c + 1 > maxC) maxC = x.c + 1;
        }
        return { writes, rowCount: maxR + 20, colCount: maxC };
      }),
    [writeActive],
  );

  const format = useCallback(
    (cells: Pos[], patch: Partial<CellStyle>) =>
      writeActive((s) => {
        const writes = cells.map(({ r, c }) => {
          const cur = getCell(s.rows, r, c);
          const style: CellStyle = { ...(cur?.s ?? {}), ...patch };
          for (const k of Object.keys(style) as (keyof CellStyle)[]) if (style[k] === undefined || style[k] === false) delete style[k];
          const cell: Cell = { ...(cur ?? {}) };
          if (Object.keys(style).length) cell.s = style;
          else delete cell.s;
          return { r, c, cell };
        });
        return { writes };
      }),
    [writeActive],
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
    (c: number, dir: 'asc' | 'desc') =>
      updateSheet((s, all) => {
        const si = all.indexOf(s);
        const engine = engineOf(all);
        const to = Math.max(usedSize(s.rows).rows, s.frozenRows);
        return { ...s, rows: sortSheetRows(s.rows, s.frozenRows, to, (r) => engine.value(si, r, c), dir) };
      }),
    [updateSheet, engineOf],
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
      setSnap({ ...cur, sheets }, cur.id);
    },
    [setSnap],
  );

  const setActive = useCallback(
    (i: number) => {
      if (i !== snapRef.current.active) setSnap({ ...snapRef.current, active: i }, snapRef.current.id);
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
    const out = history.current.undo(snapRef.current);
    if (out) setSnap(out.snap, out.id);
  }, [setSnap]);

  const redo = useCallback(() => {
    const out = history.current.redo(snapRef.current);
    if (out) setSnap(out.snap, out.id);
  }, [setSnap]);

  // Moves the engine to the rendered snapshot; `engineRev` changes when values may have changed.
  const engine = engineOf(snap.sheets);
  const engineRev = engine.rev;

  return {
    sheets: snap.sheets,
    active: snap.active,
    sheet: snap.sheets[snap.active] as Sheet | undefined,
    engine,
    engineRev,
    stateId: snap.id,
    dirty: savedId !== null && savedId !== snap.id,
    canUndo: history.current.past.length > 0,
    canRedo: history.current.future.length > 0,
    load,
    markSaved,
    saveState,
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

export { DEFAULT_COL_WIDTH };
