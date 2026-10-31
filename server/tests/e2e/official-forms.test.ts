import { afterEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { binaryParser, makePdf } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';
import { makeFormPdf, specFromMapping } from '../helpers/formPdf';
import { photoJpeg } from '../helpers/syntheticPhotos';
import { asCompany, cleanJobs } from './vacancies.fixtures';
import { DEFAULT_TEMPLATES, officialFormDeps, type Fetcher } from '../../src/lib/officialForms/service.js';
import { readPdfValues } from '../../src/lib/officialForms/pdf.js';

const realFetch = officialFormDeps.fetch;
afterEach(async () => {
  officialFormDeps.fetch = realFetch;
  await cleanJobs();
});

const SIMPLE_FIELDS = { text: ['Familienname', 'Vorname', 'Geburtsdatum', 'Reisepassnummer', 'Firma', 'Bemerkung'], checkbox: ['männlich male', 'weiblich female'] };

const uploadTemplate = (agent: Agent, pdf: Buffer, fields: Record<string, string> = {}) =>
  agent
    .post('/api/admin/official-forms/templates')
    .field('key', fields.key ?? 'TEST_FORM')
    .field('title', fields.title ?? 'Testformular')
    .field('version', fields.version ?? '2026-01')
    .attach('file', pdf, { filename: 'form.pdf', contentType: 'application/pdf' });

/** A client with a filled profile, a WORK case with an employer and an employment contract. */
const setupCase = async (opts: { company?: Awaited<ReturnType<typeof asCompany>> } = {}) => {
  const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
  await prisma.user.update({
    where: { id: client.user.id },
    data: { birthDate: new Date('1990-05-04T00:00:00Z'), nationality: 'Azərbaycan', passportNumber: 'C01234567', passportExpiry: new Date('2031-01-01T00:00:00Z'), address: 'Nizami küç. 10', city: 'Bakı', phone: '+994501112233', profession: 'Sürücü', education: 'vocational' },
  });
  const c = await createCaseVia(client.agent);
  const company = opts.company ?? (await asCompany());
  await prisma.company.update({ where: { id: company.company.id }, data: { name: 'Spedition Müller', legalForm: 'GmbH', address: 'Hafenstraße 12, 28195 Bremen', city: 'Bremen', contactName: 'Hans Becker', phone: '+49 421 1234', email: 'hr@mueller.de' } });
  await prisma.case.update({ where: { id: c.id }, data: { companyId: company.company.id } });
  await prisma.employmentContract.create({
    data: { caseId: c.id, companyId: company.company.id, jobTitle: 'Berufskraftfahrer', contractType: 'UNLIMITED', grossMonthly: 3200, grossYearly: 38400, weeklyHours: 40, vacationDays: 26, startDate: new Date('2027-01-01T00:00:00Z') },
  });
  return { client, c, company };
};

describe('official forms: templates (admin)', () => {
  it('admin uploads a fillable PDF, gets the fields with suggestions, maps, versions and activates; staff may only read', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const pdf = await makeFormPdf(SIMPLE_FIELDS);

    expect((await uploadTemplate(staff.agent, pdf)).status).toBe(403);
    expect((await uploadTemplate(admin.agent, await makePdf('no fields'))).body.error).toBe('NOT_FILLABLE');
    expect((await uploadTemplate(admin.agent, pdf, { key: 'bad key' })).status).toBe(400);

    const created = expectStatus(await uploadTemplate(admin.agent, pdf), 201);
    const id = created.body.template.id;
    expect(created.body.template).toMatchObject({ key: 'TEST_FORM', version: '2026-01', active: true, builtIn: false });
    expect(created.body.fields.map((f: { name: string; type: string }) => `${f.name}:${f.type}`)).toEqual([
      'Familienname:text',
      'Vorname:text',
      'Geburtsdatum:text',
      'Reisepassnummer:text',
      'Firma:text',
      'Bemerkung:text',
      'männlich male:checkbox',
      'weiblich female:checkbox',
    ]);
    // the first mapping is the auto-suggestion
    expect(created.body.fieldMap).toMatchObject({
      Familienname: { source: 'client.lastName', format: 'upper' },
      Vorname: { source: 'client.firstName' },
      Geburtsdatum: { source: 'client.birthDate' },
      Reisepassnummer: { source: 'passport.number' },
      Firma: { source: 'company.name' },
      'männlich male': { source: 'client.sex', when: 'M' },
    });
    expect(created.body.fieldMap.Bemerkung).toBeUndefined();
    expect((await uploadTemplate(admin.agent, pdf)).status).toBe(409); // same key + version

    // Mapping: a constant for "Bemerkung", unknown sources / fields are dropped
    const saved = expectStatus(
      await admin.agent.put(`/api/admin/official-forms/templates/${id}`).send({ fieldMap: { ...created.body.fieldMap, Bemerkung: { source: 'const', value: 'Triad Vision' }, Ghost: { source: 'client.lastName' }, Vorname: { source: 'nope' } } }),
      200,
    );
    expect(saved.body.dropped.sort()).toEqual(['Ghost', 'Vorname']);
    expect(saved.body.fieldMap.Bemerkung).toEqual({ source: 'const', value: 'Triad Vision' });
    expect((await staff.agent.put(`/api/admin/official-forms/templates/${id}`).send({ title: 'X' })).status).toBe(403);
    expectStatus(await staff.agent.get(`/api/admin/official-forms/templates/${id}`), 200);

    // A second version starts inactive; activating it deactivates the first.
    const v2 = expectStatus(await uploadTemplate(admin.agent, pdf, { version: '2026-02' }), 201);
    expect(v2.body.template.active).toBe(false);
    const act = expectStatus(await admin.agent.post(`/api/admin/official-forms/templates/${v2.body.template.id}/activate`), 200);
    expect(act.body.items.filter((t: { active: boolean }) => t.active).map((t: { version: string }) => t.version)).toEqual(['2026-02']);

    const blank = await admin.agent.get(`/api/admin/official-forms/templates/${id}/file`).buffer(true).parse(binaryParser);
    expect(blank.status).toBe(200);
    expect((blank.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const catalog = expectStatus(await staff.agent.get('/api/admin/official-forms/catalog'), 200);
    expect(catalog.body.keys.find((k: { key: string }) => k.key === 'company.betriebsnummer')).toMatchObject({ group: 'company', employer: true });
    expect(catalog.body.defaults.map((d: { key: string }) => d.key)).toEqual(['NATIONAL_VISA', 'EMPLOYMENT_DECLARATION']);

    // Delete: unused version is deleted
    expect((await admin.agent.delete(`/api/admin/official-forms/templates/${id}`)).body).toEqual({ deleted: true, deactivated: false });
  });

  it('preview with a sample case: values, missing data with fix links, filled PDF', async () => {
    const admin = await asAdmin();
    const { c } = await setupCase();
    const created = expectStatus(await uploadTemplate(admin.agent, await makeFormPdf({ text: ['Familienname', 'txtf_19_Betriebsnummer'] })), 201);
    const id = created.body.template.id;
    const prev = expectStatus(await admin.agent.post(`/api/admin/official-forms/templates/${id}/preview`).send({ caseId: c.id }), 200);
    expect(prev.body.rows.find((r: { field: string }) => r.field === 'Familienname').value).toBe('MAMMADOV');
    expect(prev.body.missing).toEqual([expect.objectContaining({ source: 'company.betriebsnummer', fields: ['txtf_19_Betriebsnummer'], fix: { href: expect.stringMatching(/^\/admin\/companies\//) } })]);
    const pdf = await admin.agent.post(`/api/admin/official-forms/templates/${id}/preview.pdf`).send({ caseId: c.id }).buffer(true).parse(binaryParser);
    expect(pdf.status).toBe(200);
    expect((await readPdfValues(pdf.body as Buffer)).Familienname).toBeTruthy();
    const cases = expectStatus(await admin.agent.get(`/api/admin/official-forms/sample-cases?q=${c.number}`), 200);
    expect(cases.body.items[0]).toMatchObject({ id: c.id, number: c.number, companyName: 'Spedition Müller' });
  });
});

describe('official forms: filling for a case', () => {
  it('staff fill a form: values from the case, overrides, PDF stored + in the drive folder, re-generate updates the same fill', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const { c } = await setupCase();
    expectStatus(await uploadTemplate(admin.agent, await makeFormPdf(SIMPLE_FIELDS)), 201);

    const panel = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/official-forms`), 200);
    const test = panel.body.forms.find((f: { key: string }) => f.key === 'TEST_FORM');
    expect(test).toMatchObject({ title: 'Testformular', latest: null, canSendToEmployer: false });
    // the built-in keys are always listed (install / data sheet)
    expect(panel.body.forms.map((f: { key: string }) => f.key)).toEqual(expect.arrayContaining(['NATIONAL_VISA', 'EMPLOYMENT_DECLARATION']));

    const view = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/official-forms/TEST_FORM`), 200);
    expect(view.body.rows.find((r: { field: string }) => r.field === 'Firma').value).toBe('Spedition Müller GmbH');
    expect(view.body.rows.find((r: { field: string }) => r.field === 'Geburtsdatum').value).toBe('04.05.1990');

    const fill = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/TEST_FORM/fill`).send({ fieldOverrides: { Firma: 'Spedition Müller GmbH & Co. KG' } }), 201);
    expect(fill.body.fill).toMatchObject({ status: 'GENERATED', hasFile: true, caseId: c.id });
    const fillId = fill.body.fill.id;
    const file = await staff.agent.get(`/api/admin/official-forms/fills/${fillId}/file`).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
    const values = await readPdfValues(file.body as Buffer);
    expect(values).toMatchObject({ Firma: 'Spedition Müller GmbH & Co. KG', Geburtsdatum: '04.05.1990', Reisepassnummer: 'C01234567' });
    expect(values.Familienname).toBe('MAMMADOV');
    // into the client's drive folder: <client folder>/Amtliche Formulare
    const row = await prisma.officialFormFill.findUniqueOrThrow({ where: { id: fillId } });
    expect(row.driveNodeId).toBeTruthy();
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: row.driveNodeId! }, include: { parent: true } });
    expect(node.name).toBe(`Testformular – ${c.number}.pdf`);
    expect(node.parent?.name).toBe('Amtliche Formulare');

    // Re-generate keeps the overrides and makes a new drive version of the same file.
    const again = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/TEST_FORM/fill`).send({}), 201);
    expect(again.body.fill.id).toBe(fillId);
    expect(again.body.rows.find((r: { field: string }) => r.field === 'Firma')).toMatchObject({ value: 'Spedition Müller GmbH & Co. KG', overridden: true });
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: row.driveNodeId! } })).version).toBe(2);
    expect(await prisma.officialFormFill.count({ where: { caseId: c.id } })).toBe(1);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'OFFICIAL_FORM_GENERATED' } })).toBe(2);

    // Mark as handed in; a later fill starts a new row.
    expectStatus(await staff.agent.post(`/api/admin/official-forms/fills/${fillId}/submitted`), 200);
    const third = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/TEST_FORM/fill`).send({}), 201);
    expect(third.body.fill.id).not.toBe(fillId);

    // Data sheet fallback (works for the built-in keys even without a template)
    const sheet = await staff.agent.get(`/api/admin/cases/${c.id}/official-forms/NATIONAL_VISA/datasheet`).buffer(true).parse(binaryParser);
    expect(sheet.status).toBe(200);
    expect(sheet.headers['content-type']).toContain('application/pdf');
    expect((await staff.agent.get(`/api/admin/cases/${c.id}/official-forms/UNKNOWN_KEY/datasheet`)).status).toBe(404);
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/UNKNOWN_KEY/fill`).send({})).status).toBe(404);
  });
});

