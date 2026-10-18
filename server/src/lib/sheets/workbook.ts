import ExcelJS from 'exceljs';
import { z } from 'zod';
import { HttpError, badRequest } from '../http.js';

/**
 * .xlsx ⇄ JSON for the browser spreadsheet (/api/drive/sheets).
 *
 * The browser works on a small, sparse model: per sheet `rows[r][c] = { v, f, s }` (0-based indices,
 * value / formula without "=" / a style subset). Saving never rebuilds the file from that model:
 * the ORIGINAL workbook is loaded and only cells whose value, formula or style subset differ from what
 * the browser was given are written, so everything the editor does not understand (borders, fonts,
 * conditional formats, charts, defined names, print setup…) stays as it was.
 */

export const LIMITS = {
  /** Largest stored file the editor opens. */
  fileBytes: 5 * 1024 * 1024,
  /** Non-empty cells per sheet (open and save). */
  cellsPerSheet: 50_000,
  sheets: 50,
  maxRow: 1_048_576,
  maxCol: 16_384,
};

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface CellStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  /** Text colour "#RRGGBB". */
  color?: string;
  /** Solid fill "#RRGGBB". */
  fill?: string;
  align?: 'left' | 'center' | 'right';
  numFmt?: string;
  wrap?: boolean;
}

export interface CellJson {
  v?: string | number | boolean | null;
  f?: string;
  s?: CellStyle;
}

export type RowsJson = Record<string, Record<string, CellJson>>;

export interface SheetJson {
  /** exceljs worksheet id of the original file (absent for sheets added in the browser). */
  id?: number;
  name: string;
  rows: RowsJson;
  rowCount: number;
  colCount: number;
  /** Column widths in pixels, by 0-based column index (only set columns). */
  colWidths: Record<string, number>;
  frozenRows: number;
  frozenCols: number;
  /** Merged ranges ("A1:B2"); displayed only, never changed by the editor. */
  merges: string[];
}

// ─── Value / style conversion ─────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
/** Excel serial day number of a date (1900 system; exceljs hands dates over as UTC instants). */
export const dateToSerial = (d: Date) => Math.round((d.getTime() / MS_PER_DAY + 25569) * 1e8) / 1e8;

const DEFAULT_DATE_FMT = 'dd.mm.yyyy';

const hexOf = (c: Partial<ExcelJS.Color> | undefined): string | undefined => {
  const argb = c?.argb;
  if (typeof argb !== 'string' || !/^[0-9a-f]{6,8}$/i.test(argb)) return undefined;
  return `#${argb.slice(-6).toUpperCase()}`;
};

const argbOf = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;

const errorText = (v: unknown) => (v && typeof v === 'object' && 'error' in v ? String((v as { error: unknown }).error) : undefined);

/** Plain JSON value of a raw exceljs value (formulas excluded). */
const plainValue = (v: unknown): { v: CellJson['v']; isDate?: boolean } => {
  if (v === null || v === undefined) return { v: null };
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return { v };
  if (v instanceof Date) return { v: dateToSerial(v), isDate: true };
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return { v: (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('') };
    if (typeof o.text === 'string') return { v: o.text };
    if (o.text && typeof o.text === 'object') return plainValue(o.text);
    const err = errorText(v);
    if (err) return { v: err };
  }
  return { v: String(v) };
};

const styleOf = (cell: ExcelJS.Cell): CellStyle | undefined => {
  const s: CellStyle = {};
  const font = cell.font;
  if (font?.bold) s.b = true;
  if (font?.italic) s.i = true;
  if (font?.underline) s.u = true;
  const color = hexOf(font?.color);
  if (color && color !== '#000000') s.color = color;
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const f = hexOf(fill.fgColor);
    if (f) s.fill = f;
  }
  const h = cell.alignment?.horizontal;
  if (h === 'left' || h === 'center' || h === 'right') s.align = h;
  if (cell.alignment?.wrapText) s.wrap = true;
  if (cell.numFmt && cell.numFmt !== 'General') s.numFmt = cell.numFmt;
  return Object.keys(s).length ? s : undefined;
};

