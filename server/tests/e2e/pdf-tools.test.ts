import zlib from 'node:zlib';
import sharp from 'sharp';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { pdfPageTexts } from '../../src/lib/driveIntel/extract.js';
import { compressPdf } from '../../src/lib/pdfTools/compress.js';

// ─── fixtures ────────────────────────────────────────────────────────

/** A text PDF: page i says "<label> <i+1>". */
const textPdf = async (label: string, pages: number, opts: { rotate?: number } = {}) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawText(`${label} ${i + 1}`, { x: 60, y: 700, size: 20, font });
    if (opts.rotate) p.setRotation(degrees(opts.rotate));
  }
  return Buffer.from(await doc.save());
};

/** A "scan": every page is one big high-quality JPEG covering the page, no text. */
const scannedPdf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const jpg = await sharp({ create: { width: 2480, height: 3508, channels: 3, background: { r: 245, g: 240, b: 230 } } })
      .composite([
        {
          input: await sharp({ create: { width: 2480, height: 3508, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
            .blur(1.2)
            .png()
            .toBuffer(),
          blend: 'multiply',
        },
      ])
      .jpeg({ quality: 95 })
      .toBuffer();
    const img = await doc.embedJpg(jpg);
    doc.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  return Buffer.from(await doc.save());
};

const stampPng = () => sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 200, g: 20, b: 20, alpha: 0.6 } } }).png().toBuffer();

// ─── helpers ─────────────────────────────────────────────────────────

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string };
const upload = async (a: Agent, parentId: string, filename: string, body: Buffer, contentType = 'application/pdf') =>
  expectStatus(await a.post(`/api/drive/nodes/${parentId}/files`).attach('file', body, { filename, contentType }), 201).body.item as { id: string; name: string; version: number };
const content = async (a: Agent, id: string) => (await a.get(`/api/drive/nodes/${id}/content?download=1`).buffer(true).parse(binaryParser)).body as Buffer;
const load = async (a: Agent, id: string) => PDFDocument.load(await content(a, id));
const texts = async (a: Agent, id: string) => pdfPageTexts(await content(a, id));

/** Decoded content streams of a page. */
const pageContent = (doc: PDFDocument, i: number) => {
  const c = doc.getPage(i).node.Contents();
  const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
  return streams
    .map((s) => {
      if (!(s instanceof PDFRawStream)) return '';
      const raw = Buffer.from(s.contents);
      return s.dict.get(PDFName.of('Filter')) ? zlib.inflateSync(raw).toString('latin1') : raw.toString('latin1');
    })
    .join('\n');
};
const xobjects = (doc: PDFDocument, i: number) => doc.getPage(i).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length ?? 0;
const fonts = (doc: PDFDocument, i: number) => doc.getPage(i).node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)?.keys().length ?? 0;
/** Every stream of the file, inflated, as one string (to prove removed content is really gone). */
const allStreams = (doc: PDFDocument) =>
  doc.context
    .enumerateIndirectObjects()
    .map(([, o]) => {
      if (!(o instanceof PDFRawStream)) return '';
      try {
        return o.dict.get(PDFName.of('Filter')) ? zlib.inflateSync(Buffer.from(o.contents)).toString('latin1') : Buffer.from(o.contents).toString('latin1');
      } catch {
        return '';
      }
    })
    .join('\n');

const setup = async () => {
  const staff = await asStaff();
  const { shared } = await roots(staff.agent);
  const folder = await mkdir(staff.agent, shared.id, `PDF ${Math.random().toString(36).slice(2, 8)}`);
  return { staff, folder };
};

// ─── tests ───────────────────────────────────────────────────────────

