import { z } from 'zod';
import { badRequest } from '../../http.js';
import { audit } from '../../audit.js';
import { createFileIn } from '../../drive/files.js';
import { logDriveActivity } from '../../driveCollab/activity.js';
import { rowsToXlsx } from '../../docCreate/table.js';
import { XLSX_MIME, type CellJson, type SheetJson } from '../../sheets/workbook.js';
import type { AiToolContext, AnyAiTool } from '../types.js';
import { actorReq, defineTool, driveCtx, listNames, tr } from './common.js';
import { boundRange, cellName, colIndex, colLetters, parseRange } from './a1.js';
import { targetFolder, withExt } from './driveOps.js';
import { foldName, pathOf } from './paths.js';
import { labelRefs, nodeIdOf } from './refs.js';
import { addSheet, appendRows, deleteRows, insertRows, loadSheets, pickSheet, renameSheet, sheetNode, updateCells, type CellValue } from './sheetOps.js';

/** Spreadsheet (.xlsx in the drive) tools of the super-admin assistant. */

const fileRef = z.string().trim().min(1).max(1000).optional().describe('The .xlsx file: id or drive path. Defaults to the file the chat was opened on.');
const sheetName = z.string().trim().min(1).max(31).optional().describe('Sheet name (default: the first sheet).');
const baseVersion = z.number().int().min(1).optional().describe('Version read with sheet_read; the save fails with VERSION_CONFLICT if someone saved meanwhile.');
const value = z.union([z.string().max(32_767), z.number(), z.boolean(), z.null()]);
const MAX_CELLS = 2000;

const fileId = (ref: string | undefined, ctx: AiToolContext) => nodeIdOf(ref, ctx, 'node');

/** Display value of a cell: cached result / value; a formula without a cached result shows "=…". */
const shown = (c: CellJson | undefined) => (c === undefined ? null : c.v !== undefined && c.v !== null ? c.v : c.f ? `=${c.f}` : null);

const sheetInfo = (s: SheetJson) => ({ name: s.name, rows: s.rowCount, cols: s.colCount, used: s.rowCount && s.colCount ? `A1:${cellName(s.rowCount - 1, s.colCount - 1)}` : null });

const sheetRead = defineTool({
  name: 'sheet_read',
  description: `Reads an .xlsx from the drive: the list of sheets, and the values of an A1 range ("A1:F40", "B:B", "3:10", "Kunden!A1:C9") or the used range of a sheet, capped to ${MAX_CELLS} cells (page with a narrower range). Formula cells show their last computed value and are also listed in "formulas". Returns "version" for later saves.`,
  schema: z.object({ file: fileRef, sheet: sheetName, range: z.string().trim().max(60).optional() }),
  run: async (a, ctx) => {
    const id = await fileId(a.file, ctx);
    const node = await sheetNode(ctx, id, 'VIEW');
    const { row, sheets } = await loadSheets(id);
    const parsed = a.range ? parseRangeOrThrow(a.range) : null;
    const s = pickSheet(sheets, a.sheet ?? parsed?.sheet ?? null);
    const b = boundRange(parsed ?? { r1: null, c1: null, r2: null, c2: null }, s.rowCount, s.colCount);
    const width = b.c2 - b.c1 + 1;
    let r2 = b.r2;
    let truncated = false;
    if ((r2 - b.r1 + 1) * width > MAX_CELLS) {
      r2 = b.r1 + Math.max(1, Math.floor(MAX_CELLS / Math.max(1, width))) - 1;
      truncated = true;
    }
    const c2 = Math.min(b.c2, b.c1 + MAX_CELLS - 1);
    const rows: { row: number; values: (string | number | boolean | null)[] }[] = [];
    const formulas: Record<string, string> = {};
    for (let r = b.r1; r <= r2; r++) {
      const line = s.rows[r];
      if (!line) continue;
      const values: (string | number | boolean | null)[] = [];
      let any = false;
      for (let c = b.c1; c <= c2; c++) {
        const cell = line[c];
        const v = shown(cell);
        if (v !== null) any = true;
        values.push(v);
        if (cell?.f) formulas[cellName(r, c)] = `=${cell.f}`;
      }
      if (any) rows.push({ row: r + 1, values });
    }
    return {
      file: { id, name: node.name, version: row.version },
      sheets: sheets.map(sheetInfo),
      sheet: s.name,
      range: s.rowCount ? `${cellName(b.r1, b.c1)}:${cellName(r2, c2)}` : null,
      columns: Array.from({ length: Math.max(0, c2 - b.c1 + 1) }, (_, i) => colLetters(b.c1 + i)),
      rows,
      ...(Object.keys(formulas).length ? { formulas } : {}),
      ...(truncated ? { truncated: true, nextRange: `${cellName(r2 + 1, b.c1)}:${cellName(b.r2, c2)}` } : {}),
      ...(s.merges.length ? { merges: s.merges.slice(0, 20) } : {}),
    };
  },
});

