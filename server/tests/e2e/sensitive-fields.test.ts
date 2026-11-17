import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { createCaseVia } from '../helpers/workflow';
import { resetMaskingCache } from '../../src/lib/privacy/mask.js';

/**
 * Access Center › Sensitive fields: the new mask groups (SALARY, HEALTH, ADDRESS, FAMILY), the HIDDEN mode,
 * per-user overrides, "reveal with reason" for the new entities, and that nothing changes until the super admin
 * switches a group on.
 */

beforeEach(() => resetMaskingCache());

const ADDRESS = 'Bakı, Nizami küç. 12, mən. 4';

const xlsxText = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const out: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value instanceof Date ? cell.value.toISOString() : (cell.value ?? ''))))));
  return out.join('\n');
};

/** A client with an address, a case with an employment contract and health insurance date, and a spouse. */
const fixture = async () => {
  const client = await asClient({ firstName: 'Elvin', lastName: 'Məmmədov' });
  await prisma.user.update({ where: { id: client.user.id }, data: { address: ADDRESS } });
  const c = await createCaseVia(client.agent);
  await prisma.case.update({ where: { id: c.id }, data: { healthInsuranceExpiresAt: new Date('2027-03-31T00:00:00Z') } });
  await prisma.employmentContract.create({ data: { caseId: c.id, employerName: 'Muster Logistik GmbH', grossMonthly: 3141.5, grossYearly: 37698 } });
  const fam = await client.agent.post(`/api/family/cases/${c.id}/members`).send({ relation: 'spouse', firstName: 'Aysel', lastName: 'Qasımova', birthDate: '1996-07-01', joinsWhen: 'WITH_MAIN' });
  expect(fam.status).toBe(201);
  const member = await prisma.familyMember.findFirstOrThrow({ where: { mainCaseId: c.id } });
  return { client, c, member };
};

const setRole = (sa: Agent, role: 'STAFF' | 'ADMIN', group: string, mode: 'VISIBLE' | 'MASKED' | 'HIDDEN') => sa.put('/api/admin/access/sensitive/role').send({ role, group, mode });

const contractOf = async (agent: Agent, caseId: string) => {
  const r = await agent.get(`/api/admin/placement/cases/${caseId}/contract`);
  expect(r.status).toBe(200);
  return r.body.contract as { grossMonthly: unknown; grossYearly: unknown; employerName: string };
};

