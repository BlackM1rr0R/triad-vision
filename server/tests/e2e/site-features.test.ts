import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, ORIGIN } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { notifyUser } from '../../src/lib/notifications.js';
import { generateVapidKeys, setPushTransport, setVapidKeys, type PushRequest } from '../../src/lib/site/webPush.js';
import { LOCK } from '../../src/lib/site/publicStatus.js';

// ─── helpers ──────────────────────────────────────────────────────────

/** A browser's push keys (what PushManager.subscribe() creates). */
const browserKeys = () => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, p256dh: ecdh.getPublicKey('base64url'), authB64: auth.toString('base64url') };
};

/** Decrypts an aes128gcm push body the way the browser does (RFC 8291). */
const decrypt = (body: Buffer, ua: ReturnType<typeof browserKeys>) => {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  const shared = ua.ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.ecdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, ua.auth, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
  return JSON.parse(plain.subarray(0, plain.length - 1).toString('utf8'));
};

const verifyVapid = (authorization: string, publicKey: string, endpoint: string) => {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(authorization);
  expect(m).not.toBeNull();
  const [h, p, s] = m![1].split('.');
  expect(m![2]).toBe(publicKey);
  const pub = Buffer.from(publicKey, 'base64url');
  const key = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') },
    format: 'jwk',
  });
  expect(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  expect(claims.aud).toBe(new URL(endpoint).origin);
  expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
  expect(claims.sub).toMatch(/^mailto:/);
};

let n = 0;
const makeCase = async (clientId: string, status: 'DOCUMENTS_PENDING' | 'DECISION_PENDING' | 'APPROVED' = 'DOCUMENTS_PENDING') =>
  prisma.case.create({ data: { clientId, number: `TV-2026-${String(9000 + ++n)}`, profession: 'Aşpaz', status } });

const clientWithBirthDate = async (birthDate = '1990-05-17') => {
  const c = await asClient();
  await prisma.user.update({ where: { id: c.user.id }, data: { birthDate: new Date(`${birthDate}T00:00:00Z`) } });
  return c;
};

// ─── Web Push ─────────────────────────────────────────────────────────

describe('web push (PWA)', () => {
  const keys = { ...generateVapidKeys(), subject: 'mailto:test@triad-vision.de' };
  let sent: PushRequest[] = [];
  let answer = 201;
  beforeEach(() => {
    sent = [];
    answer = 201;
    setVapidKeys(keys);
    setPushTransport(async (req) => {
      sent.push(req);
      return { status: answer };
    });
  });
  afterEach(() => {
    setVapidKeys(undefined);
    setPushTransport(null);
  });

  const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

  it('publishes the public key; subscribing needs a session and a known push service', async () => {
    expect((await anon().get('/api/site/push/key')).body).toEqual({ publicKey: keys.publicKey });
    const ua = browserKeys();
    const body = { endpoint: ENDPOINT, keys: { p256dh: ua.p256dh, auth: ua.authB64 } };
    expect((await anon().post('/api/site/push/subscriptions').set('Origin', ORIGIN).send(body)).status).toBe(401);
    const me = await asClient();
    const evil = await me.agent.post('/api/site/push/subscriptions').send({ ...body, endpoint: 'https://169.254.169.254/latest' });
    expect(evil.status).toBe(400);
    expect((await me.agent.post('/api/site/push/subscriptions').send(body)).status).toBe(201);
    expect(await prisma.webPushSubscription.count({ where: { userId: me.user.id } })).toBe(1);
  });

  it('sends an encrypted, VAPID-signed notification through the regular push sender', async () => {
    const me = await asClient();
    const ua = browserKeys();
    await me.agent.post('/api/site/push/subscriptions').send({ endpoint: ENDPOINT, keys: { p256dh: ua.p256dh, auth: ua.authB64 } }).expect(201);

    await notifyUser(me.user.id, { type: 'TEST', title: 'Sənəd qəbul edildi', body: 'Pasport yoxlanıldı', link: '/account', email: false });
    await waitFor(async () => (sent.length ? sent : null));
    expect(sent).toHaveLength(1);
    const req = sent[0];
    expect(req.endpoint).toBe(ENDPOINT);
    expect(req.headers['Content-Encoding']).toBe('aes128gcm');
    expect(Number(req.headers.TTL)).toBeGreaterThan(0);
    verifyVapid(req.headers.Authorization, keys.publicKey, ENDPOINT);
    expect(decrypt(req.body, ua)).toMatchObject({ title: 'Sənəd qəbul edildi', body: 'Pasport yoxlanıldı', link: '/account' });
  });

  it('a browser follows the user who subscribed last, unsubscribe removes it, gone endpoints are dropped', async () => {
    const a = await asClient();
    const b = await asStaff();
    const ua = browserKeys();
    const body = { endpoint: ENDPOINT, keys: { p256dh: ua.p256dh, auth: ua.authB64 } };
    await a.agent.post('/api/site/push/subscriptions').send(body).expect(201);
    await b.agent.post('/api/site/push/subscriptions').send(body).expect(201);
    expect(await prisma.webPushSubscription.findMany({ select: { userId: true } })).toEqual([{ userId: b.user.id }]);

    // Someone else cannot remove it; the owner can.
    expect((await a.agent.delete('/api/site/push/subscriptions').send({ endpoint: ENDPOINT })).body.removed).toBe(0);
    expect((await b.agent.delete('/api/site/push/subscriptions').send({ endpoint: ENDPOINT })).body.removed).toBe(1);

    await a.agent.post('/api/site/push/subscriptions').send(body).expect(201);
    answer = 410;
    const res = await a.agent.post('/api/site/push/test');
    expect(res.body).toEqual({ sent: 0, removed: 1 });
    expect(await prisma.webPushSubscription.count()).toBe(0);
  });
});