/** The JSON form of one cell, or null when it is empty and unstyled. */
export const cellJson = (cell: ExcelJS.Cell): CellJson | null => {
  if (cell.type === ExcelJS.ValueType.Merge) return null;
  const out: CellJson = {};
  const raw = cell.value as unknown;
  const formula = raw && typeof raw === 'object' && ('formula' in raw || 'sharedFormula' in raw) ? cell.formula : undefined;
  let isDate = false;
  if (formula) {
    out.f = formula;
    const r = plainValue(cell.result as unknown);
    out.v = r.v;
    isDate = !!r.isDate;
  } else {
    const p = plainValue(raw);
    out.v = p.v;
    isDate = !!p.isDate;
  }
  let s = styleOf(cell);
  if (isDate && !s?.numFmt) s = { ...(s ?? {}), numFmt: DEFAULT_DATE_FMT };
  if (s) out.s = s;
  if (out.v === null || out.v === '') delete out.v;
  return out.v !== undefined || out.f || out.s ? out : null;
};

const pxOfWidth = (w: number | undefined) => (w ? Math.round(w * 7 + 5) : undefined);
const widthOfPx = (px: number) => Math.max(1, Math.round(((px - 5) / 7) * 100) / 100);

const frozenOf = (ws: ExcelJS.Worksheet) => {
  const v = (ws.views ?? [])[0] as Partial<ExcelJS.WorksheetViewFrozen> | undefined;
  if (v?.state !== 'frozen') return { rows: 0, cols: 0 };
  return { rows: Math.max(0, Number(v.ySplit) || 0), cols: Math.max(0, Number(v.xSplit) || 0) };
};

const tooLarge = (code = 'SHEET_TOO_LARGE') => new HttpError(413, code);

// ─── Read ─────────────────────────────────────────────────────────────

export const loadWorkbook = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    throw badRequest('INVALID_SPREADSHEET');
  }
  return wb;
};

export const sheetJson = (ws: ExcelJS.Worksheet): SheetJson => {
  const rows: RowsJson = {};
  let count = 0;
  let maxR = 0;
  let maxC = 0;
  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    row.eachCell({ includeEmpty: false }, (cell, cn) => {
      const j = cellJson(cell);
      if (!j) return;
      if (++count > LIMITS.cellsPerSheet) throw tooLarge();
      (rows[rn - 1] ??= {})[cn - 1] = j;
      maxR = Math.max(maxR, rn);
      maxC = Math.max(maxC, cn);
    });
  });
  const colWidths: Record<string, number> = {};
  const colTotal = Math.max(ws.columnCount, maxC);
  for (let c = 1; c <= Math.min(colTotal + 5, 1000); c++) {
    const px = pxOfWidth(ws.getColumn(c).width);
    if (px) colWidths[c - 1] = Math.min(px, 2000);
  }
  const frozen = frozenOf(ws);
  const merges = ((ws.model as Partial<ExcelJS.WorksheetModel>).merges ?? []).filter((m): m is string => typeof m === 'string');
  return {
    id: ws.id,
    name: ws.name,
    rows,
    rowCount: maxR,
    colCount: maxC,
    colWidths,
    frozenRows: frozen.rows,
    frozenCols: frozen.cols,
    merges,
  };
};

export const workbookJson = (wb: ExcelJS.Workbook) => {
  const sheets = wb.worksheets.filter((ws) => ws.state !== 'veryHidden').map(sheetJson);
  if (sheets.length > LIMITS.sheets) throw tooLarge('TOO_MANY_SHEETS');
  return sheets;
};

// ─── Save payload ─────────────────────────────────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const styleSchema = z
  .object({
    b: z.boolean().optional(),
    i: z.boolean().optional(),
    u: z.boolean().optional(),
    color: hex.optional(),
    fill: hex.optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    numFmt: z.string().max(100).optional(),
    wrap: z.boolean().optional(),
  })
  .strip();
