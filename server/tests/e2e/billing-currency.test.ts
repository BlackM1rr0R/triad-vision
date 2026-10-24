import crypto from 'node:crypto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { anon, asAdmin, asClient, asStaff, ORIGIN, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { l10n, l10nList } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { pdfText } from '../helpers/pdfText';
import { createCase } from '../../src/lib/caseFlow.js';
import { signAsSigner } from '../../src/lib/esign/service.js';
import { decodeCp1252 } from '../../src/lib/accounting/cp1252.js';

/**
 * Multi-currency billing (EUR / AZN / TRY, issuing entity per currency), package prices per currency,
 * the DATEV export (EXTF Buchungsstapel, CP1252, ZIP with PDFs) and the XRechnung of company invoices.
 */

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

const year = new Date().getUTCFullYear();
const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;

const binary = async (agent: Agent, url: string, type: string) => {
  const res = await agent.get(url).buffer(true).parse(binaryParser).expect(200);
  expect(res.headers['content-type']).toContain(type);
  return { res, body: res.body as Buffer };
};

const legal = () =>
  prisma.setting.upsert({
    where: { key: 'legal' },
    create: { key: 'legal', value: { companyName: 'Triad Vision GmbH', street: 'Musterstraße 1', zip: '10115', city: 'Berlin', vatId: 'DE111222333', email: 'rechnung@triad.test', phone: '+49 30 123' } },
    update: {},
  });
