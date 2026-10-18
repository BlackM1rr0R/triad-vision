import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { createCaseVia, expectStatus } from '../helpers/workflow';

type Admin = Awaited<ReturnType<typeof asAdmin>>;

const newPartner = async (admin: Admin, name: string, commissionCents: number | null = 15000) =>
  expectStatus(await admin.agent.post('/api/admin/partners').send({ name, commissionCents }), 201).body.partner as { id: string; commissionCents: number | null; currency: string };

const newCase = async (firstName = 'Ayan', lastName = 'Quliyeva') => {
  const client = await asClient({ firstName, lastName });
  return createCaseVia(client.agent);
};

const assign = async (admin: Admin, caseIds: string[], partnerId: string | null) =>
  expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds, partnerId }), 200).body;

const rows = (partnerId: string) => prisma.partnerCommission.findMany({ where: { partnerId }, orderBy: { createdAt: 'asc' } });

describe('partner commissions: automatic on assign', () => {
  it('creates a PENDING commission on assign, idempotently, cancels it on unassign and revives it on reassign', async () => {
    const admin = await asAdmin();
    const ilqar = await newPartner(admin, 'İlqar', 15000);
    expect(ilqar).toMatchObject({ commissionCents: 15000, currency: 'EUR' });
    const envar = await newPartner(admin, 'Ənvər', 20000);
    const none = await newPartner(admin, 'Tofiq', null);
    const c1 = await newCase();
    const c2 = await newCase('Kamran', 'Əliyev');

    expect((await assign(admin, [c1.id, c2.id], ilqar.id)).commissionsCreated).toBe(2);
    expect((await rows(ilqar.id)).map((r) => [r.caseId, r.status, r.amountCents])).toEqual(
      expect.arrayContaining([
        [c1.id, 'PENDING', 15000],
        [c2.id, 'PENDING', 15000],
      ]),
    );
    // Assigning again changes nothing (no duplicate rows).
    expect((await assign(admin, [c1.id], ilqar.id)).commissionsCreated).toBe(0);
    expect(await prisma.partnerCommission.count()).toBe(2);

    // Moving a case to another partner: old pending row cancelled, new partner gets their own amount.
    await assign(admin, [c1.id], envar.id);
    expect((await prisma.partnerCommission.findUniqueOrThrow({ where: { partnerId_caseId: { partnerId: ilqar.id, caseId: c1.id } } })).status).toBe('CANCELLED');
    expect((await rows(envar.id)).map((r) => [r.caseId, r.status, r.amountCents])).toEqual([[c1.id, 'PENDING', 20000]]);

    // An approved commission is not cancelled by unassigning.
    const c2row = await prisma.partnerCommission.findUniqueOrThrow({ where: { partnerId_caseId: { partnerId: ilqar.id, caseId: c2.id } } });
    expectStatus(await admin.agent.post(`/api/admin/partners/commissions/${c2row.id}/approve`), 200);
    await assign(admin, [c1.id, c2.id], null);
    expect((await rows(envar.id))[0]!.status).toBe('CANCELLED');
    expect((await prisma.partnerCommission.findUniqueOrThrow({ where: { id: c2row.id } })).status).toBe('APPROVED');

    // Back to İlqar: the cancelled row is revived instead of duplicated.
    await assign(admin, [c1.id], ilqar.id);
    const revived = await prisma.partnerCommission.findUniqueOrThrow({ where: { partnerId_caseId: { partnerId: ilqar.id, caseId: c1.id } } });
    expect(revived).toMatchObject({ status: 'PENDING', amountCents: 15000 });
    expect(await prisma.partnerCommission.count({ where: { partnerId: ilqar.id } })).toBe(2);

    // A partner without a default amount gets no automatic commission.
    expect((await assign(admin, [c2.id], none.id)).commissionsCreated).toBe(0);
    expect(await prisma.partnerCommission.count({ where: { partnerId: none.id } })).toBe(0);

    // Totals on the partner page.
    const detail = expectStatus(await admin.agent.get(`/api/admin/partners/${ilqar.id}`), 200).body.partner;
    expect(detail.commissionTotals).toMatchObject({ pendingCents: 15000, approvedCents: 15000, paidCents: 0, totalCents: 30000, thisMonthCents: 30000 });
    const list = expectStatus(await admin.agent.get('/api/admin/partners'), 200).body.items;
    expect(list.find((p: { id: string }) => p.id === ilqar.id).commissionTotals.pendingCents).toBe(15000);
  });
});

