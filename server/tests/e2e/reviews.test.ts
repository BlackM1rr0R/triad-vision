import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { ADMIN_INBOX } from '../helpers/testEnv';
import { runReviewInvites } from '../../src/jobs/reminders.js';
import { hashReviewToken } from '../../src/lib/reviewInvites.js';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await prisma.review.deleteMany();
  await prisma.reminderLog.deleteMany();
});

const makeCase = (clientId: string, data: Partial<Prisma.CaseUncheckedCreateInput> = {}) =>
  prisma.case.create({ data: { number: uniq('TV-R-'), clientId, profession: 'Truck driver', ...data } });

/** A REQUESTED review with a known token. */
const invited = async (opts: { locale?: 'az' | 'de' | 'en' | 'ru'; createdAt?: Date } = {}) => {
  const client = await asClient({ locale: opts.locale ?? 'en', firstName: 'Ali', lastName: 'Mammadov' });
  const c = await makeCase(client.user.id, { status: 'APPROVED', decisionAt: new Date(Date.now() - 5 * DAY) });
  const token = crypto.randomBytes(32).toString('base64url');
  const review = await prisma.review.create({
    data: { userId: client.user.id, caseId: c.id, tokenHash: hashReviewToken(token), locale: opts.locale ?? 'en', ...(opts.createdAt ? { createdAt: opts.createdAt } : {}) },
  });
  return { client, case: c, token, review };
};

const validBody = (token?: string) => ({
  token,
  rating: 5,
  text: 'Everything went smoothly, the team helped with every document.',
  displayName: 'Ali M., truck driver',
  consentPublish: true,
});

describe('review invitations job', () => {
  it('invites candidates approved at least 3 days ago, once', async () => {
    const { user: a } = await createClient({ locale: 'de', firstName: 'Aysel' });
    const { user: b } = await createClient();
    const { user: c } = await createClient();
    const old = await makeCase(a.id, { status: 'APPROVED', decisionAt: new Date(Date.now() - 4 * DAY) });
    await makeCase(b.id, { status: 'APPROVED', decisionAt: new Date(Date.now() - 1 * DAY) }); // too recent
    await makeCase(c.id, { status: 'REJECTED', decisionAt: new Date(Date.now() - 10 * DAY) });

    expect(await runReviewInvites()).toBe(1);
    expect(await runReviewInvites()).toBe(0);
    const reviews = await prisma.review.findMany();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ caseId: old.id, userId: a.id, status: 'REQUESTED', locale: 'de' });
    expect(reviews[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const n = await prisma.notification.findFirst({ where: { userId: a.id, type: 'REVIEW_INVITE' } });
    expect(n?.title).toBe('Teilen Sie Ihre Erfahrung');
    expect(n?.body).toContain('Hallo Aysel');
    // The in-app link never carries the token.
    expect(n?.link).toBe('/review');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: a.email, subject: 'Triad Vision · Teilen Sie Ihre Erfahrung' } }));
  });
});

describe('public review flow', () => {
  it('shows the invitation by token and accepts one submission', async () => {
    const { token, review, client } = await invited();
    const inv = await anon().get('/api/reviews/invite').query({ token });
    expect(inv.status).toBe(200);
    expect(inv.body).toMatchObject({ status: 'REQUESTED', firstName: 'Ali', lastInitial: 'M', profession: 'Truck driver' });
    expect(JSON.stringify(inv.body)).not.toContain(client.user.email);

    const admin = await asAdmin();
    const sub = await anon().post('/api/reviews/submit').send(validBody(token));
    expect(sub.status).toBe(201);
    const row = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(row).toMatchObject({ status: 'PENDING', rating: 5, consentPublish: true, displayName: 'Ali M., truck driver' });
    expect(row.submittedAt).not.toBeNull();

    // Admins are told about it.
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'STAFF', link: '/admin/reviews' } })).toBe(1);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: ADMIN_INBOX, subject: { contains: 'Yeni rəy' } } }));

    expect((await anon().post('/api/reviews/submit').send(validBody(token))).status).toBe(409);
    expect((await anon().get('/api/reviews/invite').query({ token })).body.status).toBe('PENDING');
  });

  it('validates the submission', async () => {
    const { token } = await invited();
    expect((await anon().post('/api/reviews/submit').send({ ...validBody(token), rating: 6 })).status).toBe(400);
    expect((await anon().post('/api/reviews/submit').send({ ...validBody(token), text: 'too short' })).status).toBe(400);
    expect((await anon().post('/api/reviews/submit').send({ ...validBody(token), text: 'x'.repeat(1501) })).status).toBe(400);
    expect((await anon().post('/api/reviews/submit').send({ ...validBody(token), displayName: '' })).status).toBe(400);
  });

  it('rejects unknown and expired tokens', async () => {
    expect((await anon().get('/api/reviews/invite').query({ token: 'x'.repeat(43) })).status).toBe(404);
    const { token } = await invited({ createdAt: new Date(Date.now() - 61 * DAY) });
    expect((await anon().get('/api/reviews/invite').query({ token })).status).toBe(410);
    expect((await anon().post('/api/reviews/submit').send(validBody(token))).status).toBe(410);
    // No token and no session
    expect((await anon().get('/api/reviews/invite')).status).toBe(401);
  });

  it('lets the logged-in candidate answer without the token', async () => {
    const { client, review } = await invited();
    const inv = await client.agent.get('/api/reviews/invite');
    expect(inv.status).toBe(200);
    expect(inv.body.status).toBe('REQUESTED');
    expect((await client.agent.post('/api/reviews/submit').send(validBody())).status).toBe(201);
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('PENDING');
    // Another user cannot see it.
    const other = await asClient();
    expect((await other.agent.get('/api/reviews/invite')).status).toBe(404);
  });
});

