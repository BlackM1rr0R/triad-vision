import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Response } from 'supertest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createVisaCategory, l10n } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { config } from '../../src/config.js';
import { cvPdfText } from '../unit/cvPdfText';
import { asCandidate, asCompany, cleanJobs, createVacancy } from './vacancies.fixtures';

beforeEach(cleanJobs);

const binary = (res: Response) => res.body as Buffer;
const pdfParser = binaryParser;

const fullCv = {
  headline: 'Berufskraftfahrer CE',
  summary: 'Zuverlässiger Fahrer mit acht Jahren Erfahrung im Fernverkehr.',
  experience: [{ title: 'Fahrer Klasse CE', employer: 'Qafqaz Trans MMC', city: 'Gəncə', country: 'Aserbaidschan', from: '2019-09', to: null, tasks: ['Ladungssicherung', 'Tourenplanung'] }],
  education: [{ degree: 'Berufsausbildung', institution: 'Gəncə Peşə Məktəbi', city: 'Gəncə', country: 'Aserbaidschan', from: '2008-09', to: '2011-06', field: 'Kfz-Technik' }],
  languages: [
    { language: 'Aserbaidschanisch', level: 'native' },
    { language: 'Deutsch', level: 'B1' },
  ],
  skills: ['Ladungssicherung', 'Tachograph', 'Erste Hilfe'],
  certificates: [{ name: 'ADR-Bescheinigung', issuer: 'DEKRA', year: 2021 }],
  drivingLicences: ['B', 'C', 'CE'],
  interests: ['Schach'],
};

describe('CV: read, save, prefill', () => {
  it('creates an empty CV on first read and returns the profile basics', async () => {
    const { agent, user } = await asCandidate({ nationality: 'AZE' });
    const res = await agent.get('/api/cv');
    expect(res.status).toBe(200);
    expect(res.body.cv).toMatchObject({ template: 'lebenslauf', shareWithEmployers: true, data: { headline: '', experience: [] } });
    expect(res.body.profile).toMatchObject({ firstName: 'Ali', lastName: 'Məmmədov', city: 'Gəncə', profession: 'Sürücü', nationality: 'AZE' });
    expect(res.body.profile.passwordHash).toBeUndefined();
    expect(await prisma.candidateCv.count({ where: { userId: user.id } })).toBe(1);
  });

  it('saves with a strict schema', async () => {
    const { agent, user } = await asCandidate();
    const ok = await agent.put('/api/cv').send({ data: fullCv, template: 'europass', shareWithEmployers: false });
    expect(ok.status).toBe(200);
    expect(ok.body.cv).toMatchObject({ template: 'europass', shareWithEmployers: false, data: { headline: 'Berufskraftfahrer CE' } });
    expect(ok.body.completeness).toBeGreaterThan(50);
    const row = await prisma.candidateCv.findUniqueOrThrow({ where: { userId: user.id } });
    expect((row.data as { experience: unknown[] }).experience).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'CV_SHARE_DISABLED' } })).toBe(1);

    for (const data of [
      { ...fullCv, experience: [{ ...fullCv.experience[0], from: '2019-13' }] },
      { ...fullCv, languages: [{ language: 'Deutsch', level: 'B5' }] },
      { ...fullCv, extra: true },
      { ...fullCv, skills: Array.from({ length: 41 }, (_, i) => `Skill ${i}`) },
    ]) {
      const bad = await agent.put('/api/cv').send({ data });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toBe('VALIDATION');
    }
    expect((await agent.put('/api/cv').send({ data: fullCv, template: 'fancy' })).status).toBe(400);
  });

  it('prefills empty sections from the profile without overwriting', async () => {
    const { agent } = await asCandidate({ nationality: 'AZE', about: 'Ich fahre seit Jahren sicher und pünktlich.' });
    await agent.put('/api/cv').send({ data: { headline: 'Mein Titel' } });
    const res = await agent.post('/api/cv/prefill');
    expect(res.status).toBe(200);
    expect(res.body.filled).toEqual(expect.arrayContaining(['summary', 'experience', 'education', 'languages', 'drivingLicences']));
    expect(res.body.filled).not.toContain('headline');
    expect(res.body.cv.data).toMatchObject({
      headline: 'Mein Titel',
      summary: 'Ich fahre seit Jahren sicher und pünktlich.',
      drivingLicences: ['B', 'C', 'CE'],
      languages: [
        { language: 'Aserbaidschanisch', level: 'native' },
        { language: 'Deutsch', level: 'B1' },
      ],
    });
    expect(res.body.cv.data.education[0].degree).toBe('Berufsausbildung');
    const again = await agent.post('/api/cv/prefill');
    expect(again.body.filled).toEqual([]);
  });

  it('is for signed-in clients only', async () => {
    expect((await anon().get('/api/cv')).status).toBe(401);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/cv')).status).toBe(403);
    const company = await asCompany();
    expect((await company.agent.get('/api/cv/letters')).status).toBe(403);
  });
});

