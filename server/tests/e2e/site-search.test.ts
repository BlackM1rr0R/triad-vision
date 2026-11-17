import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { clearCache } from '../../src/lib/cache.js';
import { createVacancy } from './vacancies.fixtures';

type Hit = { id: string; type: string; url: string; title: string };

// Site search (GET /api/search, lib/search) over tools, glossary, profession hubs, study programmes, vacancies …
// and the featured tools of /tools (GET /api/tools/featured, admin /api/admin/tool-analytics/featured).

describe('GET /api/search: one index for the whole site', () => {
  it('finds glossary terms first on an exact term, with the localised URL', async () => {
    const res = await anon().get('/api/search').query({ q: 'Anmeldung', lng: 'en' }).expect(200);
    expect(res.body.items[0]).toMatchObject({ id: 'glossary:anmeldung', type: 'glossary', url: '/en/glossary/anmeldung' });
    expect(res.body.suggestions).toEqual([]);
  });

  it('tolerates typos and Azerbaijani letters, and maps synonyms across languages', async () => {
    const typo = await anon().get('/api/search').query({ q: 'Anmeldugn', lng: 'de' }).expect(200);
    expect(typo.body.items[0].id).toBe('glossary:anmeldung');
    const maas = await anon().get('/api/search').query({ q: 'maaş kalkulyatoru', lng: 'az', types: 'tool' }).expect(200);
    expect(maas.body.items.map((h: Hit) => h.url)).toContain('/salary-calculator');
    const gehalt = await anon().get('/api/search').query({ q: 'Gehalt', lng: 'ru', types: 'tool' }).expect(200);
    expect(gehalt.body.items.map((h: Hit) => h.url)).toContain('/ru/salary-calculator');
  });

  it('returns tools, games, work scenes and profession hubs with their types', async () => {
    const scene = await anon().get('/api/search').query({ q: 'Baustelle', lng: 'de' }).expect(200);
    expect(scene.body.items.some((h: Hit) => h.type === 'tool' && h.url === '/de/work-scenes/construction-site')).toBe(true);
    const nurse = await anon().get('/api/search').query({ q: 'медсестра', lng: 'az', types: 'profession' }).expect(200);
    expect(nurse.body.items.map((h: Hit) => h.url)).toContain('/for/nurse');
  });

  it('finds vacancies and published study programmes', async () => {
    await createVacancy({ slug: 'schweisser-bremen-x', title: { az: 'Qaynaqçı', de: 'Schweißer (MAG)', en: 'Welder (MAG)', ru: 'Сварщик' } });
    clearCache(); // the index is rebuilt after content changes (the admin routes clear the cache on every write)
    const welder = await anon().get('/api/search').query({ q: 'qaynaqçı', lng: 'de', types: 'job' }).expect(200);
    expect(welder.body.items[0]).toMatchObject({ type: 'job', url: '/de/jobs/schweisser-bremen-x' });

    await prisma.studyProgramme.create({
      data: {
        slug: 'maschinenbau-rwth-x',
        name: 'Maschinenbau',
        university: 'RWTH Aachen',
        city: 'Aachen',
        federalState: 'NW',
        degree: 'MASTER',
        subjectArea: 'engineering',
        teachingLanguage: 'DE',
        durationSemesters: 4,
        tuitionPerSemester: 0,
        deadlines: [],
        applicationRoute: 'DIRECT',
        officialUrl: 'https://www.rwth-aachen.de',
        published: true,
      } as never,
    });
    clearCache();
    const studyHits = await anon().get('/api/search').query({ q: 'Maschinenbau Aachen', lng: 'en', types: 'study' }).expect(200);
    expect(studyHits.body.items[0]).toMatchObject({ type: 'study', url: '/en/study/maschinenbau-rwth-x' });
  });

  it('answers zero-result queries with "did you mean" suggestions', async () => {
    const res = await anon().get('/api/search').query({ q: 'Krankenvarsicharung', lng: 'de' }).expect(200);
    if (res.body.items.length === 0) expect(res.body.suggestions.length).toBeGreaterThan(0);
    const none = await anon().get('/api/search').query({ q: 'qqqqzzzz', lng: 'en' }).expect(200);
    expect(none.body).toMatchObject({ total: 0, items: [], suggestions: [] });
  });
});

describe('featured tools', () => {
  it('serves the default list publicly', async () => {
    await prisma.setting.deleteMany({ where: { key: 'tools.featured' } });
    const res = await anon().get('/api/tools/featured').expect(200);
    expect(res.body).toEqual({ paths: ['/salary-calculator', '/when-in-germany', '/blue-card-check', '/visa-document-checklist', '/health-insurance-comparison', '/german-mock-exam/a1'], custom: false });
  });

  it('lets an admin reorder it (staff read-only, unknown paths dropped) and reset it', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/tool-analytics/featured').expect(200)).body.available).toContain('/salary-calculator');
    expect((await staff.agent.put('/api/admin/tool-analytics/featured').send({ paths: ['/budget'] })).status).toBe(403);
    expect((await anon().put('/api/admin/tool-analytics/featured').send({ paths: ['/budget'] })).status).toBe(401);

    const admin = await asAdmin();
    const saved = await admin.agent.put('/api/admin/tool-analytics/featured').send({ paths: ['/budget', '/not-a-tool', '/salary-calculator', '/budget'] }).expect(200);
    expect(saved.body).toMatchObject({ paths: ['/budget', '/salary-calculator'], custom: true });
    expect((await anon().get('/api/tools/featured').expect(200)).body).toEqual({ paths: ['/budget', '/salary-calculator'], custom: true });
    expect((await admin.agent.put('/api/admin/tool-analytics/featured').send({ paths: Array(9).fill('/budget') })).status).toBe(400);

    await admin.agent.put('/api/admin/tool-analytics/featured').send({ paths: [] }).expect(200);
    expect((await anon().get('/api/tools/featured').expect(200)).body.custom).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'FEATURED_TOOLS_UPDATED' } })).toBeGreaterThanOrEqual(2);
  });
});
