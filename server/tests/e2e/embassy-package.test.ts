import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { DocStage, DocStatus } from '@prisma/client';
import { anon, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { binaryParser, PNG_BUFFER } from '../helpers/files';
import { pdfPagesText } from '../helpers/pdfText';
import { config } from '../../src/config.js';
import { createCase } from '../../src/lib/caseFlow.js';
import { createRequirements } from '../../src/lib/docsIntel/requirementTemplates.js';
import { jpegOrientation, orientationRotation } from '../../src/lib/caseNext/image.js';
import { clearCaseAiSettingsCache } from '../../src/lib/ai/features/caseAi/config.js';

// ─── Fixtures ────────────────────────────────────────────────────────

/** Smallest baseline JPEG (1×1); the SOF0 size is patched — pdf-lib embeds JPEGs without decoding them. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

const jpeg = (width: number, height: number, orientation?: number) => {
  const buf = Buffer.from(TINY_JPEG);
  const sof = buf.indexOf(Buffer.from([0xff, 0xc0]));
  buf.writeUInt16BE(height, sof + 5);
  buf.writeUInt16BE(width, sof + 7);
  if (!orientation) return buf;
  // APP1 Exif, little endian TIFF, IFD0 with one entry: Orientation (0x0112, SHORT, 1) = orientation.
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([buf.subarray(0, 2), app1, payload, buf.subarray(2)]);
};

const pdf = async (label: string, pages = 1, size: [number, number] = [595.28, 841.89]) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage(size).drawText(`${label} ${i + 1}`, { x: 50, y: 500, size: 18, font });
  return Buffer.from(await doc.save());
};

const writeUpload = async (buf: Buffer, ext: string) => {
  const storedName = `embpkg-${crypto.randomBytes(8).toString('hex')}${ext}`;
  await fs.mkdir(config.uploads.privateDir, { recursive: true });
  await fs.writeFile(path.join(config.uploads.privateDir, storedName), buf);
  return storedName;
};

type Reqs = Awaited<ReturnType<typeof prisma.documentRequirement.findMany>>;

const addDoc = async (caseId: string, reqs: Reqs, key: string, buf: Buffer, opts: { mime: string; name: string; status: DocStatus; uploadedById: string; ageMin?: number }) => {
  const r = reqs.find((x) => x.key === key)!;
  return prisma.document.create({
    data: {
      caseId,
      requirementId: r.id,
      stage: r.stage as DocStage,
      originalName: opts.name,
      storedName: await writeUpload(buf, path.extname(opts.name)),
      mimeType: opts.mime,
      size: buf.length,
      status: opts.status,
      uploadedById: opts.uploadedById,
      createdAt: new Date(Date.now() - (opts.ageMin ?? 0) * 60_000),
      ...(opts.status === 'REJECTED' ? { reviewNote: 'unscharf' } : {}),
    },
  });
};

/**
 * WORK case at EMBASSY_REVIEW with: VIDEX (2-page PDF), passport (accepted JPEG + newer REJECTED PDF),
 * 2 photos (PNG), CV (US-Letter PDF), insurance pending only, diploma rejected only, driving licence (extra).
 */
const setup = async () => {
  clearCaseAiSettingsCache();
  const { user: client } = await createClient({ firstName: 'Elvin', lastName: 'Məmmədov', locale: 'de' });
  await prisma.user.update({ where: { id: client.id }, data: { passportNumber: 'C01234567' } });
  const c = await createCase(client.id, { profession: 'LKW sürücüsü', visaType: 'WORK' });
  await prisma.$transaction((tx) => createRequirements(tx, c.id, 'EMBASSY', null));
  await prisma.case.update({ where: { id: c.id }, data: { status: 'EMBASSY_REVIEW', appointmentAt: new Date('2026-11-03T06:30:00Z'), appointmentPlace: 'Deutsche Botschaft Baku' } });
  const reqs = await prisma.documentRequirement.findMany({ where: { caseId: c.id } });
  const by = client.id;
  const docs = {
    videx: await addDoc(c.id, reqs, 'VIDEX', await pdf('VIDEX', 2), { mime: 'application/pdf', name: 'videx.pdf', status: 'ACCEPTED', uploadedById: by }),
    passport: await addDoc(c.id, reqs, 'PASSPORT', jpeg(400, 200, 6), { mime: 'image/jpeg', name: 'pass.jpg', status: 'ACCEPTED', uploadedById: by, ageMin: 30 }),
    passportRejected: await addDoc(c.id, reqs, 'PASSPORT', await pdf('PASS REJECTED'), { mime: 'application/pdf', name: 'pass-new.pdf', status: 'REJECTED', uploadedById: by }),
    photos: await addDoc(c.id, reqs, 'PHOTO_2', PNG_BUFFER, { mime: 'image/png', name: 'fotos.png', status: 'ACCEPTED', uploadedById: by }),
    cv: await addDoc(c.id, reqs, 'CV', await pdf('LEBENSLAUF', 1, [612, 792]), { mime: 'application/pdf', name: 'cv.pdf', status: 'ACCEPTED', uploadedById: by }),
    insurance: await addDoc(c.id, reqs, 'HEALTH_INSURANCE', await pdf('VERSICHERUNG'), { mime: 'application/pdf', name: 'kv.pdf', status: 'PENDING', uploadedById: by }),
    diploma: await addDoc(c.id, reqs, 'DIPLOMA', await pdf('DIPLOM'), { mime: 'application/pdf', name: 'diplom.pdf', status: 'REJECTED', uploadedById: by }),
    licence: await addDoc(c.id, reqs, 'DRIVING_LICENCE', jpeg(300, 200), { mime: 'image/jpeg', name: 'fuehrerschein.jpg', status: 'ACCEPTED', uploadedById: by }),
  };
  return { client, c, reqs, docs };
};

type Item = { key: string; source: string; status: string; include: boolean; document: { id: string } | null; candidates: { id: string; status: string }[]; requirementId: string | null };

const preview = async (agent: Awaited<ReturnType<typeof asStaff>>['agent'], caseId: string) =>
  expectStatus(await agent.get(`/api/admin/cases/${caseId}/embassy-package`), 200).body.preview as { items: Item[]; summary: Record<string, number>; maxBytes: number; lastPackage: unknown };

const download = async (agent: Awaited<ReturnType<typeof asStaff>>['agent'], docId: string) =>
  expectStatus(await agent.get(`/api/files/${docId}?download=1`).buffer(true).parse(binaryParser), 200).body as Buffer;

afterEach(() => {
  delete process.env.EMBASSY_PACKAGE_MAX_MB;
});

// ─── Unit: EXIF ──────────────────────────────────────────────────────

describe('embassy package: image orientation', () => {
  it('reads the EXIF orientation of JPEGs', () => {
    expect(jpegOrientation(jpeg(10, 10))).toBe(1);
    expect(jpegOrientation(jpeg(10, 10, 6))).toBe(6);
    expect(jpegOrientation(jpeg(10, 10, 8))).toBe(8);
    expect(jpegOrientation(Buffer.from('not a jpeg'))).toBe(1);
    expect([1, 3, 6, 8].map(orientationRotation)).toEqual([0, 180, 90, 270]);
  });
});

// ─── Preview ─────────────────────────────────────────────────────────

describe('embassy package: preview checklist', () => {
  it('maps the visa type checklist to the case documents (found / pending / missing / manual)', async () => {
    const staff = await asStaff();
    const { c, docs } = await setup();
    const p = await preview(staff.agent, c.id);
    const item = (k: string) => p.items.find((i) => i.key === k)!;

    // WORK checklist order (caseAi/config.ts DEFAULT_CHECKLISTS) comes first.
    expect(p.items.filter((i) => i.source === 'checklist').map((i) => i.key)).toEqual(['videx', 'passport', 'photos', 'contract', 'declaration', 'recognition', 'diplomas', 'ba', 'cv', 'german', 'insurance', 'fee']);
    expect(item('videx')).toMatchObject({ status: 'found', include: true, document: { id: docs.videx.id } });
    // The newer rejected passport is never a candidate; the accepted one is used.
    expect(item('passport')).toMatchObject({ status: 'found', document: { id: docs.passport.id } });
    expect(item('passport').candidates.map((d) => d.id)).toEqual([docs.passport.id]);
    expect(item('insurance')).toMatchObject({ status: 'pending', include: false, document: { id: docs.insurance.id } });
    expect(item('diplomas')).toMatchObject({ status: 'missing', include: false, document: null });
    expect(item('contract').status).toBe('missing');
    expect(item('declaration').status).toBe('manual');
    // A document the checklist does not name is offered (INITIAL stage → off by default).
    const extra = p.items.find((i) => i.source === 'extra')!;
    expect(extra).toMatchObject({ status: 'found', include: false, document: { id: docs.licence.id } });
    expect(p.summary).toEqual({ found: 4, pending: 1, missing: 4, manual: 3 });
  });
});

// ─── Build ───────────────────────────────────────────────────────────

describe('embassy package: build', () => {
  it('builds cover + contents + documents in checklist order, A4, rejected skipped, saved as a case Document', async () => {
    const staff = await asStaff();
    const { c, docs } = await setup();

    const res = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({ separators: false }), 201).body;
    // cover (1) + contents (1) + VIDEX 2 + passport 1 + photos 1 + CV 1
    expect(res.pages).toBe(7);
    expect(res.format).toBe('pdf');
    expect(res.entries.map((e: { key: string }) => e.key)).toEqual(['videx', 'passport', 'photos', 'cv']);
    expect(res.entries.map((e: { startPage: number }) => e.startPage)).toEqual([3, 5, 6, 7]);
    expect(res.entries.find((e: { key: string }) => e.key === 'passport').documentId).toBe(docs.passport.id);
    expect(res.notIncluded.map((i: { key: string; status: string }) => `${i.key}:${i.status}`)).toEqual(
      expect.arrayContaining(['insurance:pending', 'diplomas:missing', 'contract:missing', 'declaration:manual']),
    );

    // Saved as an EMBASSY document named <Surname>_<Firstname>_Botschaft_<date>.pdf
    expect(res.document).toMatchObject({ stage: 'EMBASSY', mimeType: 'application/pdf' });
    expect(res.document.originalName).toMatch(/^Mammadov_Elvin_Botschaft_\d{4}-\d{2}-\d{2}\.pdf$/);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: res.document.id } });
    expect(row).toMatchObject({ caseId: c.id, status: 'ACCEPTED', requirementId: null, size: res.sizeBytes, uploadedById: staff.user.id });

    const file = await download(staff.agent, res.document.id);
    const doc = await PDFDocument.load(file);
    expect(doc.getPageCount()).toBe(7);
    // Every page is A4 (portrait or landscape); the US-Letter CV was scaled onto A4.
    for (const p of doc.getPages()) {
      const { width, height } = p.getSize();
      expect([Math.round(Math.min(width, height)), Math.round(Math.max(width, height))]).toEqual([595, 842]);
    }
    // The 400×200 passport photo has EXIF orientation 6 → drawn upright on a PORTRAIT page.
    const passPage = doc.getPage(4).getSize();
    expect(passPage.height).toBeGreaterThan(passPage.width);

    const texts = await pdfPagesText(file);
    expect(texts[0]).toContain('Antragsunterlagen');
    expect(texts[0]).toContain('MEMMEDOV, Elvin'); // standard fonts: transliterated
    expect(texts[0]).toContain('C01234567');
    expect(texts[0]).toContain(c.number);
    expect(texts[1]).toContain('Inhaltsverzeichnis');
    expect(texts[1]).toContain('Separat vorzulegen');
    expect(texts[2]).toContain('VIDEX 1');
    expect(texts.join('\n')).not.toContain('PASS REJECTED');

    // Timeline + audit; the package shows among the case's other documents and is never packed again.
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'EMBASSY_PACKAGE_BUILT' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'EMBASSY_PACKAGE_BUILT', target: c.id } })).toBe(1);
    const detail = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}`), 200).body.case;
    expect(detail.otherDocuments.map((d: { id: string }) => d.id)).toContain(res.document.id);
    const again = await preview(staff.agent, c.id);
    expect(again.lastPackage).toMatchObject({ documentId: res.document.id });
    expect(again.items.flatMap((i) => i.candidates.map((d) => d.id))).not.toContain(res.document.id);
  });

  it('adds a separator sheet per document by default', async () => {
    const staff = await asStaff();
    const { c } = await setup();
    const res = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({}), 201).body;
    expect(res.pages).toBe(7 + 4);
    const texts = await pdfPagesText(await download(staff.agent, res.document.id));
    expect(texts[2]).toContain('Unterlage 1 von 4');
  });

  it('follows the chosen order, include toggles, copies and an explicitly chosen pending document', async () => {
    const staff = await asStaff();
    const { c, docs } = await setup();
    const res = expectStatus(
      await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({
        separators: false,
        items: [
          { key: 'cv', include: true },
          { key: 'passport', include: true, copies: 2 },
          { key: 'insurance', include: true, documentId: docs.insurance.id },
          { key: 'photos', include: false },
        ],
      }),
      201,
    ).body;
    // listed first (cv, passport ×2, insurance), then the remaining defaults (videx)
    expect(res.entries.map((e: { key: string }) => e.key)).toEqual(['cv', 'passport', 'insurance', 'videx']);
    expect(res.entries[1]).toMatchObject({ copies: 2, startPage: 4, endPage: 5 });
    expect(res.pages).toBe(2 + 1 + 2 + 1 + 2);

    // A rejected document can never be forced in.
    const bad = await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({ items: [{ key: 'passport', include: true, documentId: docs.passportRejected.id }] });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('INVALID_DOCUMENT');
  });

  it('copies setting duplicates every document', async () => {
    const staff = await asStaff();
    const { c } = await setup();
    const res = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({ separators: false, copies: 2 }), 201).body;
    expect(res.pages).toBe(2 + 2 * 5);
  });

  it('separate PDFs per section as ZIP', async () => {
    const staff = await asStaff();
    const { c } = await setup();
    const res = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({ format: 'zip' }), 201).body;
    expect(res.document.mimeType).toBe('application/zip');
    expect(res.document.originalName).toMatch(/_Botschaft_\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = await JSZip.loadAsync(await download(staff.agent, res.document.id));
    const names = Object.keys(zip.files).sort();
    expect(names).toHaveLength(5);
    expect(names[0]).toBe('00_Deckblatt_Inhalt.pdf');
    expect(names[1]).toMatch(/^01_VIDEX/);
    const videx = await PDFDocument.load(await zip.file(names[1])!.async('nodebuffer'));
    expect(videx.getPageCount()).toBe(1 + 2); // separator + 2 pages
  });

  it('refuses packages over the size cap with a clear error', async () => {
    const staff = await asStaff();
    const { c } = await setup();
    process.env.EMBASSY_PACKAGE_MAX_MB = '0.0005';
    const res = await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({});
    expect(res.status).toBe(413);
    expect(JSON.stringify(res.body)).toContain('PACKAGE_TOO_LARGE');
    expect(await prisma.document.count({ where: { caseId: c.id, originalName: { contains: '_Botschaft_' } } })).toBe(0);
  });

  it('nothing to build without accepted documents', async () => {
    const staff = await asStaff();
    const { user: client } = await createClient();
    const c = await createCase(client.id, { profession: 'Koch', visaType: 'WORK' });
    const res = await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({});
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('NOTHING_TO_BUILD');
  });
});

// ─── Request missing ─────────────────────────────────────────────────

describe('embassy package: request missing from the client', () => {
  it('creates / reminds requirements and sends ONE notification', async () => {
    const staff = await asStaff();
    const { c, client, reqs } = await setup();
    const before = await prisma.documentRequirement.count({ where: { caseId: c.id } });
    const res = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/embassy-package/request`).send({ keys: ['diplomas', 'contract', 'declaration', 'videx'] }), 201).body;
    // videx is already there → ignored; diploma & signed contract exist as requirements → reminders; declaration → new requirement
    expect(res.requested).toHaveLength(3);
    const byId = new Map(res.requested.map((r: { requirementId: string; created: boolean }) => [r.requirementId, r.created]));
    expect(byId.get(reqs.find((r) => r.key === 'DIPLOMA')!.id)).toBe(false);
    expect(byId.get(reqs.find((r) => r.key === 'SIGNED_CONTRACT')!.id)).toBe(false);
    expect(await prisma.documentRequirement.count({ where: { caseId: c.id } })).toBe(before + 1);
    const created = await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: c.id, createdAt: { gte: new Date(Date.now() - 60_000) }, key: null } });
    expect((created.title as { de: string }).de).toContain('Erklärung zum Beschäftigungsverhältnis');
    const notes = await prisma.notification.findMany({ where: { userId: client.id, type: 'DOCUMENT_REQUESTED' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Unterlagen angefordert'); // client locale de
    expect(notes[0].body).toContain('Erklärung zum Beschäftigungsverhältnis');
    expect(res.preview.items.find((i: Item) => i.key === 'declaration').status).toBe('missing');
  });
});

// ─── Authorization ───────────────────────────────────────────────────

describe('embassy package: authorization', () => {
  it('only staff (admin area) can preview, build and request', async () => {
    const { c } = await setup();
    const client = await asClient();
    for (const [method, url] of [
      ['get', `/api/admin/cases/${c.id}/embassy-package`],
      ['post', `/api/admin/cases/${c.id}/embassy-package`],
      ['post', `/api/admin/cases/${c.id}/embassy-package/request`],
    ] as const) {
      expect((await anon()[method](url).send({})).status, url).toBe(401);
      expect((await client.agent[method](url).send({ keys: ['diplomas'] })).status, url).toBe(403);
    }
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/cases/does-not-exist/embassy-package')).status).toBe(404);
    expect(await prisma.document.count({ where: { caseId: c.id, originalName: { contains: '_Botschaft_' } } })).toBe(0);
  });
});
