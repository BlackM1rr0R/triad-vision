/**
 * Pure spreadsheet helpers (no React, no DOM): the sparse sheet model, A1 addressing, range math,
 * TSV (Excel clipboard) parsing / serialising, sorting, filtering, row / column insertion with formula
 * reference shifting, and typed input parsing. Shared by the .xlsx editor and the client register.
 */

// ─── Model ────────────────────────────────────────────────────────────

export type CellValue = string | number | boolean | null;

export interface CellStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  /** Text colour "#RRGGBB". */
  color?: string;
  /** Fill colour "#RRGGBB". */
  fill?: string;
  align?: 'left' | 'center' | 'right';
  /** Excel number format ("0.00", "dd.mm.yyyy", "#,##0.00 €" …). */
  numFmt?: string;
  wrap?: boolean;
}

export interface Cell {
  v?: CellValue;
  /** Formula without the leading "=". */
  f?: string;
  s?: CellStyle;
}

/** Sparse cells: rows[r][c], 0-based. */
export type Rows = Record<number, Record<number, Cell>>;

export interface Sheet {
  /** Worksheet id in the original file (absent for sheets added in the browser). */
  id?: number;
  /** Stable client-side key (tabs, React keys). */
  key: string;
  name: string;
  rows: Rows;
  rowCount: number;
  colCount: number;
  colWidths: Record<number, number>;
  frozenRows: number;
  frozenCols: number;
  merges: string[];
}

export interface Pos {
  r: number;
  c: number;
}

