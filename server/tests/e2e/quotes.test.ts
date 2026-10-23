import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { anon, asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { emailsTo, prisma, settle } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { pdfText } from '../helpers/pdfText';
import { runQuoteExpiry } from '../../src/jobs/quotes.js';
import { computeQuoteTotals } from '../../src/lib/quotes/math.js';

const DAY = 24 * 60 * 60 * 1000;
const year = new Date().getUTCFullYear();
const isoIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const UA = 'QuoteTest/1.0';

const makeCompany = (over: Record<string, unknown> = {}) =>
  prisma.company.create({
    data: { name: 'Spedition Krause GmbH', email: 'einkauf@krause.test', address: 'Industriestraße 12\n28197 Bremen', city: 'Bremen', vatId: 'DE987654321', contactName: 'Herr Krause', status: 'ACTIVE', ...over },
  });

const employer = async (companyId: string) => {
  const u = await createUser({ role: 'COMPANY', locale: 'de' });
  await prisma.user.update({ where: { id: u.user.id }, data: { companyId } });
  return { ...u, agent: sessionAgent(u.token) };
};

const body = (companyId: string, over: Record<string, unknown> = {}) => ({
  companyId,
  title: 'Vermittlung von 3 LKW-Fahrern (CE)',
  contactName: 'Herr Krause',
  introText: 'vielen Dank für Ihr Interesse.',
  closingText: 'Wir freuen uns auf die Zusammenarbeit.',
  paymentTerms: '50 % bei Auftragserteilung, 50 % bei Arbeitsantritt.',
  deliveryTerms: 'Bereitstellung der Fachkräfte innerhalb von 12–16 Wochen.',
  items: [
    { description: 'Personalvermittlung LKW-Fahrer (CE) – je Fachkraft', quantity: 3, unit: 'PERSON', unitPriceCents: 450000, catalogueId: 'placement-ce' },
    { description: 'Visa- und Behördenservice', quantity: 3, unit: 'PERSON', unitPriceCents: 90000 },
  ],
  ...over,
});

const pdfOf = async (req: ReturnType<ReturnType<typeof anon>['get']>) => {
  const res = await req.buffer(true).parse(binaryParser).expect(200);
  expect(res.headers['content-type']).toBe('application/pdf');
  const buf = res.body as Buffer;
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  await PDFDocument.load(buf);
  return buf;
};

const create = async (admin: Awaited<ReturnType<typeof asAdmin>>, companyId: string, over: Record<string, unknown> = {}) =>
  (await admin.agent.post('/api/admin/quotes').send(body(companyId, over)).expect(201)).body.quote;

const sendIt = async (admin: Awaited<ReturnType<typeof asAdmin>>, id: string, payload: Record<string, unknown> = {}) => {
  const res = await admin.agent.post(`/api/admin/quotes/${id}/send`).send(payload).expect(200);
  const url: string = res.body.quote.publicUrl;
  return { quote: res.body.quote, token: url.split('/angebot/')[1], emailed: res.body.emailed as boolean };
};

describe('authorization', () => {
  it('is admin-only; employers and the public cannot reach the admin API', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const c = await makeCompany();
    const emp = await employer(c.id);
    for (const a of [staff.agent, client.agent, emp.agent]) await a.get('/api/admin/quotes').expect(403);
    await anon().get('/api/admin/quotes').expect(401);
    await staff.agent.get('/api/admin/quotes/settings').expect(403);
    await staff.agent.post('/api/admin/quotes').send(body(c.id)).expect(403);
    // the company portal is for employers only
    await client.agent.get('/api/company/quotes').expect(403);
    await anon().get('/api/company/quotes').expect(401);
  });
});

