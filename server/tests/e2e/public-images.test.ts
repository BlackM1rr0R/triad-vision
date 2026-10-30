import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { anon, asAdmin, ORIGIN } from '../helpers/api';
import { prisma } from '../helpers/db';
import { l10n } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { asCompany, cleanJobs, createVacancy } from './vacancies.fixtures';
import { flushImageCleanups, ORPHAN_SETTING_KEY, runOrphanSweep, sweepOrphanUploads } from '../../src/lib/publicImageRefs.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/publicUploads.js';

// libvips keeps files it has read open, and Windows cannot delete an open file: no cache for the metadata checks.
sharp.cache(false);

const PUBLIC = path.join(TEST_UPLOADS_DIR, 'public');
const fileOf = (url: string) => path.join(PUBLIC, url.replace(/^\/uploads\//, ''));

beforeEach(async () => {
  fs.mkdirSync(PUBLIC, { recursive: true });
  await cleanJobs();
});

const photo = (width = 1200, height = 800, format: 'png' | 'jpeg' = 'jpeg', orientation?: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } } })
    .withMetadata({ ...(orientation ? { orientation } : {}), exif: { IFD0: { Copyright: 'secret-gps' } } })
    [format]()
    .toBuffer();

const transparentPng = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: { r: 200, g: 20, b: 20, alpha: 0 } } }).png().toBuffer();

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>');

const ld = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