describe('pdf tools: page editor', () => {
  it('rotates, deletes, reorders and inserts pages (PDF + image) and saves a new version with activity', async () => {
    const { staff, folder } = await setup();
    const file = await upload(staff.agent, folder.id, 'Akt.pdf', await textPdf('Seite', 4));
    const other = await upload(staff.agent, folder.id, 'Anlage.pdf', await textPdf('Anlage', 2));
    const photo = await upload(staff.agent, folder.id, 'Foto.png', await stampPng(), 'image/png');

    const info = expectStatus(await staff.agent.get(`/api/drive/pdf-tools/${file.id}/info`), 200).body;
    expect(info).toMatchObject({ pages: 4, version: 1, canEdit: true, final: false });

    const res = expectStatus(
      await staff.agent.post(`/api/drive/pdf-tools/${file.id}/apply`).send({
        baseVersion: 1,
        ops: [
          { type: 'rotate', pages: [0], angle: 90 },
          { type: 'delete', pages: [2] }, // → Seite 1, 2, 4
          { type: 'reorder', order: [2, 0, 1] }, // → Seite 4, 1, 2
          { type: 'insert', at: 1, sourceNodeId: other.id, pages: [1] }, // → 4, Anlage 2, 1, 2
          { type: 'insert', at: 4, sourceNodeId: photo.id }, // → … + image page
        ],
      }),
      200,
    ).body;
    expect(res).toMatchObject({ version: 2, pageCount: 5, created: false });
    const doc = await load(staff.agent, file.id);
    expect(doc.getPageCount()).toBe(5);
    expect(doc.getPage(2).getRotation().angle).toBe(90);
    expect(doc.getPage(0).getRotation().angle).toBe(0);
    const t = await texts(staff.agent, file.id);
    expect(t[0]).toContain('Seite 4');
    expect(t[1]).toContain('Anlage 2');
    expect(t[2]).toContain('Seite 1');
    expect(t[3]).toContain('Seite 2');
    expect(xobjects(doc, 4)).toBe(1);
    // The deleted page is gone from the file, not just from the page tree.
    expect(allStreams(doc)).not.toContain('Seite 3');

    expect(await prisma.driveFileVersion.count({ where: { nodeId: file.id } })).toBe(1);
    const act = await prisma.driveActivity.findFirst({ where: { nodeId: file.id, action: 'NEW_VERSION' } });
    expect(act?.meta).toMatchObject({ version: 2, source: 'pdf-tools:edit' });
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_FILE_VERSION_ADDED', target: `drive:${file.id}` } })).toBe(1);

    // "Save as copy": the original stays at v2, a new file appears next to it.
    const copy = expectStatus(await staff.agent.post(`/api/drive/pdf-tools/${file.id}/apply`).send({ baseVersion: 2, ops: [{ type: 'delete', pages: [0] }], saveAs: 'copy', name: 'Auszug' }), 201).body;
    expect(copy.item).toMatchObject({ name: 'Auszug.pdf', parentId: folder.id, version: 1 });
    expect((await load(staff.agent, copy.item.id)).getPageCount()).toBe(4);
    expect(await prisma.driveActivity.count({ where: { nodeId: copy.item.id, action: 'CREATE' } })).toBe(1);

    // Bad ops are refused.
    expect((await staff.agent.post(`/api/drive/pdf-tools/${file.id}/apply`).send({ baseVersion: 2, ops: [{ type: 'delete', pages: [0, 1, 2, 3, 4] }] })).body.error).toBe('NO_PAGES_LEFT');
    expect((await staff.agent.post(`/api/drive/pdf-tools/${file.id}/apply`).send({ baseVersion: 2, ops: [{ type: 'reorder', order: [0, 0, 1, 2, 3] }] })).body.error).toBe('INVALID_PAGES');
  });

  it('splits (selected / each / ranges) and merges in the chosen order', async () => {
    const { staff, folder } = await setup();
    const file = await upload(staff.agent, folder.id, 'Paket.pdf', await textPdf('P', 5));
    const each = expectStatus(await staff.agent.post('/api/drive/pdf-tools/split').send({ nodeId: file.id, mode: 'each' }), 201).body.items;
    expect(each).toHaveLength(5);
    expect(each[0].name).toBe('Paket (s. 1).pdf');
    expect((await load(staff.agent, each[4].id)).getPageCount()).toBe(1);
    expect((await texts(staff.agent, each[4].id))[0]).toContain('P 5');

    const ranges = expectStatus(await staff.agent.post('/api/drive/pdf-tools/split').send({ nodeId: file.id, mode: 'ranges', ranges: '1-3, 4-5' }), 201).body.items;
    expect(ranges.map((i: { name: string }) => i.name)).toEqual(['Paket (s. 1-3).pdf', 'Paket (s. 4-5).pdf']);
    expect((await load(staff.agent, ranges[0].id)).getPageCount()).toBe(3);
    expect((await staff.agent.post('/api/drive/pdf-tools/split').send({ nodeId: file.id, mode: 'ranges', ranges: '4-9' })).body.error).toBe('INVALID_RANGES');

    const sel = expectStatus(await staff.agent.post('/api/drive/pdf-tools/split').send({ nodeId: file.id, mode: 'selected', pages: [4, 1], name: 'Auswahl' }), 201).body.items;
    expect(sel[0].name).toBe('Auswahl.pdf');
    const st = await texts(staff.agent, sel[0].id);
    expect(st[0]).toContain('P 5');
    expect(st[1]).toContain('P 2');

    const b = await upload(staff.agent, folder.id, 'B.pdf', await textPdf('B', 2));
    const img = await upload(staff.agent, folder.id, 'Scan.png', await stampPng(), 'image/png');
    const merged = expectStatus(await staff.agent.post('/api/drive/pdf-tools/merge').send({ ids: [b.id, img.id, file.id], name: 'Alles' }), 201).body.item;
    expect(merged).toMatchObject({ name: 'Alles.pdf', parentId: folder.id });
    const mt = await texts(staff.agent, merged.id);
    expect(mt).toHaveLength(8);
    expect(mt[0]).toContain('B 1');
    expect(mt[3]).toContain('P 1');
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_PDF_MERGE', target: `drive:${merged.id}` } })).toBe(1);
  });
});