describe('partner commissions: manual CRUD and permissions', () => {
  it('lets staff view and add PENDING rows; admins approve, pay (single and bulk) and cancel', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const partner = await newPartner(admin, 'Rauf', null);
    const other = await newPartner(admin, 'Elçin', null);
    const c = await newCase();
    await assign(admin, [c.id], partner.id);

    expect((await anon().get('/api/admin/partners/commissions')).status).toBe(401);
    expect((await (await asClient()).agent.get('/api/admin/partners/commissions')).status).toBe(403);

    const created = await staff.agent.post('/api/admin/partners/commissions').send({ partnerId: partner.id, caseId: c.id, amountCents: 5000, note: 'Razılaşma', dueAt: '2026-11-30' });
    expect(created.status).toBe(201);
    const id = created.body.commission.id as string;
    expect(created.body.commission).toMatchObject({ status: 'PENDING', amountCents: 5000, currency: 'EUR', partner: { id: partner.id, name: 'Rauf' }, case: { id: c.id } });
    // One commission per case and partner; the case must belong to the partner.
    expect((await staff.agent.post('/api/admin/partners/commissions').send({ partnerId: partner.id, caseId: c.id, amountCents: 1 })).status).toBe(409);
    expect((await staff.agent.post('/api/admin/partners/commissions').send({ partnerId: other.id, caseId: c.id, amountCents: 1 })).status).toBe(400);
    const loose = expectStatus(await staff.agent.post('/api/admin/partners/commissions').send({ partnerId: partner.id, amountCents: 2500 }), 201).body.commission;
    const loose2 = expectStatus(await admin.agent.post('/api/admin/partners/commissions').send({ partnerId: partner.id, amountCents: 1000 }), 201).body.commission;

    expect(expectStatus(await staff.agent.patch(`/api/admin/partners/commissions/${id}`).send({ amountCents: 6000 }), 200).body.commission.amountCents).toBe(6000);
    expect((await staff.agent.post(`/api/admin/partners/commissions/${id}/approve`)).status).toBe(403);
    expect((await staff.agent.post(`/api/admin/partners/commissions/${id}/pay`).send({})).status).toBe(403);
    expect((await staff.agent.post(`/api/admin/partners/commissions/${id}/cancel`).send({})).status).toBe(403);
    expect((await staff.agent.post('/api/admin/partners/commissions/bulk-pay').send({ ids: [id] })).status).toBe(403);

    expectStatus(await admin.agent.post(`/api/admin/partners/commissions/${id}/approve`), 200);
    expect((await admin.agent.post(`/api/admin/partners/commissions/${id}/approve`)).status).toBe(409);
    // Staff edit only pending rows; admins may still edit an approved one.
    expect((await staff.agent.patch(`/api/admin/partners/commissions/${id}`).send({ amountCents: 1 })).status).toBe(403);
    expectStatus(await admin.agent.patch(`/api/admin/partners/commissions/${id}`).send({ amountCents: 6500 }), 200);

    const paid = expectStatus(await admin.agent.post(`/api/admin/partners/commissions/${id}/pay`).send({ paidAt: '2026-10-05', note: 'Köçürmə #12' }), 200).body.commission;
    expect(paid).toMatchObject({ status: 'PAID', note: 'Köçürmə #12', amountCents: 6500 });
    expect(paid.paidAt.slice(0, 10)).toBe('2026-10-05');
    expect((await admin.agent.post(`/api/admin/partners/commissions/${id}/cancel`).send({})).status).toBe(409);
    expect((await admin.agent.patch(`/api/admin/partners/commissions/${id}`).send({ amountCents: 1 })).status).toBe(409);

    const bulk = expectStatus(await admin.agent.post('/api/admin/partners/commissions/bulk-pay').send({ ids: [loose.id, id], note: 'Oktyabr' }), 200).body;
    expect(bulk).toEqual({ updated: 1, skipped: 1 });
    expectStatus(await admin.agent.post(`/api/admin/partners/commissions/${loose2.id}/cancel`).send({ note: 'Səhv' }), 200);

    const list = expectStatus(await staff.agent.get(`/api/admin/partners/commissions?partnerId=${partner.id}`), 200).body;
    expect(list.total).toBe(3);
    expect(list.totals).toMatchObject({ paidCents: 6500 + 2500, paidCount: 2, cancelledCents: 1000, pendingCents: 0, totalCents: 9000 });
    const onlyPaid = expectStatus(await staff.agent.get(`/api/admin/partners/commissions?status=PAID&partnerId=${partner.id}`), 200).body;
    expect(onlyPaid.items).toHaveLength(2);
    expect((await staff.agent.get('/api/admin/partners/commissions?month=2026-13')).status).toBe(400);

    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['PARTNER_COMMISSION_CREATED', 'PARTNER_COMMISSION_APPROVED', 'PARTNER_COMMISSIONS_PAID', 'PARTNER_COMMISSION_CANCELLED']));
  });
});