describe('POST /api/admin/upload (CMS images)', () => {
  it('re-encodes photos: WebP, EXIF stripped, auto-rotated, long side ≤ 2400 px, size returned', async () => {
    const { agent } = await asAdmin();
    const res = await agent.post('/api/admin/upload').attach('file', await photo(3000, 1500, 'jpeg', 6), 'foto.jpg');
    expectStatus(res, 201);
    expect(res.body.url).toMatch(/^\/uploads\/\d+-[0-9a-f]{24}\.webp$/);
    // EXIF orientation 6 = rotated 90°: the stored image is portrait, 2400 px on the long side.
    expect(res.body).toMatchObject({ w: 1200, h: 2400, format: 'webp' });
    const meta = await sharp(fileOf(res.body.url)).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1200, height: 2400 });
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    const served = await anon().get(res.body.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
  });

  it('keeps transparency, refuses SVG except for logos / icons, and OG images become JPEG', async () => {
    const { agent } = await asAdmin();
    const png = await agent.post('/api/admin/upload').attach('file', await transparentPng(300, 100), 'logo.png');
    expectStatus(png, 201);
    expect((await sharp(fileOf(png.body.url)).metadata()).hasAlpha).toBe(true);

    const svg = await agent.post('/api/admin/upload').attach('file', SVG, { filename: 'icon.svg', contentType: 'image/svg+xml' });
    expect(svg.status).toBe(400);
    expect(svg.body.error).toBe('SVG_NOT_ALLOWED');
    const svgLogo = await agent.post('/api/admin/upload?purpose=logo').attach('file', SVG, { filename: 'icon.svg', contentType: 'image/svg+xml' });
    expectStatus(svgLogo, 201);
    expect(svgLogo.body).toMatchObject({ format: 'svg', w: 40, h: 20 });
    expect(svgLogo.body.url).toMatch(/^\/uploads\/\d+-[0-9a-f]{24}\.svg$/);
    const evil = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect((await agent.post('/api/admin/upload?purpose=logo').attach('file', evil, { filename: 'x.svg', contentType: 'image/svg+xml' })).status).toBe(400);

    const og = await agent.post('/api/admin/upload').field('purpose', 'og').attach('file', await transparentPng(2000, 1000), 'og.png');
    expectStatus(og, 201);
    expect(og.body).toMatchObject({ format: 'jpeg', w: 1600, h: 800 });
    expect(og.body.url).toMatch(/\.jpg$/);
    const ogSvg = await agent.post('/api/admin/upload?purpose=og').attach('file', SVG, { filename: 'og.svg', contentType: 'image/svg+xml' });
    expect(ogSvg.body.error).toBe('SVG_NOT_ALLOWED');

    const fake = await agent.post('/api/admin/upload').attach('file', Buffer.from('not really a png'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('INVALID_IMAGE');
  });

  it('SEO fields refuse an SVG social image (CMS items and landing pages)', async () => {
    const { agent } = await asAdmin();
    const post = {
      slug: 'svg-og',
      cover: '',
      title: l10n('T'),
      excerpt: l10n('E'),
      body: l10n('B'),
      published: true,
      publishedAt: '2026-01-01',
    };
    const bad = await agent.post('/api/admin/content/posts').send({ ...post, ogImage: '/uploads/1700000000000-aaaaaaaaaaaaaaaaaaaaaaaa.svg' });
    expect(bad.status).toBe(400);
    expectStatus(await agent.post('/api/admin/content/posts').send({ ...post, ogImage: '/uploads/1700000000000-aaaaaaaaaaaaaaaaaaaaaaaa.jpg' }), 201);
    const landing = await agent.post('/api/admin/marketing/landing-pages').send({ title: 'Kampaniya', ogImage: '/uploads/x.svg' });
    expect(landing.status).toBe(400);
  });
});

describe('testimonial author photo', () => {
  it('is stored by the CMS and served by the public content endpoint', async () => {
    const { agent } = await asAdmin();
    const up = await agent.post('/api/admin/upload?purpose=avatar').attach('file', await photo(1000, 1000), 'me.jpg');
    expectStatus(up, 201);
    expect(up.body).toMatchObject({ w: 640, h: 640 });
    const created = await agent.post('/api/admin/content/testimonials').send({
      quote: l10n('Super'),
      author: l10n('Aysel M.'),
      role: l10n('Aşpaz'),
      kind: 'candidate',
      sortOrder: 0,
      published: true,
      authorPhoto: up.body.url,
    });
    expectStatus(created, 201);
    expect(created.body.item.authorPhoto).toBe(up.body.url);
    expect((await agent.post('/api/admin/content/testimonials').send({ ...created.body.item, id: undefined, authorPhoto: 'javascript:alert(1)' })).status).toBe(400);
    const content = await anon().get('/api/public/content');
    expect(content.body.testimonials.find((t: { id: string }) => t.id === created.body.item.id).authorPhoto).toBe(up.body.url);
  });
});

describe('company logo', () => {
  it('admin upload: WebP ≤ 512 px with transparency, listed, no SVG; delete clears it', async () => {
    const admin = await asAdmin();
    const co = await asCompany();
    const svg = await admin.agent.post(`/api/admin/companies/${co.company.id}/logo`).attach('file', SVG, { filename: 'l.svg', contentType: 'image/svg+xml' });
    expect(svg.status).toBe(400);
    const tiny = await admin.agent.post(`/api/admin/companies/${co.company.id}/logo`).attach('file', await transparentPng(20, 20), 'l.png');
    expect(tiny.body.error).toBe('IMAGE_TOO_SMALL');

    const res = await admin.agent.post(`/api/admin/companies/${co.company.id}/logo`).attach('file', await transparentPng(1024, 512), 'l.png');
    expectStatus(res, 201);
    expect(res.body.logo.url).toMatch(/^\/uploads\/logos\/[a-f0-9]{32}\.webp$/);
    expect(res.body.logo).toMatchObject({ w: 512, h: 256 });
    const meta = await sharp(fileOf(res.body.logo.url)).metadata();
    expect(meta).toMatchObject({ format: 'webp', hasAlpha: true });

    const list = await admin.agent.get('/api/admin/companies');
    expect(list.body.items.find((c: { id: string }) => c.id === co.company.id).logo).toEqual(res.body.logo);
    expect((await admin.agent.get(`/api/admin/companies/${co.company.id}`)).body.company.logo).toEqual(res.body.logo);

    expectStatus(await admin.agent.delete(`/api/admin/companies/${co.company.id}/logo`), 200);
    await flushImageCleanups();
    expect(fs.existsSync(fileOf(res.body.logo.url))).toBe(false);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } })).logo).toBeNull();
  });

  it('employer upload goes live, notifies the staff, shows on the board / JobPosting and the replaced file is deleted', async () => {
    const admin = await asAdmin();
    const co = await asCompany();
    const first = await co.agent.post('/api/company/me/logo').attach('file', await photo(400, 400, 'png'), 'logo.png');
    expectStatus(first, 201);
    expect(first.body.company.logo).toMatchObject({ w: 400, h: 400 });
    expect((await co.agent.get('/api/company/me')).body.company.logo.url).toBe(first.body.company.logo.url);
    const note = await prisma.notification.findFirst({ where: { userId: admin.user.id, link: `/admin/companies?id=${co.company.id}` } });
    expect(note).not.toBeNull();

    const second = await co.agent.post('/api/company/me/logo').attach('file', await photo(300, 200), 'logo.jpg');
    expectStatus(second, 201);
    await flushImageCleanups();
    expect(fs.existsSync(fileOf(first.body.company.logo.url))).toBe(false);
    const logo = second.body.company.logo;
    expect(fs.existsSync(fileOf(logo.url))).toBe(true);

    const shown = await createVacancy({ companyId: co.company.id, status: 'OPEN', publishedAt: new Date(Date.now() - 60_000), showCompany: true });
    const hidden = await createVacancy({ companyId: co.company.id, status: 'OPEN', publishedAt: new Date(Date.now() - 60_000), showCompany: false });
    expect((await anon().get(`/api/vacancies/${shown.slug}`)).body.vacancy.companyLogo).toEqual(logo);
    expect((await anon().get(`/api/vacancies/${hidden.slug}`)).body.vacancy.companyLogo).toBeNull();
    const list = await anon().get('/api/vacancies');
    expect(list.body.items.find((x: { id: string }) => x.id === shown.id).companyLogo).toEqual(logo);

    const head = (await anon().get('/api/seo/head').query({ path: `/jobs/${shown.slug}`, lng: 'de' })).text;
    expect(ld(head).find((b) => b['@type'] === 'JobPosting').hiringOrganization.logo).toBe(`${ORIGIN}${logo.url}`);
    const hiddenHead = (await anon().get('/api/seo/head').query({ path: `/jobs/${hidden.slug}`, lng: 'de' })).text;
    expect(ld(hiddenHead).find((b) => b['@type'] === 'JobPosting').hiringOrganization.logo).not.toContain('/uploads/logos/');

    expectStatus(await co.agent.delete('/api/company/me/logo'), 200);
    await flushImageCleanups();
    expect(fs.existsSync(fileOf(logo.url))).toBe(false);
  });
});

