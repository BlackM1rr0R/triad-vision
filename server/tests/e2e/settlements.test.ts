import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { createClient } from '../helpers/factories';
import { prisma, waitFor } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { createCase, staffCancel } from '../../src/lib/caseFlow.js';

const BASE = '/api/admin/settlements';

type Share = { cents: number; currency: string; status: string; text?: string; manual?: boolean } | null;
type Row = { id: string; clientName: string; project: string; stage: string; partnerId: string | null; caseId: string | null; shares: Record<string, Share>; [k: string]: unknown };
type Ben = { id: string; name: string; rule: string };

const list = async (agent: Agent, query = '') => expectStatus(await agent.get(`${BASE}${query}`), 200).body as { rows: Row[]; beneficiaries: Ben[]; totals: Record<string, unknown>; canManage: boolean; settings: { eurAzn: number } };
const benIds = (bens: Ben[]) => Object.fromEntries(bens.map((b) => [b.name, b.id])) as Record<string, string>;
const create = async (agent: Agent, body: Record<string, unknown>) => expectStatus(await agent.post(BASE).send(body), 201).body.row as Row;
const patch = async (agent: Agent, changes: { id: string; field: string; value: unknown }[]) => expectStatus(await agent.patch(BASE).send({ changes }), 200).body;
const cents = (s: Share) => (s ? s.cents / 100 : null);

