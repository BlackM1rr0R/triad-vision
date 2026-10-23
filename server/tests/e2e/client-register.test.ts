import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { createClient } from '../helpers/factories';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { createCase } from '../../src/lib/caseFlow.js';
import { addFamilyMember } from '../../src/lib/journey/family.js';

type Row = Record<string, unknown> & { id: string; kind: string; data: Record<string, unknown> };

/** A client with a main case (+ optionally a family member case). */
const seedCase = async (opts: { firstName?: string; member?: boolean } = {}) => {
  const { user } = await createClient({ firstName: opts.firstName ?? 'Aysel', lastName: 'Məmmədova', phone: '+994501112233' });
  await prisma.user.update({ where: { id: user.id }, data: { passportNumber: 'C01234567', birthDate: new Date('1995-04-12') } });
  const main = await createCase(user.id, { profession: 'Pflege', visaType: 'WORK' });
  const member = opts.member ? await addFamilyMember(main.id, user.id, { firstName: 'Leyla', lastName: 'Məmmədova', relation: 'child', birthDate: '2015-02-01' }) : null;
  return { user, main, member };
};

const load = async (agent: Awaited<ReturnType<typeof asStaff>>['agent']) => expectStatus(await agent.get('/api/admin/register'), 200).body;

describe('client register: rows', () => {
  it('lists one row per case with client data, members under their main case, and select options', async () => {
    const staff = await asStaff({ firstName: 'Nigar', lastName: 'S' });
    const partner = await prisma.referralPartner.create({ data: { name: 'Baku Partner' } });
    const { main, member } = await seedCase({ member: true });
    await prisma.case.update({ where: { id: main.id }, data: { partnerId: partner.id, registerData: { _note: 'intern' } } });
    const body = await load(staff.agent);
    expect(body.canManageColumns).toBe(false);
    const rows = body.rows as Row[];
    expect(rows.map((r) => r.id)).toEqual([main.id, member!.id]);
    expect(rows[0]).toMatchObject({
      kind: 'main',
      number: main.number,
      firstName: 'Aysel',
      lastName: 'Məmmədova',
      passportNumber: '•••• 567', // staff see passport numbers masked (sensitive-data masking)
      birthDate: '1995-04-12',
      phone: '+994501112233',
      visaType: 'WORK',
      partnerId: partner.id,
      status: 'DOCUMENTS_PENDING',
      _note: 'intern',
      data: {},
    });
    expect(rows[1]).toMatchObject({ kind: 'member', parentId: main.id, parentNumber: main.number, relation: 'child', firstName: 'Leyla', birthDate: '2015-02-01', passportNumber: null });
    expect(rows[0]).not.toHaveProperty('clientId'); // lean rows: only what the table shows
    expect(body.options.partners).toEqual([{ id: partner.id, name: 'Baku Partner', active: true }]);
    expect(body.options.staff.map((s: { name: string }) => s.name)).toContain('Nigar S');
    expect(body.options.visaTypes).toContain('AUSBILDUNG');
  });

  it('is staff only', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/admin/register')).status).toBe(403);
    const no2fa = await asStaff({ twoFactor: false });
    expect((await no2fa.agent.get('/api/admin/register')).body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
  });
});

