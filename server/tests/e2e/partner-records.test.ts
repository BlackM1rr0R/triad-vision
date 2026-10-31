import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { binaryParser, makePdf, SAMPLE } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { runPartnerContractJob } from '../../src/lib/partnerRecords/reminders.js';
import { lifecyclePatch, nextTerm } from '../../src/lib/partnerRecords/contracts.js';
import { companyExtras, moveCompanyExtrasToColumns, saveCompanyExtras, splitHandelsregister } from '../../src/lib/officialForms/resolve.js';
import { buildMyWork } from '../../src/lib/myWork.js';

const BASE = '/api/admin/partner-records';
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const IBAN = 'DE89370400440532013000';

const makeCompany = async (over: Record<string, unknown> = {}) =>
  prisma.company.create({ data: { name: 'Spedition Müller', legalForm: 'GmbH', city: 'Berlin', status: 'ACTIVE', ...over } });

const makePartner = () => prisma.referralPartner.create({ data: { name: `Partner ${Date.now()}`, partnerType: 'COMPANY', companyName: 'Baku Recruiting MMC', email: 'p@partner.test' } });

const EMPLOYER_BODY =
  '# Kooperationsvertrag\n// Vorlage — juristisch prüfen\nZwischen {{triad.name}} und {{company.name}}, {{company.street}}, {{company.postalCode}} {{company.city}}, Betriebsnummer {{company.betriebsnummer}}, {{company.registerNumber}}.\n## § 1 Laufzeit\nVom {{contract.startDate}} bis {{contract.endDate}}, Vergütung {{contract.value}}.\nVertreten durch {{company.signatoryName}}. Stand {{today}}.';

