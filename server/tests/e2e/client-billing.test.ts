import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { anon, asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { createCase, staffConfirmContract } from '../../src/lib/caseFlow.js';
import { runClientInvoiceReminders } from '../../src/lib/billing/service.js';
import { fireCaseStatusInstallments, runDateInstallments } from '../../src/lib/billing/plans.js';
import { runClientBillingJobs } from '../../src/jobs/clientBilling.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

/** Captures every email (the real sendMail still writes the EmailLog row). */
const mails = vi.hoisted(() => [] as { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer | string }[] }[]);
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...mod,
    sendMail: async (to: string, subject: string, html: string, attachments?: { filename: string; content: Buffer | string }[]) => {
      mails.push({ to, subject, html, attachments });
      return mod.sendMail(to, subject, html, attachments);
    },
  };
});

beforeEach(() => {
  mails.length = 0;
});

const DAY = 24 * 60 * 60 * 1000;
const year = new Date().getUTCFullYear();
const iso = (d: Date) => d.toISOString().slice(0, 10);

const setup = async () => {
  const admin = await asAdmin();
  const staff = await asStaff();
  const client = await asClient({ firstName: 'Leyla', lastName: 'Əliyeva', locale: 'az' });
  const kase = await createCase(client.user.id, { profession: 'Tibb bacısı', visaType: 'WORK', quiet: true });
  return { admin, staff, client, kase };
};

const draftBody = (clientId: string, caseId: string | null, over: Record<string, unknown> = {}) => ({
  clientId,
  caseId,
  issueDate: `${year}-03-10`,
  serviceFrom: `${year}-03-01`,
  items: [
    { description: 'Servicegebühr Visumverfahren', quantity: 1, unitPriceCents: 100000, category: 'SERVICE_FEE' },
    { description: 'Übersetzung Diplom', quantity: 2, unitPriceCents: 4500, category: 'TRANSLATION' },
    { description: 'Visumgebühr Botschaft', quantity: 1, unitPriceCents: 7500, category: 'EMBASSY_FEE' },
  ],
  ...over,
});

const pdfOf = async (agent: Agent, url: string) => {
  const res = await agent.get(url).buffer(true).parse(binaryParser).expect(200);
  expect(res.headers['content-type']).toBe('application/pdf');
  const body = res.body as Buffer;
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  return PDFDocument.load(body);
};

const issueInvoice = async (staff: Agent, clientId: string, caseId: string | null, over: Record<string, unknown> = {}) => {
  const draft = (await staff.post('/api/admin/client-billing/invoices').send(draftBody(clientId, caseId, over)).expect(201)).body.invoice;
  return (await staff.post(`/api/admin/client-billing/invoices/${draft.id}/send`).expect(200)).body.invoice;
};

describe('access', () => {
  it('case work is staff, the list / CSV / settings are admin-only, clients see their own billing only', async () => {
    const { admin, staff, client, kase } = await setup();
    await staff.agent.get(`/api/admin/client-billing/cases/${kase.id}`).expect(200);
    await staff.agent.get('/api/admin/client-billing/invoices').expect(403);
    await staff.agent.get('/api/admin/client-billing/invoices.csv').expect(403);
    await staff.agent.put('/api/admin/client-billing/settings').send({}).expect(403);
    await admin.agent.get('/api/admin/client-billing/invoices').expect(200);
    await client.agent.get(`/api/admin/client-billing/cases/${kase.id}`).expect(403);
    await anon().get('/api/account/billing').expect(401);
    await staff.agent.get('/api/account/billing').expect(403);
    await client.agent.get('/api/account/billing').expect(200);
  });
});