/** Synthetic stand-ins for the official PDFs: the same field names as the shipped mappings. */
const fakeOfficialPdfs = async () => {
  const ezb = DEFAULT_TEMPLATES.find((d) => d.key === 'EMPLOYMENT_DECLARATION')!;
  const visa = DEFAULT_TEMPLATES.find((d) => d.key === 'NATIONAL_VISA')!;
  const ezbRadios: Record<string, string[]> = {
    rbtn_1_Erklaerung: ['zur Erteilung eines Aufenthaltstitels zum Zweck der Beschaeftigung', 'zur Erteilung einer Vorabzustimmung der Bundesagentur fuer Arbeit'],
    rbtn_2_Anlass: ['Ersterteilung', 'Verlaengerung', 'Arbeitgeberwechsel'],
    chbx_46_Arbeitsentgelt: ['pro Stunde', 'pro Monat'],
  };
  return {
    [ezb.url]: await makeFormPdf(specFromMapping(ezb.fieldMap, ezbRadios)),
    [visa.url]: await makeFormPdf(specFromMapping(visa.fieldMap)),
  };
};

const mockFetch = (files: Record<string, Buffer>, calls: string[] = []): Fetcher => async (url) => {
  calls.push(url);
  const buf = files[url];
  return { ok: !!buf, status: buf ? 200 : 404, arrayBuffer: async () => (buf ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : new ArrayBuffer(0)) as ArrayBuffer };
};

