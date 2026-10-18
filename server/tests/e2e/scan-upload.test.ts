import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { anon, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser, PNG_BUFFER, SAMPLE } from '../helpers/files';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';
import { fakeJpeg } from './passport-scan.fixtures';
import { A4 } from '../../src/lib/scan/pdf.js';

const privateDir = path.join(TEST_UPLOADS_DIR, 'private');
const incoming = path.join(privateDir, '.scan-incoming');

type Req = { id: string; key: string | null; stage: string };

const setup = async () => {
  const client = await asClient();
  const c = await createCaseVia(client.agent);
  const reqs = (await clientCase(client.agent, c.id)).requirements as unknown as Req[];
  return { client, c, passport: reqs.find((r) => r.key === 'PASSPORT')!, reqs };
};

const scan = (agent: Agent, caseId: string, fields: Record<string, string>, pages: { data: Buffer; name: string; type: string }[]) => {
  const req = agent.post(`/api/cases/${caseId}/documents/scan`);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  for (const p of pages) req.attach('pages', p.data, { filename: p.name, contentType: p.type });
  return req;
};

const png = (i = 1) => ({ data: PNG_BUFFER, name: `p${i}.png`, type: 'image/png' });
/** Header-only baseline JPEG (SOI, APP0, SOF0 with 3 components): enough for pdf-lib, which embeds JPEG bytes as they are. */
const jpegOf = (w: number, h: number) => {
  const b = fakeJpeg(w, h);
  b[2 + 18 + 9] = 3; // SOF0: number of components (YCbCr)
  return b;
};
const jpg = (w: number, h: number, i = 1) => ({ data: jpegOf(w, h), name: `p${i}.jpg`, type: 'image/jpeg' });

const stored = async (docId: string) => {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
  return { doc, pdf: await PDFDocument.load(fs.readFileSync(path.join(privateDir, doc.storedName))) };
};