describe('client invoices', () => {
  it('drafts: VAT only on taxable lines, embassy fee passed through; numbering TV-KR-YYYY-NNNN on send; bilingual PDF', async () => {
    const { staff, client, kase } = await setup();
    const res = await staff.agent.post('/api/admin/client-billing/invoices').send(draftBody(client.user.id, kase.id)).expect(201);
    const d = res.body.invoice;
    // taxable 1000 + 90 = 1090 → VAT 207,10; + embassy 75 = 1372,10
    expect(d).toMatchObject({ status: 'DRAFT', number: null, netCents: 116500, taxableCents: 109000, passThroughCents: 7500, vatRate: 19, vatCents: 20710, grossCents: 137210 });
    expect(d.items[0].servicePeriod).toEqual({ from: `${year}-03-01`, to: `${year}-03-01` });
    expect(d.dueDate.slice(0, 10)).toBe(`${year}-03-24`);

    const sent = (await staff.agent.post(`/api/admin/client-billing/invoices/${d.id}/send`).expect(200)).body;
    expect(sent.invoice.number).toBe(`TV-KR-${year}-0001`);
    expect(sent.emailed).toBe(true);
    const mail = await waitFor(async () => mails.find((m) => m.to === client.user.email && m.subject.includes(`TV-KR-${year}-0001`)));
    expect(mail.attachments?.[0].filename).toBe(`Rechnung-TV-KR-${year}-0001.pdf`);
    const second = await issueInvoice(staff.agent, client.user.id, kase.id);
    expect(second.number).toBe(`TV-KR-${year}-0002`);

    const doc = await pdfOf(staff.agent, `/api/admin/client-billing/invoices/${d.id}/pdf`);
    expect(doc.getTitle()).toBe(`Rechnung TV-KR-${year}-0001`);
    // Drafts cannot be edited once sent.
    await staff.agent.put(`/api/admin/client-billing/invoices/${d.id}`).send(draftBody(client.user.id, kase.id)).expect(409);
    await staff.agent.delete(`/api/admin/client-billing/invoices/${d.id}`).expect(409);
    // A case of another client is refused.
    const other = await asClient();
    await staff.agent.post('/api/admin/client-billing/invoices').send(draftBody(other.user.id, kase.id)).expect(400);
  });

  it('small business mode: no VAT, § 19 note settings', async () => {
    const { admin, staff, client } = await setup();
    await admin.agent.put('/api/admin/client-billing/settings').send({ settings: { vatMode: 'SMALL_BUSINESS', paymentTermsDays: 7 } }).expect(200);
    const inv = (await staff.agent.post('/api/admin/client-billing/invoices').send(draftBody(client.user.id, null)).expect(201)).body.invoice;
    expect(inv).toMatchObject({ vatRate: 0, vatCents: 0, grossCents: 116500 });
    expect(inv.dueDate.slice(0, 10)).toBe(`${year}-03-17`);
  });

  it('payments: partial → PARTIALLY_PAID, more than open refused, full → PAID with receipt; void reopens', async () => {
    const { admin, staff, client, kase } = await setup();
    const inv = await issueInvoice(staff.agent, client.user.id, kase.id, { issueDate: iso(new Date()) });
    const p1 = (await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/payments`).send({ amountCents: 37210, method: 'CASH' }).expect(201)).body;
    expect(p1.invoice).toMatchObject({ status: 'PARTIALLY_PAID', paidCents: 37210, openCents: 100000 });
    await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/payments`).send({ amountCents: 100001, method: 'BANK' }).expect(400);
    const p2 = (await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/payments`).send({ amountCents: 100000, method: 'BANK', reference: 'SEPA 123' }).expect(201)).body;
    expect(p2.invoice).toMatchObject({ status: 'PAID', paidCents: 137210, openCents: 0 });
    expect(p2.invoice.paidAt).toBeTruthy();
    await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/payments`).send({ amountCents: 1, method: 'BANK' }).expect(409);

    const receipt = await pdfOf(staff.agent, `/api/admin/client-billing/payments/${p2.payment.id}/receipt`);
    expect(receipt.getTitle()).toBe(`Zahlungsbestätigung ${inv.number}-Z2`);
    await waitFor(async () => mails.find((m) => m.to === client.user.email && m.attachments?.some((a) => a.filename === `Quittung-${inv.number}-Z1.pdf`)));
    // The client downloads it too; another client cannot.
    await pdfOf(client.agent, `/api/account/billing/payments/${p2.payment.id}/receipt`);
    const other = await asClient();
    await other.agent.get(`/api/account/billing/payments/${p2.payment.id}/receipt`).expect(404);

    // Voiding a payment (admin) reopens the invoice.
    await staff.agent.delete(`/api/admin/client-billing/payments/${p2.payment.id}`).expect(403);
    const voided = (await admin.agent.delete(`/api/admin/client-billing/payments/${p2.payment.id}`).expect(200)).body.invoice;
    expect(voided).toMatchObject({ status: 'PARTIALLY_PAID', paidCents: 37210, paidAt: null });
  });

  it('cancellation (Stornorechnung): refused while payments exist, keeps the number, Storno PDF + mail', async () => {
    const { staff, client, kase } = await setup();
    const inv = await issueInvoice(staff.agent, client.user.id, kase.id);
    await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/payments`).send({ amountCents: 100, method: 'CASH' }).expect(201);
    await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/cancel`).send({ reason: 'Fehler' }).expect(409);
    const inv2 = await issueInvoice(staff.agent, client.user.id, kase.id);
    const cancelled = (await staff.agent.post(`/api/admin/client-billing/invoices/${inv2.id}/cancel`).send({ reason: 'Doppelt' }).expect(200)).body.invoice;
    expect(cancelled).toMatchObject({ status: 'CANCELLED', number: inv2.number, openCents: 0 });
    expect(cancelled.note).toContain('Stornorechnung');
    const doc = await pdfOf(staff.agent, `/api/admin/client-billing/invoices/${inv2.id}/pdf`);
    expect(doc.getTitle()).toBe(`Stornorechnung ${inv2.number}`);
    await waitFor(async () => mails.find((m) => m.to === client.user.email && m.subject.includes('ləğv')));
  });

  it('overdue job: OVERDUE, 1st reminder after 3 days, 2nd after 10, then one staff task', async () => {
    const { staff, client, kase } = await setup();
    await prisma.case.update({ where: { id: kase.id }, data: { assignedStaffId: staff.user.id } });
    const issue = new Date(Date.now() - 30 * DAY);
    const due = new Date(Date.now() - 2 * DAY);
    const inv = await issueInvoice(staff.agent, client.user.id, kase.id, { issueDate: iso(issue), dueDate: iso(due) });
    expect(inv.status).toBe('OVERDUE'); // back-dated: past due already when issued
    await prisma.clientInvoice.update({ where: { id: inv.id }, data: { status: 'SENT' } });

    const dueNoon = new Date(`${iso(due)}T12:00:00Z`).getTime();
    let r = await runClientInvoiceReminders(new Date(dueNoon + 1 * DAY + 3600_000));
    expect(r).toMatchObject({ markedOverdue: 1, reminders: 0 });
    r = await runClientInvoiceReminders(new Date(dueNoon + 3 * DAY + 3600_000));
    expect(r.reminders).toBe(1);
    expect((await prisma.clientInvoice.findUniqueOrThrow({ where: { id: inv.id } })).reminderCount).toBe(1);
    r = await runClientInvoiceReminders(new Date(dueNoon + 4 * DAY + 3600_000));
    expect(r.reminders).toBe(0); // idempotent
    r = await runClientInvoiceReminders(new Date(dueNoon + 10 * DAY + 3600_000));
    expect(r.reminders).toBe(1);
    r = await runClientInvoiceReminders(new Date(dueNoon + 11 * DAY + 3600_000));
    expect(r.escalated).toBe(1);
    r = await runClientInvoiceReminders(new Date(dueNoon + 20 * DAY));
    expect(r).toMatchObject({ reminders: 0, escalated: 0 });
    const task = await prisma.task.findFirstOrThrow({ where: { caseId: kase.id }, include: { assignees: true } });
    expect(task.title).toContain(inv.number);
    expect(task.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
    const reminderMails = mails.filter((m) => m.to === client.user.email && /xatırlatma/i.test(m.subject));
    expect(reminderMails.length).toBe(2);
    expect(registeredJobs()).toContain('client-billing');
  });

  it('portal: issued invoices, plan, balance, bank details; next step "pay invoice"', async () => {
    const { admin, staff, client, kase } = await setup();
    await prisma.setting.create({ data: { key: 'invoicing', value: { iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', accountHolder: 'Triad Vision GmbH' } } });
    const inv = await issueInvoice(staff.agent, client.user.id, kase.id, { issueDate: iso(new Date()) });
    await staff.agent.post('/api/admin/client-billing/invoices').send(draftBody(client.user.id, kase.id)).expect(201); // a draft: invisible to the client
    const body = (await client.agent.get('/api/account/billing').expect(200)).body;
    expect(body.invoices.map((i: { number: string }) => i.number)).toEqual([inv.number]);
    expect(body.totals).toMatchObject({ invoicedCents: 137210, paidCents: 0, openCents: 137210 });
    expect(body.bank.iban).toBe('DE89 3704 0044 0532 0130 00');
    await pdfOf(client.agent, `/api/account/billing/invoices/${inv.id}/pdf`);
    const other = await asClient();
    await other.agent.get(`/api/account/billing/invoices/${inv.id}/pdf`).expect(404);

    const next = (await client.agent.get('/api/account/next-step').expect(200)).body;
    const pay = [next.primary, ...next.secondary].find((a: { kind: string }) => a?.kind === 'PAY_INVOICE');
    expect(pay).toMatchObject({ kind: 'PAY_INVOICE', to: '/account/payments', detail: inv.number, count: 1 });
    expect(next.counts).toMatchObject({ openInvoices: 1, hasBilling: true });

    // Admin list: filters, totals, CSV
    const list = (await admin.agent.get('/api/admin/client-billing/invoices').query({ q: 'Leyla' }).expect(200)).body;
    expect(list.invoices).toHaveLength(2);
    expect(list.invoices[0].clientName).toBe('Leyla Əliyeva');
    expect((await admin.agent.get('/api/admin/client-billing/invoices').query({ status: 'DRAFT' }).expect(200)).body.invoices).toHaveLength(1);
    expect((await admin.agent.get('/api/admin/client-billing/invoices').query({ overdue: '1' }).expect(200)).body.invoices).toHaveLength(0);
    const csv = await admin.agent.get('/api/admin/client-billing/invoices.csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(`${inv.number};`);
    expect(csv.text).toContain('1372,10');
  });
});

describe('payment plans', () => {
  it('template plan: status triggers invoice the instalments (incl. the real case transition), completion when all paid', async () => {
    const { staff, client, kase } = await setup();
    const tpl = (await staff.agent.get('/api/admin/client-billing/plan-templates').expect(200)).body.templates.find((t: { key: string }) => t.key === 'standard');
    expect(tpl.items).toHaveLength(3);
    const created = (
      await staff.agent
        .post('/api/admin/client-billing/plans')
        .send({
          clientId: client.user.id,
          caseId: kase.id,
          title: 'Standard-Paket',
          installments: [
            { label: 'Anzahlung', trigger: 'ON_SIGN', amountCents: 100000 },
            { label: 'Botschaft', trigger: 'CASE_STATUS:EMBASSY_DOCUMENTS', amountCents: 75000 },
            { label: 'Zusage', trigger: 'CASE_STATUS:APPROVED', amountCents: 75000 },
          ],
        })
        .expect(201)
    ).body;
    expect(created.invoiced).toEqual([]); // case is still DOCUMENTS_PENDING
    const plan = created.plan;
    expect(plan).toMatchObject({ totalCents: 250000, status: 'ACTIVE' });

    // Staff edit a future instalment.
    const third = plan.installments[2];
    await staff.agent.put(`/api/admin/client-billing/installments/${third.id}`).send({ label: 'Schlussrate', trigger: 'CASE_STATUS:APPROVED', amountCents: 80000 }).expect(200);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).totalCents).toBe(255000);

    // Real transition: contract signed → embassy documents fires ON_SIGN and the embassy instalment.
    await prisma.case.update({ where: { id: kase.id }, data: { status: 'CONTRACT_SIGNED' } });
    await staffConfirmContract(kase.id, staff.user.id);
    // The transition hook runs in the background (PDF + mail per invoice): wait until both instalments carry their invoice.
    const invoices = await waitFor(async () => {
      const linked = await prisma.paymentInstallment.count({ where: { planId: plan.id, invoiceId: { not: null } } });
      if (linked < 2) return null;
      return prisma.clientInvoice.findMany({ where: { planId: plan.id }, orderBy: { number: 'asc' } });
    }, 20_000);
    expect(invoices.map((i) => i.grossCents)).toEqual([100000, 75000]);
    expect(invoices.every((i) => i.status === 'SENT' && i.number.startsWith(`TV-KR-${year}-`))).toBe(true);
    // 100000 gross at 19 % → net 84034 + VAT 15966
    expect(invoices[0]).toMatchObject({ netCents: 84034, vatCents: 15966 });
    const items = await prisma.paymentInstallment.findMany({ where: { planId: plan.id }, orderBy: { seq: 'asc' } });
    expect(items.map((i) => i.status)).toEqual(['INVOICED', 'INVOICED', 'PENDING']);
    // An invoiced instalment can no longer be edited; firing again does nothing.
    await staff.agent.put(`/api/admin/client-billing/installments/${items[0].id}`).send({ label: 'x', trigger: 'ON_SIGN', amountCents: 1 }).expect(409);
    expect(await fireCaseStatusInstallments(kase.id, 'EMBASSY_REVIEW')).toEqual([]);

    // Approval → last instalment.
    const last = await fireCaseStatusInstallments(kase.id, 'APPROVED');
    expect(last).toHaveLength(1);
    expect(last[0].grossCents).toBe(80000);

    for (const inv of await prisma.clientInvoice.findMany({ where: { planId: plan.id } })) {
      await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/payments`).send({ amountCents: inv.grossCents, method: 'BANK' }).expect(201);
    }
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe('COMPLETED');
    expect((await prisma.paymentInstallment.findMany({ where: { planId: plan.id } })).every((i) => i.status === 'PAID')).toBe(true);

    const view = (await staff.agent.get(`/api/admin/client-billing/cases/${kase.id}`).expect(200)).body;
    expect(view.totals).toMatchObject({ invoicedCents: 255000, paidCents: 255000, openCents: 0 });
    expect(view.plans[0].installments).toHaveLength(3);
    expect(view.payments).toHaveLength(3);
  });

  it('DATE instalments are invoiced by the job on their day; a cancelled instalment invoice can be invoiced again', async () => {
    const { staff, client, kase } = await setup();
    const soon = new Date(Date.now() + 5 * DAY);
    const plan = (
      await staff.agent
        .post('/api/admin/client-billing/plans')
        .send({ clientId: client.user.id, caseId: kase.id, title: 'Raten', installments: [{ label: '1. Rate', trigger: 'DATE', dueDate: iso(soon), amountCents: 50000 }] })
        .expect(201)
    ).body.plan;
    await staff.agent.post('/api/admin/client-billing/plans').send({ clientId: client.user.id, title: 'x', installments: [{ label: 'y', trigger: 'DATE', amountCents: 1 }] }).expect(400);
    expect(await runDateInstallments(new Date())).toBe(0);
    expect(await runDateInstallments(new Date(soon.getTime() + DAY))).toBe(1);
    expect(await runDateInstallments(new Date(soon.getTime() + 2 * DAY))).toBe(0);
    const inv = await prisma.clientInvoice.findFirstOrThrow({ where: { planId: plan.id } });
    await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/cancel`).send({}).expect(200);
    const inst = await prisma.paymentInstallment.findFirstOrThrow({ where: { planId: plan.id } });
    expect(inst).toMatchObject({ status: 'PENDING', invoiceId: null });
    const again = (await staff.agent.post(`/api/admin/client-billing/installments/${inst.id}/invoice`).expect(201)).body.invoice;
    expect(again.grossCents).toBe(50000);
    expect(again.number).not.toBe(inv.number);
    // The job wrapper runs every part.
    expect(await runClientBillingJobs(new Date())).toMatchObject({ invoiced: 0 });
  });

  it('a plan created after the trigger happened invoices at once (catch-up)', async () => {
    const { staff, client, kase } = await setup();
    await prisma.case.update({ where: { id: kase.id }, data: { status: 'EMBASSY_REVIEW' } });
    const res = (
      await staff.agent
        .post('/api/admin/client-billing/plans')
        .send({ clientId: client.user.id, caseId: kase.id, title: 'Spät', installments: [{ label: 'Anzahlung', trigger: 'ON_SIGN', amountCents: 30000 }, { label: 'Zusage', trigger: 'CASE_STATUS:APPROVED', amountCents: 20000 }] })
        .expect(201)
    ).body;
    expect(res.invoiced).toHaveLength(1);
    expect(res.plan.installments.map((i: { status: string }) => i.status)).toEqual(['INVOICED', 'PENDING']);
  });
});
