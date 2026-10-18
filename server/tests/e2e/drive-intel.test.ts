import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { textPng } from '../helpers/textPng';
import { expectStatus } from '../helpers/workflow';
import { indexNode, runDriveIndex } from '../../src/lib/driveIntel/indexer.js';
import { originalOf } from '../../src/lib/driveIntel/normalize.js';
import { ocrLanguages } from '../../src/lib/driveIntel/ocr.js';
import { completeRequest } from '../../src/lib/esign/service.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string };
const upload = async (a: Agent, parentId: string, filename: string, body: Buffer, contentType: string, replace = false) => {
  const req = a.post(`/api/drive/nodes/${parentId}/files`);
  if (replace) req.field('onConflict', 'replace');
  return expectStatus(await req.attach('file', body, { filename, contentType }), 201).body.item as { id: string; name: string; version: number };
};
const content = async (a: Agent, id: string) => (await a.get(`/api/drive/nodes/${id}/content?download=1`).buffer(true).parse(binaryParser)).body as Buffer;
const textOf = async (id: string) => originalOf((await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { textContent: true } })).textContent);

const pdfWith = async (pages: string[]) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of pages) {
    const page = doc.addPage();
    p.split('\n').forEach((line, i) => page.drawText(line, { x: 50, y: 760 - i * 20, size: 12, font }));
  }
  return Buffer.from(await doc.save());
};

const docxWith = async (bodyXml: string) => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
};

const xlsxWith = async (rows: (string | number)[][], sheet = 'Daten') => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const newCase = async (first = 'Şəhla', last = 'Əliyeva') => {
  const client = await asClient({ firstName: first, lastName: last });
  await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C01234567', birthDate: new Date('1995-03-04T00:00:00Z') } });
  const c = expectStatus(await client.agent.post('/api/cases').send({ visaType: 'WORK', profession: 'Aşpaz' }), 201).body.case as { id: string; number: string };
  await waitFor(async () => (await prisma.case.findUnique({ where: { id: c.id } }))?.driveFolderId ?? null);
  return { client, c };
};

describe('drive intel: text index and content search', () => {
  it('indexes PDF, DOCX, XLSX and PNG files and finds them by content with a snippet, respecting access', async () => {
    const staff = await asStaff();
    const su = await asSuperAdmin();
    const { shared } = await roots(staff.agent);
    const folder = await mkdir(staff.agent, shared.id, 'Intel');

    const pdf = await upload(staff.agent, folder.id, 'vertrag.pdf', await pdfWith(['Arbeitsvertrag zwischen Firma und Mitarbeiter', 'Seite zwei: Probezeit sechs Monate']), 'application/pdf');
    const docx = await upload(
      staff.agent,
      folder.id,
      'mektub.docx',
      await docxWith('<w:p><w:r><w:t>Hörmətli </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Şəhla</w:t></w:r><w:r><w:t xml:space="preserve"> xanım, sənədləriniz qəbul edildi.</w:t></w:r></w:p>'),
      DOCX,
    );
    const xlsx = await upload(staff.agent, folder.id, 'siyahi.xlsx', await xlsxWith([['Ad', 'Şəhər'], ['Kamran', 'Gəncə']]), XLSX);
    const png = await upload(staff.agent, folder.id, 'scan.png', textPng('HELLO WORLD').png, 'image/png');

    // The job picks up everything not indexed yet (newest first, small batches).
    let rounds = 0;
    while ((await runDriveIndex(10)) > 0 && rounds++ < 10);
    expect(await textOf(pdf.id)).toContain('Probezeit sechs Monate');
    expect(await textOf(docx.id)).toContain('Hörmətli Şəhla xanım, sənədləriniz qəbul edildi.');
    expect(await textOf(xlsx.id)).toContain('Kamran Gəncə');
    if (ocrLanguages()) expect((await textOf(png.id)).toLowerCase()).toContain('hello');
    else expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: png.id } })).toMatchObject({ textContent: null });
    // indexed rows keep their updatedAt and are not picked again
    expect(await runDriveIndex(10)).toBe(0);

    // A new version makes the file dirty again.
    await upload(staff.agent, folder.id, 'vertrag.pdf', await pdfWith(['Arbeitsvertrag geändert', 'Probezeit drei Monate']), 'application/pdf', true);
    expect(await runDriveIndex(10)).toBe(1);
    expect(await textOf(pdf.id)).toContain('Probezeit drei Monate');

    // Folded search: "sehla xanim" finds "Şəhla xanım" inside the DOCX.
    const res = expectStatus(await staff.agent.get('/api/drive/search').query({ q: 'sehla xanim' }), 200).body;
    const hit = res.items.find((i: { id: string }) => i.id === docx.id);
    expect(hit.contentMatch.snippet).toMatchObject({ match: 'Şəhla xanım' });
    expect(hit.contentMatch.snippet.before).toContain('Hörmətli');
    expect(expectStatus(await staff.agent.get('/api/drive/search').query({ q: 'Gəncə' }), 200).body.items.map((i: { id: string }) => i.id)).toContain(xlsx.id);
    expect(expectStatus(await staff.agent.get('/api/drive/search').query({ q: 'probezeit drei' }), 200).body.items.map((i: { id: string }) => i.id)).toEqual([pdf.id]);
    // names only
    expect(expectStatus(await staff.agent.get('/api/drive/search').query({ q: 'sehla xanim', content: '0' }), 200).body.items).toHaveLength(0);

    // Access: a file in a folder the staff member cannot see is never found (nor its snippet shown).
    const locked = await mkdir(su.agent, shared.id, 'Gizli');
    expectStatus(await su.agent.patch(`/api/drive/nodes/${locked.id}/inheritance`).send({ inherit: false }), 200);
    const secret = await upload(su.agent, locked.id, 'gizli.txt', Buffer.from('Maaş cədvəli: məxfi rəqəmlər'), 'text/plain');
    await indexNode(secret.id);
    expect(expectStatus(await su.agent.get('/api/drive/search').query({ q: 'mexfi reqemler' }), 200).body.items.map((i: { id: string }) => i.id)).toEqual([secret.id]);
    expect(expectStatus(await staff.agent.get('/api/drive/search').query({ q: 'mexfi reqemler' }), 200).body.items).toHaveLength(0);
  });

  it('OCRs the embedded image of a scanned PDF page', async () => {
    if (!ocrLanguages()) return;
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(textPng('HELLO WORLD').png);
    doc.addPage([img.width + 40, img.height + 40]).drawImage(img, { x: 20, y: 20, width: img.width, height: img.height });
    const scan = await upload(staff.agent, shared.id, 'skan.pdf', Buffer.from(await doc.save()), 'application/pdf');
    await indexNode(scan.id);
    expect((await textOf(scan.id)).toLowerCase()).toContain('hello');
  });
});

