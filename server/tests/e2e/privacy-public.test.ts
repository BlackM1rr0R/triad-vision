import { describe, expect, it } from 'vitest';
import { anon, asAdmin } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';

// Own file: the public form's limiter (3 per hour per IP) is shared by every request in this app instance.
describe('POST /api/privacy/public-request', () => {
  it('stores the email only, ignores honeypot submissions and is rate-limited to 3 per hour', async () => {
    const admin = await asAdmin();
    const body = { email: 'Visitor@Example.com', type: 'DELETION', message: 'Bitte alle meine Daten löschen.' };

    // Honeypot: looks like success, nothing stored (still counts towards the limit).
    expectStatus(await anon().post('/api/privacy/public-request').send({ ...body, website: 'http://spam' }), 201);
    expect(await prisma.privacyRequest.count()).toBe(0);

    expectStatus(await anon().post('/api/privacy/public-request').send({ ...body, message: 'x' }), 400);

    expectStatus(await anon().post('/api/privacy/public-request').send(body), 201);
    const r = await prisma.privacyRequest.findFirstOrThrow();
    expect(r).toMatchObject({ email: 'visitor@example.com', userId: null, type: 'DELETION', status: 'OPEN' });
    expect(await prisma.notification.count({ where: { userId: admin.user.id, link: `/admin/privacy-requests/${r.id}` } })).toBe(1);
    await emailsTo('visitor@example.com');

    const limited = await anon().post('/api/privacy/public-request').send(body);
    expect(limited.status).toBe(429);
    expect(await prisma.privacyRequest.count()).toBe(1);
  });
});
