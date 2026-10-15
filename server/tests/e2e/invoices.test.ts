import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { anon, asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { emailsTo, prisma, settle, waitFor } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { runInvoiceOverdue } from '../../src/jobs/invoices.js';

const DAY = 24 * 60 * 60 * 1000;
const year = new Date().getUTCFullYear();

const cleanup = async () => {
  await prisma.invoice.deleteMany();
  await prisma.reminderLog.deleteMany({ where: { key: { startsWith: 'invoice-' } } });
  await prisma.company.deleteMany();
};
beforeEach(cleanup);
afterAll(cleanup);

const makeCompany = (over: Record<string, unknown> = {}) =>
  prisma.company.create({
    data: { name: 'Logistik Müller GmbH', email: 'billing@mueller.test', address: 'Hafenstraße 5\n20457 Hamburg', city: 'Hamburg', vatId: 'DE123456789', status: 'ACTIVE', ...over },
  });

const employer = async (companyId: string, locale: 'de' | 'en' | 'az' | 'ru' = 'de') => {
  const u = await createUser({ role: 'COMPANY', locale });
  await prisma.user.update({ where: { id: u.user.id }, data: { companyId } });
  return { ...u, agent: sessionAgent(u.token) };
};

const draftBody = (companyId: string, over: Record<string, unknown> = {}) => ({
  companyId,
  issueDate: `${year}-03-10`,
  items: [
    { description: 'Vermittlung Berufskraftfahrer (CE)', quantity: 2, unitPriceCents: 150000 },
    { description: 'Übersetzung von Dokumenten', quantity: 1.5, unitPriceCents: 9999 },
  ],
  servicePeriodFrom: `${year}-02-01`,
  servicePeriodTo: `${year}-02-28`,
  note: 'Vielen Dank für Ihren Auftrag.',
  ...over,
});

const pdfOf = async (req: ReturnType<ReturnType<typeof anon>['get']>) => {
  const res = await req.buffer(true).parse(binaryParser).expect(200);
  expect(res.headers['content-type']).toBe('application/pdf');
  const body = res.body as Buffer;
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  return { res, doc: await PDFDocument.load(body) };
};

describe('access', () => {
  it('is admin-only', async () => {
    const staff = await asStaff();
    const client = await asClient();
    await staff.agent.get('/api/admin/invoices').expect(403);
    await client.agent.get('/api/admin/invoices').expect(403);
    await anon().get('/api/admin/invoices').expect(401);
  });
});

describe('drafts', () => {
  it('creates a draft with computed totals, default VAT and due date, and no number yet', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const res = await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201);
    const inv = res.body.invoice;
    // 2 × 1500,00 + 1,5 × 99,99 = 3000,00 + 149,985 → 149,99
    expect(inv).toMatchObject({ status: 'DRAFT', number: null, netCents: 314999, vatRate: 19, vatCents: 59850, grossCents: 374849 });
    expect(inv.dueDate.slice(0, 10)).toBe(`${year}-03-24`);
    expect(inv.items[0].servicePeriod).toEqual({ from: `${year}-02-01`, to: `${year}-02-28` });
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.number).toMatch(/^DRAFT-/);
    expect(await prisma.auditLog.count({ where: { action: 'INVOICE_CREATE', target: inv.id } })).toBe(1);
  });

  it('uses the invoicing settings (VAT, payment terms, §19 small business)', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    await admin.agent.put('/api/admin/invoices/settings').send({ invoicing: { defaultVatRate: 7, paymentTermsDays: 30 } }).expect(200);
    const a = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)).body.invoice;
    expect(a.vatRate).toBe(7);
    expect(a.dueDate.slice(0, 10)).toBe(`${year}-04-09`);

    await admin.agent.put('/api/admin/invoices/settings').send({ invoicing: { smallBusiness: true } }).expect(200);
    const b = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id, { vatRate: 19 })).expect(201)).body.invoice;
    expect(b).toMatchObject({ vatRate: 0, vatCents: 0, grossCents: b.netCents });
  });

  it('validates input', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    await admin.agent.post('/api/admin/invoices').send(draftBody(c.id, { items: [] })).expect(400);
    await admin.agent.post('/api/admin/invoices').send(draftBody(c.id, { items: [{ description: 'x', quantity: 1.234, unitPriceCents: 100 }] })).expect(400);
    await admin.agent.post('/api/admin/invoices').send(draftBody(c.id, { dueDate: `${year}-03-01` })).expect(400);
    await admin.agent.post('/api/admin/invoices').send(draftBody('missing')).expect(404);
  });

  it('edits and deletes drafts only', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const inv = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)).body.invoice;
    const upd = await admin.agent
      .put(`/api/admin/invoices/${inv.id}`)
      .send(draftBody(c.id, { items: [{ description: 'Pauschale', quantity: 1, unitPriceCents: 10000 }], vatRate: 19 }))
      .expect(200);
    expect(upd.body.invoice).toMatchObject({ netCents: 10000, vatCents: 1900, grossCents: 11900 });

    await admin.agent.post(`/api/admin/invoices/${inv.id}/send`).expect(200);
    expect((await admin.agent.put(`/api/admin/invoices/${inv.id}`).send(draftBody(c.id)).expect(409)).body.error).toBe('INVOICE_NOT_DRAFT');
    await admin.agent.delete(`/api/admin/invoices/${inv.id}`).expect(409);

    const d = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)).body.invoice;
    await admin.agent.delete(`/api/admin/invoices/${d.id}`).expect(200);
    expect(await prisma.invoice.count({ where: { id: d.id } })).toBe(0);
  });
});

