import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { ADMIN_INBOX } from '../helpers/testEnv';
import { makePdf, PNG_BUFFER } from '../helpers/files';
import { staffNotifications } from '../helpers/notify';
import { setJobsFetch } from '../../src/lib/germanyJobs/common.js';
import { resetProviders } from '../../src/lib/germanyJobs/providers.js';
import { cvPath } from '../../src/lib/germanyJobs/apply.js';
import { anonymizeInquiries } from '../../src/lib/privacy/inquiries.js';

/**
 * Almaniya iş bazası (/api/germany-jobs): search over the job providers with a fake network (no real API is ever
 * called), and "apply via Triad Vision" for an external listing (validation, CV checks, stored lead, notices).
 */

const ENV_KEYS = ['ARBEITNOW_ENABLED', 'CAREERJET_API_KEY', 'JOOBLE_API_KEY', 'JOOBLE_ENABLED', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'ADZUNA_ENABLED'];
const saved: Record<string, string | undefined> = {};

const arbeitnowJob = (slug: string, o: Record<string, unknown> = {}) => ({
  slug,
  company_name: 'Muster GmbH',
  title: 'Koch (m/w/d)',
  description: '<p>Wir suchen <strong>einen Koch</strong> &amp; Team.</p><script>alert(1)</script>',
  remote: false,
  url: `https://www.arbeitnow.com/jobs/companies/muster/${slug}`,
  tags: ['Gastronomie'],
  job_types: ['Full Time'],
  location: 'Berlin',
  created_at: 1_763_000_000,
  ...o,
});

const FEED = [
  arbeitnowJob('koch-berlin'),
  arbeitnowJob('dev-remote', { title: 'Senior Developer', tags: ['IT'], remote: true, location: 'München', company_name: 'Tech AG', job_types: ['Part Time'], created_at: 1_763_100_000 }),
  arbeitnowJob('azubi-koch', { title: 'Ausbildung zum Koch 2026', location: 'Hamburg', company_name: 'Hotel Nord' }),
];

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let failArbeitnow = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });
  if (url.startsWith('https://www.arbeitnow.com/api/job-board-api')) {
    if (failArbeitnow) return json({ message: 'down' }, 500);
    if (url.includes('visa_sponsorship=true')) return json({ data: [FEED[1]], links: { next: null }, meta: {} });
    return json({ data: FEED, links: { next: null }, meta: { current_page: 1, per_page: 300 } });
  }
  if (url.startsWith('https://search.api.careerjet.net/v4/query')) {
    return json({
      type: 'JOBS',
      hits: 2,
      pages: 1,
      jobs: [
        // same listing as the Arbeitnow one → de-duplicated
        { title: 'Koch (m/w/d)', company: 'Muster GmbH', locations: 'Berlin', date: '2026-11-10T10:00:00Z', description: 'Koch gesucht', url: 'https://jobviewtrack.com/abc', salary_min: 2800, salary_max: 3200, salary_type: 'M' },
        { title: 'Koch Frühschicht', company: 'Kantine X', locations: 'Berlin', date: '2026-11-12T10:00:00Z', description: 'Früh', url: 'https://jobviewtrack.com/def' },
      ],
    });
  }
  if (url.startsWith('https://jooble.org/api/')) return json({ totalCount: 1, jobs: [{ id: 77, title: 'Koch Spätschicht', company: 'Bistro', location: 'Berlin', snippet: 'Spät', salary: '', link: 'https://de.jooble.org/desc/77', updated: '2026-11-11T00:00:00Z', type: 'Vollzeit' }] });
  if (url.startsWith('https://api.adzuna.com/')) return json({ count: 1, results: [{ id: 5, title: 'Koch Adzuna', redirect_url: 'https://www.adzuna.de/land/ad/5', company: { display_name: 'A' }, location: { display_name: 'Berlin' } }] });
  return json({}, 404);
}) as typeof fetch;

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  calls = [];
  failArbeitnow = false;
  resetProviders();
  setJobsFetch(fakeFetch);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  setJobsFetch(null);
  resetProviders();
});

