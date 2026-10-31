import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { createCaseVia, expectStatus } from '../helpers/workflow';

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
});

const IBAN = 'DE89370400440532013000';
// Days count in Baku time (UTC+4), like the server.
const day = (offset: number) => new Date(Date.now() + 4 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const dayDate = (offset: number) => new Date(`${day(offset)}T00:00:00.000Z`);

describe('referral partner legal data: create, validation, audit diff', () => {
  it('creates COMPANY and INDIVIDUAL partners with legal fields, validates them and audits a field diff on update', async () => {
    const admin = await asAdmin();

    const company = await admin.agent.post('/api/admin/partners').send({
      name: 'XTA',
      partnerType: 'COMPANY',
      companyName: 'XTA Personal GmbH',
      legalForm: 'GmbH',
      registerNumber: 'HRB 12345',
      registerCourt: 'Amtsgericht München',
      vatId: 'de 123 456 789',
      betriebsnummer: '1234 5678',
      street: 'Leopoldstr. 1',
      postalCode: '80802',
      city: 'München',
      country: 'Deutschland',
      taxId: '143/123/45678',
      signatoryName: 'Max Muster',
      signatoryRole: 'Geschäftsführer',
      email: 'info@xta.de',
      iban: IBAN,
    });
    expect(company.status).toBe(201);
    const cid = company.body.partner.id as string;
    expect(company.body.partner).toMatchObject({ vatId: 'DE123456789', betriebsnummer: '12345678', legalForm: 'GmbH', registerCourt: 'Amtsgericht München', street: 'Leopoldstr. 1' });

    const person = await admin.agent.post('/api/admin/partners').send({
      name: 'Ilgar',
      partnerType: 'INDIVIDUAL',
      street: 'Nizami küç. 10',
      postalCode: 'AZ1000',
      city: 'Bakı',
      country: 'Azərbaycan',
      taxId: '1234567890',
      phone: '+994501112233',
      preferredLanguage: 'az',
    });
    expect(person.status).toBe(201);
    const pid = person.body.partner.id as string;

    // Validation: Betriebsnummer 8 digits and only for German partners, VAT id shape, German PLZ 5 digits.
    expect((await admin.agent.patch(`/api/admin/partners/${cid}`).send({ betriebsnummer: '1234' })).body.issues?.[0]?.message).toBe('INVALID_BETRIEBSNUMMER');
    expect((await admin.agent.patch(`/api/admin/partners/${cid}`).send({ vatId: '12' })).body.issues?.[0]?.message).toBe('INVALID_VAT_ID');
    expect((await admin.agent.patch(`/api/admin/partners/${cid}`).send({ postalCode: '8080' })).body.error).toBe('INVALID_POSTAL_CODE');
    expect((await admin.agent.patch(`/api/admin/partners/${pid}`).send({ betriebsnummer: '12345678' })).body.error).toBe('BETRIEBSNUMMER_GERMANY_ONLY');
    expect((await admin.agent.post('/api/admin/partners').send({ name: 'Bad', country: 'Türkiyə', betriebsnummer: '12345678' })).body.error).toBe('BETRIEBSNUMMER_GERMANY_ONLY');
    expect((await admin.agent.patch(`/api/admin/partners/${cid}`).send({ country: 'Azərbaycan' })).body.error).toBe('BETRIEBSNUMMER_GERMANY_ONLY');

    // Update → audit with before / after of the legal fields (target = the bare partner id, like every partner route).
    expectStatus(await admin.agent.patch(`/api/admin/partners/${cid}`).send({ registerNumber: 'HRB 99999', signatoryRole: 'Prokurist', iban: 'AZ21NABZ00000000137010001944' }), 200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'PARTNER_UPDATED', target: cid }, orderBy: { createdAt: 'desc' } });
    const details = log.details as { fields: string[]; changes: Record<string, { from: unknown; to: unknown }> };
    expect(details.fields.sort()).toEqual(['iban', 'registerNumber', 'signatoryRole']);
    expect(details.changes).toEqual({ registerNumber: { from: 'HRB 12345', to: 'HRB 99999' }, signatoryRole: { from: 'Geschäftsführer', to: 'Prokurist' } });
    expect(JSON.stringify(details)).not.toContain('AZ21NABZ');

    // Contract readiness: the company is complete, the individual misses nothing either; a bare partner misses data.
    const one = expectStatus(await admin.agent.get(`/api/admin/partners/${cid}`), 200).body.partner;
    expect(one.readiness).toMatchObject({ missing: [], percent: 100 });
    const bare = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: 'Cebi', partnerType: 'COMPANY', country: 'Germany' }), 201).body.partner;
    const bareOne = expectStatus(await admin.agent.get(`/api/admin/partners/${bare.id}`), 200).body.partner;
    expect(bareOne.readiness.missing).toEqual(expect.arrayContaining(['companyName', 'legalForm', 'registerNumber', 'registerCourt', 'signatoryName']));
    expect(bareOne.readiness.percent).toBeLessThan(50);
    expect((await admin.agent.get(`/api/admin/partners/${pid}`)).body.partner.readiness.missing).toEqual([]);
  });

  it('staff see bank data masked and cannot change it; legal data is visible to staff', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const id = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: 'XTA', partnerType: 'COMPANY', legalForm: 'GmbH', vatId: 'DE123456789', iban: IBAN, bankName: 'Sparkasse' }), 201).body.partner.id;
    const seen = expectStatus(await staff.agent.get(`/api/admin/partners/${id}`), 200).body.partner;
    expect(seen).toMatchObject({ bankLocked: true, iban: '•••• 3000', bankName: '••••', legalForm: 'GmbH' });
    expect(seen.vatId).toMatch(/^•+ 6789$/); // mask group TAX_ID for staff (revealable with a reason)
    expect((await staff.agent.post('/api/admin/reveal').send({ entity: 'partner', id, field: 'vatId', reason: 'Müqavilə üçün' })).body.value).toBe('DE123456789');
    // Saving the form as loaded (masked VAT id comes back) keeps the stored value.
    expectStatus(await staff.agent.patch(`/api/admin/partners/${id}`).send({ ...seen, id: undefined, counts: undefined, city: 'Köln' }), 200);
    expect((await prisma.referralPartner.findUniqueOrThrow({ where: { id } })).vatId).toBe('DE123456789');
    const list = expectStatus(await staff.agent.get('/api/admin/partners'), 200).body;
    expect(JSON.stringify(list)).not.toContain(IBAN);
    expect(JSON.stringify(list)).not.toContain('Sparkasse');
    const csv = await staff.agent.get('/api/admin/partners/export.csv');
    expect(csv.status).toBe(200);
    expect(csv.text).not.toContain(IBAN);
    expect((await staff.agent.patch(`/api/admin/partners/${id}`).send({ iban: 'AZ21NABZ00000000137010001944' })).body.error).toBe('ADMIN_REQUIRED');
    expect((await staff.agent.patch(`/api/admin/partners/${id}`).send({ legalForm: 'AG' })).status).toBe(200);
  });
});

