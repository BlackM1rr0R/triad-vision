import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { adminPrompt, adminSystemPrompt, adminTools } from '../../src/lib/ai/admin/index.js';
import { boundRange, cellName, colIndex, colLetters, parseCell, parseRange, shiftFormulaRows, splitSheet } from '../../src/lib/ai/admin/a1.js';
import { foldName, looksLikeId, matchSegment, splitPath } from '../../src/lib/ai/admin/paths.js';
import { cellPatches, pickSheet, shiftRows, toCell } from '../../src/lib/ai/admin/sheetOps.js';
import { markdownBlocks, withExt } from '../../src/lib/ai/admin/driveOps.js';
import { toJsonSchema } from '../../src/lib/ai/admin/schema.js';
import type { SheetJson } from '../../src/lib/sheets/workbook.js';

describe('ai admin: path normalisation and matching', () => {
  it('folds Azerbaijani and German letters, case and accents', () => {
    expect(foldName('İlqar Məmmədov')).toBe('ilqar memmedov');
    expect(foldName('Şəkər Ağayev Çingiz Öz Ülvi')).toBe('seker agayev cingiz oz ulvi');
    expect(foldName('Anträge')).toBe('antrage');
    expect(foldName('Straße  ')).toBe('strase');
    expect(foldName('ILQAR')).toBe(foldName('ılqar'));
  });

  it('splits paths, drops the root name and empty parts', () => {
    expect(splitPath('Gemeinsame Dokumente/Partner/İlqar/')).toEqual(['Partner', 'İlqar']);
    expect(splitPath('/Partner\\İlqar')).toEqual(['Partner', 'İlqar']);
    expect(splitPath('gemeinsame dokumente')).toEqual([]);
    expect(splitPath(' Anträge / Arbeitsvisum ')).toEqual(['Anträge', 'Arbeitsvisum']);
  });

  it('matches a segment exactly, folded, by unique prefix / substring, or reports ambiguity', () => {
    const kids = [
      { id: '1', name: 'Anträge' },
      { id: '2', name: 'Partner' },
      { id: '3', name: 'Aysel Məmmədova · Pass-Nr. C123' },
      { id: '4', name: 'Aysel Əliyeva · Pass-Nr. C999' },
      { id: '5', name: 'İlqar' },
    ];
    expect(matchSegment('partner', kids)).toEqual({ match: kids[1] });
    expect(matchSegment('Antrage', kids)).toEqual({ match: kids[0] });
    expect(matchSegment('ilqar', kids)).toEqual({ match: kids[4] });
    expect(matchSegment('Aysel Memmedova', kids)).toEqual({ match: kids[2] });
    expect(matchSegment('C999', kids)).toEqual({ match: kids[3] });
    const amb = matchSegment('Aysel', kids);
    expect(amb && 'ambiguous' in amb && amb.ambiguous.map((k) => k.id)).toEqual(['3', '4']);
    expect(matchSegment('Xyz', kids)).toBeNull();
  });

  it('tells ids from paths', () => {
    expect(looksLikeId('cmabc123def456ghi789jkl0')).toBe(true);
    expect(looksLikeId('Partner/İlqar')).toBe(false);
    expect(looksLikeId('Vorlagen')).toBe(false);
  });
});

