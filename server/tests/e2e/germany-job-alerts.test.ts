import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asAdmin, asClient, asSuperAdmin } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { setJobsFetch } from '../../src/lib/germanyJobs/common.js';
import { resetProviders } from '../../src/lib/germanyJobs/providers.js';
import { refreshArbeitnow } from '../../src/lib/germanyJobs/arbeitnow.js';
import { ALERT_BUDGET_KEY } from '../../src/lib/germanyJobs/careerjet.js';
import { alertPrefsSchema, alertToken, createPublicAlert, purgeGermanyJobAlerts, runGermanyJobAlerts } from '../../src/lib/germanyJobs/alerts.js';
import { config } from '../../src/config.js';

/**
 * Germany job search: saved jobs (signed-in clients, sync of the browser list), job alerts (double opt-in,
 * confirm / manage / unsubscribe, account alerts) and the matching job with fake providers — Arbeitnow from the
 * cached feed only, Careerjet within its alert budget (one call per distinct search), no listing sent twice.
 */

const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; html: string }[] }));
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...orig,
    sendMail: async (to: string, subject: string, html: string, attachments?: unknown) => {
      mail.sent.push({ to, subject, html });
      return orig.sendMail(to, subject, html, attachments as never);
    },
  };
});

const DAY = 24 * 60 * 60 * 1000;
const ENV_KEYS = ['ARBEITNOW_ENABLED', 'CAREERJET_API_KEY', 'CAREERJET_ALERT_CALLS_PER_DAY', 'JOOBLE_API_KEY', 'JOOBLE_ENABLED', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'ADZUNA_ENABLED'];
const saved: Record<string, string | undefined> = {};

const recent = () => Math.floor(Date.now() / 1000) - 3600;
const arbeitnowJob = (slug: string, o: Record<string, unknown> = {}) => ({
  slug,
  company_name: 'Muster GmbH',
  title: 'Koch (m/w/d)',
  description: '<p>Wir suchen einen Koch.</p>',
  remote: false,
  url: `https://www.arbeitnow.com/jobs/companies/muster/${slug}`,
  tags: ['Gastronomie'],
  job_types: ['Full Time'],
  location: 'Berlin',
  created_at: recent(),
  ...o,
});

let FEED: ReturnType<typeof arbeitnowJob>[] = [];
let careerjetCalls: string[] = [];
let feedCalls = 0;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fakeFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.startsWith('https://www.arbeitnow.com/api/job-board-api')) {
    if (!url.includes('visa_sponsorship')) feedCalls++;
    return json({ data: url.includes('visa_sponsorship=true') ? [] : FEED, links: { next: null } });
  }
  if (url.startsWith('https://search.api.careerjet.net/v4/query')) {
    careerjetCalls.push(url);
    const kw = new URL(url).searchParams.get('keywords') ?? '';
    return json({
      type: 'JOBS',
      hits: 1,
      pages: 1,
      jobs: [{ title: `${kw} Careerjet`, company: 'Kantine X', locations: 'Berlin', date: new Date().toISOString(), description: 'x', url: `https://jobviewtrack.com/${encodeURIComponent(kw)}` }],
    });
  }
  return json({}, 404);
}) as typeof fetch;

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  FEED = [arbeitnowJob('koch-berlin'), arbeitnowJob('dev-muenchen', { title: 'Senior Developer', location: 'München', tags: ['IT'] })];
  careerjetCalls = [];
  feedCalls = 0;
  mail.sent = [];
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

const snapshot = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  source: id.split(':')[0],
  title: 'Koch (m/w/d)',
  company: 'Muster GmbH',
  location: 'Berlin',
  url: `https://www.arbeitnow.com/jobs/companies/muster/${id.split(':')[1]}`,
  type: 'job',
  created: new Date().toISOString(),
  ...o,
});

