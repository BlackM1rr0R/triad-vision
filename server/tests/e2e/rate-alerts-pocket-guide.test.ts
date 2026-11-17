import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asAdmin, asClient, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser, pageCount } from '../helpers/files';
import { config } from '../../src/config.js';
import { alertToken } from '../../src/lib/rateAlerts/logic.js';
import { purgeRateAlerts, runRateAlerts } from '../../src/lib/rateAlerts/service.js';
import type { EurAzn } from '../../src/lib/life/cbar.js';

/**
 * EUR → AZN rate alerts (routes/rateAlerts.ts, lib/rateAlerts): double opt-in with honeypot and the 3-per-address
 * limit, the job (one e-mail when met, then paused, never twice a Baku day, stale rate ignored, 6-month expiry with
 * notice), manage / re-arm / unsubscribe (also RFC 8058 one-click), portal alerts without opt-in, consent log,
 * privacy export / erasure, admin count. Pocket guide PDF (routes/pocketGuide.ts): public download and the
 * personalised portal version.
 */

const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; html: string; headers?: Record<string, string> }[] }));
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...orig,
    sendMailDetailed: async (msg: { to: string; subject: string; html: string; headers?: Record<string, string> }) => {
      mail.sent.push(msg);
      return orig.sendMailDetailed(msg);
    },
  };
});

const DAY = 24 * 60 * 60 * 1000;
const rate = (r: number, o: Partial<EurAzn> = {}): EurAzn => ({ rate: r, date: '2026-11-22', fetchedAt: new Date().toISOString(), stale: false, source: 'CBAR', ...o });

beforeEach(() => {
  mail.sent = [];
});