describe('ai admin: A1 notation', () => {
  it('converts columns both ways', () => {
    expect(colIndex('A')).toBe(0);
    expect(colIndex('z')).toBe(25);
    expect(colIndex('AA')).toBe(26);
    expect(colIndex('XFD')).toBe(16_383);
    expect(() => colIndex('XFE')).toThrow();
    for (const n of [0, 25, 26, 51, 52, 701, 702, 16_383]) expect(colIndex(colLetters(n))).toBe(n);
    expect(cellName(2, 1)).toBe('B3');
  });

  it('parses cells and ranges incl. sheet prefixes, whole rows / columns and reversed corners', () => {
    expect(parseCell('$B$3')).toEqual({ r: 2, c: 1 });
    expect(() => parseCell('B0')).toThrow();
    expect(parseRange('A1:C10')).toEqual({ r1: 0, c1: 0, r2: 9, c2: 2 });
    expect(parseRange('C10:A1')).toEqual({ r1: 0, c1: 0, r2: 9, c2: 2 });
    expect(parseRange('B2')).toEqual({ r1: 1, c1: 1, r2: 1, c2: 1 });
    expect(parseRange('B:D')).toEqual({ r1: null, r2: null, c1: 1, c2: 3 });
    expect(parseRange('3:5')).toEqual({ r1: 2, r2: 4, c1: null, c2: null });
    expect(parseRange("'Kunden 2026'!A1:B2")).toEqual({ sheet: 'Kunden 2026', r1: 0, c1: 0, r2: 1, c2: 1 });
    expect(parseRange('Notizen!A:A')).toMatchObject({ sheet: 'Notizen', c1: 0, c2: 0 });
    expect(splitSheet("'It''s'!A1")).toEqual({ sheet: "It's", ref: 'A1' });
    expect(() => parseRange('hello')).toThrow();
    expect(boundRange(parseRange('B:C'), 40, 6)).toEqual({ r1: 0, c1: 1, r2: 39, c2: 2 });
    expect(boundRange(parseRange('2:3'), 40, 6)).toEqual({ r1: 1, c1: 0, r2: 2, c2: 5 });
  });

  it('shifts formula rows on insert and delete, leaving strings and other sheets alone', () => {
    expect(shiftFormulaRows('SUM(B2:B10)+B12', 4, 2)).toBe('SUM(B2:B12)+B14');
    expect(shiftFormulaRows('A1*2', 4, 2)).toBe('A1*2');
    expect(shiftFormulaRows('$B$7&"B7"', 4, 1)).toBe('$B$8&"B7"');
    expect(shiftFormulaRows('Other!B7+B7', 4, 1)).toBe('Other!B7+B8');
    expect(shiftFormulaRows('Kunden!B7+B7', 4, 1, { sheetName: 'Kunden', ownSheet: false })).toBe('Kunden!B8+B7');
    // delete rows 5–6 (0-based 4..5)
    expect(shiftFormulaRows('B5+B7', 4, -2)).toBe('#REF!+B5');
    expect(shiftFormulaRows('SUM(B2:B10)', 4, -2)).toBe('SUM(B2:B8)');
    expect(shiftFormulaRows('SUM(B5:B10)', 4, -2)).toBe('SUM(B5:B8)');
    expect(shiftFormulaRows('SUM(B5:B6)', 4, -2)).toBe('SUM(#REF!)');
    expect(shiftFormulaRows('LOG10(B9)', 4, 1)).toBe('LOG10(B10)');
  });
});

const sheet = (name: string, rows: SheetJson['rows'], extra: Partial<SheetJson> = {}): SheetJson => ({
  id: extra.id ?? 1,
  name,
  rows,
  rowCount: Math.max(0, ...Object.keys(rows).map((r) => Number(r) + 1)),
  colCount: 3,
  colWidths: {},
  frozenRows: 0,
  frozenCols: 0,
  merges: [],
  ...extra,
});

describe('ai admin: sheet row operations on the workbook JSON', () => {
  it('turns typed values into cells (formulas, numbers without leading zeros)', () => {
    expect(toCell('=SUM(A1:A3)')).toEqual({ f: 'SUM(A1:A3)' });
    expect(toCell(null, '=A1')).toEqual({ f: 'A1' });
    expect(toCell('12,5')).toEqual({ v: 12.5 });
    expect(toCell('0501234567')).toEqual({ v: '0501234567' });
    expect(toCell('')).toBeNull();
    expect(toCell(true)).toEqual({ v: true });
  });

  it('inserts and deletes rows, moving cells and rewriting formulas in every sheet', () => {
    const a = sheet('Kunden', { 0: { 0: { v: 'Name' } }, 1: { 0: { v: 'A' }, 1: { v: 1 } }, 2: { 0: { v: 'B' }, 1: { v: 2 } }, 3: { 1: { f: 'SUM(B2:B3)', v: 3 } } });
    const b = sheet('Summe', { 0: { 0: { f: 'Kunden!B4', v: 3 } } }, { id: 2 });
    const ins = shiftRows([a, b], a, 2, 1);
    expect(ins.get(a)).toEqual({ 0: { 0: { v: 'Name' } }, 1: { 0: { v: 'A' }, 1: { v: 1 } }, 3: { 0: { v: 'B' }, 1: { v: 2 } }, 4: { 1: { f: 'SUM(B2:B4)', v: 3 } } });
    expect(ins.get(b)).toEqual({ 0: { 0: { f: 'Kunden!B5', v: 3 } } });
    const del = shiftRows([a, b], a, 1, -1);
    expect(del.get(a)).toEqual({ 0: { 0: { v: 'Name' } }, 1: { 0: { v: 'B' }, 1: { v: 2 } }, 2: { 1: { f: 'SUM(B2:B2)', v: 3 } } });
    expect(del.get(b)).toEqual({ 0: { 0: { f: 'Kunden!B3', v: 3 } } });
  });

  it('refuses to move rows across merged cells and resolves sheets by folded names', () => {
    const a = sheet('Müştərilər', { 5: { 0: { v: 'x' } } }, { merges: ['A6:B6'] });
    expect(() => shiftRows([a], a, 2, 1)).toThrow();
    expect(shiftRows([a], a, 7, 1).size).toBe(0);
    expect(pickSheet([a], 'musteriler')).toBe(a);
    expect(() => pickSheet([a], 'nope')).toThrow();
  });

  it('builds per-sheet patches keeping styles; a range fills every cell', () => {
    const a = sheet('S1', { 0: { 0: { v: 'old', s: { b: true } } } });
    const p = cellPatches([a], [{ cell: 'A1', value: 'new' }, { cell: 'B1:B2', value: 0 }, { cell: 'S1!C3', formula: 'A1&B1' }]);
    expect(p.get(a)).toEqual({ 0: { 0: { v: 'new', s: { b: true } }, 1: { v: 0 } }, 1: { 1: { v: 0 } }, 2: { 2: { f: 'A1&B1' } } });
  });
});