describe('drive intel: version comparison', () => {
  it('diffs two PDF versions by page and two XLSX versions by cell', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const v1 = await upload(staff.agent, shared.id, 'muqavile.pdf', await pdfWith(['Der Vertrag beginnt am 1. Mai', 'Gehalt 3000 EUR']), 'application/pdf');
    await upload(staff.agent, shared.id, 'muqavile.pdf', await pdfWith(['Der Vertrag beginnt am 1. Juni', 'Gehalt 3000 EUR']), 'application/pdf', true);
    const versions = expectStatus(await staff.agent.get(`/api/drive/nodes/${v1.id}/versions`), 200).body.versions as { id: string; version: number }[];
    // b given first: the older version still ends up on the left
    const cmp = expectStatus(await staff.agent.get(`/api/drive/intel/compare/${v1.id}`).query({ a: 'current', b: versions[0].id }), 200).body;
    expect(cmp.a.version).toBe(1);
    expect(cmp.b.version).toBe(2);
    expect(cmp.result.kind).toBe('text');
    expect(cmp.result.chunks).toHaveLength(2);
    expect(cmp.result.chunks[0].changed).toBe(true);
    expect(cmp.result.chunks[1].changed).toBe(false);
    const ops = cmp.result.chunks[0].ops as { t: string; s: string }[];
    expect(ops.filter((o) => o.t === 'del').map((o) => o.s.trim())).toEqual(['Mai']);
    expect(ops.filter((o) => o.t === 'ins').map((o) => o.s.trim())).toEqual(['Juni']);

    const x = await upload(staff.agent, shared.id, 'cedvel.xlsx', await xlsxWith([['Ad', 'Maaş'], ['Kamran', 2000], ['Aysel', 2500]]), XLSX);
    await upload(staff.agent, shared.id, 'cedvel.xlsx', await xlsxWith([['Ad', 'Maaş'], ['Kamran', 2200], ['', 2500], ['Murad', 1800]]), XLSX, true);
    const xv = expectStatus(await staff.agent.get(`/api/drive/nodes/${x.id}/versions`), 200).body.versions as { id: string }[];
    const sheet = expectStatus(await staff.agent.get(`/api/drive/intel/compare/${x.id}`).query({ a: xv[0].id, b: 'current' }), 200).body.result;
    expect(sheet.kind).toBe('sheet');
    expect(sheet.sheets[0]).toMatchObject({ name: 'Daten', status: 'changed' });
    expect(sheet.sheets[0].changes).toEqual([
      { cell: 'B2', type: 'changed', old: '2000', new: '2200' },
      { cell: 'A3', type: 'removed', old: 'Aysel', new: null },
      { cell: 'A4', type: 'added', old: null, new: 'Murad' },
      { cell: 'B4', type: 'added', old: null, new: '1800' },
    ]);
    expect(sheet.stats).toEqual({ added: 2, removed: 1, changed: 1 });

    expect((await staff.agent.get(`/api/drive/intel/compare/${x.id}`).query({ a: 'nope', b: 'current' })).body.error).toBe('VERSION_NOT_FOUND');
    const client = await asClient();
    expect((await client.agent.get(`/api/drive/intel/compare/${x.id}`)).status).toBe(403);
  });
});

