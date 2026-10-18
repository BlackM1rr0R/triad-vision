import { prisma } from '../../../db.js';
import { HttpError, badRequest } from '../../http.js';
import { audit } from '../../audit.js';
import { requireNode } from '../../drive/access.js';
import { currentRow, readStoredFile, saveNewVersion } from '../../sheets/store.js';
import { getParsed, putParsed } from '../../sheets/cache.js';
import { LIMITS, XLSX_MIME, applySheets, loadWorkbook, workbookJson, type CellJson, type RowsJson, type SheetJson, type SheetPayload } from '../../sheets/workbook.js';
import { assertNotLockedByOther } from '../../driveCollab/lock.js';
import { logSheetSave } from '../../driveCollab/activity.js';
import type { AiToolContext } from '../types.js';
import { actorReq, driveCtx } from './common.js';
import { parseRange, shiftFormulaRows } from './a1.js';
import { foldName } from './paths.js';

/**
 * Spreadsheet actions for the assistant on top of the editor's own store (lib/sheets): the workbook JSON
 * from the parse cache, and saving through the same steps as PUT /api/drive/sheets/:nodeId — lock check,
 * optimistic version check, applySheets on the ORIGINAL file (so formatting the editor does not know
 * survives), a new drive version, the audit entry and the activity row.
 *
 * Row inserts / deletes are done on the JSON level: cells below move, formulas that point at moved rows
 * are rewritten (shiftFormulaRows). Merged ranges cannot be moved that way, so a structural change that
 * would cross a merge is refused.
 */

export type CellValue = string | number | boolean | null;

const isXlsx = (name: string, mime: string | null) => mime === XLSX_MIME || /\.xlsx$/i.test(name);

/** The drive node of a spreadsheet the user may read (VIEW) or change (EDIT). */
export const sheetNode = async (ai: AiToolContext, nodeId: string, need: 'VIEW' | 'EDIT') => {
  if (nodeId.includes(':')) throw badRequest('READ_ONLY');
  const ctx = driveCtx(ai);
  const { node } = await requireNode(ctx, nodeId, need);
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  if (node.space === 'CASES') throw badRequest('READ_ONLY');
  const meta = await prisma.driveNode.findUniqueOrThrow({ where: { id: nodeId }, select: { mimeType: true } });
  if (!isXlsx(node.name, meta.mimeType)) throw badRequest('NOT_A_SPREADSHEET');
  return node;
};

/** The workbook JSON of the current version (cached per stored file, like the editor's GET). */
export const loadSheets = async (nodeId: string) => {
  const row = await currentRow(nodeId);
  const hit = getParsed(row.storageKey);
  const sheets = hit ? hit.sheets : putParsed(row.storageKey, workbookJson(await loadWorkbook(await readStoredFile(row)))).sheets;
  return { row, sheets };
};

/** Finds a sheet by name (case / accent insensitive); a missing name means the first sheet. */
export const pickSheet = (sheets: SheetJson[], name?: string | null) => {
  if (!name) {
    if (!sheets[0]) throw badRequest('NO_SHEETS');
    return sheets[0];
  }
  const exact = sheets.find((s) => s.name === name) ?? sheets.find((s) => s.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en'));
  if (exact) return exact;
  const f = foldName(name);
  const folded = sheets.filter((s) => foldName(s.name) === f);
  if (folded.length === 1) return folded[0];
  throw new HttpError(404, 'SHEET_NOT_FOUND', `SHEET_NOT_FOUND: "${name}" (sheets: ${sheets.map((s) => s.name).join(', ')})`);
};

/** Value typed by the model → editor cell: "=SUM(A1:A3)" is a formula, numeric strings become numbers. */
export const toCell = (value: CellValue | undefined, formula?: string | null): CellJson | null => {
  if (formula) return { f: formula.replace(/^=/, '') };
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    if (value.startsWith('=') && value.length > 1) return { f: value.slice(1) };
    const t = value.trim();
    // Numbers only without leading zeros (phone / passport / postcode stay text).
    if (/^-?(0|[1-9]\d{0,14})([.,]\d+)?$/.test(t)) return { v: Number(t.replace(',', '.')) };
    return { v: value };
  }
  return { v: value };
};

