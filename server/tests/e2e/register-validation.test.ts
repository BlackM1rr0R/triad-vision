import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { prisma } from '../helpers/db';

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
