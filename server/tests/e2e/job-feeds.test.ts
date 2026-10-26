import { beforeEach, describe, expect, it } from 'vitest';
import { SaxesParser } from 'saxes';
import { anon, asAdmin, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import type { Prisma } from '@prisma/client';
import { createCompany, createVacancy as createBaseVacancy } from './vacancies.fixtures';
import { clearFeedCache } from '../../src/lib/jobFeeds/service.js';
import { cdata, clean } from '../../src/lib/jobFeeds/xml.js';
import { open } from '../../src/lib/secretBox.js';

/** Job board feeds (lib/jobFeeds, routes/jobFeeds.ts, routes/admin/jobFeeds.ts). */

interface Node {
  name: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}

/** Strict XML parse (saxes rejects anything not well-formed) into a small tree. */
const parseXml = (xml: string): Node => {
  const parser = new SaxesParser();
  const root: Node = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: Node[] = [root];
  parser.on('error', (e) => {
    throw e;
  });
  parser.on('opentag', (t) => {
    const n: Node = { name: t.name, attrs: t.attributes as Record<string, string>, children: [], text: '' };
    stack[stack.length - 1].children.push(n);
    stack.push(n);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.on('text', (t) => {
    stack[stack.length - 1].text += t;
  });
  parser.on('cdata', (t) => {
    stack[stack.length - 1].text += t;
  });
  parser.write(xml).close();
  return root.children[0];
};
const child = (n: Node, name: string) => n.children.find((c) => c.name === name);
const all = (n: Node, name: string) => n.children.filter((c) => c.name === name);
const textOf = (n: Node, name: string) => child(n, name)?.text.trim() ?? '';

const DAY = 24 * 60 * 60 * 1000;

/** Board-ready vacancy: the shared fixture with a description long enough for the feeds. */
const LONG = (l: string) => `Wir suchen Verstärkung für unser Team (${l}). Feste Touren, moderne Fahrzeuge.`;
const createVacancy = (over: Partial<Prisma.VacancyUncheckedCreateInput> = {}) =>
  createBaseVacancy({ description: { az: LONG('az'), de: LONG('de'), en: LONG('en'), ru: LONG('ru') }, ...over });

const setup = async () => {
  const admin = await asAdmin();
  const overview = await admin.agent.get('/api/admin/job-feeds');
  expect(overview.status).toBe(200);
  const feeds = overview.body.feeds as Record<'indeed' | 'stepstone' | 'generic', string>;
  const token = new URL(feeds.indeed).searchParams.get('token')!;
  return { admin, feeds, token };
};

const distribute = (agent: Agent, vacancyId: string, body: Record<string, unknown>) => agent.put(`/api/admin/job-feeds/vacancies/${vacancyId}`).send(body);

const feed = (channel: string, token?: string) => anon().get(`/feeds/${channel}.xml${token ? `?token=${encodeURIComponent(token)}` : ''}`);

beforeEach(async () => {
  await prisma.jobFeedConfig.deleteMany();
  clearFeedCache();
});

describe('job feeds — token', () => {
  it('requires the secret token and accepts it only after the config exists; rotation invalidates the old one', async () => {
    expect((await feed('indeed', 'x'.repeat(32))).status).toBe(403); // no config yet = closed
    const { admin, token } = await setup();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect((await feed('indeed')).status).toBe(403);
    expect((await feed('indeed', `${token}x`)).status).toBe(403);
    expect((await feed('unknown', token)).status).toBe(404);
    const ok = await feed('indeed', token);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('application/xml');
    expect(ok.headers['cache-control']).toBe('private, max-age=600');
    // Stored encrypted, never in plain text.
    const cfg = await prisma.jobFeedConfig.findUniqueOrThrow({ where: { id: 'default' } });
    expect(cfg.tokenSealed).not.toContain(token);
    expect(open(cfg.tokenSealed)).toBe(token);

    const rotated = await admin.agent.post('/api/admin/job-feeds/rotate-token');
    expect(rotated.status).toBe(200);
    const fresh = new URL(rotated.body.feeds.generic).searchParams.get('token')!;
    expect(fresh).not.toBe(token);
    expect((await feed('generic', token)).status).toBe(403);
    expect((await feed('generic', fresh)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'JOB_FEED_TOKEN_ROTATED' } })).toBe(1);
  });
});

describe('job feeds — content', () => {
  it('lists only live vacancies with the channel switched on and records the channel status', async () => {
    const { admin, token } = await setup();
    const live = await createVacancy({ slug: 'lkw-live' });
    const off = await createVacancy({ slug: 'lkw-not-distributed' });
    const otherChannel = await createVacancy({ slug: 'lkw-stepstone-only' });
    const draft = await createVacancy({ slug: 'lkw-draft', status: 'DRAFT' });
    const expired = await createVacancy({ slug: 'lkw-expired' });
    const future = await createVacancy({ slug: 'lkw-future', publishedAt: new Date(Date.now() + 3 * DAY) });
    for (const v of [live, draft, expired, future]) expect((await distribute(admin.agent, v.id, { channels: ['indeed', 'generic'] })).status).toBe(200);
    await distribute(admin.agent, otherChannel.id, { channels: ['stepstone'] });
    expect(off.id).toBeTruthy();
    // Published once, then it expires.
    let res = await feed('indeed', token);
    expect(res.headers['x-feed-cache']).toBe('MISS');
    expect(all(parseXml(res.text), 'job').map((j) => textOf(j, 'requisitionid')).sort()).toEqual(['lkw-expired', 'lkw-live']);
    await prisma.vacancy.update({ where: { id: expired.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    clearFeedCache();
    res = await feed('indeed', token);
    const doc = parseXml(res.text);
    expect(doc.name).toBe('source');
    expect(all(doc, 'job').map((j) => textOf(j, 'requisitionid'))).toEqual(['lkw-live']);

    const states = await prisma.vacancyChannelState.findMany({ where: { channel: 'indeed' } });
    const by = Object.fromEntries(states.map((s) => [s.vacancyId, s.status]));
    expect(by[live.id]).toBe('PUBLISHED');
    expect(by[expired.id]).toBe('EXPIRED');
    expect(by[draft.id]).toBe('PENDING');
    expect(by[future.id]).toBe('PENDING');
    expect(states.find((s) => s.vacancyId === live.id)!.lastExportAt).toBeTruthy();

    const job = all(doc, 'job')[0];
    expect(textOf(job, 'referencenumber')).toBe(live.id);
    expect(textOf(job, 'country')).toBe('DE');
    expect(textOf(job, 'city')).toBe('Hamburg');
    expect(textOf(job, 'jobtype')).toBe('fulltime');
    expect(textOf(job, 'salary')).toBe('2.800 - 3.400 EUR pro Monat');
    const url = new URL(textOf(job, 'url'));
    expect(url.pathname).toBe('/de/jobs/lkw-live');
    expect(url.searchParams.get('utm_source')).toBe('indeed');
    expect(url.searchParams.get('utm_medium')).toBe('job_feed');
    // Every Indeed element is present in every job, even when blank.
    for (const tag of ['title', 'date', 'referencenumber', 'requisitionid', 'url', 'company', 'city', 'state', 'country', 'email', 'description', 'expirationdate']) {
      expect(child(job, tag), tag).toBeTruthy();
    }

    const generic = parseXml((await feed('generic', token)).text);
    expect(generic.name).toBe('jobs');
    expect(all(generic, 'job').map((j) => textOf(j, 'slug'))).toEqual(['lkw-live']);
    const stepstone = parseXml((await feed('stepstone', token)).text);
    expect(all(stepstone, 'job').map((j) => textOf(j, 'slug'))).toEqual(['lkw-stepstone-only']);
  });

  it('escapes hostile text and stays well-formed (CDATA terminators, markup, control characters)', async () => {
    const { admin, token } = await setup();
    const nasty = 'Fahrer ]]> <script>alert("x")</script> & Co \u0001\u0008 "quotes" \'apos\'';
    const v = await createVacancy({
      slug: 'nasty',
      title: { az: nasty, de: nasty, en: nasty, ru: nasty },
      description: { az: 'x', de: `Beschreibung ]]> mit <b>Tags</b> & Sonderzeichen äöü ß — und Zeilen\n\nZweiter Absatz \u000B`, en: 'x', ru: 'x' },
      requirements: { az: [], de: ['CE ]]>', '<img src=x>'], en: [], ru: [] },
      city: 'Köln & <Umgebung>',
    });
    await distribute(admin.agent, v.id, { channels: ['indeed', 'stepstone', 'generic'], employerLabel: 'Spedition "A&B" ]]>' });
    for (const c of ['indeed', 'stepstone', 'generic']) {
      const res = await feed(c, token);
      expect(res.status).toBe(200);
      expect(() => parseXml(res.text), c).not.toThrow();
      expect(res.text).not.toMatch(/[\u0001\u0008\u000B]/);
      const job = all(parseXml(res.text), 'job')[0];
      expect(textOf(job, 'title')).toBe('Fahrer ]]> <script>alert("x")</script> & Co  "quotes" \'apos\'');
      expect(textOf(job, 'description')).toContain('&lt;b&gt;Tags&lt;/b&gt;'); // description HTML: user text escaped inside it
      expect(textOf(job, 'description')).toContain('äöü ß');
    }
    const indeedJob = all(parseXml((await feed('indeed', token)).text), 'job')[0];
    expect(textOf(indeedJob, 'company')).toBe('Spedition "A&B" ]]>');
    expect(textOf(indeedJob, 'city')).toBe('Köln & <Umgebung>');
    // Helpers on their own.
    expect(cdata('a]]>b')).toBe('<![CDATA[a]]]]><![CDATA[>b]]>');
    expect(clean('a\u0000b￾c\uD800d')).toBe('abcd');
  });

  it('uses German text with fallback, the anonymous employer label and the apply URL override', async () => {
    const { admin, token } = await setup();
    const company = await createCompany({ name: 'Nord Logistik GmbH' });
    const de = await createVacancy({ slug: 'de-text', companyId: company.id, title: { az: 'Sürücü', de: 'Berufskraftfahrer CE', en: 'Truck driver', ru: 'Водитель' }, description: { az: 'az mətn uzun kifayət qədər olmalıdır, otuz simvol', de: 'Deutsche Beschreibung, lang genug für den Feed.', en: 'English description long enough for feeds', ru: 'ru' } });
    const noDe = await createVacancy({ slug: 'no-de', title: { az: 'Aşpaz', de: '', en: 'Cook', ru: 'Повар' }, description: { az: 'az', de: '', en: 'English description, long enough for the feed.', ru: 'ru' } });
    const shown = await createVacancy({ slug: 'shown', companyId: company.id, showCompany: true });
    await distribute(admin.agent, de.id, { channels: ['generic'] });
    await distribute(admin.agent, noDe.id, { channels: ['generic'], applyUrl: 'https://apply.example.com/job?id=7&utm_source=custom' });
    await distribute(admin.agent, shown.id, { channels: ['generic'], language: 'en' });
    const jobs = Object.fromEntries(all(parseXml((await feed('generic', token)).text), 'job').map((j) => [textOf(j, 'slug'), j]));
    expect(textOf(jobs['de-text'], 'title')).toBe('Berufskraftfahrer CE');
    expect(textOf(jobs['de-text'], 'language')).toBe('de');
    // Hidden employer (showCompany false → hideEmployer default true): never the company name.
    const company1 = child(jobs['de-text'], 'company')!;
    expect(company1.attrs.hidden).toBe('true');
    expect(textOf(company1, 'name')).toBe('Triad Vision (für einen Kunden)');
    expect(JSON.stringify(jobs['de-text'])).not.toContain('Nord Logistik');
    // No German text: English fallback.
    expect(textOf(jobs['no-de'], 'title')).toBe('Cook');
    const url = new URL(textOf(jobs['no-de'], 'url'));
    expect(url.host).toBe('apply.example.com');
    expect(url.searchParams.get('utm_source')).toBe('custom'); // existing UTM kept
    expect(url.searchParams.get('utm_medium')).toBe('job_feed');
    expect(url.searchParams.get('id')).toBe('7');
    // English language + shown employer.
    expect(textOf(jobs.shown, 'title')).toBe('LKW-Fahrer en');
    expect(textOf(child(jobs.shown, 'company')!, 'name')).toBe('Nord Logistik GmbH');
    expect(new URL(textOf(jobs.shown, 'url')).pathname).toBe('/en/jobs/shown');
  });

  it('leaves out vacancies missing required fields and reports them as errors', async () => {
    const { admin, token } = await setup();
    const noCity = await createVacancy({ slug: 'no-city', city: null });
    await distribute(admin.agent, noCity.id, { channels: ['indeed', 'generic'] });
    expect(all(parseXml((await feed('indeed', token)).text), 'job')).toHaveLength(0);
    expect(all(parseXml((await feed('generic', token)).text), 'job')).toHaveLength(1); // the generic feed does not need a city
    const state = await prisma.vacancyChannelState.findUniqueOrThrow({ where: { vacancyId_channel: { vacancyId: noCity.id, channel: 'indeed' } } });
    expect(state.status).toBe('ERROR');
    expect(state.error).toContain('CITY_MISSING');
    const overview = await admin.agent.get('/api/admin/job-feeds');
    expect(overview.body.channels.indeed.counts.ERROR).toBe(1);
    expect(overview.body.channels.indeed.enabled).toBe(1);
    expect(overview.body.errors[0]).toMatchObject({ channel: 'indeed', vacancy: { slug: 'no-city' } });
  });

  it('caches each feed for 10 minutes; a distribution change or refresh rebuilds it', async () => {
    const { admin, token } = await setup();
    const v = await createVacancy({ slug: 'cached' });
    await distribute(admin.agent, v.id, { channels: ['generic'] });
    const first = await feed('generic', token);
    expect(first.headers['x-feed-cache']).toBe('MISS');
    // A direct DB change is not visible while the cache holds.
    await prisma.vacancy.update({ where: { id: v.id }, data: { title: { az: 'Neu', de: 'Neuer Titel', en: 'New', ru: 'Новый' } } });
    const second = await feed('generic', token);
    expect(second.headers['x-feed-cache']).toBe('HIT');
    expect(second.text).toBe(first.text);
    // Saving the distribution clears it.
    await distribute(admin.agent, v.id, { channels: ['generic'], postalCode: '20095' });
    const third = await feed('generic', token);
    expect(third.headers['x-feed-cache']).toBe('MISS');
    expect(third.text).toContain('Neuer Titel');
    expect(third.text).toContain('20095');
    expect((await admin.agent.post('/api/admin/job-feeds/refresh')).body.result.generic).toEqual({ items: 1, errors: 0 });
    expect((await feed('generic', token)).headers['x-feed-cache']).toBe('MISS');
  });
});

describe('job feeds — Bundesagentur für Arbeit (HR-BA-XML)', () => {
  it('validates the required fields, exports a well-formed file and keeps the upload off until configured', async () => {
    const { admin } = await setup();
    const incomplete = await createVacancy({ slug: 'ba-incomplete', description: { az: 'kurz', de: 'kurz', en: 'short', ru: 'кратко' } });
    const complete = await createVacancy({ slug: 'ba-complete', description: { az: 'x', de: 'Wir suchen Berufskraftfahrer im Fernverkehr. Moderne Fahrzeuge, feste Touren.', en: 'x', ru: 'x' } });
    await distribute(admin.agent, incomplete.id, { channels: ['ba'] });
    const saved = await distribute(admin.agent, complete.id, { channels: ['ba'], baTitleCode: '7766', postalCode: '20095', occupationCode: '52122', weeklyHours: 40, limited: true, limitedUntil: '2027-12-31' });
    expect(saved.status).toBe(200);
    expect(saved.body.check.ba).toEqual([]);
    expect(saved.body.check.indeed).toEqual([]);
    expect(saved.body.distribution).toMatchObject({ channels: ['ba'], occupationCode: '52122', baTitleCode: '7766' });

    let check = await admin.agent.get('/api/admin/job-feeds/ba/validate');
    expect(check.body.fileErrors).toEqual(['SUPPLIER_ID_MISSING']);
    expect(check.body.included.map((j: { slug: string }) => j.slug)).toEqual(['ba-complete']);
    const err = check.body.errors.find((e: { slug: string }) => e.slug === 'ba-incomplete');
    expect(err.errors).toEqual(expect.arrayContaining(['TITLE_CODE_MISSING', 'POSTAL_CODE_MISSING', 'DESCRIPTION_TOO_SHORT']));

    expect((await admin.agent.put('/api/admin/job-feeds/ba').send({ supplierId: 'P000132700' })).status).toBe(200);
    check = await admin.agent.get('/api/admin/job-feeds/ba/validate');
    expect(check.body.fileErrors).toEqual([]);

    const file = await admin.agent.get('/api/admin/job-feeds/ba.xml');
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toMatch(/attachment; filename="DSP000132700_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.xml"/);
    const doc = parseXml(file.text);
    expect(doc.name).toBe('HRBAXMLJobPositionPosting');
    const header = child(doc, 'Header')!;
    expect(textOf(header, 'SupplierId')).toBe('P000132700');
    expect(textOf(header, 'Amount')).toBe('1');
    expect(textOf(header, 'TypeOfLoad')).toBe('F');
    const posting = child(child(doc, 'Data')!, 'JobPositionPosting')!;
    expect(textOf(posting, 'JobPositionPostingId')).toBe(`P000132700-${complete.id}`);
    const info = child(posting, 'JobPositionInformation')!;
    expect(textOf(child(info, 'JobPositionTitle')!, 'TitleCode')).toBe('7766');
    const desc = child(info, 'JobPositionDescription')!;
    expect(textOf(desc, 'JobPositionTitleDescription')).toBe('LKW-Fahrer de');
    expect(textOf(child(desc, 'Location')!, 'PostalCode')).toBe('20095');
    expect(textOf(child(desc, 'TermLength')!, 'TemporaryOrRegular')).toBe('1');
    expect(textOf(desc, 'HoursPerWeek')).toBe('40');

    const states = Object.fromEntries((await prisma.vacancyChannelState.findMany({ where: { channel: 'ba' } })).map((s) => [s.vacancyId, s]));
    expect(states[complete.id]).toMatchObject({ status: 'PENDING' }); // exported for the manual upload
    expect(states[complete.id].lastExportAt).toBeTruthy();
    expect(states[incomplete.id].status).toBe('ERROR');
    expect(await prisma.auditLog.count({ where: { action: 'JOB_FEED_BA_EXPORTED' } })).toBe(1);

    // Upload: refused while credentials are missing, and nothing is sent.
    expect((await admin.agent.put('/api/admin/job-feeds/ba').send({ uploadEnabled: true })).body.error).toBe('BA_NOT_CONFIGURED');
    const upload = await admin.agent.post('/api/admin/job-feeds/ba/upload');
    expect(upload.body.result).toMatchObject({ ok: false, skipped: 'NOT_CONFIGURED' });
    expect(upload.body.result.missing).toEqual(expect.arrayContaining(['PARTNER_ID', 'CERTIFICATE', 'PASSPHRASE', 'UPLOAD_URL']));
  });

  it('stores the BA certificate and password encrypted, never returns or audits them', async () => {
    const { admin } = await setup();
    const certificate = Buffer.from('fake-p12-'.repeat(40)).toString('base64');
    const passphrase = 'S3cret-Pass!';
    const res = await admin.agent.put('/api/admin/job-feeds/ba').send({ supplierId: 'P1', partnerId: 'P000123', certificate, passphrase, uploadUrl: 'https://hrbaxml.example.invalid/upload' });
    expect(res.status).toBe(200);
    expect(res.body.ba).toMatchObject({ hasCertificate: true, hasPassphrase: true, ready: true, uploadEnabled: false, missing: [] });
    expect(JSON.stringify(res.body)).not.toContain(passphrase);
    expect(JSON.stringify(res.body)).not.toContain(certificate.slice(0, 40));
    const cfg = await prisma.jobFeedConfig.findUniqueOrThrow({ where: { id: 'default' } });
    expect(cfg.baPassSealed).not.toContain(passphrase);
    expect(open(cfg.baPassSealed)).toBe(passphrase);
    expect(open(cfg.baCertSealed)).toBe(certificate);
    const auditRows = await prisma.auditLog.findMany({ where: { action: 'JOB_FEED_BA_SETTINGS_UPDATED' } });
    expect(auditRows).toHaveLength(1);
    expect(JSON.stringify(auditRows)).not.toContain(passphrase);
    expect(auditRows[0].details).toMatchObject({ changed: expect.arrayContaining(['certificate', 'passphrase']) });
    expect(JSON.stringify((await admin.agent.get('/api/admin/job-feeds')).body)).not.toContain(passphrase);
    expect((await admin.agent.put('/api/admin/job-feeds/ba').send({ uploadUrl: 'http://insecure.example' })).status).toBe(400);
    // Disabled: the scheduled run does nothing.
    const { runBaUpload } = await import('../../src/lib/jobFeeds/ba.js');
    expect(await runBaUpload()).toEqual({ ok: false, skipped: 'DISABLED' });
    // Clearing removes the credentials and switches the upload off.
    const cleared = await admin.agent.put('/api/admin/job-feeds/ba').send({ clearCredentials: true });
    expect(cleared.body.ba).toMatchObject({ hasCertificate: false, hasPassphrase: false, ready: false, uploadEnabled: false });
  });
});

describe('job feeds — roles and lookups', () => {
  it('is ADMIN+ only; staff, clients and anonymous users are refused', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/job-feeds')).status).toBe(403);
    expect((await staff.agent.post('/api/admin/job-feeds/rotate-token')).status).toBe(403);
    expect((await anon().get('/api/admin/job-feeds')).status).toBe(401);
    const v = await createVacancy({ slug: 'roles' });
    expect((await distribute(staff.agent, v.id, { channels: ['indeed'] })).status).toBe(403);
    const sup = await asSuperAdmin();
    expect((await sup.agent.get('/api/admin/job-feeds')).status).toBe(200);
    expect((await sup.agent.get(`/api/admin/job-feeds/vacancies/${v.id}`)).status).toBe(200);
    expect((await sup.agent.get('/api/admin/job-feeds/vacancies/nope')).status).toBe(404);
  });

  it('suggests a KldB code, searches the lookup and validates the distribution input', async () => {
    const { admin } = await setup();
    const v = await createVacancy({ slug: 'suggest', profession: 'Schweißer', title: { az: 'Qaynaqçı', de: 'Schweißer MAG', en: 'Welder', ru: 'Сварщик' } });
    const view = await admin.agent.get(`/api/admin/job-feeds/vacancies/${v.id}`);
    expect(view.body.saved).toBe(false);
    expect(view.body.distribution).toMatchObject({ channels: [], language: 'de', hideEmployer: true, occupationCode: '24422' });
    expect(view.body.applyUrls.indeed).toContain('/de/jobs/suggest?utm_source=indeed');
    const search = await admin.agent.get('/api/admin/job-feeds/occupations?q=pflege');
    expect(search.body.items.map((o: { code: string }) => o.code)).toContain('81302');
    expect((await admin.agent.get('/api/admin/job-feeds/occupations?q=521')).body.items[0].code).toMatch(/^521/);
    for (const bad of [{ channels: ['myspace'] }, { channels: ['ba'], postalCode: '123' }, { channels: [], occupationCode: 'abc' }, { channels: [], applyUrl: 'javascript:alert(1)' }, { channels: [], weeklyHours: 99 }]) {
      expect((await distribute(admin.agent, v.id, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    // Switching a channel off removes its status row.
    await distribute(admin.agent, v.id, { channels: ['indeed', 'ba'] });
    expect(await prisma.vacancyChannelState.count({ where: { vacancyId: v.id } })).toBe(2);
    await distribute(admin.agent, v.id, { channels: ['ba'] });
    expect((await prisma.vacancyChannelState.findMany({ where: { vacancyId: v.id } })).map((s) => s.channel)).toEqual(['ba']);
    expect(await prisma.auditLog.count({ where: { action: 'VACANCY_DISTRIBUTION_UPDATED', target: `vacancy:${v.id}` } })).toBe(2);
  });

  it('adds KldB code, postal code and experience to the JobPosting of the public job page', async () => {
    const { admin } = await setup();
    const v = await createVacancy({ slug: 'ld-job', minExperience: 3 });
    await distribute(admin.agent, v.id, { channels: [], occupationCode: '52122', postalCode: '20095' });
    const head = await anon().get('/api/seo/head?path=/de/jobs/ld-job');
    const blocks = [...head.text.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
      const parsed = JSON.parse(m[1]);
      return Array.isArray(parsed) ? parsed : [parsed];
    });
    const posting = blocks.find((b) => b['@type'] === 'JobPosting');
    expect(posting).toMatchObject({
      occupationalCategory: '52122 Berufskraftfahrer/in (Güterverkehr/LKW)',
      experienceRequirements: { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: 36 },
      jobLocation: { address: { postalCode: '20095', addressLocality: 'Hamburg', addressCountry: 'DE' } },
      directApply: true,
    });
    expect(posting.datePosted).toBeTruthy();
    expect(posting.baseSalary).toBeTruthy();
  });
});
