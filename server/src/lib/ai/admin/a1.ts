/**
 * A1 notation for the spreadsheet tools (pure, unit tested). Indices are 0-based like the editor's
 * workbook JSON (rows[r][c]).
 */

export const MAX_ROW = 1_048_576;
export const MAX_COL = 16_384;

/** "A" → 0, "Z" → 25, "AA" → 26. */
export const colIndex = (letters: string) => {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    const v = ch.charCodeAt(0) - 64;
    if (v < 1 || v > 26) throw new Error('INVALID_COLUMN');
    n = n * 26 + v;
  }
  if (n < 1 || n > MAX_COL) throw new Error('INVALID_COLUMN');
  return n - 1;
};

/** 0 → "A", 26 → "AA". */
export const colLetters = (index: number) => {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export const cellName = (r: number, c: number) => `${colLetters(c)}${r + 1}`;

export interface CellRef {
  r: number;
  c: number;
}

/** "B3" / "$B$3" → { r: 2, c: 1 }. */
export const parseCell = (ref: string): CellRef => {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  if (!m) throw new Error('INVALID_CELL');
  const r = Number(m[2]) - 1;
  if (r < 0 || r >= MAX_ROW) throw new Error('INVALID_CELL');
  return { r, c: colIndex(m[1]) };
};

export interface RangeRef {
  sheet?: string;
  /** Inclusive bounds; open ends (whole columns / rows) are null. */
  r1: number | null;
  c1: number | null;
  r2: number | null;
  c2: number | null;
}

/** Splits "'My Sheet'!A1:B2" / "Kunden!A:A" into the sheet name and the rest. */
export const splitSheet = (input: string): { sheet?: string; ref: string } => {
  const s = input.trim();
  const q = /^'((?:[^']|'')+)'!(.*)$/.exec(s);
  if (q) return { sheet: q[1].replace(/''/g, "'"), ref: q[2] };
  const i = s.lastIndexOf('!');
  if (i > 0) return { sheet: s.slice(0, i), ref: s.slice(i + 1) };
  return { ref: s };
};

/**
 * "A1:C10", "B2", "A:C" (whole columns), "2:5" (whole rows), optionally with a sheet prefix. The
 * bounds are normalised (top-left first).
 */
export const parseRange = (input: string): RangeRef => {
  const { sheet, ref } = splitSheet(input);
  const [a, b = a] = ref.split(':').map((x) => x.trim());
  if (!a) throw new Error('INVALID_RANGE');
  let out: RangeRef;
  if (/^\$?[A-Za-z]{1,3}$/.test(a) && /^\$?[A-Za-z]{1,3}$/.test(b)) {
    out = { r1: null, r2: null, c1: colIndex(a.replace('$', '')), c2: colIndex(b.replace('$', '')) };
  } else if (/^\$?\d{1,7}$/.test(a) && /^\$?\d{1,7}$/.test(b)) {
    const r1 = Number(a.replace('$', '')) - 1;
    const r2 = Number(b.replace('$', '')) - 1;
    if (r1 < 0 || r2 < 0) throw new Error('INVALID_RANGE');
    out = { r1, r2, c1: null, c2: null };
  } else {
    let p: CellRef;
    let q: CellRef;
    try {
      p = parseCell(a);
      q = parseCell(b);
    } catch {
      throw new Error('INVALID_RANGE');
    }
    out = { r1: p.r, c1: p.c, r2: q.r, c2: q.c };
  }
  if (out.r1 !== null && out.r2 !== null && out.r1 > out.r2) [out.r1, out.r2] = [out.r2, out.r1];
  if (out.c1 !== null && out.c2 !== null && out.c1 > out.c2) [out.c1, out.c2] = [out.c2, out.c1];
  return { ...(sheet ? { sheet } : {}), ...out };
};

/** Fills open ends with the used area (rowCount / colCount = 1-based extents of the sheet). */
export const boundRange = (r: RangeRef, rowCount: number, colCount: number) => ({
  r1: r.r1 ?? 0,
  c1: r.c1 ?? 0,
  r2: r.r2 ?? Math.max(0, rowCount - 1),
  c2: r.c2 ?? Math.max(0, colCount - 1),
});

/**
 * Shifts row numbers in a formula after rows were inserted (delta > 0) or deleted (delta < 0) at
 * 0-based row `at`. References to rows ≥ at move by delta; with a deletion, references into the deleted
 * band become #REF!. References to other sheets (Sheet2!A1) are left alone unless `sheetName` matches.
 * Strings in double quotes are not touched.
 */
export const shiftFormulaRows = (formula: string, at: number, delta: number, opts: { sheetName?: string; ownSheet?: boolean } = {}) => {
  const own = opts.ownSheet ?? true;
  const REF = /((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?)(\d{1,7})(?::(\$?[A-Za-z]{1,3}\$?)(\d{1,7}))?(?![\w(!])/g;
  const removedEnd = at - delta; // deletion band [at, at - delta)
  /** New 0-based row of a single reference (null = deleted). */
  const one = (r: number) => (r < at ? r : delta > 0 ? r + delta : r >= removedEnd ? r + delta : null);
  const parts = formula.split(/("(?:[^"]|"")*")/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // quoted string
      return part.replace(REF, (m, sheetPart: string | undefined, colA: string, rowA: string, colB: string | undefined, rowB: string | undefined, offset: number, whole: string) => {
        // Part of a longer identifier (e.g. a defined name) — not a reference.
        const prev = offset > 0 ? whole[offset - 1] : '';
        if (prev && /[\w.$]/.test(prev)) return m;
        const sheet = sheetPart ? sheetPart.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : undefined;
        const applies = sheet ? !!opts.sheetName && sheet.toLocaleLowerCase('en') === opts.sheetName.toLocaleLowerCase('en') : own;
        if (!applies) return m;
        const prefix = sheetPart ?? '';
        const a = Number(rowA) - 1;
        if (colB === undefined || rowB === undefined) {
          const n = one(a);
          return n === null ? `${prefix}#REF!` : `${prefix}${colA}${n + 1}`;
        }
        const b = Number(rowB) - 1;
        let na: number;
        let nb: number;
        if (delta > 0) {
          na = a < at ? a : a + delta;
          nb = b < at ? b : b + delta;
        } else {
          // A range shrinks around the deleted band; it disappears only when fully inside it.
          na = a < at ? a : a >= removedEnd ? a + delta : at;
          nb = b < at ? b : b >= removedEnd ? b + delta : at - 1;
          if (nb < na) return `${prefix}#REF!`;
        }
        return `${prefix}${colA}${na + 1}:${colB}${nb + 1}`;
      });
    })
    .join('');
};