describe('saved Germany jobs', () => {
  it('save / unsave for clients, sync of the browser list, availability, privacy export and account deletion', async () => {
    await anon().get('/api/germany-jobs/saved').expect(401);
    const staff = await asAdmin();
    await staff.agent.get('/api/germany-jobs/saved').expect(403);

    const client = await asClient();
    await client.agent.post('/api/germany-jobs/saved').send(snapshot('arbeitnow:koch-berlin')).expect(201);
    await client.agent.post('/api/germany-jobs/saved').send(snapshot('arbeitnow:koch-berlin')).expect(201); // idempotent
    await client.agent.post('/api/germany-jobs/saved').send({ ...snapshot('arbeitnow:x'), url: 'javascript:alert(1)' }).expect(400);
    expect(await prisma.savedGermanyJob.count({ where: { userId: client.user.id } })).toBe(1);

    // Browser list after sign-in: merged, duplicates and invalid entries skipped.
    const sync = await client.agent
      .post('/api/germany-jobs/saved/sync')
      .send({ items: [snapshot('arbeitnow:koch-berlin'), snapshot('arbeitnow:left-the-feed'), snapshot('careerjet:abc', { url: 'https://jobviewtrack.com/abc' }), { id: 'bad' }] })
      .expect(200);
    expect(sync.body.added).toBe(2);
    expect(sync.body.items).toHaveLength(3);

    // Feed loaded: the Arbeitnow listing that left the feed is "gone"; Careerjet cannot be checked ("unknown").
    await refreshArbeitnow({ force: true });
    const list = await client.agent.get('/api/germany-jobs/saved').expect(200);
    const status = Object.fromEntries(list.body.items.map((i: { id: string; status: string }) => [i.id, i.status]));
    expect(status).toEqual({ 'arbeitnow:koch-berlin': 'available', 'arbeitnow:left-the-feed': 'gone', 'careerjet:abc': 'unknown' });
    expect((await prisma.savedGermanyJob.findFirstOrThrow({ where: { listingId: 'arbeitnow:left-the-feed' } })).goneAt).not.toBeNull();
    // Snapshot only: no description column at all.
    expect(Object.keys(list.body.items[0]).sort()).toEqual(['company', 'created', 'id', 'location', 'savedAt', 'source', 'status', 'title', 'type', 'url']);

    // Other clients do not see it.
    const other = await asClient();
    expect((await other.agent.get('/api/germany-jobs/saved').expect(200)).body.items).toEqual([]);

    await client.agent.delete(`/api/germany-jobs/saved/${encodeURIComponent('careerjet:abc')}`).expect(200);
    expect(await prisma.savedGermanyJob.count({ where: { userId: client.user.id } })).toBe(2);

    // Art. 15 export.
    const exp = await client.agent.get('/api/account/export').expect(200);
    expect(exp.body.savedGermanyJobs.map((s: { listingId: string }) => s.listingId).sort()).toEqual(['arbeitnow:koch-berlin', 'arbeitnow:left-the-feed']);

    // Account deletion removes saved jobs and alerts.
    await client.agent.post('/api/germany-jobs/alerts/mine').send({ q: 'Koch' }).expect(201);
    const sa = await asSuperAdmin();
    await sa.agent.delete(`/api/admin/users/${client.user.id}`).send({ confirmEmail: client.user.email }).expect(200);
    expect(await prisma.savedGermanyJob.count({ where: { userId: client.user.id } })).toBe(0);
    expect(await prisma.germanyJobAlert.count({ where: { email: client.user.email.toLowerCase() } })).toBe(0);
  });
});