describe('GET /api/germany-jobs/search', () => {
  it('is disabled (404) when every provider is off, and /config says so', async () => {
    process.env.ARBEITNOW_ENABLED = '0';
    const cfg = await anon().get('/api/germany-jobs/config');
    expect(cfg.body).toEqual({ search: false, sources: [] });
    const res = await anon().get('/api/germany-jobs/search?q=Koch');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('FEATURE_DISABLED');
    expect(calls).toHaveLength(0);
  });

  it('Arbeitnow (default): one feed fetch, local filtering, sanitized snippet, attribution, no refetch per search', async () => {
    const cfg = await anon().get('/api/germany-jobs/config');
    expect(cfg.body.search).toBe(true);
    expect(cfg.body.sources.map((s: { id: string }) => s.id)).toEqual(['arbeitnow']);

    const res = await anon().get('/api/germany-jobs/search?q=koch&where=berlin');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(res.body.items.map((j: { id: string }) => j.id)).toEqual(['arbeitnow:koch-berlin']);
    const job = res.body.items[0];
    expect(job).toMatchObject({ source: 'arbeitnow', company: 'Muster GmbH', location: 'Berlin', contractTime: 'full_time', url: FEED[0].url });
    expect(job.snippet).toContain('Wir suchen einen Koch & Team.');
    expect(job.snippet).not.toMatch(/<|alert/);
    expect(res.body.sources).toEqual([{ id: 'arbeitnow', name: 'Arbeitnow', url: 'https://www.arbeitnow.com', ok: true, total: 1 }]);
    // polite client: identifies itself
    const first = calls[0];
    expect((first.init?.headers as Record<string, string>)['User-Agent']).toMatch(/TriadVision/);
    const feedCalls = calls.length;

    // Ausbildung, remote, visa sponsorship, working time: all from the same feed, no new upstream call.
    const aus = await anon().get('/api/germany-jobs/search?type=ausbildung');
    expect(aus.body.items.map((j: { id: string }) => j.id)).toEqual(['arbeitnow:azubi-koch']);
    const remote = await anon().get('/api/germany-jobs/search?remote=1');
    expect(remote.body.items.map((j: { id: string }) => j.id)).toEqual(['arbeitnow:dev-remote']);
    const visa = await anon().get('/api/germany-jobs/search?visa=1');
    expect(visa.body.items.map((j: { id: string }) => j.id)).toEqual(['arbeitnow:dev-remote']);
    const part = await anon().get('/api/germany-jobs/search?time=part');
    expect(part.body.items.map((j: { id: string }) => j.id)).toEqual(['arbeitnow:dev-remote']);
    const umlaut = await anon().get('/api/germany-jobs/search?where=Muenchen');
    expect(umlaut.body.items).toHaveLength(1);
    expect(calls.length).toBe(feedCalls);
  });

  it('merges enabled providers, removes duplicates, keeps visitor data out of storage; Jooble / Adzuna need their switch', async () => {
    process.env.CAREERJET_API_KEY = 'cj-key';
    process.env.JOOBLE_API_KEY = 'jo-key'; // without JOOBLE_ENABLED=1: stays off
    process.env.ADZUNA_APP_ID = 'id';
    process.env.ADZUNA_APP_KEY = 'key'; // without ADZUNA_ENABLED=1: stays off
    const res = await anon().get('/api/germany-jobs/search?q=koch&where=Berlin').set('User-Agent', 'TestBrowser/1.0');
    expect(res.status).toBe(200);
    expect(res.body.sources.map((s: { id: string }) => s.id)).toEqual(['arbeitnow', 'careerjet']);
    const titles = res.body.items.map((j: { title: string; source: string }) => `${j.source}:${j.title}`);
    expect(titles).toContain('arbeitnow:Koch (m/w/d)');
    expect(titles).toContain('careerjet:Koch Frühschicht');
    expect(titles.filter((x: string) => x.endsWith('Koch (m/w/d)'))).toHaveLength(1); // duplicate dropped
    expect(calls.some((c) => c.url.includes('jooble') || c.url.includes('adzuna'))).toBe(false);
    const cj = calls.find((c) => c.url.startsWith('https://search.api.careerjet.net'))!;
    const u = new URL(cj.url);
    expect(u.searchParams.get('locale_code')).toBe('de_DE');
    expect(u.searchParams.get('user_agent')).toBe('TestBrowser/1.0');
    expect(u.searchParams.get('user_ip')).toBeTruthy();
    expect((cj.init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('cj-key:').toString('base64')}`);
    const fried = res.body.items.find((j: { title: string }) => j.title === 'Koch Frühschicht');
    expect(fried.url).toBe('https://jobviewtrack.com/def');

    // Same query again: Careerjet answered from its 30-minute cache.
    const before = calls.filter((c) => c.url.includes('careerjet')).length;
    await anon().get('/api/germany-jobs/search?q=koch&where=Berlin');
    expect(calls.filter((c) => c.url.includes('careerjet')).length).toBe(before);

    process.env.JOOBLE_ENABLED = '1';
    process.env.ADZUNA_ENABLED = '1';
    const all = await anon().get('/api/germany-jobs/search?q=koch&where=Berlin&page=1&sort=date');
    expect(all.body.sources.map((s: { id: string }) => s.id)).toEqual(['arbeitnow', 'careerjet', 'jooble', 'adzuna']);
    const jo = calls.find((c) => c.url.startsWith('https://jooble.org/api/'))!;
    expect(jo.init?.method).toBe('POST');
    expect(JSON.parse(String(jo.init?.body))).toMatchObject({ keywords: 'koch', location: 'Berlin', radius: '26' });
    const adz = calls.find((c) => c.url.startsWith('https://api.adzuna.com/'))!;
    expect(adz.url).toContain('/jobs/de/search/1?');
    // The app key never reaches the browser.
    expect(JSON.stringify(all.body)).not.toContain('app_key');
  });

  it('a failing provider does not fail the search; all failing → 502', async () => {
    process.env.CAREERJET_API_KEY = 'cj-key';
    failArbeitnow = true;
    const res = await anon().get('/api/germany-jobs/search?q=koch');
    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'arbeitnow', ok: false }), expect.objectContaining({ id: 'careerjet', ok: true })]));

    delete process.env.CAREERJET_API_KEY;
    resetProviders();
    const down = await anon().get('/api/germany-jobs/search?q=koch');
    expect(down.status).toBe(502);

    const { agent } = await asAdmin();
    const status = await agent.get('/api/admin/germany-jobs/status');
    expect(status.status).toBe(200);
    const an = status.body.providers.find((p: { id: string }) => p.id === 'arbeitnow');
    expect(an).toMatchObject({ enabled: true });
    expect(an.lastError).toMatch(/HTTP 500/);
    expect(status.body.providers.find((p: { id: string }) => p.id === 'jooble')).toMatchObject({ enabled: false, configured: false });
  });

  it('validates the query', async () => {
    expect((await anon().get('/api/germany-jobs/search?radius=33')).status).toBe(400);
    expect((await anon().get('/api/germany-jobs/search?type=praktikum')).status).toBe(400);
  });
});

const fields = (o: Record<string, string> = {}) => ({
  provider: 'arbeitnow',
  externalId: 'arbeitnow:koch-berlin',
  listingUrl: 'https://www.arbeitnow.com/jobs/companies/muster/koch-berlin',
  listingTitle: 'Koch (m/w/d)',
  listingCompany: 'Muster GmbH',
  listingLocation: 'Berlin',
  jobType: 'job',
  name: 'Aysel Məmmədova',
  email: 'Aysel@example.com',
  phone: '050 123 45 67',
  germanLevel: 'B1',
  profession: 'Aşpaz',
  experienceYears: '4',
  message: 'Hazıram.',
  consent: 'true',
  lng: 'de',
  ...o,
});

const post = (f: Record<string, string>, file?: { data: Buffer; name: string; type: string }, agent: { post: (url: string) => ReturnType<ReturnType<typeof anon>['post']> } = anon()) => {
  let r = agent.post('/api/germany-jobs/apply');
  for (const [k, v] of Object.entries(f)) r = r.field(k, v);
  if (file) r = r.attach('cv', file.data, { filename: file.name, contentType: file.type });
  return r;
};

describe('POST /api/germany-jobs/apply', () => {
  it('validates fields, consent, phone and the CV type / content', async () => {
    expect((await post(fields({ listingUrl: 'javascript:alert(1)' }))).status).toBe(400);
    expect((await post(fields({ consent: '' }))).status).toBe(400);
    const phone = await post(fields({ phone: '12' }));
    expect(phone.status).toBe(400);
    expect(phone.body.error).toBe('INVALID_PHONE');
    const png = await post(fields(), { data: PNG_BUFFER, name: 'cv.png', type: 'image/png' });
    expect(png.status).toBe(400);
    expect(png.body.error).toBe('UNSUPPORTED_FILE_TYPE');
    const fake = await post(fields(), { data: Buffer.from('not a pdf at all'), name: 'cv.pdf', type: 'application/pdf' });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('FILE_CONTENT_MISMATCH');
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it('stores the lead with listing + CV, notifies staff, confirms to the applicant; staff see it and download the CV', async () => {
    const admin = await asAdmin();
    const pdf = await makePdf('Lebenslauf');
    const res = await post(fields(), { data: pdf, name: 'Lebenslauf Aysel.pdf', type: 'application/pdf' });
    expect(res.status).toBe(201);
    const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id }, include: { externalJob: true } });
    expect(inquiry).toMatchObject({ kind: 'contact', email: 'aysel@example.com', phone: '+994501234567', locale: 'de', source: 'external-job:arbeitnow:arbeitnow.com', convertedUserId: null });
    expect(inquiry.message).toContain('https://www.arbeitnow.com/jobs/companies/muster/koch-berlin');
    expect(inquiry.externalJob).toMatchObject({ provider: 'arbeitnow', listingTitle: 'Koch (m/w/d)', germanLevel: 'B1', profession: 'Aşpaz', experienceYears: 4, cvOriginalName: 'Lebenslauf Aysel.pdf', cvMime: 'application/pdf' });
    expect(fs.existsSync(cvPath(inquiry.externalJob!.cvStoredName!))).toBe(true);

    const staff = await staffNotifications(admin.user.id);
    expect(staff.some((n) => n.title.includes('Aysel') && n.link === `/admin/inquiries?open=${inquiry.id}`)).toBe(true);
    await emailsTo(ADMIN_INBOX);
    const mails = await emailsTo('aysel@example.com');
    expect(mails[0].subject).toBe('Triad Vision · Ihre Bewerbung ist eingegangen');

    const list = await admin.agent.get('/api/admin/inquiries?source=external-job');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].externalJob).toMatchObject({ listingUrl: inquiry.externalJob!.listingUrl, cvOriginalName: 'Lebenslauf Aysel.pdf' });
    expect(list.body.items[0].externalJob.cvStoredName).toBeUndefined();
    const cv = await admin.agent.get(`/api/admin/germany-jobs/applications/${inquiry.id}/cv`);
    expect(cv.status).toBe(200);
    expect(cv.headers['content-type']).toContain('application/pdf');

    // GDPR anonymisation removes the candidate details and the CV file.
    await anonymizeInquiries([inquiry.id]);
    const after = await prisma.externalJobApplication.findUniqueOrThrow({ where: { inquiryId: inquiry.id } });
    expect(after).toMatchObject({ cvStoredName: null, profession: null, germanLevel: null });
    expect(fs.existsSync(cvPath(inquiry.externalJob!.cvStoredName!))).toBe(false);
  });

  it('a signed-in client: lead attached to the account; pasted links of any site; honeypot stores nothing', async () => {
    const client = await asClient();
    const res = await post(fields({ provider: 'link', externalId: '', listingUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1208446997-S', lng: 'uk' }), undefined, client.agent);
    expect(res.status).toBe(201);
    const q = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id }, include: { externalJob: true } });
    expect(q.convertedUserId).toBe(client.user.id);
    expect(q.locale).toBe('ru');
    expect(q.source).toBe('external-job:link:arbeitsagentur.de');
    expect(q.externalJob).toMatchObject({ userId: client.user.id, provider: 'link', cvStoredName: null });
    const mails = await emailsTo('aysel@example.com');
    expect(mails[0].subject).toBe('Triad Vision · Вашу заявку отримано');

    const bot = await post(fields({ website: 'http://spam' }));
    expect(bot.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(1);
  });
});