describe('settlements: rows, split and permissions', () => {
  it('seeds beneficiaries, computes the split and keeps manual values until recalculation', async () => {
    const staff = await asStaff();
    const body = await list(staff.agent);
    expect(body.canManage).toBe(false);
    expect(body.settings.eurAzn).toBe(2);
    expect(body.beneficiaries.map((b) => [b.name, b.rule])).toEqual([
      ['Xalid', 'THIRD_OF_NET'],
      ['Tofig', 'REMAINDER'],
      ['Abdulla', 'REMAINDER'],
      ['Team', 'FIXED'],
    ]);
    const B = benIds(body.beneficiaries);

    const row = await create(staff.agent, { project: 'Proyekt 2', clientName: 'Niftaliyev Elvin (CE)', amount: '3000 manat', employer: 'Havina Logistik' });
    expect(row).toMatchObject({ clientName: 'Niftaliyev Elvin', licence: 'CE', amountCents: 300000, currency: 'AZN', stage: 'NEW' });
    expect([B.Xalid, B.Tofig, B.Abdulla, B.Team].map((b) => cents(row.shares[b!]!))).toEqual([1000, 900, 900, 200]);

    // Batch save: amount, expenses, status dates; a bad value fails alone.
    const res = await patch(staff.agent, [
      { id: row.id, field: 'amountCents', value: 500000 },
      { id: row.id, field: 'expensesCents', value: 50000 },
      { id: row.id, field: 'tlsDate', value: '2026-07-20' },
      { id: row.id, field: 'stage', value: 'IN_PROGRESS' },
      { id: row.id, field: 'currency', value: 'USD' },
    ]);
    expect(res.saved).toBe(4);
    expect(res.results.find((r: { field: string }) => r.field === 'currency')).toMatchObject({ ok: false, error: 'INVALID_CURRENCY' });
    let fresh = res.rows[0] as Row;
    expect([B.Xalid, B.Tofig, B.Abdulla, B.Team].map((b) => cents(fresh.shares[b!]!))).toEqual([1500, 1400, 1400, 200]);
    expect(fresh).toMatchObject({ tlsDate: '2026-07-20', stage: 'IN_PROGRESS', stageAuto: false });

    // Manual value + rawot stick; recalculation drops them.
    fresh = (await patch(staff.agent, [
      { id: row.id, field: `share:${B.Xalid}`, value: '1450 manat' },
      { id: row.id, field: `share:${B.Team}`, value: 'rawot' },
    ])).rows[0];
    expect(fresh.shares[B.Xalid!]).toMatchObject({ cents: 145000, manual: true });
    expect(fresh.shares[B.Team!]).toMatchObject({ text: 'rawot', status: 'NONE', cents: 0 });
    expect(cents(fresh.shares[B.Tofig!])).toBe(1425); // the rule after the manual Xalid: (4500 - 1450 - 200) / 2
    fresh = (await patch(staff.agent, [{ id: row.id, field: 'amountCents', value: 600000 }])).rows[0];
    expect(cents(fresh.shares[B.Xalid!])).toBe(1450);
    fresh = expectStatus(await staff.agent.post(`${BASE}/${row.id}/recalculate`), 200).body.rows[0];
    expect(cents(fresh.shares[B.Xalid!])).toBe(1833);
    expect(fresh.shares[B.Team!]).toMatchObject({ cents: 20000, status: 'PENDING' });
    expect(fresh.shares[B.Xalid!]!.manual).toBeUndefined();

    // Mixed currency with a 1 EUR = 2 AZN rate.
    const eur = await create(staff.agent, { project: 'Cebi', clientName: 'Mammadli Bakhshali', amount: '1500 euro', partnerShareCents: 50000, partnerShareCurrency: 'EUR' });
    expect([B.Xalid, B.Tofig, B.Abdulla].map((b) => [cents(eur.shares[b!]!), eur.shares[b!]!.currency])).toEqual([
      [333, 'EUR'],
      [283, 'EUR'],
      [283, 'EUR'],
    ]);
    expect(eur.shares[B.Team!]).toMatchObject({ cents: 20000, currency: 'AZN' });

    // Paid shares freeze; totals per currency split pending / paid.
    expectStatus(await staff.agent.post(`${BASE}/paid`).send({ items: [{ id: row.id, beneficiaryId: B.Xalid }, { id: eur.id, beneficiaryId: B.Xalid }], paid: true }), 200);
    const all = await list(staff.agent);
    const t = all.totals as { shares: Record<string, { paid: Record<string, number>; pending: Record<string, number> }>; amount: Record<string, number> };
    expect(t.amount).toEqual({ AZN: 600000, EUR: 150000 });
    expect(t.shares[B.Xalid!]!.paid).toEqual({ AZN: 183300, EUR: 33300 });
    expect(t.shares[B.Tofig!]!.pending).toEqual({ AZN: 173300, EUR: 28300 }); // 6000 − 500 − 1833 − 200 = 3467 → 1733
    const paidRow = (await patch(staff.agent, [{ id: row.id, field: 'amountCents', value: 300000 }])).rows[0] as Row;
    expect(cents(paidRow.shares[B.Xalid!])).toBe(1833); // frozen at the paid amount
    expect(cents(paidRow.shares[B.Tofig!])).toBe(233); // 3000 - 500 - 1833 (paid) - 200 = 467 -> 233

    // Filters
    expect((await list(staff.agent, '?project=Cebi')).rows.map((r) => r.id)).toEqual([eur.id]);
    expect((await list(staff.agent, '?stage=IN_PROGRESS')).rows.map((r) => r.id)).toEqual([row.id]);
    expect((await list(staff.agent, '?q=bakhsh')).rows).toHaveLength(1);
    expect((await list(staff.agent, '?month=2026-07')).rows.map((r) => r.id)).toEqual([row.id]);

    // Audit
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'SETTLEMENT_' } } })).toBeGreaterThanOrEqual(5);
  });

  it('enforces permissions: clients out, staff edit, admins delete / import / manage rules', async () => {
    const client = await asClient();
    expect((await client.agent.get(BASE)).status).toBe(403);
    const staff = await asStaff();
    const admin = await asAdmin();
    const row = await create(staff.agent, { clientName: 'Aliyev Kamran', amount: '3000 manat' });
    expect((await staff.agent.delete(`${BASE}/bulk`).send({ ids: [row.id] })).status).toBe(403);
    expect((await staff.agent.delete(`${BASE}/${row.id}`)).status).toBe(403);
    expect((await staff.agent.post(`${BASE}/beneficiaries`).send({ name: 'X', rule: 'FIXED', value: 1 })).status).toBe(403);
    expect((await staff.agent.put(`${BASE}/settings`).send({ eurAzn: 1.7 })).status).toBe(403);
    expect((await staff.agent.post(`${BASE}/import?dryRun=1`).attach('file', Buffer.from('PK'), 'x.xlsx')).status).toBe(403);
    expect((await staff.agent.patch(`${BASE}/projects`).send({ from: 'Ümumi', to: 'X' })).status).toBe(403);

    expectStatus(await admin.agent.put(`${BASE}/settings`).send({ eurAzn: 1.7 }), 200);
    const ben = expectStatus(await admin.agent.post(`${BASE}/beneficiaries`).send({ name: 'Ofis', rule: 'PERCENT_OF_NET', value: 1000 }), 201).body.beneficiary;
    const after = await list(staff.agent);
    expect(after.settings.eurAzn).toBe(1.7);
    const r = after.rows[0]!;
    const B = benIds(after.beneficiaries);
    // 3000: Xalid 1000, Team 200, Ofis 10 % = 300 → remainder 1500 → 750 each
    expect([B.Xalid, B.Tofig, B.Abdulla, B.Team, ben.id].map((b) => cents(r.shares[b!]!))).toEqual([1000, 750, 750, 200, 300]);
    expect((await admin.agent.post(`${BASE}/beneficiaries`).send({ name: 'Ofis', rule: 'FIXED', value: 1 })).body.error).toBe('NAME_TAKEN');

    // Rename / move projects
    expect(expectStatus(await admin.agent.patch(`${BASE}/projects`).send({ from: 'Ümumi', to: 'Privat' }), 200).body.renamed).toBe(1);
    expectStatus(await staff.agent.post(`${BASE}/move`).send({ ids: [row.id], project: 'Proyekt 2' }), 200);
    expect(expectStatus(await staff.agent.get(`${BASE}/projects`), 200).body.projects).toEqual([{ name: 'Proyekt 2', count: 1 }]);

    expect(expectStatus(await admin.agent.delete(`${BASE}/bulk`).send({ ids: [row.id] }), 200).body.deleted).toBe(1);
    expect(await prisma.settlementEntry.count()).toBe(0);
  });
});

