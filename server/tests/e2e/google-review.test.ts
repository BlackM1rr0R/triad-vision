import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asAdmin, asClient, asStaff, ORIGIN, type Actor } from '../helpers/api';
import { prisma, settle } from '../helpers/db';
import { uniq } from '../helpers/factories';
import {
  GOOGLE_REVIEW_DEFAULTS,
  type GoogleReviewSettings,
  inviteToken,
  reviewToken,
  runGoogleReviewRequests,
  saveGoogleReviewSettings,
  userOfToken,
} from '../../src/lib/googleReview/service.js';
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
const enable = (over: Partial<GoogleReviewSettings> = {}) => saveGoogleReviewSettings({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: GOOGLE, ...over });

const approvedCase = async (client: Actor, daysAgo = 4, extra: { assignedStaffId?: string | null; parentCaseId?: string | null } = {}) =>
  prisma.case.create({
    data: {
      clientId: client.user.id,
      number: `TV-2026-${uniq('n')}`,
      profession: 'Aşpaz',
      status: 'APPROVED',
      decisionAt: new Date(Date.now() - daysAgo * DAY),
      assignedStaffId: extra.assignedStaffId ?? null,
      parentCaseId: extra.parentCaseId ?? null,
    },
  });

const rateMails = (to: string) => mails.filter((m) => m.to === to && m.html.includes('/r/rate/'));
const invitesOf = (userId: string) => prisma.googleReviewInvite.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