describe('POST /api/cases/:caseId/documents/scan', () => {
  it('turns page images into one PDF case document (A4, one page per image, in order)', async () => {
    const { client, c, passport } = await setup();
    const res = expectStatus(await scan(client.agent, c.id, { requirementId: passport.id, name: 'Pasport' }, [jpg(1200, 1600, 1), png(2), jpg(1600, 900, 3)]), 201);
    expect(res.body.pages).toBe(3);
    expect(res.body.document).toMatchObject({ caseId: c.id, requirementId: passport.id, stage: 'INITIAL', status: 'PENDING', mimeType: 'application/pdf', originalName: 'Pasport.pdf' });
    expect(res.body.checks).toMatchObject({ level: 'ok' });

    const { doc, pdf } = await stored(res.body.document.id);
    expect(pdf.getPageCount()).toBe(3);
    const [p1, , p3] = pdf.getPages();
    expect(p1.getWidth()).toBeCloseTo(A4.width);
    expect(p1.getHeight()).toBeCloseTo(A4.height);
    expect(p3.getWidth()).toBeCloseTo(A4.height); // landscape image → landscape page
    expect(doc.size).toBe(fs.statSync(path.join(privateDir, doc.storedName)).size);
    expect(doc.uploadedById).toBe(client.user.id);

    // The client sees it on the case and can download it like any other upload.
    const detail = await clientCase(client.agent, c.id);
    expect(detail.requirements.find((r) => r.id === passport.id)!.documents.map((d) => d.id)).toContain(doc.id);
    const file = await client.agent.get(`/api/files/${doc.id}`).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const ev = await prisma.caseEvent.findFirst({ where: { caseId: c.id, type: 'DOCUMENT_UPLOADED' }, orderBy: { createdAt: 'desc' } });
    expect(ev?.note).toBe('Pasport.pdf (3)');
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_SCAN_UPLOADED', target: doc.id } })).toBe(1);
    // Page images are never kept.
    expect(fs.existsSync(incoming) ? fs.readdirSync(incoming) : []).toHaveLength(0);
  });

  it('default name and the existing upload route are unchanged', async () => {
    const { client, c, passport } = await setup();
    const res = expectStatus(await scan(client.agent, c.id, { requirementId: passport.id }, [png()]), 201);
    expect(res.body.document.originalName).toMatch(/^scan-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect((await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', passport.id)).status).toBe(400);
  });

  it('ownership: someone else’s case is 404, anonymous 401, wrong requirement 400, closed upload step 409', async () => {
    const { client, c, passport } = await setup();
    const stranger = await asClient();
    expect((await anon().post(`/api/cases/${c.id}/documents/scan`)).status).toBe(401);
    expect((await scan(stranger.agent, c.id, { requirementId: passport.id }, [png()])).status).toBe(404);
    expect((await scan(client.agent, 'nope', { requirementId: passport.id }, [png()])).status).toBe(404);
    expect((await scan(client.agent, c.id, {}, [png()])).status).toBe(400);
    const other = await setup();
    expect((await scan(client.agent, c.id, { requirementId: other.passport.id }, [png()])).body.error).toBe('INVALID_REQUIREMENT');
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_REVIEW' } });
    expect((await scan(client.agent, c.id, { requirementId: passport.id }, [png()])).status).toBe(409);
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(0);
  });

  it('staff may scan into any case: accepted, any open stage; needs a requirement for INITIAL/EMBASSY', async () => {
    const { c, passport } = await setup();
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_REVIEW' } });
    const staff = await asStaff();
    const res = expectStatus(await scan(staff.agent, c.id, { requirementId: passport.id }, [png(), png(2)]), 201);
    expect(res.body.document).toMatchObject({ status: 'ACCEPTED', stage: 'INITIAL', uploadedById: staff.user.id });
    expect((await stored(res.body.document.id)).pdf.getPageCount()).toBe(2);
    const visa = expectStatus(await scan(staff.agent, c.id, { stage: 'VISA', name: 'Visa' }, [png()]), 201);
    expect(visa.body.document).toMatchObject({ stage: 'VISA', requirementId: null, status: 'ACCEPTED' });
    expect((await scan(staff.agent, c.id, { stage: 'EMBASSY' }, [png()])).body.error).toBe('REQUIREMENT_REQUIRED');
    expect((await scan(staff.agent, c.id, { stage: 'CONTRACT' }, [png()])).status).toBe(400);
    expect((await scan(staff.agent, c.id, {}, [png()])).body.error).toBe('INVALID_STAGE');

    const noTotp = await asStaff({ twoFactor: false });
    expect((await scan(noTotp.agent, c.id, { requirementId: passport.id }, [png()])).status).toBe(403);
  });

  it('limits: no pages, more than 20 pages, wrong types, fake image bytes, unreadable images', async () => {
    const { client, c, passport } = await setup();
    const f = { requirementId: passport.id };
    expect((await scan(client.agent, c.id, f, [])).body.error).toBe('PAGES_REQUIRED');
    const many = Array.from({ length: 21 }, (_, i) => png(i + 1));
    const tooMany = await scan(client.agent, c.id, f, many);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toBe('TOO_MANY_PAGES');
    expectStatus(await scan(client.agent, c.id, f, many.slice(0, 20)), 201);
    expect((await scan(client.agent, c.id, f, [{ data: SAMPLE.webp, name: 'a.webp', type: 'image/webp' }])).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await scan(client.agent, c.id, f, [{ data: Buffer.from('%PDF-1.4'), name: 'a.pdf', type: 'application/pdf' }])).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await scan(client.agent, c.id, f, [{ data: SAMPLE.txt, name: 'a.png', type: 'image/png' }])).body.error).toBe('FILE_CONTENT_MISMATCH');
    // JPEG magic bytes but no frame header: pdf-lib cannot read it.
    expect((await scan(client.agent, c.id, f, [png(), { data: SAMPLE.jpg, name: 'b.jpg', type: 'image/jpeg' }])).body.error).toBe('INVALID_IMAGE');
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(1);
    expect(fs.existsSync(incoming) ? fs.readdirSync(incoming) : []).toHaveLength(0);
  });
});
