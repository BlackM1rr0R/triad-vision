import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { makeFormPdf, specFromMapping } from '../helpers/formPdf';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';
import { POOL_CONSENT_VERSION } from '../../src/lib/pool/constants.js';
import { DEFAULT_TEMPLATES, officialFormDeps, type Fetcher } from '../../src/lib/officialForms/service.js';
import { AVV_TEMPLATE_VERSION } from '../../src/lib/trust/settings.js';

const realFetch = officialFormDeps.fetch;

/** Company with complete, valid legal / contact data (prefill of the declaration). */
const employerWithProfile = async () => {
  const e = await asCompany();
  await prisma.company.update({ where: { id: e.company.id }, data: { name: 'Spedition Müller', legalForm: 'GmbH', address: 'Hafenstraße 12, 28195 Bremen', city: 'Bremen', contactName: 'Hans Becker', phone: '+49 421 1234', email: 'hr@mueller.de' } });
  return e;
};
beforeEach(cleanJobs);
afterEach(() => {
  officialFormDeps.fetch = realFetch;
});

const AVV_DATA = {
  legalName: 'Spedition Müller GmbH',
  street: 'Hafenstraße 12',
  postalCode: '28195',
  city: 'Bremen',
  country: 'Deutschland',
  representative: 'Hans Becker (Geschäftsführer)',
  privacyContactName: 'Hans Becker',
  privacyContactEmail: 'datenschutz@mueller.de',
  signatoryName: 'Hans Becker',
  signatoryRole: 'Geschäftsführer',
};