const invoicing = () =>
  prisma.setting.upsert({
    where: { key: 'invoicing' },
    create: { key: 'invoicing', value: { iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', bank: 'Commerzbank', accountHolder: 'Triad Vision GmbH', defaultVatRate: 19, paymentTermsDays: 14 } },
    update: {},
  });

const azEntity = {
  entities: {
    az: { enabled: true, name: 'Triad Vision MMC', street: 'Nizami küç. 1', zipCity: 'AZ1000 Bakı', taxNumber: '1234567891', vatMode: 'STANDARD', vatRate: 18, bank: { iban: 'AZ21NABZ00000000137010001944', accountHolder: 'Triad Vision MMC' } },
    byCurrency: { EUR: 'DE', AZN: 'AZ', TRY: 'DE' },
    defaultCurrency: 'EUR',
  },
  rates: { rates: { AZN: 2, TRY: 40 }, date: today },
};

const line = (cents: number, category = 'SERVICE_FEE') => ({ description: 'Servicegebühr', quantity: 1, unitPriceCents: cents, category });

describe('currencies and billing entities', () => {
  it('ADMIN+ only; AZN invoices are issued by the Baku entity with its own number range and VAT; totals per currency', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    await legal();
    await staff.agent.get('/api/admin/accounting/currencies').expect(403);
    await admin.agent.put('/api/admin/accounting/currencies').send({ rates: { rates: { AZN: -1 } } }).expect(400);
    const saved = (await admin.agent.put('/api/admin/accounting/currencies').send(azEntity).expect(200)).body;
    expect(saved.currencies).toEqual(['EUR', 'AZN', 'TRY']);
    expect(saved.entities.byCurrency.AZN).toBe('AZ');
    expect(saved.rates.rates).toEqual({ AZN: 2, TRY: 40 });

    const client = await asClient({ firstName: 'Leyla', lastName: 'Əliyeva', locale: 'az' });
    const kase = await createCase(client.user.id, { profession: 'Tibb bacısı', visaType: 'WORK', quiet: true });
    const eur = (await staff.agent.post('/api/admin/client-billing/invoices').send({ clientId: client.user.id, caseId: kase.id, items: [line(100000)] }).expect(201)).body.invoice;
    expect(eur).toMatchObject({ currency: 'EUR', vatRate: 19, grossCents: 119000 });
    const azn = (await staff.agent.post('/api/admin/client-billing/invoices').send({ clientId: client.user.id, caseId: kase.id, currency: 'AZN', items: [line(50000)] }).expect(201)).body.invoice;
    expect(azn).toMatchObject({ currency: 'AZN', vatRate: 18, vatCents: 9000, grossCents: 59000 });
    await staff.agent.post('/api/admin/client-billing/invoices').send({ clientId: client.user.id, currency: 'USD', items: [line(100)] }).expect(400);

    const sentEur = (await staff.agent.post(`/api/admin/client-billing/invoices/${eur.id}/send`).expect(200)).body.invoice;
    const sentAzn = (await staff.agent.post(`/api/admin/client-billing/invoices/${azn.id}/send`).expect(200)).body.invoice;
    expect(sentEur.number).toBe(`TV-KR-${year}-0001`);
    expect(sentAzn.number).toBe(`TV-AZ-${year}-0001`);
    const mail = await waitFor(async () => mails.find((m) => m.subject.includes(sentAzn.number)));
    expect(mail.html).toContain('590,00 ₼');
    // Bilingual PDF of the Baku entity (DejaVu has no ₼ glyph: the amount carries the code).
    const { body } = await binary(admin.agent, `/api/admin/client-billing/invoices/${azn.id}/pdf`, 'application/pdf');
    expect((await PDFDocument.load(body)).getTitle()).toBe(`Rechnung ${sentAzn.number}`);

    // A payment takes the invoice currency; totals are never added across currencies.
    const pay = (await staff.agent.post(`/api/admin/client-billing/invoices/${azn.id}/payments`).send({ amountCents: 20000, method: 'CASH' }).expect(201)).body;
    expect(pay.payment.currency).toBe('AZN');
    const view = (await staff.agent.get(`/api/admin/client-billing/cases/${kase.id}`).expect(200)).body;
    expect(view.totals.byCurrency).toEqual([
      expect.objectContaining({ currency: 'EUR', invoicedCents: 119000, paidCents: 0, openCents: 119000 }),
      expect.objectContaining({ currency: 'AZN', invoicedCents: 59000, paidCents: 20000, openCents: 39000 }),
    ]);
    const list = (await admin.agent.get('/api/admin/client-billing/invoices?currency=AZN').expect(200)).body;
    expect(list.invoices.map((i: { id: string }) => i.id)).toEqual([azn.id]);
    const csv = await admin.agent.get('/api/admin/client-billing/invoices.csv').expect(200);
    expect(csv.text.split('\r\n')[0]).toMatch(/;Währung$/);
    expect(csv.text).toContain(`${sentAzn.number};`);
    expect(csv.text).toMatch(/;AZN\r\n/);
    // Client portal: both currencies listed separately.
    const portal = (await client.agent.get('/api/account/billing').expect(200)).body;
    expect(portal.totals.byCurrency.map((t: { currency: string }) => t.currency)).toEqual(['EUR', 'AZN']);
  });

  it('payment plans carry a currency into every instalment invoice', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const kase = await createCase(client.user.id, { profession: 'Aşpaz', visaType: 'WORK', quiet: true });
    const r = (
      await staff.agent
        .post('/api/admin/client-billing/plans')
        .send({ clientId: client.user.id, caseId: kase.id, title: 'Plan TRY', currency: 'TRY', installments: [{ label: 'Rate 1', trigger: 'DATE', dueDate: today, amountCents: 1190000 }] })
        .expect(201)
    ).body;
    expect(r.plan.currency).toBe('TRY');
    const inv = await prisma.clientInvoice.findFirstOrThrow({ where: { planId: r.plan.id } });
    expect(inv).toMatchObject({ currency: 'TRY', grossCents: 1190000, status: 'SENT' });
    expect(inv.number.startsWith(`TV-KR-${year}-`)).toBe(true);
  });
});

