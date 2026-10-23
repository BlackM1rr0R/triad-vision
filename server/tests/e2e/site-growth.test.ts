import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, ORIGIN } from '../helpers/api';
import { createVisaCategory, l10n, uniq } from '../helpers/factories';
import { emailsTo, prisma } from '../helpers/db';
import { CALCULATOR_DEFAULTS, estimate, languageWeeks, parseLevel } from '../../src/lib/growth/calculator.js';
import { runEventReminders } from '../../src/lib/growth/events.js';
import { syncReferrals } from '../../src/lib/growth/referral.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ─── 1. Calculator ──────────────────────────────────────────────────────

describe('start-date calculator', () => {
  const cat = { id: 'x', slug: 'x', visaLabel: '§18b', germanLevel: 'B1', processingMin: 4, processingMax: 8 };

  it('sums language weeks per level step and parses levels', () => {
    expect(parseLevel('A2–B1')).toBe('A2');
    expect(parseLevel('none')).toBeNull();
    expect(parseLevel('C2')).toBe('C1');
    const per = CALCULATOR_DEFAULTS.weeksPerLevel;
    expect(languageWeeks('A0', 'B1', per)).toEqual([per.A1[0] + per.A2[0] + per.B1[0], per.A1[1] + per.A2[1] + per.B1[1]]);
    expect(languageWeeks('B1', 'B1', per)).toEqual([0, 0]);
    expect(languageWeeks('B2', 'A2', per)).toEqual([0, 0]);
  });

  it('runs preparation tracks in parallel, then embassy → processing → travel', () => {
    const s = CALCULATOR_DEFAULTS;
    const today = new Date('2026-11-01T00:00:00Z');
    const r = estimate({ category: cat, level: 'A0', documents: 'none', jobOffer: false, today }, s);
    expect(r.recognition).toBe(true); // §18b → recognition by default
    const lang = languageWeeks('A0', 'B1', s.weeksPerLevel);
    const prepMin = Math.max(lang[0], s.documents.none[0] + s.recognition[0], s.documents.none[0] + s.matching.withoutOffer[0]);
    const prepMax = Math.max(lang[1], s.documents.none[1] + s.recognition[1], s.documents.none[1] + s.matching.withoutOffer[1]);
    expect(r.totalWeeks).toEqual([prepMin + s.embassyWait[0] + 4 + s.travel[0], prepMax + s.embassyWait[1] + 8 + s.travel[1]]);
    const byKey = Object.fromEntries(r.stages.map((x) => [x.key, x]));
    expect(byKey.embassy.start).toEqual([prepMin, prepMax]);
    expect(byKey.processing.weeks).toEqual([4, 8]);
    expect(new Date(r.earliest).getTime() - today.getTime()).toBe(r.totalWeeks[0] * 7 * DAY);

    // Already B1, all documents, job offer, no recognition → much shorter, language skipped.
    const fast = estimate({ category: cat, level: 'B1', documents: 'all', recognition: false, jobOffer: true, today }, s);
    expect(fast.stages.find((x) => x.key === 'language')!.skipped).toBe(true);
    expect(fast.stages.find((x) => x.key === 'recognition')!.skipped).toBe(true);
    expect(fast.totalWeeks[1]).toBeLessThan(r.totalWeeks[0]);
  });

  it('public endpoints use the admin assumptions and the category processing time', async () => {
    const visa = await createVisaCategory({ slug: 'lkw', visaLabel: '§19c', germanLevel: 'A2', processingMin: 3, processingMax: 6 });
    const cfg = await anon().get('/api/growth/calculator').expect(200);
    expect(cfg.body.categories[0]).toMatchObject({ slug: 'lkw', targetLevel: 'A2', recognitionDefault: false });

    const admin = await asAdmin();
    const settings = { ...CALCULATOR_DEFAULTS, embassyWait: [10, 10], travel: [0, 0], verifiedAt: '2026-10-20' };
    await admin.agent.put('/api/admin/growth/calculator').send(settings).expect(200);
    await admin.agent.put('/api/admin/growth/calculator').send({ ...settings, travel: [3, 1] }).expect(400);
    const staff = await asStaff();
    await staff.agent.put('/api/admin/growth/calculator').send(settings).expect(403);

    const res = await anon().get(`/api/growth/calculator/estimate?category=${visa.id}&level=A2&documents=all&offer=1&recognition=0`).expect(200);
    const emb = res.body.stages.find((x: { key: string }) => x.key === 'embassy');
    expect(emb.weeks).toEqual([10, 10]);
    expect(res.body.stages.find((x: { key: string }) => x.key === 'processing').weeks).toEqual([3, 6]);
    await anon().get('/api/growth/calculator/estimate?category=lkw&level=C2&documents=all').expect(400);
    await anon().get('/api/growth/calculator/estimate?category=nope&level=A1&documents=all').expect(404);
  });
});

