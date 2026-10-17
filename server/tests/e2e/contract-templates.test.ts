import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { CaseStatus, ContractKind } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { cvPdfText } from '../unit/cvPdfText';
import { seedContractTemplates } from '../../prisma/seed/contractTemplates.js';

const BASE = '/api/admin/contract-templates';

const body = (over: Record<string, unknown> = {}) => ({
  name: 'Arbeitsvertrag Test',
  kind: 'WORK',
  language: 'de',
  body: '# Arbeitsvertrag\n// interne Notiz {{salary}}\nZwischen {{company.name}} und {{client.fullName}}, geb. {{client.birthDate}}.\n## § 1 Beginn\nBeginn am {{startDate}}, Gehalt {{salary}}.',
  isDefault: false,
  active: true,
  ...over,
});

const makeCompany = async () => {
  const company = await prisma.company.create({ data: { name: 'Spedition Müller', legalForm: 'GmbH', address: 'Hauptstraße 1', city: '10115 Berlin', status: 'ACTIVE' } });
  const u = await createUser({ role: 'COMPANY', firstName: 'Jürgen', lastName: 'Müller', locale: 'de' });
  await prisma.user.update({ where: { id: u.user.id }, data: { companyId: company.id } });
  return { company, user: u.user, agent: sessionAgent(u.token) };
};

const makeCase = async (opts: { status?: CaseStatus; companyId?: string | null } = {}) => {
  const client = await asClient({ firstName: 'Şəhla', lastName: 'Əliyeva-Güləliyeva', locale: 'az' });
  await prisma.user.update({ where: { id: client.user.id }, data: { birthDate: new Date('1995-04-07T00:00:00Z'), passportNumber: 'C01234567', nationality: 'Aserbaidschan', address: 'Nizami küç. 5', city: 'Bakı' } });
  const c = await prisma.case.create({
    data: { clientId: client.user.id, number: `TV-2026-${uniq('c')}`, profession: 'Berufskraftfahrer', status: opts.status ?? 'EMBASSY_DOCUMENTS', companyId: opts.companyId ?? null },
  });
  return { client, c };
};

const createTemplate = async (over: Record<string, unknown> = {}) => {
  const admin = await asAdmin();
  const t = expectStatus(await admin.agent.post(BASE).send(body(over)), 201).body.template as { id: string; kind: ContractKind };
  return { admin, t };
};

describe('contract templates CRUD and permissions', () => {
  it('ADMIN creates, edits and deletes; STAFF only reads; clients are refused', async () => {
    const { admin, t } = await createTemplate();
    const staff = await asStaff();
    expect((await staff.agent.get(BASE)).body.items.map((x: { id: string }) => x.id)).toEqual([t.id]);
    expect(expectStatus(await staff.agent.get(`${BASE}/${t.id}`), 200).body.template.placeholders).toEqual(['salary', 'company.name', 'client.fullName', 'client.birthDate', 'startDate']);
    const ph = expectStatus(await staff.agent.get(`${BASE}/placeholders`), 200).body.items;
    expect(ph.filter((p: { input?: boolean }) => p.input).map((p: { key: string }) => p.key)).toEqual(['startDate', 'salary', 'workingHours', 'probationMonths']);

    expectStatus(await staff.agent.post(BASE).send(body()), 403);
    expectStatus(await staff.agent.patch(`${BASE}/${t.id}`).send({ name: 'Neu' }), 403);
    expectStatus(await staff.agent.delete(`${BASE}/${t.id}`), 403);
    const client = await asClient();
    expectStatus(await client.agent.get(BASE), 403);
    expectStatus(await anon().get(BASE), 401);

    expectStatus(await admin.agent.post(BASE).send(body({ kind: 'OTHER' })), 400);
    expectStatus(await admin.agent.post(BASE).send(body({ name: 'x' })), 400);
    expectStatus(await admin.agent.post(BASE).send(body({ body: 'kurz' })), 400);

    const upd = expectStatus(await admin.agent.patch(`${BASE}/${t.id}`).send({ name: 'Arbeitsvertrag 2026', active: false }), 200).body.template;
    expect(upd).toMatchObject({ name: 'Arbeitsvertrag 2026', active: false, kind: 'WORK' });
    expect((await admin.agent.get(`${BASE}?active=true`)).body.items).toHaveLength(0);
    expectStatus(await admin.agent.delete(`${BASE}/${t.id}`), 200);
    expectStatus(await admin.agent.get(`${BASE}/${t.id}`), 404);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'contractTemplate.' } } })).toBe(3);
  });

  it('keeps one default per kind and language', async () => {
    const { admin, t } = await createTemplate({ isDefault: true });
    const t2 = expectStatus(await admin.agent.post(BASE).send(body({ name: 'Zweiter', isDefault: true })), 201).body.template;
    const other = expectStatus(await admin.agent.post(BASE).send(body({ name: 'English', language: 'en', isDefault: true })), 201).body.template;
    const rows = await prisma.contractTemplate.findMany();
    expect(rows.find((r) => r.id === t.id)?.isDefault).toBe(false);
    expect(rows.find((r) => r.id === t2.id)?.isDefault).toBe(true);
    expect(rows.find((r) => r.id === other.id)?.isDefault).toBe(true);
  });

  it('seeds the three German defaults once, only into an empty table', async () => {
    expect(await seedContractTemplates(prisma)).toBe(3);
    expect(await seedContractTemplates(prisma)).toBe(0);
    const rows = await prisma.contractTemplate.findMany({ orderBy: { kind: 'asc' } });
    expect(rows.map((r) => r.kind).sort()).toEqual(['AUSBILDUNG', 'SERVICE', 'WORK']);
    expect(rows.every((r) => r.language === 'de' && r.isDefault && r.active)).toBe(true);
  });
});

