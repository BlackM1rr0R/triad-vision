import { describe, expect, it } from 'vitest';
import { anon, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { issueSession } from '../../src/middleware/auth.js';

// Candidate sign-up: phone (with country code) and date of birth are required and validated.
// /register shares the auth limiter (30 requests / 15 min per IP); this file stays well below it.

/** YYYY-MM-DD for "today minus `yearsAgo` years, shifted by `dayShift` days" (UTC). */
const isoDate = (yearsAgo: number, dayShift = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - yearsAgo);
  d.setUTCDate(d.getUTCDate() + dayShift);
  return d.toISOString().slice(0, 10);
};

let n = 0;
const body = (over: Record<string, unknown> = {}) => ({
  email: `reg${n++}@test.local`,
  password: 'Password123',
  firstName: 'Aysel',
  lastName: 'Quliyeva',
  phone: '+994501234567',
  birthDate: '1995-03-01',
  passportNumber: 'AA1234567',
  ...over,
});

const issueMessages = (res: { body: { issues?: { path: (string | number)[]; message: string }[] } }) =>
  (res.body.issues ?? []).map((i) => `${i.path.join('.')}:${i.message}`);

describe('POST /api/auth/register — phone, date of birth and passport number', () => {
  it('stores the birth date and the normalised phone number', async () => {
    const res = await anon().post('/api/auth/register').send(body({ email: 'store@test.local', phone: ' +49 151-1234 5678 ', birthDate: '1988-12-31' }));
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ phone: '+4915112345678', birthDate: '1988-12-31' });
    const db = await prisma.user.findUniqueOrThrow({ where: { email: 'store@test.local' } });
    expect(db.phone).toBe('+4915112345678');
    expect(db.birthDate!.toISOString().slice(0, 10)).toBe('1988-12-31');
  });

  it('stores the passport number upper-cased without spaces or dashes', async () => {
    const res = await anon().post('/api/auth/register').send(body({ email: 'passport@test.local', passportNumber: ' aa 123-4567 ' }));
    expect(res.status).toBe(201);
    expect(res.body.user.passportNumber).toBe('AA1234567');
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'passport@test.local' } })).passportNumber).toBe('AA1234567');
  });

  it.each([
    ['without a phone number', { phone: undefined }, 'phone'],
    ['without the country code', { phone: '0501234567' }, 'phone:INVALID_PHONE'],
    ['with too few digits', { phone: '+994 123' }, 'phone:INVALID_PHONE'],
    ['with too many digits', { phone: '+9945012345678901' }, 'phone:INVALID_PHONE'],
    ['with letters', { phone: '+994 50 abc 45 67' }, 'phone:INVALID_PHONE'],
    ['without a birth date', { birthDate: undefined }, 'birthDate'],
    ['with a birth date in the wrong format', { birthDate: '14.05.1990' }, 'birthDate:INVALID_DATE'],
    ['with an impossible birth date', { birthDate: '1990-02-30' }, 'birthDate:INVALID_DATE'],
    ['without a passport number', { passportNumber: undefined }, 'passportNumber'],
    ['with a too short passport number', { passportNumber: 'C12' }, 'passportNumber:INVALID_PASSPORT'],
    ['with symbols in the passport number', { passportNumber: 'C0123/4567' }, 'passportNumber:INVALID_PASSPORT'],
    ['with a future birth date', { birthDate: isoDate(-1) }, 'birthDate:DATE_NOT_IN_PAST'],
    ['younger than 16', { birthDate: isoDate(16, 1) }, 'birthDate:AGE_OUT_OF_RANGE'],
    ['older than 80', { birthDate: isoDate(81) }, 'birthDate:AGE_OUT_OF_RANGE'],
  ])('rejects a sign-up %s with 400 VALIDATION', async (_label, over, expected) => {
    const res = await anon().post('/api/auth/register').send(body(over));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
    expect(issueMessages(res).some((m) => m.startsWith(expected))).toBe(true);
    expect(await prisma.user.count()).toBe(0);
  });

  it('accepts the age boundaries 16 and 80', async () => {
    expect((await anon().post('/api/auth/register').send(body({ birthDate: isoDate(16) }))).status).toBe(201);
    expect((await anon().post('/api/auth/register').send(body({ birthDate: isoDate(80) }))).status).toBe(201);
  });
});

describe('POST /api/auth/register — consents and agent referral', () => {
  const makeAgent = async (code: string, status: 'ACTIVE' | 'PAUSED' = 'ACTIVE') => {
    const user = await prisma.user.create({
      data: { email: `${code.toLowerCase()}@agents.test`, passwordHash: 'x', role: 'AGENT', firstName: 'Agent', lastName: code },
    });
    return prisma.agent.create({ data: { userId: user.id, code, status } });
  };
  const consents = async (email: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return prisma.consentRecord.findMany({ where: { userId: user.id }, orderBy: { type: 'asc' } });
  };

  it('attaches the client to an active agent and records the privacy and passport-OCR consents', async () => {
    const agent = await makeAgent('GANJA-ALI');
    const res = await anon().post('/api/auth/register').send(body({ email: 'ref@test.local', ref: ' ganja-ali ', passportScanned: true }));
    expect(res.status).toBe(201);
    const db = await prisma.user.findUniqueOrThrow({ where: { email: 'ref@test.local' } });
    expect(db.referredByAgentId).toBe(agent.id);
    expect(db.referredAt).not.toBeNull();
    const rows = await consents('ref@test.local');
    expect(rows.map((r) => [r.type, r.granted, r.source])).toEqual([
      ['PASSPORT_OCR', true, 'REGISTER'],
      ['PRIVACY_POLICY', true, 'REGISTER'],
    ]);
    expect(rows[0].email).toBe('ref@test.local');
  });

  it('ignores unknown and paused agent codes; without a scan only the privacy consent is logged', async () => {
    await makeAgent('PAUSED-1', 'PAUSED');
    const paused = await anon().post('/api/auth/register').send(body({ email: 'paused@test.local', ref: 'PAUSED-1' }));
    expect(paused.status).toBe(201);
    const unknown = await anon().post('/api/auth/register').send(body({ email: 'unknown@test.local', ref: 'NOPE-404' }));
    expect(unknown.status).toBe(201);
    for (const email of ['paused@test.local', 'unknown@test.local']) {
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).referredByAgentId).toBeNull();
      expect((await consents(email)).map((r) => r.type)).toEqual(['PRIVACY_POLICY']);
    }
  });

  it('logs WhatsApp / SMS consent changes made in the profile', async () => {
    const res = await anon().post('/api/auth/register').send(body({ email: 'channels@test.local' }));
    expect(res.status).toBe(201);
    const { token } = await issueSession(res.body.user.id, { client: 'web' });
    const me = sessionAgent(token);
    // whatsappOptIn defaults to true: re-sending true is no change, false is.
    expect((await me.patch('/api/auth/me').send({ whatsappOptIn: true })).status).toBe(200);
    expect((await me.patch('/api/auth/me').send({ whatsappOptIn: false, smsNotifications: false })).status).toBe(200);
    expect((await me.patch('/api/auth/me').send({ smsNotifications: true, firstName: 'Aysel' })).status).toBe(200);
    const rows = (await consents('channels@test.local')).filter((r) => r.source === 'PROFILE');
    expect(rows.map((r) => `${r.type}:${r.granted}`).sort()).toEqual(['SMS:false', 'SMS:true', 'WHATSAPP:false']);
  });
});
