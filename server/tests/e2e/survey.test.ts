import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, ORIGIN, type Actor } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { act, expectStatus } from '../helpers/workflow';
import { createSurveyForCase, runSurveyReminders, surveyToken } from '../../src/lib/surveys/service.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/surveys.js';

/** Captures every email (the real sendMail still writes the EmailLog row). */
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
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const TOKEN_IN_MAIL = /\/survey\/([A-Za-z0-9_-]{43})/;
const surveyMails = (to: string) => mails.filter((m) => m.to === to && TOKEN_IN_MAIL.test(m.html));
const tokenOf = (to: string) => {
  const m = surveyMails(to).at(-1);
  const t = m?.html.match(TOKEN_IN_MAIL)?.[1];
  if (!t) throw new Error(`no survey link mailed to ${to}`);
  return t;
};

const pub = {
  get: (url: string) => anon().get(url),
  post: (url: string) => anon().post(url).set('Origin', ORIGIN),
};

/** A case in `status` for a fresh client (or the given one), assigned to `staffId`. */
const makeCase = async (opts: { client?: Actor; staffId?: string | null; status?: CaseStatus; parentCaseId?: string } = {}) => {
  const client = opts.client ?? (await asClient({ locale: 'de', firstName: 'Aynur', lastName: 'Qasımova' }));
  const c = await prisma.case.create({
    data: {
      clientId: client.user.id,
      number: `TV-2026-${uniq('n')}`,
      profession: 'Pflegefachkraft',
      status: opts.status ?? 'DECISION_PENDING',
      assignedStaffId: opts.staffId ?? null,
      parentCaseId: opts.parentCaseId ?? null,
    },
  });
  return { client, c };
};

const surveyOf = (caseId: string) => waitFor(() => prisma.satisfactionSurvey.findUnique({ where: { caseId } }));

describe('survey creation on case close', () => {
  it('approval creates exactly one survey (assigned staff, hashed token) and mails + notifies the client', async () => {
    const admin = await asAdmin();
    const staff = await asStaff({ firstName: 'Leyla' });
    const { client, c } = await makeCase({ staffId: staff.user.id });
    expectStatus(await act(admin.agent, c.id, { action: 'DECIDE', decision: 'APPROVED' }), 200);

    const s = await surveyOf(c.id);
    expect(s).toMatchObject({ trigger: 'VISA_APPROVED', clientId: client.user.id, staffId: staff.user.id, answeredAt: null, remindedAt: null });
    await waitFor(async () => surveyMails(client.user.email).length > 0);
    const token = tokenOf(client.user.email);
    expect(s.tokenHash).toBe(sha(token));
    expect(s.tokenHash).not.toContain(token);
    expect(surveyMails(client.user.email)[0].subject).toContain('Wie zufrieden');

    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'SURVEY' } }));
    expect(n.link).toBe(`/survey/${s.id}`); // the in-app link never carries the token
    expect(n.caseId).toBe(c.id);

    // A second attempt (re-run, concurrent hook) never creates or sends another one.
    expect(await createSurveyForCase(c.id, 'APPROVED')).toBeNull();
    await settle();
    expect(await prisma.satisfactionSurvey.count()).toBe(1);
    expect(surveyMails(client.user.email)).toHaveLength(1);
  });

  it('rejection and cancellation create a CASE_CLOSED survey', async () => {
    const admin = await asAdmin();
    const rejected = await makeCase();
    expectStatus(await act(admin.agent, rejected.c.id, { action: 'DECIDE', decision: 'REJECTED', reason: 'Insufficient funds' }), 200);
    expect((await surveyOf(rejected.c.id)).trigger).toBe('CASE_CLOSED');

    const cancelled = await makeCase({ status: 'DOCUMENTS_PENDING' });
    expectStatus(await act(admin.agent, cancelled.c.id, { action: 'CANCEL', reason: 'Client withdrew' }), 200);
    expect((await surveyOf(cancelled.c.id)).trigger).toBe('CASE_CLOSED');
    await waitFor(async () => surveyMails(cancelled.client.user.email).length === 1);
  });

  it('family member cases and a second case within 30 days are not surveyed again', async () => {
    const admin = await asAdmin();
    const main = await makeCase();
    expectStatus(await act(admin.agent, main.c.id, { action: 'DECIDE', decision: 'APPROVED' }), 200);
    await surveyOf(main.c.id);

    const member = await makeCase({ client: main.client, parentCaseId: main.c.id });
    expectStatus(await act(admin.agent, member.c.id, { action: 'DECIDE', decision: 'APPROVED' }), 200);
    const other = await makeCase({ client: main.client, status: 'DOCUMENTS_PENDING' });
    expectStatus(await act(admin.agent, other.c.id, { action: 'CANCEL', reason: 'Duplicate' }), 200);
    await settle();
    expect(await prisma.satisfactionSurvey.count({ where: { clientId: main.client.user.id } })).toBe(1);
    expect(await createSurveyForCase(member.c.id, 'APPROVED')).toBeNull();
  });

  it('never surveys a non-final status', async () => {
    const { c } = await makeCase({ status: 'EMBASSY_REVIEW' });
    expect(await createSurveyForCase(c.id, 'EMBASSY_REVIEW')).toBeNull();
    expect(await createSurveyForCase(c.id, 'APPROVED')).toBeNull(); // status does not match the case
  });
});

