import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asAdmin, asClient, asStaff, ORIGIN, type Actor } from '../helpers/api';
import { prisma, settle } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { GOOGLE_REVIEW_DEFAULTS, reviewToken, runGoogleReviewRequests, saveGoogleReviewSettings, userOfToken } from '../../src/lib/googleReview/service.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/googleReviews.js';

const mails = vi.hoisted(() => [] as { to: string; subject: string; html: string }[]);
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...mod,
    sendMail: async (to: string, subject: string, html: string) => {
      mails.push({ to, subject, html });
      return mod.sendMail(to, subject, html);
    },
  };
});

beforeEach(() => {
  mails.length = 0;
});

const DAY = 24 * 60 * 60 * 1000;
const GOOGLE = 'https://g.page/r/CTestReview/review';
const enable = (over: Partial<typeof GOOGLE_REVIEW_DEFAULTS> = {}) => saveGoogleReviewSettings({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: GOOGLE, ...over });

const approvedCase = async (client: Actor, daysAgo = 4, staffId: string | null = null) =>
  prisma.case.create({
    data: { clientId: client.user.id, number: `TV-2026-${uniq('n')}`, profession: 'Aşpaz', status: 'APPROVED', decisionAt: new Date(Date.now() - daysAgo * DAY), assignedStaffId: staffId },
  });

const reviewMails = (to: string) => mails.filter((m) => m.to === to && m.html.includes('/r/review/'));