describe('totals', () => {
  it('computes subtotal, percent discount and VAT per rate in cents', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id, {
      items: [
        { description: 'Vermittlung', quantity: 3, unit: 'PERSON', unitPriceCents: 450000 },
        { description: 'Sprachmaterial', quantity: 2.5, unit: 'PIECE', unitPriceCents: 9999, vatRate: 7 },
      ],
      discount: { type: 'PERCENT', value: 10 },
    });
    // 3 × 4.500,00 = 13.500,00 (19 %) · 2,5 × 99,99 = 249,975 → 249,98 (7 %) · subtotal 13.749,98
    // 10 % = 1.374,998 → 1.375,00, spread 1.350,00 / 25,00 → nets 12.150,00 / 224,98
    // VAT 2.308,50 + 15,7486 → 15,75 = 2.324,25 · gross 12.374,98 + 2.324,25 = 14.699,23
    expect(q).toMatchObject({ status: 'DRAFT', number: null, subtotalCents: 1374998, discountCents: 137500, netCents: 1237498, vatCents: 232425, grossCents: 1469923, vatRate: 19 });
    expect(q.discount).toEqual({ type: 'PERCENT', value: 10 });
    expect(q.vatBreakdown).toEqual([
      { rate: 19, netCents: 1215000, vatCents: 230850 },
      { rate: 7, netCents: 22498, vatCents: 1575 },
    ]);
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(row).toMatchObject({ number: null, discountType: 'PERCENT', discountValue: 1000, grossCents: 1469923 });
    // default validity: +30 days
    expect(row.validUntil.toISOString().slice(0, 10)).toBe(isoIn(30));
    expect(await prisma.auditLog.count({ where: { action: 'QUOTE_CREATE', target: q.id } })).toBe(1);
    expect(await prisma.quoteEvent.count({ where: { quoteId: q.id, type: 'CREATED' } })).toBe(1);
  });

  it('handles amount discounts, rejects too high ones and follows §19 small-business mode', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const a = await create(admin, c.id, { discount: { type: 'AMOUNT', value: 50000 } });
    // 13.500 + 2.700 = 16.200,00 − 500,00 = 15.700,00 · 19 % = 2.983,00
    expect(a).toMatchObject({ subtotalCents: 1620000, discountCents: 50000, netCents: 1570000, vatCents: 298300, grossCents: 1868300 });
    expect((await admin.agent.post('/api/admin/quotes').send(body(c.id, { discount: { type: 'AMOUNT', value: 99_999_999 } })).expect(400)).body.error).toBe('DISCOUNT_TOO_HIGH');
    expect((await admin.agent.post('/api/admin/quotes').send(body(c.id, { discount: { type: 'PERCENT', value: 120 } })).expect(400)).body.error).toBe('INVALID_DISCOUNT');
    await admin.agent.post('/api/admin/quotes').send(body(c.id, { items: [] })).expect(400);
    await admin.agent.post('/api/admin/quotes').send(body(c.id, { items: [{ description: 'x', quantity: 1.234, unit: 'PERSON', unitPriceCents: 100 }] })).expect(400);
    await admin.agent.post('/api/admin/quotes').send(body('missing')).expect(404);

    await admin.agent.put('/api/admin/invoices/settings').send({ invoicing: { smallBusiness: true } }).expect(200);
    const s = await create(admin, c.id, { items: [{ description: 'x', quantity: 2, unit: 'PERSON', unitPriceCents: 10000, vatRate: 7 }] });
    expect(s).toMatchObject({ vatRate: 0, vatCents: 0, grossCents: 20000, netCents: 20000 });
    const text = await pdfText(await pdfOf(admin.agent.get(`/api/admin/quotes/${s.id}/pdf`)));
    expect(text).toContain('19 UStG');
  });

  it('spreads the discount so the VAT groups add up (unit)', () => {
    const t = computeQuoteTotals(
      [
        { quantity: 1, unitPriceCents: 3333, vatRate: null },
        { quantity: 1, unitPriceCents: 3333, vatRate: 7 },
        { quantity: 1, unitPriceCents: 3334, vatRate: 0 },
      ],
      19,
      { type: 'AMOUNT', value: 1001 },
    );
    expect(t.netCents).toBe(10000 - 1001);
    expect(t.vatBreakdown.reduce((a, g) => a + g.netCents, 0)).toBe(t.netCents);
    expect(t.grossCents).toBe(t.netCents + t.vatCents);
  });
});