describe('partner commissions: monthly Excel report and finance', () => {
  it('reports a month per partner with exact numbers and adds partner commissions to the finance summary', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const a = await newPartner(admin, 'Aqil', null);
    const b = await newPartner(admin, 'Bəhruz', null);
    const at = (s: string) => new Date(`${s}T10:00:00.000Z`);
    await prisma.partnerCommission.createMany({
      data: [
        { partnerId: a.id, amountCents: 10050, status: 'PENDING', createdAt: at('2026-03-03') },
        { partnerId: a.id, amountCents: 20000, status: 'APPROVED', createdAt: at('2026-03-10') },
        // created in February, paid in March → counts as paid in March
        { partnerId: a.id, amountCents: 30000, status: 'PAID', createdAt: at('2026-02-20'), paidAt: at('2026-03-15') },
        { partnerId: a.id, amountCents: 5000, status: 'CANCELLED', createdAt: at('2026-03-20') },
        { partnerId: b.id, amountCents: 7525, status: 'PAID', createdAt: at('2026-03-01'), paidAt: at('2026-03-31') },
        // other months: not in the March report
        { partnerId: b.id, amountCents: 99900, status: 'PENDING', createdAt: at('2026-04-02') },
        { partnerId: b.id, amountCents: 11100, status: 'PAID', createdAt: at('2026-03-05'), paidAt: at('2026-04-01') },
      ],
    });

    const res = await staff.agent.get('/api/admin/partners/commissions/export.xlsx?month=2026-03').buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    const sum = wb.getWorksheet('Xülasə')!;
    expect(sum.getRow(1).values).toEqual([undefined, 'Partnyor', 'Dövr', 'Say', 'Gözləyən, EUR', 'Təsdiqlənmiş, EUR', 'Ödənilmiş, EUR', 'Ləğv edilmiş, EUR', 'Cəmi (ləğvsiz), EUR']);
    const byName = new Map<string, unknown[]>();
    sum.eachRow((row, n) => {
      if (n > 1) byName.set(String(row.getCell(1).value), (row.values as unknown[]).slice(2));
    });
    expect(byName.get('Aqil')).toEqual(['2026-03', 3, 100.5, 200, 300, 50, 600.5]);
    // Bəhruz: the March payment of 75.25 only; the row created in March but paid in April is outside.
    expect(byName.get('Bəhruz')).toEqual(['2026-03', 1, 0, 0, 75.25, 0, 75.25]);
    expect(byName.get('Cəmi')).toEqual(['2026-03', 4, 100.5, 200, 375.25, 50, 675.75]);
    const det = wb.getWorksheet('Ətraflı')!;
    expect(det.getRow(1).getCell(2).value).toBe('Partnyor');
    // Rows created or paid in March (the April-paid row was created in March, so it is listed too).
    expect(det.rowCount - 1).toBe(6);
    const amounts: number[] = [];
    det.eachRow((row, n) => {
      if (n > 1) amounts.push(Number(row.getCell(5).value));
    });
    expect(amounts.every((x) => typeof x === 'number' && Number.isFinite(x))).toBe(true);

    // One partner only.
    const one = await staff.agent.get(`/api/admin/partners/commissions/export.xlsx?month=2026-03&partnerId=${b.id}`).buffer(true).parse(binaryParser);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(one.body as unknown as ExcelJS.Buffer);
    expect(wb2.getWorksheet('Xülasə')!.rowCount).toBe(3); // header + Bəhruz + total
    expect((await staff.agent.get('/api/admin/partners/commissions/export.xlsx?partnerId=nope')).status).toBe(404);

    // Finance (ADMIN): separate partner section, net result reduced by partner payouts.
    const Q = '?from=2026-03-01&to=2026-03-31';
    const s = expectStatus(await admin.agent.get(`/api/admin/finance/summary${Q}`), 200).body.summary;
    expect(s.partnerCommissions).toEqual({ pendingCents: 10050, pendingCount: 1, approvedCents: 20000, approvedCount: 1, paidCents: 37525, paidCount: 2 });
    expect(s.commissions).toMatchObject({ paidCents: 0 });
    expect(s.netResultCents).toBe(-37525);
    const com = expectStatus(await admin.agent.get(`/api/admin/finance/commissions${Q}`), 200).body;
    expect(com.partners.rows.map((r: { name: string; totalCents: number }) => [r.name, r.totalCents])).toEqual([
      ['Aqil', 60050],
      ['Bəhruz', 7525],
    ]);
    expect(com.partners.totals).toMatchObject({ paidCents: 37525, cancelledCents: 5000 });
    const months = expectStatus(await admin.agent.get(`/api/admin/finance/monthly${Q}`), 200).body.months;
    expect(months[0]).toMatchObject({ month: '2026-03', partnerCommissionsPaidCents: 37525 });
    expect((await staff.agent.get(`/api/admin/finance/summary${Q}`)).status).toBe(403);
  });
});