describe('official forms: built-in templates', () => {
  it('"Install default templates" downloads the official PDFs at runtime and applies the mapping (idempotent)', async () => {
    const admin = await asAdmin();
    const calls: string[] = [];
    officialFormDeps.fetch = mockFetch(await fakeOfficialPdfs(), calls);
    const first = expectStatus(await admin.agent.post('/api/admin/official-forms/templates/install-defaults'), 200);
    expect(first.body.results.map((r: { key: string; status: string }) => `${r.key}:${r.status}`)).toEqual(['NATIONAL_VISA:INSTALLED', 'EMPLOYMENT_DECLARATION:INSTALLED']);
    expect(first.body.results[1]).toMatchObject({ dropped: [], mapped: Object.keys(DEFAULT_TEMPLATES[1].fieldMap).length, sha256Matches: false });
    expect(calls).toEqual(DEFAULT_TEMPLATES.map((d) => d.url));
    const items = first.body.items as { key: string; active: boolean; builtIn: boolean }[];
    expect(items.every((t) => t.active && t.builtIn)).toBe(true);

    const second = expectStatus(await admin.agent.post('/api/admin/official-forms/templates/install-defaults'), 200);
    expect(second.body.results.map((r: { status: string }) => r.status)).toEqual(['EXISTS', 'EXISTS']);
    expect(calls).toHaveLength(2);
    expect(await prisma.officialFormTemplate.count()).toBe(2);
    expect((await (await asStaff()).agent.post('/api/admin/official-forms/templates/install-defaults')).status).toBe(403);
  });

  it('a failed download is reported, nothing is stored', async () => {
    const admin = await asAdmin();
    officialFormDeps.fetch = mockFetch({});
    const res = expectStatus(await admin.agent.post('/api/admin/official-forms/templates/install-defaults'), 200);
    expect(res.body.results.map((r: { status: string; reason: string }) => `${r.status}:${r.reason}`)).toEqual(['FAILED:HTTP_404', 'FAILED:HTTP_404']);
    expect(await prisma.officialFormTemplate.count()).toBe(0);
  });
});