describe('sending and numbering', () => {
  it('numbers TV-RE-YYYY-NNNN on first send using the numeric maximum, emails the PDF and notifies employers', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const emp = await employer(c.id, 'en');
    const a = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)).body.invoice;
    const b = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)).body.invoice;

    const sentA = await admin.agent.post(`/api/admin/invoices/${a.id}/send`).expect(200);
    expect(sentA.body.invoice).toMatchObject({ status: 'SENT', number: `TV-RE-${year}-0001` });
    expect(sentA.body.invoice.sentAt).toBeTruthy();
    expect(sentA.body.emailed).toBe(true);
    const sentB = await admin.agent.post(`/api/admin/invoices/${b.id}/send`).expect(200);
    expect(sentB.body.invoice.number).toBe(`TV-RE-${year}-0002`);

    // "9999" sorts after "10000" as a string; the next number must still be 10001.
    await prisma.invoice.create({ data: { number: `TV-RE-${year}-10000`, companyId: c.id, issueDate: new Date(), dueDate: new Date(), items: [], netCents: 0, vatCents: 0, grossCents: 0, status: 'SENT' } });
    await prisma.invoice.create({ data: { number: `TV-RE-${year}-9999`, companyId: c.id, issueDate: new Date(), dueDate: new Date(), items: [], netCents: 0, vatCents: 0, grossCents: 0, status: 'SENT' } });
    const d = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)).body.invoice;
    expect((await admin.agent.post(`/api/admin/invoices/${d.id}/send`).expect(200)).body.invoice.number).toBe(`TV-RE-${year}-10001`);

    const mails = await emailsTo('billing@mueller.test', 3);
    expect(mails[0].subject).toBe(`Triad Vision · New invoice TV-RE-${year}-0001`);
    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: emp.user.id, type: 'INVOICE_SENT' } }));
    expect(n.link).toBe('/company/invoices');
    // the employer user is not emailed separately (the billing mailbox got it)
    await settle();
    expect(await prisma.emailLog.count({ where: { to: emp.user.email } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'INVOICE_SEND' } })).toBe(3);

    // re-sending keeps the number
    const again = await admin.agent.post(`/api/admin/invoices/${a.id}/send`).expect(200);
    expect(again.body.invoice.number).toBe(`TV-RE-${year}-0001`);
    expect(await prisma.auditLog.count({ where: { action: 'INVOICE_RESEND', target: a.id } })).toBe(1);
  });

  it('never hands out the same number when two drafts are sent at once', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const drafts = await Promise.all([1, 2, 3, 4].map(() => admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)));
    const sent = await Promise.all(drafts.map((d) => admin.agent.post(`/api/admin/invoices/${d.body.invoice.id}/send`)));
    expect(sent.every((r) => r.status === 200)).toBe(true);
    const numbers = sent.map((r) => r.body.invoice.number).sort();
    expect(numbers).toEqual([1, 2, 3, 4].map((n) => `TV-RE-${year}-000${n}`));
  });

  it('falls back to the first employer account when the company has no e-mail', async () => {
    const admin = await asAdmin();
    const c = await makeCompany({ email: null });
    const emp = await employer(c.id, 'az');
    const inv = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)).body.invoice;
    await admin.agent.post(`/api/admin/invoices/${inv.id}/send`).expect(200);
    const mails = await emailsTo(emp.user.email);
    expect(mails[0].subject).toBe(`Triad Vision · Yeni hesab-faktura TV-RE-${year}-0001`);
  });
});