describe('CV PDF', () => {
  it('renders the Lebenslauf with Azerbaijani names and a proper file name', async () => {
    const { agent } = await asCandidate({ firstName: 'Əli', lastName: 'Məmmədov', nationality: 'AZE' });
    await agent.put('/api/cv').send({ data: fullCv });
    const res = await agent.get('/api/cv/pdf?template=lebenslauf&lang=de').buffer(true).parse(pdfParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('filename="Lebenslauf_Mammadov_Ali.pdf"');
    const text = await cvPdfText(binary(res));
    for (const s of ['Lebenslauf', 'Persönliche Daten', 'Əli Məmmədov', 'Nizami küç. 10, Gəncə', '01.05.1990', 'aserbaidschanisch', '09/2019 – heute', 'Qafqaz Trans MMC', 'Gəncə Peşə Məktəbi', 'Klasse B, C, CE']) {
      expect(text).toContain(s);
    }
  });

  it('renders Europass in English and embeds the vault photo', async () => {
    const { agent, user } = await asCandidate();
    await agent.put('/api/cv').send({ data: fullCv });
    // 1×1 PNG in the vault
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const dir = path.join(config.uploads.privateDir, 'vault');
    await fs.mkdir(dir, { recursive: true });
    const key = `cvtest-${Date.now()}.png`;
    await fs.writeFile(path.join(dir, key), png);
    await prisma.vaultDocument.create({ data: { userId: user.id, kind: 'PHOTO', title: 'Foto', storageKey: key, filename: 'foto.png', mimeType: 'image/png', size: png.length } });
    try {
      const withPhoto = await agent.get('/api/cv/pdf?template=europass&lang=en&photo=1').buffer(true).parse(pdfParser);
      expect(withPhoto.status).toBe(200);
      expect(withPhoto.headers['content-disposition']).toContain('CV_Mammadov_Ali.pdf');
      expect(binary(withPhoto).toString('latin1')).toContain('/Subtype /Image');
      const text = await cvPdfText(binary(withPhoto));
      for (const s of ['CURRICULUM VITAE', 'Work experience', 'Language skills', 'Listening', 'German', '09/2019 – present']) expect(text).toContain(s);
      const noPhoto = await agent.get('/api/cv/pdf?template=europass&photo=0').buffer(true).parse(pdfParser);
      expect(binary(noPhoto).toString('latin1')).not.toContain('/Subtype /Image');
    } finally {
      await fs.rm(path.join(dir, key), { force: true });
    }
    expect((await agent.get('/api/cv/pdf?template=modern')).status).toBe(400);
  });
});

describe('CV for employers and staff', () => {
  const setup = async () => {
    const candidate = await asCandidate({ firstName: 'Əli', lastName: 'Məmmədov', email: 'ali.m@example.com' });
    await candidate.agent.put('/api/cv').send({ data: fullCv });
    const employer = await asCompany();
    const vacancy = await createVacancy({ companyId: employer.company.id });
    const app = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status: 'PROPOSED' } });
    return { candidate, employer, vacancy, app };
  };

  it('employer gets the anonymised CV of a presented candidate', async () => {
    const { employer, app } = await setup();
    const res = await employer.agent.get(`/api/company/candidates/${app.id}/cv.pdf`).buffer(true).parse(pdfParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('Lebenslauf_Ali_M.pdf');
    const text = await cvPdfText(binary(res));
    expect(text).toContain('Əli M.');
    expect(text).toContain('Qafqaz Trans MMC');
    expect(text).toContain('Jahrgang');
    for (const s of ['Məmmədov', 'ali.m@example.com', '+994501112233', 'Nizami', '01.05.1990']) expect(text).not.toContain(s);
    expect(binary(res).toString('latin1')).not.toContain('/Subtype /Image');
    expect(await prisma.auditLog.count({ where: { action: 'CV_DOWNLOADED_BY_EMPLOYER' } })).toBe(1);
  });

  it('employer cannot fetch a CV that is not presented, not theirs or not shared', async () => {
    const { candidate, employer, app } = await setup();
    await prisma.vacancyApplication.update({ where: { id: app.id }, data: { status: 'SHORTLISTED' } });
    expect((await employer.agent.get(`/api/company/candidates/${app.id}/cv.pdf`)).status).toBe(404);

    await prisma.vacancyApplication.update({ where: { id: app.id }, data: { status: 'INTERVIEW' } });
    const other = await asCompany();
    expect((await other.agent.get(`/api/company/candidates/${app.id}/cv.pdf`)).status).toBe(404);
    expect((await employer.agent.get('/api/company/candidates/nope/cv.pdf')).status).toBe(404);

    await candidate.agent.put('/api/cv').send({ data: fullCv, shareWithEmployers: false });
    const notShared = await employer.agent.get(`/api/company/candidates/${app.id}/cv.pdf`);
    expect(notShared.status).toBe(404);
    expect(notShared.body.error).toBe('CV_NOT_SHARED');
    expect((await candidate.agent.get(`/api/company/candidates/${app.id}/cv.pdf`)).status).toBe(403);
  });

  it('builds the employer CV from the profile when the candidate never opened the CV editor', async () => {
    const { candidate, employer, app } = await setup();
    await prisma.candidateCv.deleteMany({ where: { userId: candidate.user.id } });
    await prisma.vacancyApplication.update({ where: { id: app.id }, data: { status: 'INTERVIEW' } });
    const res = await employer.agent.get(`/api/company/candidates/${app.id}/cv.pdf`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('staff download the full CV; employers and clients cannot', async () => {
    const { candidate, employer } = await setup();
    const staff = await asStaff();
    const res = await staff.agent.get(`/api/admin/candidates/${candidate.user.id}/cv.pdf`).buffer(true).parse(pdfParser);
    expect(res.status).toBe(200);
    const text = await cvPdfText(binary(res));
    expect(text).toContain('Əli Məmmədov');
    expect(text).toContain('ali.m@example.com');
    expect((await employer.agent.get(`/api/admin/candidates/${candidate.user.id}/cv.pdf`)).status).toBe(403);
    expect((await candidate.agent.get(`/api/admin/candidates/${candidate.user.id}/cv.pdf`)).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get(`/api/admin/candidates/${staff.user.id}/cv.pdf`)).status).toBe(404);
  });
});

describe('motivation letters', () => {
  it('create (VISA with case), list, edit, regenerate, pdf, delete', async () => {
    const { agent, user } = await asCandidate({ firstName: 'Əli', lastName: 'Məmmədov' });
    await agent.put('/api/cv').send({ data: fullCv });
    const visa = await createVisaCategory({ title: l10n('Fachkräfte') });
    const c = await prisma.case.create({ data: { clientId: user.id, number: 'TV-2026-0101', profession: 'Berufskraftfahrer', visaCategoryId: visa.id } });

    const opts = await agent.get('/api/cv/letters/options');
    expect(opts.body.cases).toEqual([expect.objectContaining({ id: c.id, visa: 'Fachkräfte de', profession: 'Berufskraftfahrer' })]);

    const created = await agent.post('/api/cv/letters').send({ kind: 'VISA', caseId: c.id, language: 'de', answers: { whyGermany: 'in Deutschland werden Fahrer gesucht', plans: 'Ich möchte in Hamburg leben' } });
    expect(created.status).toBe(201);
    const letter = created.body.letter;
    expect(letter.title).toBe('Motivationsschreiben zum Antrag auf ein nationales Visum – Fachkräfte de');
    expect(letter.body).toContain('als Berufskraftfahrer zu arbeiten');
    expect(letter.body).toContain('In Deutschland werden Fahrer gesucht.');
    expect(letter.body).toContain('Ich möchte in Hamburg leben.');
    expect(letter.body).toContain('Əli Məmmədov');

    const list = await agent.get('/api/cv/letters');
    expect(list.body.items).toHaveLength(1);

    const patched = await agent.patch(`/api/cv/letters/${letter.id}`).send({ body: 'Sehr geehrte Damen und Herren,\n\nmein eigener Text.\n\nMit freundlichen Grüßen' });
    expect(patched.status).toBe(200);
    expect((await agent.get(`/api/cv/letters/${letter.id}`)).body.letter.body).toContain('mein eigener Text.');

    const pdf = await agent.get(`/api/cv/letters/${letter.id}/pdf`).buffer(true).parse(pdfParser);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-disposition']).toContain('Motivationsschreiben_Mammadov.pdf');
    const text = await cvPdfText(binary(pdf));
    for (const s of ['Botschaft der Bundesrepublik Deutschland', 'Motivationsschreiben zum Antrag', 'mein eigener Text.', 'Əli Məmmədov']) expect(text).toContain(s);

    const regen = await agent.post(`/api/cv/letters/${letter.id}/regenerate`).send({ language: 'en' });
    expect(regen.status).toBe(200);
    expect(regen.body.letter.language).toBe('en');
    expect(regen.body.letter.body.startsWith('Dear Sir or Madam,')).toBe(true);
    expect(regen.body.letter.body).toContain('Germany');

    expect((await agent.delete(`/api/cv/letters/${letter.id}`)).status).toBe(200);
    expect((await agent.get(`/api/cv/letters/${letter.id}`)).status).toBe(404);
  });

  it('JOB letter uses the vacancy; company shown only when public', async () => {
    const { agent, user } = await asCandidate();
    const employer = await asCompany();
    const v = await createVacancy({ companyId: employer.company.id, title: l10n('LKW-Fahrer'), showCompany: true });
    await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: user.id, status: 'NEW' } });
    const opts = await agent.get('/api/cv/letters/options');
    expect(opts.body.applications[0]).toMatchObject({ vacancyId: v.id, title: 'LKW-Fahrer de', company: employer.company.name });
    const res = await agent.post('/api/cv/letters').send({ kind: 'JOB', vacancyId: v.id });
    expect(res.status).toBe(201);
    expect(res.body.letter.title).toBe('Bewerbung als LKW-Fahrer de in Hamburg');
    const pdf = await agent.get(`/api/cv/letters/${res.body.letter.id}/pdf`).buffer(true).parse(pdfParser);
    expect(await cvPdfText(binary(pdf))).toContain(employer.company.name);

    const hidden = await createVacancy({ companyId: employer.company.id, status: 'CLOSED' });
    expect((await agent.post('/api/cv/letters').send({ kind: 'JOB', vacancyId: hidden.id })).status).toBe(404);
  });

  it('isolates letters and cases between clients and validates input', async () => {
    const a = await asCandidate();
    const b = await asClient();
    const c = await prisma.case.create({ data: { clientId: a.user.id, number: 'TV-2026-0102', profession: 'Koch' } });
    const own = await a.agent.post('/api/cv/letters').send({ kind: 'ANERKENNUNG', caseId: c.id });
    expect(own.status).toBe(201);
    expect(own.body.letter.title).toContain('Anerkennung');
    const id = own.body.letter.id;

    expect((await b.agent.post('/api/cv/letters').send({ kind: 'VISA', caseId: c.id })).status).toBe(404);
    expect((await b.agent.get(`/api/cv/letters/${id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/cv/letters/${id}`).send({ body: 'x' })).status).toBe(404);
    expect((await b.agent.delete(`/api/cv/letters/${id}`)).status).toBe(404);
    expect((await b.agent.get(`/api/cv/letters/${id}/pdf`)).status).toBe(404);
    expect((await b.agent.get('/api/cv/letters')).body.items).toEqual([]);

    expect((await a.agent.post('/api/cv/letters').send({ kind: 'OTHER' })).status).toBe(400);
    expect((await a.agent.post('/api/cv/letters').send({ kind: 'VISA', answers: { whyGermany: 'x'.repeat(1300) } })).status).toBe(400);
    expect((await a.agent.patch(`/api/cv/letters/${id}`).send({ kind: 'JOB' })).status).toBe(400);
  });
});
