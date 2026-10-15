import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The OCR language data must not be picked up from a developer's server/ocr: point the loader at an empty dir
// before the app (and with it src/lib/docsIntel/ocr.ts) is imported.
await vi.hoisted(async () => {
  const [fs, os, path] = await Promise.all([import('node:fs'), import('node:os'), import('node:path')]);
  const dir = path.join(os.tmpdir(), 'triad-vision-test-ocr-empty');
  fs.mkdirSync(dir, { recursive: true });
  process.env.TESSERACT_LANG_PATH = dir;
});

import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createVisaCategory, l10n } from '../helpers/factories';
import { binaryParser, makePdf, pageCount, PDF, PNG_BUFFER } from '../helpers/files';
import { pdfPagesText } from '../helpers/pdfText';
import { clientCase, createCaseVia, driveCaseTo, expectStatus, uploadDoc } from '../helpers/workflow';
import { parseMrz } from '../../src/lib/docsIntel/mrz.js';
import type { Prisma } from '@prisma/client';

/** Requirement rows as the API returns them (the workflow helper's type only lists the workflow fields). */
type ReqRow = { key: string | null; title: { az: string }; required: boolean; sortOrder: number };
const rows = (reqs: unknown[]) => reqs as ReqRow[];

const SPECIMEN = parseMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10', new Date('2026-10-15T00:00:00Z'));

// Global templates are not visa-bound, so resetDb's visa-category cascade does not remove them.
beforeEach(() => prisma.requirementTemplate.deleteMany());
afterEach(() => prisma.requirementTemplate.deleteMany());

const template = (over: Record<string, unknown> = {}) => ({
  visaCategoryId: null,
  stage: 'INITIAL',
  key: 'PASSPORT',
  title: l10n('Passport'),
  description: l10n('Valid 12 months'),
  required: true,
  ...over,
});

// ─── Admin: requirement templates ──────────────────────────────────────