describe('partner portal logins (admin)', () => {
  it('creates an AGENT login with an invitation, links, resends and unlinks; admins only', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const partner = await newPartner(admin, 'İlqar Məmmədov', null);

    expect((await staff.agent.post(`/api/admin/partners/${partner.id}/login`).send({ email: 'ilqar@example.com' })).status).toBe(403);
    expect((await admin.agent.post(`/api/admin/partners/${partner.id}/login`).send({})).body.error).toBe('EMAIL_REQUIRED');
    // E-mail of a non-agent account cannot be linked.
    const clientUser = await createUser({ role: 'CLIENT', email: 'taken@example.com' });
    expect((await admin.agent.post(`/api/admin/partners/${partner.id}/login`).send({ email: clientUser.user.email })).body.error).toBe('EMAIL_TAKEN');

    const res = await admin.agent.post(`/api/admin/partners/${partner.id}/login`).send({ email: 'Ilqar@Example.com', phone: '+994501112233', locale: 'az' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: true, invited: true, login: { email: 'ilqar@example.com', firstName: 'İlqar', lastName: 'Məmmədov', phone: '+994501112233', isActive: true } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ilqar@example.com' } });
    expect(user.role).toBe('AGENT');
    expect((await prisma.referralPartner.findUniqueOrThrow({ where: { id: partner.id } })).userId).toBe(user.id);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: 'ilqar@example.com', subject: 'Triad Vision · Triad Vision partnyor kabinetinə dəvət' } }));
    expect((await admin.agent.post(`/api/admin/partners/${partner.id}/login`).send({ email: 'x@example.com' })).body.error).toBe('PARTNER_HAS_LOGIN');
    expect((await admin.agent.get(`/api/admin/partners/${partner.id}`)).body.partner.login).toMatchObject({ id: user.id, email: 'ilqar@example.com' });

    // Resend: a fresh token replaces the old one.
    expectStatus(await admin.agent.post(`/api/admin/partners/${partner.id}/login/invite`), 200);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);

    // The same login cannot belong to two partners.
    const other = await newPartner(admin, 'Ənvər', null);
    expect((await admin.agent.post(`/api/admin/partners/${other.id}/login`).send({ email: 'ilqar@example.com' })).body.error).toBe('USER_LINKED_TO_OTHER_PARTNER');

    // Unlink: a partner-only login is deactivated.
    expect((await staff.agent.delete(`/api/admin/partners/${partner.id}/login`)).status).toBe(403);
    expect(expectStatus(await admin.agent.delete(`/api/admin/partners/${partner.id}/login`), 200).body).toEqual({ ok: true, deactivated: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false);

    // An existing agent account is linked (and stays active when unlinked again).
    const agentUser = await createUser({ role: 'AGENT', email: 'agent@example.com' });
    await prisma.agent.create({ data: { userId: agentUser.user.id, code: 'AGENT-X' } });
    const linked = await admin.agent.post(`/api/admin/partners/${other.id}/login`).send({ email: 'agent@example.com' });
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ created: false, invited: false, login: { agentCode: 'AGENT-X' } });
    expect(expectStatus(await admin.agent.delete(`/api/admin/partners/${other.id}/login`), 200).body.deactivated).toBe(false);

    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['PARTNER_LOGIN_CREATED', 'PARTNER_LOGIN_INVITED', 'PARTNER_LOGIN_UNLINKED', 'PARTNER_LOGIN_LINKED']));
  });
});