// ─── 2. Placement map ───────────────────────────────────────────────────

const approvedCase = async (city: string, profession: string, status: 'APPROVED' | 'DOCUMENTS_PENDING' = 'APPROVED') => {
  const u = await prisma.user.create({ data: { email: `${uniq('m')}@test.local`, passwordHash: 'x', firstName: 'A', lastName: 'B' } });
  const company = await prisma.company.create({ data: { name: 'Firma', city } });
  return prisma.case.create({ data: { number: uniq('TV-'), clientId: u.id, profession, status, companyId: company.id } });
};

describe('placement map', () => {
  it('publishes only cities with at least 3 workers, with admin overrides', async () => {
    for (let i = 0; i < 3; i++) await approvedCase('Hamburg', 'LKW-Fahrer');
    await approvedCase('hamburg, Deutschland', 'Lager');
    await approvedCase('Berlin', 'Koch');
    await approvedCase('Berlin', 'Koch');
    await approvedCase('Berlin', 'Koch', 'DOCUMENTS_PENDING'); // not counted

    let res = await anon().get('/api/growth/map').expect(200);
    expect(res.body.cities).toEqual([{ city: 'Hamburg', workers: 4, professions: ['LKW-Fahrer', 'Lager'], lat: null, lng: null }]);
    expect(JSON.stringify(res.body)).not.toContain('@test.local');

    const admin = await asAdmin();
    await admin.agent.post('/api/admin/growth/map/entries').send({ city: 'Berlin', mode: 'ADD', workers: 1 }).expect(201);
    await admin.agent.post('/api/admin/growth/map/entries').send({ city: 'München', mode: 'OVERRIDE', workers: 2 }).expect(201);
    res = await anon().get('/api/growth/map').expect(200);
    expect(res.body.cities.map((c: { city: string; workers: number }) => [c.city, c.workers])).toEqual([
      ['Hamburg', 4],
      ['Berlin', 3],
    ]);

    // Admin preview shows everything incl. the below-threshold city.
    const preview = await admin.agent.get('/api/admin/growth/map').expect(200);
    expect(preview.body.preview.find((c: { city: string }) => c.city === 'München')).toMatchObject({ workers: 2, published: false });

    // Threshold cannot be lowered below 3; map can be hidden.
    await admin.agent.put('/api/admin/growth/map/settings').send({ enabled: true, minPerCity: 2 }).expect(400);
    await admin.agent.put('/api/admin/growth/map/settings').send({ enabled: false }).expect(200);
    res = await anon().get('/api/growth/map').expect(200);
    expect(res.body).toMatchObject({ enabled: false, cities: [] });
  });
});

// ─── 3. Info sessions ───────────────────────────────────────────────────

const bakuParts = (d: Date) => {
  const local = new Date(d.getTime() + 4 * HOUR); // Asia/Baku has no DST (UTC+4)
  return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16) };
};

const createEvent = async (agent: Awaited<ReturnType<typeof asStaff>>['agent'], startsAt: Date, over: Record<string, unknown> = {}) => {
  const res = await agent
    .post('/api/admin/growth/events')
    .send({ title: l10n('Webinar'), description: l10n('About Germany'), mode: 'ONLINE', ...bakuParts(startsAt), durationMin: 60, status: 'PUBLISHED', ...over });
  expect(res.status).toBe(201);
  return res.body.event as { id: string; slug: string; meetingUrl: string; startsAt: string };
};

