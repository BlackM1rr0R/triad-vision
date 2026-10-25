import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GRACE_DAYS,
  LICENSE_PUBLIC_KEY_PEM,
  assertStaffSeat,
  domainMatches,
  evaluateLicense,
  moduleLicensed,
  resolveInstanceRole,
  signLicense,
  verifyLicenseToken,
  type LicensePayload,
} from '../../src/lib/license/index.js';
import { MODULE_KEYS, applyLicense, licensedModules, normalizeModules } from '../../src/lib/navModules.js';

/**
 * White-label licence (server/src/lib/license): Ed25519-signed tokens, instance role, expiry with a grace
 * period, read-only mode, and the plan limits (staff seats, modules).
 */

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const NOW = new Date('2026-10-25T12:00:00Z');
const DAY = 86_400_000;

const payload = (over: Partial<LicensePayload> = {}): LicensePayload => ({
  v: 1,
  id: 'lic-1',
  customer: 'Acme Visa GmbH',
  domain: 'acme-visa.example',
  plan: 'pro',
  modules: ['campaigns', 'calls', 'bookings'],
  staffLimit: 3,
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  ...over,
});
const customerEnv = (token: string | undefined, extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  CLIENT_URL: 'https://acme-visa.example',
  INSTANCE_ROLE: 'customer',
  ...(token ? { LICENSE_KEY: token } : {}),
  ...extra,
});
const evaluate = (env: NodeJS.ProcessEnv, now = NOW) => evaluateLicense({ env, now, publicKey });

describe('licence tokens', () => {
  it('a valid token verifies and gives the plan limits', () => {
    const token = signLicense(payload(), privateKey);
    expect(token.startsWith('TV1.')).toBe(true);
    expect(verifyLicenseToken(token, { publicKey })).toMatchObject({ ok: true, payload: { customer: 'Acme Visa GmbH' } });
    const s = evaluate(customerEnv(token));
    expect(s).toMatchObject({ role: 'customer', status: 'valid', mode: 'normal', staffLimit: 3, modules: ['campaigns', 'calls', 'bookings'] });
    expect(s.daysLeft).toBe(68);
  });

  it('a tampered token (payload changed, signature kept) is invalid → read-only', () => {
    const token = signLicense(payload(), privateKey);
    const [prefix, , sig] = token.split('.');
    const forged = `${prefix}.${Buffer.from(JSON.stringify(payload({ staffLimit: 999, expiresAt: '2099-01-01T00:00:00.000Z' }))).toString('base64url')}.${sig}`;
    expect(verifyLicenseToken(forged, { publicKey })).toEqual({ ok: false, reason: 'signature' });
    expect(evaluate(customerEnv(forged))).toMatchObject({ status: 'invalid', mode: 'readonly', reason: 'signature', staffLimit: null });
    // a flipped signature byte as well
    const flipped = `${token.slice(0, -2)}${token.endsWith('A') ? 'B' : 'A'}${token.slice(-1)}`;
    expect(verifyLicenseToken(flipped, { publicKey }).ok).toBe(false);
  });

  it('a token signed with another key never passes the public key compiled into the app', () => {
    const token = signLicense(payload(), privateKey);
    expect(verifyLicenseToken(token, { publicKey: LICENSE_PUBLIC_KEY_PEM })).toEqual({ ok: false, reason: 'signature' });
    expect(crypto.createPublicKey(LICENSE_PUBLIC_KEY_PEM).asymmetricKeyType).toBe('ed25519');
  });

  it('rejects garbage, wrong prefixes and malformed payloads', () => {
    expect(verifyLicenseToken('nonsense', { publicKey })).toEqual({ ok: false, reason: 'format' });
    expect(verifyLicenseToken('TV2.a.b', { publicKey })).toEqual({ ok: false, reason: 'format' });
    // validly signed, but not a licence payload
    const body = `TV1.${Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64url')}`;
    const sig = crypto.sign(null, Buffer.from(body), privateKey).toString('base64url');
    expect(verifyLicenseToken(`${body}.${sig}`, { publicKey })).toEqual({ ok: false, reason: 'payload' });
  });

  it('is bound to the domain (www, wildcard and * allowed)', () => {
    expect(domainMatches('acme-visa.example', 'www.acme-visa.example')).toBe(true);
    expect(domainMatches('*.acme.example', 'portal.acme.example')).toBe(true);
    expect(domainMatches('*', 'anything.example')).toBe(true);
    expect(domainMatches('acme-visa.example', 'other.example')).toBe(false);
    const token = signLicense(payload(), privateKey);
    expect(evaluate(customerEnv(token, { CLIENT_URL: 'https://copycat.example' }))).toMatchObject({ status: 'invalid', reason: 'domain', mode: 'readonly' });
    // BRAND_DOMAIN wins over CLIENT_URL
    expect(evaluate(customerEnv(token, { CLIENT_URL: 'https://x.example', BRAND_DOMAIN: 'acme-visa.example' })).status).toBe('valid');
  });
});

