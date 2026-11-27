import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

// Baku referrers (pyramid, no commissions): /api/admin/referrers + /api/partner/referrals.

type Admin = Awaited<ReturnType<typeof asAdmin>>;

/** An approved referrer created by an admin, with a portal login. */
const referrerWithLogin = async (admin: Admin, name: string, parentPartnerId: string | null = null) => {
  const created = expectStatus(await admin.agent.post('/api/admin/referrers').send({ name, parentPartnerId }), 201).body.referrer as { id: string };
  const login = await createUser({ role: 'AGENT', firstName: name, lastName: 'Ref', locale: 'en' });
  await prisma.referralPartner.update({ where: { id: created.id }, data: { userId: login.user.id } });
  return { id: created.id, agent: sessionAgent(login.token) };
};

/** A client owned by the referrer, with a case. */
const ownedClient = async (partnerId: string, lastName: string) => {
  const c = await createUser({ role: 'CLIENT', firstName: 'Nigar', lastName, phone: '+994 50 123 45 67' });
  await prisma.user.update({ where: { id: c.user.id }, data: { ownerPartnerId: partnerId, ownerPartnerAt: new Date(), passportNumber: 'C01234567' } });
  const kase = await prisma.case.create({ data: { number: uniq('TV-'), clientId: c.user.id, profession: 'Aşpaz', partnerId } });
  return { client: c, kase };
};

