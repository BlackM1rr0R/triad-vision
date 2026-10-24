import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asAdmin, asClient, asStaff, ORIGIN } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { l10n, l10nList } from '../helpers/factories';
import { signAsSigner } from '../../src/lib/esign/service.js';
import { runPackageOrderJobs } from '../../src/lib/billing/packages.js';
import { getSeoData, renderSitemap, resolvePage } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';
import { clearCache } from '../../src/lib/cache.js';

const mails = vi.hoisted(() => [] as { to: string; subject: string; html: string }[]);
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...mod,
    sendMail: async (to: string, subject: string, html: string, attachments?: { filename: string; content: Buffer | string }[]) => {
      mails.push({ to, subject, html });
      return mod.sendMail(to, subject, html, attachments);
    },
  };
});

beforeEach(() => {
  mails.length = 0;
});

const pkgBody = (over: Record<string, unknown> = {}) => ({
  slug: 'standard-work',
  tier: 'STANDARD',
  visaTypes: ['WORK', 'AUSBILDUNG'],
  title: { az: 'Standart', de: 'Standard', en: 'Standard', ru: 'Стандарт' },
  summary: l10n('Full support'),
  features: { ...l10nList('Document check'), de: ['Dokumentenprüfung', 'Terminbuchung Botschaft'] },
  priceCents: 250000,
  installments: [
    { label: { az: 'İlkin', de: 'Anzahlung', en: 'Deposit', ru: 'Предоплата' }, percent: 40, trigger: 'ON_SIGN' },
    { label: l10n('Embassy'), percent: 30, trigger: 'CASE_STATUS:EMBASSY_DOCUMENTS' },
    { label: l10n('Approval'), percent: 30, trigger: 'CASE_STATUS:APPROVED' },
  ],
  highlight: true,
  published: true,
  sortOrder: 2,
  ...over,
});

const token = () => crypto.randomBytes(32).toString('base64url');

const orderBody = (packageId: string, over: Record<string, unknown> = {}) => ({
  packageId,
  name: 'Rauf Həsənov',
  email: 'rauf.order@test.local',
  phone: '+994 50 123 45 67',
  visaType: 'WORK',
  profession: 'Elektrik',
  locale: 'de',
  acceptTerms: true,
  acceptPrivacy: true,
  token: token(),
  ...over,
});

const post = (url: string) => anon().post(url).set('Origin', ORIGIN);

describe('admin packages', () => {
  it('ADMIN+ only; CRUD with L10n texts, instalment template validation and a SERVICE contract template', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    await staff.agent.get('/api/admin/packages').expect(403);
    const tpl = await prisma.contractTemplate.create({ data: { name: 'Dienstleistungsvertrag', kind: 'SERVICE', language: 'de', body: '# Vertrag\n\n{{client.fullName}} – {{case.visaType}}' } });
    const work = await prisma.contractTemplate.create({ data: { name: 'Arbeitsvertrag', kind: 'WORK', language: 'de', body: '# Arbeitsvertrag body' } });
    await admin.agent.post('/api/admin/packages').send(pkgBody({ contractTemplateId: work.id })).expect(400);
    await admin.agent.post('/api/admin/packages').send(pkgBody({ installments: [{ label: l10n('x'), percent: 50, trigger: 'ON_SIGN' }] })).expect(400);
    const created = (await admin.agent.post('/api/admin/packages').send(pkgBody({ contractTemplateId: tpl.id })).expect(201)).body.package;
    expect(created).toMatchObject({ slug: 'standard-work', tier: 'STANDARD', visaTypes: ['WORK', 'AUSBILDUNG'], priceCents: 250000 });
    await admin.agent.post('/api/admin/packages').send(pkgBody()).expect(409); // slug taken
    const updated = (await admin.agent.put(`/api/admin/packages/${created.id}`).send(pkgBody({ visaTypes: null, priceCents: 260000, contractTemplateId: tpl.id })).expect(200)).body.package;
    expect(updated).toMatchObject({ visaTypes: null, priceCents: 260000 });
    const list = (await admin.agent.get('/api/admin/packages').expect(200)).body;
    expect(list.packages).toHaveLength(1);
    expect(list.templates.map((t: { id: string }) => t.id)).toEqual([tpl.id]);
    await admin.agent.delete(`/api/admin/packages/${created.id}`).expect(200);
  });
});