describe('Google review requests (rating first, no gating)', () => {
  it('is registered as a job and does nothing until enabled with a link or Place ID', async () => {
    expect(registeredJobs()).toContain('google-reviews');
    const client = await asClient();
    await approvedCase(client);
    expect((await runGoogleReviewRequests()).sent).toBe(0);
    await enable({ url: '' });
    expect((await runGoogleReviewRequests()).sent).toBe(0);
  });

  it('trigger → exactly one invite per client (cooldown across triggers), e-mail with 1–5 links, direct Google link and opt-out', async () => {
    const client = await asClient({ firstName: 'Səbinə', locale: 'de' });
    const fresh = await asClient();
    const c1 = await approvedCase(client, 4);
    await approvedCase(client, 5); // second case of the same client: still one request (cooldown)
    await prisma.arrivalFollowUp.create({ data: { caseId: c1.id, clientId: client.user.id, arrivedAt: new Date(Date.now() - 20 * DAY) } }); // arrival trigger due too
    await approvedCase(fresh, 1); // not due yet (3-day delay)
    await enable();

    expect(await runGoogleReviewRequests()).toMatchObject({ sent: 1 });
    await settle();
    const inv = await invitesOf(client.user.id);
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ status: 'SENT', locale: 'de' });
    const m = rateMails(client.user.email);
    expect(m).toHaveLength(1);
    const token = inviteToken(inv[0].id);
    for (const n of [1, 2, 3, 4, 5]) expect(m[0].html).toContain(`/r/rate/${token}?s=${n}`);
    expect(m[0].html).toContain(`/r/rate/${token}/google`); // direct link: rating is optional
    expect(m[0].html).toContain(`/r/review/${reviewToken(client.user.id)}/optout`);
    expect(m[0].html).not.toContain(GOOGLE); // always through the counter
    expect(m[0].subject).toContain('Erfahrung'); // German
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'GOOGLE_REVIEW' } })).toBe(1);
    expect(rateMails(fresh.user.email)).toHaveLength(0);

    // Re-runs never send again.
    expect((await runGoogleReviewRequests()).sent).toBe(0);
    expect((await runGoogleReviewRequests(new Date(Date.now() + 10 * DAY))).sent).toBe(1); // only `fresh` is new
    expect(await invitesOf(client.user.id)).toHaveLength(1);
  });

  it('family members, opted-out, unsubscribed and e-mail-off clients are excluded', async () => {
    const main = await asClient();
    const member = await asClient();
    const out = await asClient();
    const unsub = await asClient();
    const noMail = await asClient();
    const mainCase = await approvedCase(main);
    await approvedCase(member, 4, { parentCaseId: mainCase.id });
    for (const c of [out, unsub, noMail]) await approvedCase(c);
    await prisma.user.update({ where: { id: noMail.user.id }, data: { emailNotifications: false } });
    const campaign = await prisma.campaign.create({ data: { name: 'Yay', kind: 'MARKETING', channels: ['EMAIL'], content: {} } });
    await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, userId: unsub.user.id, channel: 'EMAIL', locale: 'az', token: uniq('t'), unsubscribedAt: new Date() } });

    const token = reviewToken(out.user.id);
    expect((await anon().get(`/api/r/review/${token}/info`)).body).toEqual({ locale: 'az', optedOut: false });
    expect((await anon().post(`/api/r/review/${token}/optout`).set('Origin', ORIGIN)).status).toBe(200);
    expect((await anon().get(`/api/r/review/${token}/info`)).body.optedOut).toBe(true);
    expect((await anon().post(`/api/r/review/x${token.slice(1)}/optout`).set('Origin', ORIGIN)).status).toBe(404); // forged token

    await enable();
    expect(await runGoogleReviewRequests()).toMatchObject({ sent: 1, skipped: 4 });
    await settle();
    expect(await invitesOf(main.user.id)).toHaveLength(1);
    for (const u of [member, out, unsub, noMail]) {
      expect(await invitesOf(u.user.id)).toHaveLength(0);
      expect(rateMails(u.user.email)).toHaveLength(0);
    }
  });

  it('a recent low NPS score → staff task first, request postponed and sent after the hold; open problem report waits', async () => {
    const staff = await asStaff({ firstName: 'Leyla' });
    const unhappy = await asClient({ firstName: 'Orxan', lastName: 'Bəyli' });
    const reporter = await asClient();
    const c = await approvedCase(unhappy, 4, { assignedStaffId: staff.user.id });
    await approvedCase(reporter, 4);
    await prisma.satisfactionSurvey.create({
      data: { caseId: c.id, clientId: unhappy.user.id, trigger: 'VISA_APPROVED', tokenHash: uniq('h').padEnd(64, '0').slice(0, 64), score: 4, comment: 'Çox gec cavab verdiniz', answeredAt: new Date() },
    });
    const report = await prisma.problemReport.create({ data: { message: 'Sənəd yüklənmir', pageUrl: '/portal', ipHash: '0'.repeat(64), userId: reporter.user.id } });
    await enable({ holdDays: 10 });

    expect(await runGoogleReviewRequests()).toMatchObject({ sent: 0, held: 1 });
    await settle();
    expect(rateMails(unhappy.user.email)).toHaveLength(0);
    const [held] = await invitesOf(unhappy.user.id);
    expect(held.status).toBe('HELD');
    const task = await prisma.task.findFirstOrThrow({ where: { id: held.staffTaskId! }, include: { assignees: true } });
    expect(task.title).toContain('Orxan');
    expect(task.description).toContain('4/10');
    expect(task.description).toContain('Çox gec cavab verdiniz');
    expect(task.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
    expect(await invitesOf(reporter.user.id)).toHaveLength(0); // open problem: wait

    // After the hold: sent (compliant — not excluded for being unhappy); problem closed → reporter gets it too.
    await prisma.problemReport.update({ where: { id: report.id }, data: { status: 'DONE' } });
    const later = new Date(Date.now() + 11 * DAY);
    expect(await runGoogleReviewRequests(later)).toMatchObject({ released: 1, sent: 1 });
    await settle();
    expect(rateMails(unhappy.user.email)).toHaveLength(1);
    expect(rateMails(reporter.user.email)).toHaveLength(1);
    expect(await runGoogleReviewRequests(later)).toMatchObject({ released: 0, sent: 0 });
  });

  it('rating flow: 1–3 → staff notified + private feedback, Google link for every rating; one reminder after 7 days', async () => {
    const staff = await asStaff();
    const low = await asClient({ firstName: 'Kamran' });
    const high = await asClient();
    const silent = await asClient();
    await approvedCase(low, 4, { assignedStaffId: staff.user.id });
    await approvedCase(high, 4);
    await approvedCase(silent, 4);
    await enable();
    expect((await runGoogleReviewRequests()).sent).toBe(3);
    const tok = async (a: Actor) => inviteToken((await invitesOf(a.user.id))[0].id);

    // Low rating
    const lt = await tok(low);
    const info = await anon().get(`/api/r/review/i/${lt}`);
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ locale: 'az', firstName: 'Kamran', rating: null, googleAvailable: true });
    expect((await anon().post(`/api/r/review/i/${lt}/rate`).set('Origin', ORIGIN).send({ rating: 6 })).status).toBe(400);
    const r = await anon().post(`/api/r/review/i/${lt}/rate`).set('Origin', ORIGIN).send({ rating: 2 });
    expect(r.body).toEqual({ rating: 2, low: true });
    await anon().post(`/api/r/review/i/${lt}/rate`).set('Origin', ORIGIN).send({ rating: 1 }); // changes the rating, no second task
    const [lowInv] = await invitesOf(low.user.id);
    expect(lowInv.rating).toBe(1);
    expect(await prisma.task.count({ where: { id: lowInv.staffTaskId! } })).toBe(1);
    expect(await prisma.task.count({ where: { title: { contains: 'Kamran' } } })).toBe(1);
    await settle();
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'TASK_ASSIGNED' } })).toBe(1); // staff notified
    expect((await anon().post(`/api/r/review/i/${lt}/feedback`).set('Origin', ORIGIN).send({ feedback: 'Heç kim zəngə cavab vermədi' })).status).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: lowInv.staffTaskId! } })).description).toContain('Heç kim zəngə cavab vermədi');
    // …and still gets the Google link (no review gating).
    const g = await anon().get(`/api/r/review/i/${lt}/google`);
    expect(g.status).toBe(302);
    expect(g.headers.location).toBe(GOOGLE);

    // High rating
    const ht = await tok(high);
    expect((await anon().post(`/api/r/review/i/${ht}/rate`).set('Origin', ORIGIN).send({ rating: 5 })).body).toEqual({ rating: 5, low: false });
    await anon().get(`/api/r/review/i/${ht}/google`);
    await anon().get(`/api/r/review/i/${ht}/google`);
    const [highInv] = await invitesOf(high.user.id);
    expect(highInv).toMatchObject({ rating: 5, googleClicks: 2, staffTaskId: null });
    expect((await anon().get(`/api/r/review/i/x${ht.slice(1)}`)).status).toBe(404); // forged

    // Reminder: only `silent` (never opened), only once.
    mails.length = 0;
    const later = new Date(Date.now() + 8 * DAY);
    expect(await runGoogleReviewRequests(later)).toMatchObject({ reminded: 1 });
    expect(await runGoogleReviewRequests(later)).toMatchObject({ reminded: 0 });
    await settle();
    expect(rateMails(silent.user.email)).toHaveLength(1);
    expect(rateMails(low.user.email)).toHaveLength(0);
  });

  it('admin: settings validation, preview, test e-mail, stats and recent invites; legacy link still redirects', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const client = await asClient();
    await approvedCase(client);
    expect((await staff.agent.put('/api/admin/reviews/google').send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: GOOGLE })).status).toBe(403);
    expect((await admin.agent.put('/api/admin/reviews/google').send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: '' })).status).toBe(409);
    expect((await admin.agent.put('/api/admin/reviews/google').send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: 'http://insecure.example' })).status).toBe(400);
    const viaPlace = await admin.agent.put('/api/admin/reviews/google').send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: '', placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' });
    expect(viaPlace.status).toBe(200);
    expect((await staff.agent.get('/api/admin/reviews/google')).body.googleUrl).toBe('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
    const saved = await admin.agent
      .put('/api/admin/reviews/google')
      .send({ ...GOOGLE_REVIEW_DEFAULTS, enabled: true, url: GOOGLE, triggers: { APPROVED: { enabled: true, delayDays: 2 }, ARRIVAL: { enabled: false, delayDays: 14 }, CLOSED: { enabled: false, delayDays: 7 } } });
    expect(saved.status).toBe(200);

    const preview = await staff.agent.get('/api/admin/reviews/google/preview?locale=ru&trigger=ARRIVAL');
    expect(preview.status).toBe(200);
    expect(preview.body.subject).toContain('Triad Vision');
    expect(preview.body.html).toContain('/r/rate/demo?s=5');
    expect((await staff.agent.post('/api/admin/reviews/google/test').send({})).status).toBe(403);
    const test = await admin.agent.post('/api/admin/reviews/google/test').send({ locale: 'en' });
    expect(test.body).toMatchObject({ ok: true, to: admin.user.email });
    await settle();
    expect(mails.some((m) => m.to === admin.user.email && m.subject.startsWith('[TEST]'))).toBe(true);

    expect((await admin.agent.post('/api/admin/reviews/google/run')).body).toMatchObject({ sent: 1 });
    const [inv] = await invitesOf(client.user.id);
    const t = inviteToken(inv.id);
    await anon().get(`/api/r/review/i/${t}`); // opened
    await anon().post(`/api/r/review/i/${t}/rate`).set('Origin', ORIGIN).send({ rating: 4 });
    await anon().get(`/api/r/review/i/${t}/google`);

    const stats = await staff.agent.get('/api/admin/reviews/google');
    expect(stats.status).toBe(200);
    expect(stats.body.settings.triggers.APPROVED).toEqual({ enabled: true, delayDays: 2 });
    expect(stats.body.stats.totals).toMatchObject({ sent: 1, opened: 1, rated: 1, googleClicked: 1, googleClicks: 1, averageRating: 4, openRate: 1, clickRate: 1 });
    expect(stats.body.stats.distribution).toEqual([0, 0, 0, 1, 0]);
    expect(stats.body.stats.months).toHaveLength(12);
    expect(stats.body.stats.months.at(-1)).toMatchObject({ sent: 1, opened: 1, rated: 1, googleClicked: 1 });
    const list = await staff.agent.get('/api/admin/reviews/google/invites');
    expect(list.body.items[0]).toMatchObject({ trigger: 'APPROVED', status: 'SENT', rating: 4, client: { id: client.user.id } });

    // Legacy one-time request links (sent before the rating flow) keep working.
    const legacy = reviewToken(client.user.id);
    expect(userOfToken(legacy)).toBe(client.user.id);
    const click = await anon().get(`/api/r/review/${legacy}`);
    expect(click.status).toBe(302);
    expect(click.headers.location).toBe(GOOGLE);
    const bad = await anon().get('/api/r/review/nope.aaaaaaaaaaaaaaaaaaaaaa');
    expect(bad.headers.location).toBe('http://localhost:5173');
  });
});
