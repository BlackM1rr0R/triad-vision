import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Eraser,
  Filter,
  FilterX,
  Redo2,
  Scissors,
  Search,
  Square,
  SquareCheck,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  colName,
  filterActive,
  matchesFilter,
  parseTsv,
  rangeOf,
  sortIndices,
  toTsv,
  translateFormula,
  type CellStyle,
  type ColumnFilter,
  type Pos,
  type Range,
} from './model';
import type { CellChange, GridProps, GridSource } from './types';
import { DateEditor, SelectEditor, TextEditor, type EditEnd } from './Editors';
import { ContextMenu, FilterMenu, type MenuItem } from './Popups';

const HEADER_H = 26;
const ROW_HEADER_W = 52;
/** Highlight of selected row / column headers: tinted but opaque (headers are sticky over the cells). */
const SELECTED_HEADER: CSSProperties = { background: 'linear-gradient(var(--color-brand-100), var(--color-brand-100)), var(--color-surface)' };
const MIN_COL_W = 36;
/** Selections up to this many cells get their status-bar figures synchronously, bigger ones a moment later. */
const SYNC_STATS_CELLS = 20_000;

/** True for light colours ("#RRGGBB"), by relative luminance. */
const isLight = (hex: string) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(n)) return true;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
};

type Editing = { vr: number; c: number; mode: 'enter' | 'edit'; initial?: string; fromBar?: boolean } | null;

interface Clip {
  text: string;
  raws: string[][];
  /** Data position of the copied block's top-left cell. */
  origin: Pos;
}

// ─── Draft store: the text being edited lives outside the grid's state ──────────────────────
// Typing re-renders only the in-cell editor and the formula bar, never the grid.

interface Draft {
  get(): string;
  set(v: string): void;
  subscribe(fn: () => void): () => void;
}

const createDraft = (): Draft => {
  let value = '';
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      if (v === value) return;
      value = v;
      subs.forEach((fn) => fn());
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
};

const useDraft = (d: Draft) => useSyncExternalStore(d.subscribe, d.get);

// ─── Cell styles: one CSSProperties object per (cell style, alignment) so memoised cells can skip ─

const styleCache = new WeakMap<CellStyle, Map<string, CSSProperties>>();
const plainStyles = new Map<string, CSSProperties>();

const buildStyle = (st: CellStyle | undefined, align: string | undefined, raised: boolean): CSSProperties => {
  const style: CSSProperties = {};
  if (st?.b) style.fontWeight = 700;
  if (st?.i) style.fontStyle = 'italic';
  if (st?.u) style.textDecoration = 'underline';
  if (st?.color) style.color = st.color;
  if (st?.fill) {
    style.backgroundColor = st.fill;
    // Excel's default text is black: keep it readable on a filled cell in dark mode too.
    if (!st.color) style.color = isLight(st.fill) ? '#111827' : '#ffffff';
  }
  if (st?.wrap) {
    style.whiteSpace = 'pre-wrap';
    style.lineHeight = '16px';
    style.paddingTop = 3;
  }
  if (align) style.textAlign = align as CSSProperties['textAlign'];
  if (raised) style.zIndex = 1;
  return style;
};

const cellStyle = (st: CellStyle | undefined, align: string | undefined, raised: boolean): CSSProperties => {
  const key = `${align ?? ''}${raised ? '|z' : ''}`;
  let map = plainStyles as Map<string, CSSProperties>;
  if (st) {
    let m = styleCache.get(st);
    if (!m) styleCache.set(st, (m = new Map()));
    map = m;
  }
  let s = map.get(key);
  if (!s) map.set(key, (s = buildStyle(st, align, raised)));
  return s;
};

/** One cell, as primitives so React.memo skips cells whose content did not change. */
interface CellProps {
  left: number;
  width: number;
  height: number;
  text: string;
  content?: ReactNode;
  style: CSSProperties;
  className?: string;
  title?: string;
  readOnly: boolean;
  checkbox?: boolean | null;
  vr: number;
  c: number;
}

const GridCell = memo(function GridCell(p: CellProps) {
  return (
    <div
      role="gridcell"
      aria-colindex={p.c + 1}
      aria-readonly={p.readOnly || undefined}
      data-vr={p.vr}
      data-c={p.c}
      title={p.title ?? (p.text.length > 30 ? p.text : undefined)}
      style={{ left: p.left, width: p.width, height: p.height, ...p.style }}
      className={clsx(
        'absolute top-0 overflow-hidden border-r border-b border-line/80 px-1.5 text-[13px] leading-[22px] whitespace-nowrap text-ink select-none contain-strict',
        p.readOnly && 'bg-surface/70 text-muted',
        p.className,
      )}
    >
      {p.checkbox !== undefined && p.checkbox !== null ? (
        <span className="flex h-full items-center justify-center text-link">{p.checkbox ? <SquareCheck size={16} /> : <Square size={16} className="text-muted" />}</span>
      ) : (
        (p.content ?? p.text)
      )}
    </div>
  );
});

interface RowProps {
  r: number;
  vr: number;
  top: number;
  /** Visible column range (inclusive). */
  c0: number;
  c1: number;
  source: GridSource;
  colStarts: number[];
  rowH: number;
  mode: 'sheet' | 'table';
  merges: GridSource['merges'];
  readOnly: boolean;
  opaque: boolean;
}

/**
 * One row of visible cells. Memoised: the selection is an overlay and the row headers live in their own
 * sticky column, so a row only re-renders when its data or the visible columns change.
 */
const GridRow = memo(function GridRow({ r, vr, top, c0, c1, source, colStarts, rowH, mode, merges, readOnly, opaque }: RowProps) {
  const totalW = colStarts[source.colCount] ?? 0;
  const cells: ReactNode[] = [];
  for (let c = c0; c <= c1; c++) {
    const key = `${r}:${c}`;
    let width = colStarts[c + 1] - colStarts[c];
    let height = rowH;
    if (merges) {
      // Covered cells of a merged area are painted by its master (display only).
      if (merges.covered.has(key)) continue;
      const m = merges.masters.get(key);
      if (m) {
        width = colStarts[Math.min(m.c1 + 1, source.colCount)] - colStarts[m.c0];
        height = (m.r1 - m.r0 + 1) * rowH;
      }
    }
    const col = source.column(c);
    const st = source.style?.(r, c);
    let align: string | undefined = st?.align ?? col.align;
    if (!align && mode === 'sheet') {
      const v = source.value(r, c);
      if (typeof v === 'number') align = 'right';
      else if (typeof v === 'boolean') align = 'center';
    }
    const ro = mode === 'table' && (readOnly || !!col.readOnly || !!source.readOnly?.(r, c));
    cells.push(
      <GridCell
        key={c}
        left={ROW_HEADER_W + colStarts[c]}
        width={width}
        height={height}
        text={source.display(r, c)}
        content={source.renderCell?.(r, c)}
        style={cellStyle(st, align, height > rowH)}
        className={source.cellClass?.(r, c)}
        title={source.cellTitle?.(r, c)}
        readOnly={ro}
        checkbox={col.type === 'checkbox' ? !!source.value(r, c) : undefined}
        vr={vr}
        c={c}
      />,
    );
  }
  return (
    // Layout containment: a row's cells never affect anything outside it (merged cells may still overflow).
    <div role="row" aria-rowindex={vr + 2} className={clsx('absolute left-0', opaque && 'bg-card', source.rowClass?.(r))} style={{ top, height: rowH, width: ROW_HEADER_W + totalW, contain: 'layout style' }}>
      {cells}
    </div>
  );
});

