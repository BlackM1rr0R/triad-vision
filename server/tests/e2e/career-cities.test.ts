import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { prisma } from '../helpers/db';
import { clearCache } from '../../src/lib/cache.js';

/**
 * City pages (/api/career/cities, lib/careerPages/cities.ts) take their cost figures from the active CityCost rows —
 * the rows of the budget calculator (Admin → Şəhər xərcləri) — and fall back to the seed defaults without rows.
 */

const slugs = async (lng: string) => (await anon().get(`/api/career/cities?lng=${lng}`).expect(200)).body.items.map((c: { slug: string }) => c.slug) as string[];

describe('city pages: CityCost rows of the database', () => {
  it('show the edited figures as estimates, drop deactivated cities, and use the seed defaults once every row is gone', async () => {
    await anon().get('/api/career/cities/hamburg?lng=az').expect(200); // the first read seeds the table (lib/budget/cities.ts)
    expect(await prisma.cityCost.count()).toBeGreaterThan(0);
    await prisma.cityCost.update({ where: { slug: 'hamburg' }, data: { flat1ColdMin: 610, flat1ColdMax: 790 } });
    await prisma.cityCost.update({ where: { slug: 'koeln' }, data: { active: false } });
    clearCache(); // as every admin write does (routes/admin/cityCosts.ts)

    const hamburg = await anon().get('/api/career/cities/hamburg?lng=az').expect(200);
    expect(hamburg.body.costs.flat1).toEqual([610, 790]);
    expect(hamburg.body.texts.labels.estimate).toBe('Təxmini');
    expect(hamburg.body.texts.description).toContain('610');
    await anon().get('/api/career/cities/koeln?lng=az').expect(404);
    expect(await slugs('az')).not.toContain('koeln');
    expect((await anon().get('/__seo/status').query({ path: '/de/cities/koeln' })).text).toBe('404');

    // Every row deleted (deleted rows do not come back by themselves): the pages show the seed defaults again.
    await prisma.cityCost.deleteMany();
    clearCache();
    const koeln = await anon().get('/api/career/cities/koeln?lng=az').expect(200);
    expect(koeln.body.costs.flat1[0]).toBeGreaterThan(0);
    expect((await anon().get('/api/career/cities/hamburg?lng=az').expect(200)).body.costs.flat1).not.toEqual([610, 790]);
    expect(await slugs('az')).toEqual(expect.arrayContaining(['berlin', 'hamburg', 'koeln']));
  });
});