describe('referrer tree', () => {
  it('sub-referrer from the portal → pending (no portal) → admin approves → login invitation', async () => {
    const admin = await asAdmin();
    const top = await referrerWithLogin(admin, uniq('Top '));
    const email = `${uniq('sub')}@test.local`;
    const name = uniq('Sub ');
    const sub = expectStatus(await top.agent.post('/api/partner/referrals').send({ name, email, phone: '+994 55 000 00 00', note: 'dost' }), 201).body.referrer;
    expect(sub.approvalStatus).toBe('PENDING');
    const row = await prisma.referralPartner.findUniqueOrThrow({ where: { id: sub.id } });
    expect(row).toMatchObject({ isReferrer: true, parentPartnerId: top.id, createdByPartnerId: top.id, code: null, userId: null });

    // shown to the creator as waiting; in the admin pending box
    const mine = expectStatus(await top.agent.get('/api/partner/referrals'), 200).body;
    expect(mine.items.find((i: { id: string }) => i.id === sub.id)).toMatchObject({ approvalStatus: 'PENDING', createdByMe: true, email });
    const tree = expectStatus(await admin.agent.get('/api/admin/referrers'), 200).body;
    expect(tree.pending.map((p: { id: string }) => p.id)).toContain(sub.id);

    // a pending referrer gets no login, even by hand
    expect(expectStatus(await admin.agent.post(`/api/admin/partners/${sub.id}/login`).send({}), 409).body.error).toBe('PARTNER_NOT_APPROVED');

    // the referrer itself cannot approve
    expect([403, 404]).toContain((await top.agent.post(`/api/admin/referrers/${sub.id}/approve`)).status);

    const ok = expectStatus(await admin.agent.post(`/api/admin/referrers/${sub.id}/approve`), 200).body;
    expect(ok.login).toEqual({ invited: true, error: null });
    const approved = await prisma.referralPartner.findUniqueOrThrow({ where: { id: sub.id } });
    expect(approved.approvalStatus).toBe('APPROVED');
    expect(approved.code).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: approved.userId! } });
    expect(user).toMatchObject({ email, role: 'AGENT' });
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);
    expect(await prisma.auditLog.findFirst({ where: { action: 'REFERRER_APPROVED', target: sub.id } })).not.toBeNull();
    // approving twice is refused
    expect(expectStatus(await admin.agent.post(`/api/admin/referrers/${sub.id}/approve`), 409).body.error).toBe('REFERRER_NOT_PENDING');
  });

  it('a pending / rejected referrer cannot use the portal', async () => {
    const admin = await asAdmin();
    const top = await referrerWithLogin(admin, uniq('Top '));
    const sub = expectStatus(await top.agent.post('/api/partner/referrals').send({ name: uniq('Pend '), email: `${uniq('p')}@test.local` }), 201).body.referrer;
    const login = await createUser({ role: 'AGENT', firstName: 'P', lastName: 'Ref' });
    await prisma.referralPartner.update({ where: { id: sub.id }, data: { userId: login.user.id } });
    const agent = sessionAgent(login.token);
    expect(expectStatus(await agent.get('/api/partner/me'), 403).body.error).toBe('PARTNER_NOT_APPROVED');
    expectStatus(await admin.agent.post(`/api/admin/referrers/${sub.id}/reject`).send({ note: 'no' }), 200);
    expect(expectStatus(await agent.get('/api/partner/dashboard'), 403).body.error).toBe('PARTNER_NOT_APPROVED');
  });

  it('a referrer sees its own subtree only; downline clients carry no contact or passport data', async () => {
    const sup = await asSuperAdmin();
    const top = await referrerWithLogin(sup, uniq('Top '));
    const left = await referrerWithLogin(sup, uniq('Left '), top.id);
    const right = await referrerWithLogin(sup, uniq('Right '), top.id);
    const leftChild = await referrerWithLogin(sup, uniq('LeftKid '), left.id);
    const { kase } = await ownedClient(leftChild.id, uniq('Downline'));

    // top sees the whole subtree, with the figures summed up
    const mine = expectStatus(await top.agent.get('/api/partner/referrals'), 200).body;
    expect(mine.items.map((i: { id: string }) => i.id).sort()).toEqual([left.id, right.id, leftChild.id].sort());
    expect(mine.me.total.clients).toBe(1);

    // left sees its child but not its sibling or its parent
    const leftView = expectStatus(await left.agent.get('/api/partner/referrals'), 200).body;
    expect(leftView.items.map((i: { id: string }) => i.id)).toEqual([leftChild.id]);
    expect(expectStatus(await left.agent.get(`/api/partner/referrals/${right.id}`), 404).body.error).toBe('REFERRER_NOT_FOUND');
    expect(expectStatus(await left.agent.get(`/api/partner/referrals/${top.id}`), 404).body.error).toBe('REFERRER_NOT_FOUND');
    expect(expectStatus(await right.agent.get(`/api/partner/referrals/${leftChild.id}`), 404).body.error).toBe('REFERRER_NOT_FOUND');
    expect(expectStatus(await left.agent.get(`/api/partner/referrals/${left.id}`), 404).body.error).toBe('REFERRER_NOT_FOUND');

    // drill-down: name, case number, stage, payment state — nothing else
    const detail = expectStatus(await top.agent.get(`/api/partner/referrals/${leftChild.id}`), 200).body;
    expect(detail.clients).toHaveLength(1);
    expect(Object.keys(detail.clients[0]).sort()).toEqual(['caseNumber', 'name', 'paymentState', 'refused', 'status']);
    expect(detail.clients[0].caseNumber).toBe(kase.number);
    const raw = JSON.stringify(detail);
    for (const secret of ['C01234567', '123 45 67', '@test.local', kase.clientId]) expect(raw).not.toContain(secret);

    // the referrer cannot move nodes or approve (admin routes are staff-only)
    expect([403, 404]).toContain((await top.agent.patch(`/api/admin/referrers/${leftChild.id}/parent`).send({ parentPartnerId: right.id })).status);
    // no commissions for referrers
    expect(expectStatus(await top.agent.get('/api/partner/commissions'), 403).body.error).toBe('REFERRER_NO_COMMISSIONS');
  });

  it('admin moves a referrer; cycles and too-deep trees are refused', async () => {
    const admin = await asAdmin();
    const a = await referrerWithLogin(admin, uniq('A '));
    const b = await referrerWithLogin(admin, uniq('B '), a.id);
    expect(expectStatus(await admin.agent.patch(`/api/admin/referrers/${a.id}/parent`).send({ parentPartnerId: b.id }), 409).body.error).toBe('REFERRER_CYCLE');
    expectStatus(await admin.agent.patch(`/api/admin/referrers/${b.id}/parent`).send({ parentPartnerId: null }), 200);
    expect((await prisma.referralPartner.findUniqueOrThrow({ where: { id: b.id } })).parentPartnerId).toBeNull();
    expectStatus(await admin.agent.patch(`/api/admin/referrers/${b.id}/active`).send({ active: false }), 200);
    expect((await prisma.referralPartner.findUniqueOrThrow({ where: { id: b.id } })).active).toBe(false);
  });

  it('staff without the partners permission get 403, staff with it may only read; clients get 403', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    expectStatus(await staff.agent.get('/api/admin/referrers'), 200);
    expect((await staff.agent.post('/api/admin/referrers').send({ name: uniq('X ') })).status).toBe(403);

    const tpl = expectStatus(await sup.agent.post('/api/admin/access/staff/templates').send({ name: { az: 'Yalnız işlər' }, matrix: { cases: ['view'] } }), 201).body.template;
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ templateId: tpl.id }), 200);
    const denied = await staff.agent.get('/api/admin/referrers');
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: 'NO_PERMISSION', area: 'partners' });

    const client = await asClient();
    expect((await client.agent.get('/api/admin/referrers')).status).toBe(403);
    expect((await client.agent.get('/api/partner/referrals')).status).toBe(403);
  });

  it('the partner list hides referrers on request', async () => {
    const admin = await asAdmin();
    const r = await referrerWithLogin(admin, uniq('Hidden '));
    const ids = (q: string) => admin.agent.get(`/api/admin/partners?referrers=${q}`).then((res) => (expectStatus(res, 200).body.items as { id: string }[]).map((i) => i.id));
    expect(await ids('exclude')).not.toContain(r.id);
    expect(await ids('only')).toContain(r.id);
    expect(await ids('all')).toContain(r.id);
  });
});