describe('AVV (Art. 28 DSGVO) with employers', () => {
  it('is hidden while the template is not approved; after approval the company signs and Triad Vision countersigns', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const employer = await asCompany();
    const other = await asCompany();

    // Default OFF: invisible for companies and on the Trust Center
    const hidden = await employer.agent.get('/api/company/avv');
    expect(hidden.status).toBe(404);
    expect(hidden.body.error).toBe('AVV_NOT_AVAILABLE');
    expect((await employer.agent.post('/api/company/avv/sign').send({ data: AVV_DATA })).status).toBe(404);
    expect((await employer.agent.post('/api/company/avv/preview').send({ data: AVV_DATA })).status).toBe(404);
    expect(expectStatus(await anon().get('/api/trust'), 200).body.avvAvailable).toBe(false);

    // Only ADMIN+ manage the template approval
    expect((await staff.agent.get('/api/admin/trust')).status).toBe(403);
    expect((await staff.agent.put('/api/admin/trust/avv-approval').send({ approved: true })).status).toBe(403);
    const overview = expectStatus(await admin.agent.get('/api/admin/trust'), 200);
    expect(overview.body.avv).toMatchObject({ approved: false, effective: false, templateVersion: AVV_TEMPLATE_VERSION });
    const sample = await admin.agent.get('/api/admin/trust/avv-sample.pdf').buffer(true).parse(binaryParser);
    expect(sample.status).toBe(200);
    expect((sample.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    expectStatus(await admin.agent.put('/api/admin/trust/avv-approval').send({ approved: true }), 200);
    expect(expectStatus(await anon().get('/api/trust'), 200).body.avvAvailable).toBe(true);

    const view = expectStatus(await employer.agent.get('/api/company/avv'), 200);
    expect(view.body).toMatchObject({ available: true, templateVersion: AVV_TEMPLATE_VERSION, current: null });
    expect(view.body.prefill.legalName).toBeTruthy();

    // invalid data → 400 with the fields
    const bad = await employer.agent.post('/api/company/avv/sign').send({ data: { ...AVV_DATA, privacyContactEmail: 'nope' } });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('privacyContactEmail');

    const preview = await employer.agent.post('/api/company/avv/preview').send({ data: AVV_DATA }).buffer(true).parse(binaryParser);
    expect(preview.status).toBe(200);

    const signed = expectStatus(await employer.agent.post('/api/company/avv/sign').send({ data: AVV_DATA }), 201);
    expect(signed.body.signerId).toBeTruthy();
    const agreement = await prisma.avvAgreement.findFirstOrThrow({ where: { companyId: employer.company.id } });
    expect(agreement).toMatchObject({ status: 'SENT', templateVersion: AVV_TEMPLATE_VERSION });
    const signers = await prisma.signatureSigner.findMany({ where: { requestId: agreement.signatureRequestId! }, orderBy: { order: 'asc' } });
    expect(signers.map((s) => [s.role, s.order])).toEqual([
      ['COMPANY', 1],
      ['STAFF', 2],
    ]);
    expect(signers[1].userId).toBe(admin.user.id);

    // Another company sees nothing of it
    const otherView = expectStatus(await other.agent.get('/api/company/avv'), 200);
    expect(otherView.body.items).toEqual([]);
    expect((await other.agent.get(`/api/company/avv/${agreement.id}/file`)).status).toBe(404);
    // Not completed yet
    expect((await employer.agent.get(`/api/company/avv/${agreement.id}/file`)).body.error).toBe('NOT_COMPLETED');

    // Turning the approval off hides it again
    expectStatus(await admin.agent.put('/api/admin/trust/avv-approval').send({ approved: false }), 200);
    expect((await employer.agent.get('/api/company/avv')).status).toBe(404);
  });
});

describe('Trust Center', () => {
  it('shows only implemented measures and the data location only once the owner set it', async () => {
    const admin = await asAdmin();
    const before = expectStatus(await anon().get('/api/trust'), 200);
    expect(before.body.dataLocation).toBeNull();
    expect(before.body.measures.map((m: { key: string }) => m.key)).toEqual(expect.arrayContaining(['staff2fa', 'backups', 'audit', 'secretBox']));
    expect(before.body.subprocessors.map((s: { key: string }) => s.key)).toEqual(expect.arrayContaining(['hosting', 'cloudflare']));
    expect(before.body.links.status).toBe('/status');

    expect((await admin.agent.put('/api/admin/trust/settings').send({ securityEmail: 'not-an-email' })).status).toBe(400);
    expectStatus(await admin.agent.put('/api/admin/trust/settings').send({ dataLocation: 'Frankfurt am Main, Deutschland', dataLocationConfirmed: true, securityEmail: 'security@example.com' }), 200);
    const after = expectStatus(await anon().get('/api/trust'), 200);
    expect(after.body).toMatchObject({ dataLocation: 'Frankfurt am Main, Deutschland', dataLocationConfirmed: true, securityEmail: 'security@example.com' });
  });
});

describe('public anonymous candidate catalogue', () => {
  const poolCandidate = async (profile: Record<string, unknown>) => {
    const c = await asCandidate({ firstName: 'Rəşad', lastName: 'Əliyev', phone: '+994509998877', passportNumber: 'C01234567', about: 'Mənim adım Rəşad', ...profile });
    expectStatus(await c.agent.put('/api/account/candidate-pool').send({ consent: true, version: POOL_CONSENT_VERSION, availability: 'IMMEDIATE', regions: ['HH'] }), 200);
    return c;
  };

  it('publishes only consented, k-anonymous groups and never an identifier', async () => {
    for (let i = 0; i < 3; i++) await poolCandidate({ profession: 'LKW-Fahrer', germanLevel: 'B1', experienceYears: 4 + (i % 2) });
    await poolCandidate({ profession: 'Koch', germanLevel: 'A2', experienceYears: 12 }); // alone → suppressed
    await asCandidate({ profession: 'LKW-Fahrer', germanLevel: 'B1', experienceYears: 4 }); // no consent → not counted at all

    const res = expectStatus(await anon().get('/api/candidate-catalogue'), 200);
    expect(res.body.groups).toEqual([{ profession: 'truck_driver', german: 'B1', experience: '3_5', availability: 'NOW', count: 3 }]);
    expect(res.body.professions).toEqual([{ profession: 'truck_driver', count: 3 }]);
    expect(res.body.suppressed).toBe(1);
    expect(res.body.labels.truck_driver.de).toBeTruthy();
    const json = JSON.stringify(res.body);
    const codes = (await prisma.candidatePoolProfile.findMany({ select: { code: true, userId: true } })).flatMap((p) => [p.code, p.userId]);
    for (const secret of [...codes, 'Rəşad', 'Əliyev', 'C01234567', '+994509998877', 'HH']) expect(json).not.toContain(secret);
  });
});

/** Synthetic stand-in for the official EzB PDF (same field names as the shipped mapping). */
const installEzb = async (admin: Awaited<ReturnType<typeof asAdmin>>) => {
  const ezb = DEFAULT_TEMPLATES.find((d) => d.key === 'EMPLOYMENT_DECLARATION')!;
  const visa = DEFAULT_TEMPLATES.find((d) => d.key === 'NATIONAL_VISA')!;
  const files: Record<string, Buffer> = {
    [ezb.url]: await makeFormPdf(specFromMapping(ezb.fieldMap, { chbx_46_Arbeitsentgelt: ['pro Stunde', 'pro Monat'] })),
    [visa.url]: await makeFormPdf(specFromMapping(visa.fieldMap)),
  };
  const fetcher: Fetcher = async (url) => {
    const buf = files[url];
    return { ok: !!buf, status: buf ? 200 : 404, arrayBuffer: async () => (buf ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : new ArrayBuffer(0)) as ArrayBuffer };
  };
  officialFormDeps.fetch = fetcher;
  expectStatus(await admin.agent.post('/api/admin/official-forms/templates/install-defaults'), 200);
};

describe('Erklärung zum Beschäftigungsverhältnis: wizard', () => {
  it('the employer starts it for an own worker, sees steps and rules, gets the data sheet; other companies see nothing', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    await installEzb(admin);
    const employer = await employerWithProfile();
    const other = await asCompany();
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { companyId: employer.company.id } });
    await prisma.employmentContract.create({ data: { caseId: c.id, companyId: employer.company.id, jobTitle: 'Berufskraftfahrer', contractType: 'UNLIMITED', grossMonthly: 3200, weeklyHours: 40, vacationDays: 26, startDate: new Date('2027-01-01T00:00:00Z') } });

    const list = expectStatus(await employer.agent.get('/api/company/forms'), 200);
    expect(list.body.startable.map((s: { caseId: string }) => s.caseId)).toEqual([c.id]);
    expect(expectStatus(await other.agent.get('/api/company/forms'), 200).body.startable).toEqual([]);
    expect((await other.agent.post('/api/company/forms/start').send({ caseId: c.id })).status).toBe(404);

    const started = expectStatus(await employer.agent.post('/api/company/forms/start').send({ caseId: c.id }), 201);
    const fillId = started.body.fill.id;
    expect(await prisma.notification.count({ where: { caseId: c.id, title: { contains: 'Beschäftigungsverhältnis gestartet' } } })).toBeGreaterThan(0);

    const detail = expectStatus(await employer.agent.get(`/api/company/forms/${fillId}`), 200);
    expect(detail.body.form.steps).toEqual(['employer', 'job', 'place', 'time', 'pay', 'insurance']);
    const field = (key: string) => detail.body.form.fields.find((f: { key: string }) => f.key === key);
    expect(field('company.betriebsnummer')).toMatchObject({ step: 'employer', question: 19, rules: { pattern: '^\\d{8}$' } });
    expect(field('contract.endDate').rules.showWhen).toEqual({ key: 'contract.contractType', in: ['FIXED', 'AUSBILDUNG'] });
    expect(detail.body.form.officialForm.url).toContain('arbeitsagentur.de');
    expect(detail.body.form.fields.some((f: { key: string }) => f.key.startsWith('client.'))).toBe(false);

    // Rule violations are rejected server-side
    const invalid = await employer.agent.post(`/api/company/forms/${fillId}/submit`).send({ values: { 'company.betriebsnummer': '123', 'company.foundedRecently': 'no' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('INVALID_VALUES');
    expect(invalid.body.message).toContain('company.betriebsnummer');
    const conditional = await employer.agent.post(`/api/company/forms/${fillId}/submit`).send({ values: { 'company.betriebsnummer': '87654321', 'company.foundedRecently': 'no', 'employment.overtime': 'yes' } });
    expect(conditional.body.error).toBe('REQUIRED_MISSING');
    expect(conditional.body.message).toContain('employment.overtimeExtent');

    // Data sheet (official question order) — own company only
    const sheet = await employer.agent.post(`/api/company/forms/${fillId}/datasheet`).send({ values: { 'company.betriebsnummer': '87654321' } }).buffer(true).parse(binaryParser);
    expect(sheet.status).toBe(200);
    expect((sheet.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await other.agent.post(`/api/company/forms/${fillId}/datasheet`).send({ values: {} })).status).toBe(404);
    expect((await other.agent.get(`/api/company/forms/${fillId}`)).status).toBe(404);

    // KldB search
    const kldb = expectStatus(await employer.agent.get('/api/company/forms/kldb?q=lkw'), 200);
    expect(kldb.body.items[0].code).toBe('52122');

    // Staff version: read-only while the employer has it
    const staffView = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/ezb-wizard`), 200);
    expect(staffView.body).toMatchObject({ templateInstalled: true, editable: false });
    expect((await staff.agent.put(`/api/admin/cases/${c.id}/ezb-wizard`).send({ values: {} })).body.error).toBe('SENT_TO_EMPLOYER');
  });

  it('staff fill the wizard on the case and generate the PDF', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    await installEzb(admin);
    const employer = await employerWithProfile();
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { companyId: employer.company.id } });

    const view = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/ezb-wizard`), 200);
    expect(view.body).toMatchObject({ templateInstalled: true, editable: true, hasEmployer: true });
    // draft save without everything is fine
    expectStatus(await staff.agent.put(`/api/admin/cases/${c.id}/ezb-wizard`).send({ values: { 'company.betriebsnummer': '87654321' } }), 200);
    // generate checks the rules
    const missing = await staff.agent.put(`/api/admin/cases/${c.id}/ezb-wizard`).send({ values: {}, generate: true });
    expect(missing.body.error).toBe('REQUIRED_MISSING');
    const values = {
      'company.name': 'Spedition Müller GmbH',
      'company.street': 'Hafenstraße',
      'company.postalCode': '28195',
      'company.city': 'Bremen',
      'company.betriebsnummer': '87654321',
      'company.foundedRecently': 'no',
      'contract.jobTitle': 'Berufskraftfahrer',
      'employment.kldbCode': '52122',
      'contract.startDate': '2027-01-01',
      'contract.contractType': 'UNLIMITED',
      'contract.weeklyHours': '40',
      'contract.vacationDays': '26',
      'contract.grossMonthly': '3200',
    };
    const out = expectStatus(await staff.agent.put(`/api/admin/cases/${c.id}/ezb-wizard`).send({ values, generate: true }), 200);
    expect(out.body.generated).toMatchObject({ status: 'GENERATED', hasFile: true });
    const sheet = await staff.agent.post(`/api/admin/cases/${c.id}/ezb-wizard/datasheet`).send({ values }).buffer(true).parse(binaryParser);
    expect(sheet.status).toBe(200);
    expect((await employer.agent.get(`/api/admin/cases/${c.id}/ezb-wizard`)).status).toBe(403);
  });
});
