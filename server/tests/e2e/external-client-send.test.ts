import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { applyInput, createExternalApplication } from '../../src/lib/germanyJobs/apply.js';
import { processExternalApplication, runExternalAutoSend } from '../../src/lib/germanyJobs/autoSend.js';
import { setAutoSendSettings } from '../../src/lib/germanyJobs/autoSettings.js';
import { listingHash, runEmployerDiscovery, type PageFetcher } from '../../src/lib/germanyJobs/discovery/index.js';
import type { SafeResponse } from '../../src/lib/net/safeFetch.js';

/**
 * MIXED mode (lib/germanyJobs/autoSend.ts + lib/germanyJobs/discovery): the employer address found on the page is
 * used for the automatic sending; without one the client gets the package (ownership-checked downloads), confirms
 * "Göndərdim" and is reminded once. The network is replaced by an injected page fetcher.
 */

const TRACK = 'https://jobviewtrack.com/de-de/job/abc123';
const PAGE = 'https://www.nord-logistik.de/stellen/berufskraftfahrer';

const html = (url: string, body: string, status = 200): SafeResponse => ({ url, status, contentType: 'text/html; charset=utf-8', body, truncated: false, hops: [url] });

/** A tracking link that "redirects" to the employer page (the redirect itself is tested in the unit tests). */
const fetcherFor = (pages: Record<string, SafeResponse>) => {
  const calls: string[] = [];
  const fetchPage: PageFetcher = async (u) => {
    calls.push(u);
    return pages[u] ?? html(u, '', 404);
  };
  return { fetchPage, calls };
};

const fields = (o: Record<string, string> = {}) => ({
  provider: 'link',
  listingUrl: TRACK,
  listingTitle: 'Berufskraftfahrer CE (m/w/d)',
  listingCompany: 'Nord Logistik GmbH',
  listingLocation: 'Hamburg',
  jobType: 'job',
  name: 'Əli Məmmədov',
  email: 'ali@example.com',
  phone: '050 123 45 67',
  germanLevel: 'B1',
  profession: 'Kraftfahrer',
  experienceYears: '6',
  message: '',
  consent: 'true',
  forwardConsent: 'true',
  lng: 'az',
  ...o,
});

const readyClient = async (email = 'ali@example.com') => {
  const client = await asClient({ email, firstName: 'Əli', lastName: 'Məmmədov', phone: '+994501234567' });
  await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C01234567', germanLevel: 'B1', profession: 'Berufskraftfahrer' } });
  await client.agent.put('/api/cv').send({ data: { headline: 'Berufskraftfahrer', experience: [{ title: 'Kraftfahrer', employer: 'Azərsun', from: '2019-01', to: null }], drivingLicences: ['CE'] } }).expect(200);
  await client.agent.post('/api/cv/lebenslauf').send({}).expect(201);
  return client;
};

const seed = async (o: Record<string, string>, userId: string | null) => {
  const q = await createExternalApplication(applyInput.parse(fields(o)), { phone: '+994501234567', lng: 'az', cv: null, userId, partnerId: null, accountLabel: null });
  const app = await prisma.externalJobApplication.findUniqueOrThrow({ where: { inquiryId: q.id } });
  return { inquiryId: q.id, id: app.id, state: await processExternalApplication(app.id) };
};

const appOf = (id: string) => prisma.externalJobApplication.findUniqueOrThrow({ where: { id } });

describe('employer e-mail discovery', () => {
  it('finds the address on the employer page, sends in our name, caches the listing, staff see the evidence', async () => {
    const client = await readyClient();
    const r = await seed({}, client.user.id);
    expect(r.state).toBe('SEARCHING');
    const f = fetcherFor({ [TRACK]: html(PAGE, '<h1>Berufskraftfahrer</h1><p>Ihre Bewerbung richten Sie bitte an bewerbung [at] nord-logistik [dot] de</p><p>datenschutz@nord-logistik.de</p>') });
    const run = await runEmployerDiscovery({ fetchPage: f.fetchPage });
    expect(run).toMatchObject({ checked: 1, found: 1 });
    const app = await appOf(r.id);
    expect(app).toMatchObject({
      employerEmail: 'bewerbung@nord-logistik.de',
      employerEmailSource: 'DISCOVERED',
      employerPageUrl: PAGE,
      employerEmailEvidenceUrl: PAGE,
      discoveryState: 'FOUND',
      autoState: 'SENT',
      autoSentMode: 'AUTO',
      status: 'FORWARDED',
    });
    expect(app.employerEmailEvidence).toContain('Bewerbung');
    expect(await prisma.emailLog.count({ where: { to: 'bewerbung@nord-logistik.de' } })).toBe(1);
    expect(await prisma.employerEmailDiscovery.findUniqueOrThrow({ where: { urlHash: listingHash(TRACK) } })).toMatchObject({ outcome: 'FOUND', email: 'bewerbung@nord-logistik.de' });

    const staff = await asStaff();
    const v = await staff.agent.get(`/api/admin/external-applications/${r.inquiryId}`).expect(200);
    expect(v.body.auto).toMatchObject({ employerEmailSource: 'DISCOVERED', employerEmailEvidenceUrl: PAGE, discoveryState: 'FOUND' });

    // Another client, same listing: answered from the cache (no fetch); staff may clear the address before it goes out.
    await setAutoSendSettings({ enabled: false });
    const b = await readyClient('b@example.com');
    const second = await seed({ email: 'b@example.com' }, b.user.id);
    expect(second.state).toBe('SEARCHING');
    const g = fetcherFor({});
    await runEmployerDiscovery({ fetchPage: g.fetchPage });
    expect(g.calls).toEqual([]);
    expect(await appOf(second.id)).toMatchObject({ employerEmail: 'bewerbung@nord-logistik.de', autoState: 'QUEUED', autoReason: 'DISABLED' });
    const cleared = await staff.agent.put(`/api/admin/external-applications/${second.inquiryId}/auto/employer-email`).send({ email: null }).expect(200);
    expect(cleared.body.auto).toMatchObject({ employerEmail: null, employerEmailSource: null, employerEmailEvidence: null });
  });

  it('switched off: waiting applications go to the client without fetching', async () => {
    const client = await readyClient();
    const r = await seed({}, client.user.id);
    expect(r.state).toBe('SEARCHING');
    await setAutoSendSettings({ discovery: false });
    const f = fetcherFor({});
    const run = await runEmployerDiscovery({ fetchPage: f.fetchPage });
    expect(run.skipped).toBe(1);
    expect(f.calls).toEqual([]);
    expect(await appOf(r.id)).toMatchObject({ autoState: 'CLIENT_SEND', discoveryState: 'SKIPPED' });
  });
});