describe('package prices per currency', () => {
  const pkgBody = { slug: 'standard', tier: 'STANDARD', visaTypes: null, title: l10n('Standard'), summary: l10n('S'), features: l10nList('F'), priceCents: 250000, installments: null, published: true, prices: { AZN: 480000 } };
  const order = (packageId: string, over: Record<string, unknown> = {}) => ({
    packageId,
    name: 'Rauf Həsənov',
    email: `rauf.${crypto.randomBytes(3).toString('hex')}@test.local`,
    locale: 'az',
    acceptTerms: true,
    acceptPrivacy: true,
    token: crypto.randomBytes(32).toString('base64url'),
    ...over,
  });

  it('shows the visitor currency where a price exists; an az order runs in AZN through contract, plan and invoice', async () => {
    const admin = await asAdmin();
    const pkg = (await admin.agent.post('/api/admin/packages').send(pkgBody).expect(201)).body.package;
    expect(pkg.prices).toEqual({ EUR: 250000, AZN: 480000 });
    await admin.agent.post('/api/admin/packages').send({ ...pkgBody, slug: 'bad', prices: { AZN: 5 } }).expect(400);
    const pub = (await anon().get('/api/packages').expect(200)).body.packages[0];
    expect(pub.prices).toEqual({ EUR: 250000, AZN: 480000 });

    const o = (await anon().post('/api/packages/orders').set('Origin', ORIGIN).send(order(pkg.id)).expect(201)).body.order;
    expect(o).toMatchObject({ priceCents: 480000, currency: 'AZN' });
    const row = await prisma.packageOrder.findFirstOrThrow({ where: { currency: 'AZN' } });
    const signer = await prisma.signatureSigner.findFirstOrThrow({ where: { requestId: row.signatureRequestId! } });
    await signAsSigner(signer.id, { mode: 'TYPE', typedName: 'Rauf Həsənov' }, 'EMAIL_OTP', {});
    const done = await prisma.packageOrder.findUniqueOrThrow({ where: { id: row.id } });
    expect(done.status).toBe('ACTIVE');
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: done.planId! } })).currency).toBe('AZN');
    const inv = await prisma.clientInvoice.findFirstOrThrow({ where: { orderId: row.id } });
    expect(inv).toMatchObject({ currency: 'AZN', grossCents: 480000 });

    // No TRY price: a Turkish visitor orders at the base price.
    const tr = (await anon().post('/api/packages/orders').set('Origin', ORIGIN).send(order(pkg.id, { locale: 'tr' })).expect(201)).body.order;
    expect(tr).toMatchObject({ priceCents: 250000, currency: 'EUR' });
    // Updating without `prices` keeps them; {} removes them.
    await admin.agent.put(`/api/admin/packages/${pkg.id}`).send({ ...pkgBody, prices: undefined }).expect(200);
    expect((await admin.agent.get('/api/admin/packages').expect(200)).body.packages[0].prices).toEqual({ EUR: 250000, AZN: 480000 });
    await admin.agent.put(`/api/admin/packages/${pkg.id}`).send({ ...pkgBody, prices: {} }).expect(200);
    expect((await admin.agent.get('/api/admin/packages').expect(200)).body.packages[0].prices).toEqual({ EUR: 250000 });
  });
});