describe('client register: batch save', () => {
  it('saves fixed and custom fields, validates each change and audits', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const partner = await prisma.referralPartner.create({ data: { name: 'P1' } });
    const { user, main, member } = await seedCase({ member: true });
    const cols = {
      text: expectStatus(await admin.agent.post('/api/admin/register/columns').send({ label: 'Mənbə', type: 'TEXT' }), 201).body.column,
      num: expectStatus(await admin.agent.post('/api/admin/register/columns').send({ label: 'Ödəniş', type: 'NUMBER' }), 201).body.column,
      date: expectStatus(await admin.agent.post('/api/admin/register/columns').send({ label: 'Termin', type: 'DATE' }), 201).body.column,
      sel: expectStatus(await admin.agent.post('/api/admin/register/columns').send({ label: 'Mərhələ', type: 'SELECT', options: ['A', 'B'] }), 201).body.column,
      chk: expectStatus(await admin.agent.post('/api/admin/register/columns').send({ label: 'Ödənib', type: 'CHECKBOX' }), 201).body.column,
    };
    const changes = [
      { caseId: main.id, field: 'firstName', value: 'Aytən' },
      { caseId: main.id, field: 'passportNumber', value: 'c 9876 5432' },
      { caseId: main.id, field: 'phone', value: '+49 151 2345678' },
      { caseId: main.id, field: 'birthDate', value: '1990-01-02' },
      { caseId: main.id, field: 'visaType', value: 'AUSBILDUNG' },
      { caseId: main.id, field: 'partnerId', value: partner.id },
      { caseId: main.id, field: 'assignedStaffId', value: staff.user.id },
      { caseId: main.id, field: '_note', value: 'Daxili qeyd' },
      { caseId: main.id, field: cols.text.id, value: 'Instagram' },
      { caseId: main.id, field: cols.num.id, value: '1 250,5' },
      { caseId: main.id, field: cols.date.id, value: '2026-11-03' },
      { caseId: main.id, field: cols.sel.id, value: 'B' },
      { caseId: main.id, field: cols.chk.id, value: true },
      { caseId: member!.id, field: 'firstName', value: 'Lalə' },
      // invalid ones
      { caseId: main.id, field: 'status', value: 'APPROVED' },
      { caseId: member!.id, field: 'passportNumber', value: 'C11111111' },
      { caseId: main.id, field: 'lastName', value: '' },
      { caseId: main.id, field: cols.sel.id, value: 'Z' },
      { caseId: member!.id, field: cols.num.id, value: 'abc' },
      { caseId: member!.id, field: cols.date.id, value: '2026-02-30' },
      { caseId: member!.id, field: 'visaType', value: 'NOPE' },
      { caseId: member!.id, field: 'partnerId', value: 'missing' },
      { caseId: member!.id, field: 'assignedStaffId', value: user.id },
      { caseId: member!.id, field: 'nope', value: 'x' },
      { caseId: 'unknown-case', field: 'firstName', value: 'x' },
    ];
    const res = expectStatus(await staff.agent.patch('/api/admin/register').send({ changes }), 200).body;
    const errorOf = (caseId: string, field: string) => (res.results as { caseId: string; field: string; ok: boolean; error?: string }[]).find((r) => r.caseId === caseId && r.field === field);
    expect(errorOf(main.id, 'status')?.error).toBe('READ_ONLY');
    expect(errorOf(member!.id, 'passportNumber')?.error).toBe('READ_ONLY_FOR_MEMBER');
    expect(errorOf(main.id, 'lastName')?.error).toBe('REQUIRED');
    expect(errorOf(main.id, cols.sel.id)?.error).toBe('INVALID_OPTION'); // last value of the field wins
    expect(errorOf(member!.id, cols.num.id)?.error).toBe('INVALID_NUMBER');
    expect(errorOf(member!.id, cols.date.id)?.error).toBe('INVALID_DATE');
    expect(errorOf(member!.id, 'visaType')?.error).toBe('INVALID_VISA_TYPE');
    expect(errorOf(member!.id, 'partnerId')?.error).toBe('INVALID_PARTNER');
    expect(errorOf(member!.id, 'assignedStaffId')?.error).toBe('INVALID_STAFF');
    expect(errorOf(member!.id, 'nope')?.error).toBe('UNKNOWN_FIELD');
    expect(errorOf('unknown-case', 'firstName')?.error).toBe('CASE_NOT_FOUND');
    expect(res.saved).toBe(13);
    expect(res.failed).toBe(11);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u).toMatchObject({ firstName: 'Aytən', lastName: 'Məmmədova', passportNumber: 'C98765432', phone: '+491512345678' });
    expect(u.birthDate?.toISOString().slice(0, 10)).toBe('1990-01-02');
    const c = await prisma.case.findUniqueOrThrow({ where: { id: main.id } });
    expect(c).toMatchObject({ visaType: 'AUSBILDUNG', partnerId: partner.id, assignedStaffId: staff.user.id, status: 'DOCUMENTS_PENDING', staffNote: null });
    expect(c.registerData).toEqual({ _note: 'Daxili qeyd', [cols.text.id]: 'Instagram', [cols.num.id]: 1250.5, [cols.date.id]: '2026-11-03', [cols.chk.id]: true });

    const rows = res.rows as Row[];
    const mainRow = rows.find((r) => r.id === main.id)!;
    expect(mainRow).toMatchObject({ firstName: 'Aytən', _note: 'Daxili qeyd' });
    expect(mainRow.data[cols.num.id]).toBe(1250.5);
    expect(rows.find((r) => r.id === member!.id)).toMatchObject({ firstName: 'Lalə', lastName: 'Məmmədova' });

    const auditRow = await prisma.auditLog.findFirst({ where: { action: 'CLIENT_REGISTER_SAVED' } });
    expect(auditRow).toMatchObject({ actorId: staff.user.id });
    expect(auditRow?.details).toMatchObject({ changes: 13, failed: 11, cases: 2 });

    // Clearing: empty values remove custom values and clear optional client fields.
    const clear = expectStatus(
      await staff.agent.patch('/api/admin/register').send({
        changes: [
          { caseId: main.id, field: cols.chk.id, value: false },
          { caseId: main.id, field: cols.text.id, value: '' },
          { caseId: main.id, field: 'phone', value: '' },
          { caseId: main.id, field: 'partnerId', value: null },
          { caseId: main.id, field: 'phone', value: '12' },
        ],
      }),
      200,
    ).body;
    expect(clear.results.find((r: { field: string }) => r.field === 'phone').error).toBe('INVALID_PHONE');
    const after = await prisma.case.findUniqueOrThrow({ where: { id: main.id } });
    expect(after.partnerId).toBeNull();
    expect(after.registerData).toEqual({ _note: 'Daxili qeyd', [cols.num.id]: 1250.5, [cols.date.id]: '2026-11-03' });
  });

  it('rejects malformed batches', async () => {
    const staff = await asStaff();
    expect((await staff.agent.patch('/api/admin/register').send({ changes: [] })).status).toBe(400);
    expect((await staff.agent.patch('/api/admin/register').send({ changes: [{ caseId: 'x', field: 'y', value: { a: 1 } }] })).status).toBe(400);
  });
});

