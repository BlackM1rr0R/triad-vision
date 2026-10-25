import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { config } from '../../src/config.js';
import { resetBrandForTests } from '../../src/lib/brand/index.js';
import { refreshLicense, setLicensePublicKeyForTests, signLicense, type LicensePayload } from '../../src/lib/license/index.js';
import { notifyStaff } from '../../src/lib/notifications.js';
import { settle } from '../helpers/db';

/**
 * White-label (server/src/lib/brand, lib/license, routes/admin/whitelabel.ts): the brand settings API
 * (SUPER_ADMIN only, sanitised image uploads), the manifest / HTML-shell brand tags and SEO head with a custom
 * brand, branded e-mails, the owner's customer list, and licence enforcement (seat limit, plan modules,
 * read-only mode for staff while clients keep working).
 */

const staticManifest = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/public/manifest.webmanifest'), 'utf8'),
) as Record<string, unknown>;

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 20, g: 90, b: 200, alpha: 1 } } }).png().toBuffer();

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

beforeEach(() => resetBrandForTests());
afterEach(() => {
  restoreEnv();
  resetBrandForTests();
});
afterAll(() => restoreEnv());

describe('brand settings API', () => {
  it('is SUPER_ADMIN only; the generic settings route refuses the brand key', async () => {
    expect((await anon().get('/api/admin/brand')).status).toBe(401);
    expect((await (await asStaff()).agent.get('/api/admin/brand')).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/brand')).status).toBe(403);
    expect((await admin.agent.put('/api/admin/brand').send({ name: 'X' })).status).toBe(403);
    expect((await admin.agent.put('/api/admin/settings/brand').send({ value: { name: 'X' } })).status).toBe(403);

    const sa = await asSuperAdmin();
    const view = expectStatus(await sa.agent.get('/api/admin/brand'), 200).body;
    expect(view.brand).toMatchObject({ name: 'Triad Vision', domain: 'triad-vision.de', isDefault: true });
    expect((await sa.agent.put('/api/admin/settings/brand').send({ value: { name: 'X' } })).status).toBe(403);
  });

  it('validates and stores the brand; empty fields fall back to the default; reset clears it', async () => {
    const sa = await asSuperAdmin();
    expect((await sa.agent.put('/api/admin/brand').send({ name: '<img src=x onerror=alert(1)>' })).status).toBe(400);
    expect((await sa.agent.put('/api/admin/brand').send({ name: 'A & B' })).status).toBe(400);
    expect((await sa.agent.put('/api/admin/brand').send({ logoLight: '/uploads/brand/logo-light-x.png' })).status).toBe(400); // images only via upload
    expect((await sa.agent.put('/api/admin/brand').send({ bogus: 1 })).status).toBe(400);

    const saved = expectStatus(await sa.agent.put('/api/admin/brand').send({ name: 'Acme Visa', tagline: 'Visas made simple', shortName: '', phone: '+49 30 123' }), 200).body;
    expect(saved.brand).toMatchObject({ name: 'Acme Visa', shortName: 'Acme Visa', tagline: 'Visas made simple', phone: '+49 30 123', isDefault: false });
    expect(saved.setting).toEqual({ name: 'Acme Visa', tagline: 'Visas made simple', phone: '+49 30 123' });
    expect(expectStatus(await anon().get('/api/site/brand'), 200).body.brand).toMatchObject({ name: 'Acme Visa' });
    expect(await prisma.auditLog.count({ where: { action: 'BRAND_UPDATED' } })).toBe(1);

    const reset = expectStatus(await sa.agent.delete('/api/admin/brand'), 200).body;
    expect(reset.brand).toMatchObject({ name: 'Triad Vision', isDefault: true });
  });

  it('uploads are re-encoded as PNG (SVG scripts never survive); non-images and non-square icons are refused', async () => {
    const sa = await asSuperAdmin();
    const logo = expectStatus(await sa.agent.post('/api/admin/brand/images/logoLight').attach('file', await png(600, 200), { filename: 'logo.png', contentType: 'image/png' }), 201).body;
    expect(logo.brand.logoLight).toMatch(/^\/uploads\/brand\/logo-light-[a-f0-9]{16}\.png$/);
    const stored = path.join(config.uploads.publicDir, logo.brand.logoLight.replace('/uploads/', ''));
    expect((await sharp(stored).metadata()).format).toBe('png');
    expect((await anon().get(logo.brand.logoLight)).status).toBe(200);

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><script>alert(1)</script><rect width="300" height="100" fill="#123456"/></svg>');
    const dark = expectStatus(await sa.agent.post('/api/admin/brand/images/logoDark').attach('file', svg, { filename: 'evil.svg', contentType: 'image/svg+xml' }), 201).body;
    const darkFile = fs.readFileSync(path.join(config.uploads.publicDir, dark.brand.logoDark.replace('/uploads/', '')));
    expect(darkFile.subarray(1, 4).toString()).toBe('PNG');
    expect(darkFile.includes(Buffer.from('<script'))).toBe(false);

    const bad = await sa.agent.post('/api/admin/brand/images/logoLight').attach('file', Buffer.from('#!/bin/sh\nrm -rf /\n'), { filename: 'x.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('BRAND_IMAGE_INVALID');
    expect((await sa.agent.post('/api/admin/brand/images/icon').attach('file', await png(600, 200), { filename: 'wide.png', contentType: 'image/png' })).body.error).toBe('BRAND_ICON_NOT_SQUARE');
    expect((await sa.agent.post('/api/admin/brand/images/nope').attach('file', await png(64, 64), { filename: 'a.png', contentType: 'image/png' })).status).toBe(400);

    const icon = expectStatus(await sa.agent.post('/api/admin/brand/images/icon').attach('file', await png(512, 512), { filename: 'icon.png', contentType: 'image/png' }), 201).body;
    expect(icon.brand.icons.icon512).toMatch(/^\/uploads\/brand\/icons-[a-f0-9]{16}\/icon-512\.png$/);
    const meta = await sharp(path.join(config.uploads.publicDir, icon.brand.icons.maskable192.replace('/uploads/', ''))).metadata();
    expect([meta.width, meta.height]).toEqual([192, 192]);
    const manifest = JSON.parse((await anon().get('/manifest.webmanifest')).text);
    expect(manifest.icons[0].src).toBe(icon.brand.icons.icon192);

    const removed = expectStatus(await sa.agent.delete('/api/admin/brand/images/icon'), 200).body;
    expect(removed.brand.icons.icon192).toBe('/icons/icon-192.png');
  });
});

describe('HTML shell, manifest and SEO with the brand', () => {
  it('default brand: the manifest is exactly the static file and the shell tags are the static fallbacks', async () => {
    const res = await anon().get('/manifest.webmanifest');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/manifest+json');
    expect(JSON.parse(res.text)).toEqual(staticManifest);
    const tags = (await anon().get('/__seo/brand')).text;
    expect(tags).toContain('<meta name="google-site-verification" content="W7ASmkW0-5qq0rKMp2DrlQfP0kCTxliKR5rQQgiH7w4" />');
    expect(tags).toContain('<meta name="theme-color" content="#0b1f44" />');
    expect(tags).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(tags).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(tags).toContain('<meta name="apple-mobile-web-app-title" content="Triad Vision" />');
    expect(tags).toMatch(/<meta name="tv-brand" content="\{&quot;name&quot;:&quot;Triad Vision&quot;/);
    expect((await anon().get('/__seo/head?path=/')).text).toContain('Triad Vision');
  });

  it('custom brand: manifest, shell tags, SEO head, RSS and robots follow it; no "Triad Vision" left', async () => {
    const sa = await asSuperAdmin();
    expectStatus(await sa.agent.put('/api/admin/brand').send({ name: 'Acme Visa', shortName: 'Acme', description: 'Work visas for Germany', defaultLanguage: 'de' }), 200);
    const manifest = JSON.parse((await anon().get('/manifest.webmanifest')).text);
    expect(manifest).toMatchObject({ name: 'Acme Visa — People · Work · Opportunities', short_name: 'Acme', description: 'Work visas for Germany', lang: 'de' });
    expect(manifest.shortcuts[0].name).toBe('Konto');
    const tags = (await anon().get('/__seo/brand')).text;
    expect(tags).toContain('<meta name="apple-mobile-web-app-title" content="Acme" />');
    expect(tags).not.toContain('google-site-verification'); // the owner's Search Console token stays with the owner
    expect(tags).toContain('&quot;name&quot;:&quot;Acme Visa&quot;');
    const head = (await anon().get('/__seo/head?path=/de/about')).text;
    expect(head).toContain('Acme Visa');
    expect(head).not.toContain('Triad Vision');
    const body = (await anon().get('/__seo/body?path=/')).text;
    expect(body).not.toContain('Triad Vision');
    const rss = (await anon().get('/rss.xml')).text;
    expect(rss).not.toContain('Triad Vision');
  });

  it('e-mails carry the brand (subject, header, footer)', async () => {
    const sa = await asSuperAdmin();
    expectStatus(await sa.agent.put('/api/admin/brand').send({ name: 'Acme Visa', phone: '+49 30 123' }), 200);
    await notifyStaff('New inquiry', 'Triad Vision received a request.');
    await settle();
    const log = await prisma.emailLog.findFirst({ where: { to: config.adminNotifyEmail }, orderBy: { createdAt: 'desc' } });
    expect(log?.subject).toBe('[Acme Visa] New inquiry');
    const n = await prisma.notification.findFirst({ where: { userId: sa.user.id }, orderBy: { createdAt: 'desc' } });
    expect(n?.body).toBe('Acme Visa received a request.');
  });
});

describe('owner instance: customer agencies', () => {
  it('SUPER_ADMIN CRUD, token check, company link; never in public content or the settings list', async () => {
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/whitelabel/customers')).status).toBe(403);
    const sa = await asSuperAdmin();
    expect((await sa.agent.post('/api/admin/whitelabel/customers').send({ name: '' })).status).toBe(400);
    const created = expectStatus(
      await sa.agent.post('/api/admin/whitelabel/customers').send({ name: 'Acme Visa GmbH', domain: 'acme.example', plan: 'pro', pricePerMonth: 199, currency: 'EUR', status: 'active', licenseToken: 'TV1.bad.token' }),
      201,
    ).body.customer;
    expect(created.token).toEqual({ valid: false, reason: 'signature' });
    const list = expectStatus(await sa.agent.get('/api/admin/whitelabel/customers'), 200).body;
    expect(list.items).toHaveLength(1);
    expect(list.mrr).toEqual({ EUR: 199 });

    const patched = expectStatus(await sa.agent.patch(`/api/admin/whitelabel/customers/${created.id}`).send({ status: 'past_due', notes: 'Pays late' }), 200).body.customer;
    expect(patched).toMatchObject({ status: 'past_due', notes: 'Pays late', name: 'Acme Visa GmbH' });
    expect((await sa.agent.patch(`/api/admin/whitelabel/customers/${created.id}`).send({ id: 'x' })).status).toBe(400);

    const linked = expectStatus(await sa.agent.post(`/api/admin/whitelabel/customers/${created.id}/company`), 201).body;
    expect(await prisma.company.findUnique({ where: { id: linked.companyId } })).toMatchObject({ name: 'Acme Visa GmbH', status: 'ACTIVE' });

    const content = expectStatus(await anon().get('/api/public/content'), 200).body;
    expect(content.settings['whitelabel.customers']).toBeUndefined();
    expect(expectStatus(await sa.agent.get('/api/admin/settings'), 200).body.settings['whitelabel.customers']).toBeUndefined();
    expect((await sa.agent.put('/api/admin/settings/whitelabel.customers').send({ value: { items: [] } })).status).toBe(403);

    expectStatus(await sa.agent.delete(`/api/admin/whitelabel/customers/${created.id}`), 200);
    expect((await sa.agent.delete(`/api/admin/whitelabel/customers/${created.id}`)).status).toBe(404);
  });

  it('does not exist on a customer instance', async () => {
    process.env.INSTANCE_ROLE = 'customer';
    refreshLicense();
    const sa = await asSuperAdmin();
    expect((await sa.agent.get('/api/admin/whitelabel/customers')).status).toBe(404);
  });
});

describe('licence enforcement on a customer instance', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const install = (over: Partial<LicensePayload>) => {
    setLicensePublicKeyForTests(publicKey);
    process.env.INSTANCE_ROLE = 'customer';
    process.env.LICENSE_KEY = signLicense(
      {
        v: 1,
        id: 'lic-e2e',
        customer: 'Acme Visa GmbH',
        domain: 'localhost',
        plan: 'starter',
        modules: ['bookings', 'reviews'],
        staffLimit: 2,
        issuedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        ...over,
      },
      privateKey,
    );
    return refreshLicense();
  };

  it('staff seat limit and plan modules', async () => {
    expect(install({}).status).toBe('valid');
    const sa = await asSuperAdmin(); // seat 1 of 2
    const body = (n: number) => ({ email: `staff${n}@test.local`, password: 'Sup3rSecret!pass', firstName: 'S', lastName: String(n), role: 'STAFF' });
    expectStatus(await sa.agent.post('/api/admin/users').send(body(1)), 201); // seat 2 of 2
    const full = await sa.agent.post('/api/admin/users').send(body(2));
    expect(full.status).toBe(403);
    expect(full.body.error).toBe('LICENSE_SEAT_LIMIT');
    // promoting a client to staff counts as well
    const client = await asClient();
    expect((await sa.agent.patch(`/api/admin/users/${client.user.id}`).send({ role: 'STAFF' })).body.error).toBe('LICENSE_SEAT_LIMIT');

    const nav = expectStatus(await sa.agent.get('/api/admin/me/nav'), 200).body;
    expect(nav.licensedModules).toEqual(['reviews', 'bookings']); // MODULE_KEYS order
    expect(nav.modules).toMatchObject({ bookings: true, reviews: true, campaigns: false, liveChat: false });
    expect(nav.license).toMatchObject({ role: 'customer', status: 'valid', mode: 'normal' });
    const lic = expectStatus(await sa.agent.get('/api/admin/license'), 200).body;
    expect(lic).toMatchObject({ status: 'valid', customer: 'Acme Visa GmbH', staffLimit: 2, staffSeatsUsed: 2, plan: 'starter' });
  });

  it('expired beyond the grace period: staff are read-only, clients keep working', async () => {
    const sa = await asSuperAdmin();
    const client = await asClient();
    expect(install({ expiresAt: new Date(Date.now() - 20 * 86_400_000).toISOString() }).status).toBe('expired');

    const blocked = await sa.agent.post('/api/admin/users').send({ email: 'x@test.local', password: 'Sup3rSecret!pass', firstName: 'X', lastName: 'Y', role: 'STAFF' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('LICENSE_READ_ONLY');
    expect((await sa.agent.get('/api/admin/users')).status).toBe(200); // reading still works
    expect((await sa.agent.put('/api/admin/me/nav').send({ desk: 'ALL' })).status).toBe(200); // own preferences allowed

    expect((await client.agent.patch('/api/account/passport').send({ passportExpiry: '2030-01-01' })).status).toBe(200);
    expect(expectStatus(await sa.agent.get('/api/admin/me/nav'), 200).body.license).toMatchObject({ status: 'expired', mode: 'readonly' });
  });

  it('a tampered or foreign-domain key is invalid → read-only; within the grace period it is normal', async () => {
    const sa = await asSuperAdmin();
    install({ domain: 'someone-else.example' });
    expect(refreshLicense()).toMatchObject({ status: 'invalid', reason: 'domain' });
    expect((await sa.agent.post('/api/admin/users').send({})).body.error).toBe('LICENSE_READ_ONLY');
    install({ expiresAt: new Date(Date.now() - 2 * 86_400_000).toISOString() });
    expect(refreshLicense().status).toBe('grace');
    expect((await sa.agent.post('/api/admin/users').send({})).status).toBe(400); // validation, not the licence
  });
});