describe('drafts, PDF and settings', () => {
  it('edits and deletes drafts only, duplicates and renders the German PDF (and a preview)', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id);
    const upd = await admin.agent.put(`/api/admin/quotes/${q.id}`).send(body(c.id, { title: 'Neu', items: [{ description: 'Pauschale', quantity: 1, unit: 'FLAT', unitPriceCents: 10000 }] })).expect(200);
    expect(upd.body.quote).toMatchObject({ title: 'Neu', netCents: 10000, vatCents: 1900, grossCents: 11900 });

    const draftPdf = await pdfText(await pdfOf(admin.agent.get(`/api/admin/quotes/${q.id}/pdf`)));
    for (const s of ['ANGEBOT', 'ENTWURF', 'Angebotsnummer', 'Angebotsdatum', 'Gültig bis', 'Bezeichnung', 'Einheit', 'Einzelpreis', 'Pauschal', 'Nettobetrag', 'Gesamtbetrag', 'Zahlungsbedingungen', 'Lieferbedingungen', 'Spedition Krause GmbH', 'Auftragserteilung'])
      expect(draftPdf).toContain(s);

    const preview = await pdfText(await pdfOf(admin.agent.post('/api/admin/quotes/preview').send(body(c.id, { discount: { type: 'PERCENT', value: 5 } }))));
    expect(preview).toContain('Zwischensumme');
    expect(preview).toContain('Rabatt 5 %');
    expect(preview).toContain('Personen');
    expect(await prisma.quote.count()).toBe(1); // the preview saves nothing

    const sent = await sendIt(admin, q.id);
    expect((await admin.agent.put(`/api/admin/quotes/${q.id}`).send(body(c.id)).expect(409)).body.error).toBe('QUOTE_NOT_DRAFT');
    await admin.agent.delete(`/api/admin/quotes/${q.id}`).expect(409);
    const finalPdf = await pdfText(await pdfOf(admin.agent.get(`/api/admin/quotes/${q.id}/pdf`)));
    expect(finalPdf).toContain(sent.quote.number);
    expect(finalPdf).not.toContain('ENTWURF');

    const dup = (await admin.agent.post(`/api/admin/quotes/${q.id}/duplicate`).expect(201)).body.quote;
    expect(dup).toMatchObject({ status: 'DRAFT', number: null, title: 'Neu', grossCents: 11900 });
    await admin.agent.delete(`/api/admin/quotes/${dup.id}`).expect(200);
    expect(await prisma.quote.count({ where: { id: dup.id } })).toBe(0);
  });

  it('serves the catalogue defaults and lets admins edit it', async () => {
    const admin = await asAdmin();
    const s = (await admin.agent.get('/api/admin/quotes/settings').expect(200)).body;
    expect(s.settings.catalogue.find((i: { id: string }) => i.id === 'placement-ce')).toMatchObject({ unit: 'PERSON', unitPriceCents: 450000 });
    expect(s.settings.validDays).toBe(30);
    expect(s.settings.deliveryTerms).toContain('12–16 Wochen');
    const next = { ...s.settings, validDays: 14, catalogue: [{ id: 'x1', name: 'Sonderleistung', unit: 'FLAT', unitPriceCents: 99900, vatRate: null, active: true }] };
    const saved = (await admin.agent.put('/api/admin/quotes/settings').send({ settings: next }).expect(200)).body;
    expect(saved.settings.catalogue).toHaveLength(1);
    expect(saved.settings.validDays).toBe(14);
    await admin.agent.put('/api/admin/quotes/settings').send({ settings: { ...next, catalogue: [next.catalogue[0], next.catalogue[0]] } }).expect(400);
    expect(await prisma.auditLog.count({ where: { action: 'QUOTE_SETTINGS' } })).toBe(1);

    const c = await makeCompany();
    const q = await create(admin, c.id);
    expect(new Date(q.validUntil).toISOString().slice(0, 10)).toBe(isoIn(14));
  });

  it('creates prospects, checks the vacancy and returns wizard options', async () => {
    const admin = await asAdmin();
    const p = (await admin.agent.post('/api/admin/quotes/prospect').send({ name: 'Neukunde Logistik GmbH', email: 'info@neukunde.test', contactName: 'Frau Berg' }).expect(201)).body.company;
    expect(p).toMatchObject({ status: 'PENDING', name: 'Neukunde Logistik GmbH' });
    const other = await makeCompany({ name: 'Andere AG' });
    const v = await prisma.vacancy.create({ data: { slug: `v-${Date.now()}`, companyId: other.id, title: { de: 'LKW-Fahrer CE' }, description: { de: 'x' }, positions: 4, status: 'OPEN' } });
    expect((await admin.agent.post('/api/admin/quotes').send(body(p.id, { vacancyId: v.id })).expect(400)).body.error).toBe('VACANCY_COMPANY_MISMATCH');
    const ok = await create(admin, other.id, { vacancyId: v.id });
    expect(ok.vacancyId).toBe(v.id);
    const opts = (await admin.agent.get('/api/admin/quotes/options').expect(200)).body;
    expect(opts.companies.map((c: { name: string }) => c.name)).toContain('Neukunde Logistik GmbH');
    expect(opts.vacancies.find((x: { id: string }) => x.id === v.id)).toMatchObject({ positions: 4, title: 'LKW-Fahrer CE', companyId: other.id });
    expect(opts.ai.available).toBe(false);
    // AI wording is optional: without a key it answers 503 and nothing breaks
    expect((await admin.agent.post('/api/admin/quotes/improve').send({ kind: 'intro', text: 'vielen dank für ihr interesse' }).expect(503)).body.error).toBe('AI_UNAVAILABLE');
  });
});