describe('drive intel: templates filled with client data', () => {
  it('fills a DOCX with split placeholders into the client folder and reports missing fields', async () => {
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Staff' });
    const { shared, sections } = await roots(staff.agent);
    const { c } = await newCase();
    const tpl = await upload(
      staff.agent,
      sections.templates ?? shared.id,
      'Arayış.docx',
      await docxWith(
        '<w:p><w:r><w:t>Ad: {{cli</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>ent.fullName}}</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Pasport: [[client.passportNumber]], peşə «Pe</w:t></w:r><w:r><w:t>şə»</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Maaş: {{salary}} · Rəng: {{Sevimli rəng}} · Tarix: {{today}}</w:t></w:r></w:p>',
      ),
      DOCX,
    );
    const fields = expectStatus(await staff.agent.get(`/api/drive/intel/template/${tpl.id}/fields`).query({ caseId: c.id }), 200).body;
    expect(fields).toMatchObject({ format: 'docx', supported: true, clientName: 'Şəhla Əliyeva' });
    const byKey = Object.fromEntries(fields.fields.map((f: { key: string }) => [f.key, f]));
    expect(byKey['client.fullName']).toMatchObject({ status: 'filled', value: 'Şəhla Əliyeva', known: true });
    expect(byKey['case.profession']).toMatchObject({ status: 'filled', value: 'Aşpaz' });
    expect(byKey.salary).toMatchObject({ status: 'missing', input: true });
    expect(byKey['Sevimli rəng']).toMatchObject({ status: 'missing', known: false });

    const fill = expectStatus(await staff.agent.post(`/api/drive/intel/template/${tpl.id}/fill`).send({ caseId: c.id, inputs: { salary: '2 800 €' } }), 201).body;
    expect(fill.name).toBe('Arayış – Şəhla Əliyeva.docx');
    expect(fill.missing).toEqual(['Sevimli rəng']);
    expect(fill.filled).toEqual(expect.arrayContaining(['client.fullName', 'client.passportNumber', 'case.profession', 'salary', 'today']));
    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    const stage = await prisma.driveNode.findUniqueOrThrow({ where: { id: fill.parentId } });
    expect(stage).toMatchObject({ name: 'Sonstiges', parentId: caseRow.driveFolderId });
    const zip = await JSZip.loadAsync(await content(staff.agent, fill.id));
    const xml = await zip.file('word/document.xml')!.async('string');
    const text = xml.replace(/<[^>]+>/g, '');
    expect(text).toContain('Ad: Şəhla Əliyeva');
    expect(text).toContain('Pasport: C01234567, peşə Aşpaz');
    expect(text).toContain('Maaş: 2 800 €');
    expect(text).toContain('{{Sevimli rəng}}');
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_TEMPLATE_FILLED', target: `drive:${fill.id}` } })).toBe(1);

    // Bulk: one file per case.
    const other = await newCase('Kamran', 'Quliyev');
    const bulk = expectStatus(await staff.agent.post(`/api/drive/intel/template/${tpl.id}/fill-bulk`).send({ caseIds: [c.id, other.c.id, 'missing-case'] }), 201).body.results;
    expect(bulk.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, false]);
    expect(bulk[1].name).toBe('Arayış – Kamran Quliyev.docx');
    expect(bulk[2].error).toBe('CASE_NOT_FOUND');
  });

  it('fills and flattens an AcroForm PDF; a PDF without fields is refused', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const { c } = await newCase();
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    form.createTextField('client.fullName').addToPage(page, { x: 50, y: 700, width: 300, height: 20 });
    form.createTextField('Geburtsdatum').addToPage(page, { x: 50, y: 660, width: 300, height: 20 });
    form.createTextField('employer_reference').addToPage(page, { x: 50, y: 620, width: 300, height: 20 });
    const tpl = await upload(staff.agent, shared.id, 'Antrag.pdf', Buffer.from(await doc.save()), 'application/pdf');

    const fields = expectStatus(await staff.agent.get(`/api/drive/intel/template/${tpl.id}/fields`).query({ caseId: c.id }), 200).body;
    expect(fields.format).toBe('pdf');
    expect(fields.fields.map((f: { key: string; status: string }) => [f.key, f.status])).toEqual([
      ['client.fullName', 'filled'],
      ['client.birthDate', 'filled'],
      ['employer_reference', 'missing'],
    ]);
    const fill = expectStatus(await staff.agent.post(`/api/drive/intel/template/${tpl.id}/fill`).send({ caseId: c.id, targetFolderId: shared.id }), 201).body;
    expect(fill).toMatchObject({ name: 'Antrag – Şəhla Əliyeva.pdf', parentId: shared.id, missing: ['employer_reference'] });
    const out = await PDFDocument.load(await content(staff.agent, fill.id));
    expect(out.getForm().getFields()).toHaveLength(0); // flattened

    const plain = await upload(staff.agent, shared.id, 'plain.pdf', await pdfWith(['no fields']), 'application/pdf');
    const info = expectStatus(await staff.agent.get(`/api/drive/intel/template/${plain.id}/fields`), 200).body;
    expect(info).toMatchObject({ supported: false, reason: 'TEMPLATE_NO_FIELDS' });
    expect((await staff.agent.post(`/api/drive/intel/template/${plain.id}/fill`).send({ caseId: c.id })).body.error).toBe('TEMPLATE_NO_FIELDS');
  });
});