const cellSchema = z
  .object({
    v: z.union([z.string().max(32_767), z.number().finite(), z.boolean(), z.null()]).optional(),
    f: z.string().max(8192).optional(),
    s: styleSchema.optional(),
  })
  .strip();

const SHEET_NAME = /^[^\\/?*[\]:]{1,31}$/;

const ROW_KEY = z.string().regex(/^\d{1,7}$/);
const COL_KEY = z.string().regex(/^\d{1,5}$/);

/**
 * One sheet of a save: either `rows` (every cell) or, for a sheet that exists in the stored file,
 * `patch` (only changed cells; null clears a cell) applied on top of the stored version.
 */
export const sheetPayloadSchema = z
  .object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().regex(SHEET_NAME, 'INVALID_SHEET_NAME'),
    rows: z.record(ROW_KEY, z.record(COL_KEY, cellSchema)).optional(),
    patch: z.record(ROW_KEY, z.record(COL_KEY, cellSchema.nullable())).optional(),
    colWidths: z.record(COL_KEY, z.number().min(10).max(2000)).default({}),
    frozenRows: z.number().int().min(0).max(1000).default(0),
    frozenCols: z.number().int().min(0).max(100).default(0),
  })
  .refine((s) => !!s.rows !== !!s.patch, { message: 'ROWS_OR_PATCH' });

export const savePayloadSchema = z.object({
  baseVersion: z.number().int().positive(),
  /** Overwrite even if someone saved a newer version meanwhile (after the user confirmed). */
  force: z.boolean().optional(),
  sheets: z.array(sheetPayloadSchema).min(1).max(LIMITS.sheets),
});

export type SheetPayload = z.infer<typeof sheetPayloadSchema>;
/** A sheet of a save with its full rows (patches resolved against the stored file). */
export type ResolvedSheet = Omit<SheetPayload, 'rows' | 'patch'> & { rows: RowsJson };

/** Unique sheet names (ignoring case). */
export const checkNames = (sheets: { name: string }[]) => {
  const names = new Set<string>();
  for (const s of sheets) {
    const key = s.name.toLocaleLowerCase('en');
    if (names.has(key)) throw badRequest('DUPLICATE_SHEET_NAME');
    names.add(key);
  }
};

/** Validates names (unique, ignoring case) and cell counts / indices of a save payload. */
export const checkPayload = (sheets: ResolvedSheet[]) => {
  checkNames(sheets);
  for (const s of sheets) {
    let count = 0;
    for (const [r, cols] of Object.entries(s.rows)) {
      if (Number(r) >= LIMITS.maxRow) throw badRequest('CELL_OUT_OF_RANGE');
      for (const c of Object.keys(cols)) {
        if (Number(c) >= LIMITS.maxCol) throw badRequest('CELL_OUT_OF_RANGE');
        count++;
      }
    }
    if (count > LIMITS.cellsPerSheet) throw tooLarge();
  }
};

/** Applies a patch (null = clear) on top of stored rows; the stored rows are not modified. */
export const applyPatch = (base: RowsJson, patch: Record<string, Record<string, CellJson | null>>): RowsJson => {
  const rows: RowsJson = { ...base };
  for (const [r, cols] of Object.entries(patch)) {
    const line: Record<string, CellJson> = { ...(rows[r] ?? {}) };
    for (const [c, cell] of Object.entries(cols)) {
      if (cell === null) delete line[c];
      else line[c] = cell;
    }
    if (Object.keys(line).length) rows[r] = line;
    else delete rows[r];
  }
  return rows;
};

// ─── Write ────────────────────────────────────────────────────────────

const sameStyle = (a: CellStyle | undefined, b: CellStyle | undefined) => {
  const x = a ?? {};
  const y = b ?? {};
  return (
    !!x.b === !!y.b &&
    !!x.i === !!y.i &&
    !!x.u === !!y.u &&
    (x.color ?? '') === (y.color ?? '') &&
    (x.fill ?? '') === (y.fill ?? '') &&
    (x.align ?? '') === (y.align ?? '') &&
    (x.numFmt ?? '') === (y.numFmt ?? '') &&
    !!x.wrap === !!y.wrap
  );
};