describe('partner commissions: settlement-ledger rows', () => {
  it('never touches rows owned by the settlement ledger and shows their client name in the portal', async () => {
    const admin = await asAdmin();
    const u = await createUser({ role: 'AGENT' });
    const partner = await prisma.referralPartner.create({ data: { name: 'Sənan', userId: u.user.id, commissionCents: 15000 } });
    const c = await newCase();
    const entry = await prisma.settlementEntry.create({ data: { clientName: 'Orxan (CE)', partnerId: partner.id, caseId: c.id, partnerShareCents: 30000 } });
    const owned = await prisma.partnerCommission.create({ data: { partnerId: partner.id, caseId: c.id, amountCents: 30000, settlementEntryId: entry.id } });
    const loneEntry = await prisma.settlementEntry.create({ data: { clientName: 'Vüqar (BC)', partnerId: partner.id } });
    await prisma.partnerCommission.create({ data: { partnerId: partner.id, caseId: null, amountCents: 20000, settlementEntryId: loneEntry.id } });

    // Assign: no second row for the same partner + case; unassign: the settlement row stays PENDING.
    expect((await assign(admin, [c.id], partner.id)).commissionsCreated).toBe(0);
    expect(await prisma.partnerCommission.count({ where: { partnerId: partner.id, caseId: c.id } })).toBe(1);
    await assign(admin, [c.id], null);
    expect(await prisma.partnerCommission.findUniqueOrThrow({ where: { id: owned.id } })).toMatchObject({ status: 'PENDING', amountCents: 30000 });
    // A cancelled settlement row is not revived by a re-assign either.
    await prisma.partnerCommission.update({ where: { id: owned.id }, data: { status: 'CANCELLED' } });
    await assign(admin, [c.id], partner.id);
    expect((await prisma.partnerCommission.findUniqueOrThrow({ where: { id: owned.id } })).status).toBe('CANCELLED');

    const portal = expectStatus(await sessionAgent(u.token).get('/api/partner/commissions'), 200).body;
    expect(portal.items).toHaveLength(2);
    expect(portal.items.map((r: { clientName: string | null }) => r.clientName).sort()).toEqual(['Ayan Quliyeva', 'Vüqar (BC)']);
  });
});