// ─── Public status ────────────────────────────────────────────────────

describe('public status check', () => {
  const lookup = (caseNumber: string, birthDate: string, extra: Record<string, string> = {}) =>
    anon().post('/api/site/status/lookup').set('Origin', ORIGIN).send({ caseNumber, birthDate, ...extra });

  it('is off by default; the client turns it on and sees only the stage, the date and whose move it is', async () => {
    const me = await clientWithBirthDate();
    const c = await makeCase(me.user.id, 'DECISION_PENDING');
    // Off: same answer as a wrong date.
    expect((await lookup(c.number, '1990-05-17')).body.error).toBe('STATUS_NOT_FOUND');

    const mine = await me.agent.get('/api/site/status/mine');
    expect(mine.body.items).toEqual([{ caseId: c.id, number: c.number, enabled: false, hasLink: false, linkCreatedAt: null }]);
    await me.agent.put(`/api/site/status/mine/${c.id}`).send({ enabled: true }).expect(200);

    const res = await lookup(c.number.toLowerCase(), '1990-05-17');
    expect(res.status).toBe(200);
    expect(res.body.status).toEqual({
      caseNumber: c.number,
      step: 4,
      stepKey: 'decision',
      steps: 6,
      state: 'ACTIVE',
      ball: 'EMBASSY',
      lastUpdate: c.createdAt.toISOString().slice(0, 10),
    });
    // No personal data anywhere in the answer.
    const text = JSON.stringify(res.body);
    for (const s of ['Test', 'User', me.user.email, 'Aşpaz', '1990']) expect(text).not.toContain(s);

    expect((await lookup(c.number, '1990-05-18')).status).toBe(404);
    expect((await lookup('TV-2026-0000', '1990-05-17')).status).toBe(404);
    // Audited.
    // Lookups are audited fire-and-forget (the answer is never delayed by the audit write), so wait for the rows.
    await waitFor(async () => (await prisma.auditLog.count({ where: { action: 'PUBLIC_STATUS_LOOKUP' } })) >= 4);
    expect(await prisma.auditLog.count({ where: { action: 'PUBLIC_STATUS_LOOKUP' } })).toBe(4);
    expect(await prisma.auditLog.count({ where: { action: 'PUBLIC_STATUS_ENABLED', target: `case:${c.id}` } })).toBe(1);
  });

  it('locks a case number after 5 wrong tries in an hour, even for the right date', async () => {
    const me = await clientWithBirthDate();
    const c = await makeCase(me.user.id);
    await prisma.casePublicStatus.create({ data: { caseId: c.id, enabled: true } });
    for (let i = 0; i < LOCK.perCase; i++) expect((await lookup(c.number, `1980-01-0${i + 1}`)).status).toBe(404);
    const locked = await lookup(c.number, '1990-05-17');
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('STATUS_LOCKED');
    expect(locked.body.minutes).toBeGreaterThan(0);
    // An hour later the case can be checked again.
    await prisma.publicStatusAttempt.updateMany({ data: { createdAt: new Date(Date.now() - LOCK.windowMs - 1000) } });
    expect((await lookup(c.number, '1990-05-17')).status).toBe(200);
  });

  it('locks an IP that tries many case numbers; the honeypot never answers', async () => {
    const me = await clientWithBirthDate();
    const c = await makeCase(me.user.id);
    await prisma.casePublicStatus.create({ data: { caseId: c.id, enabled: true } });
    expect((await lookup(c.number, '1990-05-17', { website: 'http://spam' })).status).toBe(404);
    for (let i = 1; i < LOCK.perIp; i++) await lookup(`TV-2026-${1000 + i}`, '1990-05-17');
    expect((await lookup(c.number, '1990-05-17')).status).toBe(429);
  });

  it('family link: token instead of the birth date, no case number in the answer, revocable', async () => {
    const me = await clientWithBirthDate();
    const other = await asClient();
    const c = await makeCase(me.user.id, 'APPROVED');
    expect((await other.agent.post(`/api/site/status/mine/${c.id}/link`)).status).toBe(404);
    expect((await (await asStaff()).agent.get('/api/site/status/mine')).status).toBe(403);

    const created = await me.agent.post(`/api/site/status/mine/${c.id}/link`);
    expect(created.status).toBe(201);
    expect(created.body.path).toBe(`/status#k=${created.body.token}`);
    expect(created.body.item).toMatchObject({ enabled: true, hasLink: true });
    // Only the hash is stored.
    const row = await prisma.casePublicStatus.findUniqueOrThrow({ where: { caseId: c.id } });
    expect(row.tokenHash).not.toBe(created.body.token);

    const view = await anon().post('/api/site/status/link').set('Origin', ORIGIN).send({ token: created.body.token });
    expect(view.status).toBe(200);
    expect(view.body.status).toMatchObject({ caseNumber: null, step: 5, stepKey: 'result', state: 'COMPLETED', ball: 'NONE' });

    // Turning the switch off kills the link too.
    await me.agent.put(`/api/site/status/mine/${c.id}`).send({ enabled: false }).expect(200);
    expect((await anon().post('/api/site/status/link').set('Origin', ORIGIN).send({ token: created.body.token })).status).toBe(404);
    const again = await me.agent.post(`/api/site/status/mine/${c.id}/link`);
    await me.agent.delete(`/api/site/status/mine/${c.id}/link`).expect(200);
    expect((await anon().post('/api/site/status/link').set('Origin', ORIGIN).send({ token: again.body.token })).status).toBe(404);
  });
});