describe('public packages, order, signature → account, case, plan, invoice', () => {
  it('lists published packages only; SEO head, body and sitemap include /packages', async () => {
    const admin = await asAdmin();
    await admin.agent.post('/api/admin/packages').send(pkgBody()).expect(201);
    await admin.agent.post('/api/admin/packages').send(pkgBody({ slug: 'premium-hidden', tier: 'PREMIUM', published: false })).expect(201);
    const res = (await anon().get('/api/packages').expect(200)).body;
    expect(res.packages.map((p: { slug: string }) => p.slug)).toEqual(['standard-work']);
    expect(res.terms.version).toBeTruthy();

    clearCache();
    const data = await getSeoData();
    const page = resolvePage('/packages', 'de', data);
    expect(page.index).toBe(true);
    const ld = page.jsonLd.find((b) => (b as { '@type': string })['@type'] === 'Service') as { hasOfferCatalog: { itemListElement: { price: string; priceCurrency: string }[] } };
    expect(ld.hasOfferCatalog.itemListElement).toEqual([expect.objectContaining({ price: '2500.00', priceCurrency: 'EUR' })]);
    const body = renderBody('/de/packages', data);
    expect(body).toContain('Dokumentenprüfung');
    expect(body).toContain('2.500,00');
    expect(renderSitemap(data)).toContain('/de/packages');
  });

  it('order: validation, consent + lead, contract sent for signature, idempotent per token; signing activates everything', async () => {
    const admin = await asAdmin();
    const pkg = (await admin.agent.post('/api/admin/packages').send(pkgBody()).expect(201)).body.package;

    // Validation: AGB / privacy consent, full name, a visa type of the package.
    await post('/api/packages/orders').send(orderBody(pkg.id, { acceptTerms: false })).expect(400);
    await post('/api/packages/orders').send(orderBody(pkg.id, { name: 'Rauf' })).expect(400);
    await post('/api/packages/orders').send(orderBody(pkg.id, { visaType: 'STUDY' })).expect(400);
    const staffEmail = (await asStaff()).user.email;
    await post('/api/packages/orders').send(orderBody(pkg.id, { email: staffEmail })).expect(409);

    const body = orderBody(pkg.id);
    const res = (await post('/api/packages/orders').send(body).expect(201)).body.order;
    expect(res).toMatchObject({ status: 'STARTED', firstName: 'Rauf', priceCents: 250000, visaType: 'WORK', email: 'r***@test.local' });
    expect(res.signature.status).toBe('SENT');
    // Double submit with the same token: same order.
    const again = (await post('/api/packages/orders').send(body).expect(201)).body.order;
    expect(again.createdAt).toBe(res.createdAt);
    expect(await prisma.packageOrder.count()).toBe(1);

    const order = await prisma.packageOrder.findFirstOrThrow();
    expect(order).toMatchObject({ status: 'STARTED', email: 'rauf.order@test.local', phone: '+994501234567', locale: 'de', clientId: null });
    const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: order.inquiryId! } });
    expect(inquiry).toMatchObject({ source: 'package:standard-work', sector: 'Elektrik', locale: 'de' });
    expect(inquiry.scoredAt).toBeTruthy();
    const consents = await prisma.consentRecord.findMany({ where: { email: 'rauf.order@test.local' } });
    expect(consents.map((c) => c.type).sort()).toEqual(['PRIVACY_POLICY', 'TERMS']);
    expect(consents.every((c) => c.source === 'PACKAGE_ORDER')).toBe(true);
    const request = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: order.signatureRequestId! }, include: { signers: true } });
    expect(request.signers).toHaveLength(1);
    expect(request.signers[0]).toMatchObject({ role: 'CANDIDATE', email: 'rauf.order@test.local', locale: 'de' });
    await waitFor(async () => mails.find((m) => m.to === 'rauf.order@test.local' && /\/sign\/[A-Za-z0-9_-]{43}/.test(m.html)));
    const confirm = await waitFor(async () => mails.find((m) => m.to === 'rauf.order@test.local' && m.subject.includes('Bestellung erhalten')));
    expect(confirm.html).toContain(`/de/packages/order/${body.token}`);

    // Public status page by token; resend link.
    expect((await anon().get(`/api/packages/orders/${body.token}`).expect(200)).body.order.status).toBe('STARTED');
    await anon().get(`/api/packages/orders/${token()}`).expect(404);
    await post(`/api/packages/orders/${body.token}/resend`).send({}).expect(200);

    // The client signs (simulated with the e-signature module): the order is activated.
    await signAsSigner(request.signers[0].id, { mode: 'TYPE', typedName: 'Rauf Həsənov' }, 'EMAIL_OTP', { ip: '127.0.0.1', userAgent: 'vitest' });
    const done = await prisma.packageOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(done.status).toBe('ACTIVE');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'rauf.order@test.local' } });
    expect(user).toMatchObject({ role: 'CLIENT', firstName: 'Rauf', lastName: 'Həsənov', locale: 'de', phone: '+994501234567' });
    expect(user.emailVerifiedAt).toBeTruthy();
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: done.caseId! } });
    expect(kase).toMatchObject({ clientId: user.id, visaType: 'WORK', profession: 'Elektrik' });
    const signedDoc = await prisma.document.findFirst({ where: { caseId: kase.id, stage: 'CONTRACT_SIGNED' } });
    expect(signedDoc).toBeTruthy();
    const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: done.planId! } });
    expect(plan).toMatchObject({ clientId: user.id, caseId: kase.id, totalCents: 250000, orderId: order.id, status: 'ACTIVE' });
    const items = await prisma.paymentInstallment.findMany({ where: { planId: plan.id }, orderBy: { seq: 'asc' } });
    expect(items.map((i) => [i.label, i.trigger, i.amountCents, i.status])).toEqual([
      ['Anzahlung', 'ON_SIGN', 100000, 'INVOICED'],
      ['Embassy de', 'CASE_STATUS:EMBASSY_DOCUMENTS', 75000, 'PENDING'],
      ['Approval de', 'CASE_STATUS:APPROVED', 75000, 'PENDING'],
    ]);
    const invoice = await prisma.clientInvoice.findFirstOrThrow({ where: { orderId: order.id } });
    expect(invoice).toMatchObject({ clientId: user.id, caseId: kase.id, grossCents: 100000, status: 'SENT', installmentId: items[0].id });
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: order.inquiryId! } })).status).toBe('DONE');
    await waitFor(async () => mails.find((m) => m.to === user.email && m.subject.includes('Kundenkonto')));
    await waitFor(async () => mails.find((m) => m.to === user.email && m.subject.includes(invoice.number)));

    const status = (await anon().get(`/api/packages/orders/${body.token}`).expect(200)).body.order;
    expect(status).toMatchObject({ status: 'ACTIVE', caseNumber: kase.number, firstInvoice: { number: invoice.number, grossCents: 100000 } });

    // Idempotent: the job finds nothing to do, nothing is created twice.
    expect(await runPackageOrderJobs()).toEqual({ activated: 0, cancelled: 0 });
    expect(await prisma.case.count({ where: { clientId: user.id } })).toBe(1);
    expect(await prisma.clientInvoice.count({ where: { orderId: order.id } })).toBe(1);

    // Admin order list.
    const list = (await admin.agent.get('/api/admin/packages/orders/list').expect(200)).body;
    expect(list.orders[0]).toMatchObject({ status: 'ACTIVE', caseNumber: kase.number, signatureStatus: 'COMPLETED' });
    expect(list.orders[0].tokenHash).toBeUndefined();
    expect(list.counts).toEqual({ ACTIVE: 1 });
  });

  it('an existing client is linked (no second account); the open case is reused; unsigned orders can be cancelled', async () => {
    const admin = await asAdmin();
    const pkg = (await admin.agent.post('/api/admin/packages').send(pkgBody({ visaTypes: null, installments: null })).expect(201)).body.package;
    const client = await asClient({ email: 'known@test.local', locale: 'az' });
    const body = orderBody(pkg.id, { email: 'known@test.local', locale: 'tr', visaType: null });
    await post('/api/packages/orders').send(body).expect(201);
    const order = await prisma.packageOrder.findFirstOrThrow();
    expect(order.clientId).toBe(client.user.id);
    const signer = await prisma.signatureSigner.findFirstOrThrow({ where: { requestId: order.signatureRequestId! } });
    expect(signer.userId).toBe(client.user.id);
    await signAsSigner(signer.id, { mode: 'TYPE', typedName: 'Rauf Həsənov' }, 'PORTAL', {});
    const done = await prisma.packageOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(done.status).toBe('ACTIVE');
    expect(await prisma.user.count({ where: { email: 'known@test.local' } })).toBe(1);
    // No template: one ON_SIGN instalment of the whole price.
    const inv = await prisma.clientInvoice.findFirstOrThrow({ where: { orderId: order.id } });
    expect(inv.grossCents).toBe(250000);
    const next = (await client.agent.get('/api/account/next-step').expect(200)).body;
    expect([next.primary, ...next.secondary].some((a: { kind: string } | null) => a?.kind === 'PAY_INVOICE')).toBe(true);

    // A second order: cancelled by staff before signing.
    const second = orderBody(pkg.id, { email: 'other.order@test.local' });
    await post('/api/packages/orders').send(second).expect(201);
    const o2 = await prisma.packageOrder.findFirstOrThrow({ where: { email: 'other.order@test.local' } });
    await admin.agent.post(`/api/admin/packages/orders/${o2.id}/cancel`).expect(200);
    expect((await prisma.signatureRequest.findUniqueOrThrow({ where: { id: o2.signatureRequestId! } })).status).toBe('CANCELLED');
    await post(`/api/packages/orders/${second.token}/resend`).send({}).expect(409);
  });
});