describe('ai admin: documents', () => {
  it('turns markdown-ish text into document blocks with tables, rules and bold runs', () => {
    const blocks = markdownBlocks('# Titel\n\nHallo **Welt**\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\n- eins\n1. zwei');
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'p', 'table', 'hr', 'ul', 'ol']);
    expect(blocks[1]).toMatchObject({ runs: [{ t: 'Hallo ' }, { t: 'Welt', b: true }] });
    expect(blocks[2]).toMatchObject({ header: true, rows: [['A', 'B'], ['1', '2']] });
    expect(withExt('Brief.pdf', '.pdf', 'X')).toBe('Brief.pdf');
    expect(withExt('Liste: 2026', '.xlsx', 'X')).toBe('Liste 2026.xlsx');
  });
});

describe('ai admin: zod → JSON schema', () => {
  it('converts objects with optional / default / nullable / enum / array / record fields', () => {
    const s = toJsonSchema(z.object({ a: z.string().min(1).max(5).describe('d'), b: z.number().int().min(0).default(3), c: z.enum(['x', 'y']).optional(), d: z.array(z.boolean()).max(2), e: z.string().nullable(), f: z.record(z.string(), z.number()) }));
    expect(s).toMatchObject({
      type: 'object',
      required: ['a', 'd', 'e', 'f'],
      properties: {
        a: { type: 'string', minLength: 1, maxLength: 5, description: 'd' },
        b: { type: 'integer', minimum: 0, default: 3 },
        c: { type: 'string', enum: ['x', 'y'] },
        d: { type: 'array', items: { type: 'boolean' }, maxItems: 2 },
        e: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        f: { type: 'object', additionalProperties: { type: 'number' } },
      },
    });
  });
});

/** Minimal valid arguments of every tool (keeps the schema test exhaustive). */
const SAMPLES: Record<string, unknown> = {
  drive_list: {},
  drive_search: { query: 'Aysel' },
  drive_info: { node: 'Partner/İlqar' },
  drive_read_text: { node: 'cmabc123def456ghi789jkl0' },
  drive_activity: {},
  drive_tree_summary: {},
  drive_trash: {},
  drive_create_folder: { name: 'Neu/Unterordner' },
  drive_rename: { node: 'x.pdf', newName: 'y.pdf' },
  drive_move: { nodes: ['a'], target: 'Partner' },
  drive_copy: { nodes: ['a'], target: 'Partner' },
  drive_delete: { nodes: ['a', 'b'] },
  drive_restore: { ids: ['a'] },
  drive_create_pdf: { name: 'Brief', text: 'Hallo' },
  drive_text_to_excel: { name: 'Liste', rows: [['a', 1, null]] },
  drive_convert: { nodes: ['a'], to: 'pdf' },
  drive_fill_template: { template: 'Vorlagen/x.docx', case: 'TV-2026-0001' },
  drive_share_link: {},
  drive_comment: { body: 'Bitte prüfen', mentions: ['Ilqar'] },
  drive_send_for_signature: { title: 'Vertrag', signers: [{ name: 'Aysel M', email: 'a@b.cd' }] },
  sheet_read: { range: 'A1:C3' },
  sheet_find: { text: 'Aysel' },
  sheet_stats: { range: 'B:B' },
  sheet_update_cells: { changes: [{ cell: 'B2', value: 5 }] },
  sheet_append_rows: { rows: [['a', 1]] },
  sheet_insert_rows: { row: 2 },
  sheet_delete_rows: { row: 2, count: 2 },
  sheet_add_sheet: { name: 'Neu' },
  sheet_rename_sheet: { from: 'Sheet1', to: 'Kunden' },
  sheet_create: { name: 'Neu', headers: ['Name'] },
  settlement_query: { unpaid: true },
  settlement_summary: { month: '2026-10' },
  settlement_case_suggestions: { id: 'x' },
  settlement_update: { changes: [{ id: 'x', field: 'amount', value: 3000 }] },
  settlement_mark_paid: { items: [{ id: 'x', beneficiary: 'Xalid' }] },
  settlement_add_row: { clientName: 'Aysel Məmmədova' },
  settlement_link_case: { id: 'x', case: null },
  register_query: { q: 'Aysel' },
  case_lookup: { query: 'Aysel' },
  partner_list: {},
  partner_info: { partner: 'Ilqar' },
  register_update: { changes: [{ case: 'TV-2026-0001', field: 'partner', value: 'Ilqar' }] },
  partner_create: { name: 'Ilqar' },
  partner_assign_cases: { cases: ['TV-2026-0001'], partner: 'Ilqar' },
  stats_overview: {},
};

