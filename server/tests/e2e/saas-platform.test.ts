import crypto from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff, asSuperAdmin } from '../helpers/api';
import { l10n, l10nList } from '../helpers/factories';
import { prisma, settle } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { refreshLicense, setLicensePublicKeyForTests, signLicense } from '../../src/lib/license/index.js';

/**
 * SaaS "platform for agencies" (routes/platform.ts, routes/admin/saas.ts, lib/saas): the public demo request
 * (owner instance only, consent, honeypot, Inquiry + SaasLead, admin notice, confirmation e-mail), the
 * SUPER_ADMIN pipeline (stage moves create / update the white-label customer record) and the onboarding wizard
 * (SUPER_ADMIN only, persisted, resumable, required steps, go-live gate, offer / invite / test e-mail).
 */

const ENV_KEYS = ['LICENSE_KEY', 'INSTANCE_ROLE'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const restoreEnv = () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  setLicensePublicKeyForTests(null);
  refreshLicense();
};
afterEach(() => restoreEnv());
afterAll(() => restoreEnv());

/** A valid customer licence (the wizard is pushed on customer instances; staff writes need a valid licence). */
const customerInstance = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  setLicensePublicKeyForTests(publicKey);
  process.env.INSTANCE_ROLE = 'customer';
  process.env.LICENSE_KEY = signLicense(
    {
      v: 1,
      id: 'lic-saas-e2e',
      customer: 'Acme Visa GmbH',
      domain: 'localhost',
      plan: 'pro',
      modules: '*',
      staffLimit: null,
      issuedAt: new Date(Date.now() - 86_400_000).toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
    privateKey,
  );
  return refreshLicense();
};

const demo = (over: Record<string, unknown> = {}) => ({
  agencyName: 'Acme Visa GmbH',
  contactName: 'Anna Muster',
  email: 'anna@acme-visa.example',
  phone: '+49 30 1234567',
  country: 'Georgia',
  teamSize: '6-20',
  interests: ['crm', 'whiteLabel'],
  message: 'We place nurses from Tbilisi.',
  consent: true,
  locale: 'de',
  ...over,
});

const visa = (slug: string, published = true) =>
  prisma.visaCategory.create({ data: { slug, icon: 'Plane', image: '', visaLabel: '§18a', title: l10n(slug), summary: l10n(slug), items: l10nList(slug), body: l10n(slug), published } });

describe('public demo request', () => {
  it('status endpoint says the owner instance sells the platform and lists the modules', async () => {
    const r = expectStatus(await anon().get('/api/platform/status'), 200).body;
    expect(r.available).toBe(true);
    expect(r.modules).toContain('bookings');
    expect(r.interests).toContain('whiteLabel');
  });

  it('stores an Inquiry tagged SAAS + a pipeline lead, notifies admins only and confirms by e-mail', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const res = expectStatus(await anon().post('/api/platform/demo-request').send(demo()), 201);
    const lead = await prisma.saasLead.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(lead).toMatchObject({ stage: 'demo_requested', agencyName: 'Acme Visa GmbH', country: 'Georgia', teamSize: '6-20' });
    expect(lead.interests).toEqual(['crm', 'whiteLabel']);
    const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: lead.inquiryId! } });
    expect(inquiry).toMatchObject({ kind: 'company', source: 'saas:demo', sector: 'SAAS', companyName: 'Acme Visa GmbH', email: 'anna@acme-visa.example', locale: 'de' });
    expect(inquiry.message).toContain('We place nurses');
    expect(await prisma.notification.count({ where: { userId: admin.user.id, title: { contains: 'SaaS' } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, title: { contains: 'SaaS' } } })).toBe(0);
    await settle();
    expect(await prisma.emailLog.count({ where: { to: 'anna@acme-visa.example' } })).toBe(1);
  });

  it('refuses without consent or with invalid input; the honeypot stores nothing', async () => {
    expect((await anon().post('/api/platform/demo-request').send(demo({ consent: false }))).status).toBe(400);
    expect((await anon().post('/api/platform/demo-request').send(demo({ consent: undefined }))).status).toBe(400);
    expect((await anon().post('/api/platform/demo-request').send(demo({ email: 'x' }))).status).toBe(400);
    expectStatus(await anon().post('/api/platform/demo-request').send(demo({ website: 'http://spam.example' })), 201);
    expect(await prisma.saasLead.count()).toBe(0);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it('does not exist on a customer instance', async () => {
    customerInstance();
    expect(expectStatus(await anon().get('/api/platform/status'), 200).body.available).toBe(false);
    expect((await anon().post('/api/platform/demo-request').send(demo())).status).toBe(404);
    const sa = await asSuperAdmin();
    expect((await sa.agent.get('/api/admin/saas-leads')).status).toBe(404);
  });
});

