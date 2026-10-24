import { afterEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { createCase } from '../../src/lib/caseFlow.js';
import { asCompany, cleanJobs } from './vacancies.fixtures';

/**
 * Security regression tests: one tenant (client / employer) can never reach another tenant's billing documents,
 * official forms, workers or reports — not by listing, not by guessing ids, not with a write request — and a
 * suspended employer reaches none of the employer portal modules.
 */

afterEach(cleanJobs);

const year = new Date().getUTCFullYear();

const issueInvoice = async (staff: Awaited<ReturnType<typeof asStaff>>, clientId: string, caseId: string | null, send = true) => {
  const body = {
    clientId,
    caseId,
    issueDate: `${year}-03-10`,
    items: [{ description: 'Servicegebühr Visumverfahren', quantity: 1, unitPriceCents: 50000, category: 'SERVICE_FEE' }],
  };
  const draft = (await staff.agent.post('/api/admin/client-billing/invoices').send(body).expect(201)).body.invoice;
  if (!send) return draft;
  return (await staff.agent.post(`/api/admin/client-billing/invoices/${draft.id}/send`).expect(200)).body.invoice;
};

describe('client billing: a client only ever sees their own issued documents', () => {
  it('foreign invoice PDFs and receipts answer 404, drafts stay invisible, the overview lists only own invoices', async () => {
    const staff = await asStaff();
    const owner = await asClient({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const intruder = await asClient({ firstName: 'Kamran', lastName: 'Həsənov' });
    const kase = await createCase(owner.user.id, { profession: 'Tibb bacısı', visaType: 'WORK', quiet: true });

    const issued = await issueInvoice(staff, owner.user.id, kase.id);
    const draft = await issueInvoice(staff, owner.user.id, kase.id, false);
    const pay = (await staff.agent.post(`/api/admin/client-billing/invoices/${issued.id}/payments`).send({ amountCents: 10000, method: 'BANK' }).expect(201)).body.payment;

    // The owner gets the issued invoice and the receipt …
    expect((await owner.agent.get(`/api/account/billing/invoices/${issued.id}/pdf`)).status).toBe(200);
    expect((await owner.agent.get(`/api/account/billing/payments/${pay.id}/receipt`)).status).toBe(200);
    // … but never a draft (not issued yet, no number).
    expect((await owner.agent.get(`/api/account/billing/invoices/${draft.id}/pdf`)).status).toBe(404);

    // Another client: 404 for everything, exactly like an unknown id.
    const foreignPdf = await intruder.agent.get(`/api/account/billing/invoices/${issued.id}/pdf`);
    const unknownPdf = await intruder.agent.get('/api/account/billing/invoices/doesnotexist/pdf');
    expect(foreignPdf.status).toBe(404);
    expect(foreignPdf.body).toEqual(unknownPdf.body);
    expect((await intruder.agent.get(`/api/account/billing/payments/${pay.id}/receipt`)).status).toBe(404);
    const overview = await intruder.agent.get('/api/account/billing').expect(200);
    const raw = JSON.stringify(overview.body);
    for (const secret of [issued.id, draft.id, pay.id, issued.number, 'Əliyeva']) expect(raw).not.toContain(secret);

    // Employers and staff are not clients here; the staff routes stay closed to clients.
    const employer = await asCompany();
    expect((await employer.agent.get(`/api/account/billing/invoices/${issued.id}/pdf`)).status).toBe(403);
    expect((await owner.agent.get(`/api/admin/client-billing/invoices/${issued.id}/pdf`)).status).toBe(403);
    expect((await owner.agent.post(`/api/admin/client-billing/invoices/${issued.id}/payments`).send({ amountCents: 1, method: 'CASH' })).status).toBe(403);
    expect((await anon().get(`/api/account/billing/invoices/${issued.id}/pdf`)).status).toBe(401);
  });
});

describe('employer portal: strict company scoping', () => {
  const setup = async () => {
    const employer = await asCompany();
    const other = await asCompany();
    const client = await asClient({ firstName: 'Cavid', lastName: 'Quliyev' });
    const kase = await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.user.id, profession: 'Berufskraftfahrer', companyId: employer.company.id } });
    const template = await prisma.officialFormTemplate.create({
      data: { key: uniq('SEC_').toUpperCase().slice(0, 40), title: 'Erklärung zum Beschäftigungsverhältnis', version: '2026-01', fileKey: 'missing.pdf', fieldMap: {} },
    });
    const fill = await prisma.officialFormFill.create({ data: { templateId: template.id, caseId: kase.id, companyId: employer.company.id, values: {}, status: 'SENT_TO_EMPLOYER' } });
    return { employer, other, client, kase, fill };
  };

  it('another company gets 404 on the official form (read, preview and submit) and nothing in its lists', async () => {
    const s = await setup();
    expect((await s.other.agent.get('/api/company/forms')).body.items).toEqual([]);
    for (const res of [
      await s.other.agent.get(`/api/company/forms/${s.fill.id}`),
      await s.other.agent.post(`/api/company/forms/${s.fill.id}/preview`).send({ values: { 'company.betriebsnummer': '12345678' } }),
      await s.other.agent.post(`/api/company/forms/${s.fill.id}/submit`).send({ values: { 'company.betriebsnummer': '12345678' } }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('FILL_NOT_FOUND');
    }
    // Nothing was written by the failed attempts.
    const after = await prisma.officialFormFill.findUniqueOrThrow({ where: { id: s.fill.id } });
    expect(after).toMatchObject({ status: 'SENT_TO_EMPLOYER', signatureRequestId: null });
    expect(after.values).toEqual({});

    // The worker's case is invisible to the other company in every employer module.
    expect((await s.other.agent.get(`/api/company/workers/${s.kase.id}`)).status).toBe(404);
    expect(JSON.stringify((await s.other.agent.get('/api/company/workers')).body)).not.toContain(s.kase.id);
    expect((await s.other.agent.get('/api/company/workers/export.csv')).text).not.toContain('Cavid');

    // A client (the worker himself) and staff are not employers.
    expect((await s.client.agent.get('/api/company/forms')).status).toBe(403);
    expect((await s.client.agent.get(`/api/company/forms/${s.fill.id}`)).status).toBe(403);
    expect((await s.client.agent.get('/api/company/reports')).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/company/workers')).status).toBe(403);
  });

  it('employer reports: a foreign report id answers 404 like an unknown one', async () => {
    const s = await setup();
    const report = await prisma.employerReport.create({ data: { companyId: s.employer.company.id, month: `${year}-01`, fileKey: 'missing-report.pdf', stats: {} } });
    const foreign = await s.other.agent.get(`/api/company/reports/${report.id}/pdf`);
    const unknown = await s.other.agent.get('/api/company/reports/doesnotexist/pdf');
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(unknown.body);
    expect((await s.other.agent.get('/api/company/reports')).body.items).toEqual([]);
  });

  it('a suspended company reaches none of the employer modules', async () => {
    const s = await setup();
    await prisma.company.update({ where: { id: s.employer.company.id }, data: { status: 'SUSPENDED' } });
    for (const url of ['/api/company/workers', `/api/company/workers/${s.kase.id}`, '/api/company/workers/export.csv', '/api/company/reports', '/api/company/forms', `/api/company/forms/${s.fill.id}`]) {
      const res = await s.employer.agent.get(url);
      expect(res.status, url).toBe(403);
      expect(res.body.error, url).toBe('COMPANY_SUSPENDED');
    }
    expect((await s.employer.agent.post(`/api/company/forms/${s.fill.id}/submit`).send({ values: {} })).status).toBe(403);
  });
});

describe('team calendars: colleagues see that someone is away, not why', () => {
  it('sick leave and leave notes are only visible to the person and ADMIN+ (shift calendar and workspace calendar)', async () => {
    const sick = await asStaff({ firstName: 'Nərmin' });
    const colleague = await asStaff();
    const admin = await asAdmin();
    const day = '2031-03-04';
    const leave = await prisma.leaveRequest.create({
      data: { userId: sick.user.id, type: 'SICK', status: 'APPROVED', note: 'Bandscheibenvorfall, Arzttermin', startsAt: new Date(`${day}T00:00:00Z`), endsAt: new Date(`${day}T23:59:59.999Z`) },
    });
    const views = async (agent: Awaited<ReturnType<typeof asStaff>>['agent']) => {
      const shift = (await agent.get(`/api/admin/shifts/calendar?from=${day}&to=${day}`).expect(200)).body.leave.find((l: { id: string }) => l.id === leave.id);
      const ws = (await agent.get(`/api/workspace/leave/calendar?from=${day}&to=${day}`).expect(200)).body.items.find((l: { id: string }) => l.id === leave.id);
      return [shift, ws];
    };
    for (const v of await views(colleague.agent)) {
      expect(v).toMatchObject({ userId: sick.user.id, type: 'OTHER', note: null });
      expect(JSON.stringify(v)).not.toContain('Bandscheiben');
    }
    for (const v of [...(await views(admin.agent)), ...(await views(sick.agent))]) expect(v).toMatchObject({ type: 'SICK', note: 'Bandscheibenvorfall, Arzttermin' });
  });
});

describe('admin-only configuration', () => {
  it('module toggles and page usage are SUPER_ADMIN only; impersonation needs ADMIN', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient();
    expect((await admin.agent.put('/api/admin/nav/modules').send({ modules: {} })).status).toBe(403);
    expect((await admin.agent.get('/api/admin/nav/usage')).status).toBe(403);
    expect((await staff.agent.get('/api/admin/nav/usage')).status).toBe(403);
    expect((await staff.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'SUPPORT_REQUEST' })).status).toBe(403);
    expect((await client.agent.get('/api/admin/nav/usage')).status).toBe(403);
  });
});