const READ_ONLY = new Set(['drive_list', 'drive_search', 'drive_info', 'drive_read_text', 'drive_activity', 'drive_tree_summary', 'drive_trash', 'sheet_read', 'sheet_find', 'sheet_stats', 'settlement_query', 'settlement_summary', 'settlement_case_suggestions', 'register_query', 'case_lookup', 'partner_list', 'partner_info', 'stats_overview']);

describe('ai admin: tool definitions', () => {
  it('exports the system prompt under both names, with the drive layout and the split rule', () => {
    expect(adminPrompt).toBe(adminSystemPrompt);
    for (const s of ['Gemeinsame Dokumente', 'Anträge', 'Partner', 'Mitarbeiter', 'Vorlagen', 'Alle Kunden', 'net / 3', '200 AZN', 'Tofig = Abdulla', 'untrusted_document_text']) expect(adminSystemPrompt).toContain(s);
  });

  it('has unique snake_case ADMIN tools, every one with a sample', () => {
    const names = adminTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of adminTools) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
      expect(t.scope).toBe('ADMIN');
      expect(t.description.length).toBeGreaterThan(20);
    }
    expect(names.sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  it('changing tools confirm with a summary; read tools run at once', () => {
    for (const t of adminTools) {
      if (READ_ONLY.has(t.name)) {
        expect(t.confirm, t.name).toBeFalsy();
        expect(t.summary, t.name).toBeUndefined();
      } else {
        expect(t.confirm, t.name).toBe(true);
        expect(typeof t.summary, t.name).toBe('function');
      }
    }
  });

  it('every schema accepts its sample, rejects junk and matches its JSON parameters', () => {
    for (const t of adminTools) {
      const ok = t.schema.safeParse(SAMPLES[t.name]);
      expect(ok.success, `${t.name}: ${ok.success ? '' : JSON.stringify(ok.error.issues)}`).toBe(true);
      expect(t.schema.safeParse('junk').success, t.name).toBe(false);
      const p = t.parameters as { type: string; properties: Record<string, unknown>; required?: string[] };
      expect(p.type, t.name).toBe('object');
      const shape = (t.schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
      expect(Object.keys(p.properties).sort(), t.name).toEqual(Object.keys(shape).sort());
      for (const r of p.required ?? []) expect(shape[r]?.isOptional(), `${t.name}.${r}`).toBe(false);
    }
  });
});

describe('ai admin: transliterated names', () => {
  it('finds "Məmmədov" by "Mammadov" and "Ənvər" by "Envar"', () => {
    const kids = [
      { id: '1', name: 'Aysel Məmmədova · Pass-Nr. C123' },
      { id: '2', name: 'Ənvər' },
      { id: '3', name: 'Murad Əliyev' },
    ];
    expect(matchSegment('Mammadova Aysel', kids)).toEqual({ match: kids[0] });
    expect(matchSegment('Envar', kids)).toEqual({ match: kids[1] });
    expect(matchSegment('Murad Aliyev', kids)).toEqual({ match: kids[2] });
  });
});