describe('vacancy image files', () => {
  it('are deleted when removed from a vacancy or with the vacancy, unless referenced elsewhere', async () => {
    const admin = await asAdmin();
    const a = (await admin.agent.post('/api/admin/vacancies/images').attach('file', await photo(), 'a.jpg')).body;
    const b = (await admin.agent.post('/api/admin/vacancies/images').attach('file', await photo(), 'b.jpg')).body;
    const v = await createVacancy({ status: 'DRAFT' });
    expectStatus(await admin.agent.patch(`/api/admin/vacancies/${v.id}`).send({ images: [a, b] }), 200);

    expectStatus(await admin.agent.patch(`/api/admin/vacancies/${v.id}`).send({ images: [b] }), 200);
    await flushImageCleanups();
    for (const f of [a.url, a.url.replace('.webp', '-480.webp'), a.url.replace('.webp', '-960.webp')]) expect(fs.existsSync(fileOf(f))).toBe(false);
    expect(fs.existsSync(fileOf(b.url))).toBe(true);

    // Staff reused the photo as a blog cover: deleting the vacancy keeps the file.
    await prisma.post.create({ data: { slug: 'reuse', cover: b.url, title: l10n('T'), excerpt: l10n('E'), body: l10n('B') } });
    expectStatus(await admin.agent.delete(`/api/admin/vacancies/${v.id}`), 200);
    await flushImageCleanups();
    expect(fs.existsSync(fileOf(b.url))).toBe(true);
    await prisma.post.deleteMany();

    // Employer draft deleted → its photos go.
    const co = await asCompany();
    const c = (await co.agent.post('/api/company/vacancies/images').attach('file', await photo(), 'c.jpg')).body;
    const draft = await createVacancy({ companyId: co.company.id, status: 'DRAFT', images: [{ url: c.url }] });
    expectStatus(await co.agent.delete(`/api/company/vacancies/${draft.id}`), 200);
    await flushImageCleanups();
    expect(fs.existsSync(fileOf(c.url))).toBe(false);
  });
});

