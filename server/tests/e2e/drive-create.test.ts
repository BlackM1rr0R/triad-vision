import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser, makePdf, PNG_BUFFER } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';

/** A real 1×1 greyscale JPEG (pdf-lib parses its SOF marker). */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string };
const upload = async (a: Agent, parentId: string, filename: string, body: Buffer, contentType: string) =>
  expectStatus(await a.post(`/api/drive/nodes/${parentId}/files`).attach('file', body, { filename, contentType }), 201).body.item as { id: string; name: string };
const content = async (a: Agent, id: string) => (await a.get(`/api/drive/nodes/${id}/content?download=1`).buffer(true).parse(binaryParser)).body as Buffer;
const restrictedFolder = async (su: Agent, parentId: string, name: string) => {
  const f = await mkdir(su, parentId, name);
  expectStatus(await su.patch(`/api/drive/nodes/${f.id}/inheritance`).send({ inherit: false }), 200);
  return f;
};

const BLOCKS = [
  { type: 'h1', runs: [{ t: 'Arayış — Bescheinigung — Справка' }] },
  { type: 'p', align: 'left', runs: [{ t: 'Hörmətli ' }, { t: 'Şəhla Əliyeva', b: true }, { t: ', ' }, { t: 'sehr geehrte Frau Müller', i: true }, { t: ', ' }, { t: 'уважаемый господин', u: true }, { t: '.' }] },
  { type: 'ul', runs: [{ t: 'Pasport surəti' }] },
  { type: 'ul', runs: [{ t: 'Größe: 12 × 15 cm' }] },
  { type: 'ol', runs: [{ t: 'Birinci addım' }] },
  { type: 'ol', runs: [{ t: 'Второй шаг' }] },
  { type: 'table', header: true, rows: [['Ad', 'Name', 'Имя'], ['Ülvi', 'Jürgen', 'Юрий']] },
  { type: 'hr' },
  { type: 'p', align: 'center', runs: [{ t: 'Son' }] },
];

