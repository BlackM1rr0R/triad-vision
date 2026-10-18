import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { ensureRoots } from '../../src/lib/drive/roots.js';
import { newStorageKey, storagePath } from '../../src/lib/drive/storage.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A real workbook: header row in bold, numbers, a SUM formula, a date and a second sheet. */
const buildBook = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Kunden', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.getCell('A1').value = 'Name';
  ws.getCell('B1').value = 'Betrag';
  ws.getCell('A1').font = { bold: true };
  ws.getCell('B1').font = { bold: true, color: { argb: 'FFFF0000' } };
  ws.getCell('B1').border = { bottom: { style: 'thin' } };
  ws.getCell('A2').value = 'Aysel';
  ws.getCell('B2').value = 10;
  ws.getCell('A3').value = 'Murad';
  ws.getCell('B3').value = 32;
  ws.getCell('B4').value = { formula: 'SUM(B2:B3)', result: 42 };
  ws.getCell('C2').value = new Date(Date.UTC(2026, 0, 31));
  ws.getColumn(1).width = 30;
  ws.mergeCells('D1:E1');
  ws.getCell('D1').value = 'Merged';
  const other = wb.addWorksheet('Notizen');
  other.getCell('A1').value = 'Hallo';
  return Buffer.from(await wb.xlsx.writeBuffer());
};