describe('partner contracts: CRUD, files, permissions', () => {
  it('staff create, edit, upload, download and delete a company contract; clients are refused', async () => {
    const company = await makeCompany();
    const staff = await asStaff();
    const created = expectStatus(
      await staff.agent.post(`${BASE}/contracts`).send({ companyId: company.id, title: 'Rahmenvertrag 2026', kind: 'FRAMEWORK', startDate: '2026-01-01', endDate: '2026-12-31', valueCents: 150000, noticePeriodDays: 90 }),
      201,
    ).body.contract;
    expect(created).toMatchObject({ title: 'Rahmenvertrag 2026', kind: 'FRAMEWORK', status: 'DRAFT', startDate: '2026-01-01', endDate: '2026-12-31', noticeDeadline: '2026-10-02', hasFile: false, companyId: company.id });
    expect(created.filePath).toBeUndefined();

    // validation: owner required, end before start, unknown kind
    expectStatus(await staff.agent.post(`${BASE}/contracts`).send({ title: 'X Vertrag' }), 400);
    expect((await staff.agent.post(`${BASE}/contracts`).send({ companyId: company.id, title: 'Bad', startDate: '2026-05-01', endDate: '2026-04-01' })).body.error).toBe('CONTRACT_DATES_INVALID');
    expectStatus(await staff.agent.post(`${BASE}/contracts`).send({ companyId: company.id, title: 'Bad kind', kind: 'LEASE' }), 400);
    expectStatus(await staff.agent.post(`${BASE}/contracts`).send({ companyId: 'nope', title: 'Missing owner' }), 404);

    const list = expectStatus(await staff.agent.get(`${BASE}/contracts?companyId=${company.id}`), 200).body.items;
    expect(list).toHaveLength(1);

    const upd = expectStatus(await staff.agent.patch(`${BASE}/contracts/${created.id}`).send({ title: 'Rahmenvertrag 2026/27', endDate: '2027-06-30' }), 200).body.contract;
    expect(upd).toMatchObject({ title: 'Rahmenvertrag 2026/27', endDate: '2027-06-30' });

    // upload the contract (PDF) and the signed copy (PNG scan); wrong bytes are refused
    const pdf = await makePdf('Kooperationsvertrag');
    const withFile = expectStatus(await staff.agent.post(`${BASE}/contracts/${created.id}/file`).attach('file', pdf, { filename: 'Vertrag.pdf', contentType: 'application/pdf' }), 201).body.contract;
    expect(withFile).toMatchObject({ hasFile: true, fileName: 'Vertrag.pdf', mimeType: 'application/pdf' });
    expect((await staff.agent.post(`${BASE}/contracts/${created.id}/signed`).attach('file', Buffer.from('not a pdf at all'), { filename: 'fake.pdf', contentType: 'application/pdf' })).body.error).toBe('FILE_CONTENT_MISMATCH');
    expectStatus(await staff.agent.post(`${BASE}/contracts/${created.id}/signed`).attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/octet-stream' }), 400);
    const signed = expectStatus(await staff.agent.post(`${BASE}/contracts/${created.id}/signed`).attach('file', SAMPLE.png, { filename: 'scan.png', contentType: 'image/png' }), 201).body.contract;
    // signed copy → signedAt set; started (2026-01-01) → ACTIVE
    expect(signed).toMatchObject({ hasSignedFile: true, signedFileName: 'scan.png', status: 'ACTIVE' });
    expect(signed.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const dl = await staff.agent.get(`${BASE}/contracts/${created.id}/file?download=1`).buffer(true).parse(binaryParser);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
    expect((dl.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const inline = await staff.agent.get(`${BASE}/contracts/${created.id}/signed`).buffer(true).parse(binaryParser);
    expect(inline.headers['content-type']).toMatch(/image\/png/);

    const client = await asClient();
    expectStatus(await client.agent.get(`${BASE}/contracts?companyId=${company.id}`), 403);
    expectStatus(await client.agent.get(`${BASE}/contracts/${created.id}/file`), 403);

    const removed = expectStatus(await staff.agent.delete(`${BASE}/contracts/${created.id}/signed`), 200).body.contract;
    expect(removed.hasSignedFile).toBe(false);
    expectStatus(await staff.agent.delete(`${BASE}/contracts/${created.id}`), 200);
    expectStatus(await staff.agent.get(`${BASE}/contracts/${created.id}`), 404);
    const actions = (await prisma.auditLog.findMany({ where: { target: `company:${company.id}` }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['PARTNER_CONTRACT_CREATED', 'PARTNER_CONTRACT_UPDATED', 'PARTNER_CONTRACT_FILE_UPLOADED', 'PARTNER_CONTRACT_SIGNED_UPLOADED', 'PARTNER_CONTRACT_DELETED']));
  });

  it('works the same for a referral partner owner', async () => {
    const partner = await makePartner();
    const staff = await asStaff();
    const c = expectStatus(await staff.agent.post(`${BASE}/contracts`).send({ referralPartnerId: partner.id, title: 'Provisionsvertrag', kind: 'COMMISSION' }), 201).body.contract;
    expect(c.referralPartnerId).toBe(partner.id);
    expect(expectStatus(await staff.agent.get(`${BASE}/contracts?referralPartnerId=${partner.id}`), 200).body.items).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { target: `partner:${partner.id}`, action: 'PARTNER_CONTRACT_CREATED' } })).toBe(1);
    // both or neither owner id → 400
    expectStatus(await staff.agent.get(`${BASE}/contracts?referralPartnerId=${partner.id}&companyId=x`), 400);
    expectStatus(await staff.agent.get(`${BASE}/contracts`), 400);
  });
});

describe('partner contracts: generation from a template', () => {
  it('lists the missing fields (422) before generating, then renders the PDF', async () => {
    const company = await makeCompany({ street: 'Hauptstraße 1', postalCode: '10115', signatoryName: 'Jürgen Müller' });
    const admin = await asAdmin();
    const staff = await asStaff();
    const tpl = expectStatus(await admin.agent.post('/api/admin/contract-templates').send({ name: 'Kooperationsvertrag Arbeitgeber', kind: 'EMPLOYER', language: 'de', body: EMPLOYER_BODY }), 201).body.template;
    const partnerTpl = expectStatus(await admin.agent.post('/api/admin/contract-templates').send({ name: 'Partnervertrag', kind: 'PARTNER', language: 'de', body: '# Partner\n{{partner.name}} {{partner.registerNumber}} {{contract.startDate}}' }), 201).body.template;
    // employer templates are not usable for a case
    expect((await staff.agent.post(`/api/admin/contract-templates/${tpl.id}/preview`).send({ caseId: 'x', inputs: {} })).body.error).toBe('TEMPLATE_NOT_FOR_CASE');

    const templates = expectStatus(await staff.agent.get(`${BASE}/contracts/templates?companyId=${company.id}`), 200).body.items;
    expect(templates.map((t: { id: string }) => t.id)).toEqual([tpl.id]);
    expect(templates[0].missing.map((m: { key: string }) => m.key)).toEqual(['company.betriebsnummer', 'company.registerNumber']);
    expect(templates[0].missing[0]).toEqual({ key: 'company.betriebsnummer', group: 'company', field: 'betriebsnummer' });

    // wrong kind for the owner
    expect((await staff.agent.post(`${BASE}/contracts/generate`).send({ companyId: company.id, templateId: partnerTpl.id })).body.error).toBe('TEMPLATE_KIND_MISMATCH');

    const missing = await staff.agent.post(`${BASE}/contracts/generate`).send({ companyId: company.id, templateId: tpl.id, startDate: '2026-11-01' });
    expect(missing.status).toBe(422);
    expect(missing.body.error).toBe('MISSING_FIELDS');
    expect(missing.body.missing.map((m: { key: string }) => m.key)).toEqual(['company.betriebsnummer', 'company.registerNumber', 'contract.endDate', 'contract.value']);
    expect(await prisma.partnerContract.count()).toBe(0);

    await prisma.company.update({ where: { id: company.id }, data: { betriebsnummer: '12345678', registerNumber: 'HRB 4711' } });
    const gen = expectStatus(
      await staff.agent.post(`${BASE}/contracts/generate`).send({ companyId: company.id, templateId: tpl.id, startDate: '2026-11-01', endDate: '2027-10-31', valueCents: 120000, autoRenew: true, noticePeriodDays: 60 }),
      201,
    ).body;
    expect(gen.missing).toEqual([]);
    expect(gen.contract).toMatchObject({ title: 'Kooperationsvertrag Arbeitgeber', status: 'DRAFT', hasFile: true, mimeType: 'application/pdf', templateId: tpl.id, autoRenew: true, noticePeriodDays: 60, startDate: '2026-11-01' });
    const file = await staff.agent.get(`${BASE}/contracts/${gen.contract.id}/file`).buffer(true).parse(binaryParser);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const preview = expectStatus(await staff.agent.post(`${BASE}/contracts/preview`).send({ companyId: company.id, templateId: tpl.id, startDate: '2026-11-01', endDate: '2027-10-31', valueCents: 120000 }), 200).body;
    expect(preview.text).toContain('Betriebsnummer 12345678, HRB 4711');
    expect(preview.text).toContain('Hauptstraße 1, 10115 Berlin');
    expect(preview.text).toContain('Vom 01.11.2026 bis 31.10.2027');
    expect(preview.text).toContain('Vertreten durch Jürgen Müller');
    expect(preview.text).not.toContain('juristisch prüfen');

    // regenerate into the same contract; allowMissing renders blanks
    const regen = expectStatus(await staff.agent.post(`${BASE}/contracts/generate`).send({ companyId: company.id, templateId: tpl.id, contractId: gen.contract.id, endDate: null, allowMissing: true }), 200).body;
    expect(regen.contract.id).toBe(gen.contract.id);
    expect(regen.missing.map((m: { key: string }) => m.key)).toEqual(['contract.endDate']);
    expect(await prisma.partnerContract.count()).toBe(1);

    // partner owner with a PARTNER template
    const partner = await makePartner();
    const pm = await staff.agent.post(`${BASE}/contracts/generate`).send({ referralPartnerId: partner.id, templateId: partnerTpl.id, startDate: '2026-12-01' });
    expect(pm.status).toBe(422);
    expect(pm.body.missing).toEqual([{ key: 'partner.registerNumber', group: 'partner', field: 'registerNumber' }]);
  });

  it('sends a generated contract for e-signature and files the signed copy on completion', async () => {
    const company = await makeCompany({ email: 'chef@mueller.test', signatoryName: 'Jürgen Müller', street: 'Weg 2', postalCode: '10115', betriebsnummer: '12345678', registerNumber: 'HRB 1' });
    const admin = await asAdmin();
    const tpl = expectStatus(await admin.agent.post('/api/admin/contract-templates').send({ name: 'Kooperation', kind: 'EMPLOYER', language: 'de', body: '# Kooperation\n{{company.name}} {{company.betriebsnummer}}' }), 201).body.template;
    const gen = expectStatus(await admin.agent.post(`${BASE}/contracts/generate`).send({ companyId: company.id, templateId: tpl.id }), 201).body.contract;
    const sent = expectStatus(await admin.agent.post(`${BASE}/contracts/${gen.id}/signature`).send({}), 201).body;
    expect(sent.contract.status).toBe('SENT');
    const req = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: sent.signatureRequestId }, include: { signers: true } });
    expect(req).toMatchObject({ companyId: company.id, status: 'SENT' });
    expect(req.signers.map((s) => [s.role, s.email])).toEqual([
      ['COMPANY', 'chef@mueller.test'],
      ['STAFF', admin.user.email],
    ]);
    // completion hook: the signed PDF becomes the signed copy
    const { partnerContractSigned } = await import('../../src/lib/partnerRecords/signature.js');
    await partnerContractSigned(sent.signatureRequestId, await makePdf('signed'));
    const after = expectStatus(await admin.agent.get(`${BASE}/contracts/${gen.id}`), 200).body.contract;
    expect(after).toMatchObject({ hasSignedFile: true, status: 'ACTIVE' });
    // uploaded (non-PDF) files cannot be sent
    const c2 = expectStatus(await admin.agent.post(`${BASE}/contracts`).send({ companyId: company.id, title: 'Scan only' }), 201).body.contract;
    expect((await admin.agent.post(`${BASE}/contracts/${c2.id}/signature`).send({})).body.error).toBe('PDF_REQUIRED');
  });
});