describe('client register: columns', () => {
  it('admins manage columns, staff only read them', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    expect((await staff.agent.post('/api/admin/register/columns').send({ label: 'X', type: 'TEXT' })).status).toBe(403);
    const a = expectStatus(await admin.agent.post('/api/admin/register/columns').send({ label: 'A', type: 'TEXT' }), 201).body.column;
    const b = expectStatus(await admin.agent.post('/api/admin/register/columns').send({ label: 'B', type: 'SELECT', options: ['x', 'y', 'x'] }), 201).body.column;
    expect(b.options).toEqual(['x', 'y']);
    expect((await admin.agent.post('/api/admin/register/columns').send({ label: 'C', type: 'SELECT', options: [] })).body.error).toBe('OPTIONS_REQUIRED');
    expect((await staff.agent.get('/api/admin/register/columns')).body.columns.map((c: { label: string }) => c.label)).toEqual(['A', 'B']);

    expect((await staff.agent.patch(`/api/admin/register/columns/${a.id}`).send({ label: 'Z' })).status).toBe(403);
    expectStatus(await admin.agent.patch(`/api/admin/register/columns/${a.id}`).send({ label: 'A2', width: 220 }), 200);
    const ordered = expectStatus(await admin.agent.put('/api/admin/register/columns/order').send({ ids: [b.id, a.id] }), 200).body.columns;
    expect(ordered.map((c: { label: string; width: number }) => [c.label, c.width])).toEqual([
      ['B', 160],
      ['A2', 220],
    ]);
    expect((await staff.agent.put('/api/admin/register/columns/order').send({ ids: [a.id, b.id] })).status).toBe(403);

    // Deleting a column removes its values from the cases.
    const { main } = await seedCase();
    await prisma.case.update({ where: { id: main.id }, data: { registerData: { [a.id]: 'v', [b.id]: 'x' } } });
    expect((await staff.agent.delete(`/api/admin/register/columns/${a.id}`)).status).toBe(403);
    const del = expectStatus(await admin.agent.delete(`/api/admin/register/columns/${a.id}`), 200).body;
    expect(del.cleaned).toBe(1);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: main.id } })).registerData).toEqual({ [b.id]: 'x' });
    expect((await admin.agent.delete(`/api/admin/register/columns/${a.id}`)).status).toBe(404);
  });
});

describe('client register: export', () => {
  it('exports a styled workbook with fixed and custom columns', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const col = expectStatus(await admin.agent.post('/api/admin/register/columns').send({ label: 'Ödəniş', type: 'NUMBER' }), 201).body.column;
    const { main } = await seedCase({ member: true });
    await prisma.case.update({ where: { id: main.id }, data: { registerData: { [col.id]: 99 } } });
    const res = await staff.agent.get('/api/admin/register/export.xlsx').set('X-Locale', 'de').buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('Kundenregister');
    expect(ws.getCell('A1').value).toBe('Antrag Nr.');
    expect(ws.getCell('A1').font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    const header = (ws.getRow(1).values as unknown[]).slice(1);
    expect(header).toContain('Ödəniş');
    expect(header).toContain('Familienmitglied');
    expect(ws.getCell('A2').value).toBe(main.number);
    expect(ws.getCell('B2').value).toBe('Aysel');
    expect(ws.getCell(2, header.indexOf('Visumart') + 1).value).toBe('Arbeitsvisum');
    expect(ws.getCell(2, header.indexOf('Ödəniş') + 1).value).toBe(99);
    expect(ws.getCell(2, header.indexOf('Geburtsdatum') + 1).value).toBeInstanceOf(Date);
    expect(ws.rowCount).toBe(3);
  });
});