describe('paid, cancel, duplicate', () => {
  const sentInvoice = async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const inv = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id)).expect(201)).body.invoice;
    await admin.agent.post(`/api/admin/invoices/${inv.id}/send`).expect(200);
    return { admin, c, id: inv.id as string };
  };

  it('marks paid; a paid invoice cannot be cancelled', async () => {
    const { admin, id } = await sentInvoice();
    const draft = (await admin.agent.post('/api/admin/invoices').send(draftBody((await makeCompany()).id)).expect(201)).body.invoice;
    await admin.agent.post(`/api/admin/invoices/${draft.id}/paid`).send({}).expect(409);
    const res = await admin.agent.post(`/api/admin/invoices/${id}/paid`).send({ paidAt: new Date().toISOString().slice(0, 10) }).expect(200);
    expect(res.body.invoice.status).toBe('PAID');
    expect(res.body.invoice.paidAt).toBeTruthy();
    expect((await admin.agent.post(`/api/admin/invoices/${id}/cancel`).send({}).expect(409)).body.error).toBe('INVOICE_PAID');
    expect(await prisma.auditLog.count({ where: { action: 'INVOICE_PAID', target: id } })).toBe(1);
  });

  it('cancels a sent invoice, keeping its number, with a Stornorechnung note; notifies the company', async () => {
    const { admin, id } = await sentInvoice();
    const res = await admin.agent.post(`/api/admin/invoices/${id}/cancel`).send({ reason: 'Falscher Betrag' }).expect(200);
    expect(res.body.invoice).toMatchObject({ status: 'CANCELLED', number: `TV-RE-${year}-0001` });
    expect(res.body.invoice.note).toContain('Stornorechnung');
    expect(res.body.invoice.note).toContain('Falscher Betrag');
    const mails = await emailsTo('billing@mueller.test', 2);
    expect(mails.at(-1)!.subject).toBe(`Triad Vision · Rechnung storniert: TV-RE-${year}-0001`);
    await admin.agent.post(`/api/admin/invoices/${id}/cancel`).send({}).expect(409);
    await admin.agent.post(`/api/admin/invoices/${id}/send`).expect(409);
    // a cancelled PDF still renders
    await pdfOf(admin.agent.get(`/api/admin/invoices/${id}/pdf`));
    // the number is not reused
    const next = (await admin.agent.post(`/api/admin/invoices/${id}/duplicate`).expect(201)).body.invoice;
    expect(next).toMatchObject({ status: 'DRAFT', number: null });
    expect(next.note).toBeNull();
    expect((await admin.agent.post(`/api/admin/invoices/${next.id}/send`).expect(200)).body.invoice.number).toBe(`TV-RE-${year}-0002`);
  });

  it('duplicates into a new draft with the same lines', async () => {
    const { admin, id } = await sentInvoice();
    const dup = (await admin.agent.post(`/api/admin/invoices/${id}/duplicate`).expect(201)).body.invoice;
    const src = (await admin.agent.get(`/api/admin/invoices/${id}`).expect(200)).body.invoice;
    expect(dup.id).not.toBe(id);
    expect(dup.items.map((l: { description: string }) => l.description)).toEqual(src.items.map((l: { description: string }) => l.description));
    expect(dup.grossCents).toBe(src.grossCents);
    expect(dup.issueDate.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe('list, totals and PDF', () => {
  it('filters and sums open / overdue / paid this month', async () => {
    const admin = await asAdmin();
    const c1 = await makeCompany();
    const c2 = await makeCompany({ name: 'Bau AG', email: 'bau@test.local' });
    const mk = async (companyId: string) => (await admin.agent.post('/api/admin/invoices').send(draftBody(companyId)).expect(201)).body.invoice;
    const a = await mk(c1.id);
    const b = await mk(c1.id);
    const c = await mk(c2.id);
    await mk(c2.id); // stays draft
    for (const i of [a, b, c]) await admin.agent.post(`/api/admin/invoices/${i.id}/send`).expect(200);
    await admin.agent.post(`/api/admin/invoices/${b.id}/paid`).send({}).expect(200);
    await prisma.invoice.update({ where: { id: c.id }, data: { status: 'OVERDUE' } });

    const all = await admin.agent.get('/api/admin/invoices').expect(200);
    expect(all.body.invoices).toHaveLength(4);
    expect(all.body.totals).toMatchObject({
      openCents: 2 * a.grossCents,
      openCount: 2,
      overdueCents: c.grossCents,
      overdueCount: 1,
      paidThisMonthCents: b.grossCents,
      paidThisMonthCount: 1,
      draftCount: 1,
    });
    expect((await admin.agent.get('/api/admin/invoices').query({ status: 'DRAFT' }).expect(200)).body.invoices).toHaveLength(1);
    expect((await admin.agent.get('/api/admin/invoices').query({ companyId: c2.id }).expect(200)).body.invoices).toHaveLength(2);
    expect((await admin.agent.get('/api/admin/invoices').query({ from: `${year}-03-11` }).expect(200)).body.invoices).toHaveLength(0);
    expect((await admin.agent.get('/api/admin/invoices').query({ q: '0002' }).expect(200)).body.invoices).toHaveLength(1);
  });

  it('renders an A4 PDF, including non-Latin names and many lines', async () => {
    const admin = await asAdmin();
    await prisma.setting.create({
      data: { key: 'legal', value: { companyName: 'Triad Vision GmbH', street: 'Musterstraße 1', zip: '10115', city: 'Berlin', vatId: 'DE999999999', registerCourt: 'AG Berlin', registerNumber: 'HRB 1' } },
    });
    await admin.agent.put('/api/admin/invoices/settings').send({ invoicing: { iban: 'de89 3704 0044 0532 0130 00', bic: 'cobadeffxxx', bank: 'Commerzbank', accountHolder: 'Triad Vision GmbH', footer: 'Danke!' } }).expect(200);
    const c = await makeCompany({ name: 'Şirkət Əliyev — ООО «Ромашка»', contactName: 'Елена Иванова', address: 'Nizami küç. 1\nBakı' });
    const items = Array.from({ length: 45 }, (_, i) => ({ description: `Leistung ${i + 1}: Vermittlung und Begleitung (İşçi ${i + 1}) — Ühersetzung ğ ş ə`, quantity: 1, unitPriceCents: 1000 + i }));
    const inv = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id, { items })).expect(201)).body.invoice;
    const draftPdf = await pdfOf(admin.agent.get(`/api/admin/invoices/${inv.id}/pdf`));
    expect(draftPdf.res.headers['content-disposition']).toContain('Rechnung-Entwurf.pdf');
    expect(draftPdf.doc.getPageCount()).toBeGreaterThan(1);
    const { width, height } = draftPdf.doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);

    await admin.agent.post(`/api/admin/invoices/${inv.id}/send`).expect(200);
    const sent = await pdfOf(admin.agent.get(`/api/admin/invoices/${inv.id}/pdf`));
    expect(sent.res.headers['content-disposition']).toContain(`Rechnung-TV-RE-${year}-0001.pdf`);
    expect(sent.doc.getTitle()).toBe(`Rechnung TV-RE-${year}-0001`);
  });
});

