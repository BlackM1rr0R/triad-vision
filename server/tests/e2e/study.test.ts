import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { makePdf, PNG_BUFFER } from '../helpers/files';
import { staffNotifications } from '../helpers/notify';
import { berlinToday, isoOf } from '../../src/lib/study/deadlines.js';
import { studyFilePath } from '../../src/lib/study/apply.js';
import { anonymizeInquiries } from '../../src/lib/privacy/inquiries.js';
import { clearCache } from '../../src/lib/cache.js';

/**
 * Study in Germany (/api/study, /api/admin/study): catalogue CRUD permissions, CSV export / import, public
 * filters and deadline ordering, the programme page, and "apply via Triad Vision" (lead + study facts + files).
 */

/** "MM-DD" N days from today's German date (deadlines in the tests are relative to the real clock). */
const inDays = (n: number) => {
  const t = berlinToday();
  const d = new Date(Date.UTC(t.y, t.m - 1, t.d + n));
  return isoOf({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }).slice(5);
};

const body = (o: Record<string, unknown> = {}) => ({
  name: 'Data Science M.Sc.',
  university: 'RWTH Aachen University',
  city: 'Aachen',
  federalState: 'NW',
  degree: 'MASTER',
  subjectArea: 'data-science',
  teachingLanguage: 'EN',
  languageRequirement: 'IELTS 6.5',
  durationSemesters: 4,
  tuitionPerSemester: 0,
  semesterContribution: 300,
  deadlines: [{ intake: 'WINTER', from: null, to: inDays(100), note: 'non-EU' }],
  applicationRoute: 'DIRECT',
  officialUrl: 'https://www.rwth-aachen.de/data-science',
  description: { az: 'Təsvir', de: 'Beschreibung', en: 'Description', ru: 'Описание' },
  requirements: { az: ['Bakalavr'], de: ['Bachelor'], en: ['Bachelor'], ru: ['Бакалавр'] },
  published: true,
  featured: false,
  staffNote: 'checked on rwth-aachen.de',
  ...o,
});

const seedProgrammes = async () => {
  const { agent } = await asStaff();
  const a = await agent.post('/api/admin/study/programmes').send(body());
  const b = await agent.post('/api/admin/study/programmes').send(
    body({
      name: 'Information Technology (INFOTECH), M.Sc.',
      university: 'University of Stuttgart',
      city: 'Stuttgart',
      federalState: 'BW',
      subjectArea: 'engineering',
      tuitionPerSemester: 1500,
      teachingLanguage: 'EN_DE',
      deadlines: [
        { intake: 'WINTER', from: null, to: inDays(200), note: null },
        { intake: 'SUMMER', from: null, to: inDays(10), note: null },
      ],
      featured: true,
    }),
  );
  const c = await agent.post('/api/admin/study/programmes').send(body({ name: 'Informatik B.Sc.', degree: 'BACHELOR', teachingLanguage: 'DE', city: 'Berlin', federalState: 'BE', subjectArea: 'computer-science', deadlines: [{ intake: 'WINTER', from: null, to: inDays(40), note: null }] }));
  const draft = await agent.post('/api/admin/study/programmes').send(body({ name: 'Draft programme', published: false }));
  for (const r of [a, b, c, draft]) expect(r.status).toBe(201);
  return { agent, a: a.body.programme, b: b.body.programme, c: c.body.programme, draft: draft.body.programme };
};