describe('numbering and sending', () => {
  it('numbers TV-AN-YYYY-NNNN on first send (numeric maximum), emails the PDF link and notifies employers', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const emp = await employer(c.id);
    // numeric maximum, not string order
    await prisma.quote.create({ data: { number: `TV-AN-${year}-0099`, companyId: c.id, title: 'alt', items: [], validUntil: new Date(), status: 'DECLINED' } });
    await prisma.quote.create({ data: { number: `TV-AN-${year}-0100`, companyId: c.id, title: 'alt', items: [], validUntil: new Date(), status: 'DECLINED' } });
    await prisma.quote.create({ data: { number: `TV-AN-${year - 1}-0500`, companyId: c.id, title: 'alt', items: [], validUntil: new Date(), status: 'DECLINED' } });
    const q = await create(admin, c.id);
    const a = await sendIt(admin, q.id);
    expect(a.quote).toMatchObject({ number: `TV-AN-${year}-0101`, status: 'SENT' });
    expect(a.emailed).toBe(true);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const q2 = await create(admin, c.id);
    expect((await sendIt(admin, q2.id)).quote.number).toBe(`TV-AN-${year}-0102`);

    const mails = await emailsTo('einkauf@krause.test');
    expect(mails.some((m) => m.subject.includes(`Angebot TV-AN-${year}-0101`))).toBe(true);
    expect(await prisma.notification.count({ where: { userId: emp.user.id, type: 'QUOTE_SENT' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'QUOTE_SEND', target: q.id } })).toBe(1);

    // resend keeps number and link; English mail on request; explicit recipient is stored
    const again = await sendIt(admin, q.id, { locale: 'en', to: 'chef@krause.test' });
    expect(again.quote.number).toBe(a.quote.number);
    expect(again.token).toBe(a.token);
    const en = await emailsTo('chef@krause.test');
    expect(en[0].subject).toContain('Quotation');
    expect(await prisma.quoteEvent.count({ where: { quoteId: q.id, type: 'RESENT' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'QUOTE_RESEND', target: q.id } })).toBe(1);

    const list = (await admin.agent.get('/api/admin/quotes').expect(200)).body;
    expect(list.totals).toMatchObject({ openCount: 2, draftCount: 0 });
    expect(list.totals.openCents).toBe(2 * q.grossCents);
    expect(list.totals.acceptanceRate).toBe(0); // 3 declined, none accepted
    expect((await admin.agent.get('/api/admin/quotes').query({ status: 'SENT', q: '0102' }).expect(200)).body.quotes).toHaveLength(1);
  });

  it('refuses to send an empty or expired-dated quote', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id, { validUntil: isoIn(-1) });
    expect((await admin.agent.post(`/api/admin/quotes/${q.id}/send`).send({}).expect(400)).body.error).toBe('VALID_UNTIL_PAST');
  });
});

