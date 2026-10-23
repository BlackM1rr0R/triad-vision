import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { createCaseVia } from '../helpers/workflow';
import { createCompany } from './vacancies.fixtures';
import { parseMrz } from '../../src/lib/docsIntel/mrz.js';
import { maskJson, maskValue, resetMaskingCache, stripMaskedInput, type MaskGroup } from '../../src/lib/privacy/mask.js';

const PASSPORT = 'C01X00T47';
const IBAN = 'DE89 3704 0044 0532 0130 00';
const VAT = 'DE123456789';
const SPECIMEN = parseMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10', new Date('2026-10-15T00:00:00Z'));

beforeEach(() => resetMaskingCache());

const xlsxText = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const out: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value ?? '')))));
  return out.join('\n');
};

/** A client with a passport number and one case assigned to a referral partner. */
const fixture = async () => {
  const client = await asClient({ firstName: 'Kamran', lastName: 'Həsənov' });
  await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: PASSPORT } });
  const c = await createCaseVia(client.agent);
  const partner = await prisma.referralPartner.create({ data: { name: uniq('Partner ') } });
  await prisma.case.update({ where: { id: c.id }, data: { partnerId: partner.id } });
  const company = await createCompany({ vatId: VAT });
  return { client, c, partner, company };
};

describe('sensitive data masking', () => {
  it('helpers: last 3–4 characters stay, labels and non-numbers are untouched, VIDEX pairs are masked', () => {
    expect(maskValue(PASSPORT)).toBe('•••• T47');
    expect(maskValue('DE89370400440532013000')).toBe('•••• 3000');
    const all = new Set<MaskGroup>(['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID', 'BIRTH_PLACE']);
    const body = {
      labels: { passportNumber: 'Pass-Nr.', vatId: 'USt-IdNr.' },
      client: { passportNumber: PASSPORT, name: 'Kamran' },
      bank: { iban: IBAN, bic: 'COBADEFFXXX' },
      fields: [
        { key: 'passportNumber', value: PASSPORT, source: 'passport' },
        { key: 'birthDate', value: '12.08.1974', source: 'passport' },
        { key: 'placeOfBirth', value: 'Gəncə', source: 'document' },
      ],
      when: new Date('2026-01-01T00:00:00Z'),
    };
    const m = maskJson(all, body) as typeof body;
    expect(m.labels).toEqual(body.labels);
    expect(m.client).toEqual({ passportNumber: '•••• T47', name: 'Kamran' });
    expect(m.bank.iban).toBe('•••• 3000');
    expect(m.bank.bic).toBe('•••• FXXX');
    expect(m.fields[0].value).toBe('•••• T47');
    expect(m.fields[1].value).toBe('12.08.1974');
    expect(m.fields[2].value).toBe('••••');
    expect(m.when).toBe(body.when);
    expect(body.client.passportNumber).toBe(PASSPORT); // the input is never mutated
    expect(maskJson(new Set(), body)).toBe(body);

    const input = { passportNumber: '•••• T47', firstName: 'X', changes: [{ caseId: 'a', field: 'passportNumber', value: '•••• T47' }, { caseId: 'a', field: 'phone', value: '+1' }] };
    expect(stripMaskedInput(input)).toEqual({ firstName: 'X', changes: [{ caseId: 'a', field: 'phone', value: '+1' }] });
  });

  it('STAFF get masked values on the register, partner, company and OCR endpoints (and in exports)', async () => {
    const staff = await asStaff();
    const { client, c, partner, company } = await fixture();

    const reg = await staff.agent.get('/api/admin/register');
    expect(reg.status).toBe(200);
    expect(JSON.stringify(reg.body)).not.toContain(PASSPORT);
    const row = (reg.body.rows as { id: string; passportNumber: string | null }[]).find((r) => r.id === c.id);
    expect(row?.passportNumber).toBe('•••• T47');

    const regX = await staff.agent.get('/api/admin/register/export.xlsx').buffer(true).parse(binaryParser);
    expect(regX.status).toBe(200);
    const regText = await xlsxText(regX.body as Buffer);
    expect(regText).toContain('•••• T47');
    expect(regText).not.toContain(PASSPORT);

    const p = await staff.agent.get(`/api/admin/partners/${partner.id}`);
    expect(p.status).toBe(200);
    expect(p.body.cases[0].client.passportNumber).toBe('•••• T47');
    const pX = await staff.agent.get(`/api/admin/partners/${partner.id}/export.xlsx`).buffer(true).parse(binaryParser);
    expect(pX.status).toBe(200);
    expect(await xlsxText(pX.body as Buffer)).not.toContain(PASSPORT);

    const co = await staff.agent.get(`/api/admin/companies/${company.id}`);
    expect(co.status).toBe(200);
    expect(JSON.stringify(co.body)).not.toContain(VAT);
    const list = await staff.agent.get('/api/admin/companies');
    expect(JSON.stringify(list.body)).not.toContain(VAT);

    const doc = await prisma.document.create({
      data: { caseId: c.id, stage: 'INITIAL', originalName: 'passport.png', storedName: `${uniq('p')}.png`, mimeType: 'image/png', size: 10, uploadedById: client.user.id, ocr: { mrz: SPECIMEN, raw: `PASSPORT\n${SPECIMEN!.lines[1]}\nNo. ${SPECIMEN!.documentNumber}`, confidence: 90, at: new Date().toISOString() } as unknown as Prisma.InputJsonValue, ocrAt: new Date() },
    });
    const ocr = await staff.agent.get(`/api/documents/${doc.id}/ocr`);
    expect(ocr.status).toBe(200);
    const ocrJson = JSON.stringify(ocr.body);
    expect(ocrJson).not.toContain(SPECIMEN!.documentNumber);
    expect(ocrJson).not.toContain(PASSPORT);
    expect(ocr.body.ocr.mrz.surname).toBe('ERIKSSON');

    // The client sees their own data in plaintext.
    expect((await client.agent.get('/api/auth/me')).body.user.passportNumber).toBe(PASSPORT);
    expect(JSON.stringify((await client.agent.get(`/api/documents/${doc.id}/ocr`)).body)).toContain(SPECIMEN!.documentNumber);
  });

  it('ADMIN see plaintext by default and masked values when the super admin enables it; SUPER_ADMIN always plaintext', async () => {
    const admin = await asAdmin();
    const superAdmin = await asSuperAdmin();
    const { partner, company } = await fixture();
    const agentUser = await createUser({ role: 'AGENT' });
    const agentRow = await prisma.agent.create({ data: { userId: agentUser.user.id, code: uniq('AG').toUpperCase().slice(0, 30), iban: IBAN.replace(/\s/g, '') } });
    await prisma.setting.upsert({
      where: { key: 'invoicing' },
      create: { key: 'invoicing', value: { accountHolder: 'Triad', iban: IBAN, bic: 'COBADEFFXXX', bank: 'Bank' } },
      update: { value: { accountHolder: 'Triad', iban: IBAN, bic: 'COBADEFFXXX', bank: 'Bank' } },
    });

    expect((await admin.agent.get(`/api/admin/partners/${partner.id}`)).body.cases[0].client.passportNumber).toBe(PASSPORT);
    expect((await admin.agent.get(`/api/admin/agents/${agentRow.id}`)).text).toContain(IBAN.replace(/\s/g, ''));

    // Settings: SUPER_ADMIN only.
    expect((await admin.agent.get('/api/admin/sensitive/settings')).status).toBe(403);
    expect((await admin.agent.put('/api/admin/sensitive/settings').send({ STAFF: [], ADMIN: [] })).status).toBe(403);
    const s0 = await superAdmin.agent.get('/api/admin/sensitive/settings');
    expect(s0.body.settings).toEqual({ STAFF: ['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID'], ADMIN: [] });
    expect((await superAdmin.agent.put('/api/admin/sensitive/settings').send({ STAFF: ['NOPE'], ADMIN: [] })).status).toBe(400);
    const put = await superAdmin.agent.put('/api/admin/sensitive/settings').send({ STAFF: ['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID'], ADMIN: ['PASSPORT', 'IBAN'] });
    expect(put.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'MASKING_SETTINGS_CHANGED' } })).toBe(1);

    expect((await admin.agent.get(`/api/admin/partners/${partner.id}`)).body.cases[0].client.passportNumber).toBe('•••• T47');
    const ag = await admin.agent.get(`/api/admin/agents/${agentRow.id}`);
    expect(ag.text).not.toContain(IBAN.replace(/\s/g, ''));
    expect(ag.text).toContain('•••• 3000');
    // Tax ids stay visible for admins (not in their list).
    expect((await admin.agent.get(`/api/admin/companies/${company.id}`)).text).toContain(VAT);

    const inv = await admin.agent.get('/api/admin/invoices/settings');
    expect(inv.body.invoicing.iban).toBe('•••• 3000');
    // Saving the form with the masked IBAN keeps the stored one.
    const save = await admin.agent.put('/api/admin/invoices/settings').send({ ...inv.body.invoicing, bank: 'New Bank' });
    expect(save.status).toBe(200);
    const stored = (await prisma.setting.findUniqueOrThrow({ where: { key: 'invoicing' } })).value as Record<string, string>;
    expect(stored.iban.replace(/\s/g, '')).toBe(IBAN.replace(/\s/g, ''));
    expect(stored.bank).toBe('New Bank');
    expect(stored.bic).toBe('COBADEFFXXX');

    // An admin's own profile is never masked.
    expect((await admin.agent.get('/api/auth/me')).status).toBe(200);

    // SUPER_ADMIN: plaintext regardless of the settings.
    expect((await superAdmin.agent.get(`/api/admin/partners/${partner.id}`)).body.cases[0].client.passportNumber).toBe(PASSPORT);
    expect((await superAdmin.agent.get('/api/admin/invoices/settings')).body.invoicing.iban.replace(/\s/g, '')).toBe(IBAN.replace(/\s/g, ''));
  });

  it('STAFF writes with masked values never overwrite the plaintext', async () => {
    const staff = await asStaff();
    const { c, company } = await fixture();
    const patch = await staff.agent.patch(`/api/admin/companies/${company.id}`).send({ vatId: '•••• 6789', city: 'Berlin' });
    expect(patch.status).toBe(200);
    const fresh = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(fresh).toMatchObject({ vatId: VAT, city: 'Berlin' });

    const reg = await staff.agent.patch('/api/admin/register').send({ changes: [{ caseId: c.id, field: 'passportNumber', value: '•••• T47' }, { caseId: c.id, field: 'firstName', value: 'Kamal' }] });
    expect(reg.status).toBe(200);
    const u = await prisma.user.findFirstOrThrow({ where: { cases: { some: { id: c.id } } } });
    expect(u).toMatchObject({ passportNumber: PASSPORT, firstName: 'Kamal' });
  });

  it('reveal: requires a reason, returns the plaintext once, is audited and role-checked', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const superAdmin = await asSuperAdmin();
    const { client, company } = await fixture();
    const agentUser = await createUser({ role: 'AGENT' });
    const agentRow = await prisma.agent.create({ data: { userId: agentUser.user.id, code: uniq('AG').toUpperCase().slice(0, 30), iban: 'DE89370400440532013000' } });

    expect((await staff.agent.post('/api/admin/reveal').send({ entity: 'user', id: client.user.id, field: 'passportNumber' })).status).toBe(400);
    expect((await staff.agent.post('/api/admin/reveal').send({ entity: 'user', id: client.user.id, field: 'passportNumber', reason: 'abc' })).status).toBe(400);
    expect((await staff.agent.post('/api/admin/reveal').send({ entity: 'user', id: client.user.id, field: 'email', reason: 'Embassy form' })).body.error).toBe('FIELD_NOT_REVEALABLE');
    expect((await staff.agent.post('/api/admin/reveal').send({ entity: 'user', id: 'nope', field: 'passportNumber', reason: 'Embassy form' })).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'SENSITIVE_REVEALED' } })).toBe(0);

    const ok = await staff.agent.post('/api/admin/reveal').send({ entity: 'user', id: client.user.id, field: 'passportNumber', reason: 'VIDEX form for the embassy' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ value: PASSPORT, field: 'passportNumber', visibleForSec: 60 });
    const vat = await staff.agent.post('/api/admin/reveal').send({ entity: 'company', id: company.id, field: 'vatId', reason: 'Invoice check' });
    expect(vat.body.value).toBe(VAT);

    // Agent bank details are ADMIN+ data.
    expect((await staff.agent.post('/api/admin/reveal').send({ entity: 'agent', id: agentRow.id, field: 'iban', reason: 'Payout transfer' })).status).toBe(403);
    expect((await admin.agent.post('/api/admin/reveal').send({ entity: 'agent', id: agentRow.id, field: 'iban', reason: 'Payout transfer' })).body.value).toBe('DE89370400440532013000');
    expect((await client.agent.post('/api/admin/reveal').send({ entity: 'user', id: client.user.id, field: 'passportNumber', reason: 'my own data' })).status).toBe(403);

    const logs = await prisma.auditLog.findMany({ where: { action: 'SENSITIVE_REVEALED' }, orderBy: { createdAt: 'asc' } });
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatchObject({ actorId: staff.user.id, target: `user:${client.user.id}` });
    expect(logs[0].details).toMatchObject({ entity: 'user', id: client.user.id, field: 'passportNumber', reason: 'VIDEX form for the embassy' });

    // Reveal log: SUPER_ADMIN only, filters, CSV.
    expect((await admin.agent.get('/api/admin/sensitive/reveals')).status).toBe(403);
    expect((await staff.agent.get('/api/admin/sensitive/reveals.csv')).status).toBe(403);
    const all = await superAdmin.agent.get('/api/admin/sensitive/reveals');
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(3);
    expect(all.body.items[0]).toMatchObject({ entity: 'agent', field: 'iban', reason: 'Payout transfer' });
    expect(all.body.actors.length).toBe(2);
    expect((await superAdmin.agent.get(`/api/admin/sensitive/reveals?actorId=${staff.user.id}`)).body.items).toHaveLength(2);
    expect((await superAdmin.agent.get('/api/admin/sensitive/reveals?entity=company')).body.items).toHaveLength(1);
    expect((await superAdmin.agent.get('/api/admin/sensitive/reveals?field=passportNumber')).body.items).toHaveLength(1);
    expect((await superAdmin.agent.get('/api/admin/sensitive/reveals?q=embassy')).body.items).toHaveLength(1);
    const csv = await superAdmin.agent.get('/api/admin/sensitive/reveals.csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('VIDEX form for the embassy');
    expect(csv.text).not.toContain(PASSPORT); // the log never stores the value

    const policy = await staff.agent.get('/api/admin/sensitive/policy');
    expect(policy.body.masked).toEqual(expect.arrayContaining(['PASSPORT', 'IBAN']));
    expect((await superAdmin.agent.get('/api/admin/sensitive/policy')).body.masked).toEqual([]);
  });

  it('an admin viewing a client portal sees it masked per the admin settings', async () => {
    const superAdmin = await asSuperAdmin();
    const admin = await asAdmin();
    const { client } = await fixture();
    await superAdmin.agent.put('/api/admin/sensitive/settings').send({ STAFF: ['PASSPORT'], ADMIN: ['PASSPORT'] });
    const start = await admin.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'SUPPORT_REQUEST' });
    expect(start.status).toBe(201);
    const imp = ([] as string[]).concat(start.headers['set-cookie']).find((x) => x.startsWith('tv_imp='))!.split(';')[0];
    const { anon } = await import('../helpers/api');
    const me = await anon().get('/api/auth/me').set('Cookie', `tv_session=${admin.token}; ${imp}`);
    expect(me.body.user.id).toBe(client.user.id);
    expect(me.body.user.passportNumber).toBe('•••• T47');
  });
});