const normV = (v: CellJson['v']) => (v === undefined || v === '' ? null : v);

/** Applies the style subset on top of the cell's existing style (a fresh object: exceljs shares styles). */
const applyStyle = (cell: ExcelJS.Cell, before: CellStyle | undefined, s: CellStyle | undefined) => {
  const next = s ?? {};
  const prev = before ?? {};
  const style: Partial<ExcelJS.Style> = { ...(cell.style ?? {}) };
  if (!!prev.b !== !!next.b || !!prev.i !== !!next.i || !!prev.u !== !!next.u || (prev.color ?? '') !== (next.color ?? '')) {
    const font: Partial<ExcelJS.Font> = { ...(style.font ?? {}) };
    font.bold = !!next.b || undefined;
    font.italic = !!next.i || undefined;
    font.underline = next.u ? true : undefined;
    if ((prev.color ?? '') !== (next.color ?? '')) font.color = next.color ? { argb: argbOf(next.color) } : undefined;
    for (const k of Object.keys(font) as (keyof ExcelJS.Font)[]) if (font[k] === undefined) delete font[k];
    style.font = font;
  }
  if ((prev.fill ?? '') !== (next.fill ?? '')) {
    if (next.fill) style.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbOf(next.fill) } };
    else delete style.fill;
  }
  if ((prev.align ?? '') !== (next.align ?? '') || !!prev.wrap !== !!next.wrap) {
    const al: Partial<ExcelJS.Alignment> = { ...(style.alignment ?? {}) };
    if (next.align) al.horizontal = next.align;
    else delete al.horizontal;
    if (next.wrap) al.wrapText = true;
    else delete al.wrapText;
    style.alignment = al;
  }
  if ((prev.numFmt ?? '') !== (next.numFmt ?? '')) {
    if (next.numFmt) style.numFmt = next.numFmt;
    else delete style.numFmt;
  }
  cell.style = style as ExcelJS.Style;
};

/** Shared formulas reference their master cell; turn them into plain formulas so any cell can change. */
const unshareFormulas = (ws: ExcelJS.Worksheet) => {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value as unknown;
      if (v && typeof v === 'object' && 'sharedFormula' in v) {
        const formula = cell.formula;
        const result = cell.result;
        cell.value = formula ? ({ formula, result } as ExcelJS.CellFormulaValue) : (result ?? null) as ExcelJS.CellValue;
      }
    });
  });
};

/** Writes one sheet; `base` is what the browser was given for it (null for a new sheet). */
const writeSheet = (ws: ExcelJS.Worksheet, s: ResolvedSheet, base: SheetJson | null) => {
  const fresh = !base;
  if (!fresh) unshareFormulas(ws);
  const before = base?.rows ?? {};
  const positions = new Set<string>();
  for (const [r, cols] of Object.entries(before)) for (const c of Object.keys(cols)) positions.add(`${r}:${c}`);
  for (const [r, cols] of Object.entries(s.rows)) for (const c of Object.keys(cols)) positions.add(`${r}:${c}`);

  for (const pos of positions) {
    const [r, c] = pos.split(':');
    const old = before[r]?.[c];
    const cur = s.rows[r]?.[c];
    const cell = ws.getCell(Number(r) + 1, Number(c) + 1);
    if (cell.type === ExcelJS.ValueType.Merge) continue; // covered by a merge: the master holds the value
    const fOld = old?.f ?? '';
    const fNew = (cur?.f ?? '').replace(/^=/, '');
    if (fNew) {
      if (fNew !== fOld) {
        const result = cur?.v;
        cell.value = { formula: fNew, ...(result !== undefined && result !== null && result !== '' ? { result } : {}) } as ExcelJS.CellFormulaValue;
      }
    } else if (fOld || normV(old?.v) !== normV(cur?.v)) {
      cell.value = normV(cur?.v) as ExcelJS.CellValue;
    }
    if (!sameStyle(old?.s, cur?.s)) applyStyle(cell, old?.s, cur?.s);
  }

  // Column widths: only columns whose width was changed.
  const oldWidths = base?.colWidths ?? {};
  for (const [c, px] of Object.entries(s.colWidths)) {
    if (oldWidths[c] !== undefined && Math.abs(oldWidths[c] - px) < 2) continue;
    if (oldWidths[c] === undefined && Math.abs(px - 100) < 2) continue; // default width
    ws.getColumn(Number(c) + 1).width = widthOfPx(px);
  }

  const frozen = fresh ? { rows: 0, cols: 0 } : frozenOf(ws);
  if (frozen.rows !== s.frozenRows || frozen.cols !== s.frozenCols) {
    const keep = ((ws.views ?? [])[0] ?? {}) as Partial<ExcelJS.WorksheetView>;
    const { state: _state, xSplit: _x, ySplit: _y, topLeftCell: _t, ...rest } = keep as Partial<ExcelJS.WorksheetViewFrozen> & Record<string, unknown>;
    ws.views =
      s.frozenRows || s.frozenCols
        ? [{ ...rest, state: 'frozen', xSplit: s.frozenCols || undefined, ySplit: s.frozenRows || undefined } as ExcelJS.WorksheetViewFrozen]
        : [{ ...rest, state: 'normal' } as ExcelJS.WorksheetViewNormal];
  }
};