describe('settings', () => {
  it('validates and normalises bank details and reports missing legal data', async () => {
    const admin = await asAdmin();
    const empty = await admin.agent.get('/api/admin/invoices/settings').expect(200);
    expect(empty.body.legalMissing).toEqual(['name', 'address', 'vatId']);
    expect(empty.body.invoicing).toMatchObject({ defaultVatRate: 19, paymentTermsDays: 14, smallBusiness: false });

    await admin.agent.put('/api/admin/invoices/settings').send({ invoicing: { iban: 'not an iban' } }).expect(400);
    await admin.agent.put('/api/admin/invoices/settings').send({ invoicing: { bic: 'x' } }).expect(400);
    await admin.agent.put('/api/admin/invoices/settings').send({ invoicing: { defaultVatRate: 120 } }).expect(400);
    const ok = await admin.agent.put('/api/admin/invoices/settings').send({ invoicing: { iban: 'de89370400440532013000', bic: 'cobadeffxxx', smallBusiness: true } }).expect(200);
    expect(ok.body.invoicing).toMatchObject({ iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', smallBusiness: true });
    expect(await prisma.auditLog.count({ where: { action: 'INVOICE_SETTINGS' } })).toBe(1); // only the successful save

    await prisma.setting.create({ data: { key: 'legal', value: { name: 'Triad Vision GmbH', address: 'Musterstraße 1\n10115 Berlin', taxNumber: '12/345/67890' } } });
    const full = await admin.agent.get('/api/admin/invoices/settings').expect(200);
    expect(full.body.legalMissing).toEqual([]);
    expect(full.body.seller).toMatchObject({ name: 'Triad Vision GmbH', street: 'Musterstraße 1', zipCity: '10115 Berlin' });

    const staff = await asStaff();
    await staff.agent.put('/api/admin/invoices/settings').send({ invoicing: {} }).expect(403);
  });
});

describe('company portal', () => {
  it('shows only the own company’s sent invoices and their PDFs', async () => {
    const admin = await asAdmin();
    const mine = await makeCompany();
    const other = await makeCompany({ name: 'Other GmbH', email: 'o@test.local' });
    const emp = await employer(mine.id);
    const mk = async (companyId: string) => (await admin.agent.post('/api/admin/invoices').send(draftBody(companyId)).expect(201)).body.invoice;
    const sent = await mk(mine.id);
    const draft = await mk(mine.id);
    const foreign = await mk(other.id);
    await admin.agent.post(`/api/admin/invoices/${sent.id}/send`).expect(200);
    await admin.agent.post(`/api/admin/invoices/${foreign.id}/send`).expect(200);

    const list = await emp.agent.get('/api/company/invoices').expect(200);
    expect(list.body.invoices).toHaveLength(1);
    expect(list.body.invoices[0]).toMatchObject({ id: sent.id, status: 'SENT', number: `TV-RE-${year}-0001`, grossCents: sent.grossCents });
    expect(list.body.summary).toMatchObject({ openCount: 1, openCents: sent.grossCents, overdueCount: 0 });

    await pdfOf(emp.agent.get(`/api/company/invoices/${sent.id}/pdf`));
    expect((await emp.agent.get(`/api/company/invoices/${foreign.id}/pdf`).expect(404)).body.error).toBe('INVOICE_NOT_FOUND');
    await emp.agent.get(`/api/company/invoices/${draft.id}/pdf`).expect(404);

    const client = await asClient();
    await client.agent.get('/api/company/invoices').expect(403);
    await admin.agent.get('/api/company/invoices').expect(403);
    await anon().get('/api/company/invoices').expect(401);
    const orphan = await createUser({ role: 'COMPANY' });
    expect((await sessionAgent(orphan.token).get('/api/company/invoices').expect(403)).body.error).toBe('NO_COMPANY');
  });
});

describe('overdue job', () => {
  it('marks overdue once, notifies admins and the company, then reminds every 7 days at most 3 times', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const emp = await employer(c.id);
    const inv = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id, { issueDate: new Date(Date.now() - 20 * DAY).toISOString().slice(0, 10) })).expect(201)).body.invoice;
    await admin.agent.post(`/api/admin/invoices/${inv.id}/send`).expect(200);
    const fresh = (await admin.agent.post('/api/admin/invoices').send(draftBody(c.id, { issueDate: new Date().toISOString().slice(0, 10) })).expect(201)).body.invoice;
    await admin.agent.post(`/api/admin/invoices/${fresh.id}/send`).expect(200);
    await emailsTo('billing@mueller.test', 2);

    const first = await runInvoiceOverdue();
    expect(first).toEqual({ markedOverdue: 1, reminders: 0 });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('OVERDUE');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('SENT');
    await waitFor(() => prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'STAFF', title: { startsWith: 'Hesab-faktura gecikir' } } }));
    await waitFor(() => prisma.notification.findFirst({ where: { userId: emp.user.id, type: 'INVOICE_OVERDUE' } }));
    const mails = await emailsTo('billing@mueller.test', 3);
    expect(mails.at(-1)!.subject).toMatch(/^Triad Vision · Zahlung überfällig: TV-RE-/);

    expect(await runInvoiceOverdue()).toEqual({ markedOverdue: 0, reminders: 0 });
    await settle();
    expect(await prisma.notification.count({ where: { userId: emp.user.id, type: 'INVOICE_OVERDUE' } })).toBe(1);

    const key = `invoice-overdue:${inv.id}`;
    const ago = (d: number) => prisma.reminderLog.update({ where: { key }, data: { sentAt: new Date(Date.now() - d * DAY) } });
    await ago(8);
    expect((await runInvoiceOverdue()).reminders).toBe(1);
    expect((await runInvoiceOverdue()).reminders).toBe(0);
    await ago(15);
    expect((await runInvoiceOverdue()).reminders).toBe(1);
    await ago(22);
    expect((await runInvoiceOverdue()).reminders).toBe(1);
    await ago(60);
    expect((await runInvoiceOverdue()).reminders).toBe(0);
    await settle();
    expect(await prisma.notification.count({ where: { userId: emp.user.id, type: 'INVOICE_REMINDER' } })).toBe(3);

    // paying stops everything
    await admin.agent.post(`/api/admin/invoices/${inv.id}/paid`).send({}).expect(200);
    expect(await runInvoiceOverdue()).toEqual({ markedOverdue: 0, reminders: 0 });
  });
});