describe('Google review requests', () => {
  it('is registered as a job and does nothing until enabled with a link', async () => {
    expect(registeredJobs()).toContain('google-reviews');
    const client = await asClient();
    await approvedCase(client);
    expect(await runGoogleReviewRequests()).toEqual({ sent: 0, internal: 0, skipped: 0 });
    await enable({ url: '' });
    expect((await runGoogleReviewRequests()).sent).toBe(0);
  });

  it('sends ONE request after the delay (e-mail with tracked link + opt-out, in-app), never twice', async () => {
    const client = await asClient({ firstName: 'Səbinə', locale: 'de' });
    const fresh = await asClient();
    await approvedCase(client, 4);
    await approvedCase(client, 5); // second case of the same client: still one request
    await approvedCase(fresh, 1); // not due yet (3-day delay)
    await enable();

    expect(await runGoogleReviewRequests()).toMatchObject({ sent: 1, internal: 0 });
    await settle();
    const m = reviewMails(client.user.email);
    expect(m).toHaveLength(1);
    expect(m[0].subject).toContain('Google');
    const token = reviewToken(client.user.id);
    expect(m[0].html).toContain(`/r/review/${token}`);
    expect(m[0].html).toContain(`/r/review/${token}/optout`);
    expect(m[0].html).not.toContain(GOOGLE); // always through the counter
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'GOOGLE_REVIEW' } });
    expect(n.link).toBe(`/r/review/${token}`);
    expect(reviewMails(fresh.user.email)).toHaveLength(0);

    // Re-runs (restarts, overlapping deploys) never send again.
    expect((await runGoogleReviewRequests()).sent).toBe(0);
    expect((await runGoogleReviewRequests(new Date(Date.now() + 10 * DAY))).sent).toBe(1); // only `fresh` is new
    await settle();
    expect(reviewMails(client.user.email)).toHaveLength(1);
  });

  it('a low satisfaction score routes to a staff task instead of Google', async () => {
    const staff = await asStaff({ firstName: 'Leyla' });
    const unhappy = await asClient({ firstName: 'Orxan', lastName: 'Bəyli' });
    const happy = await asClient();
    const c = await approvedCase(unhappy, 4, staff.user.id);
    const c2 = await approvedCase(happy, 4);
    const survey = (caseId: string, clientId: string, score: number) =>
      prisma.satisfactionSurvey.create({ data: { caseId, clientId, trigger: 'VISA_APPROVED', tokenHash: uniq('h').padEnd(64, '0').slice(0, 64), score, comment: score < 7 ? 'Çox gec cavab verdiniz' : null, answeredAt: new Date() } });
    await survey(c.id, unhappy.user.id, 4);
    await survey(c2.id, happy.user.id, 10);
    await enable();

    expect(await runGoogleReviewRequests()).toMatchObject({ sent: 1, internal: 1 });
    await settle();
    expect(reviewMails(unhappy.user.email)).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId: unhappy.user.id, type: 'GOOGLE_REVIEW' } })).toBe(0);
    const task = await prisma.task.findFirstOrThrow({ where: { caseId: c.id }, include: { assignees: true } });
    expect(task.title).toContain('Orxan');
    expect(task.description).toContain('4/10');
    expect(task.description).toContain('Çox gec cavab verdiniz');
    expect(task.priority).toBe('HIGH');
    expect(task.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
    expect(reviewMails(happy.user.email)).toHaveLength(1);
    // Never asked later either.
    expect(await runGoogleReviewRequests()).toMatchObject({ sent: 0, internal: 0 });
  });

  it('honours opt-outs (own link, campaign unsubscribe) and e-mail preferences', async () => {
    const out = await asClient();
    const unsub = await asClient();
    const noMail = await asClient();
    for (const c of [out, unsub, noMail]) await approvedCase(c);
    await prisma.user.update({ where: { id: noMail.user.id }, data: { emailNotifications: false } });
    const campaign = await prisma.campaign.create({ data: { name: 'Yay', kind: 'MARKETING', channels: ['EMAIL'], content: {} } });
    await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, userId: unsub.user.id, channel: 'EMAIL', locale: 'az', token: uniq('t'), unsubscribedAt: new Date() } });

    const token = reviewToken(out.user.id);
    const info = await anon().get(`/api/r/review/${token}/info`);
    expect(info.body).toEqual({ locale: 'az', optedOut: false });
    expect((await anon().post(`/api/r/review/${token}/optout`).set('Origin', ORIGIN)).status).toBe(200);
    expect((await anon().get(`/api/r/review/${token}/info`)).body.optedOut).toBe(true);
    expect((await anon().post(`/api/r/review/x${token.slice(1)}/optout`).set('Origin', ORIGIN)).status).toBe(404); // forged token

    await enable();
    expect(await runGoogleReviewRequests()).toMatchObject({ sent: 1, skipped: 2 });
    await settle();
    expect(reviewMails(out.user.email)).toHaveLength(0);
    expect(reviewMails(unsub.user.email)).toHaveLength(0);
    expect(reviewMails(noMail.user.email)).toHaveLength(0); // e-mail off → in-app only
    expect(await prisma.notification.count({ where: { userId: noMail.user.id, type: 'GOOGLE_REVIEW' } })).toBe(1);
  });

  it('tracked link counts clicks and redirects to Google; admin sees sent / clicked per month', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const client = await asClient();
    await approvedCase(client);
    expect((await staff.agent.put('/api/admin/reviews/google').send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: GOOGLE })).status).toBe(403);
    expect((await admin.agent.put('/api/admin/reviews/google').send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: '' })).status).toBe(409);
    expect((await admin.agent.put('/api/admin/reviews/google').send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: 'http://insecure.example' })).status).toBe(400);
    const saved = await admin.agent.put('/api/admin/reviews/google').send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: GOOGLE, delayDays: 2 });
    expect(saved.status).toBe(200);
    expect((await admin.agent.post('/api/admin/reviews/google/run')).body).toMatchObject({ sent: 1 });

    const token = reviewToken(client.user.id);
    expect(userOfToken(token)).toBe(client.user.id);
    const click = await anon().get(`/api/r/review/${token}`);
    expect(click.status).toBe(302);
    expect(click.headers.location).toBe(GOOGLE);
    await anon().get(`/api/r/review/${token}`); // second click: total 2, unique 1
    const bad = await anon().get('/api/r/review/nope.aaaaaaaaaaaaaaaaaaaaaa');
    expect(bad.status).toBe(302);
    expect(bad.headers.location).toBe('http://localhost:5173');

    const stats = await staff.agent.get('/api/admin/reviews/google');
    expect(stats.status).toBe(200);
    expect(stats.body.settings).toMatchObject({ enabled: true, url: GOOGLE, delayDays: 2 });
    expect(stats.body.stats.totals).toMatchObject({ sent: 1, clicked: 1, internal: 0, optedOut: 0, clickRate: 1 });
    const month = stats.body.stats.months.at(-1);
    expect(month).toMatchObject({ sent: 1, clicked: 1, clicks: 2 });
    expect(stats.body.stats.months).toHaveLength(12);
  });
});