describe('preview and PDF', () => {
  it('preview fills case data, marks blanks and lists missing keys (comments stripped)', async () => {
    const { company } = await makeCompany();
    const { c } = await makeCase({ companyId: company.id });
    const { t } = await createTemplate();
    const staff = await asStaff();
    const res = expectStatus(await staff.agent.post(`${BASE}/${t.id}/preview`).send({ caseId: c.id, inputs: { startDate: '2026-12-01' } }), 200).body;
    expect(res.text).toBe('# Arbeitsvertrag\nZwischen Spedition Müller GmbH und Şəhla Əliyeva-Güləliyeva, geb. 07.04.1995.\n## § 1 Beginn\nBeginn am 01.12.2026, Gehalt ________.');
    expect(res.missing).toEqual(['salary']);
    expect(res.segments).toContainEqual({ key: 'salary', value: null });
    expect(res.text).not.toContain('interne Notiz');

    expectStatus(await staff.agent.post(`${BASE}/${t.id}/preview`).send({ caseId: 'nope', inputs: {} }), 404);
    expectStatus(await staff.agent.post(`${BASE}/nope/preview`).send({ caseId: c.id }), 404);
    expectStatus(await staff.agent.post(`${BASE}/${t.id}/preview`).send({ caseId: c.id, inputs: { salary: 'x'.repeat(501) } }), 400);
  });

  it('every seed template renders against a case without unknown placeholders', async () => {
    await seedContractTemplates(prisma);
    const { company } = await makeCompany();
    const { c } = await makeCase({ companyId: company.id });
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Hüseynova' });
    for (const t of await prisma.contractTemplate.findMany()) {
      const res = expectStatus(await staff.agent.post(`${BASE}/${t.id}/preview`).send({ caseId: c.id, inputs: { salary: '2.800 €', startDate: '2026-12-01', workingHours: '40 Stunden/Woche', probationMonths: '6' } }), 200).body;
      expect(res.unknown).toEqual([]);
      expect(res.text).not.toContain('VORLAGE');
      expect(res.text).toContain('Şəhla Əliyeva-Güləliyeva');
      if (t.kind === 'SERVICE') expect(res.text).toContain('Leyla Hüseynova');
    }
  });

  it('PDF is a valid document with Azerbaijani and German letters', async () => {
    const { company } = await makeCompany();
    const { c } = await makeCase({ companyId: company.id });
    const { t } = await createTemplate();
    const staff = await asStaff();
    const res = expectStatus(
      await staff.agent.post(`${BASE}/${t.id}/pdf`).send({ caseId: c.id, inputs: { salary: '3.100 €' } }).buffer(true).parse(binaryParser),
      200,
    );
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    const buf = res.body as Buffer;
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const text = await cvPdfText(buf);
    expect(text).toContain('Şəhla Əliyeva-Güləliyeva');
    expect(text).toContain('Spedition Müller GmbH');
    expect(text).toContain('Arbeitnehmer/in');
    expect(text).toContain('________'); // startDate missing
    expect(text).not.toContain('interne Notiz');
  });
});