describe('public link', () => {
  it('shows the quote, marks it VIEWED and accepts with name + confirmation (IP / user agent logged)', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id);
    const { token, quote } = await sendIt(admin, q.id);

    await anon().get('/api/angebot/not-a-token').expect(404);
    await anon().get(`/api/angebot/${'x'.repeat(43)}`).expect(404);
    const view = await anon().get(`/api/angebot/${token}`).set('User-Agent', UA).expect(200);
    expect(view.headers['x-robots-tag']).toContain('noindex');
    expect(view.body.quote).toMatchObject({ number: quote.number, status: 'VIEWED', canRespond: true, grossCents: q.grossCents, salutation: 'Guten Tag Herr Krause,' });
    expect(view.body.quote.items[0]).toMatchObject({ pos: 1, unitLabel: 'Personen', totalCents: 1350000 });
    expect(view.body.quote).not.toHaveProperty('tokenHash');
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(row.status).toBe('VIEWED');
    expect(row.viewedAt).not.toBeNull();
    await anon().get(`/api/angebot/${token}`).expect(200);
    expect(await prisma.quoteEvent.count({ where: { quoteId: q.id, type: 'VIEWED' } })).toBe(1);
    await pdfOf(anon().get(`/api/angebot/${token}/pdf`));

    await anon().post(`/api/angebot/${token}/accept`).send({ name: 'Max Krause' }).expect(400);
    await anon().post(`/api/angebot/${token}/accept`).send({ name: 'Max Krause', confirm: false }).expect(400);
    const acc = await anon().post(`/api/angebot/${token}/accept`).set('User-Agent', UA).send({ name: 'Max Krause', confirm: true }).expect(200);
    expect(acc.body.quote).toMatchObject({ status: 'ACCEPTED', acceptedByName: 'Max Krause', canRespond: false });
    const accepted = await prisma.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(accepted).toMatchObject({ status: 'ACCEPTED', acceptedByName: 'Max Krause', acceptedUa: UA });
    expect(accepted.acceptedIp).toBeTruthy();
    const ev = await prisma.quoteEvent.findFirstOrThrow({ where: { quoteId: q.id, type: 'ACCEPTED' } });
    expect(ev).toMatchObject({ actorName: 'Max Krause', userAgent: UA });
    expect(await prisma.notification.count({ where: { userId: admin.user.id, title: { contains: quote.number } } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: 'QUOTE_ACCEPT', target: q.id } })).toBe(1);
    expect((await anon().post(`/api/angebot/${token}/accept`).send({ name: 'Max Krause', confirm: true }).expect(409)).body.error).toBe('QUOTE_NOT_OPEN');
    await anon().post(`/api/angebot/${token}/decline`).send({ reason: 'zu teuer' }).expect(409);

    // the PDF now carries the acceptance
    expect(await pdfText(await pdfOf(anon().get(`/api/angebot/${token}/pdf`)))).toContain('Online angenommen');
    // the timeline shows it in the admin detail
    const detail = (await admin.agent.get(`/api/admin/quotes/${q.id}`).expect(200)).body.quote;
    expect(detail.events.map((e: { type: string }) => e.type)).toEqual(['CREATED', 'SENT', 'VIEWED', 'ACCEPTED']);
  });

  it('declines with a reason', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id);
    const { token } = await sendIt(admin, q.id);
    await anon().post(`/api/angebot/${token}/decline`).send({ reason: '' }).expect(400);
    const r = await anon().post(`/api/angebot/${token}/decline`).send({ reason: 'Budget für dieses Jahr ausgeschöpft' }).expect(200);
    expect(r.body.quote).toMatchObject({ status: 'DECLINED', declinedReason: 'Budget für dieses Jahr ausgeschöpft' });
    expect(await prisma.quoteEvent.count({ where: { quoteId: q.id, type: 'DECLINED' } })).toBe(1);
    const list = (await admin.agent.get('/api/admin/quotes').expect(200)).body;
    expect(list.totals).toMatchObject({ declinedCount: 1, acceptanceRate: 0 });
  });
});

