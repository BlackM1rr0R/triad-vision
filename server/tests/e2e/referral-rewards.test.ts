import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, ORIGIN } from '../helpers/api';
import { uniq } from '../helpers/factories';
import { emailsTo, prisma } from '../helpers/db';
import { binaryParser, PNG_BUFFER } from '../helpers/files';
import { REFERRAL_DEFAULTS, syncReferrals } from '../../src/lib/growth/referral.js';

// Client referral programme extras: case-opened amount, tier bonus, friend discount, campaign multiplier,
// stage notifications, the admin leaderboard (+ CSV), bulk settlement and the suspicious list; sharing tools
// (landing page, profession messages, QR card, terms, payout receipts and the accounting CSV).

const DAY = 24 * 60 * 60 * 1000;
const bakuDay = (offsetDays = 0) => new Date(Date.now() + 4 * 60 * 60 * 1000 + offsetDays * DAY).toISOString().slice(0, 10);

let seq = 0;
const register = (code: string) => {
  seq++;
  return anon()
    .post('/api/auth/register')
    .set('Origin', ORIGIN)
    .send({
      email: `rr${Date.now()}${seq}@test.local`,
      password: 'Password123',
      firstName: `Friend${seq}`,
      lastName: 'Person',
      phone: `+994 55 ${String(200 + seq).padStart(3, '0')} 33 ${String(10 + seq).slice(-2)}`,
      birthDate: '1994-05-01',
      passportNumber: `C${String(20000000 + seq * 7907)}`,
      ref: code,
    })
    .expect(201);
};
const openCase = (clientId: string, status?: 'APPROVED') =>
  prisma.case.create({ data: { number: uniq('TV-'), clientId, profession: 'Driver', ...(status ? { status, decisionAt: new Date() } : {}) } });