describe('SaaS pipeline (System → Customers)', () => {
  it('is SUPER_ADMIN only; stage moves are validated; trial / customer maintain the customer record', async () => {
    const res = expectStatus(await anon().post('/api/platform/demo-request').send(demo({ locale: 'en' })), 201);
    const id = res.body.id as string;
    expect((await anon().get('/api/admin/saas-leads')).status).toBe(401);
    expect((await (await asAdmin()).agent.get('/api/admin/saas-leads')).status).toBe(403);

    const sa = await asSuperAdmin();
    const list = expectStatus(await sa.agent.get('/api/admin/saas-leads'), 200).body;
    expect(list.counts.demo_requested).toBe(1);
    expect(list.items[0].contact).toMatchObject({ name: 'Anna Muster', email: 'anna@acme-visa.example' });

    expect(expectStatus(await sa.agent.patch(`/api/admin/saas-leads/${id}`).send({ stage: 'trial' }), 409).body.error).toBe('STAGE_TRANSITION');
    expect((await sa.agent.patch(`/api/admin/saas-leads/${id}`).send({ customerId: 'x' })).status).toBe(400);
    expect((await sa.agent.patch('/api/admin/saas-leads/nope').send({ stage: 'demo_done' })).status).toBe(404);

    expectStatus(await sa.agent.patch(`/api/admin/saas-leads/${id}`).send({ stage: 'demo_done', demoAt: '2026-11-20T10:00:00.000Z', staffNotes: 'Good fit' }), 200);
    const trial = expectStatus(await sa.agent.patch(`/api/admin/saas-leads/${id}`).send({ stage: 'trial' }), 200).body.lead;
    expect(trial.customerId).toBeTruthy();
    let customers = expectStatus(await sa.agent.get('/api/admin/whitelabel/customers'), 200).body.items;
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ id: trial.customerId, name: 'Acme Visa GmbH', status: 'trial', contactEmail: 'anna@acme-visa.example' });

    expectStatus(await sa.agent.patch(`/api/admin/saas-leads/${id}`).send({ stage: 'customer' }), 200);
    customers = expectStatus(await sa.agent.get('/api/admin/whitelabel/customers'), 200).body.items;
    expect(customers).toHaveLength(1);
    expect(customers[0].status).toBe('active');
    expect(await prisma.auditLog.count({ where: { action: 'SAAS_LEAD_UPDATED' } })).toBe(3);
  });
});