/** Keeps the style of the cell being overwritten. */
const withStyle = (next: CellJson | null, prev: CellJson | undefined): CellJson | null => {
  if (!prev?.s) return next;
  return next ? { ...next, s: prev.s } : { s: prev.s };
};

/** The save payload of every sheet unchanged (applySheets drops sheets missing from the payload). */
const basePayload = (sheets: SheetJson[]): SheetPayload[] =>
  sheets.map((s) => ({ id: s.id, name: s.name, patch: {}, colWidths: s.colWidths, frozenRows: s.frozenRows, frozenCols: s.frozenCols }));

export interface SaveResult {
  id: string;
  name: string;
  version: number;
  size: number;
}

/**
 * Saves sheets the same way the editor's PUT does. `baseVersion` (when given) must still be current,
 * otherwise 409 VERSION_CONFLICT; a live lock of another user answers 423 FILE_LOCKED.
 */
export const saveSheets = async (ai: AiToolContext, nodeId: string, build: (sheets: SheetJson[]) => SheetPayload[], opts: { baseVersion?: number; cells?: number; op: string }) => {
  const node = await sheetNode(ai, nodeId, 'EDIT');
  await assertNotLockedByOther(node.id, ai.user.id);
  const { row, sheets } = await loadSheets(node.id);
  if (opts.baseVersion !== undefined && opts.baseVersion !== row.version) {
    const err = new HttpError(409, 'VERSION_CONFLICT', `VERSION_CONFLICT: current version is ${row.version}`);
    (err as HttpError & { currentVersion?: number }).currentVersion = row.version;
    throw err;
  }
  const payload = build(sheets);
  const buf = await readStoredFile(row);
  const out = await applySheets(buf, payload, getParsed(row.storageKey)?.sheets ?? sheets);
  const saved = await saveNewVersion(node.id, out, XLSX_MIME, { baseVersion: row.version });
  await audit(actorReq(ai), 'DRIVE_FILE_VERSION_ADDED', `drive:${node.id}`, {
    name: node.name,
    version: saved.version,
    size: saved.size,
    source: 'ai',
    op: opts.op,
    sheets: payload.length,
    cells: opts.cells ?? payload.reduce((n, p) => n + Object.values(p.patch ?? {}).reduce((m, r) => m + Object.keys(r).length, 0), 0),
    forced: false,
  });
  await logSheetSave(node.id, ai.user.id, { version: saved.version, via: 'ai', op: opts.op });
  return { id: node.id, name: node.name, version: saved.version, size: saved.size } satisfies SaveResult;
};

// ─── Cell edits ───────────────────────────────────────────────────────

export interface CellEdit {
  sheet?: string | null;
  cell: string;
  value?: CellValue;
  formula?: string | null;
}

/** Groups cell edits into per-sheet patches (keeps existing styles). */
export const cellPatches = (sheets: SheetJson[], edits: CellEdit[]) => {
  const bySheet = new Map<SheetJson, Record<string, Record<string, CellJson | null>>>();
  for (const e of edits) {
    const prefixed = parseRange(e.cell);
    const sheet = pickSheet(sheets, e.sheet ?? prefixed.sheet ?? null);
    if (prefixed.r1 === null || prefixed.c1 === null) throw badRequest('INVALID_CELL');
    // A range "A1:B2" with one value fills every cell of it.
    const r2 = prefixed.r2 ?? prefixed.r1;
    const c2 = prefixed.c2 ?? prefixed.c1;
    if ((r2 - prefixed.r1 + 1) * (c2 - prefixed.c1 + 1) > 5000) throw badRequest('RANGE_TOO_LARGE');
    const patch = bySheet.get(sheet) ?? bySheet.set(sheet, {}).get(sheet)!;
    for (let r = prefixed.r1; r <= r2; r++) {
      for (let c = prefixed.c1; c <= c2; c++) {
        const prev = sheet.rows[r]?.[c];
        (patch[r] ??= {})[c] = withStyle(toCell(e.value, e.formula), prev);
      }
    }
  }
  return bySheet;
};

