import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { createService, createVisaCategory } from '../helpers/factories';

describe('GET /api/public/content?fields=shell', () => {
  it('returns the same collections without the long visa / service texts', async () => {
    await createVisaCategory({ slug: 'lkw', sortOrder: 1 });
    await createService({ slug: 'recruiting', sortOrder: 0 });
    const full = (await anon().get('/api/public/content')).body;
    const res = await anon().get('/api/public/content?fields=shell');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=600');
    const shell = res.body;
    expect(Object.keys(shell).sort()).toEqual(Object.keys(full).sort());
    expect(shell.visaCategories.map((v: { slug: string }) => v.slug)).toEqual(['lkw']);
    expect(shell.visaCategories[0].title).toEqual(full.visaCategories[0].title);
    expect(shell.visaCategories[0]).not.toHaveProperty('body');
    expect(shell.visaCategories[0]).not.toHaveProperty('requirements');
    expect(shell.services[0].summary).toEqual(full.services[0].summary);
    expect(shell.services[0]).not.toHaveProperty('body');
    expect(shell.settings).toEqual(full.settings);
    // The detail endpoints still carry the long texts.
    expect((await anon().get('/api/public/visa/lkw')).body.visa).toHaveProperty('body');
    expect((await anon().get('/api/public/services/recruiting')).body.service).toHaveProperty('body');
  });
});
