import fs from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { anon, asAdmin, asClient, asStaff, sessionAgent, ORIGIN } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { act, createCaseVia, driveCaseTo, expectStatus } from '../helpers/workflow';
import { attachReferral } from '../../src/lib/agents/referral.js';
import { awardCommission } from '../../src/lib/agents/commissions.js';
import { runUnpaidCommissionReminders } from '../../src/jobs/agents.js';

const DAY = 24 * 60 * 60 * 1000;

// Other suites running at the same time may clear the shared temp upload dir; make sure it exists.
beforeEach(() => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });
});

/** An agent user with an Agent row and a web session. */
const asAgent = async (over: Partial<Prisma.AgentUncheckedCreateInput> = {}, opts: { locale?: 'az' | 'de' | 'en' | 'ru' } = {}) => {
  const u = await createUser({ role: 'AGENT', firstName: 'Rauf', lastName: 'Agentov', locale: opts.locale ?? 'en' });
  const agent = await prisma.agent.create({
    data: { userId: u.user.id, code: uniq('AG').toUpperCase().slice(0, 30), commissionType: 'FIXED', commissionValue: 10000, payoutEvents: ['CASE_CREATED', 'CONTRACT_SIGNED', 'VISA_APPROVED', 'INVOICE_PAID'], ...over },
  });
  return { ...u, row: agent, agent: sessionAgent(u.token) };
};

/** A client referred by `agentId` through the real attribution helper. */
const referredClient = async (code: string, opts: { firstName?: string; lastName?: string } = {}) => {
  const c = await asClient({ firstName: opts.firstName ?? 'Əli', lastName: opts.lastName ?? 'Məmmədov', phone: '+994501112233', locale: 'az' });
  await prisma.user.update({ where: { id: c.user.id }, data: { passportNumber: 'C01234567' } });
  return { ...c, attached: await attachReferral(c.user.id, code.toLowerCase()) };
};

const commissions = (agentId: string, event?: string) => prisma.agentCommission.findMany({ where: { agentId, ...(event ? { event } : {}) } });

describe('referral attribution', () => {
  it('attaches active agents only, once, and never to the agent themself', async () => {
    const a = await asAgent();
    const c = await referredClient(a.row.code);
    expect(c.attached).toBe(a.row.id);
    const b = await asAgent();
    expect(await attachReferral(c.user.id, b.row.code)).toBeNull(); // first code wins
    expect(await attachReferral(a.user.id, a.row.code)).toBeNull();
    const paused = await asAgent({ status: 'PAUSED' });
    const d = await referredClient(paused.row.code);
    expect(d.attached).toBeNull();
  });
});

