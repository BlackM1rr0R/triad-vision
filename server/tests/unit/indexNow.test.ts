import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  setting: { findUnique: vi.fn(), upsert: vi.fn() },
  urls: [] as { loc: string; lastmod: Date }[],
}));
vi.mock('../../src/db.js', () => ({ prisma: { setting: m.setting } }));
vi.mock('../../src/lib/seo.js', () => ({
  SITEMAP_GROUPS: ['pages'],
  getSeoData: async () => ({}),
  sitemapUrls: () => m.urls,
  siteOrigin: () => 'https://example.test',
}));

const { changedUrls, indexNowKey, runIndexNow, KEY_PATH } = await import('../../src/lib/indexNow.js');

const ok = () => vi.fn(async () => new Response(null, { status: 200 }));

beforeEach(() => {
  m.setting.findUnique.mockReset();
  m.setting.upsert.mockReset();
});

describe('IndexNow', () => {
  it('derives a stable key in the protocol format', () => {
    expect(indexNowKey()).toMatch(/^[a-f0-9]{32}$/);
    expect(indexNowKey()).toBe(indexNowKey());
  });

  it('finds new and changed URLs only', () => {
    expect(changedUrls({ a: '1', b: '2', c: '3' }, { a: '1', b: 'old' })).toEqual(['b', 'c']);
    expect(changedUrls({ a: '1' }, { a: '1' })).toEqual([]);
  });

  it('is off outside production', async () => {
    const f = ok();
    expect(await runIndexNow({ fetchImpl: f })).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it('submits everything the first time, then only the difference, and remembers what was sent', async () => {
    m.urls = [
      { loc: 'https://example.test/', lastmod: new Date('2026-11-01T00:00:00Z') },
      { loc: 'https://example.test/ru', lastmod: new Date('2026-11-01T00:00:00Z') },
    ];
    m.setting.findUnique.mockResolvedValue(null);
    const f = ok();
    expect(await runIndexNow({ fetchImpl: f, force: true })).toBe(2);
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ host: 'example.test', key: indexNowKey(), keyLocation: `https://example.test${KEY_PATH}`, urlList: m.urls.map((u) => u.loc) });
    const saved = m.setting.upsert.mock.calls[0][0].create.value.urls;

    m.setting.findUnique.mockResolvedValue({ value: { urls: saved } });
    m.urls = [...m.urls.slice(0, 1), { loc: 'https://example.test/ru', lastmod: new Date('2026-11-12T00:00:00Z') }];
    const g = ok();
    expect(await runIndexNow({ fetchImpl: g, force: true })).toBe(1);
    expect(JSON.parse((g.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).urlList).toEqual(['https://example.test/ru']);

    m.setting.findUnique.mockResolvedValue({ value: { urls: m.setting.upsert.mock.calls[1][0].create.value.urls } });
    const h = ok();
    expect(await runIndexNow({ fetchImpl: h, force: true })).toBe(0);
    expect(h).not.toHaveBeenCalled();
  });

  it('does not record a failed submission, so it is retried', async () => {
    m.urls = [{ loc: 'https://example.test/', lastmod: new Date('2026-11-01T00:00:00Z') }];
    m.setting.findUnique.mockResolvedValue(null);
    const f = vi.fn(async () => new Response(null, { status: 429 }));
    await expect(runIndexNow({ fetchImpl: f, force: true })).rejects.toThrow('429');
    expect(m.setting.upsert).not.toHaveBeenCalled();
  });
});
