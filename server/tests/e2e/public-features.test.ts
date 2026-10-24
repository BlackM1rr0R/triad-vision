import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { emailsTo, prisma, waitFor } from '../helpers/db';
import { l10n } from '../helpers/factories';
import { binaryParser, makePdf, PNG_BUFFER } from '../helpers/files';
import { createVacancy } from './vacancies.fixtures';
import { alertToken, purgeJobAlerts, runJobAlertDigests } from '../../src/lib/jobAlerts/service.js';
import { downloadToken, filePath, filesOf } from '../../src/lib/leadMagnets/service.js';
import { STARTER_SLUG } from '../../src/lib/leadMagnets/starterEbook.js';

const DAY = 24 * 60 * 60 * 1000;
const VID = 'v_ebook_visitor_0123456789';

const ld = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);

const createGuide = (over: Record<string, unknown> = {}) =>
  prisma.guidePage.create({
    data: {
      key: 'chancenkarte',
      locale: 'de',
      slug: 'chancenkarte-deutschland',
      title: 'Chancenkarte 2026: Punkte und Antrag',
      description: 'Alles zur Chancenkarte: Voraussetzungen, Punkte, Antrag und Arbeit in Deutschland.',
      body: '## Voraussetzungen\n\nDie Chancenkarte erlaubt die Jobsuche. Mehr im [Rechner](/chancenkarte-calculator).\n\n- Punkt eins\n- Punkt zwei\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> Hinweis',
      faq: [{ q: 'Wie viele Punkte?', a: 'Mindestens 6.' }],
      ...over,
    } as never,
  });

// ─── 1. Site search ─────────────────────────────────────────────────────

describe('site search', () => {
  it('finds guides through synonyms and jobs in the requested language, with localised URLs', async () => {
    await createGuide();
    await createGuide({ locale: 'en', slug: 'opportunity-card', title: 'Opportunity Card 2026', description: 'Everything about the Opportunity Card in Germany for skilled workers.' });
    await createVacancy({ slug: 'lkw-fahrer-hamburg-x', title: { az: 'Yük maşını sürücüsü', de: 'LKW-Fahrer', en: 'Truck driver', ru: 'Водитель' } });

    const de = await anon().get('/api/search').query({ q: 'fırsat kartı', lng: 'de' }).expect(200);
    expect(de.body.items.some((h: { id: string; url: string }) => h.id === 'guide:chancenkarte' && h.url === '/de/guides/chancenkarte-deutschland')).toBe(true);

    const tr = await anon().get('/api/search').query({ q: 'truck', lng: 'tr' }).expect(200);
    expect(tr.body.items[0]).toMatchObject({ type: 'job', url: '/tr/jobs/lkw-fahrer-hamburg-x' });
    expect(tr.body.items[0].titleHighlights.length).toBeGreaterThan(0);

    const typed = await anon().get('/api/search').query({ q: 'Chancenkatre', lng: 'de', types: 'guide' }).expect(200);
    expect(typed.body.items.map((h: { type: string }) => h.type)).toEqual(['guide']);

    expect((await anon().get('/api/search').query({ q: 'a', lng: 'en' })).body.items).toEqual([]);
  });

  it('logs settled searches as anonymous daily counts and shows them to staff', async () => {
    await anon().post('/api/search/log').send({ q: 'Blue Card', lng: 'en' }).expect(200);
    const none = await anon().post('/api/search/log').send({ q: 'Qwertzuiop', lng: 'en' }).expect(200);
    expect(none.body.logged).toBe(true);
    expect((await anon().post('/api/search/log').send({ q: 'ali@example.com' }).expect(200)).body.logged).toBe(false);

    const rows = await prisma.analyticsDaily.findMany({ where: { metric: { in: ['search', 'search_noresult'] } } });
    expect(rows.find((r) => r.metric === 'search_noresult')).toMatchObject({ source: 'qwertzuiop', count: 1 });
    expect(rows.some((r) => r.source.includes('@'))).toBe(false);

    const staff = await asStaff();
    const stats = await staff.agent.get('/api/admin/site-features/search-stats').expect(200);
    expect(stats.body.zeroResults).toEqual([{ term: 'qwertzuiop', count: 1 }]);
    expect(stats.body.top.map((t: { term: string }) => t.term).sort()).toEqual(['blue card', 'qwertzuiop']);
    expect(stats.body.total).toBe(2);

    const client = await asClient();
    expect((await client.agent.get('/api/admin/site-features/search-stats')).status).toBe(403);
  });
});