describe('admin study programmes: permissions and CRUD', () => {
  it('anonymous 401, client 403; staff create / edit / validation; delete ADMIN only (audited)', async () => {
    expect((await anon().get('/api/admin/study/programmes')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/study/programmes')).status).toBe(403);
    expect((await client.agent.post('/api/admin/study/programmes').send(body())).status).toBe(403);

    const staff = await asStaff();
    const created = await staff.agent.post('/api/admin/study/programmes').send(body());
    expect(created.status).toBe(201);
    const p = created.body.programme;
    expect(p.slug).toBe('data-science-aachen');
    expect(p.nextDeadline).toMatchObject({ intake: 'WINTER', daysLeft: 100 });
    expect(p.soon).toBe(false);

    // validation: bad URL protocol, impossible date, unknown state
    expect((await staff.agent.post('/api/admin/study/programmes').send(body({ officialUrl: 'javascript:alert(1)' }))).status).toBe(400);
    expect((await staff.agent.post('/api/admin/study/programmes').send(body({ deadlines: [{ intake: 'WINTER', to: '02-30' }] }))).status).toBe(400);
    expect((await staff.agent.post('/api/admin/study/programmes').send(body({ federalState: 'XX' }))).status).toBe(400);
    // same name again → unique slug
    const again = await staff.agent.post('/api/admin/study/programmes').send(body());
    expect(again.body.programme.slug).toBe('data-science-aachen-2');
    expect((await staff.agent.post('/api/admin/study/programmes').send(body({ slug: 'data-science-aachen' }))).body.error).toBe('SLUG_TAKEN');

    const edit = await staff.agent.patch(`/api/admin/study/programmes/${p.id}`).send(body({ tuitionPerSemester: 1500, deadlines: [{ intake: 'SUMMER', to: inDays(5) }] }));
    expect(edit.status).toBe(200);
    expect(edit.body.programme).toMatchObject({ tuitionPerSemester: 1500, soon: true, slug: 'data-science-aachen' });

    const list = await staff.agent.get('/api/admin/study/programmes');
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items[0]).toMatchObject({ id: p.id, soon: true, applications: 0, staffNote: 'checked on rwth-aachen.de' });

    expect((await staff.agent.delete(`/api/admin/study/programmes/${p.id}`)).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.delete(`/api/admin/study/programmes/${p.id}`)).status).toBe(200);
    expect(await prisma.studyProgramme.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'STUDY_PROGRAMME_DELETED' } })).toBe(1);
  });

  it('CSV: export → import round trip; dry run; all-or-nothing on errors; update by slug', async () => {
    const { agent, a } = await seedProgrammes();
    const exp = await agent.get('/api/admin/study/programmes/export.csv');
    expect(exp.status).toBe(200);
    expect(exp.headers['content-type']).toContain('text/csv');
    const text = exp.text;
    expect(text.split('\r\n')[0]).toContain('slug;name;university');
    expect(text).toContain(`winter:${a.deadlines[0].to} non-EU`);

    // Re-import of the export: every row is an update.
    const dry = await agent.post('/api/admin/study/programmes/import?dryRun=1').set('Content-Type', 'text/csv').send(text);
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ created: 0, updated: 4, written: false });

    const header = text.split('\r\n')[0].replace(/^﻿/, '');
    const cols = header.split(';');
    const line = (o: Record<string, string>) => cols.map((c) => o[c] ?? '').join(';');
    const newRow = line({ name: 'Intelligent Adaptive Systems M.Sc.', university: 'Universität Hamburg', city: 'Hamburg', federalState: 'Hamburg', degree: 'master', subjectArea: 'computer-science', teachingLanguage: 'EN', durationSemesters: '4', tuitionPerSemester: '0', deadlines: 'winter:02-15..03-31', applicationRoute: 'DIRECT', officialUrl: 'https://www.uni-hamburg.de/ias.pdf', published: 'no', featured: 'no' });
    const update = line({ slug: a.slug, name: a.name, university: a.university, city: a.city, federalState: 'NW', degree: 'MASTER', subjectArea: 'data-science', teachingLanguage: 'EN', durationSemesters: '4', tuitionPerSemester: '250', deadlines: 'ws:01-15', applicationRoute: 'UNI_ASSIST', officialUrl: a.officialUrl, published: 'yes', featured: 'no' });
    const bad = line({ name: 'Broken', university: 'X', city: 'Y', federalState: 'BY', degree: 'PHD', subjectArea: 'other', teachingLanguage: 'EN', durationSemesters: '4', applicationRoute: 'DIRECT', officialUrl: 'https://a.de', published: 'no', featured: 'no' });

    const failed = await agent.post('/api/admin/study/programmes/import').set('Content-Type', 'text/csv').send([header, newRow, bad].join('\n'));
    expect(failed.status).toBe(422);
    expect(failed.body.errors).toEqual([expect.objectContaining({ row: 3 })]);
    expect(await prisma.studyProgramme.count()).toBe(4); // nothing written

    const ok = await agent.post('/api/admin/study/programmes/import').set('Content-Type', 'text/csv').send([header, newRow, update].join('\n'));
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ created: 1, updated: 1, written: true });
    const ias = await prisma.studyProgramme.findFirstOrThrow({ where: { city: 'Hamburg' } });
    expect(ias).toMatchObject({ federalState: 'HH', published: false, slug: 'intelligent-adaptive-systems-hamburg' });
    expect(ias.deadlines).toEqual([{ intake: 'WINTER', from: '02-15', to: '03-31', note: null }]);
    const updated = await prisma.studyProgramme.findUniqueOrThrow({ where: { id: a.id } });
    expect(updated).toMatchObject({ tuitionPerSemester: 250, applicationRoute: 'UNI_ASSIST' });

    const client = await asClient();
    expect((await client.agent.post('/api/admin/study/programmes/import').set('Content-Type', 'text/csv').send(text)).status).toBe(403);
  });
});