const reg = (over: Record<string, unknown> = {}) => ({ name: 'Ali Aliyev', email: 'ali@test.local', phone: '+994 50 111 22 33', locale: 'en', consent: true, ...over });

describe('info sessions', () => {
  it('registers, creates a lead once, sends the .ics, enforces capacity and hides the meeting link', async () => {
    const staff = await asStaff();
    const start = new Date(Math.floor((Date.now() + 3 * DAY) / 60000) * 60000);
    const ev = await createEvent(staff.agent, start, { capacity: 2 });
    expect(new Date(ev.startsAt).getTime()).toBe(start.getTime()); // Baku wall time → UTC
    expect(ev.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/TriadVision-/);

    const list = await anon().get('/api/growth/events').expect(200);
    expect(list.body.events).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('meet.jit.si');

    await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg({ consent: false })).expect(400);
    await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg()).expect(201);
    await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg()).expect(409);
    // Same phone, other e-mail → registration ok, but no second lead.
    await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg({ email: 'ali2@test.local', phone: '+994501112233' })).expect(201);
    const full = await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg({ email: 'x@test.local', phone: '' }));
    expect(full.body.error).toBe('EVENT_FULL');
    // Honeypot: looks fine, stores nothing.
    await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg({ email: 'bot@test.local', website: 'spam' })).expect(201);

    const leads = await prisma.inquiry.findMany();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ source: `event:${ev.id}`, email: 'ali@test.local' });
    const regs = await prisma.infoEventRegistration.findMany({ orderBy: { createdAt: 'asc' } });
    expect(regs.map((r) => r.inquiryId)).toEqual([leads[0].id, leads[0].id]);
    const mails = await emailsTo('ali@test.local');
    expect(mails[0].subject).toContain('Registration confirmed');
  });

  it('sends 24 h and 1 h reminders once each, marks attendance and follows up attendees', async () => {
    const staff = await asStaff();
    const start = new Date(Math.floor((Date.now() + 3 * DAY) / 60000) * 60000);
    const ev = await createEvent(staff.agent, start);
    await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg()).expect(201);
    await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg({ email: 'leyla@test.local', phone: '+994 55 000 00 01', locale: 'de' })).expect(201);

    expect(await runEventReminders(new Date(start.getTime() - 30 * HOUR))).toBe(0); // too early
    expect(await runEventReminders(new Date(start.getTime() - 20 * HOUR))).toBe(2);
    expect(await runEventReminders(new Date(start.getTime() - 19 * HOUR))).toBe(0); // idempotent
    expect(await runEventReminders(new Date(start.getTime() - 30 * 60 * 1000))).toBe(2);
    const de = await emailsTo('leyla@test.local', 3);
    expect(de.map((m) => m.subject).join(' | ')).toMatch(/Anmeldung bestätigt.*Morgen.*In 1 Stunde/);

    const detail = await staff.agent.get(`/api/admin/growth/events/${ev.id}`).expect(200);
    const [r1, r2] = detail.body.event.registrations;
    await staff.agent.patch(`/api/admin/growth/events/${ev.id}/registrations/${r1.id}`).send({ attendance: 'CHECKED_IN' }).expect(200);
    await staff.agent.patch(`/api/admin/growth/events/${ev.id}/registrations/${r2.id}`).send({ attendance: 'NO_SHOW' }).expect(200);

    // Follow-up only after the start, only to attendees, only once.
    await staff.agent.post(`/api/admin/growth/events/${ev.id}/follow-up`).send({ audience: 'attended' }).expect(400);
    await prisma.infoEvent.update({ where: { id: ev.id }, data: { startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - HOUR) } });
    const fu = await staff.agent.post(`/api/admin/growth/events/${ev.id}/follow-up`).send({ audience: 'attended' }).expect(200);
    expect(fu.body.sent).toBe(1);
    const again = await staff.agent.post(`/api/admin/growth/events/${ev.id}/follow-up`).send({ audience: 'all' }).expect(200);
    expect(again.body.sent).toBe(1); // only the no-show is left
    const mails = await emailsTo('ali@test.local', 4);
    expect(mails.some((m) => m.subject.includes('Thanks for attending'))).toBe(true);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'INFO_EVENT_ATTENDANCE' } });
    expect(audit).not.toBeNull();
  });

  it('cancelling notifies registrants; drafts are not public; clients cannot manage events', async () => {
    const staff = await asStaff();
    const draft = await createEvent(staff.agent, new Date(Date.now() + 5 * DAY), { status: 'DRAFT', mode: 'OFFLINE', address: 'Bakı ofisi, Nizami küç. 10' });
    await anon().get(`/api/growth/events/${draft.slug}`).expect(404);
    await anon().post(`/api/growth/events/${draft.slug}/register`).send(reg()).expect(404);
    const client = await asClient();
    await client.agent.post('/api/admin/growth/events').send({}).expect(403);

    const ev = await createEvent(staff.agent, new Date(Math.floor((Date.now() + 5 * DAY) / 60000) * 60000));
    await anon().post(`/api/growth/events/${ev.slug}/register`).send(reg()).expect(201);
    const full = await staff.agent.get(`/api/admin/growth/events/${ev.id}`).expect(200);
    const e = full.body.event;
    const res = await staff.agent
      .patch(`/api/admin/growth/events/${ev.id}`)
      .send({ title: e.title, description: e.description, mode: 'ONLINE', ...bakuParts(new Date(e.startsAt)), durationMin: 60, status: 'CANCELLED' })
      .expect(200);
    expect(res.body.notified).toBe(1);
    const mails = await emailsTo('ali@test.local', 2);
    expect(mails.some((m) => m.subject.includes('Event cancelled'))).toBe(true);
  });

  it('lists upcoming events in the sitemap', async () => {
    const staff = await asStaff();
    const ev = await createEvent(staff.agent, new Date(Date.now() + 4 * DAY));
    const res = await anon().get('/sitemap.xml').expect(200);
    expect(res.text).toContain(`/events/${ev.slug}`);
    expect(res.text).toContain('/calculator');
  });
});