describe('referral partner list: search, filters, contract status, sort, CSV', () => {
  it('searches by name / company / phone / code / VÖEN and filters by type, country, tag and contract status', async () => {
    const admin = await asAdmin();
    const mk = async (body: Record<string, unknown>) => expectStatus(await admin.agent.post('/api/admin/partners').send(body), 201).body.partner as { id: string; code: string };
    const xta = await mk({ name: 'XTA', partnerType: 'COMPANY', companyName: 'XTA Personal GmbH', country: 'Deutschland', tags: ['Sürücülər'], taxId: '9988776655' });
    const ilgar = await mk({ name: 'Ilgar', phone: '+994501112233', country: 'Azərbaycan', tags: ['VIP'] });
    const cebi = await mk({ name: 'Cebi', country: 'Azərbaycan', active: false });
    const none = await mk({ name: 'Nobody' });

    // Contracts: XTA active (running PartnerContract), Ilgar expiring (legacy dates, 10 days left), Cebi expired.
    await prisma.partnerContract.create({ data: { referralPartnerId: xta.id, title: 'Kooperation', status: 'ACTIVE', startDate: dayDate(-100), endDate: dayDate(200) } });
    await prisma.partnerContract.create({ data: { referralPartnerId: none.id, title: 'Entwurf', status: 'DRAFT' } });
    await prisma.referralPartner.update({ where: { id: ilgar.id }, data: { contractStart: dayDate(-300), contractEnd: dayDate(10) } });
    await prisma.partnerContract.create({ data: { referralPartnerId: cebi.id, title: 'Alt', status: 'ACTIVE', startDate: dayDate(-400), endDate: dayDate(-5) } });

    const list = async (q: Record<string, string>) => ((await admin.agent.get('/api/admin/partners').query(q)).body.items as { id: string }[]).map((p) => p.id);
    expect(await list({ search: 'Personal GmbH' })).toEqual([xta.id]);
    expect(await list({ search: '50111' })).toEqual([ilgar.id]);
    expect(await list({ search: ilgar.code })).toEqual([ilgar.id]);
    expect(await list({ search: '9988776655' })).toEqual([xta.id]);
    expect(await list({ type: 'COMPANY' })).toEqual([xta.id]);
    expect((await list({ country: 'Azərbaycan' })).sort()).toEqual([ilgar.id, cebi.id].sort());
    expect(await list({ tag: 'vip' })).toEqual([ilgar.id]);
    expect(await list({ contract: 'active' })).toEqual([xta.id]);
    expect(await list({ contract: 'expiring' })).toEqual([ilgar.id]);
    expect(await list({ contract: 'expired' })).toEqual([cebi.id]);
    expect(await list({ contract: 'none' })).toEqual([none.id]); // a draft alone is no contract
    expect(await list({ active: 'false' })).toEqual([cebi.id]);

    const body = (await admin.agent.get('/api/admin/partners')).body;
    expect(body.facets.countries).toEqual(['Azərbaycan', 'Deutschland']);
    expect(body.facets.tags).toEqual(expect.arrayContaining(['VIP', 'Sürücülər']));
    const ilgarRow = body.items.find((p: { id: string }) => p.id === ilgar.id);
    expect(ilgarRow.contract).toMatchObject({ status: 'expiring', daysLeft: 10, legacy: true, endDate: day(10) });

    // Sorting by clients count: the partner with a case comes first descending.
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: cebi.id }), 200);
    expect((await list({ sort: 'clients', dir: 'desc' }))[0]).toBe(cebi.id);
    expect((await list({ sort: 'name', dir: 'asc' }))).toEqual([cebi.id, ilgar.id, none.id, xta.id]);
    const byActivity = await list({ sort: 'lastActivity', dir: 'desc' });
    expect(byActivity[0]).toBe(cebi.id);

    // CSV with the same filters.
    const csv = await admin.agent.get('/api/admin/partners/export.csv').query({ country: 'Azərbaycan' });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('VÖEN');
    expect(csv.text).toContain('Bitir (30 gün)');
    expect(await prisma.auditLog.count({ where: { action: 'PARTNERS_EXPORTED' } })).toBe(1);
  });
});