describe('expiry: grace period, then read-only for staff', () => {
  const token = signLicense(payload({ expiresAt: '2026-10-20T00:00:00.000Z' }), privateKey);

  it('within the grace period: normal mode with a banner date', () => {
    const s = evaluate(customerEnv(token));
    expect(s).toMatchObject({ status: 'grace', mode: 'normal', staffLimit: 3 });
    expect(s.daysLeft).toBeLessThan(0);
    expect(new Date(s.graceEndsAt!).getTime()).toBe(new Date('2026-10-20T00:00:00Z').getTime() + GRACE_DAYS * DAY);
  });

  it('after the grace period: read-only', () => {
    expect(evaluate(customerEnv(token), new Date('2026-11-04T00:00:01Z'))).toMatchObject({ status: 'expired', mode: 'readonly' });
  });
});

describe('instance role', () => {
  it('no LICENSE_KEY on the owner domain (production) = owner, unlimited', () => {
    const env = { NODE_ENV: 'production', CLIENT_URL: 'https://triad-vision.de' };
    expect(resolveInstanceRole(env)).toBe('owner');
    expect(evaluate(env)).toMatchObject({ role: 'owner', status: 'owner', mode: 'normal', modules: null, staffLimit: null });
  });

  it('development and tests without a key are owner instances; INSTANCE_ROLE=owner forces it', () => {
    expect(resolveInstanceRole({ NODE_ENV: 'test', CLIENT_URL: 'http://localhost:5173' })).toBe('owner');
    expect(resolveInstanceRole({ NODE_ENV: 'production', CLIENT_URL: 'https://acme.example', INSTANCE_ROLE: 'owner' })).toBe('owner');
  });

  it('a production instance on another domain without a key is a customer with a missing licence → read-only', () => {
    const env = { NODE_ENV: 'production', CLIENT_URL: 'https://acme.example' };
    expect(resolveInstanceRole(env)).toBe('customer');
    expect(evaluate(env)).toMatchObject({ role: 'customer', status: 'missing', mode: 'readonly' });
    expect(evaluate(customerEnv(undefined))).toMatchObject({ status: 'missing', mode: 'readonly' });
  });

  it('a LICENSE_KEY without INSTANCE_ROLE makes it a customer instance', () => {
    const token = signLicense(payload(), privateKey);
    expect(resolveInstanceRole({ NODE_ENV: 'production', CLIENT_URL: 'https://triad-vision.de', LICENSE_KEY: token })).toBe('customer');
  });
});

describe('plan enforcement', () => {
  const token = signLicense(payload(), privateKey);
  const state = evaluate(customerEnv(token));

  it('staff seat limit: the next account is refused once the plan is full', async () => {
    await expect(assertStaffSeat(state, async () => 2)).resolves.toBeUndefined();
    await expect(assertStaffSeat(state, async () => 3)).rejects.toMatchObject({ status: 403, code: 'LICENSE_SEAT_LIMIT' });
    // owner / unlimited plans never count
    await expect(assertStaffSeat(evaluate({ NODE_ENV: 'test' }), async () => 10_000)).resolves.toBeUndefined();
    const unlimited = evaluate(customerEnv(signLicense(payload({ staffLimit: null }), privateKey)));
    await expect(assertStaffSeat(unlimited, async () => 10_000)).resolves.toBeUndefined();
  });

  it('modules outside the plan are off, whatever the stored toggle says; stored "off" stays off', () => {
    expect(moduleLicensed('campaigns', state)).toBe(true);
    expect(moduleLicensed('liveChat', state)).toBe(false);
    expect(licensedModules(state)).toEqual(['campaigns', 'calls', 'bookings']);
    const effective = applyLicense(normalizeModules({ calls: false }), state);
    expect(effective).toMatchObject({ campaigns: true, calls: false, bookings: true, liveChat: false, aiAssistant: false });
    expect(MODULE_KEYS.filter((k) => effective[k])).toEqual(['campaigns', 'bookings']);
  });

  it('owner and all-modules plans keep every stored toggle', () => {
    const stored = normalizeModules({ surveys: false });
    expect(applyLicense(stored, evaluate({ NODE_ENV: 'test' }))).toEqual(stored);
    expect(licensedModules(evaluate({ NODE_ENV: 'test' }))).toBeNull();
    const all = evaluate(customerEnv(signLicense(payload({ modules: '*' }), privateKey)));
    expect(applyLicense(stored, all)).toEqual(stored);
  });
});