describe('the client sends it themselves', () => {
  it('package downloads (own rows only), direct employer link, "Göndərdim" → FORWARDED (CLIENT)', async () => {
    const client = await readyClient();
    const r = await seed({}, client.user.id);
    const f = fetcherFor({ [TRACK]: html(PAGE, '<p>Jetzt online bewerben</p>') });
    await runEmployerDiscovery({ fetchPage: f.fetchPage });
    const app = await appOf(r.id);
    expect(app).toMatchObject({ autoState: 'CLIENT_SEND', discoveryState: 'NOT_FOUND', employerPageUrl: PAGE, status: 'SUBMITTED' });
    expect(app.clientSendAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'EXTERNAL_APPLICATION_CLIENT_SEND' } })).toBe(1);

    const mine = await client.agent.get('/api/external-applications').expect(200);
    const cs = mine.body.items[0].auto.clientSend;
    expect(cs).toMatchObject({ pageUrl: PAGE, direct: true, employerEmail: null, subject: 'Bewerbung als Berufskraftfahrer CE', hasCv: true });
    expect(cs.letter).toContain('Sehr geehrte');
    expect(cs.emailText).toContain(PAGE);

    const base = `/api/external-applications/${app.id}`;
    const pdf = await client.agent.get(`${base}/package/cover-letter.pdf`).buffer(true).parse(binaryParser).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const cv = await client.agent.get(`${base}/package/cv`).buffer(true).parse(binaryParser).expect(200);
    expect((cv.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const zipRes = await client.agent.get(`${base}/package.zip`).buffer(true).parse(binaryParser).expect(200);
    const zip = await JSZip.loadAsync(zipRes.body as Buffer);
    expect(Object.keys(zip.files)).toHaveLength(2);

    // Someone else's application: 404; staff are not clients: 403.
    const other = await asClient({ email: 'other@example.com' });
    for (const p of ['/package/cover-letter.pdf', '/package/cv', '/package.zip']) expect((await other.agent.get(`${base}${p}`)).status).toBe(404);
    expect((await other.agent.post(`${base}/sent`)).status).toBe(404);
    expect((await (await asStaff()).agent.get(`${base}/package.zip`)).status).toBe(403);

    await client.agent.post(`${base}/sent`).expect(200);
    const sent = await prisma.externalJobApplication.findUniqueOrThrow({ where: { id: app.id }, include: { events: true } });
    expect(sent).toMatchObject({ status: 'FORWARDED', autoState: 'SENT', autoSentMode: 'CLIENT' });
    expect(sent.events.map((e) => e.status)).toEqual(['FORWARDED']);
    expect((await client.agent.post(`${base}/sent`)).status).toBe(409);
    expect(await prisma.emailLog.count({ where: { to: { endsWith: '@nord-logistik.de' } } })).toBe(0); // nothing in our name

    const staff = await asStaff();
    const v = await staff.agent.get(`/api/admin/external-applications/${r.inquiryId}`).expect(200);
    expect(v.body.auto).toMatchObject({ state: 'SENT', sentMode: 'CLIENT' });
  });

  it('one reminder after three days, never a second one', async () => {
    const client = await readyClient();
    const r = await seed({}, client.user.id);
    await runEmployerDiscovery({ fetchPage: fetcherFor({}).fetchPage });
    expect((await appOf(r.id)).autoState).toBe('CLIENT_SEND');
    const day = 24 * 60 * 60 * 1000;
    const count = () => prisma.notification.count({ where: { userId: client.user.id, type: 'EXTERNAL_APPLICATION_CLIENT_REMIND' } });
    expect((await runExternalAutoSend(new Date(Date.now() + 2 * day))).reminded).toBe(0);
    expect(await count()).toBe(0);
    expect((await runExternalAutoSend(new Date(Date.now() + 4 * day))).reminded).toBe(1);
    expect((await runExternalAutoSend(new Date(Date.now() + 6 * day))).reminded).toBe(0);
    expect(await count()).toBe(1);
    expect((await appOf(r.id)).clientRemindedAt).not.toBeNull();
  });
});