describe('partner contracts: lifecycle and reminders', () => {
  it('computes the next term and the lifecycle patch', () => {
    expect(nextTerm(d('2026-01-01'), d('2026-12-31')).map((x) => x.toISOString().slice(0, 10))).toEqual(['2027-01-01', '2027-12-31']);
    expect(nextTerm(d('2026-03-15'), d('2026-09-14')).map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-09-15', '2027-03-14']);
    expect(nextTerm(null, d('2026-06-30')).map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-07-01', '2027-06-30']);
    const now = new Date('2026-11-05T08:00:00Z');
    expect(lifecyclePatch({ status: 'DRAFT', signedAt: d('2026-10-01'), startDate: d('2026-11-01'), endDate: null, autoRenew: false }, now)?.events).toEqual(['ACTIVATED']);
    expect(lifecyclePatch({ status: 'DRAFT', signedAt: d('2026-10-01'), startDate: d('2026-12-01'), endDate: null, autoRenew: false }, now)).toBeNull();
    expect(lifecyclePatch({ status: 'TERMINATED', signedAt: null, startDate: null, endDate: d('2020-01-01'), autoRenew: true }, now)).toBeNull();
  });

  it('expires, renews and activates contracts, then reminds the creator once before the end / notice deadline', async () => {
    const company = await makeCompany();
    const staff = await asStaff();
    const now = new Date('2026-11-05T08:00:00Z');
    const base = { companyId: company.id, createdById: staff.user.id };
    const expired = await prisma.partnerContract.create({ data: { ...base, title: 'Alt', status: 'ACTIVE', startDate: d('2025-11-01'), endDate: d('2026-10-31') } });
    const renewed = await prisma.partnerContract.create({ data: { ...base, title: 'Auto', status: 'ACTIVE', autoRenew: true, startDate: d('2025-11-01'), endDate: d('2026-10-31'), reminderSentAt: new Date('2026-10-01') } });
    const activated = await prisma.partnerContract.create({ data: { ...base, title: 'Neu', status: 'SENT', signedAt: d('2026-10-20'), startDate: d('2026-11-01'), endDate: d('2027-10-31') } });
    const ending = await prisma.partnerContract.create({ data: { ...base, title: 'Endet bald', status: 'ACTIVE', startDate: d('2026-01-01'), endDate: d('2026-11-20'), reminderDays: 30 } });
    const notice = await prisma.partnerContract.create({ data: { ...base, title: 'Kündigungsfrist', status: 'ACTIVE', startDate: d('2026-01-01'), endDate: d('2027-01-31'), noticePeriodDays: 70, reminderDays: 14 } });
    const later = await prisma.partnerContract.create({ data: { ...base, title: 'Später', status: 'ACTIVE', startDate: d('2026-01-01'), endDate: d('2027-06-30'), reminderDays: 30 } });

    const r = await runPartnerContractJob(now);
    expect(r).toEqual({ activated: 1, renewed: 1, expired: 1, reminders: 1 });
    const get = (id: string) => prisma.partnerContract.findUniqueOrThrow({ where: { id } });
    expect((await get(expired.id)).status).toBe('EXPIRED');
    const rn = await get(renewed.id);
    expect([rn.status, rn.startDate?.toISOString().slice(0, 10), rn.endDate?.toISOString().slice(0, 10)]).toEqual(['ACTIVE', '2026-11-01', '2027-10-31']);
    expect(rn.reminderSentAt).toBeNull();
    expect((await get(activated.id)).status).toBe('ACTIVE');
    expect((await get(ending.id)).reminderSentAt).not.toBeNull();
    // notice deadline 2026-11-22 (end 31.01. − 70 days), reminded 14 days before → from 2026-11-08: not yet
    expect((await get(notice.id)).reminderSentAt).toBeNull();
    expect((await get(later.id)).reminderSentAt).toBeNull();
    const notes = await prisma.notification.findMany({ where: { userId: staff.user.id, type: 'PARTNER_CONTRACT_EXPIRING' } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ link: `/admin/companies/${company.id}?tab=contracts`, title: 'Müqavilə bitir: Endet bald' });
    expect(notes[0].body).toContain('20.11.2026 tarixində bitir (15 gün qalıb)');

    // idempotent: a second run sends nothing new
    expect(await runPartnerContractJob(now)).toEqual({ activated: 0, renewed: 0, expired: 0, reminders: 0 });
    // three days later the notice reminder is due
    expect((await runPartnerContractJob(new Date('2026-11-08T08:00:00Z'))).reminders).toBe(1);
    expect((await get(notice.id)).reminderSentAt).not.toBeNull();
    // audit: lifecycle events on the company
    const actions = (await prisma.auditLog.findMany({ where: { target: `company:${company.id}` } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['PARTNER_CONTRACT_EXPIRED', 'PARTNER_CONTRACT_RENEWED', 'PARTNER_CONTRACT_ACTIVATED']));
  });

  it('notifies the admins when the creator is gone and lists ending contracts in my work', async () => {
    const company = await makeCompany();
    const admin = await asAdmin();
    const now = new Date('2026-11-05T08:00:00Z');
    const c = await prisma.partnerContract.create({ data: { companyId: company.id, title: 'Ohne Ersteller', status: 'ACTIVE', startDate: d('2026-01-01'), endDate: d('2026-11-15') } });
    const work = await buildMyWork({ id: admin.user.id, role: 'ADMIN', locale: 'az', firstName: 'A', lastName: 'B' }, { team: false, now });
    const item = work.items.find((i) => i.kind === 'partner_contract');
    expect(item).toMatchObject({ id: `partner_contract:${c.id}`, title: 'Spedition Müller', link: `/admin/companies/${company.id}?tab=contracts`, note: { key: 'partnerContract.END', params: { days: 10 } } });
    expect((await runPartnerContractJob(now)).reminders).toBe(1);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'STAFF', link: `/admin/companies/${company.id}?tab=contracts` } })).toBe(1);
  });
});