const parseRangeOrThrow = (r: string) => {
  try {
    return parseRange(r);
  } catch {
    throw badRequest('INVALID_RANGE');
  }
};

const sheetFind = defineTool({
  name: 'sheet_find',
  description: 'Finds cells containing a text in every sheet of an .xlsx (ignores case, accents, ə/ı/ü …). Returns sheet, cell and value (max 100 hits).',
  schema: z.object({ file: fileRef, text: z.string().trim().min(1).max(200), sheet: sheetName }),
  run: async (a, ctx) => {
    const id = await fileId(a.file, ctx);
    const node = await sheetNode(ctx, id, 'VIEW');
    const { row, sheets } = await loadSheets(id);
    const f = foldName(a.text);
    const hits: { sheet: string; cell: string; value: unknown }[] = [];
    let total = 0;
    for (const s of a.sheet ? [pickSheet(sheets, a.sheet)] : sheets) {
      for (const [r, cols] of Object.entries(s.rows)) {
        for (const [c, cell] of Object.entries(cols)) {
          const v = shown(cell);
          if (v === null) continue;
          if (foldName(String(v)).includes(f) || (cell.f && foldName(cell.f).includes(f))) {
            total++;
            if (hits.length < 100) hits.push({ sheet: s.name, cell: cellName(Number(r), Number(c)), value: v });
          }
        }
      }
    }
    return { file: { id, name: node.name, version: row.version }, total, hits };
  },
});

const sheetStats = defineTool({
  name: 'sheet_stats',
  description: 'Sum, average, min, max and counts of the numeric cells of a range (e.g. "D2:D200" or "D:D").',
  schema: z.object({ file: fileRef, sheet: sheetName, range: z.string().trim().min(1).max(60) }),
  run: async (a, ctx) => {
    const id = await fileId(a.file, ctx);
    await sheetNode(ctx, id, 'VIEW');
    const { sheets } = await loadSheets(id);
    const parsed = parseRangeOrThrow(a.range);
    const s = pickSheet(sheets, a.sheet ?? parsed.sheet ?? null);
    const b = boundRange(parsed, s.rowCount, s.colCount);
    let sum = 0;
    let count = 0;
    let nonEmpty = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let r = b.r1; r <= b.r2; r++) {
      const line = s.rows[r];
      if (!line) continue;
      for (let c = b.c1; c <= b.c2; c++) {
        const v = shown(line[c]);
        if (v === null || v === '') continue;
        nonEmpty++;
        const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN;
        if (Number.isFinite(n)) {
          sum += n;
          count++;
          min = Math.min(min, n);
          max = Math.max(max, n);
        }
      }
    }
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    return { sheet: s.name, range: `${cellName(b.r1, b.c1)}:${cellName(b.r2, b.c2)}`, numbers: count, nonEmpty, sum: round(sum), average: count ? round(sum / count) : null, min: count ? min : null, max: count ? max : null };
  },
});

// ─── Changes (confirm) ───────────────────────────────────────────────

const fileLabel = async (file: string | undefined, ctx: AiToolContext) => (await labelRefs([file ?? ctx.context?.nodeId ?? null], ctx))[0];
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : String(v).slice(0, 40));

const sheetUpdateCells = defineTool({
  name: 'sheet_update_cells',
  description: 'Writes values or formulas into cells of an .xlsx (one new version for all changes). value "=SUM(B2:B9)" or formula "SUM(B2:B9)" sets a formula; null clears; a range "A2:A5" with one value fills all its cells. Existing cell formatting is kept.',
  confirm: true,
  schema: z.object({
    file: fileRef,
    changes: z
      .array(z.object({ sheet: sheetName, cell: z.string().trim().min(2).max(40).describe('"B3", "Kunden!B3" or "A2:A5"'), value: value.optional(), formula: z.string().max(8192).nullable().optional() }))
      .min(1)
      .max(2000),
    baseVersion,
  }),
  summary: async (a, ctx) => {
    const f = await fileLabel(a.file, ctx);
    const sample = a.changes.slice(0, 6).map((c) => `${c.sheet ? `${c.sheet}!` : ''}${c.cell}=${c.formula ? `=${c.formula.replace(/^=/, '')}` : show(c.value)}`);
    const more = a.changes.length > 6 ? ` +${a.changes.length - 6}` : '';
    return tr(ctx, {
      az: `"${f}" cədvəlində ${a.changes.length} xana dəyişsin: ${sample.join('; ')}${more}`,
      de: `${a.changes.length} Zelle(n) in „${f}“ ändern: ${sample.join('; ')}${more}`,
      en: `Change ${a.changes.length} cell(s) in "${f}": ${sample.join('; ')}${more}`,
      ru: `Изменить ${a.changes.length} ячейк(и) в «${f}»: ${sample.join('; ')}${more}`,
    });
  },
  run: async (a, ctx) => updateCells(ctx, await fileId(a.file, ctx), a.changes, a.baseVersion),
});