describe('send for e-signature', () => {
  const signersOf = (requestId: string) => prisma.signatureSigner.findMany({ where: { requestId }, orderBy: { order: 'asc' } });

  it('work contract: client as CANDIDATE and the company contact as COMPANY', async () => {
    const { company, user } = await makeCompany();
    const { client, c } = await makeCase({ companyId: company.id });
    const { t } = await createTemplate();
    const staff = await asStaff();
    const res = expectStatus(await staff.agent.post(`${BASE}/${t.id}/send`).send({ caseId: c.id, inputs: { salary: '2.900 €', startDate: '2026-12-01' } }), 201).body;
    expect(res.caseContract).toBe(false);
    const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: res.signatureRequestId } });
    expect(r).toMatchObject({ status: 'SENT', caseId: c.id, companyId: company.id, isCaseContract: false, createdById: staff.user.id });
    expect(r.title).toContain(c.number);
    const signers = await signersOf(r.id);
    expect(signers.map((s) => [s.role, s.userId])).toEqual([
      ['CANDIDATE', client.user.id],
      ['COMPANY', user.id],
    ]);
    expect(await prisma.auditLog.count({ where: { action: 'contractTemplate.send' } })).toBe(1);
  });

  it('service contract in the contract step becomes the case contract with the staff member as STAFF', async () => {
    const { client, c } = await makeCase({ status: 'CONTRACT_SENT' });
    const { t } = await createTemplate({ kind: 'SERVICE', name: 'Dienstleistungsvertrag' });
    const staff = await asStaff();
    const res = expectStatus(await staff.agent.post(`${BASE}/${t.id}/send`).send({ caseId: c.id, inputs: {} }), 201).body;
    expect(res.caseContract).toBe(true);
    const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: res.signatureRequestId } });
    expect(r.isCaseContract).toBe(true);
    expect((await signersOf(r.id)).map((s) => [s.role, s.userId])).toEqual([
      ['CANDIDATE', client.user.id],
      ['STAFF', staff.user.id],
    ]);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('CONTRACT_SENT');
  });

  it('service contract outside the contract step (or refused by the case flow) is sent as an ordinary request', async () => {
    const later = await makeCase({ status: 'EMBASSY_REVIEW' });
    const review = await makeCase({ status: 'DOCUMENTS_REVIEW' });
    await prisma.documentRequirement.create({ data: { caseId: review.c.id, stage: 'INITIAL', title: { az: 'P', de: 'P', en: 'P', ru: 'P' }, required: true } });
    const { t } = await createTemplate({ kind: 'SERVICE', name: 'Dienstleistungsvertrag' });
    const staff = await asStaff();
    for (const { c } of [later, review]) {
      const res = expectStatus(await staff.agent.post(`${BASE}/${t.id}/send`).send({ caseId: c.id }), 201).body;
      expect(res.caseContract).toBe(false);
      expect((await prisma.signatureRequest.findUniqueOrThrow({ where: { id: res.signatureRequestId } })).isCaseContract).toBe(false);
    }
    expect((await prisma.case.findUniqueOrThrow({ where: { id: review.c.id } })).status).toBe('DOCUMENTS_REVIEW');
    expect(await prisma.signatureRequest.count()).toBe(2); // no leftover drafts
  });

  it('explicit signers override the defaults; inactive templates cannot be sent', async () => {
    const { c } = await makeCase();
    const { admin, t } = await createTemplate();
    const staff = await asStaff();
    const res = expectStatus(
      await staff.agent.post(`${BASE}/${t.id}/send`).send({ caseId: c.id, signers: [{ role: 'OTHER', name: 'Notar Schmidt', email: 'notar@example.com' }] }),
      201,
    ).body;
    expect((await signersOf(res.signatureRequestId)).map((s) => [s.role, s.email])).toEqual([['OTHER', 'notar@example.com']]);
    await admin.agent.patch(`${BASE}/${t.id}`).send({ active: false });
    expect(expectStatus(await staff.agent.post(`${BASE}/${t.id}/send`).send({ caseId: c.id }), 400).body.error).toBe('TEMPLATE_INACTIVE');
  });
});