describe('partner activities + audit timeline', () => {
  it('merges notes with company field changes; only the author or ADMIN+ edits an entry', async () => {
    const company = await makeCompany();
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const other = await asStaff();
    const admin = await asAdmin();
    const contact = expectStatus(await staff.agent.post(`${BASE}/contacts`).send({ companyId: company.id, firstName: 'Jürgen', lastName: 'Müller' }), 201).body.contact;
    const note = expectStatus(await staff.agent.post(`${BASE}/activities`).send({ companyId: company.id, kind: 'CALL', body: 'Telefonat: 3 Fahrer im Dezember', at: '2026-10-20T10:00:00Z', contactId: contact.id }), 201).body.activity;
    expectStatus(await staff.agent.post(`${BASE}/activities`).send({ companyId: company.id, kind: 'FAX', body: 'x' }), 400);
    const foreign = await makeCompany({ name: 'Andere GmbH' });
    const foreignContact = expectStatus(await staff.agent.post(`${BASE}/contacts`).send({ companyId: foreign.id, firstName: 'Fremd' }), 201).body.contact;
    expectStatus(await staff.agent.post(`${BASE}/activities`).send({ companyId: company.id, body: 'x', contactId: foreignContact.id }), 404);

    expectStatus(await staff.agent.patch(`/api/admin/companies/${company.id}`).send({ betriebsnummer: '1234 5678', registerCourt: 'Amtsgericht Berlin' }), 200);

    const tl = expectStatus(await staff.agent.get(`${BASE}/activities?companyId=${company.id}`), 200).body;
    const change = tl.items.find((i: { type: string; action?: string }) => i.type === 'audit' && i.action === 'COMPANY_UPDATED');
    expect(change.changes).toEqual(
      expect.arrayContaining([
        { field: 'betriebsnummer', from: null, to: '12345678' },
        { field: 'registerCourt', from: null, to: 'Amtsgericht Berlin' },
      ]),
    );
    expect(change.actor.name).toBe('Leyla Əliyeva');
    const act = tl.items.find((i: { type: string }) => i.type === 'activity');
    expect(act).toMatchObject({ id: note.id, kind: 'CALL', contact: { id: contact.id, name: 'Jürgen Müller' }, canEdit: true });
    // newest first; the activity-route audits themselves are not repeated
    expect(tl.items.map((i: { at: string }) => i.at)).toEqual([...tl.items.map((i: { at: string }) => i.at)].sort().reverse());
    expect(tl.items.some((i: { action?: string }) => i.action === 'PARTNER_ACTIVITY_CREATED')).toBe(false);
    // filters + paging
    expect(expectStatus(await staff.agent.get(`${BASE}/activities?companyId=${company.id}&kind=CHANGE`), 200).body.items.every((i: { type: string }) => i.type === 'audit')).toBe(true);
    expect(expectStatus(await staff.agent.get(`${BASE}/activities?companyId=${company.id}&audit=0`), 200).body.items).toHaveLength(1);
    const p1 = expectStatus(await staff.agent.get(`${BASE}/activities?companyId=${company.id}&pageSize=1`), 200).body;
    expect(p1.items).toHaveLength(1);
    expect(p1.total).toBeGreaterThanOrEqual(3);

    // edit rights
    expect((await other.agent.patch(`${BASE}/activities/${note.id}`).send({ body: 'hijack' })).body.error).toBe('NOT_OWN_ACTIVITY');
    expectStatus(await other.agent.delete(`${BASE}/activities/${note.id}`), 403);
    expect(expectStatus(await staff.agent.patch(`${BASE}/activities/${note.id}`).send({ body: 'Telefonat: 4 Fahrer' }), 200).body.activity.body).toBe('Telefonat: 4 Fahrer');
    expectStatus(await admin.agent.delete(`${BASE}/activities/${note.id}`), 200);
    expect(await prisma.partnerActivity.count()).toBe(0);
  });

  it('shows the partner audit entries (bare id target) for a referral partner', async () => {
    const partner = await makePartner();
    const staff = await asStaff();
    await prisma.auditLog.create({ data: { action: 'PARTNER_UPDATED', target: partner.id, details: { fields: ['city', 'iban'], changes: { city: { from: null, to: 'Gəncə' } } } } });
    expectStatus(await staff.agent.post(`${BASE}/activities`).send({ referralPartnerId: partner.id, kind: 'MEETING', body: 'Görüş' }), 201);
    const tl = expectStatus(await staff.agent.get(`${BASE}/activities?referralPartnerId=${partner.id}`), 200).body;
    expect(tl.items.map((i: { type: string }) => i.type).sort()).toEqual(['activity', 'audit']);
    expect(tl.items.find((i: { type: string }) => i.type === 'audit').changes).toEqual([
      { field: 'city', from: null, to: 'Gəncə' },
      { field: 'iban', from: null, to: null, hidden: true },
    ]);
  });
});