describe('moderation and public list', () => {
  it('staff can read, only admins moderate; approved + consented reviews become public', async () => {
    const a = await invited();
    const b = await invited();
    const c = await invited();
    await anon().post('/api/reviews/submit').send({ ...validBody(a.token), rating: 5 });
    await anon().post('/api/reviews/submit').send({ ...validBody(b.token), rating: 4, consentPublish: false });
    await anon().post('/api/reviews/submit').send({ ...validBody(c.token), rating: 2 });

    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient();
    expect((await client.agent.get('/api/admin/reviews')).status).toBe(403);

    const list = await staff.agent.get('/api/admin/reviews');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(3);
    expect(list.body.items[0].tokenHash).toBeUndefined();
    expect(list.body.items[0].case.number).toMatch(/^TV-R-/);
    expect(list.body.summary.byStatus).toEqual({ PENDING: 3 });
    expect((await staff.agent.patch(`/api/admin/reviews/${a.review.id}`).send({ status: 'APPROVED' })).status).toBe(403);

    const edited = await admin.agent.patch(`/api/admin/reviews/${a.review.id}`).send({ status: 'APPROVED', displayName: 'Ali M., LKW-Fahrer' });
    expect(edited.status).toBe(200);
    expect(edited.body.item.tokenHash).toBeUndefined();
    expect((await admin.agent.patch(`/api/admin/reviews/${b.review.id}`).send({ status: 'APPROVED' })).status).toBe(200);
    expect((await admin.agent.patch(`/api/admin/reviews/${c.review.id}`).send({ status: 'APPROVED' })).status).toBe(200);

    const pub = await anon().get('/api/reviews/public');
    expect(pub.status).toBe(200);
    // b did not consent to publication
    expect(pub.body.count).toBe(2);
    expect(pub.body.average).toBe(3.5);
    expect(pub.body.items.map((i: { displayName: string }) => i.displayName)).toContain('Ali M., LKW-Fahrer');
    expect(pub.body.items[0]).not.toHaveProperty('userId');
    expect(pub.body.items[0]).not.toHaveProperty('caseId');
    expect(pub.headers['cache-control']).toContain('public');

    const page2 = await anon().get('/api/reviews/public').query({ page: 2, pageSize: 1 });
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.total).toBe(2);

    await admin.agent.patch(`/api/admin/reviews/${c.review.id}`).send({ status: 'REJECTED' });
    expect((await anon().get('/api/reviews/public')).body.count).toBe(1);

    expect((await admin.agent.get('/api/admin/reviews').query({ status: 'APPROVED' })).body.items).toHaveLength(2);
    expect((await admin.agent.patch(`/api/admin/reviews/${a.review.id}`).send({ text: 'short' })).status).toBe(400);
  });

  it('cannot moderate a review that was not submitted; resending rotates the token', async () => {
    const { review, token, client } = await invited();
    const admin = await asAdmin();
    expect((await admin.agent.patch(`/api/admin/reviews/${review.id}`).send({ status: 'APPROVED' })).status).toBe(409);

    expect((await admin.agent.post(`/api/admin/reviews/${review.id}/resend`)).status).toBe(200);
    expect((await anon().get('/api/reviews/invite').query({ token })).status).toBe(404);
    const row = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(row.tokenHash).not.toBe(hashReviewToken(token));
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'REVIEW_INVITE' } })).toBe(1);
    expect((await admin.agent.post('/api/admin/reviews/nope/resend')).status).toBe(404);
  });

  it('admins can invite an approved case manually', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const approved = await makeCase(client.user.id, { status: 'APPROVED', decisionAt: new Date() });
    const open = await makeCase(client.user.id, { status: 'DOCUMENTS_PENDING' });
    const cands = await admin.agent.get('/api/admin/reviews/candidates');
    expect(cands.body.items.map((x: { id: string }) => x.id)).toEqual([approved.id]);
    expect((await admin.agent.post('/api/admin/reviews/invite').send({ caseId: open.id })).status).toBe(409);
    expect((await admin.agent.post('/api/admin/reviews/invite').send({ caseId: approved.id })).status).toBe(201);
    expect((await admin.agent.post('/api/admin/reviews/invite').send({ caseId: approved.id })).status).toBe(409);
    expect(await prisma.review.count({ where: { caseId: approved.id, status: 'REQUESTED' } })).toBe(1);
  });
});