const rowsSchema = z.array(z.array(value).max(200)).min(1).max(5000);

const sheetAppendRows = defineTool({
  name: 'sheet_append_rows',
  description: 'Appends rows below the last used row of a sheet.',
  confirm: true,
  schema: z.object({ file: fileRef, sheet: sheetName, rows: rowsSchema, startColumn: z.string().trim().regex(/^[A-Za-z]{1,3}$/).optional().describe('First column (default A).'), baseVersion }),
  summary: async (a, ctx) => {
    const f = await fileLabel(a.file, ctx);
    const first = a.rows[0].slice(0, 6).map(show).join(' | ');
    return tr(ctx, { az: `"${f}"${a.sheet ? ` / ${a.sheet}` : ''} sonuna ${a.rows.length} sətir əlavə et (1-ci: ${first})`, de: `${a.rows.length} Zeile(n) an „${f}“${a.sheet ? ` / ${a.sheet}` : ''} anhängen (1.: ${first})`, en: `Append ${a.rows.length} row(s) to "${f}"${a.sheet ? ` / ${a.sheet}` : ''} (1st: ${first})`, ru: `Добавить ${a.rows.length} строк(и) в конец «${f}»${a.sheet ? ` / ${a.sheet}` : ''} (1-я: ${first})` });
  },
  run: async (a, ctx) => {
    return appendRows(ctx, await fileId(a.file, ctx), { sheet: a.sheet, rows: a.rows as CellValue[][], startColumn: a.startColumn ? colIndex(a.startColumn) : 0 }, a.baseVersion);
  },
});

const sheetInsertRows = defineTool({
  name: 'sheet_insert_rows',
  description: 'Inserts rows before a given row number (1-based); the rows below move down and formulas pointing at them are adjusted. Optionally fills the new rows. Refused when merged cells lie below.',
  confirm: true,
  schema: z.object({ file: fileRef, sheet: sheetName, row: z.number().int().min(1).max(1_048_575), count: z.number().int().min(1).max(10_000).default(1), rows: z.array(z.array(value).max(200)).max(10_000).optional(), baseVersion }),
  summary: async (a, ctx) => {
    const f = await fileLabel(a.file, ctx);
    const n = Math.max(a.count, a.rows?.length ?? 0);
    return tr(ctx, { az: `"${f}"${a.sheet ? ` / ${a.sheet}` : ''}: ${a.row}-ci sətirdən əvvəl ${n} sətir əlavə et (aşağıdakılar sürüşəcək)`, de: `„${f}“${a.sheet ? ` / ${a.sheet}` : ''}: ${n} Zeile(n) vor Zeile ${a.row} einfügen (darunter verschiebt sich alles)`, en: `"${f}"${a.sheet ? ` / ${a.sheet}` : ''}: insert ${n} row(s) before row ${a.row} (rows below move down)`, ru: `«${f}»${a.sheet ? ` / ${a.sheet}` : ''}: вставить ${n} строк(и) перед строкой ${a.row} (ниже всё сдвинется)` });
  },
  run: async (a, ctx) => insertRows(ctx, await fileId(a.file, ctx), { sheet: a.sheet, row: a.row, count: Math.max(a.count, a.rows?.length ?? 0), rows: a.rows as CellValue[][] | undefined }, a.baseVersion),
});

const sheetDeleteRows = defineTool({
  name: 'sheet_delete_rows',
  description: 'Deletes rows (1-based start row + count); rows below move up and formulas are adjusted (references to deleted cells become #REF!). Refused when merged cells lie below.',
  confirm: true,
  schema: z.object({ file: fileRef, sheet: sheetName, row: z.number().int().min(1).max(1_048_576), count: z.number().int().min(1).max(100_000).default(1), baseVersion }),
  summary: async (a, ctx) => {
    const f = await fileLabel(a.file, ctx);
    const range = a.count > 1 ? `${a.row}–${a.row + a.count - 1}` : `${a.row}`;
    return tr(ctx, { az: `"${f}"${a.sheet ? ` / ${a.sheet}` : ''}: ${range} sətir(lər)ini sil`, de: `„${f}“${a.sheet ? ` / ${a.sheet}` : ''}: Zeile(n) ${range} löschen`, en: `"${f}"${a.sheet ? ` / ${a.sheet}` : ''}: delete row(s) ${range}`, ru: `«${f}»${a.sheet ? ` / ${a.sheet}` : ''}: удалить строк(и) ${range}` });
  },
  run: async (a, ctx) => deleteRows(ctx, await fileId(a.file, ctx), { sheet: a.sheet, row: a.row, count: a.count }, a.baseVersion),
});