describe('nightly orphan sweep', () => {
  const OLD = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const hex = (n: number, len: number) => n.toString(16).padStart(len, '0');
  const write = (rel: string, old = true) => {
    const file = path.join(PUBLIC, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
    if (old) fs.utimesSync(file, OLD, OLD);
    return file;
  };

  it('is registered, dry-runs first, then deletes only old unreferenced files the pipeline wrote, capped per run', async () => {
    expect(registeredJobs()).toContain('public-uploads-orphans');
    await prisma.setting.deleteMany({ where: { key: ORPHAN_SETTING_KEY } });
    const stamp = 1_700_000_000_000 + Math.floor(Math.random() * 1e9);
    const orphan = write(`${stamp}-${hex(1, 24)}.webp`);
    const orphanVideo = write(`${stamp}-${hex(2, 24)}.mp4`);
    const referenced = write(`${stamp}-${hex(3, 24)}.jpg`);
    const fresh = write(`${stamp}-${hex(4, 24)}.webp`, false);
    const foreign = write(`keep-me-${stamp}.webp`);
    const brand = write(`brand/${stamp}-${hex(5, 24)}.webp`);
    const vacId = `${hex(stamp, 24)}${hex(6, 8)}`;
    const vacMain = write(`vacancies/${vacId}.webp`);
    const vacVariant = write(`vacancies/${vacId}-480.webp`);
    const keptVacId = `${hex(stamp, 24)}${hex(7, 8)}`;
    const keptVacVariant = write(`vacancies/${keptVacId}-960.webp`);
    const logoOrphan = write(`logos/${hex(stamp, 24)}${hex(8, 8)}.webp`);

    // References: a free-form setting (JSON) and a vacancy (variant kept with its main file).
    await prisma.setting.create({ data: { key: `test.hero.${stamp}`, value: { image: `https://triad-vision.de/uploads/${path.basename(referenced)}?v=2` } } });
    await createVacancy({ images: [{ url: `/uploads/vacancies/${keptVacId}.webp` }] });

    const dry = await runOrphanSweep();
    expect(dry.dryRun).toBe(true);
    expect(dry.deleted).toBe(0);
    expect(fs.existsSync(orphan)).toBe(true);
    expect(await prisma.auditLog.findFirst({ where: { action: 'UPLOADS_ORPHANS_DRY_RUN' } })).not.toBeNull();

    // Cap: one file per run.
    const capped = await sweepOrphanUploads({ dryRun: false, maxDelete: 1 });
    expect(capped.deleted).toBe(1);

    const real = await runOrphanSweep();
    expect(real.dryRun).toBe(false);
    for (const f of [orphan, orphanVideo, vacMain, vacVariant, logoOrphan]) expect(fs.existsSync(f), f).toBe(false);
    for (const f of [referenced, fresh, foreign, brand, keptVacVariant]) expect(fs.existsSync(f), f).toBe(true);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'UPLOADS_ORPHANS_DELETED' }, orderBy: { createdAt: 'desc' } });
    expect((audit?.details as { deleted: number }).deleted).toBeGreaterThanOrEqual(4);
    const state = await prisma.setting.findUniqueOrThrow({ where: { key: ORPHAN_SETTING_KEY } });
    expect(JSON.stringify(state.value)).not.toContain('/uploads/'); // the state never keeps a file alive

    for (const f of [referenced, fresh, foreign, brand, keptVacVariant]) fs.rmSync(f, { force: true });
  });
});