/** Puts a file into a fresh folder under the shared root with explicit grants (inheritance off). */
const placeFile = async (opts: { editors?: string[]; viewers?: string[]; name?: string; body?: Buffer; mime?: string } = {}) => {
  const { sharedId } = await ensureRoots();
  const folder = await prisma.driveNode.create({
    data: {
      space: 'SHARED',
      kind: 'FOLDER',
      name: `Sheets ${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      parentId: sharedId,
      inheritPermissions: false,
      grants: {
        create: [
          ...(opts.editors ?? []).map((userId) => ({ userId, access: 'EDIT' as const })),
          ...(opts.viewers ?? []).map((userId) => ({ userId, access: 'VIEW' as const })),
        ],
      },
    },
  });
  const body = opts.body ?? (await buildBook());
  const key = newStorageKey();
  await fs.mkdir(storagePath(key).replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  await fs.writeFile(storagePath(key), body);
  const file = await prisma.driveNode.create({
    data: { space: 'SHARED', kind: 'FILE', name: opts.name ?? 'Kunden.xlsx', parentId: folder.id, storageKey: key, mimeType: opts.mime ?? XLSX, size: body.length },
  });
  return { folder, file };
};

const readStored = async (nodeId: string) => {
  const n = await prisma.driveNode.findUniqueOrThrow({ where: { id: nodeId } });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await fs.readFile(storagePath(n.storageKey!))) as unknown as ExcelJS.Buffer);
  return { node: n, wb };
};

type SheetJson = {
  id?: number;
  name: string;
  rows: Record<string, Record<string, { v?: unknown; f?: string; s?: Record<string, unknown> }>>;
  colWidths: Record<string, number>;
  frozenRows: number;
  frozenCols: number;
  merges: string[];
};

describe('sheets: open', () => {
  it('returns the workbook as sparse JSON with formulas, styles, widths, frozen rows and merges', async () => {
    const staff = await asStaff();
    const { file, folder } = await placeFile({ viewers: [staff.user.id] });
    const res = expectStatus(await staff.agent.get(`/api/drive/sheets/${file.id}`), 200);
    expect(res.body).toMatchObject({ id: file.id, name: 'Kunden.xlsx', version: 1, canEdit: false, myAccess: 'VIEW' });
    expect(res.body.path.map((p: { id: string }) => p.id)).toContain(folder.id);
    const [kunden, notizen] = res.body.sheets as SheetJson[];
    expect(kunden.name).toBe('Kunden');
    expect(notizen.name).toBe('Notizen');
    expect(kunden.rows['0']['0']).toEqual({ v: 'Name', s: { b: true } });
    expect(kunden.rows['0']['1']).toEqual({ v: 'Betrag', s: { b: true, color: '#FF0000' } });
    expect(kunden.rows['3']['1']).toMatchObject({ f: 'SUM(B2:B3)', v: 42 });
    expect(kunden.rows['1']['2'].v).toBe(46053); // 2026-01-31 as an Excel serial day
    expect(kunden.rows['1']['2'].s?.numFmt).toBeTruthy();
    expect(kunden.frozenRows).toBe(1);
    expect(kunden.colWidths['0']).toBe(215);
    expect(kunden.merges).toEqual(['D1:E1']);
  });

  it('refuses non-spreadsheets, invisible files, clients and anonymous callers', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const { file } = await placeFile({ editors: [staff.user.id] });
    const pdf = await placeFile({ editors: [staff.user.id], name: 'x.pdf', mime: 'application/pdf', body: Buffer.from('%PDF-1.4') });
    expect((await staff.agent.get(`/api/drive/sheets/${pdf.file.id}`)).body.error).toBe('NOT_A_SPREADSHEET');
    expect((await other.agent.get(`/api/drive/sheets/${file.id}`)).status).toBe(404);
    const client = await asClient();
    expect((await client.agent.get(`/api/drive/sheets/${file.id}`)).status).toBe(403);
    const { anon } = await import('../helpers/api');
    expect((await anon().get(`/api/drive/sheets/${file.id}`)).status).toBe(401);
    const no2fa = await asStaff({ twoFactor: false });
    expect((await no2fa.agent.get(`/api/drive/sheets/${file.id}`)).body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
  });
});

describe('sheets: save', () => {
  it('saves a new version, keeps formulas, bold cells and unknown formatting, and records history', async () => {
    const staff = await asStaff();
    const { file } = await placeFile({ editors: [staff.user.id] });
    const opened = expectStatus(await staff.agent.get(`/api/drive/sheets/${file.id}`), 200).body;
    expect(opened.canEdit).toBe(true);
    const [kunden, notizen] = opened.sheets as SheetJson[];
    // Edit: change a number, add a row with a new formula, italic on A3, rename the second sheet, add a third.
    kunden.rows['1']['1'] = { v: 15 };
    kunden.rows['4'] = { '0': { v: 'Avg', s: { b: true } }, '1': { f: 'AVERAGE(B2:B3)', v: 23.5 } };
    kunden.rows['2']['0'] = { v: 'Murad', s: { i: true } };
    kunden.colWidths['1'] = 150;
    const sheets = [kunden, { ...notizen, name: 'Notes' }, { name: 'Neu', rows: { '0': { '0': { v: 'x' } } }, colWidths: {}, frozenRows: 0, frozenCols: 0 }];
    const res = expectStatus(await staff.agent.put(`/api/drive/sheets/${file.id}`).send({ baseVersion: 1, sheets }), 200);
    expect(res.body.version).toBe(2);

    const { node, wb } = await readStored(file.id);
    expect(node.version).toBe(2);
    expect(node.storageKey).not.toBe(file.storageKey);
    const versions = await prisma.driveFileVersion.findMany({ where: { nodeId: file.id } });
    expect(versions.map((v) => [v.version, v.storageKey])).toEqual([[1, file.storageKey]]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Kunden', 'Notes', 'Neu']);
    const ws = wb.getWorksheet('Kunden')!;
    expect(ws.getCell('B2').value).toBe(15);
    expect(ws.getCell('B4').formula).toBe('SUM(B2:B3)'); // untouched formula preserved
    expect(ws.getCell('B5').formula).toBe('AVERAGE(B2:B3)');
    expect(ws.getCell('A1').font?.bold).toBe(true); // bold preserved
    expect(ws.getCell('B1').font?.color?.argb).toBe('FFFF0000');
    expect(ws.getCell('B1').border?.bottom?.style).toBe('thin'); // formatting the editor does not know
    expect(ws.getCell('A3').font?.italic).toBe(true);
    expect(ws.getCell('A2').font?.italic).toBeFalsy(); // styles are per cell, never shared
    expect(ws.getCell('D1').value).toBe('Merged');
    expect(ws.getColumn(1).width).toBe(30);
    expect(Math.round(ws.getColumn(2).width!)).toBe(21);
    expect(wb.getWorksheet('Neu')!.getCell('A1').value).toBe('x');

    const auditRow = await prisma.auditLog.findFirst({ where: { action: 'DRIVE_FILE_VERSION_ADDED', target: `drive:${file.id}` } });
    expect(auditRow?.actorId).toBe(staff.user.id);
    expect(auditRow?.details).toMatchObject({ version: 2, source: 'sheet-editor' });

    // Reopening shows the new state.
    const again = expectStatus(await staff.agent.get(`/api/drive/sheets/${file.id}`), 200).body;
    expect(again.version).toBe(2);
    expect((again.sheets as SheetJson[])[0].rows['4']['1'].f).toBe('AVERAGE(B2:B3)');
  });

  it('answers 409 VERSION_CONFLICT for a stale base version unless forced', async () => {
    const a = await asStaff();
    const { file } = await placeFile({ editors: [a.user.id] });
    const opened = expectStatus(await a.agent.get(`/api/drive/sheets/${file.id}`), 200).body;
    const sheets = opened.sheets as SheetJson[];
    expectStatus(await a.agent.put(`/api/drive/sheets/${file.id}`).send({ baseVersion: 1, sheets }), 200);
    const stale = await a.agent.put(`/api/drive/sheets/${file.id}`).send({ baseVersion: 1, sheets });
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({ error: 'VERSION_CONFLICT', currentVersion: 2 });
    const forced = expectStatus(await a.agent.put(`/api/drive/sheets/${file.id}`).send({ baseVersion: 1, force: true, sheets }), 200);
    expect(forced.body.version).toBe(3);
  });

  it('VIEW can read but not write; invalid payloads are refused', async () => {
    const viewer = await asStaff();
    const editor = await asStaff();
    const { file } = await placeFile({ viewers: [viewer.user.id], editors: [editor.user.id] });
    const sheets = (expectStatus(await viewer.agent.get(`/api/drive/sheets/${file.id}`), 200).body.sheets as SheetJson[]);
    const denied = await viewer.agent.put(`/api/drive/sheets/${file.id}`).send({ baseVersion: 1, sheets });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('INSUFFICIENT_ACCESS');
    const dup = await editor.agent.put(`/api/drive/sheets/${file.id}`).send({ baseVersion: 1, sheets: [sheets[0], { ...sheets[1], name: 'kunden' }] });
    expect(dup.body.error).toBe('DUPLICATE_SHEET_NAME');
    const badName = await editor.agent.put(`/api/drive/sheets/${file.id}`).send({ baseVersion: 1, sheets: [{ ...sheets[0], name: 'a/b' }] });
    expect(badName.status).toBe(400);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: file.id } })).version).toBe(1);
  });

  it('refuses sheets with more than 50 000 cells (413)', async () => {
    const editor = await asStaff();
    const { file } = await placeFile({ editors: [editor.user.id] });
    const rows: SheetJson['rows'] = {};
    for (let r = 0; r < 5001; r++) {
      const cols: Record<string, { v: number }> = {};
      for (let c = 0; c < 10; c++) cols[c] = { v: c };
      rows[r] = cols;
    }
    const res = await editor.agent
      .put(`/api/drive/sheets/${file.id}`)
      .set('Content-Type', 'application/vnd.triad.sheet+json')
      .send(JSON.stringify({ baseVersion: 1, sheets: [{ name: 'Big', rows, colWidths: {}, frozenRows: 0, frozenCols: 0 }] }));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('SHEET_TOO_LARGE');
  });
});

describe('sheets: create', () => {
  it('creates an empty .xlsx in a folder the caller may edit', async () => {
    const editor = await asStaff();
    const viewer = await asStaff();
    const { folder } = await placeFile({ editors: [editor.user.id], viewers: [viewer.user.id] });
    const res = expectStatus(await editor.agent.post('/api/drive/sheets').send({ parentId: folder.id, name: 'Plan' }), 201);
    expect(res.body.name).toBe('Plan.xlsx');
    const again = expectStatus(await editor.agent.post('/api/drive/sheets').send({ parentId: folder.id, name: 'Plan.xlsx' }), 201);
    expect(again.body.name).toBe('Plan (2).xlsx');
    const opened = expectStatus(await editor.agent.get(`/api/drive/sheets/${res.body.id}`), 200).body;
    expect(opened.sheets).toHaveLength(1);
    expect(opened.sheets[0].rows).toEqual({});
    expect((await viewer.agent.post('/api/drive/sheets').send({ parentId: folder.id, name: 'X' })).status).toBe(403);
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(node).toMatchObject({ kind: 'FILE', mimeType: XLSX, parentId: folder.id, createdById: editor.user.id });
    // The drive serves the new file like any other.
    const dl = await editor.agent.get(`/api/drive/nodes/${res.body.id}/content?download=1`).buffer(true).parse(binaryParser);
    expect(dl.status).toBe(200);
    expect(dl.body.subarray(0, 2).toString()).toBe('PK');
  });

  it('admins without a grant cannot create in a private folder', async () => {
    const admin = await asAdmin();
    const { folder } = await placeFile({});
    expect((await admin.agent.post('/api/drive/sheets').send({ parentId: folder.id, name: 'X' })).status).toBe(404);
  });
});
