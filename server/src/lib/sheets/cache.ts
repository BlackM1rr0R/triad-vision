import type { SheetJson } from './workbook.js';

/**
 * Small in-memory LRU of parsed workbooks for the spreadsheet editor, keyed by the drive storage key
 * (a new key is written for every version, so an entry never goes stale). Parsing a large .xlsx with
 * exceljs takes hundreds of milliseconds; reopening a file, reloading after a conflict and the save
 * that follows an open all reuse the parsed JSON. The serialised sheets are kept too, so a GET only
 * concatenates strings.
 *
 * Entries are shared: callers must treat them as read-only.
 */

interface Entry {
  sheets: SheetJson[];
  json?: string;
  cells: number;
}

const MAX_ENTRIES = 8;
/** Total cells kept (roughly 100–200 bytes each in memory). */
const MAX_CELLS = 400_000;

const entries = new Map<string, Entry>();
let totalCells = 0;

const countCells = (sheets: SheetJson[]) => {
  let n = 0;
  for (const s of sheets) for (const r in s.rows) n += Object.keys(s.rows[r]).length;
  return n;
};

export const getParsed = (storageKey: string): Entry | undefined => {
  const e = entries.get(storageKey);
  if (!e) return undefined;
  // Most recently used last.
  entries.delete(storageKey);
  entries.set(storageKey, e);
  return e;
};

export const putParsed = (storageKey: string, sheets: SheetJson[]): Entry => {
  const old = entries.get(storageKey);
  if (old) {
    totalCells -= old.cells;
    entries.delete(storageKey);
  }
  const e: Entry = { sheets, cells: countCells(sheets) };
  if (e.cells > MAX_CELLS) return e; // too big to keep
  entries.set(storageKey, e);
  totalCells += e.cells;
  for (const [k, v] of entries) {
    if (entries.size <= MAX_ENTRIES && totalCells <= MAX_CELLS) break;
    entries.delete(k);
    totalCells -= v.cells;
  }
  return e;
};

/** The sheets as a JSON string (computed once per entry). */
export const sheetsJsonOf = (e: Entry) => (e.json ??= JSON.stringify(e.sheets));

export const clearParsedCache = () => {
  entries.clear();
  totalCells = 0;
};