describe('employer portal', () => {
  it('lists only the own company quotes (no drafts) and offers the same actions', async () => {
    const admin = await asAdmin();
    const a = await makeCompany();
    const b = await makeCompany({ name: 'Fremdfirma AG', email: 'x@fremd.test' });
    const empA = await employer(a.id);
    const empB = await employer(b.id);
    const draft = await create(admin, a.id, { title: 'Entwurf intern' });
    const sentA = await create(admin, a.id);
    await sendIt(admin, sentA.id);
    const sentB = await create(admin, b.id);
    await sendIt(admin, sentB.id);

    const list = (await empA.agent.get('/api/company/quotes').expect(200)).body.quotes;
    expect(list.map((q: { id: string }) => q.id)).toEqual([sentA.id]);
    await empA.agent.get(`/api/company/quotes/${draft.id}`).expect(404);
    await empA.agent.get(`/api/company/quotes/${sentB.id}`).expect(404);
    await empA.agent.post(`/api/company/quotes/${sentB.id}/accept`).send({ name: 'X Y', confirm: true }).expect(404);
    await empA.agent.get(`/api/company/quotes/${sentB.id}/pdf`).expect(404);

    const view = (await empA.agent.get(`/api/company/quotes/${sentA.id}`).expect(200)).body.quote;
    expect(view).toMatchObject({ id: sentA.id, status: 'VIEWED', canRespond: true });
    await pdfOf(empA.agent.get(`/api/company/quotes/${sentA.id}/pdf`));
    const acc = (await empA.agent.post(`/api/company/quotes/${sentA.id}/accept`).send({ name: 'Anna Krause', confirm: true }).expect(200)).body.quote;
    expect(acc.status).toBe('ACCEPTED');
    const ev = await prisma.quoteEvent.findFirstOrThrow({ where: { quoteId: sentA.id, type: 'ACCEPTED' } });
    expect(ev.actorId).toBe(empA.user.id);

    await empB.agent.post(`/api/company/quotes/${sentB.id}/decline`).send({ reason: 'Kein Bedarf mehr' }).expect(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: sentB.id } })).status).toBe('DECLINED');

    await prisma.company.update({ where: { id: a.id }, data: { status: 'SUSPENDED' } });
    await empA.agent.get('/api/company/quotes').expect(403);
  });
});

describe('convert to invoice', () => {
  it('turns an accepted quote into a DRAFT invoice with the same items and discount', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id, { discount: { type: 'PERCENT', value: 10 } });
    await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({}).expect(409); // draft
    const { token, quote } = await sendIt(admin, q.id);
    expect((await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({}).expect(409)).body.error).toBe('QUOTE_NOT_ACCEPTED');
    await anon().post(`/api/angebot/${token}/accept`).send({ name: 'Max Krause', confirm: true }).expect(200);

    const r = await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({}).expect(201);
    expect(r.body.partial).toBe(false);
    expect(r.body.quote).toMatchObject({ status: 'CONVERTED', invoiceId: r.body.invoiceId });
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: r.body.invoiceId } });
    expect(inv).toMatchObject({ status: 'DRAFT', companyId: c.id, vatRate: 19, netCents: q.netCents, vatCents: q.vatCents, grossCents: q.grossCents });
    const lines = inv.items as { description: string; quantity: number; unitPriceCents: number }[];
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ quantity: 3, unitPriceCents: 450000 });
    expect(lines[2]).toMatchObject({ quantity: 1, unitPriceCents: -162000 });
    expect(lines[2].description).toContain('Rabatt 10 %');
    expect(inv.note).toContain(quote.number);
    expect(await prisma.auditLog.count({ where: { action: 'QUOTE_CONVERT', target: q.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'INVOICE_CREATE', target: inv.id } })).toBe(1);
    expect((await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({}).expect(409)).body.error).toBe('QUOTE_ALREADY_CONVERTED');
    const detail = (await admin.agent.get(`/api/admin/quotes/${q.id}`).expect(200)).body.quote;
    expect(detail.invoices).toEqual([expect.objectContaining({ id: inv.id, status: 'DRAFT', number: null })]);
  });

  it('converts partially (per placed worker) until nothing remains; amount discounts add up', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id, { items: [{ description: 'Vermittlung', quantity: 3, unit: 'PERSON', unitPriceCents: 100000 }], discount: { type: 'AMOUNT', value: 10000 } });
    const { token } = await sendIt(admin, q.id);
    await anon().post(`/api/angebot/${token}/accept`).send({ name: 'Max Krause', confirm: true }).expect(200);

    expect((await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({ lines: [{ index: 0, quantity: 4 }] }).expect(400)).body.error).toBe('QUANTITY_EXCEEDS_REMAINING');
    await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({ lines: [{ index: 5, quantity: 1 }] }).expect(400);
    const p1 = (await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({ lines: [{ index: 0, quantity: 1 }] }).expect(201)).body;
    expect(p1.partial).toBe(true);
    expect(p1.quote.status).toBe('ACCEPTED');
    expect(p1.quote.items[0].convertedQty).toBe(1);
    const p2 = (await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({ lines: [{ index: 0, quantity: 1 }] }).expect(201)).body;
    const p3 = (await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({}).expect(201)).body;
    expect(p3.partial).toBe(false);
    expect(p3.quote.status).toBe('CONVERTED');
    const invs = await prisma.invoice.findMany({ where: { id: { in: [p1.invoiceId, p2.invoiceId, p3.invoiceId] } } });
    expect(invs.reduce((a, i) => a + i.netCents, 0)).toBe(q.netCents);
    expect(p3.quote.invoices).toHaveLength(3);
  });

  it('refuses mixed VAT rates in one invoice', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id, { items: [{ description: 'A', quantity: 1, unit: 'FLAT', unitPriceCents: 1000 }, { description: 'B', quantity: 1, unit: 'PIECE', unitPriceCents: 1000, vatRate: 7 }] });
    const { token } = await sendIt(admin, q.id);
    await anon().post(`/api/angebot/${token}/accept`).send({ name: 'Max Krause', confirm: true }).expect(200);
    expect((await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({}).expect(409)).body.error).toBe('MIXED_VAT_RATES');
    // one rate at a time works
    expect((await admin.agent.post(`/api/admin/quotes/${q.id}/convert`).send({ lines: [{ index: 1, quantity: 1 }] }).expect(201)).body.partial).toBe(true);
  });
});

