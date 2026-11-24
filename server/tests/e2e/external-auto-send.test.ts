import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { anon, asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { emailsTo, prisma, waitFor } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { auditsSettled } from '../../src/lib/audit.js';
import { applyInput, createExternalApplication } from '../../src/lib/germanyJobs/apply.js';
import { processExternalApplication, runExternalAutoSend } from '../../src/lib/germanyJobs/autoSend.js';
import { nextDayStart, setAutoSendSettings } from '../../src/lib/germanyJobs/autoSettings.js';
import { runEmployerDiscovery } from '../../src/lib/germanyJobs/discovery/index.js';

/** Discovery without network: every page answers with HTML that has no address. */
const noAddressFetcher = async (url: string) => ({ url, status: 200, contentType: 'text/html', body: '<html><body>Stellenanzeige</body></html>', truncated: false, hops: [url] });

/**
 * "Apply via Triad Vision" automatic sending (lib/germanyJobs/autoSend.ts): check → missing-data notice and later
 * re-check, Anschreiben + CV e-mailed to the employer (EmailLog), READY queue without an address, consent, limits,
 * kill switch and staff overrides. No AI anywhere. Tests run without SMTP: mails are logged as CONSOLE.
 */

const EMPLOYER = 'bewerbung@nord-logistik.de';

const fields = (o: Record<string, string> = {}) => ({
  provider: 'link',
  listingUrl: 'https://karriere.nord-logistik.de/jobs/berufskraftfahrer-ce',
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
  message: `Aus der Anzeige: Bewerbungen bitte an ${EMPLOYER}`,
  consent: 'true',
  forwardConsent: 'true',
  lng: 'az',
  ...o,
});

const apply = (f: Record<string, string>, agent?: Agent) => {
  let r = agent ? agent.post('/api/germany-jobs/apply') : anon().post('/api/germany-jobs/apply');
  for (const [k, v] of Object.entries(f)) r = r.field(k, v);
  return r;
};

/** A client whose profile passes every check and who has a saved Lebenslauf. */
const readyClient = async (email = 'ali@example.com') => {
  const client = await asClient({ email, firstName: 'Əli', lastName: 'Məmmədov', phone: '+994501234567' });
  await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C01234567', germanLevel: 'B1', profession: 'Berufskraftfahrer' } });
  await client.agent.put('/api/cv').send({ data: { headline: 'Berufskraftfahrer', experience: [{ title: 'Kraftfahrer', employer: 'Azərsun', from: '2019-01', to: null }], drivingLicences: ['CE'] } }).expect(200);
  await client.agent.post('/api/cv/lebenslauf').send({}).expect(201);
  return client;
};

/** Direct insert + pipeline (the public route allows 10 applications per hour and IP). */
const seed = async (o: Record<string, string>, userId: string | null) => {
  const q = await createExternalApplication(applyInput.parse(fields(o)), { phone: '+994501234567', lng: (o.lng ?? 'az') as 'az', cv: null, userId, partnerId: null, accountLabel: null });
  const app = await prisma.externalJobApplication.findUniqueOrThrow({ where: { inquiryId: q.id } });
  return { inquiryId: q.id, id: app.id, state: await processExternalApplication(app.id) };
};

const appOf = (inquiryId: string) => prisma.externalJobApplication.findUniqueOrThrow({ where: { inquiryId }, include: { events: { orderBy: { createdAt: 'asc' } } } });

describe('automatic sending with a known employer e-mail', () => {
  it('checks, writes the Anschreiben, e-mails Anschreiben + CV, forwards, notifies, audits — and never twice', async () => {
    const client = await readyClient();
    const res = await apply(fields({ attachLebenslauf: 'true' }), client.agent).expect(201);
    const app = await appOf(res.body.id);
    expect(app).toMatchObject({ employerEmail: EMPLOYER, employerEmailSource: 'listing', autoState: 'SENT', autoSentMode: 'AUTO', status: 'FORWARDED', siteLocale: 'az' });
    expect(app.forwardConsentAt).not.toBeNull();
    expect(app.coverLetterBody).toContain('Sehr geehrte');
    expect(app.events.map((e) => e.status)).toEqual(['FORWARDED']);

    const mails = await emailsTo(EMPLOYER);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain('Bewerbung');

    expect(await prisma.consentRecord.count({ where: { userId: client.user.id, type: 'EXTERNAL_JOB_FORWARD', granted: true } })).toBe(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'EXTERNAL_APPLICATION_STATUS' } });
    expect(n.title).toContain('İşəgötürənə göndərildi');
    await auditsSettled();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'EXTERNAL_JOB_AUTO_SENT' } });
    expect(log).toMatchObject({ actorId: null, target: `inquiry:${res.body.id}` });
    expect(log.details).toMatchObject({ to: EMPLOYER, mode: 'AUTO' });

    // Same client, same listing: no second e-mail.
    const again = await seed({}, client.user.id);
    expect(again.state).toBe('DUPLICATE');
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(1);
    // Running the pipeline / scheduler again changes nothing.
    expect(await processExternalApplication(app.id)).toBe('SENT');
    await runExternalAutoSend();
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(1);

    // The portal shows the step; staff see the automation state.
    const mine = await client.agent.get('/api/external-applications').expect(200);
    expect(mine.body.items.find((i: { id: string }) => i.id === app.id)).toMatchObject({ status: 'FORWARDED', auto: { state: 'SENT', consent: true, missing: [] } });
    const staff = await asStaff();
    const view = await staff.agent.get(`/api/admin/external-applications/${res.body.id}`).expect(200);
    expect(view.body.auto).toMatchObject({ state: 'SENT', sentMode: 'AUTO', employerEmail: EMPLOYER, missing: [] });
  });

  it('never trusts an address of another site', async () => {
    const client = await readyClient();
    const r = await seed({ message: 'Bitte an hr@other-firm.de' }, client.user.id);
    expect(r.state).toBe('SEARCHING');
    expect(await prisma.emailLog.count({ where: { to: 'hr@other-firm.de' } })).toBe(0);
  });
});