describe('partner contact persons', () => {
  it('keeps exactly one primary contact per owner', async () => {
    const company = await makeCompany();
    const staff = await asStaff();
    const a = expectStatus(await staff.agent.post(`${BASE}/contacts`).send({ companyId: company.id, firstName: 'Anna', lastName: 'Schmidt', position: 'HR', email: 'ANNA@Mueller.test', phone: '+49 30 1' }), 201).body.contact;
    expect(a).toMatchObject({ isPrimary: true, email: 'anna@mueller.test', name: 'Anna Schmidt', companyId: company.id });
    const b = expectStatus(await staff.agent.post(`${BASE}/contacts`).send({ companyId: company.id, firstName: 'Bernd' }), 201).body.contact;
    expect(b.isPrimary).toBe(false);
    expectStatus(await staff.agent.post(`${BASE}/contacts`).send({ companyId: company.id, firstName: 'C', email: 'not-mail' }), 400);
    const c = expectStatus(await staff.agent.post(`${BASE}/contacts`).send({ companyId: company.id, firstName: 'Clara', isPrimary: true }), 201).body.contact;
    expect(c.isPrimary).toBe(true);
    const primaries = async () => (await prisma.contact.findMany({ where: { companyId: company.id, isPrimary: true } })).map((x) => x.firstName);
    expect(await primaries()).toEqual(['Clara']);
    expectStatus(await staff.agent.patch(`${BASE}/contacts/${b.id}`).send({ isPrimary: true }), 200);
    expect(await primaries()).toEqual(['Bernd']);
    // deleting the primary promotes the oldest remaining contact
    expectStatus(await staff.agent.delete(`${BASE}/contacts/${b.id}`), 200);
    expect(await primaries()).toEqual(['Anna']);
    const list = expectStatus(await staff.agent.get(`${BASE}/contacts?companyId=${company.id}`), 200).body.items;
    expect(list.map((x: { firstName: string }) => x.firstName)).toEqual(['Anna', 'Clara']);
    // shared address-book rows
    expect(await prisma.contact.count({ where: { companyId: company.id, shared: true, company: 'Spedition Müller' } })).toBe(2);
    // partner contacts are separate
    const partner = await makePartner();
    const p = expectStatus(await staff.agent.post(`${BASE}/contacts`).send({ referralPartnerId: partner.id, firstName: 'Rəşad' }), 201).body.contact;
    expect(p).toMatchObject({ isPrimary: true, referralPartnerId: partner.id, companyId: null });
    expect(await primaries()).toEqual(['Anna']);
  });
});