describe('settlements: case link and partner commissions', () => {
  it('suggests cases by transliterated name, follows the case stage and syncs the partner commission', async () => {
    const staff = await asStaff();
    const partner = await prisma.referralPartner.create({ data: { name: 'Ilgar' } });
    const { user } = await createClient({ firstName: 'Elşən', lastName: 'Hüseyn' });
    const kase = await createCase(user.id, { profession: 'LKW', visaType: 'WORK' });
    await prisma.case.update({ where: { id: kase.id }, data: { partnerId: partner.id } });
    const { user: other } = await createClient({ firstName: 'Rauf', lastName: 'Babayev' });
    await createCase(other.id, { profession: 'LKW', visaType: 'WORK' });

    const row = await create(staff.agent, { project: 'Privat', clientName: 'Huseyn Elshan', amount: '3000 manat', partnerShareCents: 50000, partnerShareCurrency: 'EUR' });
    const sug = expectStatus(await staff.agent.get(`${BASE}/${row.id}/suggestions`), 200).body.suggestions;
    expect(sug).toHaveLength(1);
    expect(sug[0]).toMatchObject({ caseId: kase.id, number: kase.number, score: 1 });

    // No partner yet → no commission.
    expect(await prisma.partnerCommission.count()).toBe(0);
    let linked = expectStatus(await staff.agent.post(`${BASE}/${row.id}/link`).send({ caseId: kase.id }), 200).body.row as Row;
    expect(linked).toMatchObject({ caseId: kase.id, partnerId: partner.id, stage: 'NEW', stageAuto: true, case: { number: kase.number } });
    let com = await prisma.partnerCommission.findUniqueOrThrow({ where: { settlementEntryId: row.id } });
    expect(com).toMatchObject({ partnerId: partner.id, caseId: kase.id, amountCents: 50000, currency: 'EUR', status: 'PENDING', paidAt: null });

    // Case moves on: appointment → IN_PROGRESS + TLS date (sync on read).
    const at = new Date('2026-09-02T09:00:00.000Z');
    await prisma.case.update({ where: { id: kase.id }, data: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: at } });
    linked = (await list(staff.agent)).rows[0]!;
    expect(linked).toMatchObject({ stage: 'IN_PROGRESS', tlsDate: '2026-09-02' });
    // Approved with a visa start date → VISA + visa date.
    await prisma.case.update({ where: { id: kase.id }, data: { status: 'APPROVED', visaValidFrom: new Date('2026-10-01T00:00:00.000Z'), decisionAt: new Date() } });
    linked = (await list(staff.agent)).rows[0]!;
    expect(linked).toMatchObject({ stage: 'VISA', visaDate: '2026-10-01' });

    // Partner share paid in the ledger → commission PAID; amount change follows; share removed → commission gone.
    await patch(staff.agent, [{ id: row.id, field: 'partnerPaid', value: true }]);
    com = await prisma.partnerCommission.findUniqueOrThrow({ where: { settlementEntryId: row.id } });
    expect(com.status).toBe('PAID');
    expect(com.paidAt).not.toBeNull();
    await patch(staff.agent, [{ id: row.id, field: 'partnerShareCents', value: 60000 }]);
    expect((await prisma.partnerCommission.findUniqueOrThrow({ where: { settlementEntryId: row.id } })).amountCents).toBe(60000);
    await patch(staff.agent, [{ id: row.id, field: 'partnerPaid', value: false }]);
    expect((await prisma.partnerCommission.findUniqueOrThrow({ where: { settlementEntryId: row.id } })).status).toBe('PENDING');
    await patch(staff.agent, [{ id: row.id, field: 'partnerShareCents', value: null }]);
    expect(await prisma.partnerCommission.count()).toBe(0);
    await patch(staff.agent, [{ id: row.id, field: 'partnerShareCents', value: 50000 }]);
    expect(await prisma.partnerCommission.count()).toBe(1);
    // A linked row takes the case's partner back while empty; unlinked, removing the partner removes the commission.
    await patch(staff.agent, [{ id: row.id, field: 'partnerId', value: null }]);
    expect(await prisma.partnerCommission.count()).toBe(1);
    expectStatus(await staff.agent.post(`${BASE}/${row.id}/link`).send({ caseId: null }), 200);
    await patch(staff.agent, [{ id: row.id, field: 'partnerId', value: null }]);
    expect(await prisma.partnerCommission.count()).toBe(0);
  });

  it('adopts the automatic commission of the same partner + case and follows caseFlow transitions', async () => {
    const staff = await asStaff();
    const partner = await prisma.referralPartner.create({ data: { name: 'Cebi' } });
    const { user } = await createClient({ firstName: 'Yalçın', lastName: 'Şəfirov' });
    const kase = await createCase(user.id, { profession: 'LKW', visaType: 'WORK' });
    await prisma.case.update({ where: { id: kase.id }, data: { partnerId: partner.id } });
    const auto = await prisma.partnerCommission.create({ data: { partnerId: partner.id, caseId: kase.id, amountCents: 30000, currency: 'EUR' } });

    const row = await create(staff.agent, { clientName: 'Shefirov Yalchin', partnerId: partner.id, partnerShareCents: 50000, caseId: kase.id });
    const all = await prisma.partnerCommission.findMany();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: auto.id, settlementEntryId: row.id, amountCents: 50000 });

    await staffCancel(kase.id, staff.user.id, 'Müştəri imtina etdi');
    await waitFor(async () => (await prisma.settlementEntry.findUniqueOrThrow({ where: { id: row.id } })).stage === 'CANCELLED');
  });
});