describe('no employer e-mail → the client sends it; help → "Göndərməyə hazır" queue', () => {
  it('looks for the address, hands it to the client, help moves it to staff, who download it and mark it sent', async () => {
    const client = await readyClient();
    const r = await seed({ message: '', listingUrl: 'https://www.stepstone.de/stellenangebote--fahrer-123' }, client.user.id);
    expect(r.state).toBe('SEARCHING');
    await runEmployerDiscovery({ fetchPage: noAddressFetcher });
    const app = await appOf(r.inquiryId);
    expect(app).toMatchObject({ status: 'SUBMITTED', autoState: 'CLIENT_SEND', discoveryState: 'NOT_FOUND' });
    expect(app.coverLetterBody).toBeTruthy();
    const handed = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'EXTERNAL_APPLICATION_CLIENT_SEND' } });
    expect(handed.title).toContain('özünüz göndərin');

    const staff = await asStaff();
    let overview = await staff.agent.get('/api/admin/external-applications/auto/overview').expect(200);
    expect(overview.body.today).toEqual({ sent: 0, limit: 30 });
    expect(overview.body.settings).toMatchObject({ enabled: true, discovery: true });
    expect(overview.body.queue).toHaveLength(0); // the client sends it: nothing for staff
    expect(overview.body.counts.CLIENT_SEND).toBe(1);

    // The client could not send it: staff queue.
    await client.agent.post(`/api/external-applications/${app.id}/help`).send({ note: 'E-poçt ünvanı yoxdur' }).expect(200);
    overview = await staff.agent.get('/api/admin/external-applications/auto/overview').expect(200);
    expect(overview.body.queue).toHaveLength(1);
    expect(overview.body.queue[0]).toMatchObject({ inquiryId: r.inquiryId, state: 'READY', reason: 'CLIENT_HELP', listingUrl: 'https://www.stepstone.de/stellenangebote--fahrer-123', hasCoverLetter: true });

    const zipRes = await staff.agent.get(`/api/admin/external-applications/${r.inquiryId}/package.zip`).buffer(true).parse(binaryParser).expect(200);
    expect(zipRes.headers['content-type']).toContain('application/zip');
    const zip = await JSZip.loadAsync(zipRes.body as Buffer);
    const names = Object.keys(zip.files);
    expect(names.some((n) => n.startsWith('Anschreiben_'))).toBe(true);
    expect(names.some((n) => n.startsWith('Lebenslauf_'))).toBe(true);
    expect(names).toContain('Stellenanzeige.txt');

    // Staff found an address on the listing page: the normal pipeline sends it.
    const other = await seed({ listingUrl: 'https://www.stepstone.de/stellenangebote--koch-9', listingTitle: 'Berufskraftfahrer C (m/w/d)', message: '' }, client.user.id);
    expect(other.state).toBe('SEARCHING');
    const bad = await staff.agent.put(`/api/admin/external-applications/${other.inquiryId}/auto/employer-email`).send({ email: 'jobs@stepstone.de' });
    expect(bad.status).toBe(400);
    const set = await staff.agent.put(`/api/admin/external-applications/${other.inquiryId}/auto/employer-email`).send({ email: 'personal@spedition-ost.de' }).expect(200);
    expect(set.body.auto).toMatchObject({ state: 'SENT', employerEmail: 'personal@spedition-ost.de', employerEmailSource: 'staff' });
    expect(await prisma.emailLog.count({ where: { to: 'personal@spedition-ost.de' } })).toBe(1);

    // Bulk "Göndərildi" for the first one.
    const done = await staff.agent.post('/api/admin/external-applications/auto/mark-sent').send({ ids: [r.inquiryId] }).expect(200);
    expect(done.body.done).toBe(1);
    expect(await appOf(r.inquiryId)).toMatchObject({ status: 'FORWARDED', autoState: 'SENT', autoSentMode: 'MANUAL' });
    expect((await staff.agent.post(`/api/admin/external-applications/${r.inquiryId}/auto/mark-sent`)).status).toBe(400);
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'EXTERNAL_APPLICATION_STATUS' } })).toBe(2);

    expect((await client.agent.get('/api/admin/external-applications/auto/overview')).status).toBe(403);
  });
});

