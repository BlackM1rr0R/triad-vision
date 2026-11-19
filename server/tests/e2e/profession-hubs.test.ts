import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';

/** Profession hubs (/for/:slug): open (then deactivated) vacancies of the hub's canonical professions (routes/professionHubs.ts). */

const l10n = (s: string) => ({ az: s, de: s, en: s, ru: s });
const vacancy = (title: string, o: Record<string, unknown> = {}) =>
  prisma.vacancy.create({ data: { slug: uniq('hub-'), title: l10n(title), description: l10n('x'), status: 'OPEN', city: 'Hamburg', publishedAt: new Date(), ...o } });

describe('GET /api/profession-hubs/:slug/vacancies', () => {
  it('lists only open vacancies of the hub professions, newest first, in the requested language', async () => {
    await vacancy('LKW-Fahrer CE', { publishedAt: new Date(Date.now() - 86_400_000) });
    await vacancy('Busfahrer', { title: { az: 'Avtobus sürücüsü', de: 'Busfahrer', en: 'Bus driver', ru: 'Водитель автобуса' } });
    await vacancy('Koch');
    await vacancy('LKW-Fahrer', { status: 'CLOSED' });
    await vacancy('Kurier', { profession: 'Kurierfahrer', closesAt: new Date(Date.now() - 1000) });

    await vacancy('LKW-Fahrer Entwurf', { status: 'DRAFT', publishedAt: null });
    await vacancy('LKW-Fahrer geprüft', { status: 'PENDING', publishedAt: null });

    const res = await anon().get('/api/profession-hubs/truck-driver/vacancies?lng=en').expect(200);
    expect(res.body.total).toBe(2);
    const items = res.body.items as { title: string; active: boolean }[];
    // Open ones first; deactivated (CLOSED after publication) ones after them, flagged; drafts / pending never.
    expect(items.slice(0, 2).map((i) => i.title)).toEqual(['Bus driver', 'LKW-Fahrer CE']);
    expect(items.slice(0, 2).every((i) => i.active)).toBe(true);
    expect(items.find((i) => i.title === 'LKW-Fahrer')?.active).toBe(false);
    expect(items.slice(2).every((i) => !i.active)).toBe(true);
    expect(items.some((i) => /Entwurf|geprüft/.test(i.title))).toBe(false);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['active', 'city', 'employmentType', 'free', 'publishedAt', 'salaryMax', 'salaryMin', 'slug', 'title']);
    expect(res.body.withFreePlaces).toBe(2); // free places (the page offers the vacancy waitlist at 0)

    const cook = await anon().get('/api/profession-hubs/cook/vacancies').expect(200);
    expect(cook.body.total).toBe(1);
  });

  it('caps the list at six and answers 404 for an unknown hub', async () => {
    for (let i = 0; i < 8; i++) await vacancy(`Elektriker ${i}`);
    const res = await anon().get('/api/profession-hubs/electrician/vacancies').expect(200);
    expect(res.body.total).toBe(8);
    expect(res.body.items).toHaveLength(6);
    await anon().get('/api/profession-hubs/astronaut/vacancies').expect(404);
  });
});