const sheetAddSheet = defineTool({
  name: 'sheet_add_sheet',
  description: 'Adds a new sheet (tab) to an .xlsx, optionally with rows.',
  confirm: true,
  schema: z.object({ file: fileRef, name: z.string().trim().min(1).max(31), rows: z.array(z.array(value).max(200)).max(5000).optional(), baseVersion }),
  summary: async (a, ctx) => {
    const f = await fileLabel(a.file, ctx);
    return tr(ctx, { az: `"${f}" faylına yeni vərəq: "${a.name}"`, de: `Neues Blatt „${a.name}“ in „${f}“`, en: `New sheet "${a.name}" in "${f}"`, ru: `Новый лист «${a.name}» в «${f}»` });
  },
  run: async (a, ctx) => addSheet(ctx, await fileId(a.file, ctx), { name: a.name, rows: a.rows as CellValue[][] | undefined }, a.baseVersion),
});

const sheetRenameSheet = defineTool({
  name: 'sheet_rename_sheet',
  description: 'Renames a sheet (tab) of an .xlsx.',
  confirm: true,
  schema: z.object({ file: fileRef, from: z.string().trim().min(1).max(31), to: z.string().trim().min(1).max(31), baseVersion }),
  summary: async (a, ctx) => {
    const f = await fileLabel(a.file, ctx);
    return tr(ctx, { az: `"${f}": "${a.from}" vərəqinin adı → "${a.to}"`, de: `„${f}“: Blatt „${a.from}“ umbenennen in „${a.to}“`, en: `"${f}": rename sheet "${a.from}" to "${a.to}"`, ru: `«${f}»: переименовать лист «${a.from}» в «${a.to}»` });
  },
  run: async (a, ctx) => renameSheet(ctx, await fileId(a.file, ctx), { from: a.from, to: a.to }, a.baseVersion),
});

const sheetCreate = defineTool({
  name: 'sheet_create',
  description: 'Creates a new .xlsx in a folder with a header row (bold, frozen, filter) and data rows.',
  confirm: true,
  schema: z.object({
    folder: z.string().trim().min(1).max(1000).optional().describe('Folder id or path (default: the open folder).'),
    name: z.string().trim().min(1).max(200),
    sheet: z.string().trim().min(1).max(31).optional(),
    headers: z.array(z.string().max(200)).min(1).max(100),
    rows: z.array(z.array(value).max(100)).max(20_000).default([]),
  }),
  summary: async (a, ctx) => {
    const [f] = await labelRefs([a.folder ?? ctx.context?.folderId ?? null], ctx);
    return tr(ctx, { az: `"${f}" qovluğunda yeni cədvəl "${a.name}": ${listNames(a.headers, 8)} (${a.rows.length} sətir)`, de: `Neue Tabelle „${a.name}“ in „${f}“: ${listNames(a.headers, 8)} (${a.rows.length} Zeilen)`, en: `New spreadsheet "${a.name}" in "${f}": ${listNames(a.headers, 8)} (${a.rows.length} rows)`, ru: `Новая таблица «${a.name}» в «${f}»: ${listNames(a.headers, 8)} (${a.rows.length} строк)` });
  },
  run: async (a, ctx) => {
    const parent = await targetFolder(driveCtx(ctx), await nodeIdOf(a.folder, ctx, 'folder'));
    if (parent.space === 'CASES') throw badRequest('READ_ONLY');
    const name = withExt(a.name, '.xlsx', 'Tabelle');
    const rows = [a.headers, ...a.rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v))))];
    const buf = await rowsToXlsx(rows, (a.sheet ?? 'Tabelle1').slice(0, 31));
    const c = await createFileIn(parent, name, buf, XLSX_MIME, ctx.user.id);
    await audit(actorReq(ctx), 'DRIVE_FILE_UPLOADED', `drive:${c.id}`, { name: c.name, size: buf.length, parentId: parent.id, source: 'ai' });
    await logDriveActivity({ nodeId: c.id, folderId: parent.id, actorId: ctx.user.id, action: 'CREATE', name: c.name, meta: { via: 'ai', format: 'xlsx', kind: 'FILE' } });
    return { id: c.id, name: c.name, path: await pathOf(c.id), version: 1, rows: a.rows.length };
  },
});

export const sheetTools: AnyAiTool[] = [sheetRead, sheetFind, sheetStats, sheetUpdateCells, sheetAppendRows, sheetInsertRows, sheetDeleteRows, sheetAddSheet, sheetRenameSheet, sheetCreate];