describe('pdf tools: compress, HEIC', () => {
  it('makes a scanned PDF much smaller and under the target, and shrinks photos', async () => {
    const { staff, folder } = await setup();
    const scan = await scannedPdf(2);
    const file = await upload(staff.agent, folder.id, 'Scan.pdf', scan);
    const res = expectStatus(await staff.agent.post('/api/drive/pdf-tools/compress').send({ ids: [file.id], target: 'custom', maxBytes: 700_000, saveAs: 'copy' }), 200).body;
    const r = res.results[0];
    expect(r).toMatchObject({ ok: true, reached: true, before: scan.length, savedAs: 'copy' });
    expect(r.after).toBeLessThan(scan.length / 2);
    expect(r.after).toBeLessThanOrEqual(700_000);
    expect(r.name).toBe('Scan (kiçildilmiş).pdf');
    const out = await content(staff.agent, r.itemId);
    expect(out.length).toBe(r.after);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(xobjects(doc, 0)).toBe(1);

    // A tighter target steps quality / resolution down further.
    const tight = expectStatus(await staff.agent.post('/api/drive/pdf-tools/compress').send({ ids: [file.id], target: 'custom', maxBytes: 100_000, saveAs: 'copy' }), 200).body.results[0];
    expect(tight.ok).toBe(true);
    expect(tight.after).toBeLessThan(r.after);
    expect(tight.reached).toBe(tight.after <= 100_000);
    // Impossible target: says so and keeps the best (smallest) result.
    const impossible = await compressPdf(scan, 1000);
    expect(impossible.reached).toBe(false);
    expect(impossible.bytes.length).toBeLessThanOrEqual(tight.after);
    expect(impossible).toMatchObject({ dpi: 100, quality: 45, scanned: true });

    // As a new version of the file itself.
    const ver = expectStatus(await staff.agent.post('/api/drive/pdf-tools/compress').send({ ids: [file.id], target: 'portal2mb', saveAs: 'version' }), 200).body.results[0];
    expect(ver).toMatchObject({ ok: true, savedAs: 'version', itemId: file.id });
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: file.id } })).version).toBe(2);

    // A photo: max 2000 px, JPEG.
    const photo = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#335577', noise: { type: 'gaussian', mean: 120, sigma: 30 } } }).png().toBuffer();
    const p = await upload(staff.agent, folder.id, 'Foto.png', photo, 'image/png');
    const pr = expectStatus(await staff.agent.post('/api/drive/pdf-tools/compress').send({ ids: [p.id], target: 'email', saveAs: 'version' }), 200).body.results[0];
    expect(pr).toMatchObject({ ok: true, savedAs: 'copy', name: 'Foto (kiçildilmiş).jpg' });
    const meta = await sharp(await content(staff.agent, pr.itemId)).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 2000, height: 1500 });
    // …or as a PDF.
    const pdf = expectStatus(await staff.agent.post('/api/drive/pdf-tools/compress').send({ ids: [p.id], target: 'email', saveAs: 'copy', toPdf: true }), 200).body.results[0];
    expect(pdf.name).toMatch(/\.pdf$/);
    expect((await load(staff.agent, pdf.itemId)).getPageCount()).toBe(1);
  });

  it('HEIC: refuses files that are not HEIC (conversion needs a real HEIC image)', async () => {
    const { staff, folder } = await setup();
    const jpg = await upload(staff.agent, folder.id, 'Foto.jpg', await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer(), 'image/jpeg');
    expect((await staff.agent.post('/api/drive/pdf-tools/heic-to-jpg').send({ ids: [jpg.id] })).body.error).toBe('NOT_HEIC');
    const up = await staff.agent.post('/api/drive/pdf-tools/heic-upload').field('parentId', folder.id).attach('file', Buffer.from('not a heic'), { filename: 'IMG_1.HEIC', contentType: 'image/heic' });
    expect(up.status).toBe(400);
    expect(up.body.error).toBe('NOT_HEIC');
    // A HEIF header with garbage inside: recognised as HEIC, but undecodable.
    const fake = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.from([0, 0, 0, 0]), Buffer.from('mif1heic'), Buffer.alloc(200, 7)]);
    const bad = await staff.agent.post('/api/drive/pdf-tools/heic-upload').field('parentId', folder.id).attach('file', fake, { filename: 'IMG_2.heic', contentType: 'image/heic' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('HEIC_UNREADABLE');
  });
});

