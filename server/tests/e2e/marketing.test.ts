import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createClient, createVisaCategory, l10n, uniq } from '../helpers/factories';
import { registrantToken } from '../../src/lib/growth/events.js';
import { LEAD_SCORING_DEFAULTS } from '../../src/lib/marketing/leadScoring.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VID = 'v_test_visitor_0123456789';
/** iCalendar content lines are folded at 75 octets. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

const beacon = (body: Record<string, unknown>) => anon().post('/api/track/lead').set('Content-Type', 'text/plain;charset=UTF-8').send(JSON.stringify(body));

const contact = (over: Record<string, unknown> = {}) =>
  anon()
    .post('/api/public/inquiries')
    .send({ kind: 'contact', contactName: 'Ali Aliyev', email: 'ali@test.local', message: 'Salam, məlumat istəyirəm.', locale: 'az', ...over });

// ─── 1. Lead scoring ────────────────────────────────────────────────────

describe('lead scoring', () => {
  it('visitor beacons are counters only; bots and invalid ids are ignored', async () => {
    expect((await beacon({ v: VID, e: 'page_view', p: '/visas/lkw', visit: true, l: 'az', utm: { source: 'facebook', campaign: 'spring' } })).status).toBe(204);
    expect((await beacon({ v: VID, e: 'page_view', p: '/account/documents' })).status).toBe(204);
    expect((await beacon({ v: VID, e: 'quiz_done', fit: 'high' })).status).toBe(204);
    expect((await beacon({ v: 'short', e: 'page_view' })).status).toBe(400);
    expect((await beacon({ v: VID, e: 'hack' })).status).toBe(400);
    await anon().post('/api/track/lead').set('User-Agent', 'Googlebot/2.1').set('Content-Type', 'text/plain').send(JSON.stringify({ v: 'v_bot_visitor_0123456789', e: 'page_view' })).expect(204);
    const v = await prisma.leadVisitor.findUnique({ where: { id: VID } });
    expect(v).toMatchObject({ visits: 1, pageViews: 2, source: 'facebook', locale: 'az', inquiryId: null });
    expect(v!.events).toEqual({ 'page:/visas': 1, quiz_done: 1, quiz_high: 1 });
    expect(await prisma.leadVisitor.findUnique({ where: { id: 'v_bot_visitor_0123456789' } })).toBeNull();
  });

  it('a form with a visitor id links the visitor, stores utm and scores the lead; later events rescore it', async () => {
    await beacon({ v: VID, e: 'quiz_done', fit: 'high' }).expect(204);
    const res = await contact({ visitorId: VID, utm: { source: 'instagram', medium: 'cpc' }, phone: '+994 50 111 22 33' }).expect(201);
    const q = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(q.visitorId).toBe(VID);
    expect(q.utm).toEqual({ source: 'instagram', medium: 'cpc' });
    // contact 10 + quiz event 8 + quiz high 20 + d1 10 + phone 10 + email 5
    expect(q.score).toBe(63);
    expect(q.scoreLevel).toBe('HOT');
    expect(q.scoredAt).not.toBeNull();
    expect((await prisma.leadVisitor.findUniqueOrThrow({ where: { id: VID } })).inquiryId).toBe(q.id);

    // A cookie-less visitor (no id) is scored too, just without history.
    const plain = await contact({ email: 'plain@test.local' }).expect(201);
    const p = await prisma.inquiry.findUniqueOrThrow({ where: { id: plain.body.id } });
    expect(p).toMatchObject({ visitorId: null, score: 25, scoreLevel: 'COLD' });
  });

  it('HOT leads notify admins and the configured sales staff exactly once', async () => {
    const admin = await asAdmin();
    const { user: sales } = await createClient(); // any active user id is accepted; staff picker in the UI
    await admin.agent.put('/api/admin/marketing/lead-scoring').send({ ...LEAD_SCORING_DEFAULTS, thresholds: { warm: 20, hot: 30 }, notifyUserIds: [sales.id] }).expect(200);
    const res = await contact({ visitorId: 'v_hot_visitor_0123456789', email: 'hot@test.local', phone: '+994 50 999 88 77' }).expect(201); // 35 ≥ 30
    const q = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(q.scoreLevel).toBe('HOT');
    const adminNote = await waitFor(() => prisma.notification.findFirst({ where: { userId: admin.user.id, title: { startsWith: 'HOT lead' } } }));
    expect(adminNote.link).toBe(`/admin/inquiries?level=HOT&open=${q.id}`);
    await waitFor(() => prisma.notification.findFirst({ where: { userId: sales.id, type: 'LEAD_HOT' } }));
    // more events: still HOT, no second notification
    await beacon({ v: 'v_hot_visitor_0123456789', e: 'cost_calc' }).expect(204);
    await beacon({ v: 'v_hot_visitor_0123456789', e: 'whatsapp_click' }).expect(204);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, title: { startsWith: 'HOT lead' } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: sales.id, type: 'LEAD_HOT' } })).toBe(1);
  });

  it('settings: staff read, admins write (validated); rescore and lead details', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const got = await staff.agent.get('/api/admin/marketing/lead-scoring').expect(200);
    expect(got.body.settings.thresholds).toEqual(LEAD_SCORING_DEFAULTS.thresholds);
    expect(got.body.staff.some((u: { id: string }) => u.id === staff.user.id)).toBe(true);
    await staff.agent.put('/api/admin/marketing/lead-scoring').send(LEAD_SCORING_DEFAULTS).expect(403);
    await admin.agent.put('/api/admin/marketing/lead-scoring').send({ ...LEAD_SCORING_DEFAULTS, thresholds: { warm: 70, hot: 50 } }).expect(400);

    const res = await contact({ visitorId: VID }).expect(201);
    await prisma.inquiry.update({ where: { id: res.body.id }, data: { score: 0, scoreLevel: null } });
    const re = await admin.agent.post('/api/admin/marketing/lead-scoring/rescore').send({ days: 30 }).expect(200);
    expect(re.body.count).toBeGreaterThanOrEqual(1);
    const lead = await staff.agent.get(`/api/admin/marketing/inquiries/${res.body.id}/lead`).expect(200);
    expect(lead.body.level).toBeTruthy();
    expect(lead.body.visitor).toMatchObject({ visits: 1 });
    expect(lead.body.reasons.some((r: { code: string }) => r.code === 'source')).toBe(true);
    // the admin list carries the score fields
    const list = await staff.agent.get('/api/admin/inquiries').expect(200);
    expect(list.body.items[0]).toHaveProperty('scoreLevel');
  });

  it('a booking with the visitor id counts as booking_done and rescores the matched lead', async () => {
    const res = await contact({ email: 'book@test.local' }).expect(201);
    const before = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    const { onBookingLead } = await import('../../src/lib/marketing/leads.js');
    await onBookingLead({ email: 'book@test.local' }, 'v_book_visitor_0123456789');
    const after = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(after.visitorId).toBe('v_book_visitor_0123456789');
    expect(after.score).toBe(before.score + LEAD_SCORING_DEFAULTS.events.booking_done);
  });
});

// ─── 2. Landing pages ───────────────────────────────────────────────────

const sections = [
  { id: 'hero', type: 'hero', data: { title: 'Almaniyada sürücü işi', subtitle: 'C/CE sürücülər üçün', image: '/uploads/hero.webp', ctaLabel: 'Müraciət et', ctaTarget: '#form' } },
  { id: 'faq', type: 'faq', data: { title: 'Suallar', items: [{ q: 'Dil lazımdır?', a: 'A2 kifayətdir.' }] } },
  { id: 'tst', type: 'testimonials', data: { title: 'Rəylər', ids: [], custom: [{ name: 'Rəşad', role: 'Sürücü', text: 'Əla', photo: '' }] } },
  { id: 'vid', type: 'video', data: { title: 'Video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
  { id: 'form', type: 'form', data: { title: 'Müraciət', text: '' } },
];

describe('landing pages', () => {
  it('staff build drafts, admins publish; the public page counts views and turns the form into a scored lead', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const t = await prisma.testimonial.create({ data: { quote: l10n('Super'), author: l10n('Kamran'), role: l10n('Driver') } });
    const created = await staff.agent
      .post('/api/admin/marketing/landing-pages')
      .send({ title: 'Sürücü işi 2026', locale: 'az', sections: sections.map((s) => (s.id === 'tst' ? { ...s, data: { ...s.data, ids: [t.id] } } : s)), seoTitle: 'Almaniyada sürücü işi', seoDescription: 'C/CE sürücülər üçün Almaniyada iş və viza.' })
      .expect(201);
    const page = created.body.page;
    expect(page.slug).toBe('surucu-isi-2026');
    expect(page.status).toBe('DRAFT');
    await anon().get(`/api/landing/${page.slug}`).expect(404);
    await staff.agent.post(`/api/admin/marketing/landing-pages/${page.id}/status`).send({ status: 'PUBLISHED' }).expect(403);
    await admin.agent.post(`/api/admin/marketing/landing-pages/${page.id}/status`).send({ status: 'PUBLISHED' }).expect(200);

    const pub = await anon().get(`/api/landing/${page.slug}`).expect(200);
    expect(pub.body.page.sections).toHaveLength(5);
    const tst = pub.body.page.sections.find((s: { id: string }) => s.id === 'tst');
    expect(tst.resolved[0]).toMatchObject({ id: t.id });
    expect(pub.body.page.sections.find((s: { id: string }) => s.id === 'vid').resolved.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    await anon().post(`/api/landing/${page.slug}/view`).set('Content-Type', 'text/plain').send(JSON.stringify({ visitorId: VID })).expect(204);
    await anon().post(`/api/landing/${page.slug}/view`).set('Content-Type', 'text/plain').send('').expect(204);
    await anon().post(`/api/landing/${page.slug}/view`).set('User-Agent', 'bingbot').expect(204);

    // required fields from the form config (default: name + phone)
    await anon().post(`/api/landing/${page.slug}/submit`).send({ name: 'Ali', email: 'a@test.local', consent: true }).expect(400);
    await anon().post(`/api/landing/${page.slug}/submit`).send({ name: 'Ali', phone: '+994501112233' }).expect(400); // no consent
    await anon().post(`/api/landing/${page.slug}/submit`).send({ name: 'Bot', phone: '+994501112233', consent: true, website: 'x' }).expect(201);
    const sub = await anon()
      .post(`/api/landing/${page.slug}/submit`)
      .send({ name: 'Ali Aliyev', phone: '+994 50 111 22 33', germanLevel: 'A2', profession: 'LKW-Fahrer', consent: true, visitorId: VID, utm: { source: 'google', campaign: 'drivers' } })
      .expect(201);
    const q = await prisma.inquiry.findUniqueOrThrow({ where: { id: sub.body.id } });
    expect(q).toMatchObject({ source: `landing:${page.slug}`, landingPageId: page.id, visitorId: VID, sector: 'LKW-Fahrer', kind: 'contact' });
    expect(q.utm).toEqual({ source: 'google', campaign: 'drivers' });
    expect(q.message).toContain('Alman dili: A2');
    expect(q.scoreLevel).not.toBeNull();
    expect((await prisma.leadVisitor.findUniqueOrThrow({ where: { id: VID } })).events).toMatchObject({ landing_view: 1 });

    const list = await staff.agent.get('/api/admin/marketing/landing-pages').expect(200);
    expect(list.body.pages[0]).toMatchObject({ views: 2, submissions: 1, rate: 50 });

    // sitemap + server-side head use the SEO fields
    expect((await anon().get('/sitemaps/landing.xml').expect(200)).text).toContain(`/l/${page.slug}`);
    const head = await anon().get(`/api/seo/head?path=/l/${page.slug}`).expect(200);
    expect(head.text).toContain('<title data-seo>Almaniyada sürücü işi</title>');
    expect(head.text).toContain('C/CE sürücülər üçün Almaniyada iş və viza.');
    expect(head.text).toContain('/uploads/hero.webp');
  });

  it('validates sections, duplicates, keeps slugs unique and deletes only unpublished pages', async () => {
    const admin = await asAdmin();
    await admin.agent.post('/api/admin/marketing/landing-pages').send({ title: 'X', sections: [] }).expect(400); // title too short
    await admin.agent.post('/api/admin/marketing/landing-pages').send({ title: 'Bad', sections: [{ id: 'a', type: 'video', data: { url: 'https://evil.example' } }] }).expect(400);
    const a = (await admin.agent.post('/api/admin/marketing/landing-pages').send({ title: 'Ukrayna kampaniyası', slug: 'ua-campaign', locale: 'ru', sections }).expect(201)).body.page;
    await admin.agent.post('/api/admin/marketing/landing-pages').send({ title: 'Other', slug: 'ua-campaign', sections }).expect(409);
    const copy = (await admin.agent.post(`/api/admin/marketing/landing-pages/${a.id}/duplicate`).expect(201)).body.page;
    expect(copy).toMatchObject({ slug: 'ua-campaign-copy', status: 'DRAFT', locale: 'ru' });
    await admin.agent.post(`/api/admin/marketing/landing-pages/${copy.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
    await admin.agent.delete(`/api/admin/marketing/landing-pages/${copy.id}`).expect(409);
    await admin.agent.post(`/api/admin/marketing/landing-pages/${copy.id}/status`).send({ status: 'ARCHIVED' }).expect(200);
    await anon().get(`/api/landing/${copy.slug}`).expect(404);
    await admin.agent.delete(`/api/admin/marketing/landing-pages/${copy.id}`).expect(200);
    const empty = (await admin.agent.post('/api/admin/marketing/landing-pages').send({ title: 'Empty page', sections: [] }).expect(201)).body.page;
    expect((await admin.agent.post(`/api/admin/marketing/landing-pages/${empty.id}/status`).send({ status: 'PUBLISHED' }).expect(400)).body.error).toBe('NO_SECTIONS');
  });
});

// ─── 3. Cost calculator ─────────────────────────────────────────────────

describe('cost calculator', () => {
  it('estimates an itemised budget, creates a lead with the server-side estimate, admins edit fees', async () => {
    const cat = await createVisaCategory({ slug: uniq('chancen'), visaLabel: '§20a Chancenkarte', germanLevel: 'A1' });
    const cfg = await anon().get('/api/growth/cost-calculator').expect(200);
    const c = cfg.body.categories.find((x: { slug: string }) => x.slug === cat.slug);
    expect(c.defaults).toMatchObject({ documents: 6, apostilles: 3, recognition: false, language: true, blockedAccount: true });

    const est = await anon().get(`/api/growth/cost-calculator/estimate?category=${cat.slug}&adults=2&children=1&documents=4&recognition=1`).expect(200);
    expect(est.body.items.find((i: { key: string }) => i.key === 'blockedAccount')).toMatchObject({ refundable: true, amount: [11904, 11904] });
    expect(est.body.items.find((i: { key: string }) => i.key === 'translation').qty).toBe(4);
    expect(est.body.refundable).toEqual([11904, 11904]);
    expect(est.body.converted.oneTime.AZN[0]).toBeGreaterThan(est.body.oneTime[0]);
    await anon().get('/api/growth/cost-calculator/estimate?category=nope').expect(404);
    await anon().get(`/api/growth/cost-calculator/estimate?category=${cat.slug}&adults=0`).expect(400);

    const offer = await anon()
      .post('/api/growth/cost-calculator/offer')
      .send({ name: 'Leyla', email: 'leyla@test.local', phone: '+994 55 000 00 01', consent: true, locale: 'de', input: { category: cat.slug, adults: 2, children: 1 }, visitorId: VID })
      .expect(201);
    const q = await prisma.inquiry.findUniqueOrThrow({ where: { id: offer.body.id } });
    expect(q.source).toBe('cost-calculator');
    expect(q.estimate).toMatchObject({ category: { slug: cat.slug }, input: { adults: 2, children: 1, documents: 6 }, currency: 'EUR' });
    expect(q.scoreReasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'estimate' }), expect.objectContaining({ code: 'source', key: 'calculator' })]));
    expect((await prisma.leadVisitor.findUniqueOrThrow({ where: { id: VID } })).events).toMatchObject({ cost_calc: 1 });

    const admin = await asAdmin();
    const staff = await asStaff();
    const s = (await staff.agent.get('/api/admin/marketing/cost-calculator').expect(200)).body;
    expect(s.listPrices).toEqual({ translation: 35, apostille: 45 }); // from the translation price list
    await staff.agent.put('/api/admin/marketing/cost-calculator').send(s.settings).expect(403);
    await admin.agent.put('/api/admin/marketing/cost-calculator').send({ ...s.settings, categories: { [cat.slug]: { blockedAccount: 0, flight: 400 } } }).expect(200);
    const est2 = await anon().get(`/api/growth/cost-calculator/estimate?category=${cat.slug}`).expect(200);
    expect(est2.body.refundable).toEqual([0, 0]);
    expect(est2.body.items.find((i: { key: string }) => i.key === 'flight').amount).toEqual([400, 400]);
  });
});

// ─── 4. Info sessions: calendar, recording, conversion ─────────────────

const bakuParts = (d: Date) => {
  const local = new Date(d.getTime() + 4 * HOUR);
  return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16) };
};

describe('info sessions: calendar, recording and conversion', () => {
  it('public .ics hides the join link, the registrant link carries it; recording only for registrants; conversion stats', async () => {
    const staff = await asStaff();
    const start = new Date(Math.floor((Date.now() + 3 * DAY) / 60000) * 60000);
    const ev = (
      await staff.agent
        .post('/api/admin/growth/events')
        .send({ title: l10n('Webinar'), description: l10n('About'), mode: 'ONLINE', ...bakuParts(start), durationMin: 60, status: 'PUBLISHED', recordingUrl: 'https://youtu.be/dQw4w9WgXcQ' })
        .expect(201)
    ).body.event;
    expect(ev.recordingUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    await anon().post(`/api/growth/events/${ev.slug}/register`).send({ name: 'Ali', email: 'ali@test.local', phone: '+994 50 111 22 33', locale: 'en', consent: true, visitorId: VID }).expect(201);
    await anon().post(`/api/growth/events/${ev.slug}/register`).send({ name: 'Nigar', email: 'nigar@test.local', locale: 'az', consent: true }).expect(201);
    const regs = await prisma.infoEventRegistration.findMany({ where: { eventId: ev.id }, orderBy: { createdAt: 'asc' } });

    const pub = await anon().get(`/api/growth/events/${ev.slug}/ics`).expect(200);
    expect(pub.headers['content-type']).toContain('text/calendar');
    expect(pub.text).toContain('BEGIN:VEVENT');
    expect(unfold(pub.text)).not.toContain('meet.jit.si');
    const mine = await anon().get(`/api/growth/events/${ev.slug}/ics?r=${encodeURIComponent(registrantToken(regs[0].id))}`).expect(200);
    expect(unfold(mine.text)).toContain('meet.jit.si');
    const forged = await anon().get(`/api/growth/events/${ev.slug}/ics?r=${regs[0].id}.AAAAAAAAAAAAAAAAAAAAAA`).expect(200);
    expect(unfold(forged.text)).not.toContain('meet.jit.si');

    // recording: registrants only, and only once the event has started
    await anon().get(`/api/growth/events/${ev.slug}/recording`).expect(404);
    const before = await anon().get(`/api/growth/events/${ev.slug}/recording?r=${encodeURIComponent(registrantToken(regs[0].id))}`).expect(200);
    expect(before.body.recordingUrl).toBeNull();
    await prisma.infoEvent.update({ where: { id: ev.id }, data: { startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - HOUR) } });
    const after = await anon().get(`/api/growth/events/${ev.slug}/recording?r=${encodeURIComponent(registrantToken(regs[0].id))}`).expect(200);
    expect(after.body.recordingUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    const preview = await staff.agent.get(`/api/admin/growth/events/${ev.id}/follow-up/preview?locale=en`).expect(200);
    expect(preview.body.body).toContain('Recording of the session: https://youtu.be/dQw4w9WgXcQ');

    // the visitor got the event counter; the lead was scored
    expect((await prisma.leadVisitor.findUniqueOrThrow({ where: { id: VID } })).events).toMatchObject({ event_register: 1 });
    const lead = await prisma.inquiry.findFirstOrThrow({ where: { email: 'ali@test.local' } });
    expect(lead.visitorId).toBe(VID);
    expect(lead.scoreLevel).not.toBeNull();

    // conversion: Ali checked in and became a client with a case; Nigar did not show
    await staff.agent.patch(`/api/admin/growth/events/${ev.id}/registrations/${regs[0].id}`).send({ attendance: 'CHECKED_IN' }).expect(200);
    await staff.agent.patch(`/api/admin/growth/events/${ev.id}/registrations/${regs[1].id}`).send({ attendance: 'NO_SHOW' }).expect(200);
    const { user } = await createClient({ email: 'ali@test.local' });
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: user.id, profession: 'Driver' } });
    const detail = await staff.agent.get(`/api/admin/growth/events/${ev.id}`).expect(200);
    expect(detail.body.conversion).toEqual({ registered: 2, checkedIn: 1, noShow: 1, inquiries: 2, clients: 1, cases: 1 });
    const list = await staff.agent.get('/api/admin/growth/events?scope=past').expect(200);
    expect(list.body.events[0].conversion.cases).toBe(1);

    // clearing the recording
    const e = detail.body.event;
    await staff.agent
      .patch(`/api/admin/growth/events/${ev.id}`)
      .send({ title: e.title, description: e.description, mode: 'ONLINE', ...bakuParts(new Date(Date.now() + DAY)), durationMin: 60, status: 'PUBLISHED', recordingUrl: null })
      .expect(200);
    expect((await prisma.infoEvent.findUniqueOrThrow({ where: { id: ev.id } })).recordingUrl).toBeNull();
    await staff.agent.patch(`/api/admin/growth/events/${ev.id}`).send({ title: e.title, description: e.description, mode: 'ONLINE', ...bakuParts(new Date(Date.now() + DAY)), durationMin: 60, recordingUrl: 'javascript:alert(1)' }).expect(400);
  });
});

// ─── 5. Origin → destination map ────────────────────────────────────────

describe('origin map', () => {
  const placed = async (city: string, nationality: string | null, dest: string, visaType: 'WORK' | 'AUSBILDUNG' = 'WORK') => {
    const { user } = await createClient();
    await prisma.user.update({ where: { id: user.id }, data: { city, nationality } });
    const company = await prisma.company.create({ data: { name: uniq('Firma '), city: dest } });
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: user.id, profession: 'Driver', status: 'APPROVED', companyId: company.id, visaType } });
  };

  it('admins see exact counts with filters; the public view only shows points and flows of 3+', async () => {
    await placed('Baku', 'Azerbaijan', 'Hamburg');
    await placed('Bakı', null, 'Hamburg');
    await placed('БАКУ', null, 'Hamburg');
    await placed('Gəncə', null, 'Berlin', 'AUSBILDUNG');
    await placed('Kiev', 'Ukraine', 'Berlin');
    await placed('Paris', 'France', 'Berlin');

    const staff = await asStaff();
    const all = (await staff.agent.get('/api/admin/marketing/origins').expect(200)).body;
    expect(all.countries).toEqual({ AZ: 4, TR: 0, UA: 1 });
    expect(all.unknown).toBe(1);
    expect(all.origins[0]).toMatchObject({ key: 'baku', count: 3, country: 'AZ' });
    expect(all.flows[0]).toMatchObject({ from: 'baku', to: 'hamburg', count: 3 });
    const aus = (await staff.agent.get('/api/admin/marketing/origins?visaType=AUSBILDUNG').expect(200)).body;
    expect(aus.origins).toEqual([expect.objectContaining({ key: 'ganja', count: 1 })]);

    const pub = (await anon().get('/api/growth/origins').expect(200)).body;
    expect(pub.origins).toEqual([expect.objectContaining({ key: 'baku', count: 3 })]);
    expect(pub.flows).toEqual([{ from: 'baku', to: 'Hamburg', count: 3 }]);
    expect(pub.countries).toEqual({ AZ: 4, TR: 0, UA: 0 }); // UA has fewer than 3
    expect(JSON.stringify(pub)).not.toContain('Kiev');
  });
});