describe('public answer flow', () => {
  const setup = async () => {
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Hüseynova' });
    const { client, c } = await makeCase({ staffId: staff.user.id, status: 'APPROVED' });
    const s = await createSurveyForCase(c.id, 'APPROVED');
    if (!s) throw new Error('survey not created');
    return { client, c, s, token: surveyToken(s.id) };
  };

  it('shows only the case number, staff first name and state — no other personal data', async () => {
    const { c, token } = await setup();
    const res = expectStatus(await pub.get(`/api/surveys/${token}`), 200);
    expect(res.body).toEqual({ caseNumber: c.number, staffFirstName: 'Leyla', trigger: 'VISA_APPROVED', answered: false, expired: false });
    expect(JSON.stringify(res.body)).not.toMatch(/Hüseynova|Qasımova|Aynur|@/);
    expectStatus(await pub.get(`/api/surveys/${'x'.repeat(43)}`), 404);
    expectStatus(await pub.get('/api/surveys/short'), 404);
  });

  it('accepts one valid answer, validates input and answers 409 afterwards', async () => {
    const { s, token } = await setup();
    for (const bad of [{ score: 11 }, { score: -1 }, { score: 5.5 }, {}, { score: 5, ratings: { speed: 6 } }, { score: 5, ratings: { other: 3 } }, { score: 5, comment: 'x'.repeat(2001) }]) {
      expectStatus(await pub.post(`/api/surveys/${token}`).send(bad), 400);
    }
    const ok = expectStatus(await pub.post(`/api/surveys/${token}`).send({ score: 9, ratings: { communication: 5, speed: 4, clarity: null }, comment: '  Sehr gut!  ' }), 200);
    expect(ok.body).toEqual({ ok: true, suggestReview: true });
    const row = await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { id: s.id } });
    expect(row).toMatchObject({ score: 9, ratings: { communication: 5, speed: 4 }, comment: 'Sehr gut!' });
    expect(row.answeredAt).not.toBeNull();

    expect(expectStatus(await pub.post(`/api/surveys/${token}`).send({ score: 2 }), 409).body.error).toBe('ALREADY_ANSWERED');
    expect((await pub.get(`/api/surveys/${token}`)).body).toMatchObject({ answered: true, expired: false });
    expect((await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { id: s.id } })).score).toBe(9);
  });

  it('suggests a public review only to promoters without one', async () => {
    const a = await setup();
    expect((await pub.post(`/api/surveys/${a.token}`).send({ score: 8 })).body.suggestReview).toBe(false);
    const b = await setup();
    await prisma.review.create({ data: { userId: b.client.user.id, caseId: b.c.id, tokenHash: sha(uniq('r')), status: 'APPROVED', rating: 5, text: 'x'.repeat(30), locale: 'de' } });
    expect((await pub.post(`/api/surveys/${b.token}`).send({ score: 10 })).body.suggestReview).toBe(false);
  });

  it('expires after 30 days', async () => {
    const { s, token } = await setup();
    await prisma.satisfactionSurvey.update({ where: { id: s.id }, data: { sentAt: new Date(Date.now() - 31 * DAY) } });
    expect((await pub.get(`/api/surveys/${token}`)).body).toMatchObject({ expired: true, answered: false });
    expect(expectStatus(await pub.post(`/api/surveys/${token}`).send({ score: 7 }), 410).body.error).toBe('SURVEY_EXPIRED');
  });

  it('the in-app link (survey id) only works for the logged-in client it belongs to', async () => {
    const { client, s } = await setup();
    expectStatus(await pub.get(`/api/surveys/${s.id}`), 404);
    const other = await asClient();
    expectStatus(await other.agent.get(`/api/surveys/${s.id}`), 404);
    expectStatus(await client.agent.get(`/api/surveys/${s.id}`), 200);
    expectStatus(await client.agent.post(`/api/surveys/${s.id}`).send({ score: 6 }), 200);
  });
});