describe('/api/admin/requirements', () => {
  it('staff can read, only admins can write', async () => {
    const staff = await asStaff();
    const client = await asClient();
    expect((await client.agent.get('/api/admin/requirements')).status).toBe(403);
    const res = await staff.agent.get('/api/admin/requirements');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ visaCategories: [], templates: { global: { INITIAL: [], EMBASSY: [] }, byVisa: {} } });
    expect(res.body.keys).toContain('PASSPORT');
    expect(res.body.builtIn.INITIAL).toHaveLength(7);
    expect((await staff.agent.post('/api/admin/requirements').send(template())).status).toBe(403);
    expect((await staff.agent.post('/api/admin/requirements/seed-defaults')).status).toBe(403);
  });

  it('CRUD + reorder with audit entries', async () => {
    const admin = await asAdmin();
    const a = expectStatus(await admin.agent.post('/api/admin/requirements').send(template()), 201).body.template;
    const b = expectStatus(await admin.agent.post('/api/admin/requirements').send(template({ key: 'photo', title: l10n('Photo'), description: { az: '', de: '', en: '', ru: '' }, required: false })), 201).body.template;
    expect(a).toMatchObject({ visaCategoryId: null, stage: 'INITIAL', key: 'PASSPORT', sortOrder: 0, required: true });
    expect(b).toMatchObject({ key: 'PHOTO', sortOrder: 1, required: false, description: null });

    // validation
    expect((await admin.agent.post('/api/admin/requirements').send(template({ key: 'bad key' }))).status).toBe(400);
    expect((await admin.agent.post('/api/admin/requirements').send(template({ title: { az: '', de: '', en: '', ru: '' } }))).status).toBe(400);
    expect((await admin.agent.post('/api/admin/requirements').send(template({ stage: 'CONTRACT' }))).status).toBe(400);
    expect((await admin.agent.post('/api/admin/requirements').send(template({ visaCategoryId: 'nope' }))).body.error).toBe('INVALID_VISA_CATEGORY');

    const upd = expectStatus(await admin.agent.put(`/api/admin/requirements/${a.id}`).send({ title: l10n('Passport copy'), required: false, key: null }), 200).body.template;
    expect(upd).toMatchObject({ title: l10n('Passport copy'), required: false, key: null });
    expect((await admin.agent.put('/api/admin/requirements/missing').send({ required: true })).status).toBe(404);

    expectStatus(await admin.agent.post('/api/admin/requirements/reorder').send({ ids: [b.id, a.id] }), 200);
    const list = (await admin.agent.get('/api/admin/requirements')).body.templates.global.INITIAL;
    expect(list.map((t: { id: string }) => t.id)).toEqual([b.id, a.id]);
    expect((await admin.agent.post('/api/admin/requirements/reorder').send({ ids: [a.id, 'ghost'] })).status).toBe(400);

    expectStatus(await admin.agent.delete(`/api/admin/requirements/${a.id}`), 200);
    expect((await admin.agent.delete(`/api/admin/requirements/${a.id}`)).status).toBe(404);
    expect(await prisma.requirementTemplate.count()).toBe(1);

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: 'REQUIREMENT_TEMPLATE' } } })).map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(['REQUIREMENT_TEMPLATE_CREATED', 'REQUIREMENT_TEMPLATE_UPDATED', 'REQUIREMENT_TEMPLATE_REORDERED', 'REQUIREMENT_TEMPLATE_DELETED']));
  });

  it('reorder refuses ids from different lists', async () => {
    const admin = await asAdmin();
    const a = (await admin.agent.post('/api/admin/requirements').send(template())).body.template;
    const b = (await admin.agent.post('/api/admin/requirements').send(template({ stage: 'EMBASSY', key: 'VIDEX' }))).body.template;
    expect((await admin.agent.post('/api/admin/requirements/reorder').send({ ids: [a.id, b.id] })).body.error).toBe('MIXED_LISTS');
  });

  it('seed-defaults is idempotent and copy-defaults copies the global set to a visa type', async () => {
    const admin = await asAdmin();
    const visa = await createVisaCategory();
    const seeded = expectStatus(await admin.agent.post('/api/admin/requirements/seed-defaults'), 200).body;
    expect(seeded.created).toBe(14);
    expect(seeded.templates.INITIAL).toHaveLength(7);
    expect(seeded.templates.EMBASSY).toHaveLength(7);
    expect((await admin.agent.post('/api/admin/requirements/seed-defaults')).body.created).toBe(0);

    const copied = expectStatus(await admin.agent.post('/api/admin/requirements/copy-defaults').send({ visaCategoryId: visa.id }), 201).body;
    expect(copied.count).toBe(14);
    expect(copied.templates.INITIAL.map((t: { key: string }) => t.key)).toEqual(['PASSPORT', 'PHOTO', 'CV', 'DIPLOMA', 'EMPLOYMENT_REF', 'DRIVING_LICENCE', 'LANGUAGE_CERT']);
    expect((await admin.agent.post('/api/admin/requirements/copy-defaults').send({ visaCategoryId: visa.id })).body.error).toBe('TEMPLATES_EXIST');
    expectStatus(await admin.agent.post('/api/admin/requirements/copy-defaults').send({ visaCategoryId: visa.id, replace: true }), 201);
    expect(await prisma.requirementTemplate.count({ where: { visaCategoryId: visa.id } })).toBe(14);

    const all = (await admin.agent.get('/api/admin/requirements')).body;
    expect(all.visaCategories).toHaveLength(1);
    expect(all.templates.byVisa[visa.id].INITIAL).toHaveLength(7);
  });

  it('copy-defaults falls back to the built-in list when no global set exists', async () => {
    const admin = await asAdmin();
    const visa = await createVisaCategory();
    const copied = expectStatus(await admin.agent.post('/api/admin/requirements/copy-defaults').send({ visaCategoryId: visa.id }), 201).body;
    expect(copied.count).toBe(14);
    expect(copied.templates.EMBASSY[0].key).toBe('VIDEX');
  });
});