describe('expiry job', () => {
  it('expires open quotes after their validity day (creator told) and reminds the employer once before', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const old = await create(admin, c.id);
    const { token } = await sendIt(admin, old.id);
    const soon = await create(admin, c.id);
    await sendIt(admin, soon.id);
    const fresh = await create(admin, c.id);
    await sendIt(admin, fresh.id);
    const longAgo = new Date(Date.now() - 10 * DAY);
    await prisma.quote.update({ where: { id: old.id }, data: { validUntil: new Date(`${isoIn(-2)}T12:00:00Z`), sentAt: longAgo } });
    await prisma.quote.update({ where: { id: soon.id }, data: { validUntil: new Date(`${isoIn(2)}T12:00:00Z`), sentAt: longAgo } });
    // sent just now: no reminder even though it is close to expiry
    await prisma.quote.update({ where: { id: fresh.id }, data: { validUntil: new Date(`${isoIn(2)}T12:00:00Z`) } });
    await settle();
    const before = (await prisma.emailLog.findMany({ where: { to: 'einkauf@krause.test' } })).length;

    expect(await runQuoteExpiry()).toEqual({ expired: 1, reminders: 1 });
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('EXPIRED');
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'QUOTE_EXPIRED' } })).toBe(1);
    expect(await prisma.quoteEvent.count({ where: { quoteId: soon.id, type: 'REMINDED' } })).toBe(1);
    const mails = await emailsTo('einkauf@krause.test', before + 1);
    expect(mails.some((m) => m.subject.includes('Erinnerung'))).toBe(true);
    expect(await runQuoteExpiry()).toEqual({ expired: 0, reminders: 0 });

    // the link still opens, but it cannot be accepted any more
    const view = (await anon().get(`/api/angebot/${token}`).expect(200)).body.quote;
    expect(view).toMatchObject({ status: 'EXPIRED', canRespond: false });
    expect((await anon().post(`/api/angebot/${token}/accept`).send({ name: 'Max Krause', confirm: true }).expect(409)).body.error).toBe('QUOTE_EXPIRED');
    expect((await admin.agent.get('/api/admin/quotes').expect(200)).body.totals.expiredCount).toBe(1);
  });

  it('expires lazily when the link is used before the job ran', async () => {
    const admin = await asAdmin();
    const c = await makeCompany();
    const q = await create(admin, c.id);
    const { token } = await sendIt(admin, q.id);
    await prisma.quote.update({ where: { id: q.id }, data: { validUntil: new Date(`${isoIn(-1)}T12:00:00Z`) } });
    expect((await anon().post(`/api/angebot/${token}/accept`).send({ name: 'Max Krause', confirm: true }).expect(409)).body.error).toBe('QUOTE_EXPIRED');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q.id } })).status).toBe('EXPIRED');
  });
});