/** Inclusive, normalised range (r0 ≤ r1, c0 ≤ c1). */
export interface Range {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export const DEFAULT_COL_WIDTH = 100;
export const MIN_ROWS = 200;
export const MIN_COLS = 26;
export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

let keySeq = 0;
export const newKey = () => `s${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export const getCell = (rows: Rows, r: number, c: number): Cell | undefined => rows[r]?.[c];

export const isEmptyCell = (cell: Cell | undefined) => !cell || ((cell.v === undefined || cell.v === null || cell.v === '') && !cell.f && !cell.s);

/** Returns new rows with one cell replaced (or removed when empty); untouched rows are shared. */
export const setCell = (rows: Rows, r: number, c: number, cell: Cell | undefined): Rows => {
  const row = rows[r];
  if (isEmptyCell(cell)) {
    if (!row || !(c in row)) return rows;
    const nextRow = { ...row };
    delete nextRow[c];
    const next = { ...rows };
    if (Object.keys(nextRow).length) next[r] = nextRow;
    else delete next[r];
    return next;
  }
  return { ...rows, [r]: { ...(row ?? {}), [c]: cell! } };
};

/** Applies many cell writes with one copy per touched row. */
export const setCells = (rows: Rows, writes: { r: number; c: number; cell: Cell | undefined }[]): Rows => {
  if (!writes.length) return rows;
  const next: Rows = { ...rows };
  const copied = new Set<number>();
  for (const { r, c, cell } of writes) {
    if (!copied.has(r)) {
      next[r] = { ...(next[r] ?? {}) };
      copied.add(r);
    }
    if (isEmptyCell(cell)) delete next[r][c];
    else next[r][c] = cell!;
  }
  for (const r of copied) if (!Object.keys(next[r]).length) delete next[r];
  return next;
};

/** Highest used row / column index + 1. */
export const usedSize = (rows: Rows) => {
  let rCount = 0;
  let cCount = 0;
  for (const rk of Object.keys(rows)) {
    const r = Number(rk);
    const cols = Object.keys(rows[r]);
    if (!cols.length) continue;
    rCount = Math.max(rCount, r + 1);
    for (const ck of cols) cCount = Math.max(cCount, Number(ck) + 1);
  }
  return { rows: rCount, cols: cCount };
};

export const countCells = (rows: Rows) => Object.values(rows).reduce((n, r) => n + Object.keys(r).length, 0);

// ─── A1 addressing ────────────────────────────────────────────────────

/** 0 → "A", 25 → "Z", 26 → "AA". */
export const colName = (c: number) => {
  let n = c + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** "A" → 0, "AA" → 26 (case-insensitive); -1 when invalid. */
export const colIndex = (name: string) => {
  if (!/^[A-Za-z]{1,3}$/.test(name)) return -1;
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export const toA1 = (r: number, c: number) => `${colName(c)}${r + 1}`;

/** "B3" / "$B$3" → { r: 2, c: 1 }; null when invalid. */
export const parseA1 = (ref: string): Pos | null => {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  if (!m) return null;
  const c = colIndex(m[1]);
  const r = Number(m[2]) - 1;
  if (c < 0 || r < 0 || c >= MAX_COLS || r >= MAX_ROWS) return null;
  return { r, c };
};

export const rangeOf = (a: Pos, b: Pos = a): Range => ({
  r0: Math.min(a.r, b.r),
  c0: Math.min(a.c, b.c),
  r1: Math.max(a.r, b.r),
  c1: Math.max(a.c, b.c),
});

/** "A1:B2" or "C3" → range; null when invalid. */
export const parseRange = (ref: string): Range | null => {
  const [a, b] = ref.split(':');
  const pa = parseA1(a ?? '');
  if (!pa) return null;
  if (b === undefined) return rangeOf(pa);
  const pb = parseA1(b);
  return pb ? rangeOf(pa, pb) : null;
};

export const rangeToA1 = (rg: Range) => (rg.r0 === rg.r1 && rg.c0 === rg.c1 ? toA1(rg.r0, rg.c0) : `${toA1(rg.r0, rg.c0)}:${toA1(rg.r1, rg.c1)}`);

export const inRange = (rg: Range | null | undefined, r: number, c: number) => !!rg && r >= rg.r0 && r <= rg.r1 && c >= rg.c0 && c <= rg.c1;

export const rangeSize = (rg: Range) => ({ rows: rg.r1 - rg.r0 + 1, cols: rg.c1 - rg.c0 + 1, cells: (rg.r1 - rg.r0 + 1) * (rg.c1 - rg.c0 + 1) });

export const clampPos = (p: Pos, rows: number, cols: number): Pos => ({
  r: Math.max(0, Math.min(rows - 1, p.r)),
  c: Math.max(0, Math.min(cols - 1, p.c)),
});

/** Merged ranges as lookups: master cell → span, covered (non-master) cells → master. */
export const mergeIndex = (merges: string[]) => {
  const masters = new Map<string, Range>();
  const covered = new Map<string, Pos>();
  for (const m of merges) {
    const rg = parseRange(m);
    if (!rg) continue;
    masters.set(`${rg.r0}:${rg.c0}`, rg);
    for (let r = rg.r0; r <= rg.r1; r++) for (let c = rg.c0; c <= rg.c1; c++) if (r !== rg.r0 || c !== rg.c0) covered.set(`${r}:${c}`, { r: rg.r0, c: rg.c0 });
  }
  return { masters, covered };
};

// ─── TSV (clipboard of Excel / Google Sheets) ─────────────────────────

const needsQuote = /[\t\n\r"]/;

/** Grid of strings → TSV text the way Excel writes it (quoted when a field has tabs, newlines or quotes). */
export const toTsv = (grid: string[][]) =>
  grid.map((row) => row.map((v) => (needsQuote.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join('\t')).join('\r\n');

/** TSV text → grid of strings (handles Excel quoting, CRLF and a trailing newline). */
export const parseTsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let quoted = false;
  let atFieldStart = true;
  const s = text.replace(/\r\n?/g, '\n');
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(field);
      field = '';
      atFieldStart = true;
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
      i++;
      continue;
    }
    field += ch;
    atFieldStart = false;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

// ─── Sorting / filtering ──────────────────────────────────────────────

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const blank = (v: CellValue | undefined) => v === null || v === undefined || v === '';

/** Excel order: numbers < text < booleans; blanks always last (whatever the direction). */
export const compareValues = (a: CellValue | undefined, b: CellValue | undefined, dir: 'asc' | 'desc' = 'asc') => {
  const ba = blank(a);
  const bb = blank(b);
  if (ba || bb) return ba && bb ? 0 : ba ? 1 : -1;
  const rank = (v: CellValue) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  const ra = rank(a!);
  const rb = rank(b!);
  let cmp: number;
  if (ra !== rb) cmp = ra - rb;
  else if (typeof a === 'number') cmp = a - (b as number);
  else if (typeof a === 'string') cmp = collator.compare(a, b as string);
  else cmp = Number(a) - Number(b);
  return dir === 'asc' ? cmp : -cmp;
};

/** Stable sort of row indices by a key. */
export const sortIndices = (indices: number[], key: (i: number) => CellValue | undefined, dir: 'asc' | 'desc') =>
  indices
    .map((i, pos) => ({ i, pos, k: key(i) }))
    .sort((x, y) => compareValues(x.k, y.k, dir) || x.pos - y.pos)
    .map((x) => x.i);

export interface ColumnFilter {
  /** Case-insensitive substring of the displayed value. */
  contains?: string;
  /** Allowed displayed values (exact). Absent = all. */
  values?: string[];
}

export const filterActive = (f: ColumnFilter | undefined) => !!f && (!!f.contains?.trim() || Array.isArray(f.values));

export const matchesFilter = (display: string, f: ColumnFilter | undefined) => {
  if (!f) return true;
  if (f.contains?.trim() && !display.toLocaleLowerCase().includes(f.contains.trim().toLocaleLowerCase())) return false;
  if (Array.isArray(f.values) && !f.values.includes(display)) return false;
  return true;
};

/** Visible rows: frozen rows always, then every row matching all column filters. */
export const filterRows = (rowCount: number, frozen: number, filters: Record<number, ColumnFilter>, display: (r: number, c: number) => string) => {
  const active = Object.entries(filters).filter(([, f]) => filterActive(f)).map(([c, f]) => [Number(c), f] as const);
  const out: number[] = [];
  for (let r = 0; r < rowCount; r++) {
    if (r < frozen || active.every(([c, f]) => matchesFilter(display(r, c), f))) out.push(r);
  }
  return out;
};

/** Physically reorders rows of a sheet (rows below `from`) by one column. */
export const sortSheetRows = (rows: Rows, from: number, to: number, key: (r: number) => CellValue | undefined, dir: 'asc' | 'desc'): Rows => {
  const idx: number[] = [];
  for (let r = from; r < to; r++) idx.push(r);
  const order = sortIndices(idx, key, dir);
  const next: Rows = {};
  for (const [rk, row] of Object.entries(rows)) if (Number(rk) < from || Number(rk) >= to) next[Number(rk)] = row;
  order.forEach((src, k) => {
    const row = rows[src];
    if (row) next[from + k] = row;
  });
  return next;
};

// ─── Formula references ───────────────────────────────────────────────

/** A1 references in a formula (outside string literals), with their position. */
const REF_RE = /((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![\w(])/g;

/** Calls `fn` on each reference outside "string literals"; fn returns the replacement text. */
const mapRefs = (formula: string, fn: (m: { sheet: string | null; absC: boolean; c: number; absR: boolean; r: number; text: string }) => string) => {
  let out = '';
  // Split by string literals so "A1" inside quotes stays untouched.
  const parts = formula.split(/("(?:[^"]|"")*")/);
  for (const part of parts) {
    if (part.startsWith('"')) {
      out += part;
      continue;
    }
    out += part.replace(REF_RE, (text: string, sheetPart: string | undefined, absC: string, col: string, absR: string, row: string, offset: number, whole: string) => {
      // Not a reference when glued to a preceding name character (e.g. "LOG10", "Sheet1A1").
      const prev = offset > 0 ? whole[offset - 1] : '';
      if (!sheetPart && prev && /[\w$.]/.test(prev)) return text;
      const c = colIndex(col);
      const r = Number(row) - 1;
      if (c < 0 || r < 0) return text;
      const sheet = sheetPart ? sheetPart.slice(0, -1).replace(/^'(.*)'$/, '$1').replace(/''/g, "'") : null;
      const repl = fn({ sheet, absC: !!absC, c, absR: !!absR, r, text });
      return repl === text ? text : (sheetPart ?? '') + repl;
    });
  }
  return out;
};

const refText = (absC: boolean, c: number, absR: boolean, r: number) => `${absC ? '$' : ''}${colName(c)}${absR ? '$' : ''}${r + 1}`;

/** Copy / paste: moves relative parts of every reference by (dr, dc); out-of-sheet → #REF!. */
export const translateFormula = (formula: string, dr: number, dc: number) =>
  dr === 0 && dc === 0
    ? formula
    : mapRefs(formula, ({ absC, c, absR, r }) => {
        const nr = absR ? r : r + dr;
        const nc = absC ? c : c + dc;
        if (nr < 0 || nc < 0 || nr >= MAX_ROWS || nc >= MAX_COLS) return '#REF!';
        return refText(absC, nc, absR, nr);
      });

export interface StructOp {
  axis: 'row' | 'col';
  /** First index inserted / deleted. */
  at: number;
  /** > 0 insert, < 0 delete. */
  count: number;
}

/**
 * Shifts references after rows / columns were inserted or deleted in `opSheet`. A formula living in
 * `formulaSheet` refers to opSheet when its reference has no sheet prefix and formulaSheet === opSheet,
 * or when the prefix names opSheet. References into deleted cells become #REF!.
 */
export const shiftFormula = (formula: string, op: StructOp, formulaSheet: string, opSheet: string) =>
  mapRefs(formula, ({ sheet, absC, c, absR, r, text }) => {
    const target = sheet ?? formulaSheet;
    if (target.toLocaleLowerCase() !== opSheet.toLocaleLowerCase()) return text.replace(/^.*!/, '');
    const plain = text.replace(/^.*!/, '');
    let nr = r;
    let nc = c;
    const idx = op.axis === 'row' ? r : c;
    if (op.count > 0) {
      if (idx >= op.at) {
        if (op.axis === 'row') nr += op.count;
        else nc += op.count;
      }
    } else {
      const del = -op.count;
      if (idx >= op.at && idx < op.at + del) return '#REF!';
      if (idx >= op.at + del) {
        if (op.axis === 'row') nr -= del;
        else nc -= del;
      }
    }
    return nr === r && nc === c ? plain : refText(absC, nc, absR, nr);
  });

/** Inserts (count > 0) or deletes (count < 0) rows / columns of a sparse sheet. */
export const shiftRows = (rows: Rows, op: StructOp): Rows => {
  const next: Rows = {};
  const del = op.count < 0 ? -op.count : 0;
  for (const [rk, row] of Object.entries(rows)) {
    const r = Number(rk);
    if (op.axis === 'row') {
      if (op.count > 0) next[r >= op.at ? r + op.count : r] = row;
      else if (r < op.at) next[r] = row;
      else if (r >= op.at + del) next[r - del] = row;
    } else {
      const nrow: Record<number, Cell> = {};
      for (const [ck, cell] of Object.entries(row)) {
        const c = Number(ck);
        if (op.count > 0) nrow[c >= op.at ? c + op.count : c] = cell;
        else if (c < op.at) nrow[c] = cell;
        else if (c >= op.at + del) nrow[c - del] = cell;
      }
      if (Object.keys(nrow).length) next[r] = nrow;
    }
  }
  return next;
};

/** Applies a structural change to one sheet of a workbook, fixing formulas in every sheet. */
export const applyStructOp = (sheets: Sheet[], index: number, op: StructOp): Sheet[] => {
  const opSheet = sheets[index].name;
  return sheets.map((s, i) => {
    let rows = i === index ? shiftRows(s.rows, op) : s.rows;
    // Fix formulas (only rows that contain one are copied).
    let changed = false;
    const fixed: Rows = { ...rows };
    for (const [rk, row] of Object.entries(rows)) {
      let nrow: Record<number, Cell> | null = null;
      for (const [ck, cell] of Object.entries(row)) {
        if (!cell.f) continue;
        const f = shiftFormula(cell.f, op, s.name, opSheet);
        if (f !== cell.f) {
          nrow ??= { ...row };
          nrow[Number(ck)] = { ...cell, f };
        }
      }
      if (nrow) {
        fixed[Number(rk)] = nrow;
        changed = true;
      }
    }
    if (changed) rows = fixed;
    if (i !== index) return rows === s.rows ? s : { ...s, rows };
    const colWidths: Record<number, number> = {};
    if (op.axis === 'col') {
      for (const [ck, w] of Object.entries(s.colWidths)) {
        const c = Number(ck);
        if (op.count > 0) colWidths[c >= op.at ? c + op.count : c] = w;
        else if (c < op.at) colWidths[c] = w;
        else if (c >= op.at - op.count) colWidths[c + op.count] = w;
      }
    }
    return {
      ...s,
      rows,
      rowCount: op.axis === 'row' ? Math.max(1, s.rowCount + op.count) : s.rowCount,
      colCount: op.axis === 'col' ? Math.max(1, s.colCount + op.count) : s.colCount,
      colWidths: op.axis === 'col' ? colWidths : s.colWidths,
    };
  });
};

// ─── Dates and typed input ────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
/** Excel serial day (1900 system) of a calendar date. */
export const serialOf = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / MS_PER_DAY + 25569;
export const dateOfSerial = (serial: number) => new Date(Math.round((serial - 25569) * MS_PER_DAY));
export const todaySerial = () => {
  const n = new Date();
  return serialOf(n.getFullYear(), n.getMonth() + 1, n.getDate());
};
/** "YYYY-MM-DD" of a serial day. */
export const isoOfSerial = (serial: number) => dateOfSerial(Math.floor(serial)).toISOString().slice(0, 10);

const validDay = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Parses "2026-01-31", "31.01.2026" or "31/01/2026" → [y, m, d]. */
export const parseDateText = (s: string): [number, number, number] | null => {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const t: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDay(...t) ? t : null;
  }
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (m) {
    const t: [number, number, number] = [Number(m[3]), Number(m[2]), Number(m[1])];
    return validDay(...t) ? t : null;
  }
  return null;
};

export const DATE_FMT = 'dd.mm.yyyy';

/** True when an Excel number format shows a date / time (ignores quoted text and colours). */
export const isDateFormat = (fmt: string | undefined) => {
  if (!fmt) return false;
  const bare = fmt.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare);
};

const NUMBER_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;

/**
 * What a typed text means in a sheet cell: formula (=…), number, percentage, date, boolean or text.
 * A leading apostrophe forces text. `numFmt` is a suggested format when the input implies one.
 */
export const parseInput = (raw: string, currentFmt?: string): { v?: CellValue; f?: string; numFmt?: string } => {
  if (raw === '') return {};
  if (raw.startsWith('=') && raw.length > 1) return { f: raw.slice(1) };
  if (raw.startsWith("'")) return { v: raw.slice(1) };
  const t = raw.trim();
  if (NUMBER_RE.test(t)) return { v: Number(t) };
  const pct = /^([-+]?\d+(?:\.\d+)?)\s*%$/.exec(t);
  if (pct) return { v: Number(pct[1]) / 100, numFmt: currentFmt && currentFmt.includes('%') ? undefined : pct[1].includes('.') ? '0.00%' : '0%' };
  const d = parseDateText(t);
  if (d) return { v: serialOf(...d), numFmt: isDateFormat(currentFmt) ? undefined : DATE_FMT };
  if (/^(true|false)$/i.test(t)) return { v: t.toLowerCase() === 'true' };
  return { v: raw };
};

/** The text shown in the formula bar / editor for a cell. */
export const rawOf = (cell: Cell | undefined) => {
  if (!cell) return '';
  if (cell.f) return `=${cell.f}`;
  const v = cell.v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number' && isDateFormat(cell.s?.numFmt)) {
    const [y, m, d] = isoOfSerial(v).split('-');
    return `${d}.${m}.${y}`;
  }
  return String(v);
};