describe('pdf tools: watermark, redaction, stamps', () => {
  it('adds a watermark with Azerbaijani text that pdfjs can read (diagonal, footer, rotated pages, page ranges)', async () => {
    const { staff, folder } = await setup();
    const file = await upload(staff.agent, folder.id, 'Vertrag.pdf', await textPdf('Vertrag', 3, { rotate: 90 }));
    const res = expectStatus(await staff.agent.post('/api/drive/pdf-tools/watermark').send({ ids: [file.id], text: 'ENTWURF Şəhla', position: 'diagonal', opacity: 0.25, size: 60, color: '#c0392b', saveAs: 'copy' }), 200).body;
    expect(res.results[0]).toMatchObject({ ok: true, name: 'Vertrag (ENTWURF Şəhla).pdf' });
    const t = await texts(staff.agent, res.results[0].itemId);
    expect(t.every((s) => s.includes('ENTWURF Şəhla'))).toBe(true);
    expect(t[0]).toContain('Vertrag 1');

    const foot = expectStatus(await staff.agent.post('/api/drive/pdf-tools/watermark').send({ ids: [file.id], text: 'Nur für Triad Vision', position: 'footer', pages: '2-3', saveAs: 'version' }), 200).body;
    expect(foot.results[0]).toMatchObject({ ok: true, savedAs: 'version' });
    const ft = await texts(staff.agent, file.id);
    expect(ft[0]).not.toContain('Nur für Triad Vision');
    expect(ft[1]).toContain('Nur für Triad Vision');
    expect(ft[2]).toContain('Nur für Triad Vision');
  });

  it('redacts truly: listed pages become image-only, the hidden text is gone from the file, other pages keep text', async () => {
    const { staff, folder } = await setup();
    const file = await upload(staff.agent, folder.id, 'Pass.pdf', await textPdf('GEHEIM-4711', 2));
    const png = await sharp({ create: { width: 1654, height: 2339, channels: 3, background: '#ffffff' } })
      .composite([{ input: await sharp({ create: { width: 800, height: 120, channels: 3, background: '#000000' } }).png().toBuffer(), top: 380, left: 150 }])
      .png()
      .toBuffer();
    const res = expectStatus(await staff.agent.post('/api/drive/pdf-tools/redact').send({ nodeId: file.id, baseVersion: 1, pages: [{ index: 0, imagePng: png.toString('base64') }] }), 201).body;
    expect(res.item).toMatchObject({ name: 'Pass (gizlədilmiş).pdf' });
    const doc = await load(staff.agent, res.item.id);
    expect(doc.getPageCount()).toBe(2);
    expect(fonts(doc, 0)).toBe(0);
    expect(xobjects(doc, 0)).toBe(1);
    expect(fonts(doc, 1)).toBe(1);
    const t = await texts(staff.agent, res.item.id);
    expect(t[0].trim()).toBe('');
    expect(t[1]).toContain('GEHEIM-4711 2');
    expect(allStreams(doc)).not.toContain('GEHEIM-4711 1');
    // The original is untouched.
    expect((await texts(staff.agent, file.id))[0]).toContain('GEHEIM-4711 1');

    // Multipart variant, saved as a version.
    const mp = await staff.agent
      .post('/api/drive/pdf-tools/redact')
      .field('meta', JSON.stringify({ nodeId: file.id, baseVersion: 1, pages: [{ index: 1 }], saveAs: 'version' }))
      .attach('page_1', png, { filename: 'p1.png', contentType: 'image/png' });
    expect(mp.status).toBe(200);
    expect(mp.body.version).toBe(2);
    expect(fonts(await load(staff.agent, file.id), 1)).toBe(0);
    expect((await staff.agent.post('/api/drive/pdf-tools/redact').send({ nodeId: file.id, baseVersion: 2, pages: [{ index: 0, imagePng: Buffer.from('nope').toString('base64') }] })).body.error).toBe('UNSUPPORTED_IMAGE');
  });

  it('manages stamps in Vorlagen and embeds them at the exact position (also on rotated pages) with a date', async () => {
    const { staff, folder } = await setup();
    const added = expectStatus(await staff.agent.post('/api/drive/pdf-tools/stamps').send({ name: 'Firmenstempel', imagePng: (await stampPng()).toString('base64') }), 201).body.item;
    expect(added.name).toBe('Firmenstempel.png');
    const lib = expectStatus(await staff.agent.get('/api/drive/pdf-tools/stamps'), 200).body;
    expect(lib.canAdd).toBe(true);
    expect(lib.items.map((i: { id: string }) => i.id)).toContain(added.id);
    const stampsFolder = await prisma.driveNode.findUniqueOrThrow({ where: { id: lib.folderId }, include: { parent: true } });
    expect(stampsFolder.name).toBe('Stempel & Unterschriften');
    expect(stampsFolder.parent?.name).toBe('Vorlagen');
    expect((await staff.agent.post('/api/drive/pdf-tools/stamps').send({ name: 'x', imagePng: (await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64') })).body.error).toBe('PNG_REQUIRED');

    const plain = await upload(staff.agent, folder.id, 'Rechnung.pdf', await textPdf('Rechnung', 1));
    const res = expectStatus(
      await staff.agent.post('/api/drive/pdf-tools/stamp').send({ nodeId: plain.id, baseVersion: 1, items: [{ page: 0, x: 100, y: 50, width: 120, height: 60, imageNodeId: added.id, dateText: '21.10.2026' }] }),
      200,
    ).body;
    expect(res.version).toBe(2);
    const doc = await load(staff.agent, plain.id);
    expect(xobjects(doc, 0)).toBe(1);
    // Top-left (100, 50) of a 120×60 box on A4 → bottom-left corner at (100, 841.89 − 110).
    expect(pageContent(doc, 0)).toMatch(/1 0 0 1 100 731\.89\d* cm/);
    expect((await texts(staff.agent, plain.id))[0]).toContain('21.10.2026');
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_PDF_STAMP', target: `drive:${plain.id}` } })).toBe(1);

    const rotated = await upload(staff.agent, folder.id, 'Quer.pdf', await textPdf('Quer', 1, { rotate: 90 }));
    expectStatus(await staff.agent.post('/api/drive/pdf-tools/stamp').send({ nodeId: rotated.id, baseVersion: 1, items: [{ page: 0, x: 100, y: 50, width: 120, height: 60, imageNodeId: added.id }] }), 200);
    // Visual (100, 595.28 − 110) on a page shown rotated by 90° → user space (595.28 − 485.28, 100).
    expect(pageContent(await load(staff.agent, rotated.id), 0)).toMatch(/1 0 0 1 110(\.0+\d*)? 100 cm/);

    expect((await staff.agent.post('/api/drive/pdf-tools/stamp').send({ nodeId: rotated.id, baseVersion: 2, items: [{ page: 0, x: 800, y: 50, width: 120, height: 60, imageNodeId: added.id }] })).body.error).toBe('OUT_OF_PAGE');
  });
});

describe('pdf tools: permissions, lock, final, conflicts', () => {
  it('VIEW-only 403, locked 423, final 423, stale base version 409', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const other = await asStaff();
    const { shared } = await roots(su.agent);
    const locked = await mkdir(su.agent, shared.id, 'Nur lesen');
    expectStatus(await su.agent.patch(`/api/drive/nodes/${locked.id}/inheritance`).send({ inherit: false }), 200);
    const file = await upload(su.agent, locked.id, 'Geheim.pdf', await textPdf('X', 2));
    expectStatus(await su.agent.put(`/api/drive/nodes/${locked.id}/grants`).send({ userId: staff.user.id, access: 'VIEW' }), 200);

    expect((await staff.agent.post(`/api/drive/pdf-tools/${file.id}/apply`).send({ baseVersion: 1, ops: [{ type: 'rotate', pages: [0], angle: 90 }] })).status).toBe(403);
    expect((await staff.agent.post(`/api/drive/pdf-tools/${file.id}/apply`).send({ baseVersion: 1, ops: [{ type: 'rotate', pages: [0], angle: 90 }], saveAs: 'copy' })).status).toBe(403);
    expect((await staff.agent.post('/api/drive/pdf-tools/split').send({ nodeId: file.id, mode: 'each' })).status).toBe(403);
    expect((await staff.agent.post('/api/drive/pdf-tools/watermark').send({ ids: [file.id], text: 'KOPIE' })).status).toBe(403);
    expect((await other.agent.get(`/api/drive/pdf-tools/${file.id}/info`)).status).toBe(404);

    // Lock held by someone else: the file cannot get a new version, a copy is fine.
    const { folder } = await (async () => ({ folder: await mkdir(staff.agent, shared.id, 'Team') }))();
    const doc = await upload(staff.agent, folder.id, 'Brief.pdf', await textPdf('Brief', 2));
    expectStatus(await other.agent.post(`/api/drive/collab/lock/${doc.id}`), 200);
    const blocked = await staff.agent.post(`/api/drive/pdf-tools/${doc.id}/apply`).send({ baseVersion: 1, ops: [{ type: 'delete', pages: [1] }] });
    expect(blocked.status).toBe(423);
    expect(blocked.body.error).toBe('FILE_LOCKED');
    expect((await staff.agent.post('/api/drive/pdf-tools/watermark').send({ ids: [doc.id], text: 'KOPIE', saveAs: 'version' })).status).toBe(423);
    expectStatus(await staff.agent.post(`/api/drive/pdf-tools/${doc.id}/apply`).send({ baseVersion: 1, ops: [{ type: 'delete', pages: [1] }], saveAs: 'copy' }), 201);
    expectStatus(await other.agent.delete(`/api/drive/collab/lock/${doc.id}`), 200);

    // Stale base version.
    expectStatus(await staff.agent.post(`/api/drive/pdf-tools/${doc.id}/apply`).send({ baseVersion: 1, ops: [{ type: 'rotate', pages: [0], angle: 180 }] }), 200);
    const stale = await staff.agent.post(`/api/drive/pdf-tools/${doc.id}/apply`).send({ baseVersion: 1, ops: [{ type: 'rotate', pages: [0], angle: 90 }] });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'VERSION_CONFLICT', currentVersion: 2 });
    expect((await staff.agent.post('/api/drive/pdf-tools/redact').send({ nodeId: doc.id, baseVersion: 1, pages: [{ index: 0, imagePng: (await stampPng()).toString('base64') }] })).status).toBe(409);

    // Final: no version, no stamp (not even as a copy); the info says so.
    await prisma.driveNode.update({ where: { id: doc.id }, data: { finalAt: new Date() } });
    const fin = await staff.agent.post(`/api/drive/pdf-tools/${doc.id}/apply`).send({ baseVersion: 2, ops: [{ type: 'rotate', pages: [0], angle: 90 }] });
    expect(fin.status).toBe(423);
    expect(fin.body.error).toBe('FILE_FINAL');
    const st = await staff.agent.post('/api/drive/pdf-tools/stamps').send({ name: 'Sig', imagePng: (await stampPng()).toString('base64') });
    const stamped = await staff.agent.post('/api/drive/pdf-tools/stamp').send({ nodeId: doc.id, baseVersion: 2, saveAs: 'copy', items: [{ page: 0, x: 10, y: 10, width: 50, height: 25, imageNodeId: st.body.item.id }] });
    expect(stamped.status).toBe(423);
    expect((await staff.agent.post('/api/drive/pdf-tools/compress').send({ ids: [doc.id], target: 'email', saveAs: 'version' })).status).toBe(423);
    expect(expectStatus(await staff.agent.get(`/api/drive/pdf-tools/${doc.id}/info`), 200).body).toMatchObject({ final: true, canEdit: false });
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: doc.id } })).version).toBe(2);
  });
});