describe('rate alerts', () => {
  it('double opt-in, fires once then pauses, re-arm, unsubscribe one-click, consent log, purge', async () => {
    // Consent required; honeypot stores nothing; implausible target rejected.
    await anon().post('/api/rate-alerts').send({ email: 'a@test.local', direction: 'gte', target: 2 }).expect(400);
    await anon().post('/api/rate-alerts').send({ email: 'bot@test.local', direction: 'gte', target: 2, consent: true, website: 'x' }).expect(201);
    await anon().post('/api/rate-alerts').send({ email: 'a@test.local', direction: 'gte', target: 40, consent: true }).expect(400);
    expect(await prisma.rateAlert.count()).toBe(0);

    const res = await anon().post('/api/rate-alerts').send({ email: 'Saver@Test.local', direction: 'gte', target: 2.05, consent: true, lng: 'de' }).expect(201);
    expect(res.body.confirmed).toBe(false);
    const alert = await prisma.rateAlert.findFirstOrThrow({ where: { email: 'saver@test.local' } });
    expect(alert).toMatchObject({ direction: 'gte', target: 2.05, locale: 'de', confirmedAt: null, consentVersion: expect.any(String) });
    const confirmMail = mail.sent.find((m) => m.to === 'saver@test.local')!;
    expect(confirmMail.subject).toBe('Bitte bestätigen Sie Ihren Euro-Kursalarm');
    expect(confirmMail.html).toContain(`${new URL(config.clientUrl).origin}/de/rate-alert?token=`);

    // Unconfirmed: nothing fires.
    expect((await runRateAlerts(new Date(), rate(2.1))).sent).toBe(0);

    const token = alertToken(alert.id);
    await anon().post('/api/rate-alerts/confirm').send({ token: `${token}x` }).expect(404);
    const confirmed = await anon().post('/api/rate-alerts/confirm').send({ token }).expect(200);
    expect(confirmed.body.alert).toMatchObject({ state: 'active', email: expect.stringContaining('@test.local'), target: 2.05 });
    expect(confirmed.body.alert.email).not.toBe('saver@test.local'); // masked
    expect(await prisma.consentRecord.count({ where: { email: 'saver@test.local', type: 'RATE_ALERT', granted: true } })).toBe(1);

    // Below target / stale rate: nothing.
    mail.sent = [];
    expect((await runRateAlerts(new Date(), rate(2.0))).sent).toBe(0);
    expect(await runRateAlerts(new Date(), rate(2.2, { stale: true }))).toMatchObject({ sent: 0, skipped: 'STALE' });

    // Met: one e-mail with rate, date, calculator link and one-click headers; then paused.
    const now = new Date();
    now.setUTCHours(8, 0, 0, 0); // midday in Baku: "+1 minute" below stays on the same Baku day
    expect((await runRateAlerts(now, rate(2.0612))).sent).toBe(1);
    const fired = mail.sent.find((m) => m.to === 'saver@test.local')!;
    expect(fired.subject).toBe('Ihr Kursziel ist erreicht: 1 EUR = 2,0612 AZN');
    expect(fired.html).toContain('22.11.2026');
    expect(fired.html).toContain('/de/send-money-home?utm_source=rate-alert');
    expect(fired.headers?.['List-Unsubscribe']).toContain('/api/rate-alerts/unsubscribe/');
    expect(fired.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(await prisma.rateAlert.findUniqueOrThrow({ where: { id: alert.id } })).toMatchObject({ lastRate: 2.0612, lastRateDate: '2026-11-22', sentCount: 1, pausedAt: expect.any(Date) });
    expect((await runRateAlerts(now, rate(2.07))).sent).toBe(0); // paused

    // Re-armed the same day: still no second e-mail that Baku day.
    const rearmed = await anon().post('/api/rate-alerts/rearm').send({ token, target: 2.06 }).expect(200);
    expect(rearmed.body.alert).toMatchObject({ state: 'active', target: 2.06 });
    expect((await runRateAlerts(new Date(now.getTime() + 60_000), rate(2.07))).sent).toBe(0);
    expect((await runRateAlerts(new Date(now.getTime() + DAY + 60_000), rate(2.07))).sent).toBe(1);

    // RFC 8058 one-click unsubscribe; logged as a withdrawal.
    await anon().post(`/api/rate-alerts/unsubscribe/${encodeURIComponent(token)}`).type('form').send('List-Unsubscribe=One-Click').expect(200);
    expect((await prisma.rateAlert.findUniqueOrThrow({ where: { id: alert.id } })).unsubscribedAt).not.toBeNull();
    expect(await prisma.consentRecord.count({ where: { email: 'saver@test.local', type: 'RATE_ALERT', granted: false } })).toBe(1);
    const manage = await anon().get('/api/rate-alerts/manage').query({ token }).expect(200);
    expect(manage.body.alert.state).toBe('unsubscribed');

    // Purge: unsubscribed after 30 days, unconfirmed after 7.
    await anon().post('/api/rate-alerts').send({ email: 'later@test.local', direction: 'lte', target: 1.8, consent: true }).expect(201);
    expect(await purgeRateAlerts(new Date(Date.now() + 8 * DAY))).toBe(1);
    expect(await purgeRateAlerts(new Date(Date.now() + 31 * DAY))).toBe(1);
    expect(await prisma.rateAlert.count()).toBe(0);
  });

  it('at most 3 per address; 6-month expiry with a notice and one-click extension', async () => {
    for (const target of [2, 2.1, 2.2]) await anon().post('/api/rate-alerts').send({ email: 'max@test.local', direction: 'gte', target, consent: true }).expect(201);
    const over = await anon().post('/api/rate-alerts').send({ email: 'max@test.local', direction: 'gte', target: 2.3, consent: true }).expect(409);
    expect(over.body.error ?? over.body.code).toBe('TOO_MANY_ALERTS');

    const a = await prisma.rateAlert.findFirstOrThrow({ where: { email: 'max@test.local' }, orderBy: { createdAt: 'asc' } });
    await anon().post('/api/rate-alerts/confirm').send({ token: alertToken(a.id) }).expect(200);
    const later = new Date(Date.now() + 200 * DAY);
    mail.sent = [];
    const run = await runRateAlerts(later, rate(1.5));
    expect(run.expired).toBe(1);
    const notice = mail.sent.find((m) => m.to === 'max@test.local')!;
    expect(notice.subject).toBe('Avro məzənnəsi bildirişinizin müddəti bitdi');
    expect(notice.html).toContain('action=rearm');
    expect((await runRateAlerts(later, rate(2.5))).sent).toBe(0); // expired alerts never fire
    const ext = await anon().post('/api/rate-alerts/rearm').send({ token: alertToken(a.id) }).expect(200);
    expect(ext.body.alert.state).toBe('active');
  });

  it('portal alerts (no opt-in e-mail), privacy export / erasure, account deletion, admin count', async () => {
    const client = await asClient();
    await anon().get('/api/rate-alerts/mine').expect(401);
    const created = await client.agent.post('/api/rate-alerts/mine').send({ direction: 'lte', target: 1.85, lng: 'ru' }).expect(201);
    expect(created.body.alert).toMatchObject({ state: 'active', direction: 'lte', target: 1.85 });
    expect(mail.sent.filter((m) => m.to === client.user.email.toLowerCase())).toHaveLength(0);
    // The public form with the client's own address: confirmed at once.
    const own = await client.agent.post('/api/rate-alerts').send({ email: client.user.email, direction: 'gte', target: 2.2, consent: true }).expect(201);
    expect(own.body.confirmed).toBe(true);
    const list = await client.agent.get('/api/rate-alerts/mine').expect(200);
    expect(list.body.items).toHaveLength(2);

    // Fires to the account address.
    expect((await runRateAlerts(new Date(), rate(1.8))).sent).toBe(1);
    expect(mail.sent.some((m) => m.to === client.user.email && m.subject.startsWith('Курс достиг вашей цели'))).toBe(true);

    // Other clients cannot touch it.
    const other = await asClient();
    await other.agent.delete(`/api/rate-alerts/mine/${created.body.alert.id}`).expect(404);

    // Art. 15 export of the account.
    const exp = await client.agent.get('/api/account/export').expect(200);
    expect(exp.body.rateAlerts).toHaveLength(2);

    // Admin → Life in Germany: counts only.
    const admin = await asAdmin();
    const settings = await admin.agent.get('/api/admin/life/settings').expect(200);
    expect(settings.body.rateAlerts).toEqual({ active: 1, paused: 1, pending: 0 });

    // Privacy tools (by e-mail) export and erase a visitor's alerts.
    await anon().post('/api/rate-alerts').send({ email: 'visitor@test.local', direction: 'gte', target: 2, consent: true }).expect(201);
    const sa = await asSuperAdmin();
    const pe = await sa.agent.get('/api/admin/privacy/inquiries').query({ email: 'visitor@test.local' }).expect(200);
    expect(pe.body.rateAlerts).toHaveLength(1);
    const er = await sa.agent.post('/api/admin/privacy/inquiries/erase').send({ email: 'visitor@test.local' }).expect(200);
    expect(er.body.rateAlerts).toBe(1);

    // Deleting the account removes its alerts.
    await sa.agent.delete(`/api/admin/users/${client.user.id}`).send({ confirmEmail: client.user.email }).expect(200);
    expect(await prisma.rateAlert.count({ where: { userId: client.user.id } })).toBe(0);
  });
});

describe('pocket guide PDF', () => {
  it('public download per language / layout; personalised version for clients only', async () => {
    const a5 = await anon().get('/api/pocket-guide/pdf').query({ lng: 'ru', layout: 'a5' }).buffer(true).parse(binaryParser).expect(200);
    expect(a5.headers['content-type']).toContain('application/pdf');
    expect(await pageCount(a5.body as Buffer)).toBe(16);
    expect(a5.headers['content-disposition']).toContain('germany-pocket-guide-ru-a5.pdf');
    expect(a5.headers['cache-control']).toContain('public');
    const booklet = await anon().get('/api/pocket-guide/pdf').query({ lng: 'de', layout: 'booklet' }).buffer(true).parse(binaryParser).expect(200);
    expect(booklet.headers['content-disposition']).toContain('a4-booklet');
    expect(await pageCount(booklet.body as Buffer)).toBe(8);

    await anon().get('/api/pocket-guide/mine').expect(401);
    const admin = await asAdmin();
    await admin.agent.get('/api/pocket-guide/mine').expect(403);
    const client = await asClient();
    const mine = await client.agent.get('/api/pocket-guide/mine').query({ lng: 'az' }).buffer(true).parse(binaryParser).expect(200);
    expect(mine.headers['cache-control']).toContain('no-store');
    expect(mine.headers['content-disposition']).toContain('-personal.pdf');
  }, 60_000);
});
