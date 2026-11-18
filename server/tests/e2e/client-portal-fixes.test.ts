import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, asAdmin, asClient, asSuperAdmin, ORIGIN, sessionAgent, type Agent } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { staffNotifications } from '../helpers/notify';
import { clientCase, createCaseVia, expectStatus, reviewAll, uploadRequired } from '../helpers/workflow';
import { config } from '../../src/config.js';

/**
 * Client portal QA fixes (scratchpad qa-findings-client.md): verification resend right after sign-up (C-A4), the resend
 * link on the 2FA set-up gate (C-A2), the effective idle timeout in every user payload (C-A6), vacancy alerts / waitlist
 * in the DSGVO export and erase (C-T2), the consent withdrawal when a waitlist entry is removed (C-DOC-3), and vault
 * suggestions / staff notices for early embassy uploads (C-DOC-1, C-DOC-2).
 */

const register = async (email: string) => {
  const agent = request.agent(app);
  agent.set('Origin', ORIGIN);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: 'Password123', firstName: 'Aysel', lastName: 'Q', locale: 'az', phone: '+4915112345678', birthDate: '1995-03-01', passportNumber: `C${String(Date.now()).slice(-8)}`, acceptTerms: true });
  expect(res.status).toBe(201);
  return { agent, user: res.body.user as { id: string; email: string; sessionIdleMinutes?: number } };
};

const vaultUpload = async (agent: Agent, kind: string, title: string) =>
  expectStatus(await agent.post('/api/vault').field('kind', kind).field('title', title).attach('file', await makePdf(title), { filename: `${title}.pdf`, contentType: 'application/pdf' }), 201).body.document as { id: string };