export const updateCells = async (ai: AiToolContext, nodeId: string, edits: CellEdit[], baseVersion?: number) => {
  let cells = 0;
  const saved = await saveSheets(
    ai,
    nodeId,
    (sheets) => {
      const patches = cellPatches(sheets, edits);
      return basePayload(sheets).map((p, i) => {
        const patch = patches.get(sheets[i]);
        if (patch) cells += Object.values(patch).reduce((n, r) => n + Object.keys(r).length, 0);
        return patch ? { ...p, patch } : p;
      });
    },
    { baseVersion, op: 'update_cells' },
  );
  return { ...saved, cells };
};

// ─── Rows ─────────────────────────────────────────────────────────────

/** Row of values → cells starting at column `startCol`. */
const rowCells = (values: CellValue[], startCol = 0) => {
  const out: Record<string, CellJson> = {};
  values.forEach((v, i) => {
    const cell = toCell(v);
    if (cell) out[startCol + i] = cell;
  });
  return out;
};

/** First empty row below the used area (0-based). */
const nextRow = (s: SheetJson) => {
  let max = -1;
  for (const r of Object.keys(s.rows)) max = Math.max(max, Number(r));
  return max + 1;
};

export const appendRows = async (ai: AiToolContext, nodeId: string, a: { sheet?: string | null; rows: CellValue[][]; startColumn?: number }, baseVersion?: number) => {
  let firstRow = 0;
  const saved = await saveSheets(
    ai,
    nodeId,
    (sheets) => {
      const target = pickSheet(sheets, a.sheet);
      firstRow = nextRow(target);
      const patch: Record<string, Record<string, CellJson | null>> = {};
      a.rows.forEach((values, i) => {
        const cells = rowCells(values, a.startColumn ?? 0);
        if (Object.keys(cells).length) patch[firstRow + i] = cells;
      });
      return basePayload(sheets).map((p, i) => (sheets[i] === target ? { ...p, patch } : p));
    },
    { baseVersion, op: 'append_rows', cells: a.rows.reduce((n, r) => n + r.length, 0) },
  );
  return { ...saved, firstRow: firstRow + 1, lastRow: firstRow + a.rows.length };
};

/**
 * Moves the rows of a sheet: insert `count` empty rows before 0-based `at` (count > 0) or delete `count`
 * rows starting at `at` (count < 0). Formulas everywhere in the workbook that point at moved rows of this
 * sheet are rewritten. Returns the new rows of every sheet that changed.
 */
export const shiftRows = (sheets: SheetJson[], target: SheetJson, at: number, delta: number) => {
  if (!delta) return new Map<SheetJson, RowsJson>();
  const bandEnd = delta < 0 ? at - delta : at;
  // Merged ranges at or below the change cannot follow on the JSON level.
  for (const m of target.merges) {
    const r = parseRange(m);
    if ((r.r2 ?? 0) >= at) throw badRequest('SHEET_HAS_MERGED_CELLS_BELOW');
  }
  const out = new Map<SheetJson, RowsJson>();
  for (const s of sheets) {
    const own = s === target;
    const next: RowsJson = {};
    let changed = false;
    for (const [rk, cols] of Object.entries(s.rows)) {
      const r = Number(rk);
      let nr = r;
      if (own && r >= at) {
        if (delta > 0) nr = r + delta;
        else if (r < bandEnd) {
          changed = true;
          continue; // deleted row
        } else nr = r + delta;
      }
      if (nr !== r) changed = true;
      const line: Record<string, CellJson> = {};
      for (const [ck, cell] of Object.entries(cols)) {
        if (cell.f) {
          const f = shiftFormulaRows(cell.f, at, delta, { sheetName: target.name, ownSheet: own });
          if (f !== cell.f) changed = true;
          line[ck] = { ...cell, f };
        } else line[ck] = cell;
      }
      if (nr >= LIMITS.maxRow) throw badRequest('CELL_OUT_OF_RANGE');
      next[nr] = line;
    }
    if (changed) out.set(s, next);
  }
  return out;
};

