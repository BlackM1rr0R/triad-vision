import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asSuperAdmin } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';

describe('site theme (GET/PUT/DELETE /api/site/theme)', () => {
  it('is public, cacheable and falls back to the defaults', async () => {
    const res = expectStatus(await anon().get('/api/site/theme'), 200);
    expect(res.headers['cache-control']).toContain('max-age=300');
    expect(res.body.theme).toEqual({ brandPrimary: '#0b1f44', accent: '#e8a317', radiusScale: 'md', defaultDensity: 'comfortable' });
    expect(res.body.vars).toMatchObject({ '--tv-primary': '#0b1f44', '--tv-accent': '#e8a317', '--tv-radius-scale': '1' });
    for (const k of Object.keys(res.body.vars)) expect(k).toMatch(/^--tv-[a-z-]+$/);
  });

  it('only a SUPER_ADMIN can change it', async () => {
    expect((await anon().put('/api/site/theme').send({ radiusScale: 'lg' })).status).toBe(401);
    const admin = await asAdmin();
    expect((await admin.agent.put('/api/site/theme').send({ radiusScale: 'lg' })).status).toBe(403);
    expect((await admin.agent.delete('/api/site/theme')).status).toBe(403);
  });

  it('saves valid values, auto-adjusts colours that fail AA and reports the change', async () => {
    const sa = await asSuperAdmin();
    const ok = expectStatus(await sa.agent.put('/api/site/theme').send({ brandPrimary: '#1D4ED8', radiusScale: 'lg', defaultDensity: 'compact' }), 200).body;
    expect(ok.theme).toMatchObject({ brandPrimary: '#1d4ed8', radiusScale: 'lg', defaultDensity: 'compact', accent: '#e8a317' });
    expect(ok.adjustments).toEqual([]);
    expect(ok.vars['--tv-radius-scale']).toBe('1.25');

    const adjusted = expectStatus(await sa.agent.put('/api/site/theme').send({ brandPrimary: '#9ec5ff' }), 200).body;
    expect(adjusted.adjustments).toHaveLength(1);
    expect(adjusted.adjustments[0]).toMatchObject({ field: 'brandPrimary', min: 4.5 });
    expect(adjusted.theme.brandPrimary).toBe(adjusted.adjustments[0].adjustedTo);
    expect(adjusted.theme.brandPrimary).not.toBe('#9ec5ff');
    // the partial update kept the other fields
    expect(adjusted.theme).toMatchObject({ radiusScale: 'lg', defaultDensity: 'compact' });

    const row = await prisma.setting.findUnique({ where: { key: 'theme' } });
    expect((row?.value as { brandPrimary: string }).brandPrimary).toBe(adjusted.theme.brandPrimary);
    expect(expectStatus(await anon().get('/api/site/theme'), 200).body.theme.brandPrimary).toBe(adjusted.theme.brandPrimary);
    // audit rows are written fire-and-forget
    await waitFor(async () => (await prisma.auditLog.count({ where: { action: 'SITE_THEME_UPDATED' } })) >= 2);
  });

  it('strict mode refuses failing colours; malformed values are rejected', async () => {
    const sa = await asSuperAdmin();
    const before = expectStatus(await anon().get('/api/site/theme'), 200).body.theme;
    const refused = await sa.agent.put('/api/site/theme').send({ accent: '#7a7a7a', mode: 'strict' });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('THEME_CONTRAST');
    expect(refused.body.issues[0]).toMatchObject({ field: 'accent' });
    expect(expectStatus(await anon().get('/api/site/theme'), 200).body.theme).toEqual(before);

    expect((await sa.agent.put('/api/site/theme').send({ brandPrimary: 'red' })).status).toBe(400);
    expect((await sa.agent.put('/api/site/theme').send({ brandPrimary: '#12345' })).status).toBe(400);
    expect((await sa.agent.put('/api/site/theme').send({ radiusScale: 'xl' })).status).toBe(400);
  });

  it('reset restores the defaults', async () => {
    const sa = await asSuperAdmin();
    expectStatus(await sa.agent.put('/api/site/theme').send({ accent: '#7a1f9e' }), 200);
    const reset = expectStatus(await sa.agent.delete('/api/site/theme'), 200).body;
    expect(reset.theme).toEqual({ brandPrimary: '#0b1f44', accent: '#e8a317', radiusScale: 'md', defaultDensity: 'comfortable' });
    expect(expectStatus(await anon().get('/api/site/theme'), 200).body.vars['--tv-accent']).toBe('#e8a317');
  });
});