/** In-cell text editor bound to the draft store. */
function DraftTextEditor({ draft, style, rowH, width, mode, autoFocus, align, onEnd }: { draft: Draft; style: CSSProperties; rowH: number; width: number; mode: 'enter' | 'edit'; autoFocus: boolean; align?: string; onEnd: (e: EditEnd) => void }) {
  const value = useDraft(draft);
  let lines = 1;
  for (let i = 0; i < value.length && lines < 8; i++) if (value.charCodeAt(i) === 10) lines++;
  return (
    <TextEditor
      style={{ ...style, height: Math.max(rowH, lines * 18 + 6), minWidth: Math.min(Math.max(width, value.length * 7.5 + 16), 600) }}
      value={value}
      mode={mode}
      autoFocus={autoFocus}
      align={align}
      onChange={draft.set}
      onEnd={onEnd}
    />
  );
}

/** Formula bar input: shows the active cell's raw text, or the draft while editing. */
function FormulaInput({ draft, editing, idle, disabled, readOnly, label, onStart, onEnd }: { draft: Draft; editing: boolean; idle: string; disabled: boolean; readOnly: boolean; label: string; onStart: () => void; onEnd: (e: EditEnd) => void }) {
  const d = useDraft(draft);
  return (
    <input
      data-formula-bar=""
      aria-label={label}
      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-0.5 font-mono text-[13px] text-ink outline-none focus:border-focus disabled:text-muted"
      value={editing ? d : idle}
      disabled={disabled}
      readOnly={readOnly}
      onFocus={() => {
        if (!editing && !readOnly) onStart();
      }}
      onChange={(e) => draft.set(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnd({ commit: true, value: draft.get(), dr: 1, dc: 0 });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onEnd({ commit: false });
        } else if (e.key === 'Tab') {
          e.preventDefault();
          onEnd({ commit: true, value: draft.get(), dr: 0, dc: 1 });
        }
      }}
      onBlur={(e) => {
        // Moving into the in-cell editor keeps the edit open.
        if (e.relatedTarget && (e.relatedTarget as HTMLElement).tagName === 'TEXTAREA') return;
        if (editing) onEnd({ commit: true, value: e.currentTarget.value, dr: 0, dc: 0 });
      }}
    />
  );
}

/** The parts of a range without its corner cell `ex` (the active cell keeps no tint, as in Excel). */
const rangeWithout = (rg: Range, ex: Pos): Range[] => {
  const out: Range[] = [];
  const otherRows = ex.r === rg.r0 ? { r0: rg.r0 + 1, r1: rg.r1 } : { r0: rg.r0, r1: rg.r1 - 1 };
  if (otherRows.r0 <= otherRows.r1) out.push({ ...otherRows, c0: rg.c0, c1: rg.c1 });
  const otherCols = ex.c === rg.c0 ? { c0: rg.c0 + 1, c1: rg.c1 } : { c0: rg.c0, c1: rg.c1 - 1 };
  if (otherCols.c0 <= otherCols.c1) out.push({ r0: ex.r, r1: ex.r, ...otherCols });
  return out;
};

/**
 * Excel-like grid: virtualised rows and columns, sticky headers, keyboard navigation and range
 * selection, in-cell editors, clipboard as TSV, context menu, per-column filters, sort, find,
 * column resizing, formula bar and a status bar with SUM / AVERAGE / COUNT.
 *
 * Rendering: rows and cells are memoised and read their data from `source` on demand; the selection
 * is an absolutely positioned overlay, and the text being edited lives in a small external store, so
 * moving the cursor or typing never re-renders the cells.
 */