describe('onboarding wizard', () => {
  it('is SUPER_ADMIN only', async () => {
    expect((await anon().get('/api/admin/onboarding')).status).toBe(401);
    expect((await (await asStaff()).agent.get('/api/admin/onboarding')).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/onboarding')).status).toBe(403);
    expect((await admin.agent.put('/api/admin/onboarding/steps/brand').send({ status: 'done' })).status).toBe(403);
    expect((await admin.agent.post('/api/admin/onboarding/complete')).status).toBe(403);
  });

  it('is pushed only on customer instances; progress is persisted and resumable; go-live needs every step', async () => {
    const sa = await asSuperAdmin();
    const owner = expectStatus(await sa.agent.get('/api/admin/onboarding'), 200).body;
    expect(owner.applicable).toBe(false);

    customerInstance();
    let v = expectStatus(await sa.agent.get('/api/admin/onboarding'), 200).body;
    expect(v.applicable).toBe(true);
    expect(v.state.completedAt).toBeNull();
    expect(v.progress).toMatchObject({ finished: 0, next: 'brand' });
    expect(v.checks.email).toHaveProperty('smtpConfigured');

    expect(expectStatus(await sa.agent.get('/api/admin/onboarding/status'), 200).body).toEqual({ applicable: true, completed: false, percent: 0, next: 'brand' });
    v = expectStatus(await sa.agent.put('/api/admin/onboarding/steps/brand').send({ status: 'done' }), 200).body;
    expect(v.state.steps.brand.status).toBe('done');
    expect(v.state.currentStep).toBe('languages');
    expect((await sa.agent.put('/api/admin/onboarding/steps/email').send({ status: 'skipped' })).body.error).toBe('STEP_NOT_SKIPPABLE');
    expect((await sa.agent.put('/api/admin/onboarding/steps/golive').send({ status: 'done' })).status).toBe(400);
    expect((await sa.agent.put('/api/admin/onboarding/steps/nope').send({ status: 'done' })).status).toBe(400);
    expect(expectStatus(await sa.agent.post('/api/admin/onboarding/complete'), 409).body.error).toBe('STEPS_OPEN');

    // Resumable: another SUPER_ADMIN (new session) sees the same progress.
    const sa2 = await asSuperAdmin();
    v = expectStatus(await sa2.agent.put('/api/admin/onboarding/current').send({ step: 'modules' }), 200).body;
    expect(v.state.currentStep).toBe('modules');
    expect(v.state.steps.brand.status).toBe('done');

    for (const k of ['languages', 'email']) expectStatus(await sa.agent.put(`/api/admin/onboarding/steps/${k}`).send({ status: 'done' }), 200);
    for (const k of ['offer', 'modules', 'staff', 'documents', 'employer']) expectStatus(await sa.agent.put(`/api/admin/onboarding/steps/${k}`).send({ status: 'skipped' }), 200);
    v = expectStatus(await sa.agent.post('/api/admin/onboarding/complete'), 200).body;
    expect(v.state.completedAt).toBeTruthy();
    expect(v.progress.percent).toBe(100);
    expect((await sa.agent.put('/api/admin/onboarding/steps/brand').send({ status: 'open' })).body.error).toBe('ALREADY_COMPLETED');

    v = expectStatus(await sa.agent.post('/api/admin/onboarding/reopen'), 200).body;
    expect(v.state.completedAt).toBeNull();
    expect(v.state.steps.brand.status).toBe('done');
    expect(await prisma.auditLog.count({ where: { action: 'ONBOARDING_COMPLETED' } })).toBe(1);
  });

  it('offer step publishes exactly the chosen visa types and stores the countries', async () => {
    customerInstance();
    const [a, b] = [await visa('blue-card'), await visa('nurse', false)];
    const sa = await asSuperAdmin();
    expect((await sa.agent.put('/api/admin/onboarding/offer').send({ countries: ['ge'], visaCategoryIds: ['missing'] })).status).toBe(400);
    expect((await sa.agent.put('/api/admin/onboarding/offer').send({ countries: ['ge'], visaCategoryIds: [] })).status).toBe(400);
    const v = expectStatus(await sa.agent.put('/api/admin/onboarding/offer').send({ countries: ['ge', 'AM', 'ge'], visaCategoryIds: [b.id] }), 200).body;
    expect(v.state.steps.offer).toMatchObject({ status: 'done', data: { countries: ['GE', 'AM'], visaCount: 1 } });
    expect((await prisma.visaCategory.findUniqueOrThrow({ where: { id: a.id } })).published).toBe(false);
    expect((await prisma.visaCategory.findUniqueOrThrow({ where: { id: b.id } })).published).toBe(true);
  });

  it('invites staff with a set-password link (no password chosen by the admin) and sends a test e-mail', async () => {
    customerInstance();
    const sa = await asSuperAdmin();
    const r = expectStatus(await sa.agent.post('/api/admin/onboarding/invite').send({ email: 'Colleague@Acme.example', firstName: 'Cem', lastName: 'Demir', role: 'STAFF', locale: 'de' }), 201).body;
    expect(r.user).toMatchObject({ email: 'colleague@acme.example', role: 'STAFF' });
    expect(await prisma.passwordResetToken.count({ where: { userId: r.user.id, usedAt: null } })).toBe(1);
    expect(r.checks.staff.pendingInvites).toBe(1);
    expect((await sa.agent.post('/api/admin/onboarding/invite').send({ email: 'colleague@acme.example', firstName: 'C', lastName: 'D', role: 'STAFF' })).status).toBe(409);
    expect((await sa.agent.post('/api/admin/onboarding/invite').send({ email: 'boss@acme.example', firstName: 'C', lastName: 'D', role: 'SUPER_ADMIN' })).status).toBe(400);
    await settle();
    expect(await prisma.emailLog.count({ where: { to: 'colleague@acme.example' } })).toBe(1);

    const t = expectStatus(await sa.agent.post('/api/admin/onboarding/test-email'), 200).body;
    expect(t.to).toBe(sa.user.email);
    expect(['SENT', 'CONSOLE']).toContain(t.result.status);
  });
});