// ─── New cases pick up templates ───────────────────────────────────────

describe('requirement templates on new cases', () => {
  it('precedence: own visa templates > global templates > built-in defaults', async () => {
    const admin = await asAdmin();
    const visa = await createVisaCategory({ published: true });
    const other = await createVisaCategory({ published: true });

    // built-in (no templates at all)
    const c1 = await asClient();
    const case1 = await createCaseVia(c1.agent);
    const req1 = rows((await clientCase(c1.agent, case1.id)).requirements);
    expect(req1).toHaveLength(7);
    expect(req1.map((r) => r.key)).toEqual(['PASSPORT', 'PHOTO', 'CV', 'DIPLOMA', 'EMPLOYMENT_REF', 'DRIVING_LICENCE', 'LANGUAGE_CERT']);

    // global templates
    expectStatus(await admin.agent.post('/api/admin/requirements').send(template({ key: 'CV', title: l10n('Global CV') })), 201);
    expectStatus(await admin.agent.post('/api/admin/requirements').send(template({ key: 'PASSPORT', title: l10n('Global passport') })), 201);
    const c2 = await asClient();
    const case2 = expectStatus(await c2.agent.post('/api/cases').send({ profession: 'Driver', visaCategoryId: other.id }), 201).body.case;
    const req2 = rows((await clientCase(c2.agent, case2.id)).requirements);
    expect(req2.map((r) => [r.key, r.title.az])).toEqual([
      ['CV', 'Global CV az'],
      ['PASSPORT', 'Global passport az'],
    ]);

    // own visa templates win over the global set
    expectStatus(await admin.agent.post('/api/admin/requirements').send(template({ visaCategoryId: visa.id, key: 'DRIVING_LICENCE', title: l10n('Licence'), required: true })), 201);
    expectStatus(await admin.agent.post('/api/admin/requirements').send(template({ visaCategoryId: visa.id, key: null, title: l10n('Extra'), required: false })), 201);
    const c3 = await asClient();
    const case3 = expectStatus(await c3.agent.post('/api/cases').send({ profession: 'Driver', visaCategoryId: visa.id }), 201).body.case;
    const req3 = rows((await clientCase(c3.agent, case3.id)).requirements);
    expect(req3.map((r) => [r.key, r.title.az, r.required, r.sortOrder])).toEqual([
      ['DRIVING_LICENCE', 'Licence az', true, 0],
      [null, 'Extra az', false, 1],
    ]);
  });

  it('template changes do not touch existing cases', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const created = await createCaseVia(client.agent);
    expectStatus(await admin.agent.post('/api/admin/requirements').send(template({ key: 'CV', title: l10n('Only CV') })), 201);
    expect((await clientCase(client.agent, created.id)).requirements).toHaveLength(7);
  });
});

// ─── Embassy packet ────────────────────────────────────────────────────