describe('settlements: summary', () => {
  it('reports owed / paid per beneficiary, partner commissions, stages and revenue', async () => {
    const staff = await asStaff();
    const partner = await prisma.referralPartner.create({ data: { name: 'Batya' } });
    const B = benIds((await list(staff.agent)).beneficiaries);
    const a = await create(staff.agent, { clientName: 'Hajiyev Parvin', amount: '3000 manat' });
    const b = await create(staff.agent, { clientName: 'Rzayev Vugar', amount: '3000 manat', partnerId: partner.id, partnerShareCents: 50000, partnerShareCurrency: 'EUR' });
    await patch(staff.agent, [
      { id: a.id, field: 'visaDate', value: '2026-09-15' },
      { id: a.id, field: 'stage', value: 'VISA' },
      { id: b.id, field: 'tlsDate', value: '2026-09-20' },
      { id: b.id, field: 'stage', value: 'IN_PROGRESS' },
      { id: a.id, field: 'paidCents', value: 300000 },
    ]);
    expectStatus(await staff.agent.post(`${BASE}/${a.id}/paid`).send({ beneficiaryId: '*', paid: true }), 200);

    const s = expectStatus(await staff.agent.get(`${BASE}/summary?month=2026-09`), 200).body;
    const x = s.beneficiaries.find((r: { name: string }) => r.name === 'Xalid');
    // a: 1000 paid (now); b: 3000 − 1000 (500 EUR) = 2000 → 667 pending
    expect(x.overall).toEqual({ paid: { AZN: 100000 }, pending: { AZN: 66700 } });
    expect(x.month.pending).toEqual({ AZN: 66700 });
    const team = s.beneficiaries.find((r: { id: string }) => r.id === B.Team);
    expect(team.overall).toEqual({ paid: { AZN: 20000 }, pending: { AZN: 20000 } });
    expect(s.partners).toEqual([{ id: partner.id, name: 'Batya', clients: 1, pending: { EUR: 50000 }, paid: {}, month: { EUR: 50000 } }]);
    expect(s.stages).toMatchObject({ VISA: 1, IN_PROGRESS: 1, NEW: 0 });
    expect(s.stagesMonth).toMatchObject({ VISA: 1, IN_PROGRESS: 1 });
    expect(s.revenue).toMatchObject({ agreed: { AZN: 600000 }, received: { AZN: 300000 }, monthAgreed: { AZN: 600000 } });

    // "Unpaid only" filter: a is fully paid, b is not.
    expect((await list(staff.agent, '?unpaid=1')).rows.map((r) => r.id)).toEqual([b.id]);
  });
});

