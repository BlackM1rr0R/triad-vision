import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { ensureReferralCode } from '../../src/lib/growth/referral.js';

// The visible, optional "Referral code" field on the sign-up form: live check + the same attribution as ?ref=.

const REQUIRED = { phone: '+994501234567', birthDate: '1990-05-14', passportNumber: 'C01234567', password: 'Password123', firstName: 'Əli', lastName: 'Məmmədov' };

const agentWithCode = async (status: 'ACTIVE' | 'PAUSED' = 'ACTIVE') => {
  const u = await createUser({ role: 'AGENT' });
  return prisma.agent.create({ data: { userId: u.user.id, code: uniq('RG').toUpperCase().slice(0, 30), status } });
};

describe('GET /api/auth/referral-code', () => {
  it('recognises active agent codes and client codes (case-insensitive), nothing else', async () => {
    const agent = await agentWithCode();
    const paused = await agentWithCode('PAUSED');
    const friend = await createUser({ role: 'CLIENT' });
    const own = await ensureReferralCode(friend.user.id);

    const a = await anon().get('/api/auth/referral-code').query({ code: ` ${agent.code.toLowerCase()} ` }).expect(200);
    expect(a.body).toEqual({ code: agent.code, valid: true, kind: 'AGENT' });
    const c = await anon().get('/api/auth/referral-code').query({ code: own.code }).expect(200);
    expect(c.body).toEqual({ code: own.code, valid: true, kind: 'CLIENT' });
    const p = await anon().get('/api/auth/referral-code').query({ code: paused.code }).expect(200);
    expect(p.body.valid).toBe(false);
    const x = await anon().get('/api/auth/referral-code').query({ code: 'NO-SUCH-CODE' }).expect(200);
    expect(x.body).toEqual({ code: 'NO-SUCH-CODE', valid: false, kind: null });
    const empty = await anon().get('/api/auth/referral-code').expect(200);
    expect(empty.body.valid).toBe(false);
    // Says nothing about the owner.
    expect(Object.keys(a.body).sort()).toEqual(['code', 'kind', 'valid']);
  });
});

describe('POST /api/auth/register with a typed referral code', () => {
  it('attributes an agent code typed into the field exactly like the ?ref= link', async () => {
    const agent = await agentWithCode();
    const email = `${uniq('reg')}@test.local`;
    await anon().post('/api/auth/register').send({ ...REQUIRED, email, ref: agent.code.toLowerCase(), refEntered: true }).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.referredByAgentId).toBe(agent.id);
    expect(user.referredAt).toBeInstanceOf(Date);
  });

  it('attributes a client "bring a friend" code and creates the pending reward', async () => {
    const friend = await createUser({ role: 'CLIENT', phone: '+994551112233' });
    const { code } = await ensureReferralCode(friend.user.id);
    const email = `${uniq('reg')}@test.local`;
    await anon().post('/api/auth/register').send({ ...REQUIRED, passportNumber: 'C07654321', email, ref: code, refEntered: true }).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const referral = await prisma.clientReferral.findUniqueOrThrow({ where: { referredId: user.id }, include: { reward: true } });
    expect(referral).toMatchObject({ referrerId: friend.user.id, code, stage: 'REGISTERED' });
    expect(referral.reward?.status).toBe('PENDING');
  });

  it('refuses an unknown typed code before creating the account; link codes stay lenient', async () => {
    const email = `${uniq('reg')}@test.local`;
    const res = await anon().post('/api/auth/register').send({ ...REQUIRED, email, ref: 'TYPO-CODE', refEntered: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REFERRAL_CODE_UNKNOWN');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    // Old app builds / hidden ?ref= links: unknown codes are still ignored.
    await anon().post('/api/auth/register').send({ ...REQUIRED, email, ref: 'TYPO-CODE' }).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.referredByAgentId).toBeNull();
  });
});
