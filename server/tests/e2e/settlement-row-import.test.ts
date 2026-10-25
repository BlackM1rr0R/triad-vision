import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { asAdmin, asStaff, type Agent } from '../helpers/api';
import { createClient } from '../helpers/factories';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { createCase } from '../../src/lib/caseFlow.js';

// Synthetic names / companies only — no real client data.
const BASE = '/api/admin/settlements';
const HEAD = [
  'Project', 'Intermediary', 'Client', 'Licence', 'Employer', 'TLS date', 'Visa date', 'Status', 'Amount', 'Currency', 'Pay after visa',
  'Sanani', 'Sanani currency', 'Xalid', 'Xalid currency', 'Tofiq', 'Tofiq currency', 'Abdulla', 'Abdulla currency', 'Team', 'Team currency',
  'Helper', 'Helper currency', 'Expenses', 'Expenses currency', 'Note',
];
const line = (v: Record<string, string>) => HEAD.map((h) => (v[h] ?? '').includes(',') ? `"${v[h]}"` : (v[h] ?? '')).join(',');
const CSV = [
  HEAD.join(','),
  line({ Project: 'Synth', Intermediary: 'Test Partner', Client: 'Məmmədli Nümunə (CE)', Employer: 'Example Logistik', 'TLS date': '01.06.2026', 'Visa date': '09.07.2026', Amount: '3000 manat', Xalid: '1000', Tofiq: '900', Abdulla: '900', Team: '200', 'Team currency': 'AZN' }),
  line({ Project: 'Synth', Intermediary: 'Test Partner', Client: 'Demo Hüseynov', Employer: 'Unknown Freight', Amount: '1500 euro', Sanani: '500', 'Sanani currency': 'EUR', Helper: '50', 'Helper currency': 'EUR' }),
  line({ Project: 'Synth', Intermediary: 'New Middleman', Client: 'Sample Refused', Status: 'TLS/02.07.2026-atkaz', Amount: '3000 azn', Sanani: '500 euro', Xalid: '1000', Tofiq: '900', Abdulla: '900' }),
  line({ Project: 'Synth', Client: 'Sample Cancelled', Amount: '2000azn/2000azn viza sonrasi', Xalid: 'rawot', Tofiq: 'rawot', Abdulla: 'rawot', Team: '200 manat' }),
  line({ Project: 'Synth', Client: 'Existing Entry', Amount: '1000 azn', Note: 'login: someone@example.invalid' }),
].join('\r\n');

type PreviewBody = {
  rows: {
    row: { clientName: string; stage: string; licence: string | null; payAfterVisa: boolean; amountCents: number | null; currency: string; note: string | null };
    include: boolean;
    client: { status: string; caseId: string | null; candidates: { caseId: string; score: number }[] };
    company: { status: string; companyId: string | null };
    duplicates: { id: string }[];
    warnings: string[];
  }[];
  beneficiaryColumns: { column: string; beneficiaryId: string | null; action: string }[];
  partners: { name: string; partnerId: string | null; action: string }[];
  counts: Record<string, number>;
  skippedCredentials: number;
};