describe('drive: documents made in the drive', () => {
  it('creates a PDF from editor blocks (az / de / ru text), opens its source and saves an edit as a new version', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    await prisma.setting.create({ data: { key: 'legal', value: { companyName: 'Triad Vision GmbH', street: 'Friedrichstraße 123', zip: '10117', city: 'Berlin', email: 'info@triad-vision.de' } } });

    const res = expectStatus(
      await staff.agent.post('/api/drive/create/pdf').send({ parentId: shared.id, name: 'Arayış', title: 'Arayış · Bescheinigung', letterhead: true, date: '18.10.2026', blocks: BLOCKS }),
      201,
    );
    const item = res.body.item;
    expect(item).toMatchObject({ name: 'Arayış.pdf', kind: 'FILE', mimeType: 'application/pdf', parentId: shared.id, version: 1 });
    const pdf = await content(staff.agent, item.id);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe('Arayış · Bescheinigung');
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_DOC_CREATED', target: `drive:${item.id}` } })).toBe(1);

    // Same name again → unique name.
    const again = expectStatus(await staff.agent.post('/api/drive/create/pdf').send({ parentId: shared.id, name: 'Arayış.pdf', blocks: [] }), 201).body.item;
    expect(again.name).toBe('Arayış (2).pdf');

    // Source round trip.
    const src = expectStatus(await staff.agent.get(`/api/drive/create/pdf/${item.id}/source`), 200).body;
    expect(src).toMatchObject({ id: item.id, version: 1, canEdit: true });
    expect(src.doc).toMatchObject({ title: 'Arayış · Bescheinigung', letterhead: true, date: '18.10.2026' });
    expect(src.doc.blocks).toEqual(BLOCKS);

    // Edit → version 2, the old file stays in the history; a stale base version is refused.
    const edited = [...BLOCKS, { type: 'p', runs: [{ t: 'Əlavə: Nachtrag' }] }];
    const put = expectStatus(await staff.agent.put(`/api/drive/create/pdf/${item.id}`).send({ title: 'Neu', blocks: edited, letterhead: false, baseVersion: 1 }), 200).body;
    expect(put.version).toBe(2);
    expect(put.item).toMatchObject({ id: item.id, version: 2, name: 'Arayış.pdf' });
    expect(await prisma.driveFileVersion.count({ where: { nodeId: item.id } })).toBe(1);
    const src2 = expectStatus(await staff.agent.get(`/api/drive/create/pdf/${item.id}/source`), 200).body;
    expect(src2.doc.blocks).toHaveLength(BLOCKS.length + 1);
    expect(src2.doc.title).toBe('Neu');
    const stale = await staff.agent.put(`/api/drive/create/pdf/${item.id}`).send({ blocks: [], baseVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'VERSION_CONFLICT', currentVersion: 2 });
    const versions = expectStatus(await staff.agent.get(`/api/drive/nodes/${item.id}/versions`), 200).body.versions;
    expect(versions.map((v: { version: number }) => v.version)).toEqual([1]);

    // A PDF not made in the editor has no source.
    const foreign = await upload(staff.agent, shared.id, 'scan.pdf', await makePdf('scan'), 'application/pdf');
    expect((await staff.agent.get(`/api/drive/create/pdf/${foreign.id}/source`)).body.error).toBe('NO_SOURCE');

    // Validation and access.
    expect((await staff.agent.post('/api/drive/create/pdf').send({ parentId: shared.id, name: 'x', blocks: [{ type: 'script', runs: [] }] })).status).toBe(400);
    expect((await staff.agent.post('/api/drive/create/pdf').send({ parentId: item.id, name: 'x', blocks: [] })).body.error).toBe('NOT_A_FOLDER');
    const client = await asClient();
    expect((await client.agent.post('/api/drive/create/pdf').send({ parentId: shared.id, name: 'x', blocks: [] })).status).toBe(403);
    const su = await asSuperAdmin();
    const locked = await restrictedFolder(su.agent, shared.id, 'Locked');
    expect((await staff.agent.post('/api/drive/create/pdf').send({ parentId: locked.id, name: 'x', blocks: [] })).status).toBe(404);
    expect((await staff.agent.get('/api/drive/create/letterhead')).body.letterhead).toMatchObject({ name: 'Triad Vision GmbH', lines: ['Friedrichstraße 123', '10117 Berlin'] });
  });

  it('turns pasted text into Excel (TSV with header) or PDF (paragraphs or a table)', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const tsv = 'Ad\tSoyad\tYaş\tPasport\nŞəhla\tƏliyeva\t28\t0123\nJürgen\tMüller\t41\tC01\n';
    const preview = expectStatus(await staff.agent.post('/api/drive/create/preview-text').send({ text: tsv }), 200).body;
    expect(preview).toMatchObject({ delimiter: 'tab', columns: 4, totalRows: 3 });
    expect(preview.rows[1]).toEqual(['Şəhla', 'Əliyeva', '28', '0123']);
    expect(expectStatus(await staff.agent.post('/api/drive/create/preview-text').send({ text: 'a;b;c\n1;2;3\n4;5;6' }), 200).body.delimiter).toBe('semicolon');
    expect(expectStatus(await staff.agent.post('/api/drive/create/preview-text').send({ text: 'name,city\n"Doe, J.",Baku\nX,Berlin' }), 200).body).toMatchObject({ delimiter: 'comma', rows: [['name', 'city'], ['Doe, J.', 'Baku'], ['X', 'Berlin']] });
    expect(expectStatus(await staff.agent.post('/api/drive/create/preview-text').send({ text: 'Ad      Şəhər\nAli     Bakı\nVeli    Gəncə' }), 200).body.delimiter).toBe('spaces');
    expect(expectStatus(await staff.agent.post('/api/drive/create/preview-text').send({ text: 'Bu sadə mətndir, cədvəl deyil.\nİkinci sətir burada.' }), 200).body.delimiter).toBe('none');

    const x = expectStatus(await staff.agent.post('/api/drive/create/from-text').send({ parentId: shared.id, name: 'Siyahı', text: tsv, format: 'xlsx' }), 201).body;
    expect(x.item).toMatchObject({ name: 'Siyahı.xlsx', mimeType: XLSX });
    expect(x.table).toBe(true);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await content(staff.agent, x.item.id)) as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, 'Ad', 'Soyad', 'Yaş', 'Pasport']);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getCell('A2').value).toBe('Şəhla');
    expect(ws.getCell('C2').value).toBe(28);
    // Leading zeros stay text (passport, phone numbers).
    expect(ws.getCell('D2').value).toBe('0123');
    expect(ws.autoFilter).toBeTruthy();
    // The sheet editor opens it.
    expect(expectStatus(await staff.agent.get(`/api/drive/sheets/${x.item.id}`), 200).body.sheets[0].name).toBe('Siyahı');

    const p = expectStatus(await staff.agent.post('/api/drive/create/from-text').send({ parentId: shared.id, name: 'Qeyd', text: '# Başlıq\n\nBirinci abzas, Größe.\n\n- bənd\n- пункт', format: 'pdf' }), 201).body;
    expect(p.item).toMatchObject({ name: 'Qeyd.pdf', mimeType: 'application/pdf' });
    expect(p.table).toBe(false);
    expect((await PDFDocument.load(await content(staff.agent, p.item.id))).getPageCount()).toBe(1);
    const tp = expectStatus(await staff.agent.post('/api/drive/create/from-text').send({ parentId: shared.id, name: 'Cədvəl.pdf', text: tsv, format: 'pdf' }), 201).body;
    expect(tp).toMatchObject({ table: true, item: { name: 'Cədvəl.pdf' } });
    expect((await staff.agent.post('/api/drive/create/from-text').send({ parentId: shared.id, name: 'x', text: '   ', format: 'pdf' })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_FILE_FROM_TEXT' } })).toBe(3);
  });

  it('converts images to PDF (one or merged), merges PDFs, turns CSV into Excel and checks access', async () => {
    const staff = await asStaff();
    const su = await asSuperAdmin();
    const { shared } = await roots(staff.agent);
    const dir = await mkdir(staff.agent, shared.id, 'Skanlar');
    const jpg = await upload(staff.agent, dir.id, 'pasport.jpg', JPEG, 'image/jpeg');
    const png = await upload(staff.agent, dir.id, 'diplom.png', PNG_BUFFER, 'image/png');
    const pdfA = await upload(staff.agent, dir.id, 'a.pdf', await makePdf('A', 2), 'application/pdf');
    const pdfB = await upload(staff.agent, dir.id, 'b.pdf', await makePdf('B', 3), 'application/pdf');
    const csv = await upload(staff.agent, dir.id, 'list.csv', Buffer.from('Ad;Şəhər\nAli;Bakı\nJürgen;Köln\n', 'utf8'), 'text/csv');

    const one = expectStatus(await staff.agent.post('/api/drive/create/convert').send({ ids: [jpg.id, png.id], to: 'pdf' }), 201).body;
    expect(one.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, true]);
    expect(one.items.map((i: { name: string }) => i.name).sort()).toEqual(['diplom.pdf', 'pasport.pdf']);
    expect(one.items.every((i: { parentId: string }) => i.parentId === dir.id)).toBe(true);

    const merged = expectStatus(await staff.agent.post('/api/drive/create/convert').send({ ids: [jpg.id, png.id], to: 'pdf', merge: true, name: 'Sənədlər' }), 201).body;
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].name).toBe('Sənədlər.pdf');
    expect((await PDFDocument.load(await content(staff.agent, merged.items[0].id))).getPageCount()).toBe(2);

    const pdfs = expectStatus(await staff.agent.post('/api/drive/create/convert').send({ ids: [pdfA.id, pdfB.id, jpg.id], to: 'pdf', merge: true }), 201).body;
    expect(pdfs.items[0].name).toBe('a (zusammengeführt).pdf');
    expect((await PDFDocument.load(await content(staff.agent, pdfs.items[0].id))).getPageCount()).toBe(6);

    // A single PDF is already a PDF; per-item errors do not stop the others.
    const mixed = expectStatus(await staff.agent.post('/api/drive/create/convert').send({ ids: [pdfA.id, csv.id], to: 'pdf' }), 201).body;
    expect(mixed.results).toEqual([
      { id: pdfA.id, ok: false, error: 'ALREADY_PDF' },
      expect.objectContaining({ id: csv.id, ok: true, name: 'list.pdf' }),
    ]);

    const x = expectStatus(await staff.agent.post('/api/drive/create/convert').send({ ids: [csv.id], to: 'xlsx', parentId: shared.id }), 201).body;
    expect(x.items[0]).toMatchObject({ name: 'list.xlsx', parentId: shared.id, mimeType: XLSX });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await content(staff.agent, x.items[0].id)) as unknown as ExcelJS.Buffer);
    expect(wb.worksheets[0].getRow(1).values).toEqual([undefined, 'Ad', 'Şəhər']);
    expect(wb.worksheets[0].getCell('B3').value).toBe('Köln');
    // .xlsx → PDF table.
    const xp = expectStatus(await staff.agent.post('/api/drive/create/convert').send({ ids: [x.items[0].id], to: 'pdf' }), 201).body;
    expect(xp.items[0].name).toBe('list.pdf');
    expect((await staff.agent.post('/api/drive/create/convert').send({ ids: [jpg.id], to: 'xlsx' })).body.results[0].error).toBe('UNSUPPORTED_CONVERSION');

    // Access: a source the caller cannot see is 404, a target folder without EDIT too; clients are refused.
    const locked = await restrictedFolder(su.agent, shared.id, 'Locked');
    const hidden = await upload(su.agent, locked.id, 'secret.png', PNG_BUFFER, 'image/png');
    expect((await staff.agent.post('/api/drive/create/convert').send({ ids: [hidden.id], to: 'pdf' })).status).toBe(404);
    expect((await staff.agent.post('/api/drive/create/convert').send({ ids: [png.id], to: 'pdf', parentId: locked.id })).status).toBe(404);
    expectStatus(await su.agent.put(`/api/drive/nodes/${locked.id}/grants`).send({ userId: staff.user.id, access: 'VIEW' }), 200);
    expect((await staff.agent.post('/api/drive/create/convert').send({ ids: [hidden.id], to: 'pdf' })).body.error).toBe('INSUFFICIENT_ACCESS');
    expect((await staff.agent.post('/api/drive/create/convert').send({ ids: [png.id], to: 'pdf', parentId: locked.id })).body.error).toBe('INSUFFICIENT_ACCESS');
    expect((await staff.agent.post('/api/drive/create/convert').send({ ids: [dir.id], to: 'pdf' })).body.error).toBe('NOT_A_FILE');
    const client = await asClient();
    expect((await client.agent.post('/api/drive/create/convert').send({ ids: [png.id], to: 'pdf' })).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_FILE_CONVERTED' } })).toBe(7);
  });
});