// ─── 4. Client referrals ────────────────────────────────────────────────

let regSeq = 0;
const register = (over: Record<string, unknown> = {}, cookie?: string) => {
  regSeq++;
  const t = anon()
    .post('/api/auth/register')
    .set('Origin', ORIGIN)
    .send({
      email: `friend${Date.now()}${regSeq}@test.local`,
      password: 'Password123',
      firstName: 'Friend',
      lastName: 'Person',
      phone: `+994 70 ${String(100 + regSeq).padStart(3, '0')} 22 ${String(10 + regSeq).slice(-2)}`,
      birthDate: '1995-03-01',
      passportNumber: `C${String(10000000 + regSeq * 7919)}`,
      ...over,
    });
  return cookie ? t.set('Cookie', cookie) : t;
};

describe('client referral programme', () => {
  it('gives each client a code and attributes a sign-up via ?ref= cookie; reward PENDING → EARNED → PAID', async () => {
    const referrer = await asClient({ phone: '+994 50 999 88 77', firstName: 'Ref', locale: 'en' });
    const mine = await referrer.agent.get('/api/growth/referral').expect(200);
    expect(mine.body.code).toMatch(/^TV[A-Z2-9]{6}$/);
    expect(mine.body.link).toContain(`/register?ref=${mine.body.code}`);
    expect(mine.body.rule).toMatchObject({ trigger: 'VISA_APPROVED', amount: 100, currency: 'AZN' });

    const res = await register({}, `tv_ref=${mine.body.code}`);
    expect(res.status).toBe(201);
    const referredId = res.body.user.id;
    const ref = await prisma.clientReferral.findUnique({ where: { referredId }, include: { reward: true } });
    expect(ref).toMatchObject({ referrerId: referrer.user.id, stage: 'REGISTERED' });
    expect(ref!.reward).toMatchObject({ status: 'PENDING', amount: 100 });

    // Case opened → stage moves; visa approved → reward earned + referrer notified.
    const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: referredId, profession: 'Driver' } });
    await syncReferrals();
    expect((await prisma.clientReferral.findUnique({ where: { referredId } }))!.stage).toBe('CASE_OPENED');
    await prisma.case.update({ where: { id: c.id }, data: { status: 'APPROVED', decisionAt: new Date() } });
    const list = await referrer.agent.get('/api/growth/referral').expect(200);
    expect(list.body.referrals[0]).toMatchObject({ name: 'Friend P.', stage: 'VISA_APPROVED', reward: { status: 'EARNED' } });
    expect(list.body.totals.earned).toBe(100);
    expect(await prisma.notification.count({ where: { userId: referrer.user.id, type: 'REFERRAL_EARNED' } })).toBe(1);
    expect(await syncReferrals()).toBe(0); // earned once

    const admin = await asAdmin();
    const ledger = await admin.agent.get('/api/admin/growth/referrals').expect(200);
    const rewardId = ledger.body.referrals[0].reward.id;
    await admin.agent.patch(`/api/admin/growth/referrals/rewards/${rewardId}`).send({ status: 'PENDING' }).expect(400);
    await admin.agent.patch(`/api/admin/growth/referrals/rewards/${rewardId}`).send({ status: 'PAID' }).expect(200);
    await admin.agent.patch(`/api/admin/growth/referrals/rewards/${rewardId}`).send({ status: 'CANCELLED' }).expect(400);
    const staff = await asStaff();
    await staff.agent.patch(`/api/admin/growth/referrals/rewards/${rewardId}`).send({ status: 'USED' }).expect(403);
    const after = await referrer.agent.get('/api/growth/referral').expect(200);
    expect(after.body.totals.settled).toBe(100);
  });

  it('blocks self-referral by phone or passport and gives no reward', async () => {
    const referrer = await asClient({ phone: '+994 50 123 45 67' });
    await prisma.user.update({ where: { id: referrer.user.id }, data: { passportNumber: 'C77777777' } });
    const { body } = await referrer.agent.get('/api/growth/referral').expect(200);

    const samePhone = await register({ ref: body.code, phone: '+994501234567' });
    expect(samePhone.status).toBe(201);
    expect(await prisma.clientReferral.findUnique({ where: { referredId: samePhone.body.user.id }, include: { reward: true } })).toMatchObject({
      stage: 'BLOCKED',
      blockedReason: 'SAME_PHONE',
      reward: null,
    });
    const samePass = await register({ ref: body.code, passportNumber: 'c 7777 7777' });
    expect((await prisma.clientReferral.findUnique({ where: { referredId: samePass.body.user.id } }))!.blockedReason).toBe('SAME_PASSPORT');
    // Unknown code: no attribution, sign-up still works.
    const unknown = await register({ ref: 'TVZZZZZZ' });
    expect(unknown.status).toBe(201);
    expect(await prisma.clientReferral.count()).toBe(2);
  });

  it('agent attribution wins over a client code; staff cannot use the client endpoint', async () => {
    const agentUser = await prisma.user.create({ data: { email: `${uniq('agent')}@test.local`, passwordHash: 'x', firstName: 'Ag', lastName: 'Ent', role: 'AGENT' } });
    await prisma.agent.create({ data: { userId: agentUser.id, code: 'GENCE-ALI', status: 'ACTIVE' } as never });
    const referrer = await asClient();
    const { body } = await referrer.agent.get('/api/growth/referral').expect(200);
    // Form carries the agent code, the cookie the client code → the agent wins, no client referral.
    const res = await register({ ref: 'GENCE-ALI' }, `tv_ref=${body.code}`);
    expect(res.status).toBe(201);
    const u = await prisma.user.findUnique({ where: { id: res.body.user.id } });
    expect(u!.referredByAgentId).not.toBeNull();
    expect(await prisma.clientReferral.count()).toBe(0);

    const staff = await asStaff();
    await staff.agent.get('/api/growth/referral').expect(403);
    await anon().get('/api/growth/referral').expect(401);
  });
});