describe('Erklärung zum Beschäftigungsverhältnis with the employer', () => {
  it('staff send it, the employer corrects and signs it in the portal; contract + history updated, SIGNED, staff notified', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    officialFormDeps.fetch = mockFetch(await fakeOfficialPdfs());
    expectStatus(await admin.agent.post('/api/admin/official-forms/templates/install-defaults'), 200);
    const employer = await asCompany();
    const { c } = await setupCase({ company: employer });
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });

    const panel = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/official-forms`), 200);
    expect(panel.body.forms.find((f: { key: string }) => f.key === 'EMPLOYMENT_DECLARATION')).toMatchObject({ canSendToEmployer: true, employerForm: true });

    const sent = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/EMPLOYMENT_DECLARATION/send-to-employer`), 201);
    const fillId = sent.body.fill.id;
    expect(sent.body.fill.status).toBe('SENT_TO_EMPLOYER');
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/EMPLOYMENT_DECLARATION/send-to-employer`)).body.error).toBe('ALREADY_SENT');
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/EMPLOYMENT_DECLARATION/fill`).send({})).body.error).toBe('SENT_TO_EMPLOYER');
    expect(await prisma.notification.count({ where: { userId: employer.user.id, type: 'OFFICIAL_FORM_REQUEST', link: `/company/forms/${fillId}` } })).toBe(1);

    // Another employer sees nothing.
    const other = await asCompany();
    expect((await other.agent.get('/api/company/forms')).body.items).toEqual([]);
    expect((await other.agent.get(`/api/company/forms/${fillId}`)).status).toBe(404);

    const list = expectStatus(await employer.agent.get('/api/company/forms'), 200);
    expect(list.body).toMatchObject({ open: 1, items: [{ id: fillId, status: 'SENT_TO_EMPLOYER', title: 'Erklärung zum Beschäftigungsverhältnis', caseNumber: c.number }] });
    const detail = expectStatus(await employer.agent.get(`/api/company/forms/${fillId}`), 200);
    const value = (key: string) => detail.body.form.fields.find((f: { key: string }) => f.key === key)?.value;
    expect(detail.body.form.editable).toBe(true);
    expect(value('contract.jobTitle')).toBe('Berufskraftfahrer');
    expect(value('contract.grossMonthly')).toBe('3200');
    expect(value('company.street')).toBe('Hafenstraße');
    expect(value('company.houseNumber')).toBe('12');
    expect(value('company.postalCode')).toBe('28195');
    expect(value('company.betriebsnummer')).toBe('');
    expect(detail.body.form.fields.some((f: { key: string }) => f.key.startsWith('client.'))).toBe(false);

    // Required answers missing → 400 with the keys
    const missing = await employer.agent.post(`/api/company/forms/${fillId}/submit`).send({ values: {} });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('REQUIRED_MISSING');
    expect(missing.body.message.split(',')).toEqual(expect.arrayContaining(['company.betriebsnummer', 'company.foundedRecently']));
    expect((await employer.agent.post(`/api/company/forms/${fillId}/submit`).send({ values: { 'contract.startDate': '1.1.2027' } })).body.error).toBe('INVALID_VALUES');

    const preview = await employer.agent.post(`/api/company/forms/${fillId}/preview`).send({ values: { 'company.betriebsnummer': '87654321' } }).buffer(true).parse(binaryParser);
    expect(preview.status).toBe(200);
    expect((await readPdfValues(preview.body as Buffer)).txtf_19_Betriebsnummer ?? null).toBeNull(); // flattened

    const submit = expectStatus(
      await employer.agent.post(`/api/company/forms/${fillId}/submit`).send({
        values: { 'company.betriebsnummer': '87654321', 'company.foundedRecently': 'no', 'contract.grossMonthly': '3500', 'contract.jobTitle': 'Berufskraftfahrer CE', 'contract.vacationDays': 28, 'employment.jobDescription': 'Fernverkehr EU' },
      }),
      200,
    );
    expect(submit.body.signerId).toBeTruthy();
    expect(submit.body.contractChanged.sort()).toEqual(['grossMonthly', 'jobTitle', 'vacationDays']);
    // contract updated, with field history on the case
    const contract = await prisma.employmentContract.findUniqueOrThrow({ where: { caseId: c.id } });
    expect(Number(contract.grossMonthly)).toBe(3500);
    expect(Number(contract.grossYearly)).toBe(42000);
    expect(contract.jobTitle).toBe('Berufskraftfahrer CE');
    expect(contract.vacationDays).toBe(28);
    const history = await prisma.fieldChange.findMany({ where: { entity: 'CASE', entityId: c.id, field: { startsWith: 'employmentContract.' } }, orderBy: { field: 'asc' } });
    expect(history.map((h) => [h.field, h.oldValue, h.newValue, h.source, h.actorId])).toEqual([
      ['employmentContract.grossMonthly', 3200, 3500, 'client', employer.user.id],
      ['employmentContract.jobTitle', 'Berufskraftfahrer', 'Berufskraftfahrer CE', 'client', employer.user.id],
      ['employmentContract.vacationDays', 26, 28, 'client', employer.user.id],
    ]);
    const visible = expectStatus(await staff.agent.get(`/api/admin/history?entity=CASE&entityId=${c.id}&field=employmentContract.`), 200);
    expect(visible.body.items.length).toBe(3);

    // Signature request for the employer's account; the employer signs in the portal.
    const fill = await prisma.officialFormFill.findUniqueOrThrow({ where: { id: fillId } });
    const req = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: fill.signatureRequestId! }, include: { signers: true } });
    expect(req).toMatchObject({ status: 'SENT', caseId: c.id, companyId: employer.company.id, createdById: staff.user.id });
    expect(req.signers).toMatchObject([{ role: 'COMPANY', userId: employer.user.id, id: submit.body.signerId }]);
    const listed = expectStatus(await employer.agent.get('/api/company/forms'), 200);
    expect(listed.body.items[0].signature).toMatchObject({ signerId: submit.body.signerId, signerStatus: 'PENDING', requestStatus: 'SENT' });
    // the PDF to sign carries the employer's values
    const toSign = await employer.agent.get(`/api/signatures/my/${submit.body.signerId}/document`).buffer(true).parse(binaryParser);
    expect(toSign.status).toBe(200);

    expectStatus(await employer.agent.post(`/api/signatures/my/${submit.body.signerId}/sign`).send({ mode: 'TYPE', typedName: 'Hans Becker', agree: true }), 200);
    const signed = await waitFor(async () => {
      const f = await prisma.officialFormFill.findUniqueOrThrow({ where: { id: fillId } });
      return f.status === 'SIGNED' ? f : null;
    });
    // signed copy in the drive folder (final) and on the case documents
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: signed.driveNodeId! }, include: { parent: true } });
    expect(node.name).toContain('(unterschrieben)');
    expect(node.parent?.name).toBe('Amtliche Formulare');
    expect(node.finalAt).not.toBeNull();
    const finalReq = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(finalReq.status).toBe('COMPLETED');
    expect(await prisma.document.count({ where: { id: finalReq.finalDocumentId!, caseId: c.id, stage: 'CONTRACT_SIGNED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'STAFF', link: { contains: 'case-official-forms' } } })).toBe(1);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'OFFICIAL_FORM_SIGNED' } })).toBe(1);
    // the company's Betriebsnummer is remembered for the next form
    // (stored in the Company legal columns since lib/partnerRecords; the legacy Setting row is no longer written)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: employer.company.id } })).betriebsnummer).toBe('87654321');

    const after = expectStatus(await employer.agent.get(`/api/company/forms/${fillId}`), 200);
    expect(after.body.form).toMatchObject({ status: 'SIGNED', editable: false });
    expect((await employer.agent.post(`/api/company/forms/${fillId}/submit`).send({ values: {} })).body.error).toBe('INVALID_STATUS');
    const casePanel = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/official-forms`), 200);
    expect(casePanel.body.forms.find((f: { key: string }) => f.key === 'EMPLOYMENT_DECLARATION').latest.status).toBe('SIGNED');
  });

  it('staff can withdraw a form from the employer; a case without employer cannot send', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    officialFormDeps.fetch = mockFetch(await fakeOfficialPdfs());
    expectStatus(await admin.agent.post('/api/admin/official-forms/templates/install-defaults'), 200);
    const { c } = await setupCase();
    const sent = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/EMPLOYMENT_DECLARATION/send-to-employer`), 201);
    const back = expectStatus(await staff.agent.post(`/api/admin/official-forms/fills/${sent.body.fill.id}/withdraw`), 200);
    expect(back.body.fill.status).toBe('DRAFT');
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/EMPLOYMENT_DECLARATION/fill`).send({}), 201);

    await prisma.case.update({ where: { id: c.id }, data: { companyId: null } });
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/EMPLOYMENT_DECLARATION/send-to-employer`)).body.error).toBe('NO_EMPLOYER');
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/official-forms/NATIONAL_VISA/send-to-employer`)).body.error).toBe('NOT_AN_EMPLOYER_FORM');
  });
});

describe('biometric photo check on upload', () => {
  it('a client photo upload returns the checklist and stores it; staff re-run it; the on-demand check stores nothing', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const c = await createCaseVia(client.agent);
    const reqs = (await clientCase(client.agent, c.id)).requirements as unknown as { id: string; key: string | null }[];
    const photo = reqs.find((r) => r.key === 'PHOTO')!;
    const passport = reqs.find((r) => r.key === 'PASSPORT')!;
    expect(photo).toBeDefined();

    const good = expectStatus(await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', photo.id).attach('file', await photoJpeg(), { filename: 'foto.jpg', contentType: 'image/jpeg' }), 201);
    expect(good.body.photoCheck).toMatchObject({ ok: true, level: 'OK', width: 827, height: 1063 });
    expect((await prisma.document.findUniqueOrThrow({ where: { id: good.body.document.id } })).photoCheck).toMatchObject({ ok: true });

    const blurred = expectStatus(await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', photo.id).attach('file', await photoJpeg({ blur: 4, bg: [110, 160, 235] }), { filename: 'foto2.jpg', contentType: 'image/jpeg' }), 201);
    expect(blurred.body.photoCheck.ok).toBe(false);
    expect(blurred.body.photoCheck.checks.filter((x: { ok: boolean }) => !x.ok).map((x: { key: string }) => x.key)).toEqual(expect.arrayContaining(['SHARPNESS', 'BG_NEUTRAL']));

    // other requirements: no photo check
    const pass = expectStatus(await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', passport.id).attach('file', await photoJpeg(), { filename: 'pass.jpg', contentType: 'image/jpeg' }), 201);
    expect(pass.body.photoCheck).toBeNull();

    // the case detail carries the stored check (client + staff)
    const detail = await clientCase(client.agent, c.id);
    const docs = (detail.requirements as unknown as { key: string; documents: { id: string; photoCheck: { ok: boolean } | null }[] }[]).find((r) => r.key === 'PHOTO')!.documents;
    expect(docs.find((d) => d.id === blurred.body.document.id)?.photoCheck?.ok).toBe(false);

    const rerun = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/documents/${pass.body.document.id}/photo-check`), 200);
    expect(rerun.body.photoCheck.ok).toBe(true);
    expect((await client.agent.post(`/api/admin/cases/${c.id}/documents/${pass.body.document.id}/photo-check`)).status).toBe(403);

    const onDemand = expectStatus(await client.agent.post('/api/photo-check').attach('file', await photoJpeg({ width: 400, height: 514 }), { filename: 'x.jpg', contentType: 'image/jpeg' }), 200);
    expect(onDemand.body.photoCheck.checks.find((x: { key: string }) => x.key === 'RESOLUTION')).toMatchObject({ ok: false, severity: 'error' });
    expect((await client.agent.post('/api/photo-check')).body.error).toBe('FILE_REQUIRED');
  });
});