export function Grid(props: GridProps) {
  const { source, mode, readOnly = false, onCommit } = props;
  const { t } = useTranslation();
  const rowH = props.rowHeight ?? (mode === 'table' ? 28 : 24);
  const frozen = mode === 'sheet' ? Math.min(props.frozenRows ?? 0, source.rowCount) : 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── filters, view sort, quick filter → visible rows ──
  const [filters, setFilters] = useState<Record<number, ColumnFilter>>({});
  const [viewSort, setViewSort] = useState<{ c: number; dir: 'asc' | 'desc' } | null>(null);
  const quick = (props.quickFilter ?? '').trim().toLocaleLowerCase();
  const viewRows = useMemo(() => {
    const active = Object.entries(filters)
      .filter(([, f]) => filterActive(f))
      .map(([c, f]) => [Number(c), f] as const);
    const n = source.rowCount;
    if (!active.length && !quick && !(viewSort && mode === 'table')) {
      const all = new Array<number>(n);
      for (let r = 0; r < n; r++) all[r] = r;
      return all;
    }
    const head: number[] = [];
    let body: number[] = [];
    for (let r = 0; r < n; r++) {
      if (r < frozen) {
        head.push(r);
        continue;
      }
      if (active.length && !active.every(([c, f]) => matchesFilter(source.display(r, c), f))) continue;
      if (quick) {
        if (source.searchText) {
          if (!source.searchText(r).includes(quick)) continue;
        } else {
          let hit = false;
          for (let c = 0; c < source.colCount && !hit; c++) hit = source.display(r, c).toLocaleLowerCase().includes(quick);
          if (!hit) continue;
        }
      }
      body.push(r);
    }
    if (viewSort && mode === 'table') body = sortIndices(body, (r) => source.value(r, viewSort.c), viewSort.dir);
    return head.concat(body);
  }, [source, frozen, filters, quick, viewSort, mode]);
  const viewCount = viewRows.length;
  const filtered = Object.values(filters).some(filterActive) || !!quick;

  // ── column geometry (kept identical between renders unless a width changed) ──
  const [liveWidths, setLiveWidths] = useState<Record<number, number>>({});
  const widthOf = useCallback((c: number) => liveWidths[c] ?? source.column(c).width, [liveWidths, source]);
  const prevStarts = useRef<number[]>([]);
  const colStarts = useMemo(() => {
    const a = new Array<number>(source.colCount + 1);
    a[0] = 0;
    for (let c = 0; c < source.colCount; c++) a[c + 1] = a[c] + widthOf(c);
    const p = prevStarts.current;
    if (p.length === a.length && p.every((x, i) => x === a[i])) return p;
    prevStarts.current = a;
    return a;
  }, [source, widthOf]);
  const totalW = colStarts[source.colCount] ?? 0;
  const topH = HEADER_H + frozen * rowH;

  const rowV = useVirtualizer({
    count: Math.max(0, viewCount - frozen),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 10,
    scrollMargin: topH,
    // Render after the scroll event instead of inside it: no forced layout per wheel event.
    useFlushSync: false,
  });
  const colV = useVirtualizer({
    horizontal: true,
    count: source.colCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => colStarts[i + 1] - colStarts[i],
    overscan: 3,
    scrollMargin: ROW_HEADER_W,
    useFlushSync: false,
  });
  useLayoutEffect(() => {
    colV.measure();
  }, [colStarts, colV]);
  useLayoutEffect(() => {
    rowV.measure();
  }, [rowH, topH, rowV]);

  // ── selection (view coordinates) ──
  const [active, setActive] = useState<Pos>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 });
  const sel: Range = useMemo(() => rangeOf(anchor, active), [anchor, active]);
  const dataRow = useCallback((vr: number) => viewRows[vr] ?? -1, [viewRows]);
  const activeR = dataRow(active.r);

  useEffect(() => {
    // Keep the selection inside the view after filters or size changed.
    const maxR = Math.max(0, viewCount - 1);
    const maxC = Math.max(0, source.colCount - 1);
    if (active.r > maxR || active.c > maxC) setActive((a) => ({ r: Math.min(a.r, maxR), c: Math.min(a.c, maxC) }));
    if (anchor.r > maxR || anchor.c > maxC) setAnchor((a) => ({ r: Math.min(a.r, maxR), c: Math.min(a.c, maxC) }));
  }, [viewCount, source.colCount, active, anchor]);

  const ensureVisible = useCallback(
    (p: Pos) => {
      const el = scrollRef.current;
      if (!el) return;
      if (p.r >= frozen) {
        const top = topH + (p.r - frozen) * rowH;
        if (top < el.scrollTop + topH) el.scrollTop = top - topH;
        else if (top + rowH > el.scrollTop + el.clientHeight - 14) el.scrollTop = top + rowH - el.clientHeight + 14;
      }
      const left = ROW_HEADER_W + (colStarts[p.c] ?? 0);
      const w = (colStarts[p.c + 1] ?? left) - (colStarts[p.c] ?? 0);
      if (left < el.scrollLeft + ROW_HEADER_W) el.scrollLeft = left - ROW_HEADER_W;
      else if (left + w > el.scrollLeft + el.clientWidth - 14) el.scrollLeft = left + w - el.clientWidth + 14;
    },
    [frozen, topH, rowH, colStarts],
  );

  const select = useCallback(
    (p: Pos, extend = false) => {
      const q = { r: Math.max(0, Math.min(viewCount - 1, p.r)), c: Math.max(0, Math.min(source.colCount - 1, p.c)) };
      setActive(q);
      if (!extend) setAnchor(q);
      ensureVisible(q);
    },
    [viewCount, source.colCount, ensureVisible],
  );

  const isReadOnly = useCallback(
    (r: number, c: number) => readOnly || r < 0 || !!source.column(c).readOnly || !!source.readOnly?.(r, c),
    [readOnly, source],
  );

  // ── editing ──
  const [editing, setEditing] = useState<Editing>(null);
  const draft = useMemo(createDraft, []);
  const editingRef = useRef<Editing>(null);
  editingRef.current = editing;
  const focusGrid = () => rootRef.current?.focus({ preventScroll: true });

  const startEdit = useCallback(
    (mode: 'enter' | 'edit', initial?: string) => {
      const r = dataRow(active.r);
      if (r < 0 || isReadOnly(r, active.c)) return;
      const col = source.column(active.c);
      if (col.type === 'checkbox') return;
      ensureVisible(active);
      draft.set(initial ?? source.raw(r, active.c));
      setEditing({ vr: active.r, c: active.c, mode, initial });
    },
    [active, dataRow, isReadOnly, source, ensureVisible, draft],
  );

  const endEdit = useCallback(
    (e: EditEnd) => {
      const ed = editingRef.current;
      if (!ed) return;
      editingRef.current = null;
      setEditing(null);
      if (e.commit) {
        const r = dataRow(ed.vr);
        if (r >= 0 && e.value !== source.raw(r, ed.c)) onCommit([{ r, c: ed.c, raw: e.value }]);
        if (e.dr || e.dc) {
          const next = { r: ed.vr + e.dr, c: ed.c + e.dc };
          if (mode === 'sheet' && next.r >= viewCount && props.onGrow) props.onGrow(source.rowCount + 100, source.colCount);
          select(next);
        }
      }
      requestAnimationFrame(focusGrid);
    },
    [dataRow, source, onCommit, select, mode, viewCount, props],
  );

  // ── clipboard ──
  const clipRef = useRef<Clip | null>(null);
  const selectionGrid = useCallback(
    (kind: 'display' | 'raw') => {
      const out: string[][] = [];
      for (let vr = sel.r0; vr <= sel.r1; vr++) {
        const r = dataRow(vr);
        const line: string[] = [];
        for (let c = sel.c0; c <= sel.c1; c++) line.push(r < 0 ? '' : kind === 'raw' ? source.raw(r, c) : source.display(r, c));
        out.push(line);
      }
      return out;
    },
    [sel, dataRow, source],
  );

  const clearSelection = useCallback(() => {
    const changes: CellChange[] = [];
    for (let vr = sel.r0; vr <= sel.r1; vr++) {
      const r = dataRow(vr);
      for (let c = sel.c0; c <= sel.c1; c++) if (r >= 0 && !isReadOnly(r, c) && source.raw(r, c) !== '') changes.push({ r, c, raw: source.column(c).type === 'checkbox' ? 'false' : '' });
    }
    if (changes.length) onCommit(changes);
  }, [sel, dataRow, isReadOnly, source, onCommit]);

  const copy = useCallback(
    (cut = false) => {
      if (sel.r1 - sel.r0 + 1 > 20000) {
        toast.error(t('sheet.tooMuchToCopy'));
        return null;
      }
      const text = toTsv(selectionGrid(mode === 'sheet' ? 'display' : 'raw'));
      clipRef.current = { text, raws: selectionGrid('raw'), origin: { r: dataRow(sel.r0), c: sel.c0 } };
      if (cut && !readOnly) clearSelection();
      return text;
    },
    [sel, selectionGrid, mode, dataRow, readOnly, clearSelection, t],
  );

  const pasteText = useCallback(
    (text: string) => {
      if (readOnly) return;
      const internal = clipRef.current && clipRef.current.text === text ? clipRef.current : null;
      let grid = internal ? internal.raws : parseTsv(text);
      if (!grid.length) return;
      const top = sel.r0;
      const left = sel.c0;
      // One value into a bigger selection fills it.
      if (grid.length === 1 && grid[0].length === 1 && (sel.r1 > sel.r0 || sel.c1 > sel.c0)) {
        grid = Array.from({ length: sel.r1 - sel.r0 + 1 }, () => Array.from({ length: sel.c1 - sel.c0 + 1 }, () => grid[0][0]));
      }
      const changes: CellChange[] = [];
      const needRows = top + grid.length;
      let widest = 0;
      for (const g of grid) if (g.length > widest) widest = g.length;
      const needCols = left + widest;
      if (mode === 'sheet' && (needRows > viewCount || needCols > source.colCount) && props.onGrow && !filtered) {
        props.onGrow(Math.max(source.rowCount, needRows + 20), Math.max(source.colCount, needCols));
      }
      grid.forEach((line, i) => {
        const vr = top + i;
        const r = mode === 'sheet' && !filtered && vr >= viewCount ? vr : dataRow(vr);
        if (r < 0) return;
        line.forEach((raw, j) => {
          const c = left + j;
          if (c >= (mode === 'sheet' ? needCols : source.colCount) || isReadOnly(r, c)) return;
          let v = raw;
          if (internal && mode === 'sheet' && v.startsWith('=')) {
            const base = internal.origin;
            v = `=${translateFormula(v.slice(1), r - (base.r + i), c - (base.c + j))}`;
          }
          changes.push({ r, c, raw: v });
        });
      });
      if (changes.length) onCommit(changes);
      const last = { r: Math.min(viewCount - 1 + (mode === 'sheet' ? grid.length : 0), top + grid.length - 1), c: Math.min(source.colCount - 1 + grid[0].length, left + grid[0].length - 1) };
      setAnchor({ r: top, c: left });
      setActive({ r: Math.max(top, last.r), c: Math.max(left, last.c) });
    },
    [readOnly, sel, mode, viewCount, source, props, filtered, dataRow, isReadOnly, onCommit],
  );

  // ── find (debounced: the search runs once typing pauses) ──
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [findQuery, setFindQuery] = useState('');
  useEffect(() => {
    const q = findText.trim().toLocaleLowerCase();
    if (!q) {
      setFindQuery('');
      return;
    }
    const timer = window.setTimeout(() => setFindQuery(q), 150);
    return () => window.clearTimeout(timer);
  }, [findText]);
  const findRef = useRef<HTMLInputElement>(null);
  const searchHits = useCallback(
    (q: string) => {
      const hits: Pos[] = [];
      if (!q) return hits;
      for (let vr = 0; vr < viewCount && hits.length < 5000; vr++) {
        const r = viewRows[vr];
        for (let c = 0; c < source.colCount; c++) if (source.display(r, c).toLocaleLowerCase().includes(q) || source.raw(r, c).toLocaleLowerCase().includes(q)) hits.push({ r: vr, c });
      }
      return hits;
    },
    [viewCount, viewRows, source],
  );
  const findHits = useMemo(() => (findOpen ? searchHits(findQuery) : []), [findOpen, findQuery, searchHits]);
  const [findIdx, setFindIdx] = useState(0);
  const gotoHit = (delta: number) => {
    // Enter right after typing: search now instead of waiting for the debounce.
    const q = findText.trim().toLocaleLowerCase();
    const hits = q === findQuery ? findHits : searchHits(q);
    if (q !== findQuery) setFindQuery(q);
    if (!hits.length) return;
    const cur = hits.findIndex((h) => h.r === active.r && h.c === active.c);
    const i = cur < 0 ? (delta > 0 ? hits.findIndex((h) => h.r > active.r || (h.r === active.r && h.c > active.c)) : -1) : cur + delta;
    const n = ((i < 0 ? (delta > 0 ? 0 : hits.length - 1) : i) + hits.length) % hits.length;
    setFindIdx(n);
    select(hits[n]);
  };
  const openFind = () => {
    setFindOpen(true);
    requestAnimationFrame(() => findRef.current?.select());
  };

  // ── menus ──
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'cell' | 'row' | 'col' } | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ x: number; y: number; c: number } | null>(null);

  const sortBy = useCallback(
    (c: number, dir: 'asc' | 'desc') => {
      if (mode === 'table') setViewSort({ c, dir });
      else props.onSort?.(c, dir);
    },
    [mode, props],
  );

  const selRowsData = () => {
    const rs: number[] = [];
    for (let vr = sel.r0; vr <= sel.r1; vr++) if (dataRow(vr) >= 0) rs.push(dataRow(vr));
    return rs.length ? { at: Math.min(...rs), count: Math.max(...rs) - Math.min(...rs) + 1 } : null;
  };
  const structure = props.onStructure && !readOnly && mode === 'sheet' ? props.onStructure : null;

  const menuItems = (): MenuItem[] => {
    const items: MenuItem[] = [
      { label: t('sheet.menu.cut'), icon: <Scissors size={14} />, shortcut: 'Ctrl+X', disabled: readOnly, onClick: () => copyToSystem(true) },
      { label: t('sheet.menu.copy'), icon: <Copy size={14} />, shortcut: 'Ctrl+C', onClick: () => copyToSystem(false) },
      { label: t('sheet.menu.paste'), icon: <ClipboardPaste size={14} />, shortcut: 'Ctrl+V', disabled: readOnly, onClick: pasteFromSystem },
      { label: t('sheet.menu.clear'), icon: <Eraser size={14} />, shortcut: 'Del', disabled: readOnly, onClick: clearSelection },
    ];
    if (structure) {
      const rows = selRowsData();
      const cols = { at: sel.c0, count: sel.c1 - sel.c0 + 1 };
      items.push({ separator: true });
      if (menu?.kind !== 'col' && rows) {
        items.push(
          { label: t('sheet.menu.insertRowAbove'), onClick: () => structure({ axis: 'row', at: rows.at, count: rows.count }) },
          { label: t('sheet.menu.insertRowBelow'), onClick: () => structure({ axis: 'row', at: rows.at + rows.count, count: rows.count }) },
          { label: t('sheet.menu.deleteRows', { count: rows.count }), icon: <Trash2 size={14} />, danger: true, onClick: () => structure({ axis: 'row', at: rows.at, count: -rows.count }) },
        );
      }
      if (menu?.kind !== 'row') {
        items.push(
          { label: t('sheet.menu.insertColLeft'), onClick: () => structure({ axis: 'col', at: cols.at, count: cols.count }) },
          { label: t('sheet.menu.insertColRight'), onClick: () => structure({ axis: 'col', at: cols.at + cols.count, count: cols.count }) },
          { label: t('sheet.menu.deleteCols', { count: cols.count }), icon: <Trash2 size={14} />, danger: true, onClick: () => structure({ axis: 'col', at: cols.at, count: -cols.count }) },
        );
      }
    }
    if (menu?.kind !== 'row') {
      items.push(
        { separator: true },
        { label: t('sheet.sortAsc'), icon: <ArrowDownAZ size={14} />, disabled: mode === 'sheet' && (readOnly || !props.onSort), onClick: () => sortBy(active.c, 'asc') },
        { label: t('sheet.sortDesc'), icon: <ArrowUpAZ size={14} />, disabled: mode === 'sheet' && (readOnly || !props.onSort), onClick: () => sortBy(active.c, 'desc') },
        {
          label: t('sheet.menu.filterByValue'),
          icon: <Filter size={14} />,
          disabled: activeR < 0,
          onClick: () => setFilters((f) => ({ ...f, [active.c]: { values: [source.display(activeR, active.c)] } })),
        },
      );
    }
    return items;
  };

  const copyToSystem = async (cut: boolean) => {
    const text = copy(cut);
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error(t('sheet.clipboardBlocked'));
    }
  };
  const pasteFromSystem = async () => {
    try {
      pasteText(await navigator.clipboard.readText());
    } catch {
      toast.message(t('sheet.useCtrlV'));
    }
  };

  // ── keyboard ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      const target = { r: active.r + dr, c: active.c + dc };
      if (mode === 'sheet' && props.onGrow && !filtered) {
        if (target.r >= viewCount) props.onGrow(source.rowCount + 100, source.colCount);
        if (target.c >= source.colCount) props.onGrow(source.rowCount, source.colCount + 10);
      }
      select(target, e.shiftKey);
    };
    const pageRows = () => Math.max(1, Math.floor(((scrollRef.current?.clientHeight ?? 600) - topH) / rowH) - 1);
    if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) return (e.preventDefault(), props.onUndo?.());
    if (ctrl && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) return (e.preventDefault(), props.onRedo?.());
    if (ctrl && (k === 's' || k === 'S')) return (e.preventDefault(), props.onSave?.());
    if (ctrl && (k === 'f' || k === 'F')) return (e.preventDefault(), openFind());
    if (ctrl && (k === 'a' || k === 'A')) {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setActive({ r: Math.max(0, viewCount - 1), c: Math.max(0, source.colCount - 1) });
      return;
    }
    if (ctrl && props.onFormat && !readOnly && ['b', 'i', 'u', 'B', 'I', 'U'].includes(k)) {
      e.preventDefault();
      const key = k.toLowerCase() as 'b' | 'i' | 'u';
      const cur = activeR >= 0 ? source.style?.(activeR, active.c)?.[key] : false;
      props.onFormat(selectedCells(), { [key]: !cur });
      return;
    }
    switch (k) {
      case 'ArrowUp':
        return move(ctrl ? -active.r : -1, 0);
      case 'ArrowDown':
        return move(ctrl ? viewCount - 1 - active.r : 1, 0);
      case 'ArrowLeft':
        return move(0, ctrl ? -active.c : -1);
      case 'ArrowRight':
        return move(0, ctrl ? source.colCount - 1 - active.c : 1);
      case 'PageDown':
        return move(pageRows(), 0);
      case 'PageUp':
        return move(-pageRows(), 0);
      case 'Home':
        e.preventDefault();
        return select(ctrl ? { r: 0, c: 0 } : { r: active.r, c: 0 }, e.shiftKey);
      case 'End':
        e.preventDefault();
        return select(ctrl ? { r: viewCount - 1, c: source.colCount - 1 } : { r: active.r, c: source.colCount - 1 }, e.shiftKey);
      case 'Tab':
        e.preventDefault();
        return select({ r: active.r, c: active.c + (e.shiftKey ? -1 : 1) });
      case 'Enter':
        e.preventDefault();
        if (mode === 'table' && !e.shiftKey && activeR >= 0 && !isReadOnly(activeR, active.c) && source.column(active.c).type !== 'checkbox') return startEdit('edit');
        return select({ r: active.r + (e.shiftKey ? -1 : 1), c: active.c });
      case 'F2':
        e.preventDefault();
        return startEdit('edit');
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return clearSelection();
      case 'Escape':
        if (findOpen) setFindOpen(false);
        clipRef.current = null;
        return;
      case ' ':
        if (source.column(active.c).type === 'checkbox' && activeR >= 0 && !isReadOnly(activeR, active.c)) {
          e.preventDefault();
          return toggleCheckbox(activeR, active.c);
        }
        break;
    }
    if (!ctrl && !e.altKey && k.length === 1) {
      e.preventDefault();
      const type = source.column(active.c).type;
      if (type === 'date') return startEdit('edit');
      if (type === 'select') return startEdit('edit', k);
      startEdit('enter', k);
    }
  };

  const toggleCheckbox = (r: number, c: number) => onCommit([{ r, c, raw: source.value(r, c) ? 'false' : 'true' }]);

  const selectedCells = useCallback(() => {
    const cells: Pos[] = [];
    for (let vr = sel.r0; vr <= sel.r1 && cells.length < 200_000; vr++) {
      const r = dataRow(vr);
      if (r >= 0) for (let c = sel.c0; c <= sel.c1; c++) cells.push({ r, c });
    }
    return cells;
  }, [sel, dataRow]);

  // ── mouse ──
  const dragging = useRef<null | 'cells' | 'rows' | 'cols'>(null);
  useEffect(() => {
    const up = () => (dragging.current = null);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const cellAt = (target: EventTarget | null): Pos | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-vr]') as HTMLElement | null;
    if (!el) return null;
    return { r: Number(el.dataset.vr), c: Number(el.dataset.c) };
  };
  const rowHeaderAt = (target: EventTarget | null): number | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-hvr]') as HTMLElement | null;
    return el ? Number(el.dataset.hvr) : null;
  };

  const selectRows = (vr: number, extend: boolean) => {
    if (extend) {
      setActive({ r: vr, c: source.colCount - 1 });
      setAnchor((a) => ({ r: a.r, c: 0 }));
    } else {
      setAnchor({ r: vr, c: 0 });
      setActive({ r: vr, c: source.colCount - 1 });
    }
  };
  const selectCols = (c: number, extend: boolean) => {
    if (extend) {
      setActive({ r: viewCount - 1, c });
      setAnchor((a) => ({ r: 0, c: a.c }));
    } else {
      setAnchor({ r: 0, c });
      setActive({ r: Math.max(0, viewCount - 1), c });
    }
  };

  const onCellMouseDown = (e: React.MouseEvent) => {
    const hvr = rowHeaderAt(e.target);
    if (hvr !== null) {
      e.preventDefault();
      if (editingRef.current) endEdit({ commit: true, value: draft.get(), dr: 0, dc: 0 });
      focusGrid();
      if (e.button === 2 && hvr >= sel.r0 && hvr <= sel.r1) return;
      selectRows(hvr, e.shiftKey);
      dragging.current = 'rows';
      return;
    }
    const p = cellAt(e.target);
    if (!p) return;
    if ((e.target as HTMLElement).closest('a,button')) return;
    if (editingRef.current) endEdit({ commit: true, value: draft.get(), dr: 0, dc: 0 });
    if (e.button === 2) {
      if (!(p.r >= sel.r0 && p.r <= sel.r1 && p.c >= sel.c0 && p.c <= sel.c1)) select(p);
      return;
    }
    e.preventDefault();
    focusGrid();
    select(p, e.shiftKey);
    dragging.current = 'cells';
    const r = dataRow(p.r);
    if (!e.shiftKey && r >= 0 && source.column(p.c).type === 'checkbox' && !isReadOnly(r, p.c) && p.r === active.r && p.c === active.c) toggleCheckbox(r, p.c);
  };
  const onCellMouseOver = (e: React.MouseEvent) => {
    if (!(e.buttons & 1) || !dragging.current) return;
    if (dragging.current === 'rows') {
      const hvr = rowHeaderAt(e.target);
      if (hvr !== null && (active.r !== hvr || active.c !== source.colCount - 1)) setActive({ r: hvr, c: source.colCount - 1 });
      return;
    }
    if (dragging.current !== 'cells') return;
    const p = cellAt(e.target);
    if (p && (p.r !== active.r || p.c !== active.c)) setActive(p);
  };
  const onCellDoubleClick = (e: React.MouseEvent) => {
    const p = cellAt(e.target);
    if (!p || (e.target as HTMLElement).closest('a,button')) return;
    startEdit('edit');
  };
  const onCellContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, kind: rowHeaderAt(e.target) !== null ? 'row' : 'cell' });
  };

  // ── column resize ──
  const startResize = (e: React.MouseEvent, c: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(c);
    let w = startW;
    const mv = (ev: MouseEvent) => {
      w = Math.max(MIN_COL_W, Math.min(1200, startW + ev.clientX - startX));
      setLiveWidths((lw) => ({ ...lw, [c]: w }));
    };
    const up = () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
      props.onColWidth?.(c, Math.round(w));
      setLiveWidths((lw) => {
        const next = { ...lw };
        if (!props.onColWidth) return next;
        delete next[c];
        return next;
      });
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };

  // ── status bar (big selections are summed once the selection settles) ──
  const selCells = (sel.r1 - sel.r0 + 1) * (sel.c1 - sel.c0 + 1);
  const computeStats = useCallback(() => {
    let sum = 0;
    let nums = 0;
    let count = 0;
    for (let vr = sel.r0; vr <= sel.r1; vr++) {
      const r = viewRows[vr];
      if (r === undefined) continue;
      for (let c = sel.c0; c <= sel.c1; c++) {
        const v = source.value(r, c);
        if (v === null || v === '') continue;
        count++;
        if (typeof v === 'number' && Number.isFinite(v)) {
          sum += v;
          nums++;
        }
      }
    }
    return { sum, avg: nums ? sum / nums : null, count, nums };
  }, [sel, viewRows, source]);
  const syncStats = useMemo(() => (selCells > 1 && selCells <= SYNC_STATS_CELLS ? computeStats() : null), [selCells, computeStats]);
  const [lateStats, setLateStats] = useState<ReturnType<typeof computeStats> | null>(null);
  useEffect(() => {
    setLateStats(null);
    if (selCells <= SYNC_STATS_CELLS || selCells > 300_000) return;
    const timer = window.setTimeout(() => setLateStats(computeStats()), 120);
    return () => window.clearTimeout(timer);
  }, [selCells, computeStats]);
  const stats = syncStats ?? lateStats;

  // ── filter menu values ──
  const filterValues = useMemo(() => {
    if (!filterMenu) return [];
    const set = new Set<string>();
    for (let r = frozen; r < source.rowCount && set.size < 2000; r++) set.add(source.display(r, filterMenu.c));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [filterMenu, frozen, source]);

  // ── rendering helpers ──
  const vCols = colV.getVirtualItems();
  const vRows = rowV.getVirtualItems();
  const c0 = vCols.length ? vCols[0].index : 0;
  const c1 = vCols.length ? vCols[vCols.length - 1].index : -1;
  const merges = mode === 'sheet' && !filtered ? source.merges : undefined;

  const row = (vr: number, top: number, opaque = false) => {
    const r = viewRows[vr];
    if (r === undefined) return null;
    return (
      <GridRow
        key={r}
        r={r}
        vr={vr}
        top={top}
        c0={c0}
        c1={c1}
        source={source}
        colStarts={colStarts}
        rowH={rowH}
        mode={mode}
        merges={merges}
        readOnly={readOnly}
        opaque={opaque}
      />
    );
  };

  // Row headers: one sticky column (one sticky element instead of one per row).
  const rowHeader = (vr: number, top: number) => {
    const r = viewRows[vr];
    if (r === undefined) return null;
    const selected = vr >= sel.r0 && vr <= sel.r1;
    return (
      <div
        key={r}
        role="rowheader"
        data-hvr={vr}
        style={{ top, width: ROW_HEADER_W, height: rowH, ...(selected ? SELECTED_HEADER : {}) }}
        className={clsx(
          'pointer-events-auto absolute left-0 flex cursor-default items-center justify-center truncate border-r border-b border-line bg-sunken px-1 text-[11px] font-medium text-muted select-none',
          selected && 'font-semibold text-link',
        )}
      >
        {source.rowLabel?.(r, vr) ?? String(mode === 'sheet' ? r + 1 : vr + 1)}
      </div>
    );
  };

  // ── selection overlay: one tinted area + the active cell's frame, split at the frozen rows ──
  const activeSpan = (() => {
    let rg: Range = { r0: active.r, c0: active.c, r1: active.r, c1: active.c };
    const m = merges?.masters.get(`${activeR}:${active.c}`);
    if (m) rg = { r0: active.r, c0: m.c0, r1: active.r + (m.r1 - m.r0), c1: m.c1 };
    return rg;
  })();
  const overlay = (part: 'head' | 'body') => {
    const lo = part === 'head' ? 0 : frozen;
    const hi = part === 'head' ? frozen - 1 : viewCount - 1;
    const yOf = (vr: number) => (part === 'head' ? HEADER_H + vr * rowH : (vr - frozen) * rowH);
    const box = (rg: Range, key: string, className: string) => {
      const r0 = Math.max(rg.r0, lo);
      const r1 = Math.min(rg.r1, hi);
      if (r0 > r1) return null;
      const left = ROW_HEADER_W + (colStarts[rg.c0] ?? 0);
      const width = (colStarts[Math.min(rg.c1 + 1, source.colCount)] ?? 0) - (colStarts[rg.c0] ?? 0);
      return <div key={key} className={clsx('pointer-events-none absolute', className)} style={{ left, top: yOf(r0), width, height: (r1 - r0 + 1) * rowH }} />;
    };
    const multi = sel.r0 !== sel.r1 || sel.c0 !== sel.c1;
    return (
      <>
        {multi && rangeWithout(sel, active).map((rg, i) => box(rg, `t${i}`, 'z-[11] bg-primary/12'))}
        {multi && box(sel, 'frame', 'z-[11] border border-primary/70')}
        {box(activeSpan, 'active', 'z-[11] outline-2 -outline-offset-2 outline-focus')}
      </>
    );
  };

  // ── editor placement ──
  const editorNode = (() => {
    if (!editing) return null;
    const r = dataRow(editing.vr);
    if (r < 0) return null;
    const col = source.column(editing.c);
    const left = ROW_HEADER_W + colStarts[editing.c];
    const inHead = editing.vr < frozen;
    const top = inHead ? HEADER_H + editing.vr * rowH : topH + (editing.vr - frozen) * rowH;
    const w = widthOf(editing.c);
    const style: CSSProperties = { left, top, width: Math.max(w, 60), height: rowH, minHeight: rowH };
    if (col.type === 'date') return <DateEditor style={style} value={source.raw(r, editing.c)} onEnd={endEdit} />;
    if (col.type === 'select') return <SelectEditor style={style} value={source.raw(r, editing.c)} initialFilter={editing.initial} options={col.options ?? []} onEnd={endEdit} />;
    return <DraftTextEditor draft={draft} style={style} rowH={rowH} width={w} mode={editing.mode} autoFocus={!editing.fromBar} align={source.style?.(r, editing.c)?.align ?? col.align} onEnd={endEdit} />;
  })();

  const activeAddress = mode === 'sheet' ? `${colName(active.c)}${activeR >= 0 ? activeR + 1 : ''}` : `${source.column(active.c).label ?? colName(active.c)}${activeR >= 0 ? ` · ${active.r + 1}` : ''}`;
  const idleFormula = activeR >= 0 ? source.raw(activeR, active.c) : '';
  const formulaReadOnly = activeR < 0 || isReadOnly(activeR, active.c) || source.column(active.c).type === 'checkbox' || source.column(active.c).type === 'select';

  const filterOpenLabel = t('sheet.filter.open');
  const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 }));
  const bodyH = Math.max(0, viewCount - frozen) * rowH;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-card px-2 py-1.5">
        {props.toolbarStart}
        {(props.onUndo || props.onRedo) && (
          <>
            <ToolButton label={t('sheet.undo')} shortcut="Ctrl+Z" disabled={!props.canUndo} onClick={() => props.onUndo?.()}>
              <Undo2 size={16} />
            </ToolButton>
            <ToolButton label={t('sheet.redo')} shortcut="Ctrl+Y" disabled={!props.canRedo} onClick={() => props.onRedo?.()}>
              <Redo2 size={16} />
            </ToolButton>
            <Sep />
          </>
        )}
        {props.formatBar?.({ active: activeR >= 0 ? { r: activeR, c: active.c } : null, style: activeR >= 0 ? source.style?.(activeR, active.c) : undefined, cells: selectedCells })}
        {props.toolbarEnd}
        <div className="ml-auto flex items-center gap-1">
          {filtered && (
            <ToolButton label={t('sheet.filter.clearAll')} onClick={() => setFilters({})}>
              <FilterX size={16} className="text-link" />
            </ToolButton>
          )}
          {viewSort && (
            <button type="button" onClick={() => setViewSort(null)} className="flex items-center gap-1 rounded-md bg-primary/[0.06] px-2 py-1 text-xs font-semibold text-link">
              {viewSort.dir === 'asc' ? <ArrowDownAZ size={13} /> : <ArrowUpAZ size={13} />} {source.column(viewSort.c).label ?? colName(viewSort.c)} <X size={12} />
            </button>
          )}
          <ToolButton label={t('sheet.find')} shortcut="Ctrl+F" onClick={openFind}>
            <Search size={16} />
          </ToolButton>
        </div>
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-2 border-b border-line bg-card px-2 py-1">
        <div className="w-28 shrink-0 truncate rounded-md border border-line bg-sunken px-2 py-0.5 text-center code-id text-xs text-ink" aria-label={t('sheet.nameBox')}>
          {activeAddress}
        </div>
        <span className="font-serif text-sm text-muted italic">fx</span>
        <FormulaInput
          draft={draft}
          editing={!!editing}
          idle={idleFormula}
          disabled={formulaReadOnly && !editing}
          readOnly={formulaReadOnly}
          label={t('sheet.formulaBar')}
          onStart={() => {
            draft.set(idleFormula);
            setEditing({ vr: active.r, c: active.c, mode: 'edit', fromBar: true });
          }}
          onEnd={endEdit}
        />
      </div>

      {/* Grid */}
      <div
        ref={rootRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={viewCount + 1}
        aria-colcount={source.colCount}
        aria-readonly={readOnly || undefined}
        onKeyDown={onKeyDown}
        onCopy={(e) => {
          if (editing) return;
          const text = copy(false);
          if (text === null) return;
          e.preventDefault();
          e.clipboardData.setData('text/plain', text);
        }}
        onCut={(e) => {
          if (editing) return;
          const text = copy(true);
          if (text === null) return;
          e.preventDefault();
          e.clipboardData.setData('text/plain', text);
        }}
        onPaste={(e) => {
          if (editing) return;
          e.preventDefault();
          pasteText(e.clipboardData.getData('text/plain'));
        }}
        className="relative min-h-0 flex-1 outline-none"
      >
        <div ref={scrollRef} className="absolute inset-0 overflow-auto overscroll-contain bg-card" style={{ contain: 'strict' }} onContextMenu={(e) => e.preventDefault()}>
          <div style={{ width: ROW_HEADER_W + totalW, height: topH + bodyH, position: 'relative' }}>
            {/* Sticky top: column headers + frozen rows */}
            <div className="sticky top-0 z-30" style={{ height: topH, width: ROW_HEADER_W + totalW }}>
              <div role="row" aria-rowindex={1} className="absolute top-0 left-0" style={{ height: HEADER_H, width: ROW_HEADER_W + totalW }}>
                <div
                  className="sticky left-0 z-[6] border-r border-b border-line bg-sunken"
                  style={{ width: ROW_HEADER_W, height: HEADER_H }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    focusGrid();
                    setAnchor({ r: 0, c: 0 });
                    setActive({ r: Math.max(0, viewCount - 1), c: Math.max(0, source.colCount - 1) });
                  }}
                  title={t('sheet.selectAll')}
                />
                {vCols.map((vc) => {
                  const c = vc.index;
                  const col = source.column(c);
                  const colSelected = c >= sel.c0 && c <= sel.c1;
                  const hasFilter = filterActive(filters[c]);
                  return (
                    <div
                      key={c}
                      role="columnheader"
                      aria-colindex={c + 1}
                      title={col.title ?? col.label}
                      onMouseDown={(e) => {
                        if ((e.target as HTMLElement).closest('button,[data-resize]')) return;
                        e.preventDefault();
                        if (editingRef.current) endEdit({ commit: true, value: draft.get(), dr: 0, dc: 0 });
                        focusGrid();
                        if (e.button === 2 && colSelected) return;
                        selectCols(c, e.shiftKey);
                        dragging.current = 'cols';
                      }}
                      onMouseOver={(e) => {
                        if (dragging.current === 'cols' && e.buttons & 1) setActive({ r: viewCount - 1, c });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({ x: e.clientX, y: e.clientY, kind: 'col' });
                      }}
                      style={{ left: ROW_HEADER_W + colStarts[c], width: colStarts[c + 1] - colStarts[c], height: HEADER_H, ...(colSelected ? SELECTED_HEADER : {}) }}
                      className={clsx(
                        'group absolute top-0 flex items-center border-r border-b border-line bg-sunken pr-0.5 pl-1.5 text-xs text-muted select-none',
                        mode === 'sheet' ? 'justify-center font-medium' : 'justify-between font-semibold text-ink/80',
                        colSelected && 'text-link',
                      )}
                    >
                      <span className="truncate">{mode === 'sheet' ? colName(c) : col.label}</span>
                      {viewSort?.c === c && (viewSort.dir === 'asc' ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />)}
                      <button
                        type="button"
                        aria-label={filterOpenLabel}
                        onClick={(e) => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setFilterMenu({ x: r.left - 200, y: r.bottom + 2, c });
                        }}
                        className={clsx(
                          'ml-auto grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-sunken',
                          hasFilter ? 'text-link' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                          mode === 'sheet' && !hasFilter && 'absolute right-1',
                        )}
                      >
                        {hasFilter ? <Filter size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <div data-resize onMouseDown={(e) => startResize(e, c)} className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize hover:bg-primary/40" />
                    </div>
                  );
                })}
              </div>
              {frozen > 0 && (
                <div className="contents" onMouseDown={onCellMouseDown} onMouseOver={onCellMouseOver} onDoubleClick={onCellDoubleClick} onContextMenu={onCellContextMenu}>
                  <div className="pointer-events-none sticky left-0 z-[12]" style={{ width: ROW_HEADER_W, height: topH }}>
                    {Array.from({ length: frozen }, (_, i) => rowHeader(i, HEADER_H + i * rowH))}
                  </div>
                  {Array.from({ length: frozen }, (_, i) => row(i, HEADER_H + i * rowH, true))}
                </div>
              )}
              {frozen > 0 && overlay('head')}
              {frozen > 0 && <div className="pointer-events-none absolute left-0 h-0.5 bg-line" style={{ top: topH - 1, width: ROW_HEADER_W + totalW }} />}
              {editing && editing.vr < frozen && editorNode}
            </div>

            {/* Body */}
            <div
              className="absolute left-0"
              style={{ top: topH, width: ROW_HEADER_W + totalW, height: bodyH }}
              onMouseDown={onCellMouseDown}
              onMouseOver={onCellMouseOver}
              onDoubleClick={onCellDoubleClick}
              onContextMenu={onCellContextMenu}
            >
              <div className="sticky left-0 z-[12]" style={{ width: ROW_HEADER_W, height: bodyH }}>
                {vRows.map((vrw) => rowHeader(vrw.index + frozen, vrw.start - topH))}
              </div>
              {vRows.map((vrw) => row(vrw.index + frozen, vrw.start - topH))}
              {overlay('body')}
            </div>
            {editing && editing.vr >= frozen && editorNode}
          </div>
          {viewCount === frozen && (
            <div className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-muted">{filtered ? t('sheet.noMatches') : t('sheet.empty')}</div>
          )}
        </div>

        {findOpen && (
          <div className="absolute top-2 right-4 z-40 flex items-center gap-1 rounded-xl border border-line bg-card p-1.5 shadow-[var(--tv-shadow-raised)]">
            <Search size={14} className="ml-1 text-muted" />
            <input
              ref={findRef}
              value={findText}
              onChange={(e) => {
                setFindText(e.target.value);
                setFindIdx(0);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  gotoHit(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                  setFindOpen(false);
                  focusGrid();
                }
              }}
              placeholder={t('sheet.findPlaceholder')}
              className="w-48 bg-transparent px-1 py-0.5 text-sm text-ink outline-none"
            />
            <span className="min-w-14 text-center text-xs text-muted tabular-nums">{findText.trim() ? (findHits.length ? `${Math.min(findIdx + 1, findHits.length)}/${findHits.length}` : '0/0') : ''}</span>
            <ToolButton label={t('sheet.findPrev')} onClick={() => gotoHit(-1)}>
              <ChevronUp size={15} />
            </ToolButton>
            <ToolButton label={t('sheet.findNext')} onClick={() => gotoHit(1)}>
              <ChevronDown size={15} />
            </ToolButton>
            <ToolButton
              label={t('sheet.close')}
              onClick={() => {
                setFindOpen(false);
                focusGrid();
              }}
            >
              <X size={15} />
            </ToolButton>
          </div>
        )}
      </div>

      {props.footer}

      {/* Status bar */}
      <div className="flex items-center gap-4 border-t border-line bg-sunken px-3 py-1 text-xs text-muted" aria-live="polite">
        {props.statusExtra}
        {filtered && <span>{t('sheet.status.filtered', { shown: viewCount - frozen, total: source.rowCount - frozen })}</span>}
        {readOnly && (
          <span className="flex items-center gap-1 font-semibold text-warning-fg">
            <Check size={12} /> {t('sheet.readOnly')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-4 tabular-nums">
          {stats && (
            <>
              {stats.nums > 0 && <span>{t('sheet.status.sum')}: <b className="text-ink">{fmtNum(stats.sum)}</b></span>}
              {stats.avg !== null && <span>{t('sheet.status.average')}: <b className="text-ink">{fmtNum(stats.avg)}</b></span>}
              <span>{t('sheet.status.count')}: <b className="text-ink">{stats.count}</b></span>
            </>
          )}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}
      {filterMenu && (
        <FilterMenu
          x={filterMenu.x}
          y={filterMenu.y}
          title={mode === 'sheet' ? colName(filterMenu.c) : (source.column(filterMenu.c).label ?? '')}
          values={filterValues}
          filter={filters[filterMenu.c]}
          onChange={(f) =>
            setFilters((all) => {
              const next = { ...all };
              if (f) next[filterMenu.c] = f;
              else delete next[filterMenu.c];
              return next;
            })
          }
          onSort={mode === 'table' || (props.onSort && !readOnly) ? (dir) => sortBy(filterMenu.c, dir) : undefined}
          onClose={() => setFilterMenu(null)}
        />
      )}
    </div>
  );
}

export function ToolButton({ label, shortcut, onClick, disabled, active, children }: { label: string; shortcut?: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        'grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-ink/80 transition hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-35',
        active && 'bg-primary/10 text-link',
      )}
    >
      {children}
    </button>
  );
}

export const Sep = () => <span className="mx-1 h-5 w-px bg-line" aria-hidden />;