describe('missing data', () => {
  it('tells the client exactly what is missing and continues by itself once it is fixed', async () => {
    const client = await asClient({ email: 'vusal@example.com', locale: 'az', phone: '+994501112233' });
    const r = await seed({ email: 'vusal@example.com', message: `Bewerbung an ${EMPLOYER}` }, client.user.id);
    expect(r.state).toBe('NEEDS_DATA');
    let app = await appOf(r.inquiryId);
    expect(app.status).toBe('SUBMITTED');
    expect(app.autoMissing).toBe('CV,PASSPORT');
    expect(app.statusNote).toContain('Pasport');
    expect(app.events).toHaveLength(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'EXTERNAL_APPLICATION_NEEDS' } });
    expect(n.body).toContain('CV əlavə edin');
    expect(n.body).toContain('pasport nömrəsini');
    expect(n.link).toBe('/account/cv');
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(0);

    // Same gaps again: no second notice.
    await processExternalApplication(app.id);
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'EXTERNAL_APPLICATION_NEEDS' } })).toBe(1);

    const mine = await client.agent.get('/api/external-applications').expect(200);
    expect(mine.body.items[0].auto.missing).toEqual([
      { code: 'CV', path: '/account/cv' },
      { code: 'PASSPORT', path: '/account/profile' },
    ]);

    // The client fixes the profile and builds a CV: re-checked and sent without staff.
    await client.agent.patch('/api/auth/me').send({ passportNumber: 'C07654321' }).expect(200);
    await client.agent.put('/api/cv').send({ data: { headline: 'Kraftfahrer', experience: [{ title: 'Kraftfahrer', employer: 'Azərsun', from: '2018-01', to: null }] } }).expect(200);
    await runExternalAutoSend(); // the periodic job (the profile save also triggers a re-check in the background)
    app = await waitFor(async () => {
      const a = await appOf(r.inquiryId);
      return a.autoState === 'SENT' ? a : null;
    }, 8000);
    expect(app.status).toBe('FORWARDED');
    expect(app.statusNote).toBeNull();
    expect(app.lebenslaufVersionId).not.toBeNull(); // a Lebenslauf was built from the CV builder and attached
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(1);
  });

  it('a guest is asked by e-mail to create an account, with links', async () => {
    const r = await seed({ email: 'guest@example.com', lng: 'de' }, null);
    expect(r.state).toBe('NEEDS_DATA');
    expect((await appOf(r.inquiryId)).autoMissing).toContain('ACCOUNT');
    const mails = await emailsTo('guest@example.com');
    const notice = mails.find((m) => m.subject.includes('fehlen noch Angaben'));
    expect(notice).toBeTruthy();
  });
});

describe('consent', () => {
  it('without the forward consent nothing is sent in our name (the client sends it); consent in the portal starts the sending', async () => {
    const client = await readyClient();
    const res = await apply(fields({ forwardConsent: '', attachLebenslauf: 'true' }), client.agent).expect(201);
    let app = await appOf(res.body.id);
    expect(app).toMatchObject({ autoState: 'CLIENT_SEND', status: 'SUBMITTED', forwardConsentAt: null });
    const mine = await client.agent.get('/api/external-applications').expect(200);
    expect(mine.body.items[0].auto.clientSend).toMatchObject({ employerEmail: EMPLOYER, subject: 'Bewerbung als Berufskraftfahrer CE' });
    await runExternalAutoSend();
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(0);
    const staff = await asStaff();
    const send = await staff.agent.post(`/api/admin/external-applications/${res.body.id}/auto/send`);
    expect(send.status).toBe(400);
    expect(send.body.error).toBe('NO_FORWARD_CONSENT');

    const other = await asClient();
    expect((await other.agent.post(`/api/external-applications/${app.id}/forward-consent`)).status).toBe(404);
    const ok = await client.agent.post(`/api/external-applications/${app.id}/forward-consent`).expect(200);
    expect(ok.body.state).toBe('SENT');
    app = await appOf(res.body.id);
    expect(app.status).toBe('FORWARDED');
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(1);
    expect(await prisma.consentRecord.count({ where: { userId: client.user.id, type: 'EXTERNAL_JOB_FORWARD', source: 'PORTAL' } })).toBe(1);
    expect((await client.agent.post(`/api/external-applications/${app.id}/forward-consent`)).status).toBe(409);
  });
});