// ─── 2. Comparison page ─────────────────────────────────────────────────

describe('visa comparison', () => {
  it('serves the table in every language with thresholds, guide links, FAQ JSON-LD and a crawlable body', async () => {
    await createGuide({ key: 'blue-card', locale: 'en', slug: 'eu-blue-card-germany', title: 'EU Blue Card 2026', description: 'Blue Card salary thresholds and requirements for skilled workers in Germany.' });
    const uk = await anon().get('/api/compare-visas').query({ lng: 'uk' }).expect(200);
    expect(uk.body.routes).toHaveLength(5);
    expect(uk.body.criteria).toHaveLength(8);
    const bc = uk.body.routes.find((r: { key: string }) => r.key === 'blueCard');
    expect(bc.guide).toEqual({ title: 'EU Blue Card 2026', path: '/en/guides/eu-blue-card-germany' });
    expect(bc.cells.salary).toMatch(/50/);
    expect(bc.tool).toBe('/blue-card-check');

    const head = await anon().get('/api/seo/head').query({ path: '/de/compare-visas' }).expect(200);
    const faq = ld(head.text).find((b) => b['@type'] === 'FAQPage');
    expect((faq?.mainEntity as unknown[]).length).toBe(5);
    expect(head.text).toContain('hreflang="tr"');

    const body = await anon().get('/__seo/body').query({ path: '/ru/compare-visas' }).expect(200);
    expect(body.text).toContain('<table>');
    expect(body.text).toContain('Голубая карта ЕС');

    const sitemap = await anon().get('/sitemaps/pages.xml').expect(200);
    expect(sitemap.text).toContain('/uk/compare-visas');

    const search = await anon().get('/api/search').query({ q: 'which visa', lng: 'en' }).expect(200);
    expect(search.body.items.some((h: { url: string }) => h.url === '/en/compare-visas')).toBe(true);
  });
});

// ─── 3. Video success stories ───────────────────────────────────────────

const testimonial = (over: Record<string, unknown> = {}) => ({
  quote: l10n('Thanks to the team I drive in Hamburg now'),
  author: l10n('Ramin'),
  role: l10n('Truck driver'),
  kind: 'candidate',
  sortOrder: 0,
  published: true,
  ...over,
});