describe('referral partner profile: stats, legacy contract, settlements', () => {
  it('returns the header stats and converts the legacy contract dates into a PartnerContract once', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const id = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: 'Ilgar', commissionCents: 15000, contractStart: day(-30), contractEnd: day(335) }), 201).body.partner.id;
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: id }), 200);
    await prisma.partnerActivity.create({ data: { referralPartnerId: id, kind: 'CALL', body: 'Zəng edildi' } });

    const stats = expectStatus(await staff.agent.get(`/api/admin/partners/${id}/stats`), 200).body.stats;
    expect(stats.clients).toMatchObject({ total: 1, active: 1 });
    expect(stats.cases).toMatchObject({ total: 1, active: 1, approved: 0, refused: 0 });
    expect(stats.commissions).toMatchObject({ earnedCents: 15000, pendingCents: 15000, paidCents: 0 });
    expect(stats.contract).toMatchObject({ status: 'active', legacy: true, daysLeft: 335 });
    expect(stats.legacyContract).toEqual({ start: day(-30), end: day(335) });
    expect(stats.counts).toMatchObject({ activities: 1, contacts: 0, settlements: 0 });
    expect(stats.portal).toMatchObject({ hasLogin: false });
    expect(stats.lastActivityAt).toBeTruthy();
    expect((await staff.agent.get('/api/admin/partners/nope/stats')).status).toBe(404);

    const conv = await staff.agent.post(`/api/admin/partners/${id}/legacy-contract`).send({});
    expect(conv.status).toBe(201);
    expect(conv.body.contract).toMatchObject({ referralPartnerId: id, status: 'ACTIVE', startDate: day(-30), endDate: day(335) });
    const stored = await prisma.referralPartner.findUniqueOrThrow({ where: { id } });
    expect(stored.contractStart).toBeNull();
    expect(stored.contractEnd).toBeNull();
    // Once only.
    expect((await staff.agent.post(`/api/admin/partners/${id}/legacy-contract`).send({})).body.error).toBe('NO_LEGACY_CONTRACT');
    expect(await prisma.partnerContract.count({ where: { referralPartnerId: id } })).toBe(1);
    const after = (await staff.agent.get(`/api/admin/partners/${id}/stats`)).body.stats;
    expect(after.contract).toMatchObject({ status: 'active', legacy: false, count: 1 });
    expect(after.legacyContract).toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'PARTNER_LEGACY_CONTRACT_CONVERTED', target: id } });
    expect(audit.details).toMatchObject({ contractId: conv.body.contract.id, changes: { contractEnd: { from: day(335), to: null } } });

    // An expired legacy range becomes an EXPIRED contract.
    const old = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: 'Cebi', contractStart: day(-400), contractEnd: day(-35) }), 201).body.partner.id;
    expect((await admin.agent.post(`/api/admin/partners/${old}/legacy-contract`).send({ title: 'Köhnə müqavilə' })).body.contract).toMatchObject({ status: 'EXPIRED', title: 'Köhnə müqavilə' });

    // Settlement rows of the partner.
    await prisma.settlementEntry.create({ data: { partnerId: id, clientName: 'Ayan Quliyeva', amountCents: 300000, partnerShareCents: 20000 } });
    const s = expectStatus(await staff.agent.get(`/api/admin/partners/${id}/settlements`), 200).body;
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ clientName: 'Ayan Quliyeva' });
    expect(s.totals.count).toBe(1);
  });
});