/**
 * Loads the original file, applies the browser's sheets (rename, add, delete, reorder, cells, widths,
 * frozen panes) and returns the new file. `parsed` is the stored file as JSON when already known (the
 * comparison base: what the browser was given), which saves parsing it a second time.
 */
export const applySheets = async (original: Buffer, payload: SheetPayload[], parsed?: SheetJson[]) => {
  checkNames(payload);
  const wb = await loadWorkbook(original);
  const existing = new Map(wb.worksheets.map((ws) => [ws.id, ws]));
  const parsedById = new Map((parsed ?? []).map((p) => [p.id, p]));
  const bases = payload.map((s) => {
    const ws = s.id ? existing.get(s.id) : undefined;
    return ws ? (parsedById.get(ws.id) ?? sheetJson(ws)) : null;
  });
  // A patch only makes sense on top of a sheet of the stored file (never silently on an empty one).
  if (payload.some((s, i) => s.patch && !bases[i])) throw badRequest('UNKNOWN_SHEET');
  const sheets: ResolvedSheet[] = payload.map(({ rows, patch, ...rest }, i) => ({ ...rest, rows: rows ?? applyPatch(bases[i]!.rows, patch ?? {}) }));
  checkPayload(sheets);
  const keep = new Set(sheets.map((s) => s.id).filter((id): id is number => !!id && existing.has(id)));
  for (const ws of wb.worksheets) {
    if (!keep.has(ws.id) && ws.state !== 'veryHidden') wb.removeWorksheet(ws.id);
  }
  // Temporary names first, so swapping two names never collides.
  for (const s of sheets) {
    const ws = s.id ? existing.get(s.id) : undefined;
    if (ws && ws.name !== s.name) ws.name = `~tmp${ws.id}`;
  }
  sheets.forEach((s, index) => {
    const known = s.id ? existing.get(s.id) : undefined;
    const ws = known ?? wb.addWorksheet(s.name);
    if (known && ws.name !== s.name) ws.name = s.name;
    (ws as unknown as { orderNo: number }).orderNo = index + 1;
    writeSheet(ws, s, known ? bases[index] : null);
  });
  // Formulas edited in the browser carry its result; let Excel recalculate everything on open anyway.
  wb.calcProperties = { ...(wb.calcProperties ?? {}), fullCalcOnLoad: true };
  const out = Buffer.from(await wb.xlsx.writeBuffer());
  if (out.length > LIMITS.fileBytes * 2) throw tooLarge('FILE_TOO_LARGE');
  return out;
};

/** A new, empty workbook with one sheet. */
export const emptyWorkbook = async (sheetName = 'Sheet1') => {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  wb.addWorksheet(sheetName);
  return Buffer.from(await wb.xlsx.writeBuffer());
};