describe('GET /api/documents/cases/:caseId/packet', () => {
  it('client before the embassy step → 403; staff always; client from EMBASSY_DOCUMENTS on', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const admin = await asAdmin();
    const stranger = await asClient();
    const c = await driveCaseTo('CONTRACT_SIGNED', { client: client.agent, admin: admin.agent });

    const early = await client.agent.get(`/api/documents/cases/${c.id}/packet`);
    expect(early.status).toBe(403);
    expect(early.body.error).toBe('PACKET_NOT_AVAILABLE');
    expect((await stranger.agent.get(`/api/documents/cases/${c.id}/packet`)).status).toBe(404);

    const staffRes = await admin.agent.get(`/api/documents/cases/${c.id}/packet`).buffer().parse(binaryParser);
    expect(staffRes.status).toBe(200);
    expect(staffRes.headers['content-type']).toContain('application/pdf');
    expect(staffRes.headers['content-disposition']).toContain(`${c.number}-sefirlik-paketi.pdf`);
    const pdf = staffRes.body as Buffer;
    // cover + 4 accepted initial docs (divider + 1 page each) + signed contract (divider + 2 pages: contract + signature certificate)
    expect(await pageCount(pdf)).toBe(1 + 4 * 2 + 1 + 2);
    const texts = await pdfPagesText(pdf);
    expect(texts[0]).toContain(c.number);
    expect(texts[0]).toContain('Eli Memmedov');
    expect(texts[0]).toContain('Pasport');
    expect(texts[0]).toContain('Imzalanmis m');
    expect(texts[texts.length - 1]).toContain(`${texts.length} / ${texts.length}`);

    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/actions`).send({ action: 'CONFIRM_CONTRACT' }), 200);
    const late = await client.agent.get(`/api/documents/cases/${c.id}/packet`).buffer().parse(binaryParser);
    expect(late.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'EMBASSY_PACKET_BUILT', target: c.id } })).toBe(2);
  });

  it('?store=1 saves the packet as a case document visible to the client', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('EMBASSY_DOCUMENTS', { client: client.agent, admin: admin.agent });
    const res = await admin.agent.get(`/api/documents/cases/${c.id}/packet?store=1`);
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ caseId: c.id, stage: 'OTHER', mimeType: 'application/pdf', originalName: `${c.number}-sefirlik-paketi.pdf` });
    expect(res.body.pages).toBeGreaterThan(1);
    const detail = await clientCase(client.agent, c.id);
    expect((detail.otherDocuments as { id: string }[]).map((d) => d.id)).toContain(res.body.document.id);
    const file = await client.agent.get(`/api/files/${res.body.document.id}`).buffer().parse(binaryParser);
    expect(file.status).toBe(200);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

// ─── OCR ───────────────────────────────────────────────────────────────

describe('/api/documents/:docId/ocr', () => {
  const passportDoc = async (filename = 'passport.pdf', bytes?: Buffer, contentType = 'application/pdf') => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => (r as unknown as { key: string }).key === 'PASSPORT')!;
    const upload = bytes
      ? await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', bytes, { filename, contentType })
      : await uploadDoc(client.agent, c.id, req.id, filename);
    const doc = expectStatus(upload, 201).body.document as { id: string };
    return { client, admin, c, doc };
  };

  it('a PDF is marked as skipped (no rasterising) and the result is readable by owner and staff', async () => {
    const { client, admin, doc } = await passportDoc();
    const stranger = await asClient();
    expect((await stranger.agent.post(`/api/documents/${doc.id}/ocr`)).status).toBe(404);
    const run = expectStatus(await client.agent.post(`/api/documents/${doc.id}/ocr`), 200).body;
    expect(run.ocr).toMatchObject({ skipped: 'pdf' });
    expect(run.requirementKey).toBe('PASSPORT');
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(stored.ocrAt).not.toBeNull();
    expect(stored.ocr).toMatchObject({ skipped: 'pdf' });
    const get = expectStatus(await admin.agent.get(`/api/documents/${doc.id}/ocr`), 200).body;
    expect(get.ocr).toMatchObject({ skipped: 'pdf' });
    expect(get.profile).toEqual({ passportNumber: null, passportExpiry: null, birthDate: null, nationality: null });
    expect((await client.agent.post(`/api/documents/${doc.id}/ocr/apply`)).body.error).toBe('NO_MRZ');
  });

  it('an image without language data → 503 OCR_UNAVAILABLE and nothing stored', async () => {
    const { client, doc } = await passportDoc('passport.png', PNG_BUFFER, 'image/png');
    const res = await client.agent.post(`/api/documents/${doc.id}/ocr`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('OCR_UNAVAILABLE');
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).ocrAt).toBeNull();
    expect((await client.agent.get(`/api/documents/${doc.id}/ocr`)).body.available).toBe(false);
  });

  it('apply writes the MRZ into the profile; intel summary exposes it', async () => {
    const { client, admin, c, doc } = await passportDoc();
    await prisma.document.update({ where: { id: doc.id }, data: { ocr: { mrz: SPECIMEN, raw: 'x', confidence: 90, at: new Date().toISOString() } as unknown as Prisma.InputJsonValue, ocrAt: new Date() } });

    const intel = expectStatus(await client.agent.get(`/api/documents/cases/${c.id}/intel`), 200).body;
    expect(intel.passport).toMatchObject({ id: doc.id, isImage: false, extracted: { passportNumber: 'L898902C3', passportExpiry: '2012-04-15', birthDate: '1974-08-12', nationality: 'UTO' } });
    expect(intel.profile.passportNumber).toBeNull();
    expect(intel.packet.allowed).toBe(false);
    expect(intel.forms['videx-summary'].missing).toEqual(expect.arrayContaining(['passportNumber', 'birthDate', 'company']));

    const applied = expectStatus(await admin.agent.post(`/api/documents/${doc.id}/ocr/apply`), 200).body;
    expect(applied.profile).toEqual({ passportNumber: 'L898902C3', passportExpiry: '2012-04-15', birthDate: '1974-08-12', nationality: 'UTO' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } });
    expect(user.passportNumber).toBe('L898902C3');
    expect(user.nationality).toBe('UTO');
    expect(user.birthDate?.toISOString().slice(0, 10)).toBe('1974-08-12');
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'PROFILE_UPDATED_FROM_OCR' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_OCR_APPLIED', target: doc.id } })).toBe(1);

    const after = (await client.agent.get(`/api/documents/cases/${c.id}/intel`)).body;
    expect(after.profile.passportNumber).toBe('L898902C3');
    expect(after.forms['videx-summary'].missing).not.toContain('passportNumber');
  });
});

// ─── Forms ─────────────────────────────────────────────────────────────

describe('GET /api/documents/cases/:caseId/forms/:form', () => {
  it('returns a PDF with X-Missing-Fields; unknown forms → 400; strangers → 404', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov', phone: '+994501112233' });
    const admin = await asAdmin();
    const stranger = await asClient();
    const c = await createCaseVia(client.agent);

    for (const form of ['videx-summary', 'employer-letter', 'contract-cover']) {
      const res = await client.agent.get(`/api/documents/cases/${c.id}/forms/${form}`).buffer().parse(binaryParser);
      expect(res.status, form).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      const missing = String(res.headers['x-missing-fields']).split(',');
      expect(missing).toContain('passportNumber');
      expect(missing).not.toContain('phone');
      const texts = await pdfPagesText(res.body as Buffer);
      expect(texts.join('\n')).toContain('MEMMEDOV');
      expect(texts.join('\n')).toContain(c.number);
    }
    expect((await admin.agent.get(`/api/documents/cases/${c.id}/forms/videx-summary`)).status).toBe(200);
    expect((await client.agent.get(`/api/documents/cases/${c.id}/forms/nope`)).status).toBe(400);
    expect((await stranger.agent.get(`/api/documents/cases/${c.id}/forms/videx-summary`)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'FORM_GENERATED', target: c.id } })).toBe(4);
  });

  it('uses the employer and the profile when present', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const company = await prisma.company.create({ data: { name: 'Spedition Müller', legalForm: 'GmbH', city: 'Hamburg', contactName: 'Hans', status: 'ACTIVE' } });
    await prisma.case.update({ where: { id: c.id }, data: { companyId: company.id } });
    await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C0001', passportExpiry: new Date('2030-01-01T00:00:00Z'), birthDate: new Date('1991-02-03T00:00:00Z'), nationality: 'AZE', address: 'Nizami 1', city: 'Baku', phone: '+994' } });
    const res = await client.agent.get(`/api/documents/cases/${c.id}/forms/employer-letter`).buffer().parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['x-missing-fields']).toBe('');
    const text = (await pdfPagesText(res.body as Buffer)).join('\n');
    expect(text).toContain('Spedition M');
    expect(text).toContain('C0001');
    expect(text).toContain('03.02.1991');
  });
});