describe('public catalogue', () => {
  it('lists published programmes by next deadline; filters; facets; drafts and their pages 404', async () => {
    const { b, c, a, draft } = await seedProgrammes();
    clearCache();
    const all = await anon().get('/api/study/programmes');
    expect(all.status).toBe(200);
    expect(all.body.items.map((p: { slug: string }) => p.slug)).toEqual([b.slug, c.slug, a.slug]); // 10, 40, 100 days
    expect(all.body.items[0]).toMatchObject({ soon: true, nextDeadline: { intake: 'SUMMER', daysLeft: 10 } });
    expect(all.body.items[0].staffNote).toBeUndefined();
    expect(all.body.facets.degrees).toEqual(expect.arrayContaining([{ value: 'MASTER', count: 2 }, { value: 'BACHELOR', count: 1 }]));
    expect(all.body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const slugs = async (qs: string) => (await anon().get(`/api/study/programmes?${qs}`)).body.items.map((p: { slug: string }) => p.slug);
    expect(await slugs('degree=BACHELOR')).toEqual([c.slug]);
    expect(await slugs('lang=en')).toEqual([b.slug, a.slug]);
    expect(await slugs('lang=en_only')).toEqual([a.slug]);
    expect(await slugs('lang=de')).toEqual([b.slug, c.slug]);
    expect(await slugs('free=1')).toEqual([c.slug, a.slug]);
    expect(await slugs('within=1')).toEqual([b.slug]);
    expect(await slugs('within=2')).toEqual([b.slug, c.slug]);
    expect(await slugs('state=BW')).toEqual([b.slug]);
    expect(await slugs('city=aachen')).toEqual([a.slug]);
    expect(await slugs('subject=engineering')).toEqual([b.slug]);
    expect(await slugs('q=stuttgart%20infotech')).toEqual([b.slug]);
    expect(await slugs('q=draft')).toEqual([]);
    expect((await anon().get('/api/study/programmes?within=5')).status).toBe(400);

    const detail = await anon().get(`/api/study/programmes/${a.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.programme).toMatchObject({ slug: a.slug, officialUrl: 'https://www.rwth-aachen.de/data-science' });
    expect(detail.body.related.map((p: { slug: string }) => p.slug)).toContain(b.slug);
    expect((await anon().get(`/api/study/programmes/${draft.slug}`)).status).toBe(404);

    // SEO: published page 200 with JSON-LD and in the sitemap; the draft answers 404 and is not listed.
    clearCache();
    expect((await anon().get(`/__seo/status?path=/de/study/${a.slug}`)).text).toBe('');
    expect((await anon().get(`/__seo/status?path=/de/study/${draft.slug}`)).text).toBe('404');
    const head = await anon().get(`/api/seo/head?path=/en/study/${a.slug}`);
    expect(head.text).toContain('EducationalOccupationalProgram');
    const sitemap = await anon().get('/sitemaps/study.xml');
    expect(sitemap.text).toContain(`/study/${a.slug}`);
    expect(sitemap.text).not.toContain(draft.slug);
    const crawler = await anon().get(`/__seo/body?path=/study/${b.slug}`);
    expect(crawler.text).toContain('rel="nofollow noopener"');
  });

  it('empty catalogue: an empty list (the page shows its empty state)', async () => {
    const res = await anon().get('/api/study/programmes');
    expect(res.body).toMatchObject({ items: [], total: 0 });
    expect(res.body.facets.degrees).toEqual([]);
  });
});

const fields = (o: Record<string, string> = {}) => ({
  name: 'Leyla Həsənova',
  email: 'Leyla@example.com',
  phone: '050 123 45 67',
  currentDegree: 'BACHELOR',
  fieldOfStudy: 'Computer Science',
  gpa: '3.6 / 4',
  languageCertificate: 'IELTS',
  languageLevel: '7.0',
  desiredIntake: 'WINTER-2027',
  message: 'Salam',
  consent: 'true',
  lng: 'en',
  ...o,
});

type Upload = { field: 'cv' | 'diploma'; data: Buffer; name: string; type: string };
const apply = (slug: string, f: Record<string, string>, files: Upload[] = [], agent: { post: (url: string) => ReturnType<ReturnType<typeof anon>['post']> } = anon()) => {
  let r = agent.post(`/api/study/programmes/${slug}/apply`);
  for (const [k, v] of Object.entries(f)) r = r.field(k, v);
  for (const x of files) r = r.attach(x.field, x.data, { filename: x.name, contentType: x.type });
  return r;
};

describe('POST /api/study/programmes/:slug/apply', () => {
  it('validates fields, consent, phone, files; unknown / draft programme 404', async () => {
    const { a, draft } = await seedProgrammes();
    expect((await apply(a.slug, fields({ consent: '' }))).status).toBe(400);
    expect((await apply(a.slug, fields({ currentDegree: 'PHD' }))).status).toBe(400);
    const phone = await apply(a.slug, fields({ phone: '12' }));
    expect(phone.body.error).toBe('INVALID_PHONE');
    const exe = await apply(a.slug, fields(), [{ field: 'cv', data: Buffer.from('MZ'), name: 'cv.exe', type: 'application/octet-stream' }]);
    expect(exe.body.error).toBe('UNSUPPORTED_FILE_TYPE');
    const fake = await apply(a.slug, fields(), [{ field: 'diploma', data: Buffer.from('not a pdf'), name: 'd.pdf', type: 'application/pdf' }]);
    expect(fake.body.error).toBe('FILE_CONTENT_MISMATCH');
    expect((await apply(draft.slug, fields())).status).toBe(404);
    expect((await apply('nope', fields())).status).toBe(404);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it('stores lead + study facts + files, notifies staff, confirms in the language; staff see it, download files; GDPR clears', async () => {
    const { a } = await seedProgrammes();
    const admin = await asAdmin();
    const pdf = await makePdf('Lebenslauf');
    const res = await apply(a.slug, fields(), [
      { field: 'cv', data: pdf, name: 'CV Leyla.pdf', type: 'application/pdf' },
      { field: 'diploma', data: PNG_BUFFER, name: 'diplom.png', type: 'image/png' },
    ]);
    expect(res.status).toBe(201);
    const q = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id }, include: { studyApplication: true } });
    expect(q).toMatchObject({ kind: 'contact', email: 'leyla@example.com', phone: '+994501234567', locale: 'en', source: `study-programme:${a.slug}`, convertedUserId: null });
    expect(q.message).toContain('Data Science M.Sc.');
    expect(q.studyApplication).toMatchObject({
      programmeId: a.id,
      programmeSlug: a.slug,
      programmeName: 'Data Science M.Sc.',
      university: 'RWTH Aachen University',
      currentDegree: 'BACHELOR',
      gpa: '3.6 / 4',
      languageCertificate: 'IELTS',
      languageLevel: '7.0',
      desiredIntake: 'WINTER-2027',
      cvOriginalName: 'CV Leyla.pdf',
      diplomaOriginalName: 'diplom.png',
      diplomaMime: 'image/png',
    });
    const cvFile = studyFilePath(q.studyApplication!.cvStoredName!);
    const diplomaFile = studyFilePath(q.studyApplication!.diplomaStoredName!);
    expect(fs.existsSync(cvFile) && fs.existsSync(diplomaFile)).toBe(true);

    const notes = await staffNotifications(admin.user.id);
    expect(notes.some((n) => n.title.includes('Leyla') && n.link === `/admin/inquiries?open=${q.id}`)).toBe(true);
    const mails = await emailsTo('leyla@example.com');
    expect(mails[0].subject).toBe('Triad Vision · We received your study application');

    const list = await admin.agent.get('/api/admin/inquiries?source=study-programme');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].studyApplication).toMatchObject({ programmeSlug: a.slug, cvOriginalName: 'CV Leyla.pdf' });
    expect(list.body.items[0].studyApplication.cvStoredName).toBeUndefined();
    expect(list.body.items[0].studyApplication.diplomaStoredName).toBeUndefined();
    const cv = await admin.agent.get(`/api/admin/study/applications/${q.id}/cv`);
    expect(cv.status).toBe(200);
    expect(cv.headers['content-type']).toContain('application/pdf');
    expect((await admin.agent.get(`/api/admin/study/applications/${q.id}/diploma`)).status).toBe(200);
    expect((await admin.agent.get(`/api/admin/study/applications/${q.id}/other`)).status).toBe(400);
    const client = await asClient();
    expect((await client.agent.get(`/api/admin/study/applications/${q.id}/cv`)).status).toBe(403);

    // Admin list counts the application; deleting the programme keeps the snapshot.
    const progs = await admin.agent.get('/api/admin/study/programmes');
    expect(progs.body.items.find((p: { id: string }) => p.id === a.id).applications).toBe(1);
    await admin.agent.delete(`/api/admin/study/programmes/${a.id}`);
    expect(await prisma.studyApplication.findUniqueOrThrow({ where: { inquiryId: q.id } })).toMatchObject({ programmeId: null, programmeName: 'Data Science M.Sc.' });

    await anonymizeInquiries([q.id]);
    const after = await prisma.studyApplication.findUniqueOrThrow({ where: { inquiryId: q.id } });
    expect(after).toMatchObject({ cvStoredName: null, diplomaStoredName: null, gpa: null, languageCertificate: null });
    expect(fs.existsSync(cvFile) || fs.existsSync(diplomaFile)).toBe(false);
  });

  it('a signed-in client: lead linked to the account, localized mail (uk); honeypot stores nothing', async () => {
    const { b } = await seedProgrammes();
    const client = await asClient();
    const res = await apply(b.slug, fields({ lng: 'uk', desiredIntake: '' }), [], client.agent);
    expect(res.status).toBe(201);
    const q = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id }, include: { studyApplication: true } });
    expect(q.convertedUserId).toBe(client.user.id);
    expect(q.locale).toBe('ru');
    expect(q.studyApplication).toMatchObject({ userId: client.user.id, desiredIntake: null, cvStoredName: null });
    const mails = await emailsTo('leyla@example.com');
    expect(mails[0].subject).toBe('Triad Vision · Вашу заявку на навчання отримано');

    const bot = await apply(b.slug, fields({ website: 'http://spam' }));
    expect(bot.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(1);
  });
});