describe('sign-up, verification and session flags', () => {
  it('the first "resend" right after sign-up works; a second one within a minute is throttled', async () => {
    const { agent } = await register('resend.now@test.local');
    expect((await agent.post('/api/auth/resend-verification')).status).toBe(200);
    expect(await prisma.emailVerificationToken.count({ where: { user: { email: 'resend.now@test.local' }, usedAt: null } })).toBe(1); // the new link replaced the first
    const again = await agent.post('/api/auth/resend-verification');
    expect(again.status).toBe(429);
    expect(again.body.error).toBe('TOO_MANY_REQUESTS');
  });

  it('every user payload carries the effective web idle timeout, so the browser logout matches the server', async () => {
    const { user } = await register('idle.flag@test.local');
    expect(user.sessionIdleMinutes).toBe(config.session.webIdleMinutes);
    const c = await asClient();
    expect(expectStatus(await c.agent.get('/api/auth/me'), 200).body.user.sessionIdleMinutes).toBe(config.session.webIdleMinutes);
  });

  it('a client held at the 2FA set-up with an unconfirmed e-mail can still get a new confirmation link', async () => {
    const su = await asSuperAdmin();
    expectStatus(await su.agent.put('/api/admin/access/login-security/roles/CLIENT').send({ require2fa: true }), 200);
    const u = await createUser({ emailVerified: false });
    const agent = sessionAgent(u.token);
    expect(expectStatus(await agent.get('/api/auth/me'), 200).body.user).toMatchObject({ twoFactorSetupNeeded: true, emailVerified: false });
    expect((await agent.get('/api/vault')).body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED'); // the portal API waits
    expectStatus(await agent.post('/api/auth/resend-verification'), 200); // offered on the set-up gate (VerifyBanner)
  });
});

describe('vacancy waitlist and DSGVO', () => {
  it('the export and the admin export / erase by e-mail include vacancy alerts, waitlist entries and their notices', async () => {
    const client = await asClient();
    expectStatus(await client.agent.post('/api/job-alerts/waitlist').send({ profession: 'truck_driver', city: 'Hamburg' }), 201);
    const entry = await prisma.jobAlert.findFirstOrThrow({ where: { userId: client.user.id, waitlist: true } });
    await prisma.jobAlertNotice.create({ data: { alertId: entry.id, vacancyId: 'vac_gone_1', recipient: client.user.id } });
    // A visitor's waitlist entry under the same address (no account) is part of the person's data too.
    await prisma.jobAlert.create({ data: { email: client.user.email.toLowerCase(), professions: ['cook'], tokenHash: 'f'.repeat(64), waitlist: true } });

    const own = JSON.parse(expectStatus(await client.agent.get('/api/privacy/export'), 200).text);
    expect(own.vacancyAlerts).toHaveLength(2);
    expect(own.vacancyAlerts[0]).toMatchObject({ kind: 'VACANCY_WAITLIST', professions: ['truck_driver'], city: 'Hamburg', notices: [{ vacancy: { id: 'vac_gone_1' } }] });
    expect(JSON.stringify(own.vacancyAlerts)).not.toContain('tokenHash');

    const sa = await asSuperAdmin();
    const exp = expectStatus(await sa.agent.get('/api/admin/privacy/inquiries').query({ email: client.user.email }), 200).body;
    expect(exp.vacancyAlerts).toHaveLength(2);
    const erased = expectStatus(await sa.agent.post('/api/admin/privacy/inquiries/erase').send({ email: client.user.email, userId: client.user.id }), 200).body;
    expect(erased.vacancyAlerts).toBe(2);
    expect(await prisma.jobAlert.count({ where: { OR: [{ userId: client.user.id }, { email: client.user.email.toLowerCase() }] } })).toBe(0);
    expect(await prisma.jobAlertNotice.count({ where: { recipient: client.user.id } })).toBe(0);
  });

  it('removing a waitlist entry in the portal logs the consent withdrawal', async () => {
    const client = await asClient();
    const joined = expectStatus(await client.agent.post('/api/job-alerts/waitlist').send({ profession: 'truck_driver' }), 201).body.entry;
    expectStatus(await client.agent.delete(`/api/job-alerts/waitlist/mine/${joined.id}`), 200);
    const log = await prisma.consentRecord.findMany({ where: { userId: client.user.id, type: 'VACANCY_WAITLIST' }, orderBy: { createdAt: 'asc' } });
    expect(log.map((r) => r.granted)).toEqual([true, false]);
  });
});

describe('vault and early embassy uploads', () => {
  it('suggestions list the early embassy requirements; using a vault file there notifies staff and completes the linked task', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    await uploadRequired(client.agent, c.id, 'INITIAL');
    expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);
    await reviewAll(admin.agent, c.id, 'INITIAL'); // waits for the contract: embassy documents may come early

    const embassy = (await clientCase(client.agent, c.id)).requirements.filter((r) => r.stage === 'EMBASSY');
    expect(embassy.length).toBeGreaterThan(0);
    const sugg = expectStatus(await client.agent.get(`/api/vault/suggestions?caseId=${c.id}`), 200).body;
    expect(sugg.stage).toBe('EMBASSY');
    const ids = sugg.suggestions.map((s: { requirementId: string }) => s.requirementId);
    for (const r of embassy) expect(ids).toContain(r.id);

    const target = embassy[0];
    const task = await prisma.clientTask.create({ data: { caseId: c.id, title: 'Upload it', requirementId: target.id } });
    const v = await vaultUpload(client.agent, 'OTHER', 'early-embassy');
    const used = expectStatus(await client.agent.post(`/api/vault/${v.id}/use`).send({ caseId: c.id, requirementId: target.id }), 201);
    expect(used.body.document).toMatchObject({ stage: 'EMBASSY', status: 'PENDING' });
    await settle();
    expect((await staffNotifications(admin.user.id)).some((n) => n.title === `${c.number}: səfirlik sənədi erkən yükləndi`)).toBe(true);
    await waitFor(() => prisma.clientTask.findFirst({ where: { id: task.id, status: { not: 'OPEN' } } }));
  });
});