// ─── Problem reports ──────────────────────────────────────────────────

describe('problem reports', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const diag = {
    pageUrl: 'https://triad-vision.de/account/cases/x',
    appVersion: 'index-AbC123',
    userAgent: 'Mozilla/5.0 Test',
    screen: '390x844@3',
    language: 'az',
    consoleErrors: JSON.stringify(['TypeError: x is undefined', 'Unhandled rejection: NETWORK']),
    lastApiError: JSON.stringify({ method: 'POST', url: '/cases/x/documents', status: 500, code: 'INTERNAL' }),
  };

  it('a visitor reports with an image; a task is created for the admins; the admin answers by e-mail', async () => {
    const adm = await asAdmin();
    const res = await anon()
      .post('/api/site/problems')
      .set('Origin', ORIGIN)
      .field('message', 'Yükləmə düyməsi işləmir')
      .field('email', 'visitor@example.com')
      .field(diag)
      .attach('image', PNG, { filename: 'shot.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    const report = await prisma.problemReport.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(report).toMatchObject({ status: 'NEW', userId: null, contactEmail: 'visitor@example.com', appVersion: 'index-AbC123', imageMime: 'image/jpeg' });
    expect(report.consoleErrors).toEqual(['TypeError: x is undefined', 'Unhandled rejection: NETWORK']);
    expect(report.lastApiError).toMatchObject({ status: 500, code: 'INTERNAL' });

    const task = await prisma.task.findUniqueOrThrow({ where: { id: report.taskId! }, include: { assignees: true } });
    expect(task.title).toContain('Yükləmə düyməsi işləmir');
    expect(task.description).toContain(`/admin/problems?id=${report.id}`);
    expect(task.assignees.map((a) => a.userId)).toEqual([adm.user.id]);

    const list = await adm.agent.get('/api/site/admin/problems');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.counts.NEW).toBe(1);
    const img = await adm.agent.get(`/api/site/admin/problems/${report.id}/image`);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');

    const reply = await adm.agent.post(`/api/site/admin/problems/${report.id}/reply`).send({ message: 'Düzəltdik, təşəkkürlər!' });
    expect(reply.status).toBe(200);
    expect(reply.body.report.replies).toHaveLength(1);
    expect(reply.body.report.status).toBe('IN_PROGRESS');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: 'visitor@example.com' } }));

    const done = await adm.agent.patch(`/api/site/admin/problems/${report.id}`).send({ status: 'DONE', internalNote: 'fixed in build 42' });
    expect(done.body.report).toMatchObject({ status: 'DONE', internalNote: 'fixed in build 42' });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('DONE');
    expect(await prisma.auditLog.count({ where: { action: { in: ['PROBLEM_REPORTED', 'PROBLEM_REPLIED', 'PROBLEM_STATUS_CHANGED'] } } })).toBe(3);
  });

  it('logged-in reporter: user and role recorded, answer arrives as a notification; configured staff gets the task', async () => {
    const adm = await asAdmin();
    const helper = await asStaff();
    const otherStaff = await asStaff();
    await adm.agent.put('/api/site/admin/problems/settings').send({ assigneeId: helper.user.id }).expect(200);
    const me = await asClient({ locale: 'de' });
    const res = await me.agent.post('/api/site/problems').send({ message: 'Seite lädt nicht', ...diag });
    expect(res.status).toBe(201);
    const report = await prisma.problemReport.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(report).toMatchObject({ userId: me.user.id, userRole: 'CLIENT', contactEmail: null });
    const task = await prisma.task.findUniqueOrThrow({ where: { id: report.taskId! }, include: { assignees: true } });
    expect(task.assignees.map((a) => a.userId)).toEqual([helper.user.id]);

    // The configured staff member may handle reports; other staff and clients may not.
    expect((await helper.agent.get(`/api/site/admin/problems/${report.id}`)).status).toBe(200);
    expect((await otherStaff.agent.get('/api/site/admin/problems')).status).toBe(403);
    expect((await me.agent.get('/api/site/admin/problems')).status).toBe(403);
    expect((await helper.agent.put('/api/site/admin/problems/settings').send({ assigneeId: null })).status).toBe(403);

    await helper.agent.post(`/api/site/admin/problems/${report.id}/reply`).send({ message: 'Bitte erneut versuchen.' }).expect(200);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: me.user.id, type: 'PROBLEM_REPLY' } });
    expect(note.title).toBe('Antwort auf Ihre Problemmeldung');
    expect(note.body).toContain('Bitte erneut versuchen.');
  });

  it('validates, ignores the honeypot and limits reports per IP', async () => {
    expect((await anon().post('/api/site/problems').set('Origin', ORIGIN).send({ message: 'x', pageUrl: '/' })).status).toBe(400);
    const bot = await anon().post('/api/site/problems').set('Origin', ORIGIN).send({ message: 'Buy cheap stuff', pageUrl: '/', website: 'spam' });
    expect(bot.status).toBe(201);
    expect(await prisma.problemReport.count()).toBe(0);
    for (let i = 0; i < 5; i++) {
      expect((await anon().post('/api/site/problems').set('Origin', ORIGIN).send({ message: `Problem number ${i}`, pageUrl: '/' })).status).toBe(201);
    }
    expect((await anon().post('/api/site/problems').set('Origin', ORIGIN).send({ message: 'One more problem', pageUrl: '/' })).status).toBe(429);
    const bad = await anon()
      .post('/api/site/problems')
      .set('Origin', ORIGIN)
      .field('message', 'with a fake image')
      .field('pageUrl', '/')
      .attach('image', Buffer.from('not an image'), { filename: 'a.exe', contentType: 'application/x-msdownload' });
    expect([400, 429]).toContain(bad.status);
  });
});