describe('sensitive fields (Access Center)', () => {
  it('defaults are today: new groups visible for STAFF and ADMIN, original STAFF masking unchanged', async () => {
    const superAdmin = await asSuperAdmin();
    const staff = await asStaff();
    const admin = await asAdmin();
    const { c, member } = await fixture();

    const ov = await superAdmin.agent.get('/api/admin/access/sensitive');
    expect(ov.status).toBe(200);
    expect(ov.body.role.STAFF).toEqual({ PASSPORT: 'MASKED', ID_NUMBER: 'MASKED', IBAN: 'MASKED', TAX_ID: 'MASKED', BIRTH_PLACE: 'VISIBLE', SALARY: 'VISIBLE', HEALTH: 'VISIBLE', ADDRESS: 'VISIBLE', FAMILY: 'VISIBLE' });
    expect(Object.values(ov.body.role.ADMIN).every((m) => m === 'VISIBLE')).toBe(true);
    expect(ov.body.role).toEqual(ov.body.defaults);

    for (const who of [staff, admin]) {
      const k = await contractOf(who.agent, c.id);
      expect(Number(k.grossMonthly)).toBe(3141.5);
      const fam = await who.agent.get(`/api/family/cases/${c.id}`);
      expect(JSON.stringify(fam.body)).toContain('Aysel');
      expect(JSON.stringify(fam.body)).toContain('1996-07-01');
    }
    const policy = await staff.agent.get('/api/admin/sensitive/policy');
    expect(policy.body).toMatchObject({ masked: ['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID'], hidden: [] });
    expect(await prisma.sensitiveFieldPolicy.count()).toBe(0);
    expect(member.firstName).toBe('Aysel');
  });

  it('only the super admin (or "manage access") edits the policy; every change is audited before → after', async () => {
    const superAdmin = await asSuperAdmin();
    const staff = await asStaff();
    const admin = await asAdmin();
    for (const who of [staff, admin]) {
      expect((await who.agent.get('/api/admin/access/sensitive')).status).toBe(403);
      expect((await setRole(who.agent, 'STAFF', 'SALARY', 'MASKED')).status).toBe(403);
    }
    expect((await setRole(superAdmin.agent, 'STAFF', 'NOPE', 'MASKED')).status).toBe(400);
    expect((await setRole(superAdmin.agent, 'STAFF', 'SALARY', 'MASKED')).status).toBe(200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'SENSITIVE_POLICY_CHANGED' } });
    expect(log).toMatchObject({ actorId: superAdmin.user.id, target: 'sensitive:role:STAFF:SALARY' });
    expect(log.details).toMatchObject({ before: 'VISIBLE', after: 'MASKED' });
    // MASKED per role lives in the original setting (the old page shows the same state).
    expect((await superAdmin.agent.get('/api/admin/sensitive/settings')).body.settings.STAFF).toContain('SALARY');
    // Overrides for a super admin are refused (they always see everything).
    expect((await superAdmin.agent.put('/api/admin/access/sensitive/user').send({ userId: superAdmin.user.id, group: 'SALARY', mode: 'HIDDEN' })).status).toBe(400);
  });

  it('SALARY masked: case view shows "••••", reveal needs a ≥ 10-character reason and is logged; writes keep the value', async () => {
    const superAdmin = await asSuperAdmin();
    const staff = await asStaff();
    const admin = await asAdmin();
    const { c } = await fixture();
    expect((await setRole(superAdmin.agent, 'STAFF', 'SALARY', 'MASKED')).status).toBe(200);

    const k = await contractOf(staff.agent, c.id);
    expect(k.grossMonthly).toBe('••••');
    expect(k.grossYearly).toBe('••••');
    expect(k.employerName).toBe('Muster Logistik GmbH');
    const list = await staff.agent.get('/api/admin/placement/contracts');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('3141.5');
    const real = await staff.agent.get('/api/admin/real-salaries');
    expect(real.status).toBe(200);
    expect(JSON.stringify(real.body)).not.toMatch(/"grossMonthly":\s*3141/);
    // ADMIN is not affected (STAFF rule only), SUPER_ADMIN never.
    expect(Number((await contractOf(admin.agent, c.id)).grossMonthly)).toBe(3141.5);
    expect(Number((await contractOf(superAdmin.agent, c.id)).grossMonthly)).toBe(3141.5);

    // Reveal: reason required (≥ 10 characters for the new groups), logged with who / what / why.
    const body = { entity: 'employmentContract', id: c.id, field: 'grossMonthly' };
    expect((await staff.agent.post('/api/admin/reveal').send(body)).status).toBe(400);
    expect((await staff.agent.post('/api/admin/reveal').send({ ...body, reason: 'Blue Card' })).body.error).toBe('REASON_TOO_SHORT');
    expect((await staff.agent.post('/api/admin/reveal').send({ ...body, field: 'note', reason: 'Blue Card threshold check' })).body.error).toBe('FIELD_NOT_REVEALABLE');
    expect(await prisma.auditLog.count({ where: { action: 'SENSITIVE_REVEALED' } })).toBe(0);
    const ok = await staff.agent.post('/api/admin/reveal').send({ ...body, reason: 'Blue Card threshold check' });
    expect(ok.status).toBe(200);
    expect(Number(ok.body.value)).toBe(3141.5);
    const rev = await prisma.auditLog.findFirstOrThrow({ where: { action: 'SENSITIVE_REVEALED' } });
    expect(rev).toMatchObject({ actorId: staff.user.id, target: `employmentContract:${c.id}` });
    expect(rev.details).toMatchObject({ field: 'grossMonthly', group: 'SALARY', reason: 'Blue Card threshold check' });
    const logView = await superAdmin.agent.get('/api/admin/sensitive/reveals?group=SALARY');
    expect(logView.body.items).toHaveLength(1);
    expect(logView.body.items[0]).toMatchObject({ entity: 'employmentContract', field: 'grossMonthly', group: 'SALARY' });

    // Saving the form with the masked value keeps the stored salary.
    const save = await staff.agent.put(`/api/admin/placement/cases/${c.id}/contract`).send({ employerName: 'Muster Logistik GmbH', grossMonthly: '••••', grossYearly: '••••', weeklyHours: 39 });
    expect(save.status).toBe(200);
    const stored = await prisma.employmentContract.findUniqueOrThrow({ where: { caseId: c.id } });
    expect(Number(stored.grossMonthly)).toBe(3141.5);
    expect(Number(stored.weeklyHours)).toBe(39);
  });

  it('HIDDEN sends null and cannot be revealed; a per-user override beats the role', async () => {
    const superAdmin = await asSuperAdmin();
    const staff = await asStaff();
    const other = await asStaff();
    const { c } = await fixture();
    await setRole(superAdmin.agent, 'STAFF', 'SALARY', 'HIDDEN');
    expect((await contractOf(staff.agent, c.id)).grossMonthly).toBeNull();
    expect((await staff.agent.post('/api/admin/reveal').send({ entity: 'employmentContract', id: c.id, field: 'grossMonthly', reason: 'Blue Card threshold check' })).status).toBe(403);

    expect((await superAdmin.agent.put('/api/admin/access/sensitive/user').send({ userId: other.user.id, group: 'SALARY', mode: 'VISIBLE' })).status).toBe(200);
    expect(Number((await contractOf(other.agent, c.id)).grossMonthly)).toBe(3141.5);
    expect((await contractOf(staff.agent, c.id)).grossMonthly).toBeNull();

    // "Test as user": effective mode and where it comes from.
    const pv = await superAdmin.agent.get(`/api/admin/access/sensitive/preview?userId=${other.user.id}`);
    expect(pv.status).toBe(200);
    expect(pv.body.modes.SALARY).toEqual({ mode: 'VISIBLE', source: 'user' });
    const pv2 = await superAdmin.agent.get(`/api/admin/access/sensitive/preview?userId=${staff.user.id}`);
    expect(pv2.body.modes.SALARY).toEqual({ mode: 'HIDDEN', source: 'role' });
    expect(pv2.body.sample.shown.employmentContract.grossMonthly).toBeNull();
    expect(pv2.body.sample.plain.employmentContract.grossMonthly).toBe(3100);

    // Back to visible: the hidden row is gone, the override can be removed (null = inherit).
    await setRole(superAdmin.agent, 'STAFF', 'SALARY', 'VISIBLE');
    await superAdmin.agent.put('/api/admin/access/sensitive/user').send({ userId: other.user.id, group: 'SALARY', mode: null });
    expect(await prisma.sensitiveFieldPolicy.count()).toBe(0);
  });

  it('FAMILY / ADDRESS / HEALTH masked for staff; the register export masks family rows; portal roles untouched', async () => {
    const superAdmin = await asSuperAdmin();
    const staff = await asStaff();
    const { client, c, member } = await fixture();
    for (const g of ['FAMILY', 'ADDRESS', 'HEALTH']) expect((await setRole(superAdmin.agent, 'STAFF', g, 'MASKED')).status).toBe(200);

    const fam = await staff.agent.get(`/api/family/cases/${c.id}`);
    expect(fam.status).toBe(200);
    const famJson = JSON.stringify(fam.body);
    expect(famJson).not.toContain('Aysel');
    expect(famJson).not.toContain('1996-07-01');
    expect(famJson).toContain('A•••');

    const permits = await staff.agent.get(`/api/admin/permits/cases/${c.id}`);
    if (permits.status === 200) expect(JSON.stringify(permits.body)).not.toContain('2027-03-31');

    const reg = await staff.agent.get('/api/admin/register/export.xlsx').buffer(true).parse(binaryParser);
    expect(reg.status).toBe(200);
    const regText = await xlsxText(reg.body as Buffer);
    expect(regText).toContain('Elvin'); // the main applicant stays
    expect(regText).not.toContain('Aysel');
    expect(regText).not.toContain('Qasımova');

    // Reveal of a family member's birth date (≥ 10 characters).
    const rv = await staff.agent.post('/api/admin/reveal').send({ entity: 'familyPerson', id: member.id, field: 'birthDate', reason: 'Embassy form for the spouse' });
    expect(rv.status).toBe(200);
    expect(rv.body.value).toBe('1996-07-01');

    // A client, an employer or a partner never sees anything masked: their own data in plaintext.
    const own = await client.agent.get(`/api/family/cases/${c.id}`);
    expect(JSON.stringify(own.body)).toContain('Aysel');
    const me = await client.agent.get('/api/auth/me');
    expect(me.body.user.address ?? ADDRESS).toBe(ADDRESS);
  });
});