describe('commission hooks', () => {
  it('pays exactly once per event through the real case flow (create → contract signed → approved)', async () => {
    const a = await asAgent();
    const admin = await asAdmin();
    const c = await referredClient(a.row.code);
    const created = await driveCaseTo('APPROVED', { client: c.agent, admin: admin.agent });

    const rows = await commissions(a.row.id);
    expect(rows.map((r) => r.event).sort()).toEqual(['CASE_CREATED', 'CONTRACT_SIGNED', 'VISA_APPROVED']);
    for (const r of rows) {
      expect(r).toMatchObject({ status: 'PENDING', amountCents: 10000, currency: 'EUR', caseId: created.id, clientId: c.user.id });
    }
    // In-app notification + email in the agent's language.
    const n = await prisma.notification.findMany({ where: { userId: a.user.id, type: 'AGENT_COMMISSION' } });
    expect(n).toHaveLength(3);
    expect(n[0].title).toContain('New commission');
    expect(n[0].body).toContain('Əli M.');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: a.user.email } }));

    // Calling the hook again (e.g. a retried request) does not create a second row.
    expect(await awardCommission({ clientId: c.user.id, caseId: created.id, event: 'VISA_APPROVED' })).toBeNull();
    expect(await commissions(a.row.id)).toHaveLength(3);
  });

  it('defaults to VISA_APPROVED only and skips paused agents or disabled events', async () => {
    const def = await asAgent({ payoutEvents: undefined });
    const admin = await asAdmin();
    const c1 = await referredClient(def.row.code);
    await driveCaseTo('APPROVED', { client: c1.agent, admin: admin.agent });
    expect((await commissions(def.row.id)).map((r) => r.event)).toEqual(['VISA_APPROVED']);

    const only = await asAgent({ payoutEvents: ['INVOICE_PAID'] });
    const c2 = await referredClient(only.row.code);
    await createCaseVia(c2.agent);
    expect(await commissions(only.row.id)).toHaveLength(0);

    const later = await asAgent();
    const c3 = await referredClient(later.row.code);
    await prisma.agent.update({ where: { id: later.row.id }, data: { status: 'PAUSED' } });
    await createCaseVia(c3.agent);
    expect(await commissions(later.row.id)).toHaveLength(0);

    // PERCENT agents earn nothing on case events.
    const pct = await asAgent({ commissionType: 'PERCENT', commissionValue: 1000 });
    const c4 = await referredClient(pct.row.code);
    await createCaseVia(c4.agent);
    expect(await commissions(pct.row.id)).toHaveLength(0);
  });

  it('does not touch commissions when a case is cancelled; unreferred clients earn nobody anything', async () => {
    const a = await asAgent();
    const admin = await asAdmin();
    const c = await referredClient(a.row.code);
    const created = await createCaseVia(c.agent);
    expectStatus(await act(admin.agent, created.id, { action: 'CANCEL', reason: 'Client withdrew' }), 200);
    expect((await commissions(a.row.id)).map((r) => r.status)).toEqual(['PENDING']);

    const plain = await asClient();
    await createCaseVia(plain.agent);
    expect(await prisma.agentCommission.count()).toBe(1);
  });

  it('INVOICE_PAID pays a percentage of the invoice total to the agent who referred the employer', async () => {
    const a = await asAgent({ commissionType: 'PERCENT', commissionValue: 1000 }); // 10 %
    const admin = await asAdmin();
    const company = await prisma.company.create({ data: { name: 'Nord GmbH', sector: 'logistics', city: 'Hamburg', phone: '+49 40 1', status: 'ACTIVE' } });
    const emp = await createUser({ role: 'COMPANY' });
    await prisma.user.update({ where: { id: emp.user.id }, data: { companyId: company.id } });
    expect(await attachReferral(emp.user.id, a.row.code)).toBe(a.row.id);

    const year = new Date().getFullYear();
    const inv = expectStatus(
      await admin.agent.post('/api/admin/invoices').send({ companyId: company.id, issueDate: `${year}-03-10`, vatRate: 0, items: [{ description: 'Vermittlung', quantity: 1, unitPriceCents: 123456 }] }),
      201,
    ).body.invoice;
    expectStatus(await admin.agent.post(`/api/admin/invoices/${inv.id}/send`), 200);
    expectStatus(await admin.agent.post(`/api/admin/invoices/${inv.id}/paid`).send({}), 200);
    const gross = (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).grossCents;
    const rows = await commissions(a.row.id, 'INVOICE_PAID');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceRef: inv.id, amountCents: Math.round(gross / 10), caseId: null });
    // Paying again is refused by the invoice route; the hook itself is idempotent too.
    expect((await admin.agent.post(`/api/admin/invoices/${inv.id}/paid`).send({})).status).toBe(409);
    expect(await commissions(a.row.id, 'INVOICE_PAID')).toHaveLength(1);
  });
});