describe('DATEV export', () => {
  it('needs the DATEV settings; writes an EXTF Buchungsstapel in CP1252 with invoices, storno and payments; ZIP with PDFs', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    await legal();
    await invoicing();
    await admin.agent.get(`/api/admin/accounting/datev/preview?from=${monthStart}&to=${today}`).expect(400);
    await admin.agent.put('/api/admin/accounting/datev/settings').send({ consultantNumber: 1234567, clientNumber: 10001, chart: 'SKR04', accounts: { bank: 'x' } }).expect(400);
    await admin.agent.put('/api/admin/accounting/datev/settings').send({ consultantNumber: 1234567, clientNumber: 10001, chart: 'SKR04' }).expect(200);
    await admin.agent.put('/api/admin/accounting/currencies').send(azEntity).expect(200);

    const client = await asClient({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const mk = async (body: Record<string, unknown>) => {
      const d = (await staff.agent.post('/api/admin/client-billing/invoices').send({ clientId: client.user.id, issueDate: today, ...body }).expect(201)).body.invoice;
      return (await staff.agent.post(`/api/admin/client-billing/invoices/${d.id}/send`).expect(200)).body.invoice;
    };
    const inv = await mk({ items: [line(100000), line(7500, 'EMBASSY_FEE')] });
    await staff.agent.post(`/api/admin/client-billing/invoices/${inv.id}/payments`).send({ amountCents: 50000, method: 'CASH' }).expect(201);
    const cancelled = await mk({ items: [line(10000)] });
    await admin.agent.post(`/api/admin/client-billing/invoices/${cancelled.id}/cancel`).send({ reason: 'Fehler' }).expect(200);
    await mk({ currency: 'AZN', items: [line(10000)] }); // Baku entity: not in the German export
    const tryInv = await mk({ currency: 'TRY', items: [line(400000)] });

    const company = await prisma.company.create({ data: { name: 'Logistik Müller GmbH', email: 'billing@mueller.test', address: 'Hafenstraße 5\n20457 Hamburg', city: 'Hamburg', status: 'ACTIVE' } });
    const ci = (await admin.agent.post('/api/admin/invoices').send({ companyId: company.id, issueDate: today, items: [{ description: 'Vermittlung', quantity: 1, unitPriceCents: 200000 }] }).expect(201)).body.invoice;
    const sentCi = (await admin.agent.post(`/api/admin/invoices/${ci.id}/send`).expect(200)).body.invoice;
    await admin.agent.post(`/api/admin/invoices/${ci.id}/paid`).send({}).expect(200);

    const preview = (await admin.agent.get(`/api/admin/accounting/datev/preview?from=${monthStart}&to=${today}`).expect(200)).body;
    expect(preview.counts).toMatchObject({ companyInvoices: 1, clientInvoices: 3, cancellations: 1, payments: 2, skipped: 1 });
    expect(preview.warnings).toEqual([expect.objectContaining({ code: 'OTHER_ENTITY' })]);

    const { res, body } = await binary(admin.agent, `/api/admin/accounting/datev/export?from=${monthStart}&to=${today}`, 'text/csv');
    expect(res.headers['content-type']).toContain('windows-1252');
    expect(res.headers['content-disposition']).toContain('EXTF_Buchungsstapel_');
    expect(body.includes(Buffer.from('Schlüssel', 'utf8'))).toBe(false); // not UTF-8
    const text = decodeCp1252(body);
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines[0].startsWith('"EXTF";700;21;"Buchungsstapel";13;')).toBe(true);
    expect(lines[0]).toContain(';1234567;10001;');
    expect(lines[0]).toContain(';"04";');
    expect(lines[1].split(';')).toHaveLength(125);
    const rows = lines.slice(2).map((l) => l.split(';'));
    const debtor = rows.find((r) => r[10] === `"${inv.number}"` && r[7] === '4400')!;
    expect(debtor.slice(0, 3)).toEqual(['1190,00', '"S"', '"EUR"']);
    const debtorNo = debtor[6];
    expect(debtorNo).toMatch(/^1000\d$/); // Debitor per party from debtorStart (10000)
    expect(rows.find((r) => r[10] === `"${inv.number}"` && r[7] === '1370')![0]).toBe('75,00'); // durchlaufende Posten
    const cash = rows.find((r) => r[10] === `"${inv.number}"` && r[6] === '1600')!; // cash payment: Kasse an Debitor
    expect([cash[0], cash[1], cash[7]]).toEqual(['500,00', '"S"', debtorNo]);
    const storno = rows.filter((r) => r[10] === `"${cancelled.number}"`);
    expect(storno.map((r) => r[1]).sort()).toEqual(['"H"', '"S"']);
    const fx = rows.find((r) => r[10] === `"${tryInv.number}"`)!;
    expect(fx.slice(0, 6)).toEqual(['4760,00', '"S"', '"TRY"', '40', '119,00', '"EUR"']);
    const comp = rows.filter((r) => r[10] === `"${sentCi.number}"`);
    expect(comp).toHaveLength(2); // invoice + payment (bank 1800)
    expect(comp.some((r) => r[6] === '1800')).toBe(true);
    expect(text).toContain('Leyla Eliyeva'); // transliterated for CP1252

    // Debitor numbers stay stable across exports.
    const again = decodeCp1252((await binary(admin.agent, `/api/admin/accounting/datev/export?from=${monthStart}&to=${today}&payments=0`, 'text/csv')).body);
    expect(again.split('\r\n').slice(2).some((l) => l.split(';')[6] === debtorNo && l.includes(inv.number))).toBe(true);
    expect(again.split('\r\n').slice(2).some((l) => l.includes('Zahlung'))).toBe(false);

    const zipRes = await binary(admin.agent, `/api/admin/accounting/datev/export?from=${monthStart}&to=${today}&pdfs=1`, 'application/zip');
    const zip = await JSZip.loadAsync(zipRes.body);
    const names = Object.keys(zip.files);
    expect(names.some((n) => n.startsWith('EXTF_Buchungsstapel_'))).toBe(true);
    expect(names).toContain(`Belege/Rechnung-${inv.number}.pdf`);
    expect(names).toContain(`Belege/Rechnung-${sentCi.number}.pdf`);
    expect(names).toContain('Hinweise.txt');

    // A period across two fiscal years is refused.
    await admin.agent.get(`/api/admin/accounting/datev/export?from=${year - 1}-12-01&to=${year}-01-31`).expect(400);
    await staff.agent.get(`/api/admin/accounting/datev/export?from=${monthStart}&to=${today}`).expect(403);
  });
});