// ─── Import / export ────────────────────────────────────────────────────

const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

/** A workbook like the team's: a project sheet with "Zwischen Person", a middleman sheet with a credential cell. */
const buildWorkbook = async () => {
  const wb = new ExcelJS.Workbook();
  const p = wb.addWorksheet('Proyekt 2');
  p.addRow(['Zwischen Person', 'Name', 'Transporte', null, 'Status', 'Bezahlung', 'Xalid', 'Tofig', 'Abdulla', 'Team', 'Rasxod']);
  const rows: [unknown[], string][] = [
    [['Ilgar', 'Gulmammadov Zaur', 'Eugen Dmitri', null, 'TLS/01.06.2026-viza/09.07.2026', '3000 manat', '1000 manat', '900 manat', '900 manat', '200 manat', null], 'FF00B050'],
    [['Vurgun', 'Rahimov Heyderali', 'Eugen Dmitri', null, 'TLS/01.06.2026-saxta atkaz', null, null, null, null, null, null], 'FFFF0000'],
    [['Roma', 'Layijov Sarkhan', 'CMF logistik', null, 'TLS/20.07.2026', '5000 manat', '1500 manat', '1400 manat', '1400 manat', '200 manat', '500 manat'], 'FFFFFF00'],
    [['Cebi', 'Niftaliyev Elvin (CE)', 'Havina Logistik', null, 'TLS/10.08.2026', '4000 manat', '1333 manat', '1233 manat', '1233 manat', '200 manat', null], 'FFFFFF00'],
    [['Ilgar', 'Hasanov Vusal (islemeyecek)', 'Eugen Dmitri', null, 'TLS/06.08.2026-viza/17.09.2026', 'viza sonrasi 2000 euro', null, null, null, null, null], 'FF00B050'],
    [['XTA', 'Samedov Aliashraf', 'CMF logistik', null, 'TLS/20.07.2026-viza/09.09.2026', 'RAWOT', 0, 0, 0, 0, null], 'FF00B050'],
    [['Ilgar', 'Babayev Rustam (CE)', 'Hozan Abay', null, 'TLS/06.05.2026-viza/03.06.2026', '2500 manat', '830 manat', '735 manat', '735 manat', '200 manat', null], 'FF00B050'],
    [['Mehemmedeli', 'Gasimov Jahangir', 'Sezgen Logistik', null, null, null, null, null, null, null, null], 'FF00B0F0'],
    [[null, null, null, null, null, null, null, null, null, null, null], 'FFFFFF00'], // empty row
  ];
  for (const [values, colour] of rows) {
    const r = p.addRow(values);
    for (let c = 1; c <= 11; c++) r.getCell(c).fill = fill(colour);
  }
  const m = wb.addWorksheet('Cebi');
  m.addRow(['Cebi', 'Musteri adi:', null, 'Transport', 'Status', 'Odeniw', 'Sanani', 'Xalid', 'Tofig', 'Abdulla', null, 'Team']);
  m.addRow([null, null]);
  m.addRow(['csariyev8@gmailcom Jeyhun12345.', 'Mammadli Bakhshali', null, 'MM Transport', null, '1500 euro', '500 euro', '333 euro', '283 euro', '283 euro', null, '200 manat']);
  m.addRow([null, 'Asgarov Samad', null, 'Sen Transport', null, '1500 euro', '500 euro', 'rawot', 'rawot', 'rawot', null, null]);
  m.addRow(['user@mail.ru parol123', 'Erestun Galib', null, 'FSTR Transporte', null, '2000azn/2000azn viza sonrasi', '500 euro', 'rawot', 'rawot', 'rawot', null, '200 manat']);
  for (let r = 2; r <= 5; r++) m.getRow(r).getCell(2).fill = fill('FFFFFF00');
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const importFile = (agent: Agent, buf: Buffer, dryRun: boolean) => agent.post(`${BASE}/import${dryRun ? '?dryRun=1' : ''}`).attach('file', buf, 'XTA.xlsx');

describe('settlements: import and export', () => {
  it('previews, imports (credentials never stored), re-imports without duplicates and exports a workbook like theirs', async () => {
    const admin = await asAdmin();
    await prisma.referralPartner.create({ data: { name: 'ilgar' } }); // existing, matched case-insensitively
    const buf = await buildWorkbook();

    // Dry run: nothing written.
    const preview = expectStatus(await importFile(admin.agent, buf, true), 200).body;
    expect(preview).toMatchObject({ dryRun: true, rows: 11, created: 11, updated: 0, skippedCredentials: 2 });
    expect(preview.newPartners.sort()).toEqual(['Cebi', 'Mehemmedeli', 'Roma', 'Vurgun', 'XTA']);
    expect(preview.sheets).toEqual([
      expect.objectContaining({ name: 'Proyekt 2', kind: 'project', rows: 8 }),
      expect.objectContaining({ name: 'Cebi', kind: 'partner', partner: 'Cebi', rows: 3 }),
    ]);
    expect(preview.preview[0]).toMatchObject({ clientName: 'Gulmammadov Zaur', partner: 'Ilgar', stage: 'VISA', tlsDate: '2026-06-01', visaDate: '2026-07-09', amount: '3000 AZN' });
    expect(await prisma.settlementEntry.count()).toBe(0);
    expect(await prisma.referralPartner.count()).toBe(1);

    // Real import.
    const done = expectStatus(await importFile(admin.agent, buf, false), 200).body;
    expect(done).toMatchObject({ dryRun: false, rows: 11, created: 11, updated: 0, skippedCredentials: 2 });
    expect(await prisma.referralPartner.count()).toBe(6);
    const all = await list(admin.agent);
    const B = benIds(all.beneficiaries);
    const by = (name: string) => all.rows.find((r) => r.clientName === name)!;

    expect(by('Gulmammadov Zaur')).toMatchObject({ project: 'Proyekt 2', stage: 'VISA', amountCents: 300000, currency: 'AZN', employer: 'Eugen Dmitri' });
    expect(by('Gulmammadov Zaur').shares[B.Xalid!]!.manual).toBeUndefined(); // matches the rule
    expect(by('Rahimov Heyderali')).toMatchObject({ stage: 'REFUSED', amountCents: null });
    expect(by('Layijov Sarkhan')).toMatchObject({ stage: 'IN_PROGRESS', expensesCents: 50000, tlsDate: '2026-07-20' });
    expect(cents(by('Layijov Sarkhan').shares[B.Tofig!])).toBe(1400);
    expect(by('Niftaliyev Elvin')).toMatchObject({ licence: 'CE' });
    expect(by('Hasanov Vusal')).toMatchObject({ payAfterVisa: true, amountCents: 200000, currency: 'EUR', note: 'islemeyecek' });
    expect(by('Samedov Aliashraf').note).toContain('Bezahlung: RAWOT');
    // Deviating sheet values are kept as manual values.
    expect(by('Babayev Rustam').shares[B.Xalid!]).toMatchObject({ cents: 83000, manual: true });
    expect(by('Babayev Rustam').shares[B.Tofig!]).toMatchObject({ cents: 73500 }); // the rule after Xalid 830
    expect(by('Babayev Rustam').shares[B.Tofig!]!.manual).toBeUndefined();
    expect(by('Gasimov Jahangir')).toMatchObject({ stage: 'NEW' });
    // Middleman sheet: partner from the sheet name, mixed currency, rawot, instalments.
    const cebi = (await prisma.referralPartner.findUniqueOrThrow({ where: { name: 'Cebi' } })).id;
    expect(by('Mammadli Bakhshali')).toMatchObject({ project: 'Cebi', partnerId: cebi, partnerShareCents: 50000, partnerShareCurrency: 'EUR', stage: 'IN_PROGRESS' });
    expect([B.Xalid, B.Tofig, B.Abdulla].map((b) => cents(by('Mammadli Bakhshali').shares[b!]))).toEqual([333, 283, 283]);
    expect(by('Asgarov Samad').shares[B.Xalid!]).toMatchObject({ text: 'rawot', status: 'NONE' });
    expect(by('Erestun Galib')).toMatchObject({ amountCents: 400000, currency: 'AZN', payAfterVisa: true });
    expect(by('Erestun Galib').note).toContain('2000 / 2000');
    // Commissions for rows with a partner share.
    expect(await prisma.partnerCommission.count({ where: { partnerId: cebi } })).toBe(3);

    // The credential text is nowhere in the database.
    const dump = JSON.stringify(await prisma.settlementEntry.findMany()) + JSON.stringify(await prisma.referralPartner.findMany()) + JSON.stringify(await prisma.auditLog.findMany());
    expect(dump).not.toContain('csariyev8');
    expect(dump).not.toContain('Jeyhun12345');
    expect(dump).not.toContain('parol123');

    // Re-import: same rows updated, no duplicates; payment status kept.
    await patch(admin.agent, [{ id: by('Gulmammadov Zaur').id, field: `shareStatus:${B.Xalid}`, value: 'PAID' }]);
    const again = expectStatus(await importFile(admin.agent, buf, false), 200).body;
    expect(again).toMatchObject({ created: 0, updated: 11 });
    expect(await prisma.settlementEntry.count()).toBe(11);
    expect(await prisma.partnerCommission.count()).toBe(3);
    const after = await list(admin.agent);
    expect(after.rows.find((r) => r.clientName === 'Gulmammadov Zaur')!.shares[B.Xalid!]).toMatchObject({ status: 'PAID', cents: 100000 });

    // Export: project sheet + partner sheets + summary, fills by stage, number formats, totals row.
    const res = await admin.agent.get(`${BASE}/export.xlsx`).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ExcelJS.Buffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe('Proyekt 2');
    expect(names).toEqual(expect.arrayContaining(['Cebi', 'ilgar', 'Roma', 'Xülasə']));
    const ws = wb.getWorksheet('Proyekt 2')!;
    expect((ws.getRow(1).values as unknown[]).slice(1, 12)).toEqual(['Zwischen Person', 'Name', 'Transporte', 'Status', 'Bezahlung', 'Sanani', 'Xalid', 'Tofig', 'Abdulla', 'Team', 'Rasxod']);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    const zaur = ws.getRow(2);
    expect(zaur.getCell(2).value).toBe('Gulmammadov Zaur');
    expect(zaur.getCell(4).value).toBe('TLS/01.06.2026-viza/09.07.2026');
    expect(zaur.getCell(5).value).toBe(3000);
    expect(zaur.getCell(5).numFmt).toContain('manat');
    expect((zaur.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF00B050');
    expect((ws.getRow(3).getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFFF0000');
    const total = ws.getRow(ws.rowCount);
    expect(String(total.getCell(2).value)).toContain('8');
    const cebiWs = wb.getWorksheet('Cebi')!;
    expect((cebiWs.getRow(1).values as unknown[]).slice(1, 4)).toEqual(['Musteri adi', 'Transport', 'Status']);
    expect(cebiWs.getRow(2).getCell(4).numFmt).toContain('euro');
    const summary = wb.getWorksheet('Xülasə')!;
    expect(summary.getRow(2).getCell(1).value).toBe('Xalid');

    // The exported workbook re-imports onto the same rows.
    const round = expectStatus(await importFile(admin.agent, res.body as Buffer, true), 200).body;
    expect(round.created).toBe(0);
    expect(round.skippedCredentials).toBe(0);
  });

  it('rejects files that are not xlsx', async () => {
    const admin = await asAdmin();
    expect((await admin.agent.post(`${BASE}/import?dryRun=1`).attach('file', Buffer.from('hello'), 'a.xlsx')).body.error).toBe('INVALID_XLSX');
    expect((await admin.agent.post(`${BASE}/import?dryRun=1`).attach('file', Buffer.from('hello'), 'a.txt')).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await admin.agent.post(`${BASE}/import?dryRun=1`)).body.error).toBe('FILE_REQUIRED');
  });
});