const structural = async (ai: AiToolContext, nodeId: string, op: string, a: { sheet?: string | null; row: number; count: number; rows?: CellValue[][] }, delta: number, baseVersion?: number) => {
  if (a.row < 1) throw badRequest('INVALID_ROW');
  const at = a.row - 1;
  let moved = 0;
  const saved = await saveSheets(
    ai,
    nodeId,
    (sheets) => {
      const target = pickSheet(sheets, a.sheet);
      const changed = shiftRows(sheets, target, at, delta);
      if (delta > 0 && a.rows?.length) {
        const rows = changed.get(target) ?? { ...target.rows };
        a.rows.slice(0, delta).forEach((values, i) => {
          const cells = rowCells(values);
          if (Object.keys(cells).length) rows[at + i] = cells;
        });
        changed.set(target, rows);
      }
      moved = changed.size;
      return basePayload(sheets).map((p, i) => {
        const rows = changed.get(sheets[i]);
        if (!rows) return p;
        const { patch: _patch, ...rest } = p;
        return { ...rest, rows };
      });
    },
    { baseVersion, op, cells: Math.abs(delta) },
  );
  return { ...saved, sheetsChanged: moved };
};

export const insertRows = (ai: AiToolContext, nodeId: string, a: { sheet?: string | null; row: number; count: number; rows?: CellValue[][] }, baseVersion?: number) =>
  structural(ai, nodeId, 'insert_rows', a, Math.max(1, Math.min(a.count, 10_000)), baseVersion);

export const deleteRows = (ai: AiToolContext, nodeId: string, a: { sheet?: string | null; row: number; count: number }, baseVersion?: number) =>
  structural(ai, nodeId, 'delete_rows', a, -Math.max(1, Math.min(a.count, 100_000)), baseVersion);

// ─── Sheets ───────────────────────────────────────────────────────────

const SHEET_NAME = /^[^\\/?*[\]:]{1,31}$/;

export const addSheet = async (ai: AiToolContext, nodeId: string, a: { name: string; rows?: CellValue[][] }, baseVersion?: number) => {
  const name = a.name.trim();
  if (!SHEET_NAME.test(name)) throw badRequest('INVALID_SHEET_NAME');
  return saveSheets(
    ai,
    nodeId,
    (sheets) => {
      if (sheets.length >= LIMITS.sheets) throw badRequest('TOO_MANY_SHEETS');
      const rows: RowsJson = {};
      (a.rows ?? []).forEach((values, i) => {
        const cells = rowCells(values);
        if (Object.keys(cells).length) rows[i] = cells;
      });
      return [...basePayload(sheets), { name, rows, colWidths: {}, frozenRows: 0, frozenCols: 0 }];
    },
    { baseVersion, op: 'add_sheet', cells: (a.rows ?? []).reduce((n, r) => n + r.length, 0) },
  );
};

export const renameSheet = async (ai: AiToolContext, nodeId: string, a: { from: string; to: string }, baseVersion?: number) => {
  const to = a.to.trim();
  if (!SHEET_NAME.test(to)) throw badRequest('INVALID_SHEET_NAME');
  let from = a.from;
  const saved = await saveSheets(
    ai,
    nodeId,
    (sheets) => {
      const target = pickSheet(sheets, a.from);
      from = target.name;
      return basePayload(sheets).map((p, i) => (sheets[i] === target ? { ...p, name: to } : p));
    },
    { baseVersion, op: 'rename_sheet' },
  );
  return { ...saved, from, to };
};