describe('video success stories', () => {
  it('stores video fields, validates the video link and adds VideoObject JSON-LD to /stories', async () => {
    const admin = await asAdmin();
    const ok = await admin.agent
      .post('/api/admin/content/testimonials')
      .send(testimonial({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ', profession: 'LKW-Fahrer', country: 'AZ', city: 'Hamburg', visaType: '18a' }))
      .expect(201);
    expect(ok.body.item).toMatchObject({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ', country: 'AZ', city: 'Hamburg', visaType: '18a' });
    await admin.agent.post('/api/admin/content/testimonials').send(testimonial({ videoUrl: 'https://evil.example/x.mp4' })).expect(400);
    await admin.agent.post('/api/admin/content/testimonials').send(testimonial({ author: l10n('Text only') })).expect(201);

    const content = await anon().get('/api/public/content').expect(200);
    expect(content.body.testimonials.find((t: { id: string }) => t.id === ok.body.item.id).city).toBe('Hamburg');

    const head = await anon().get('/api/seo/head').query({ path: '/en/stories' }).expect(200);
    const videos = ld(head.text).filter((b) => b['@type'] === 'VideoObject');
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', thumbnailUrl: ['https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'] });
    const body = await anon().get('/__seo/body').query({ path: '/stories' }).expect(200);
    expect(body.text).toContain('Thanks to the team I drive in Hamburg now az');
  });

  it('accepts MP4 / WebM uploads only (content checked)', async () => {
    const admin = await asAdmin();
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42', 'latin1'), Buffer.alloc(200)]);
    const res = await admin.agent.post('/api/admin/site-features/video-upload').attach('file', mp4, { filename: 'story.mp4', contentType: 'video/mp4' }).expect(201);
    expect(res.body.url).toMatch(/^\/uploads\/[\w-]+\.mp4$/);
    await admin.agent.post('/api/admin/site-features/video-upload').attach('file', PNG_BUFFER, { filename: 'fake.mp4', contentType: 'video/mp4' }).expect(400);
    const staff = await asStaff();
    expect((await staff.agent.post('/api/admin/site-features/video-upload').attach('file', mp4, { filename: 'story.mp4', contentType: 'video/mp4' })).status).toBe(403);
  });
});

// ─── 4. E-book lead magnets ─────────────────────────────────────────────

const magnetBody = { slug: 'test-guide', title: { ...l10n('Test guide'), tr: 'Test rehberi' }, description: l10n('A short PDF'), published: true };

describe('e-book lead magnets', () => {
  it('admin creates an e-book with a PDF per language; the form creates a scored lead, logs consent and e-mails a signed link', async () => {
    const admin = await asAdmin();
    const created = await admin.agent.post('/api/admin/site-features/lead-magnets').send(magnetBody).expect(201);
    const id = created.body.item.id as string;
    await admin.agent.post('/api/admin/site-features/lead-magnets').send(magnetBody).expect(409);

    // No PDF yet: the form refuses.
    await anon().post('/api/lead-magnets/test-guide/request').send({ email: 'a@test.local', name: 'Ali' }).expect(409);

    await admin.agent.post(`/api/admin/site-features/lead-magnets/${id}/files/en`).attach('file', PNG_BUFFER, { filename: 'x.pdf', contentType: 'application/pdf' }).expect(400);
    const up = await admin.agent.post(`/api/admin/site-features/lead-magnets/${id}/files/en`).attach('file', await makePdf('E-book'), { filename: 'book.pdf', contentType: 'application/pdf' }).expect(201);
    expect(Object.keys(up.body.item.files)).toEqual(['en']);

    const list = await anon().get('/api/lead-magnets').query({ lng: 'tr' }).expect(200);
    expect(list.body.items[0]).toMatchObject({ slug: 'test-guide', title: 'Test rehberi', fileLocale: 'en', locales: ['en'] });

    await anon()
      .post('/api/lead-magnets/test-guide/request')
      .send({ email: 'Leyla@Test.local', name: 'Leyla', phone: '+994 50 123 45 67', country: 'AZ', lng: 'tr', marketingConsent: true, visitorId: VID, from: 'guide:chancenkarte' })
      .expect(201);
    const q = await prisma.inquiry.findFirstOrThrow({ where: { email: 'leyla@test.local' } });
    expect(q).toMatchObject({ source: 'ebook:test-guide', locale: 'az', visitorId: VID });
    expect(q.score).toBeGreaterThan(0);
    expect(await prisma.consentRecord.count({ where: { email: 'leyla@test.local', type: 'MARKETING_EMAIL', granted: true, source: 'EBOOK' } })).toBe(1);
    const [mail] = await emailsTo('leyla@test.local');
    expect(mail.subject).toBe('E-kitabınız: Test rehberi');

    // Without consent: no consent row. Honeypot: looks fine, creates nothing.
    await anon().post('/api/lead-magnets/test-guide/request').send({ email: 'no@test.local', name: 'Nadir', lng: 'de' }).expect(201);
    expect(await prisma.consentRecord.count({ where: { email: 'no@test.local' } })).toBe(0);
    await anon().post('/api/lead-magnets/test-guide/request').send({ email: 'bot@test.local', name: 'Bot', website: 'http://spam' }).expect(201);
    expect(await prisma.inquiry.count({ where: { email: 'bot@test.local' } })).toBe(0);
    expect((await prisma.leadMagnet.findUniqueOrThrow({ where: { id } })).downloads).toBe(2);

    // Signed download link (English PDF for a Turkish visitor); tampered links fail.
    const pdf = await anon().get(`/api/lead-magnets/download/${downloadToken(id, 'tr')}`).buffer(true).parse(binaryParser).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await anon().get(`/api/lead-magnets/download/${downloadToken(id, 'tr').slice(0, -2)}xx`).expect(404);
    await anon().get(`/api/lead-magnets/download/${downloadToken(id, 'tr', Date.now() - 8 * DAY)}`).expect(404);

    // SEO: an indexable page with Book JSON-LD, listed in the sitemap.
    const head = await anon().get('/api/seo/head').query({ path: '/tr/ebook/test-guide' }).expect(200);
    expect(ld(head.text).some((b) => b['@type'] === 'Book')).toBe(true);
    expect((await anon().get('/sitemaps/content.xml').expect(200)).text).toContain('/de/ebook/test-guide');

    // Admin list shows downloads and leads; deleting removes the files.
    const admins = await admin.agent.get('/api/admin/site-features/lead-magnets').expect(200);
    expect(admins.body.items[0]).toMatchObject({ downloads: 2, leads: 2 });
    const key = filesOf(up.body.item.files).en!;
    await admin.agent.delete(`/api/admin/site-features/lead-magnets/${id}`).expect(200);
    expect(fs.existsSync(filePath(key))).toBe(false);
  });

  it('generates the starter e-book in six languages from the guides, idempotently', async () => {
    await createGuide();
    await createGuide({ key: 'ausbildung', locale: 'en', slug: 'ausbildung-germany', title: 'Ausbildung in Germany 2026', description: 'Vocational training in Germany: visa, B1 German, allowance and steps.' });
    const admin = await asAdmin();
    const first = await admin.agent.post('/api/admin/site-features/lead-magnets/starter').expect(201);
    expect(first.body.generated.sort()).toEqual(['az', 'de', 'en', 'ru', 'tr', 'uk']);
    const files1 = first.body.item.files as Record<string, string>;
    const de = await PDFDocument.load(fs.readFileSync(filePath(files1.de)));
    expect(de.getPageCount()).toBeGreaterThanOrEqual(4);
    expect(de.getTitle()).toBe('Ratgeber Umzug nach Deutschland 2026');

    // A hand-uploaded PDF survives a rerun; generated ones are replaced, old files removed.
    await admin.agent.post(`/api/admin/site-features/lead-magnets/${first.body.item.id}/files/ru`).attach('file', await makePdf('Custom'), { filename: 'ru.pdf', contentType: 'application/pdf' }).expect(201);
    const custom = filesOf((await prisma.leadMagnet.findUniqueOrThrow({ where: { slug: STARTER_SLUG } })).files).ru!;
    const second = await admin.agent.post('/api/admin/site-features/lead-magnets/starter').expect(201);
    expect(second.body.generated).not.toContain('ru');
    expect(second.body.item.files.ru).toBe(custom);
    expect(await prisma.leadMagnet.count()).toBe(1);
    expect(fs.existsSync(filePath(files1.de))).toBe(false);
    expect(fs.existsSync(filePath(second.body.item.files.de))).toBe(true);
  });
});

// ─── 5. Job alerts ──────────────────────────────────────────────────────

describe('job alerts', () => {
  it('double opt-in, digest on publication at most once a day, manage and unsubscribe', async () => {
    const options = await anon().get('/api/job-alerts/options').query({ lng: 'de' }).expect(200);
    expect(options.body.professions.find((p: { key: string }) => p.key === 'truck_driver').label).toBe('LKW-Fahrer/in');

    const res = await anon().post('/api/job-alerts').send({ email: 'Driver@Test.local', professions: ['truck_driver'], germanLevel: 'B1', lng: 'de' }).expect(201);
    expect(res.body.confirmed).toBe(false);
    const alert = await prisma.jobAlert.findFirstOrThrow({ where: { email: 'driver@test.local' } });
    expect((await emailsTo('driver@test.local'))[0].subject).toBe('Bitte bestätigen Sie Ihren Job-Alarm');

    // Unconfirmed: nothing is sent.
    await createVacancy({ slug: 'lkw-1' });
    expect(await runJobAlertDigests()).toBe(0);

    const confirm = await anon().post('/api/job-alerts/confirm').send({ token: alertToken(alert.id) }).expect(200);
    expect(confirm.body.alert).toMatchObject({ confirmed: true, email: 'd*****@test.local', professions: ['truck_driver'] });
    await anon().post('/api/job-alerts/confirm').send({ token: 'x'.repeat(43) }).expect(404);

    // Publishing a matching vacancy triggers the digest; a non-matching one (German C1) is not listed.
    const admin = await asAdmin();
    await admin.agent.post('/api/admin/vacancies').send({ title: { de: 'Berufskraftfahrer CE' }, description: { de: 'Fernverkehr' }, profession: 'Berufskraftfahrer', germanLevel: 'A2', publish: true }).expect(201);
    await createVacancy({ slug: 'lkw-c1', germanLevel: 'C1' });
    const digest = await waitFor(() => prisma.emailLog.findFirst({ where: { to: 'driver@test.local', subject: { contains: 'neue Stellen' } } }));
    expect(digest.subject).toBe('1 neue Stellen für Sie');
    const sent = await prisma.jobAlert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(sent.sentCount).toBe(1);

    // At most one digest per day.
    await createVacancy({ slug: 'lkw-2' });
    expect(await runJobAlertDigests()).toBe(0);
    expect(await runJobAlertDigests(new Date(Date.now() + DAY + 60_000))).toBe(1);

    // Manage link: masked e-mail, change preferences, unsubscribe stops everything.
    const token = alertToken(alert.id);
    await anon().patch('/api/job-alerts/manage').send({ token, professions: ['truck_driver', 'warehouse'], kinds: ['work'] }).expect(200);
    const view = await anon().get('/api/job-alerts/manage').query({ token }).expect(200);
    expect(view.body.alert).toMatchObject({ professions: ['truck_driver', 'warehouse'], kinds: ['work'], unsubscribed: false });
    await anon().post('/api/job-alerts/unsubscribe').send({ token }).expect(200);
    await createVacancy({ slug: 'lkw-3', publishedAt: new Date(Date.now() + 2 * DAY + 1000) });
    expect(await runJobAlertDigests(new Date(Date.now() + 3 * DAY))).toBe(0);
  });

  it('signed-in clients subscribe without double opt-in; digests follow their e-mail setting; purge and account deletion', async () => {
    const client = await asClient();
    await prisma.user.update({ where: { id: client.user.id }, data: { profession: 'Tibb bacısı' } });
    const mine = await client.agent.get('/api/job-alerts/mine').expect(200);
    expect(mine.body.suggested.profession).toBe('nurse');
    const created = await client.agent.post('/api/job-alerts/mine').send({ professions: ['nurse'], lng: 'ru' }).expect(201);
    expect(created.body.alert).toMatchObject({ confirmed: true, locale: 'ru' });
    // The public form with the own account address is confirmed at once too.
    expect((await client.agent.post('/api/job-alerts').send({ email: client.user.email, professions: ['cook'] }).expect(201)).body.confirmed).toBe(true);

    await createVacancy({ slug: 'pflege-1', profession: 'Pflegefachkraft', title: l10n('Pflegefachkraft'), germanLevel: 'B1' });
    await prisma.user.update({ where: { id: client.user.id }, data: { emailNotifications: false } });
    expect(await runJobAlertDigests()).toBe(0);
    await prisma.user.update({ where: { id: client.user.id }, data: { emailNotifications: true } });
    expect(await runJobAlertDigests()).toBe(1);
    expect((await prisma.emailLog.findFirstOrThrow({ where: { to: client.user.email, subject: { contains: 'вакансии' } } })).subject).toBe('Новые вакансии для вас: 1');

    // Other users cannot touch the alert.
    const other = await asClient();
    await other.agent.delete(`/api/job-alerts/mine/${created.body.alert.id}`).expect(404);

    // Staff analytics: active alerts per profession.
    const staff = await asStaff();
    const stats = await staff.agent.get('/api/admin/site-features/job-alert-stats').expect(200);
    expect(stats.body).toMatchObject({ active: 2, accounts: 2 });
    expect(stats.body.professions.map((p: { key: string }) => p.key).sort()).toEqual(['cook', 'nurse']);

    // Unconfirmed alerts are deleted after 7 days.
    const old = await prisma.jobAlert.create({ data: { email: 'old@test.local', professions: ['cook'], tokenHash: 'a'.repeat(64), createdAt: new Date(Date.now() - 8 * DAY) } });
    expect(await purgeJobAlerts()).toBe(1);
    expect(await prisma.jobAlert.findUnique({ where: { id: old.id } })).toBeNull();

    // Account deletion removes the alerts.
    const sa = await asSuperAdmin();
    await sa.agent.delete(`/api/admin/users/${client.user.id}`).send({ confirmEmail: client.user.email }).expect(200);
    expect(await prisma.jobAlert.count({ where: { email: client.user.email } })).toBe(0);
  });
});