describe('drive intel: e-signature from the drive', () => {
  it('sends a drive PDF for signature and files the signed copy next to the original', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const folder = await mkdir(staff.agent, shared.id, 'Müqavilələr');
    const pdf = await upload(staff.agent, folder.id, 'Vertrag.pdf', await pdfWith(['Arbeitsvertrag']), 'application/pdf');
    const { client, c } = await newCase();

    expect((await staff.agent.post(`/api/drive/intel/esign/${pdf.id}`).send({ title: 'x', signers: [] })).status).toBe(400);
    const sent = expectStatus(
      await staff.agent.post(`/api/drive/intel/esign/${pdf.id}`).send({
        title: 'Arbeitsvertrag',
        caseId: c.id,
        message: 'Bitte unterschreiben',
        expiresInDays: 7,
        signers: [
          { role: 'CANDIDATE', name: 'Şəhla Əliyeva', email: client.user.email, userId: client.user.id },
          { role: 'OTHER', name: 'Max Muster', email: 'max@example.com', phone: '+49 151 1234567' },
        ],
      }),
      201,
    ).body.request;
    const reqRow = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: sent.id }, include: { signers: { orderBy: { order: 'asc' } } } });
    expect(reqRow).toMatchObject({ status: 'SENT', title: 'Arbeitsvertrag', originalName: 'Vertrag.pdf', caseId: c.id, message: 'Bitte unterschreiben' });
    expect(reqRow.signers.map((s) => [s.name, s.email, s.order, s.userId])).toEqual([
      ['Şəhla Əliyeva', client.user.email, 1, client.user.id],
      ['Max Muster', 'max@example.com', 2, null],
    ]);

    const status = expectStatus(await staff.agent.get('/api/drive/intel/esign-status').query({ ids: `${pdf.id},other` }), 200).body.statuses;
    expect(status[pdf.id]).toMatchObject({ requestId: sent.id, status: 'SENT', open: true, signed: 0, total: 2 });

    // Everyone signs → completion → the signed PDF lands next to the original.
    await prisma.signatureSigner.updateMany({ where: { requestId: sent.id }, data: { status: 'SIGNED', signedAt: new Date(), signatureMode: 'TYPE', typedName: 'Signed', authMethod: 'EMAIL_OTP' } });
    await completeRequest(sent.id);
    const copy = await prisma.driveNode.findFirstOrThrow({ where: { parentId: folder.id, name: 'Vertrag (imzalanmış).pdf' } });
    expect(copy).toMatchObject({ kind: 'FILE', mimeType: 'application/pdf' });
    const signed = await content(staff.agent, copy.id);
    expect((await PDFDocument.load(signed)).getPageCount()).toBeGreaterThan(1);
    const after = expectStatus(await staff.agent.get('/api/drive/intel/esign-status').query({ ids: pdf.id }), 200).body.statuses;
    expect(after[pdf.id]).toMatchObject({ status: 'COMPLETED', open: false, signed: 2 });
    // idempotent
    await completeRequest(sent.id);
    expect(await prisma.driveNode.count({ where: { parentId: folder.id, name: { startsWith: 'Vertrag (imzalan' } } })).toBe(1);

    // Only PDFs.
    const txt = await upload(staff.agent, folder.id, 'note.txt', Buffer.from('hi'), 'text/plain');
    expect((await staff.agent.post(`/api/drive/intel/esign/${txt.id}`).send({ title: 'Note', signers: [{ role: 'OTHER', name: 'Max', email: 'm@example.com' }] })).body.error).toBe('INVALID_PDF');
  });
});