describe('admin agents API', () => {
  it('creates an agent user with an invitation and a unique suggested code', async () => {
    const admin = await asAdmin();
    const sug = expectStatus(await admin.agent.get('/api/admin/agents/suggest-code').query({ firstName: 'Əli', region: 'Gəncə' }), 200).body.code;
    expect(sug).toBe('GENCE-ELI');
    const res = expectStatus(
      await admin.agent.post('/api/admin/agents').send({
        firstName: 'Əli',
        lastName: 'Həsənov',
        email: 'ali.agent@example.com',
        phone: '+994 50 000 00 00',
        locale: 'ru',
        region: 'Gəncə',
        commissionType: 'FIXED',
        commissionValue: 15000,
        payoutEvents: ['VISA_APPROVED', 'CONTRACT_SIGNED'],
        iban: 'DE89 3704 0044 0532 0130 00',
      }),
      201,
    );
    expect(res.body.agent).toMatchObject({ code: 'GENCE-ELI', status: 'ACTIVE', iban: 'DE89370400440532013000', shareLink: 'http://localhost:5173/register?ref=GENCE-ELI' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ali.agent@example.com' } });
    expect(user.role).toBe('AGENT');
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
    const mail = await waitFor(() => prisma.emailLog.findFirst({ where: { to: 'ali.agent@example.com' } }));
    expect(mail.subject).toContain('партнёрский');
    expect(await prisma.auditLog.count({ where: { action: 'AGENT_CREATED' } })).toBe(1);

    // Same name+region again → next free code; explicit duplicate code → 409; taken email → 409.
    expect(expectStatus(await admin.agent.get('/api/admin/agents/suggest-code').query({ firstName: 'Əli', lastName: 'Quliyev', region: 'Gəncə' }), 200).body.code).toBe('GENCE-ELI-Q');
    const dupCode = await admin.agent.post('/api/admin/agents').send({ firstName: 'X', lastName: 'Y', email: 'x@example.com', code: 'gence-eli' });
    expect(dupCode.status).toBe(409);
    expect(dupCode.body.error).toBe('CODE_TAKEN');
    expect((await admin.agent.post('/api/admin/agents').send({ firstName: 'X', lastName: 'Y', email: 'ali.agent@example.com' })).body.error).toBe('EMAIL_TAKEN');
    expect((await admin.agent.post('/api/admin/agents').send({ firstName: 'X', lastName: 'Y', email: 'z@example.com', iban: 'DE00 1234' })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/agents').send({ firstName: 'X', lastName: 'Y', email: 'z@example.com', commissionType: 'PERCENT', commissionValue: 20000 })).body.error).toBe('PERCENT_TOO_HIGH');
  });

  it('lists with stats, shows detail, patches terms and code, fixes attribution', async () => {
    const admin = await asAdmin();
    const a = await asAgent({ region: 'Bakı' });
    const other = await asAgent();
    const c = await referredClient(a.row.code);
    await createCaseVia(c.agent);

    const list = expectStatus(await admin.agent.get('/api/admin/agents').query({ search: a.row.code }), 200).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0].stats).toMatchObject({ referrals: 1, activeCases: 1, approvedVisas: 0, pendingCents: 10000 });
    expect((await admin.agent.get('/api/admin/agents').query({ status: 'PAUSED' })).body.items).toHaveLength(0);

    const detail = expectStatus(await admin.agent.get(`/api/admin/agents/${a.row.id}`), 200).body;
    expect(detail.referrals[0]).toMatchObject({ id: c.user.id, email: c.user.email, case: { status: 'DOCUMENTS_PENDING' } });
    expect(detail.commissions).toHaveLength(1);

    const patched = expectStatus(
      await admin.agent.patch(`/api/admin/agents/${a.row.id}`).send({ status: 'PAUSED', commissionType: 'PERCENT', commissionValue: 500, payoutEvents: ['INVOICE_PAID'], code: 'baku-new' }),
      200,
    ).body.agent;
    expect(patched).toMatchObject({ status: 'PAUSED', commissionType: 'PERCENT', commissionValue: 500, payoutEvents: ['INVOICE_PAID'], code: 'BAKU-NEW' });
    expect((await admin.agent.patch(`/api/admin/agents/${a.row.id}`).send({ code: other.row.code })).body.error).toBe('CODE_TAKEN');
    expect(await prisma.auditLog.count({ where: { action: 'AGENT_UPDATED' } })).toBe(1);

    expectStatus(await admin.agent.patch(`/api/admin/agents/referrals/${c.user.id}`).send({ agentId: other.row.id }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).referredByAgentId).toBe(other.row.id);
    expectStatus(await admin.agent.patch(`/api/admin/agents/referrals/${c.user.id}`).send({ agentId: null }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).referredByAgentId).toBeNull();
    expect((await admin.agent.patch(`/api/admin/agents/referrals/${other.user.id}`).send({ agentId: a.row.id })).body.error).toBe('NOT_A_CLIENT');
  });

  it('approves, cancels, marks paid, adds manual commissions and exports CSV', async () => {
    const admin = await asAdmin();
    const a = await asAgent();
    const c = await referredClient(a.row.code, { firstName: '=cmd', lastName: 'Evil' });
    const created = await createCaseVia(c.agent);
    const [row] = await commissions(a.row.id);

    expect((await admin.agent.post(`/api/admin/agents/commissions/${row.id}/cancel`).send({ note: 'duplicate' })).body.commission.status).toBe('CANCELLED');
    expect((await admin.agent.post(`/api/admin/agents/commissions/${row.id}/approve`)).status).toBe(409);

    const manual = expectStatus(await admin.agent.post('/api/admin/agents/commissions/manual').send({ agentId: a.row.id, caseId: created.id, amountCents: 2500, note: 'Bonus' }), 201).body.commission;
    expect(manual).toMatchObject({ event: 'MANUAL', status: 'APPROVED', clientId: c.user.id, amountCents: 2500 });
    const second = await prisma.agentCommission.create({ data: { agentId: a.row.id, event: 'MANUAL', sourceRef: 'x', amountCents: 700 } });
    expectStatus(await admin.agent.post(`/api/admin/agents/commissions/${second.id}/approve`), 200);

    const paid = expectStatus(await admin.agent.post('/api/admin/agents/commissions/mark-paid').send({ ids: [manual.id, second.id, row.id], payoutRef: 'SEPA-2026-10' }), 200).body;
    expect(paid).toEqual({ updated: 2, skipped: 1 });
    const n = await prisma.notification.findFirst({ where: { userId: a.user.id, type: 'AGENT_COMMISSION_PAID' } });
    expect(n?.body).toContain('SEPA-2026-10');

    const filtered = expectStatus(await admin.agent.get('/api/admin/agents/commissions').query({ agentId: a.row.id, status: 'PAID' }), 200).body;
    expect(filtered.total).toBe(2);
    expect(filtered.sums).toEqual([{ status: 'PAID', currency: 'EUR', amountCents: 3200, count: 2 }]);
    const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
    expect((await admin.agent.get('/api/admin/agents/commissions').query({ from: tomorrow })).body.total).toBe(0);

    const csv = await admin.agent.get('/api/admin/agents/commissions/export.csv').query({ status: 'PAID' });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toContain('agentCode');
    expect(lines).toHaveLength(3);
    expect(csv.text).toContain('"SEPA-2026-10"');
    expect(csv.text).toContain(`"'=cmd Evil"`); // formula neutralised
    expect(csv.text).toContain('"25.00"');
  });

  it('is ADMIN-only: staff, clients and agents are refused', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/agents')).status).toBe(403);
    expect((await staff.agent.post('/api/admin/agents').send({ firstName: 'A', lastName: 'B', email: 'a@b.c' })).status).toBe(403);
    expect((await staff.agent.get('/api/admin/agents/commissions/export.csv')).status).toBe(403);
    const a = await asAgent();
    expect((await a.agent.get('/api/admin/agents')).status).toBe(403);
    expect((await a.agent.get('/api/admin/cases')).status).toBe(403);
    expect((await anon().get('/api/admin/agents')).status).toBe(401);
  });
});

describe('agent portal', () => {
  it('shows own profile, dashboard, referrals (minimised) and commissions', async () => {
    const a = await asAgent({ iban: null });
    const admin = await asAdmin();
    const c = await referredClient(a.row.code, { firstName: 'Leyla', lastName: 'Quliyeva' });
    await driveCaseTo('CONTRACT_SIGNED', { client: c.agent, admin: admin.agent });
    await referredClient(a.row.code, { firstName: 'Nərmin', lastName: 'Əliyeva' });

    const me = expectStatus(await a.agent.get('/api/agent/me'), 200).body;
    expect(me.agent).toMatchObject({ code: a.row.code, commissionType: 'FIXED', commissionValue: 10000 });
    expect(me.shareLink).toBe(`http://localhost:5173/register?ref=${a.row.code}`);
    expect(me.agent.notes).toBeUndefined();

    const dash = expectStatus(await a.agent.get('/api/agent/dashboard'), 200).body;
    expect(dash.counts).toEqual({ referrals: 2, employers: 0, registeredThisMonth: 2, activeCases: 1, approvedVisas: 0 });
    expect(dash.earnings).toEqual({ pendingCents: 20000, approvedCents: 0, paidCents: 0 });
    expect(dash.series).toHaveLength(12);
    expect(dash.series[11]).toMatchObject({ referrals: 2, earningsCents: 20000 });

    const refs = expectStatus(await a.agent.get('/api/agent/referrals'), 200).body;
    expect(refs.total).toBe(2);
    const names = refs.items.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(['Leyla Q.', 'Nərmin Ə.']);
    const leyla = refs.items.find((r: { name: string }) => r.name === 'Leyla Q.');
    expect(leyla).toMatchObject({ stage: 'CONTRACT', earnedCents: 20000 });
    expect(Object.keys(leyla).sort()).toEqual(['earnedCents', 'key', 'name', 'registeredAt', 'stage']);
    const raw = JSON.stringify(refs);
    for (const secret of [c.user.email, c.user.id, 'Quliyeva', '+994501112233', 'C01234567']) expect(raw).not.toContain(secret);

    const com = expectStatus(await a.agent.get('/api/agent/commissions'), 200).body;
    expect(com.total).toBe(2);
    expect(JSON.stringify(com)).not.toContain(c.user.email);
    expect(com.items[0].client).toBe('Leyla Q.');
  });

  it('lets the agent change only phone and IBAN', async () => {
    const a = await asAgent();
    const res = expectStatus(await a.agent.patch('/api/agent/me').send({ phone: '+49 151 000000', iban: 'de89370400440532013000' }), 200).body;
    expect(res.agent.iban).toBe('DE89370400440532013000');
    expect(res.user.phone).toBe('+49 151 000000');
    expect((await a.agent.patch('/api/agent/me').send({ commissionValue: 99999 })).status).toBe(400);
    expect((await a.agent.patch('/api/agent/me').send({ iban: 'DE00 0000' })).status).toBe(400);
  });

  it('is only for AGENT users and only shows their own data; paused agents keep read access', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/agent/me')).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/agent/dashboard')).status).toBe(403);
    expect((await anon().get('/api/agent/me')).status).toBe(401);
    const orphan = await createUser({ role: 'AGENT' });
    expect((await sessionAgent(orphan.token).get('/api/agent/me')).body.error).toBe('NO_AGENT_PROFILE');

    const a = await asAgent();
    const b = await asAgent();
    await referredClient(b.row.code);
    await prisma.agentCommission.create({ data: { agentId: b.row.id, event: 'MANUAL', sourceRef: 'b', amountCents: 999 } });
    expect((await a.agent.get('/api/agent/referrals')).body.total).toBe(0);
    expect((await a.agent.get('/api/agent/commissions')).body.total).toBe(0);
    expect((await a.agent.get(`/api/admin/agents/${b.row.id}`)).status).toBe(403);

    await prisma.agent.update({ where: { id: b.row.id }, data: { status: 'PAUSED' } });
    const paused = expectStatus(await b.agent.get('/api/agent/dashboard'), 200).body;
    expect(paused.status).toBe('PAUSED');
    expect(paused.counts.referrals).toBe(1);
  });

  it('agents can log in with their password', async () => {
    const a = await asAgent();
    const res = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: a.user.email, password: a.password });
    expect(res.status).toBe(200);
  });
});

describe('unpaid commission reminder job', () => {
  it('notifies admins once a day about approved commissions unpaid for over 14 days', async () => {
    const admin = await asAdmin({ locale: 'de' });
    const a = await asAgent();
    const now = new Date();
    await prisma.agentCommission.create({ data: { agentId: a.row.id, event: 'MANUAL', sourceRef: 'old', amountCents: 5000, status: 'APPROVED', approvedAt: new Date(now.getTime() - 20 * DAY) } });
    await prisma.agentCommission.create({ data: { agentId: a.row.id, event: 'MANUAL', sourceRef: 'new', amountCents: 5000, status: 'APPROVED', approvedAt: new Date(now.getTime() - 2 * DAY) } });
    expect(await runUnpaidCommissionReminders(now)).toBe(1);
    expect(await runUnpaidCommissionReminders(now)).toBe(0);
    const n = await prisma.notification.findMany({ where: { userId: admin.user.id } });
    expect(n).toHaveLength(1);
    expect(n[0].title).toContain('Agentenprovision');
    expect(n[0].link).toBe('/admin/agents/commissions?status=APPROVED');
    // Next day → again.
    expect(await runUnpaidCommissionReminders(new Date(now.getTime() + DAY))).toBe(1);
  });
});