describe('limits, kill switch and staff overrides', () => {
  it('queues over the daily limit to the next day and sends then', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    expect((await staff.agent.put('/api/admin/external-applications/auto/settings').send({ dailyLimit: 1 })).status).toBe(403);
    const put = await admin.agent.put('/api/admin/external-applications/auto/settings').send({ dailyLimit: 1 }).expect(200);
    expect(put.body.settings).toMatchObject({ enabled: true, dailyLimit: 1, perDomainLimit: 3 });

    const a = await readyClient('a@example.com');
    const b = await readyClient('b@example.com');
    const first = await seed({ email: 'a@example.com' }, a.user.id);
    expect(first.state).toBe('SENT');
    const second = await seed({ email: 'b@example.com', listingUrl: 'https://www.firma-zwei.de/jobs/fahrer', message: 'Kontakt: jobs@firma-zwei.de' }, b.user.id);
    expect(second.state).toBe('QUEUED');
    const queued = await appOf(second.inquiryId);
    expect(queued.autoReason).toBe('DAILY_LIMIT');
    expect(queued.autoNextAt?.toISOString()).toBe(nextDayStart().toISOString());
    expect(await prisma.emailLog.count({ where: { to: 'jobs@firma-zwei.de' } })).toBe(0);

    const overview = await staff.agent.get('/api/admin/external-applications/auto/overview').expect(200);
    expect(overview.body.today).toEqual({ sent: 1, limit: 1 });
    expect(overview.body.queue.map((q: { inquiryId: string; reason: string }) => [q.inquiryId, q.reason])).toEqual([[second.inquiryId, 'DAILY_LIMIT']]);

    // Same day: still waiting. Next day: sent by the scheduler.
    await runExternalAutoSend();
    expect(await prisma.emailLog.count({ where: { to: 'jobs@firma-zwei.de' } })).toBe(0);
    const tomorrow = new Date(nextDayStart().getTime() + 60_000);
    const run = await runExternalAutoSend(tomorrow);
    expect(run.sent).toBe(1);
    expect(await appOf(second.inquiryId)).toMatchObject({ autoState: 'SENT', status: 'FORWARDED' });
    expect(await prisma.emailLog.count({ where: { to: 'jobs@firma-zwei.de' } })).toBe(1);
  });

  it('per employer domain: at most N a day', async () => {
    await setAutoSendSettings({ perDomainLimit: 1 });
    const a = await readyClient('a@example.com');
    const b = await readyClient('b@example.com');
    expect((await seed({ email: 'a@example.com' }, a.user.id)).state).toBe('SENT');
    const second = await seed({ email: 'b@example.com', listingUrl: 'https://karriere.nord-logistik.de/jobs/lager', listingTitle: 'Berufskraftfahrer C (m/w/d)' }, b.user.id);
    expect(second.state).toBe('QUEUED');
    expect((await appOf(second.inquiryId)).autoReason).toBe('DOMAIN_LIMIT');
  });

  it('kill switch: nothing goes out automatically; staff can stop, send now or resume', async () => {
    const admin = await asAdmin();
    await admin.agent.put('/api/admin/external-applications/auto/settings').send({ enabled: false }).expect(200);
    const client = await readyClient();
    const r = await seed({}, client.user.id);
    expect(r.state).toBe('QUEUED');
    expect((await appOf(r.inquiryId)).autoReason).toBe('DISABLED');
    await runExternalAutoSend();
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(0);

    const staff = await asStaff();
    const url = `/api/admin/external-applications/${r.inquiryId}`;
    const stopped = await staff.agent.post(`${url}/auto/stop`).expect(200);
    expect(stopped.body.auto.state).toBe('STOPPED');
    await admin.agent.put('/api/admin/external-applications/auto/settings').send({ enabled: true }).expect(200);
    await runExternalAutoSend();
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(0); // stopped stays stopped

    const sent = await staff.agent.post(`${url}/auto/send`).expect(200);
    expect(sent.body.auto).toMatchObject({ state: 'SENT', sentMode: 'STAFF' });
    expect(sent.body.status).toBe('FORWARDED');
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(1);
    expect((await staff.agent.post(`${url}/auto/send`)).status).toBe(400);
    await auditsSettled();
    expect(await prisma.auditLog.count({ where: { action: 'EXTERNAL_JOB_AUTO_SENT', actorId: staff.user.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'EXTERNAL_JOB_AUTO_SETTINGS_UPDATED', actorId: admin.user.id } })).toBe(2);
  });
});