describe('company legal data: validation, bank masking, employer portal', () => {
  it('validates the legal fields and keeps bank data ADMIN+ only', async () => {
    const company = await makeCompany();
    const staff = await asStaff();
    const admin = await asAdmin();
    expect((await staff.agent.patch(`/api/admin/companies/${company.id}`).send({ betriebsnummer: '1234567' })).body.issues?.[0]?.message).toBe('INVALID_BETRIEBSNUMMER');
    expectStatus(await staff.agent.patch(`/api/admin/companies/${company.id}`).send({ foundedYear: 1700 }), 400);
    const ok = expectStatus(
      await staff.agent.patch(`/api/admin/companies/${company.id}`).send({ betriebsnummer: '12345678', registerNumber: 'HRB 1', street: 'Hauptstr. 1', postalCode: '10115', country: 'Deutschland', managingDirector: 'J. Müller', foundedYear: 1999, employeeCount: '120', collectiveAgreement: 'TV Spedition' }),
      200,
    ).body;
    expect(ok.company).toMatchObject({ betriebsnummer: '12345678', employeeCount: 120, foundedYear: 1999 });
    expect(ok.completeness).toMatchObject({ total: 10 });
    expect(ok.completeness.missing).toEqual(['registerCourt', 'taxNumber']);

    expect((await staff.agent.patch(`/api/admin/companies/${company.id}`).send({ iban: IBAN })).body.error).toBe('ADMIN_REQUIRED');
    expect((await admin.agent.patch(`/api/admin/companies/${company.id}`).send({ iban: 'DE00 1234' })).body.issues?.[0]?.message).toBe('INVALID_IBAN');
    expectStatus(await admin.agent.patch(`/api/admin/companies/${company.id}`).send({ iban: 'de89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', bankName: 'Commerzbank', bankAccountHolder: 'Spedition Müller GmbH' }), 200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).iban).toBe(IBAN);

    const seenByStaff = expectStatus(await staff.agent.get(`/api/admin/companies/${company.id}`), 200).body.company;
    expect(seenByStaff).toMatchObject({ bankLocked: true, bankName: '••••', bic: '••••' });
    expect(seenByStaff.iban).toMatch(/^•+ 3000$/);
    const listed = expectStatus(await staff.agent.get('/api/admin/companies'), 200).body.items.find((c: { id: string }) => c.id === company.id);
    expect(listed.iban).not.toContain('0532');
    expect(expectStatus(await admin.agent.get(`/api/admin/companies/${company.id}`), 200).body.company).toMatchObject({ bankLocked: false, iban: IBAN, bankName: 'Commerzbank' });
    // a staff form sending the masked value back changes nothing
    expectStatus(await staff.agent.patch(`/api/admin/companies/${company.id}`).send({ iban: seenByStaff.iban, name: 'Spedition Müller & Söhne' }), 200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).iban).toBe(IBAN);
    // the audit keeps bank fields by name only
    const bankAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'COMPANY_UPDATED', actorId: admin.user.id } });
    expect(bankAudit.details).toMatchObject({ fields: expect.arrayContaining(['iban', 'bic']), changes: {} });
    // staff create with bank data → 403
    expect((await staff.agent.post('/api/admin/companies').send({ company: { name: 'Neu GmbH', sector: 'logistics', city: 'Köln', iban: IBAN } })).body.error).toBe('ADMIN_REQUIRED');
    const created = expectStatus(await staff.agent.post('/api/admin/companies').send({ company: { name: 'Neu GmbH', sector: 'logistics', city: 'Köln', betriebsnummer: '87654321', signatoryName: 'Eva' } }), 201).body.company;
    expect(created).toMatchObject({ betriebsnummer: '87654321', signatoryName: 'Eva' });

    // profile summary
    const prof = expectStatus(await staff.agent.get(`/api/admin/companies/${company.id}/profile`), 200).body;
    expect(prof).toMatchObject({ cases: { total: 0 }, vacancies: { open: 0 }, contracts: { total: 0, current: null }, invoices: null, quotes: null });
    expect(expectStatus(await admin.agent.get(`/api/admin/companies/${company.id}/profile`), 200).body.invoices).toMatchObject({ count: 0, openCents: 0 });
  });

  it('lets the employer fill the legal fields (no bank / internal ones); staff are notified and it is audited', async () => {
    const company = await makeCompany();
    const u = await createUser({ role: 'COMPANY', locale: 'de' });
    await prisma.user.update({ where: { id: u.user.id }, data: { companyId: company.id } });
    const employer = sessionAgent(u.token);
    const admin = await asAdmin();
    const res = expectStatus(await employer.patch('/api/company/me').send({ betriebsnummer: '11223344', registerNumber: 'HRB 99', registerCourt: 'AG Hamburg', signatoryName: 'Petra', iban: IBAN, note: 'hack' }), 200).body.company;
    expect(res).toMatchObject({ betriebsnummer: '11223344', registerCourt: 'AG Hamburg', signatoryName: 'Petra' });
    expect(res.iban).toBeUndefined();
    expect(res.note).toBeUndefined();
    const row = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect([row.iban, row.note]).toEqual([null, null]);
    expect((await employer.patch('/api/company/me').send({ betriebsnummer: 'abc' })).status).toBe(400);
    const a = await prisma.auditLog.findFirstOrThrow({ where: { action: 'COMPANY_PROFILE_UPDATED', target: `company:${company.id}` } });
    expect(a.details).toMatchObject({ changes: { betriebsnummer: { from: null, to: '11223344' } } });
    await expect.poll(() => prisma.notification.count({ where: { userId: admin.user.id, link: `/admin/companies/${company.id}?tab=history` } })).toBe(1);
  });
});