describe('XRechnung for company invoices', () => {
  it('downloads the UBL XML of an issued invoice; Leitweg-ID per company; XML attached to the e-mail when enabled; currencies', async () => {
    const admin = await asAdmin();
    await legal();
    await invoicing();
    const company = await prisma.company.create({ data: { name: 'Stadtwerke Musterstadt', email: 'rechnung@stadtwerke.test', address: 'Rathausplatz 1\n12345 Musterstadt', city: 'Musterstadt', vatId: 'DE999888777', status: 'ACTIVE' } });
    const draft = (await admin.agent.post('/api/admin/invoices').send({ companyId: company.id, items: [{ description: 'Vermittlung <Pflege> & Betreuung', quantity: 2, unitPriceCents: 150000 }] }).expect(201)).body.invoice;
    await admin.agent.get(`/api/admin/invoices/${draft.id}/xrechnung`).expect(409);
    const sent = (await admin.agent.post(`/api/admin/invoices/${draft.id}/send`).expect(200)).body.invoice;
    const firstMail = await waitFor(async () => mails.find((m) => m.to === 'rechnung@stadtwerke.test'));
    expect(firstMail.attachments?.map((a) => a.filename)).toEqual([`Rechnung-${sent.number}.pdf`]);

    await admin.agent.put(`/api/admin/invoices/companies/${company.id}/e-invoice`).send({ leitwegId: 'not a leitweg id!' }).expect(400);
    const meta = (await admin.agent.put(`/api/admin/invoices/companies/${company.id}/e-invoice`).send({ leitwegId: '991-12345-67', attachXml: true }).expect(200)).body.eInvoice;
    expect(meta).toMatchObject({ leitwegId: '991-12345-67', attachXml: true });
    expect((await admin.agent.get(`/api/admin/invoices/companies/${company.id}/e-invoice`).expect(200)).body.eInvoice.leitwegId).toBe('991-12345-67');

    const res = await admin.agent.get(`/api/admin/invoices/${draft.id}/xrechnung`).expect(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.headers['content-disposition']).toContain(`XRechnung-${sent.number}.xml`);
    expect(decodeURIComponent(String(res.headers['x-xrechnung-missing']))).toBe('');
    const xml = res.text;
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(`<cbc:ID>${sent.number}</cbc:ID>`);
    expect(xml).toContain('<cbc:BuyerReference>991-12345-67</cbc:BuyerReference>');
    expect(xml).toContain('<cbc:PostalZone>12345</cbc:PostalZone>');
    expect(xml).toContain('Vermittlung &lt;Pflege&gt; &amp; Betreuung');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">3570.00</cbc:PayableAmount>');

    mails.length = 0;
    await admin.agent.post(`/api/admin/invoices/${draft.id}/send`).expect(200); // re-send
    const second = await waitFor(async () => mails.find((m) => m.to === 'rechnung@stadtwerke.test'));
    expect(second.attachments?.map((a) => a.filename)).toEqual([`Rechnung-${sent.number}.pdf`, `XRechnung-${sent.number}.xml`]);

    // A TRY invoice: own currency on the PDF (code, Helvetica has no ₺) and kept out of the EUR totals.
    const tr = (await admin.agent.post('/api/admin/invoices').send({ companyId: company.id, currency: 'TRY', items: [{ description: 'Hizmet', quantity: 1, unitPriceCents: 1000000 }] }).expect(201)).body.invoice;
    expect(tr.currency).toBe('TRY');
    await admin.agent.post(`/api/admin/invoices/${tr.id}/send`).expect(200);
    const pdf = await binary(admin.agent, `/api/admin/invoices/${tr.id}/pdf`, 'application/pdf');
    expect(await pdfText(pdf.body)).toContain('11.900,00 TRY');
    const totals = (await admin.agent.get('/api/admin/invoices').expect(200)).body.totals;
    expect(totals).toMatchObject({ currency: 'EUR', openCents: 357000 });
    expect(totals.byCurrency).toEqual([expect.objectContaining({ currency: 'EUR', openCents: 357000 }), expect.objectContaining({ currency: 'TRY', openCents: 1190000 })]);
  });
});