const preview = async (agent: Agent, body: string | Buffer, name = 'synthetic.csv') =>
  expectStatus(await agent.post(`${BASE}/import/rows/preview`).attach('file', Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'), name), 200).body as PreviewBody;

/** The confirm payload the dialog sends: every preview decision taken as proposed (selected rows only). */
const toConfirm = (p: PreviewBody, over: { create?: string[] } = {}) => ({
  fileName: 'synthetic.csv',
  beneficiaryColumns: p.beneficiaryColumns.map((c) => ({ column: c.column, action: c.action, beneficiaryId: c.beneficiaryId })),
  partners: p.partners.map((x) => ({ name: x.name, action: x.action, partnerId: x.partnerId })),
  rows: p.rows
    .filter((r) => r.include)
    .map((r) => ({
      row: r.row,
      caseId: r.client.caseId,
      company: over.create?.includes(r.row.clientName) ? { action: 'create' } : r.company.companyId ? { action: 'map', companyId: r.company.companyId } : { action: 'none' },
    })),
});

describe('settlements: row import (CSV / XLSX template) — preview, confirm, undo', () => {
  it('serves the templates and keeps it ADMIN+', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get(`${BASE}/import/template.csv`)).status).toBe(403);
    expect((await staff.agent.post(`${BASE}/import/rows/preview`).attach('file', Buffer.from(CSV), 'a.csv')).status).toBe(403);
    expect((await staff.agent.get(`${BASE}/import/batches`)).status).toBe(403);

    const admin = await asAdmin();
    const csv = expectStatus(await admin.agent.get(`${BASE}/import/template.csv`), 200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split(/\r?\n/)[0]).toContain('Project,Intermediary,Client,Licence,Employer,TLS date,Visa date,Status,Amount,Currency');
    expect(csv.text).toContain('Xalid,Xalid currency,Tofig,Tofig currency');

    const x = expectStatus(await admin.agent.get(`${BASE}/import/template.xlsx`).buffer(true).parse(binaryParser), 200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.body as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Import', 'Format']);
    // The template itself previews cleanly.
    const p = await preview(admin.agent, x.body as Buffer, 'template.xlsx');
    expect(p.rows).toHaveLength(3);

    expect((await admin.agent.post(`${BASE}/import/rows/preview`).attach('file', Buffer.from('foo,bar\n1,2'), 'a.csv')).body.error).toBe('IMPORT_NO_HEADER');
    expect((await admin.agent.post(`${BASE}/import/rows/preview`).attach('file', Buffer.from('x'), 'a.pdf')).body.error).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('previews matches and warnings, confirms in one batch, refuses undo after an edit and undoes otherwise', async () => {
    const admin = await asAdmin();
    // Existing data the preview should find.
    const { user } = await createClient({ firstName: 'Nümunə', lastName: 'Mammadli' });
    const kase = await createCase(user.id, { profession: 'LKW', visaType: 'WORK' });
    const company = await prisma.company.create({ data: { name: 'Example Logistik GmbH', status: 'ACTIVE' } });
    const partner = await prisma.referralPartner.create({ data: { name: 'test partner' } });
    const existing = expectStatus(await admin.agent.post(BASE).send({ project: 'Old', clientName: 'Existing Entry', amount: '900 azn' }), 201).body.row as { id: string };

    const p = await preview(admin.agent, CSV);
    expect(p.skippedCredentials).toBe(1);
    expect(JSON.stringify(p)).not.toContain('@example.invalid');
    expect(p.rows).toHaveLength(5);
    const by = (n: string) => p.rows.find((r) => r.row.clientName === n)!;

    const first = by('Məmmədli Nümunə');
    expect(first.row).toMatchObject({ licence: 'CE', stage: 'VISA', amountCents: 300000, currency: 'AZN' });
    expect(first.client).toMatchObject({ status: 'matched', caseId: kase.id });
    expect(first.company).toMatchObject({ status: 'matched', companyId: company.id });

    const second = by('Demo Hüseynov');
    expect(second.client.status).toBe('none');
    expect(second.warnings).toEqual(expect.arrayContaining(['NO_CLIENT_MATCH', 'NO_COMPANY_MATCH']));

    expect(by('Sample Refused').row.stage).toBe('REFUSED');
    expect(by('Sample Refused').warnings).toContain('NEW_PARTNER');
    const cancelled = by('Sample Cancelled');
    expect(cancelled.row).toMatchObject({ stage: 'CANCELLED', payAfterVisa: true, amountCents: 400000 });

    const dup = by('Existing Entry');
    expect(dup.duplicates.map((d) => d.id)).toEqual([existing.id]);
    expect(dup.include).toBe(false);
    expect(dup.warnings).toContain('DUPLICATE');

    // Tofiq → the "Tofig" beneficiary; "Helper" is new.
    const bens = await prisma.settlementBeneficiary.findMany();
    const benId = (n: string) => bens.find((b) => b.name === n)!.id;
    expect(p.beneficiaryColumns).toEqual(
      expect.arrayContaining([
        { column: 'Tofiq', beneficiaryId: benId('Tofig'), action: 'map' },
        { column: 'Helper', beneficiaryId: null, action: 'create' },
      ]),
    );
    expect(p.partners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Test Partner', partnerId: partner.id, action: 'map' }),
        expect.objectContaining({ name: 'New Middleman', partnerId: null, action: 'create' }),
      ]),
    );
    expect(p.counts).toMatchObject({ rows: 5, included: 4, duplicates: 1, cancelled: 1, refused: 1 });

    // Nothing is written by the preview.
    expect(await prisma.settlementEntry.count()).toBe(1);

    // Confirm: one batch, placeholder company for the unknown employer.
    const res = expectStatus(await admin.agent.post(`${BASE}/import/rows/confirm`).send(toConfirm(p, { create: ['Demo Hüseynov'] })), 201).body;
    const batchId = res.batch.id as string;
    expect(batchId).toMatch(/^imp-/);
    expect(res.batch.counts).toMatchObject({ rows: 4, linked: 1, cancelled: 1, refused: 1 });
    expect(res.batch.created.partners).toHaveLength(1);
    expect(res.batch.created.beneficiaries).toHaveLength(1);
    expect(res.batch.created.companies).toHaveLength(1);

    const rows = (expectStatus(await admin.agent.get(`${BASE}?project=Synth`), 200).body.rows as {
      id: string; clientName: string; caseId: string | null; partnerId: string | null; stage: string; employer: string | null; partnerShareCents: number | null; payAfterVisa: boolean; note: string | null;
      shares: Record<string, { cents: number; currency: string; status: string; text?: string; manual?: boolean } | null>;
    }[]);
    expect(rows).toHaveLength(4);
    const row = (n: string) => rows.find((r) => r.clientName === n)!;
    expect(row('Məmmədli Nümunə')).toMatchObject({ caseId: kase.id, partnerId: partner.id, employer: 'Example Logistik GmbH', stage: 'VISA' });
    expect(row('Məmmədli Nümunə').shares[benId('Xalid')]).toMatchObject({ cents: 100000, currency: 'AZN' });
    expect(row('Demo Hüseynov')).toMatchObject({ partnerShareCents: 50000, employer: 'Unknown Freight' });
    expect(row('Demo Hüseynov').shares[res.batch.created.beneficiaries[0]]).toMatchObject({ cents: 5000, currency: 'EUR', manual: true });
    // Refusal: every share and the middleman share cancelled.
    const refused = row('Sample Refused');
    expect(refused.stage).toBe('REFUSED');
    expect(refused.partnerShareCents).toBeNull();
    expect(refused.note).toContain('Sanani ləğv edildi');
    expect(refused.shares[benId('Xalid')]).toMatchObject({ text: 'rawot', status: 'NONE', cents: 0 });
    // rawot: cancelled line, those shares not owed, the written Team share kept.
    const canc = row('Sample Cancelled');
    expect(canc).toMatchObject({ stage: 'CANCELLED', payAfterVisa: true });
    expect(canc.shares[benId('Tofig')]).toMatchObject({ text: 'rawot', status: 'NONE' });
    expect(canc.shares[benId('Team')]).toMatchObject({ cents: 20000, currency: 'AZN' });
    // The batch id sits in the metadata of every entry; the partner commission was synced.
    const stored = await prisma.settlementEntry.findMany({ where: { project: 'Synth' } });
    for (const e of stored) expect((e.shares as Record<string, { batch?: string }>)._import?.batch).toBe(batchId);
    expect(await prisma.partnerCommission.count({ where: { settlementEntryId: row('Demo Hüseynov').id } })).toBe(1);
    expect(await prisma.company.count({ where: { name: 'Unknown Freight' } })).toBe(1);

    // History lists the batch as undoable.
    let batches = expectStatus(await admin.agent.get(`${BASE}/import/batches`), 200).body.batches as { id: string; canUndo: boolean; edited: number }[];
    expect(batches[0]).toMatchObject({ id: batchId, canUndo: true, edited: 0 });

    // An edit blocks the undo …
    const edit = expectStatus(await admin.agent.patch(BASE).send({ changes: [{ id: row('Sample Cancelled').id, field: 'note', value: 'changed later' }] }), 200).body;
    expect(edit.saved).toBe(1);
    const blocked = await admin.agent.delete(`${BASE}/import/batches/${batchId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ error: 'IMPORT_EDITED', edited: [{ id: row('Sample Cancelled').id }] });
    batches = expectStatus(await admin.agent.get(`${BASE}/import/batches`), 200).body.batches;
    expect(batches[0]).toMatchObject({ canUndo: false, edited: 1 });

    // … deleting the edited row by hand makes the rest undoable; the undo removes what the batch created.
    expectStatus(await admin.agent.delete(`${BASE}/${row('Sample Cancelled').id}`), 200);
    const undone = expectStatus(await admin.agent.delete(`${BASE}/import/batches/${batchId}`), 200).body;
    expect(undone).toMatchObject({ ok: true, deleted: 3, removed: { partners: 1, beneficiaries: 1, companies: 1 } });
    expect(await prisma.settlementEntry.count({ where: { project: 'Synth' } })).toBe(0);
    expect(await prisma.settlementEntry.count()).toBe(1); // the older row is untouched
    expect(await prisma.partnerCommission.count()).toBe(0);
    expect(await prisma.referralPartner.count({ where: { id: partner.id } })).toBe(1); // existing partner kept
    expect(await prisma.company.count({ where: { id: company.id } })).toBe(1);
    expect(await prisma.settlementBeneficiary.count({ where: { name: 'Helper' } })).toBe(0);
    expect((await admin.agent.delete(`${BASE}/import/batches/${batchId}`)).body.error).toBe('IMPORT_ALREADY_UNDONE');
    expect((await admin.agent.delete(`${BASE}/import/batches/imp-20260101-deadbeef`)).status).toBe(404);
  });

  it('validates references on confirm and lets the admin override the stage', async () => {
    const admin = await asAdmin();
    const p = await preview(admin.agent, CSV);
    const body = toConfirm(p);
    const bad = { ...body, rows: [{ ...body.rows[0]!, caseId: 'nope' }] };
    expect((await admin.agent.post(`${BASE}/import/rows/confirm`).send(bad)).body.error).toBe('CASE_NOT_FOUND');
    expect(await prisma.settlementEntry.count()).toBe(0);
    const one = { ...body, rows: [{ ...body.rows.find((r) => r.row.clientName === 'Sample Cancelled')!, stage: 'IN_PROGRESS' }] };
    expectStatus(await admin.agent.post(`${BASE}/import/rows/confirm`).send(one), 201);
    const e = await prisma.settlementEntry.findFirstOrThrow({ where: { clientName: 'Sample Cancelled' } });
    expect(e).toMatchObject({ stage: 'IN_PROGRESS', stageAuto: false });
  });
});