describe('official forms read the Company columns', () => {
  it('prefers the columns, falls back to the legacy Setting values, writes columns and moves old values once', async () => {
    const a = await makeCompany({ name: 'Alpha' });
    const b = await makeCompany({ name: 'Beta', betriebsnummer: '99999999' });
    await prisma.setting.create({ data: { key: `officialForms:company:${a.id}`, value: { betriebsnummer: '11111111', handelsregister: 'Amtsgericht München, HRB 12345', fax: '+49 89 1' } } });
    await prisma.setting.create({ data: { key: `officialForms:company:${b.id}`, value: { betriebsnummer: '22222222', fax: '+49 30 2' } } });
    await prisma.setting.create({ data: { key: 'officialForms:company:gone', value: { betriebsnummer: '33333333' } } });

    expect(await companyExtras(a.id)).toEqual({ betriebsnummer: '11111111', handelsregister: 'Amtsgericht München, HRB 12345', fax: '+49 89 1' });
    expect((await companyExtras(b.id)).betriebsnummer).toBe('99999999');
    expect(splitHandelsregister('Amtsgericht München, HRB 12345')).toEqual({ registerNumber: 'HRB 12345', registerCourt: 'Amtsgericht München' });
    expect(splitHandelsregister('HRA 77 B')).toEqual({ registerNumber: 'HRA 77 B', registerCourt: null });

    expect(await moveCompanyExtrasToColumns()).toEqual({ checked: 3, moved: 2 });
    const ra = await prisma.company.findUniqueOrThrow({ where: { id: a.id } });
    expect([ra.betriebsnummer, ra.registerNumber, ra.registerCourt, ra.fax]).toEqual(['11111111', 'HRB 12345', 'Amtsgericht München', '+49 89 1']);
    const rb = await prisma.company.findUniqueOrThrow({ where: { id: b.id } });
    expect([rb.betriebsnummer, rb.fax]).toEqual(['99999999', '+49 30 2']); // a filled column is never overwritten
    expect(await moveCompanyExtrasToColumns()).toEqual({ checked: 3, moved: 0 }); // idempotent
    expect(await prisma.setting.count({ where: { key: { startsWith: 'officialForms:company:' } } })).toBe(3); // rows kept

    await saveCompanyExtras(a.id, { betriebsnummer: '44444444', handelsregister: 'AG Köln HRB 5' });
    const wa = await prisma.company.findUniqueOrThrow({ where: { id: a.id } });
    expect([wa.betriebsnummer, wa.registerNumber, wa.registerCourt]).toEqual(['44444444', 'HRB 5', 'AG Köln']);
    expect(((await prisma.setting.findUniqueOrThrow({ where: { key: `officialForms:company:${a.id}` } })).value as { betriebsnummer: string }).betriebsnummer).toBe('11111111');
    expect(await companyExtras(a.id)).toMatchObject({ betriebsnummer: '44444444', handelsregister: 'AG Köln, HRB 5' });
  });

  it('fills the company.* placeholders of case contract templates from the new columns', async () => {
    const company = await makeCompany({ street: 'Industriestr. 5', postalCode: '20095', city: 'Hamburg', betriebsnummer: '12345678', registerNumber: 'HRB 1', signatoryName: 'Petra Lang' });
    const admin = await asAdmin();
    const client = await asClient();
    const c = await prisma.case.create({ data: { clientId: client.user.id, number: `TV-2026-${Date.now()}`, profession: 'Fahrer', companyId: company.id } });
    const tpl = expectStatus(
      await admin.agent.post('/api/admin/contract-templates').send({ name: 'Arbeitsvertrag', kind: 'WORK', body: '# AV\n{{company.name}}, {{company.address}}, BNR {{company.betriebsnummer}}, {{company.registerNumber}}, vertreten durch {{company.signatoryName}}' }),
      201,
    ).body.template;
    const prev = expectStatus(await admin.agent.post(`/api/admin/contract-templates/${tpl.id}/preview`).send({ caseId: c.id, inputs: {} }), 200).body;
    expect(prev.text).toContain('Spedition Müller GmbH, Industriestr. 5, 20095 Hamburg, BNR 12345678, HRB 1, vertreten durch Petra Lang');
    expect(prev.missing).toEqual([]);
  });
});