describe('reminder job', () => {
  it('is registered and sends one reminder after 3 days, never twice, never when answered or expired', async () => {
    expect(registeredJobs()).toContain('surveys');
    const mk = async (daysAgo: number, answered = false) => {
      const { client, c } = await makeCase({ status: 'APPROVED' });
      const s = await createSurveyForCase(c.id, 'APPROVED', new Date(Date.now() - daysAgo * DAY));
      if (answered) await prisma.satisfactionSurvey.update({ where: { id: s!.id }, data: { answeredAt: new Date(), score: 10 } });
      return { client, s: s! };
    };
    const due = await mk(4);
    const fresh = await mk(1);
    const answered = await mk(5, true);
    const expired = await mk(31);
    await settle();
    mails.length = 0;

    expect(await runSurveyReminders()).toEqual({ reminded: 1 });
    await waitFor(async () => surveyMails(due.client.user.email).length === 1);
    const m = surveyMails(due.client.user.email)[0];
    expect(m.subject).toContain('Erinnerung');
    expect(m.html.match(TOKEN_IN_MAIL)?.[1]).toBe(surveyToken(due.s.id)); // same link as the first e-mail
    expect((await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { id: due.s.id } })).remindedAt).not.toBeNull();

    expect(await runSurveyReminders()).toEqual({ reminded: 0 });
    expect(await runSurveyReminders(new Date(Date.now() + 10 * DAY))).toEqual({ reminded: 1 }); // the fresh one, later
    await settle();
    for (const x of [answered, expired]) expect(surveyMails(x.client.user.email)).toHaveLength(0);
    expect(surveyMails(fresh.client.user.email)).toHaveLength(1);
  });
});