describe('referral rewards: rules, notifications, leaderboard', () => {
  it('applies the extras, notifies once, ranks the referrer and settles in bulk', async () => {
    const admin = await asAdmin();
    await admin.agent
      .put('/api/admin/growth/referrals/settings')
      .send({
        ...REFERRAL_DEFAULTS,
        caseOpenedBonus: 20,
        tiers: [{ approved: 2, bonus: 50 }],
        friendDiscount: { enabled: true, amount: 30 },
        campaign: { enabled: true, multiplier: 2, startsAt: bakuDay(-1), endsAt: bakuDay(1), label: { az: 'Kampaniya', de: 'Aktion', en: 'Campaign', ru: 'Акция' } },
      })
      .expect(200);

    const referrer = await asClient({ firstName: 'Ref', locale: 'en', phone: '+994 50 444 33 22' });
    const mine = await referrer.agent.get('/api/growth/referral').expect(200);
    expect(mine.body.rule).toMatchObject({ caseOpenedBonus: 40, friendDiscount: 30, campaign: { multiplier: 2 } });
    expect(mine.body.progress).toEqual({ approved: 0, next: { approved: 2, bonus: 50, remaining: 2 } });

    const f1 = (await register(mine.body.code)).body.user;
    const f2 = (await register(mine.body.code)).body.user;
    const main = await prisma.referralReward.findMany({ where: { type: 'REFERRAL', referrerId: referrer.user.id } });
    expect(main.map((r) => r.amount)).toEqual([200, 200]); // campaign × 2

    // Double-sided: the friend sees their own discount.
    const friendRow = await prisma.referralReward.findFirst({ where: { type: 'FRIEND', referrerId: f1.id } });
    expect(friendRow).toMatchObject({ amount: 30, status: 'EARNED', kind: 'DISCOUNT' });

    // Friend 1 opens a case → case-opened amount (earned message only, no separate stage message).
    await openCase(f1.id);
    expect(await syncReferrals()).toBe(1);
    // Friend 2 is approved straight away → main reward + case-opened amount.
    await openCase(f2.id, 'APPROVED');
    expect(await syncReferrals()).toBe(2);
    expect(await prisma.notification.count({ where: { userId: referrer.user.id, type: 'REFERRAL_STAGE' } })).toBe(0);
    // Friend 1 approved → main reward, and 2 approved friends cross the tier (bonus × 2 in the campaign).
    await prisma.case.updateMany({ where: { clientId: f1.id }, data: { status: 'APPROVED', decisionAt: new Date() } });
    expect(await syncReferrals()).toBe(2);
    expect(await syncReferrals()).toBe(0); // idempotent
    const tier = await prisma.referralReward.findFirst({ where: { type: 'TIER', referrerId: referrer.user.id } });
    expect(tier).toMatchObject({ amount: 100, status: 'EARNED', dedupeKey: `TIER:${referrer.user.id}:2` });
    expect(await prisma.notification.count({ where: { userId: referrer.user.id, type: 'REFERRAL_EARNED' } })).toBe(5);
    const mails = await emailsTo(referrer.user.email, 5);
    expect(mails.some((m) => m.subject.includes('You earned a bonus'))).toBe(true);

    // The referrer's portal: masked names, bonuses, totals — and nothing private about the friends.
    const portal = await referrer.agent.get('/api/growth/referral').expect(200);
    expect(portal.body.totals).toMatchObject({ earned: 580, pending: 0, settled: 0 });
    expect(portal.body.tierBonuses).toEqual([expect.objectContaining({ approved: 2, amount: 100 })]);
    expect(portal.body.progress).toEqual({ approved: 2, next: null });
    expect(portal.body.referrals.map((r: { name: string }) => r.name).sort()).toEqual(['Friend1 P.', 'Friend2 P.']);
    expect(portal.body.referrals[0].bonus).toMatchObject({ amount: 40, status: 'EARNED' });
    expect(JSON.stringify(portal.body)).not.toContain(f1.email);
    expect(portal.body.welcome).toBeNull(); // the referrer was not referred themself

    // Leaderboard + CSV (staff may read, only admins settle).
    const staff = await asStaff();
    const board = await staff.agent.get('/api/admin/growth/referrals/leaderboard').query({ from: bakuDay(-1), to: bakuDay(1) }).expect(200);
    expect(board.body.rows).toHaveLength(1);
    expect(board.body.rows[0]).toMatchObject({ referrerId: referrer.user.id, registered: 2, caseOpened: 2, visaApproved: 2, earned: 580, outstanding: 580, settled: 0 });
    const empty = await staff.agent.get('/api/admin/growth/referrals/leaderboard').query({ from: bakuDay(5), to: bakuDay(6) }).expect(200);
    // Nothing happened in that period; only what is owed now ignores the period.
    expect(empty.body.rows).toEqual([expect.objectContaining({ registered: 0, visaApproved: 0, earned: 0, outstanding: 580 })]);
    await staff.agent.get('/api/admin/growth/referrals/leaderboard').query({ from: '2026-02-30' }).expect(400);
    const csv = await admin.agent.get('/api/admin/growth/referrals/leaderboard.csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(referrer.user.email);
    await staff.agent.post('/api/admin/growth/referrals/rewards/settle').send({ referrerId: referrer.user.id }).expect(403);
    await admin.agent.post('/api/admin/growth/referrals/rewards/settle').send({}).expect(400);

    const settled = await admin.agent.post('/api/admin/growth/referrals/rewards/settle').send({ referrerId: referrer.user.id, note: 'October' }).expect(200);
    expect(settled.body).toEqual({ paid: 0, used: 5, total: 580 });
    expect(await prisma.auditLog.count({ where: { action: 'REFERRAL_REWARDS_SETTLED' } })).toBe(1);
    const again = await admin.agent.post('/api/admin/growth/referrals/rewards/settle').send({ referrerId: referrer.user.id }).expect(200);
    expect(again.body.used).toBe(0);
    const after = await admin.agent.get('/api/admin/growth/referrals/leaderboard').expect(200);
    expect(after.body.rows[0]).toMatchObject({ settled: 580, outstanding: 0 });
    expect((await referrer.agent.get('/api/growth/referral').expect(200)).body.totals.settled).toBe(580);

    // The friend discount is settled on its own (USED when applied to the friend's fee).
    const ledger = await admin.agent.get('/api/admin/growth/referrals').expect(200);
    const friendBonus = ledger.body.bonuses.find((b: { type: string; referrerId: string }) => b.type === 'FRIEND' && b.referrerId === f1.id);
    await admin.agent.patch(`/api/admin/growth/referrals/rewards/${friendBonus.id}`).send({ status: 'USED' }).expect(200);
  });

  it('tells the referrer about a stage once and lists blocked referrals', async () => {
    const referrer = await asClient({ locale: 'de', phone: '+994 50 777 66 55' });
    const { body } = await referrer.agent.get('/api/growth/referral').expect(200);
    const friend = (await register(body.code)).body.user;
    await openCase(friend.id);
    await syncReferrals();
    await syncReferrals();
    const notes = await prisma.notification.findMany({ where: { userId: referrer.user.id, type: 'REFERRAL_STAGE' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Ihre Empfehlung hat einen Antrag gestartet');

    // Admin blocks the referral: its pending reward is cancelled and it shows on the suspicious list.
    const admin = await asAdmin();
    const ref = await prisma.clientReferral.findUniqueOrThrow({ where: { referredId: friend.id } });
    await admin.agent.post(`/api/admin/growth/referrals/${ref.id}/block`).send({ note: 'fake account' }).expect(200);
    await admin.agent.post(`/api/admin/growth/referrals/${ref.id}/block`).send({}).expect(400);
    expect(await prisma.referralReward.findFirst({ where: { referralId: ref.id } })).toMatchObject({ status: 'CANCELLED' });
    const sus = await admin.agent.get('/api/admin/growth/referrals/suspicious').expect(200);
    expect(sus.body.blocked).toEqual([expect.objectContaining({ id: ref.id, blockedReason: 'MANUAL' })]);
    expect(sus.body.bursts).toEqual([]);
    const staff = await asStaff();
    await staff.agent.post(`/api/admin/growth/referrals/${ref.id}/block`).send({}).expect(403);
  });
});

describe('referral sharing: landing page, messages, card, terms, receipts, payout report', () => {
  it('runs the opt-in landing page and the share tools end to end', async () => {
    const referrer = await asClient({ firstName: 'Aynur', lastName: 'Məmmədova', locale: 'az', phone: '+994 50 888 77 66' });
    const share = await referrer.agent.get('/api/growth/referral/share').expect(200);
    expect(share.body.landing).toMatchObject({ enabled: false, slug: null });
    const nurse = share.body.templates.find((x: { key: string }) => x.key === 'nurse');
    expect(nurse.text.az).toContain(share.body.link);
    expect(nurse.text.ru).toContain('/register?ref=');

    // Landing page: needs a valid, free slug; public only while enabled; first name only; noindex.
    await referrer.agent.put('/api/growth/referral/landing').send({ enabled: true }).expect(400);
    await referrer.agent.put('/api/growth/referral/landing').send({ enabled: true, slug: 'admin' }).expect(400);
    await anon().get('/api/growth/r/aynur-baku').expect(404);
    const saved = await referrer.agent.put('/api/growth/referral/landing').send({ enabled: true, slug: 'Aynur Bakı', quote: 'Mən Almaniyaya getdim' }).expect(200);
    expect(saved.body.landing).toMatchObject({ enabled: true, slug: 'aynur-baki', url: expect.stringContaining('/r/aynur-baki') });
    const other = await asClient({ phone: '+994 50 111 22 99' });
    await other.agent.put('/api/growth/referral/landing').send({ enabled: true, slug: 'aynur-baki' }).expect(409);
    const page = await anon().get('/api/growth/r/aynur-baki').expect(200);
    expect(page.headers['x-robots-tag']).toContain('noindex');
    expect(page.body).toMatchObject({ firstName: 'Aynur', quote: 'Mən Almaniyaya getdim', photoUrl: null });
    expect(JSON.stringify(page.body)).not.toContain('Məmmədova');
    // Share messages now carry the landing page.
    expect((await referrer.agent.get('/api/growth/referral/share').expect(200)).body.link).toContain('/r/aynur-baki');
    const photo = await referrer.agent.post('/api/growth/referral/landing/photo').attach('file', PNG_BUFFER, { filename: 'me.png', contentType: 'image/png' }).expect(200);
    expect(photo.body.photoUrl).toMatch(/^\/uploads\/referral\/[a-f0-9]{32}\.jpg$/);
    await referrer.agent.post('/api/growth/referral/landing/photo').attach('file', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
    await referrer.agent.delete('/api/growth/referral/landing/photo').expect(200);
    await referrer.agent.put('/api/growth/referral/landing').send({ enabled: false }).expect(200);
    await anon().get('/api/growth/r/aynur-baki').expect(404);

    // QR card PDFs.
    for (const layout of ['single', 'sheet']) {
      const pdf = await referrer.agent.get('/api/growth/referral/card.pdf').query({ layout }).buffer(true).parse(binaryParser).expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }

    // Templates (staff edit) and terms (admin edit, public page).
    const staff = await asStaff();
    const tpl = await staff.agent.get('/api/admin/growth/referrals/templates').expect(200);
    await staff.agent
      .put('/api/admin/growth/referrals/templates')
      .send({ items: [{ key: 'welder', label: { az: 'Qaynaqçı', de: 'Schweißer', en: 'Welder', ru: 'Сварщик' }, text: { az: 'Qaynaqçılar lazımdır {link}', de: 'x {link}', en: 'x {link}', ru: 'x {link}' } }, ...tpl.body.items] })
      .expect(200);
    const updated = await referrer.agent.get('/api/growth/referral/share').expect(200);
    expect(updated.body.templates[0]).toMatchObject({ key: 'welder', text: { az: expect.stringContaining('Qaynaqçılar lazımdır http') } });
    await staff.agent.put('/api/admin/growth/referrals/terms').send({ body: { az: 'a', de: 'd', en: 'e', ru: 'r' } }).expect(403);
    const admin = await asAdmin();
    await admin.agent.put('/api/admin/growth/referrals/terms').send({ body: { az: 'Şərtlər', de: 'Bedingungen', en: 'Terms', ru: 'Условия' } }).expect(200);
    const terms = await anon().get('/api/growth/referral-terms').expect(200);
    expect(terms.body).toMatchObject({ body: { az: 'Şərtlər' }, rule: { amount: 100, currency: 'AZN' } });

    // Cash payout → receipt (owner and admin only) and the accounting CSV.
    await admin.agent.put('/api/admin/growth/referrals/settings').send({ ...REFERRAL_DEFAULTS, kind: 'PAYOUT', trigger: 'CASE_OPENED' }).expect(200);
    const friend = (await register(share.body.link.split('ref=')[1])).body.user;
    await openCase(friend.id);
    await syncReferrals();
    const reward = await prisma.referralReward.findFirstOrThrow({ where: { referral: { referredId: friend.id } } });
    expect(reward).toMatchObject({ status: 'EARNED', kind: 'PAYOUT' });
    await referrer.agent.get(`/api/growth/referral/rewards/${reward.id}/receipt.pdf`).expect(404); // not paid yet
    await admin.agent.patch(`/api/admin/growth/referrals/rewards/${reward.id}`).send({ status: 'PAID', note: 'Bank' }).expect(200);
    const mine = await referrer.agent.get(`/api/growth/referral/rewards/${reward.id}/receipt.pdf`).buffer(true).parse(binaryParser).expect(200);
    expect((mine.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await other.agent.get(`/api/growth/referral/rewards/${reward.id}/receipt.pdf`).expect(404);
    await admin.agent.get(`/api/admin/growth/referrals/rewards/${reward.id}/receipt.pdf`).buffer(true).parse(binaryParser).expect(200);
    const csv = await admin.agent.get('/api/admin/growth/referrals/payouts.csv').expect(200);
    expect(csv.text).toContain(`RR-${new Date().getUTCFullYear()}-${reward.id.slice(-8).toUpperCase()}`);
    expect(csv.text).toContain(referrer.user.email);
    expect(csv.text).toContain('Bank');
    expect(await prisma.auditLog.count({ where: { action: 'REFERRAL_PAYOUTS_EXPORTED' } })).toBe(1);
  });
});