describe('partner portal: own profile, change requests, own contracts', () => {
  const asPartner = async (name: string) => {
    const u = await createUser({ role: 'AGENT', firstName: name, lastName: 'Test' });
    const partner = await prisma.referralPartner.create({ data: { name, userId: u.user.id, partnerType: 'COMPANY', legalForm: 'MMC', iban: IBAN, note: 'daxili qeyd', country: 'Azərbaycan' } });
    return { ...u, partner, agent: sessionAgent(u.token) };
  };

  it('shows the legal data without internal fields, edits contact fields, sends change requests and scopes contracts', async () => {
    const admin = await asAdmin();
    const p = await asPartner('Ilgar');
    const other = await asPartner('Cebi');

    const prof = expectStatus(await p.agent.get('/api/partner/profile'), 200).body.profile;
    expect(prof).toMatchObject({ id: p.partner.id, legalForm: 'MMC', bank: { iban: '•••• 3000' } });
    expect(JSON.stringify(prof)).not.toContain('daxili qeyd');
    expect(JSON.stringify(prof)).not.toContain(IBAN);

    // Direct edit of contact fields; legal fields are refused here.
    expect((await p.agent.patch('/api/partner/profile').send({ legalForm: 'GmbH' })).status).toBe(400);
    const edited = expectStatus(await p.agent.patch('/api/partner/profile').send({ street: 'Nizami 5', city: 'Gəncə', phone: '+994551234567' }), 200).body;
    expect(edited.changed.sort()).toEqual(['city', 'phone', 'street']);
    expect(await prisma.referralPartner.findUniqueOrThrow({ where: { id: p.partner.id } })).toMatchObject({ street: 'Nizami 5', city: 'Gəncə', legalForm: 'MMC' });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'PARTNER_PORTAL_PROFILE_UPDATED', target: p.partner.id } });
    expect(log.details).toMatchObject({ changes: { city: { from: null, to: 'Gəncə' } } });
    await waitFor(() => prisma.notification.count({ where: { userId: admin.user.id, title: { contains: 'Ilgar' } } }));

    // Change request for legal data → timeline note + audit + staff notification.
    expect((await p.agent.post('/api/partner/profile/change-request').send({})).status).toBe(400);
    const req = expectStatus(await p.agent.post('/api/partner/profile/change-request').send({ changes: { legalForm: 'GmbH', vatId: 'DE123456789' }, note: 'Yeni şirkət' }), 201).body;
    const act = await prisma.partnerActivity.findUniqueOrThrow({ where: { id: req.activityId } });
    expect(act).toMatchObject({ referralPartnerId: p.partner.id, kind: 'NOTE' });
    expect(act.body).toContain('legalForm: MMC → GmbH');
    expect(await prisma.auditLog.count({ where: { action: 'PARTNER_CHANGE_REQUESTED', target: p.partner.id } })).toBe(1);
    // The legal data itself is unchanged until staff apply it.
    expect((await prisma.referralPartner.findUniqueOrThrow({ where: { id: p.partner.id } })).legalForm).toBe('MMC');

    // Contracts: own visible ones only; drafts and other partners' contracts are hidden.
    const dir = path.join(TEST_UPLOADS_DIR, 'private', 'partner-contracts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rpp-contract.pdf'), '%PDF-1.4 test');
    const mine = await prisma.partnerContract.create({ data: { referralPartnerId: p.partner.id, title: 'Kooperasiya', status: 'ACTIVE', fileName: 'Kooperasiya.pdf', filePath: 'rpp-contract.pdf', mimeType: 'application/pdf' } });
    const draft = await prisma.partnerContract.create({ data: { referralPartnerId: p.partner.id, title: 'Layihə', status: 'DRAFT', filePath: 'rpp-contract.pdf' } });
    const theirs = await prisma.partnerContract.create({ data: { referralPartnerId: other.partner.id, title: 'Cebi müqavilə', status: 'ACTIVE', filePath: 'rpp-contract.pdf' } });
    const items = expectStatus(await p.agent.get('/api/partner/contracts'), 200).body.items;
    expect(items.map((c: { id: string }) => c.id)).toEqual([mine.id]);
    expect(items[0]).toMatchObject({ hasFile: true, hasSignedFile: false, title: 'Kooperasiya' });
    expect(items[0].filePath).toBeUndefined();
    const file = await p.agent.get(`/api/partner/contracts/${mine.id}/file`).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
    expect((file.body as Buffer).toString()).toContain('%PDF');
    expect((await p.agent.get(`/api/partner/contracts/${draft.id}/file`)).status).toBe(404);
    expect((await p.agent.get(`/api/partner/contracts/${theirs.id}/file`)).status).toBe(404);
    expect((await p.agent.get(`/api/partner/contracts/${mine.id}/file?signed=1`)).status).toBe(404);
    // Staff and clients have no access to the portal endpoints.
    expect((await admin.agent.get('/api/partner/contracts')).status).toBe(403);
    expect((await (await asClient()).agent.get('/api/partner/profile')).status).toBe(403);
  });
});