describe('Germany job alerts', () => {
  it('double opt-in, digest with apply links to our site, no duplicates, manage, unsubscribe, purge', async () => {
    // Consent is required; the honeypot stores nothing.
    await anon().post('/api/germany-jobs/alerts').send({ email: 'a@test.local', q: 'Koch', where: 'Berlin' }).expect(400);
    await anon().post('/api/germany-jobs/alerts').send({ email: 'bot@test.local', q: 'Koch', consent: true, website: 'x' }).expect(201);
    expect(await prisma.germanyJobAlert.count()).toBe(0);

    const res = await anon().post('/api/germany-jobs/alerts').send({ email: 'Cook@Test.local', q: 'Koch', where: 'Berlin', frequency: 'daily', consent: true, lng: 'de' }).expect(201);
    expect(res.body.confirmed).toBe(false);
    const alert = await prisma.germanyJobAlert.findFirstOrThrow({ where: { email: 'cook@test.local' } });
    expect(alert).toMatchObject({ q: 'Koch', place: 'Berlin', radius: 25, jobType: 'job', frequency: 'daily', locale: 'de', consentVersion: expect.any(String) });
    expect((await emailsTo('cook@test.local'))[0].subject).toBe('Bitte bestätigen Sie Ihren Job-Alarm für Deutschland');
    const confirmMail = mail.sent.find((m) => m.to === 'cook@test.local')!;
    expect(confirmMail.html).toContain(`${config.clientUrl}/job-alert/germany?token=`);

    // Unconfirmed: nothing is sent.
    expect((await runGermanyJobAlerts()).sent).toBe(0);

    const token = alertToken(alert.id);
    const confirmed = await anon().post('/api/germany-jobs/alerts/confirm').send({ token }).expect(200);
    expect(confirmed.body.alert).toMatchObject({ confirmed: true, email: 'c***@test.local', frequency: 'daily', search: { q: 'Koch', where: 'Berlin' } });
    await anon().post('/api/germany-jobs/alerts/confirm').send({ token: 'x'.repeat(43) }).expect(404);

    // First run: the matching feed listing (not the Munich developer), Apply links back to our site.
    mail.sent = [];
    const first = await runGermanyJobAlerts();
    expect(first).toMatchObject({ due: 1, groups: 1, sent: 1 });
    expect(first.careerjet).toEqual({ off: 1 });
    const digest = mail.sent.find((m) => m.to === 'cook@test.local')!;
    expect(digest.subject).toBe('1 neue Stellen zu Ihrer Suche');
    expect(digest.html).toContain('Koch (m/w/d)');
    expect(digest.html).not.toContain('Senior Developer');
    expect(digest.html).toContain('Über Triad Vision bewerben');
    const hrefs = [...digest.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    const applyLinks = hrefs.filter((h) => h.includes('apply='));
    expect(applyLinks.length).toBeGreaterThan(0);
    for (const h of applyLinks) expect(h.startsWith(`${new URL(config.clientUrl).origin}/de/jobs/germany/search?`)).toBe(true);
    expect(hrefs.some((h) => h.startsWith('https://www.arbeitnow.com/jobs/'))).toBe(false); // never straight to the source
    const apply = new URL(applyLinks[0]).searchParams;
    expect(apply.get('apply')).toBe('arbeitnow:koch-berlin');
    expect(apply.get('au')).toBe(FEED[0].url);
    expect(apply.get('q')).toBe('Koch');
    expect(hrefs.some((h) => h.includes('action=unsubscribe'))).toBe(true);
    expect(await prisma.germanyJobAlertSent.count({ where: { alertId: alert.id } })).toBe(1);
    // The feed was fetched once (the alert reused it).
    expect(feedCalls).toBe(1);

    // Not due again within the day; the next day nothing new → no e-mail (no duplicates).
    expect((await runGermanyJobAlerts()).due).toBe(0);
    mail.sent = [];
    const day2 = await runGermanyJobAlerts(new Date(Date.now() + DAY + 60_000));
    expect(day2).toMatchObject({ due: 1, sent: 0 });
    expect(mail.sent).toHaveLength(0);

    // A new listing appears in the feed: only that one is sent.
    // posted after the second run ("tomorrow")
    FEED = [...FEED, arbeitnowJob('koch-kreuzberg', { title: 'Koch Frühschicht', company_name: 'Bistro', created_at: Math.floor((Date.now() + 1.5 * DAY) / 1000) })];
    await refreshArbeitnow({ force: true });
    mail.sent = [];
    const day3 = await runGermanyJobAlerts(new Date(Date.now() + 2 * DAY + 120_000));
    expect(day3.sent).toBe(1);
    expect(mail.sent[0].html).toContain('Koch Frühschicht');
    expect(mail.sent[0].html).not.toContain('Koch (m/w/d)');
    expect(await prisma.germanyJobAlertSent.count({ where: { alertId: alert.id } })).toBe(2);

    // Manage link: masked e-mail, weekly frequency; unsubscribe stops everything; resume works.
    await anon().patch('/api/germany-jobs/alerts/manage').send({ token, frequency: 'weekly' }).expect(200);
    const view = await anon().get('/api/germany-jobs/alerts/manage').query({ token }).expect(200);
    expect(view.body.alert).toMatchObject({ frequency: 'weekly', unsubscribed: false, email: 'c***@test.local' });
    expect((await runGermanyJobAlerts(new Date(Date.now() + 4 * DAY))).due).toBe(0); // weekly: not due yet
    await anon().post('/api/germany-jobs/alerts/unsubscribe').send({ token }).expect(200);
    expect((await runGermanyJobAlerts(new Date(Date.now() + 30 * DAY))).due).toBe(0);
    await anon().post('/api/germany-jobs/alerts/resume').send({ token }).expect(200);
    await anon().post('/api/germany-jobs/alerts/unsubscribe').send({ token }).expect(200);

    // Max alerts per address (created directly: the public form allows 6 per hour per IP).
    for (let i = 0; i < 5; i++) expect((await createPublicAlert({ email: 'many@test.local', prefs: alertPrefsSchema.parse({ q: `Koch ${i}` }) })).ok).toBe(true);
    const sixth = await anon().post('/api/germany-jobs/alerts').send({ email: 'many@test.local', q: 'Koch 6', consent: true });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error).toBe('TOO_MANY_ALERTS');

    // Purge: unconfirmed after 7 days, unsubscribed 30 days later (sent ids cascade).
    expect(await purgeGermanyJobAlerts(new Date(Date.now() + 31 * DAY))).toBe(6);
    expect(await prisma.germanyJobAlertSent.count()).toBe(0);
  });

  it('Careerjet only within the alert budget, one call per distinct search; account alerts follow the e-mail setting', async () => {
    process.env.CAREERJET_API_KEY = 'test-key';
    process.env.CAREERJET_ALERT_CALLS_PER_DAY = '1';
    const a = await asClient();
    const b = await asClient();
    const c = await asClient();
    // a + b share one search, c has another one.
    await a.agent.post('/api/germany-jobs/alerts/mine').send({ q: 'Koch', where: 'Berlin', lng: 'en' }).expect(201);
    await b.agent.post('/api/germany-jobs/alerts/mine').send({ q: ' koch ', where: 'berlin', lng: 'en' }).expect(201);
    await c.agent.post('/api/germany-jobs/alerts/mine').send({ q: 'Developer' }).expect(201);
    const mine = await a.agent.get('/api/germany-jobs/alerts/mine').expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ confirmed: true, search: { q: 'Koch', where: 'Berlin' } });
    // Remote / visa searches never call Careerjet.
    await c.agent.post('/api/germany-jobs/alerts/mine').send({ q: 'Koch', remote: true }).expect(201);

    const run = await runGermanyJobAlerts();
    expect(run.groups).toBe(3);
    expect(careerjetCalls).toHaveLength(1); // budget 1: the most subscribed search got it
    expect(new URL(careerjetCalls[0]).searchParams.get('keywords')).toBe('Koch');
    expect(run.careerjet).toEqual({ called: 1, budget: 1, unsupported: 1 });
    const toA = mail.sent.find((m) => m.to === a.user.email)!;
    const toB = mail.sent.find((m) => m.to === b.user.email)!;
    expect(toA.html).toContain('Koch Careerjet');
    expect(toB.html).toContain('Koch Careerjet');
    expect(toA.html).toContain('via Careerjet');
    const toC = mail.sent.filter((m) => m.to === c.user.email);
    expect(toC.map((m) => m.html).join('')).toContain('Senior Developer'); // Arbeitnow still served from the feed
    expect(toC.map((m) => m.html).join('')).not.toContain('Developer Careerjet');
    const budget = await prisma.setting.findUniqueOrThrow({ where: { key: ALERT_BUDGET_KEY } });
    expect(budget.value).toMatchObject({ used: 1 });

    // Budget used up: a new search later today skips Careerjet (also after a restart: the budget is persisted).
    careerjetCalls = [];
    resetProviders();
    setJobsFetch(fakeFetch);
    await c.agent.post('/api/germany-jobs/alerts/mine').send({ q: 'Elektriker' }).expect(201);
    const later = await runGermanyJobAlerts();
    expect(later).toMatchObject({ due: 1, careerjet: { budget: 1 } });
    expect(careerjetCalls).toHaveLength(0);

    // E-mail notifications off: account alerts are skipped.
    await prisma.user.update({ where: { id: a.user.id }, data: { emailNotifications: false } });
    expect((await runGermanyJobAlerts(new Date(Date.now() + 2 * DAY + 120_000))).due).toBe(4);

    // Staff: counts in Admin → Job channels.
    const admin = await asAdmin();
    const status = await admin.agent.get('/api/admin/germany-jobs/status').expect(200);
    expect(status.body.alerts).toMatchObject({ active: 5, accounts: 5, pending: 0, uniqueSearches: 4, careerjetBudget: { limit: 1 } });

    // Other clients cannot touch an alert; the owner can change and delete it.
    const id = mine.body.items[0].id;
    await c.agent.delete(`/api/germany-jobs/alerts/mine/${id}`).expect(404);
    await a.agent.patch(`/api/germany-jobs/alerts/mine/${id}`).send({ frequency: 'weekly' }).expect(200);
    await a.agent.delete(`/api/germany-jobs/alerts/mine/${id}`).expect(200);

    // Admin privacy tools: export / erase by e-mail.
    const sa = await asSuperAdmin();
    const exp = await sa.agent.get('/api/admin/privacy/inquiries').query({ email: b.user.email }).expect(200);
    expect(exp.body.germanyJobAlerts).toHaveLength(1);
    const erased = await sa.agent.post('/api/admin/privacy/inquiries/erase').send({ email: b.user.email }).expect(200);
    expect(erased.body.germanyJobAlerts).toBe(1);
    expect(await prisma.germanyJobAlert.count({ where: { userId: b.user.id } })).toBe(0);
  });
});