describe('admin results', () => {
  const seed = async () => {
    const s1 = await asStaff({ firstName: 'Leyla' });
    const s2 = await asStaff({ firstName: 'Kamran' });
    const now = Date.now();
    const rows: [string | null, number | null, Record<string, number> | null, string | null, 'VISA_APPROVED' | 'CASE_CLOSED'][] = [
      [s1.user.id, 10, { communication: 5, speed: 4 }, 'Super', 'VISA_APPROVED'],
      [s1.user.id, 9, { communication: 4 }, null, 'VISA_APPROVED'],
      [s1.user.id, 3, { communication: 2, speed: 1 }, 'Zu langsam', 'CASE_CLOSED'],
      [s2.user.id, 8, null, null, 'VISA_APPROVED'],
      [s2.user.id, null, null, null, 'CASE_CLOSED'],
    ];
    const ids: string[] = [];
    for (const [staffId, score, ratings, comment, trigger] of rows) {
      const { client, c } = await makeCase({ status: 'APPROVED' });
      const s = await prisma.satisfactionSurvey.create({
        data: {
          id: crypto.randomBytes(12).toString('hex'),
          caseId: c.id,
          clientId: client.user.id,
          staffId,
          trigger,
          tokenHash: sha(uniq('t')),
          score,
          ratings: ratings ?? undefined,
          comment,
          sentAt: new Date(now - 2 * DAY),
          answeredAt: score === null ? null : new Date(now - DAY),
        },
      });
      ids.push(s.id);
    }
    return { s1, s2, ids };
  };

  it('summary: NPS, response rate, ratings, trend and per-staff rows (all for ADMIN, own row for STAFF)', async () => {
    const { s1, s2 } = await seed();
    const admin = await asAdmin();
    const res = expectStatus(await admin.agent.get('/api/admin/surveys/summary'), 200).body;
    // answered 4: promoters 2 (10, 9), passive 1 (8), detractor 1 (3) → 50 − 25 = 25
    expect(res).toMatchObject({ sent: 5, answered: 4, responseRate: 0.8, nps: { score: 25, promoters: 2, passives: 1, detractors: 1, total: 4 }, canSeeAll: true });
    expect(res.ratings).toEqual({ communication: 3.7, speed: 2.5, clarity: null, support: null });
    expect(res.trend.at(-1)).toMatchObject({ sent: 5, answered: 4, nps: 25 });
    expect(res.trend).toHaveLength(12);
    const leyla = res.staff.find((r: { staffId: string }) => r.staffId === s1.user.id);
    expect(leyla).toMatchObject({ firstName: 'Leyla', sent: 3, answered: 3, nps: { score: 33 } });
    expect(res.staff.find((r: { staffId: string }) => r.staffId === s2.user.id)).toMatchObject({ sent: 2, answered: 1, responseRate: 0.5, nps: { score: 0 } });

    const mine = expectStatus(await s2.agent.get('/api/admin/surveys/summary'), 200).body;
    expect(mine.canSeeAll).toBe(false);
    expect(mine.staff).toHaveLength(1);
    expect(mine.staff[0].staffId).toBe(s2.user.id);
    expect(mine.nps.score).toBe(25); // the overall figures are visible to every staff member

    const ranged = expectStatus(await admin.agent.get('/api/admin/surveys/summary?from=2020-01-01&to=2020-03-31'), 200).body;
    expect(ranged).toMatchObject({ sent: 0, answered: 0, responseRate: null, nps: { score: null } });
    expect(ranged.trend).toHaveLength(3);
  });

  it('list with filters; staff names hidden from other staff; clients are refused', async () => {
    const { s1, s2 } = await seed();
    const admin = await asAdmin();
    const list = async (agent: Actor['agent'], qs = '') => expectStatus(await agent.get(`/api/admin/surveys${qs}`), 200).body;
    expect((await list(admin.agent)).total).toBe(5);
    expect((await list(admin.agent, `?staffId=${s1.user.id}`)).total).toBe(3);
    expect((await list(admin.agent, '?trigger=CASE_CLOSED')).total).toBe(2);
    expect((await list(admin.agent, '?minScore=0&maxScore=6')).items.map((i: { comment: string }) => i.comment)).toEqual(['Zu langsam']);
    expect((await list(admin.agent, '?answered=false')).total).toBe(1);
    expect((await list(admin.agent, '?hasComment=true')).total).toBe(2);

    const asS2 = await list(s2.agent);
    expect(asS2.total).toBe(5);
    expect(asS2.items.filter((i: { staff: unknown }) => i.staff).every((i: { staff: { id: string } }) => i.staff.id === s2.user.id)).toBe(true);
    expectStatus(await s2.agent.get(`/api/admin/surveys?staffId=${s1.user.id}`), 403);
    expect((await list(s2.agent, `?staffId=${s2.user.id}`)).total).toBe(2);

    const client = await asClient();
    expectStatus(await client.agent.get('/api/admin/surveys/summary'), 403);
    expectStatus(await anon().get('/api/admin/surveys'), 401);
  });

  it('resend: ADMIN only, unanswered and unexpired only', async () => {
    const { s2, ids } = await seed();
    const admin = await asAdmin();
    const open = ids[4];
    expectStatus(await s2.agent.post(`/api/admin/surveys/${open}/resend`), 403);
    expectStatus(await admin.agent.post(`/api/admin/surveys/${open}/resend`), 200);
    const row = await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { id: open }, include: { client: true } });
    await waitFor(async () => surveyMails(row.client.email).length === 1);
    expect(tokenOf(row.client.email)).toBe(surveyToken(open));
    expect(expectStatus(await admin.agent.post(`/api/admin/surveys/${ids[0]}/resend`), 409).body.error).toBe('ALREADY_ANSWERED');
    await prisma.satisfactionSurvey.update({ where: { id: open }, data: { sentAt: new Date(Date.now() - 40 * DAY) } });
    expect(expectStatus(await admin.agent.post(`/api/admin/surveys/${open}/resend`), 409).body.error).toBe('SURVEY_EXPIRED');
    expectStatus(await admin.agent.post('/api/admin/surveys/nope/resend'), 404);
    // the audit row is written after the response — wait for it under load
    await waitFor(async () => (await prisma.auditLog.count({ where: { action: 'survey.resend' } })) === 1);
  });
});
