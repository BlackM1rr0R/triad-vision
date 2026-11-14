import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { DRAFT_KEYS, GUIDE_DRAFTS, PUBLISHED_ON_CREATE, draftPlaceholders, seedGuideDrafts } from '../../prisma/seed/guideDrafts/index.js';
import { GUIDES } from '../../prisma/seed/guides/index.js';
import { markdownToText, renderGuideMarkdown } from '../../src/lib/guides/markdown.js';
import { PLACEHOLDER_RE, guidePlaceholders } from '../../src/lib/guides/placeholders.js';

type Row = { id: string; key: string; locale: string; slug: string; published: boolean; title: string; description?: string; body?: string; faq?: unknown };

/** In-memory stand-in for the two Prisma delegates the draft seed uses. */
const fakePrisma = (rows: Row[] = []) => {
  const settings = new Map<string, unknown>();
  let seq = rows.length;
  const prisma = {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) => (settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null),
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        settings.set(where.key, settings.has(where.key) ? update.value : create.value);
      },
    },
    guidePage: {
      findUnique: async ({ where }: { where: { key_locale?: { key: string; locale: string }; locale_slug?: { locale: string; slug: string } } }) =>
        rows.find((r) =>
          where.key_locale ? r.key === where.key_locale.key && r.locale === where.key_locale.locale : r.locale === where.locale_slug!.locale && r.slug === where.locale_slug!.slug,
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.find((r) => r.id === where.id)!, data),
      create: async ({ data }: { data: Omit<Row, 'id'> }) => {
        const row = { ...data, id: `g${++seq}` };
        rows.push(row);
        return row;
      },
    },
  };
  return { prisma: prisma as unknown as PrismaClient, rows };
};

const opts = { localize: (p: string) => p, guideHref: () => null };

describe('SEO guide drafts (content)', () => {
  it('covers the planned keys and languages (tr/uk for the job-seeker guides)', () => {
    const ids = GUIDE_DRAFTS.map((d) => `${d.key}:${d.locale}`).sort();
    expect(ids).toEqual(
      [
        'driver-jobs:az', 'driver-jobs:ru', 'driver-jobs:en', 'driver-jobs:tr', 'driver-jobs:uk',
        'work-visa:az', 'work-visa:ru', 'work-visa:en', 'work-visa:tr', 'work-visa:uk',
        'salary-net:az', 'salary-net:ru', 'salary-net:tr', 'salary-net:uk',
        'first-month:az', 'first-month:ru', 'first-month:tr', 'first-month:uk',
        'jobs-azerbaijan:az', 'jobs-azerbaijan:ru', 'jobs-azerbaijan:tr', 'jobs-azerbaijan:uk',
        'employer-azerbaijan:de', 'employer-azerbaijan:en',
        'employer-drivers:de', 'employer-nursing:de', 'employer-apprentices:de', 'fast-track-81a:de',
      ].sort(),
    );
  });

  it('has unique slugs that do not collide with the published guides, SEO-sized titles and real content', () => {
    const existing = new Set(GUIDES.flatMap((g) => Object.entries(g.pages).map(([l, p]) => `${l}:${p.slug}`)));
    const existingKeys = GUIDES.map((g) => g.key);
    const slugs = GUIDE_DRAFTS.map((d) => `${d.locale}:${d.slug}`);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const d of GUIDE_DRAFTS) {
      const where = `${d.key} ${d.locale}`;
      expect(existing.has(`${d.locale}:${d.slug}`), where).toBe(false);
      expect(existingKeys, where).not.toContain(d.key);
      expect(d.slug, where).toMatch(/^[a-z0-9][a-z0-9-]{2,159}$/);
      expect(d.title.length, where).toBeLessThanOrEqual(60);
      expect(d.description.length, where).toBeGreaterThanOrEqual(110);
      expect(d.description.length, where).toBeLessThanOrEqual(160);
      expect(markdownToText(d.body).split(' ').length, where).toBeGreaterThan(750);
      expect(d.body, where).not.toMatch(/^# /m);
      expect(d.body, where).toContain('](/booking)');
      expect(d.faq.length, where).toBeGreaterThanOrEqual(4);
      for (const f of d.faq) expect(f.q.trim() && f.a.trim(), where).toBeTruthy();
      for (const m of d.body.matchAll(/\]\(guide:([a-z0-9-]+)\)/g)) expect([...existingKeys, ...DRAFT_KEYS], `${where} → ${m[1]}`).toContain(m[1]);
      expect(renderGuideMarkdown(d.body, opts).toc.length, where).toBeGreaterThanOrEqual(4);
    }
  });

  it('marks review placeholders only with the known prefixes', () => {
    for (const d of GUIDE_DRAFTS) {
      const loose = [d.title, d.description, d.body, ...d.faq.flatMap((f) => [f.q, f.a])].join('\n').match(/\[(YOXLA|PRÜFEN|ПРОВЕРИТЬ|CHECK)\b[^\]]*\]/g) ?? [];
      expect(loose.every((p) => new RegExp(PLACEHOLDER_RE.source).test(p)), `${d.key} ${d.locale}`).toBe(true);
    }
    // Every fact of the drafts is checked in the repository: no placeholder is left.
    expect(draftPlaceholders().filter((p) => p.placeholders.length)).toEqual([]);
    expect(guidePlaceholders({ title: 'x', body: 'a [PRÜFEN: 411 €] b', faq: [{ q: 'q', a: '[YOXLA: x]' }] })).toEqual(['[PRÜFEN: 411 €]', '[YOXLA: x]']);
  });
});

describe('seedGuideDrafts', () => {
  it('creates unpublished rows (tr/uk translations of checked texts: published) and is idempotent', async () => {
    const { prisma, rows } = fakePrisma();
    expect(await seedGuideDrafts(prisma)).toBe(GUIDE_DRAFTS.length);
    expect(rows).toHaveLength(GUIDE_DRAFTS.length);
    for (const r of rows) expect(r.published, `${r.key} ${r.locale}`).toBe(PUBLISHED_ON_CREATE.includes(r.locale as never));
    expect(rows.filter((r) => r.published).map((r) => r.locale).sort()).toEqual([...Array(5).fill('tr'), ...Array(5).fill('uk')]);
    expect(await seedGuideDrafts(prisma)).toBe(0);
    expect(rows).toHaveLength(GUIDE_DRAFTS.length);
  });

  it('never touches existing rows or taken slugs and does not re-create deleted drafts', async () => {
    const first = GUIDE_DRAFTS[0];
    const second = GUIDE_DRAFTS[1];
    const own: Row = { id: 'own', key: first.key, locale: first.locale, slug: 'owner-slug', published: true, title: 'Owner text' };
    const taken: Row = { id: 'taken', key: 'other', locale: second.locale, slug: second.slug, published: true, title: 'Other guide' };
    const { prisma, rows } = fakePrisma([own, taken]);
    expect(await seedGuideDrafts(prisma)).toBe(GUIDE_DRAFTS.length - 2);
    expect(rows.find((r) => r.id === 'own')).toEqual(own);
    expect(rows.find((r) => r.id === 'taken')).toEqual(taken);

    // The owner deletes a draft: a later deploy does not bring it back.
    const idx = rows.findIndex((r) => r.key === GUIDE_DRAFTS[2].key && r.locale === GUIDE_DRAFTS[2].locale);
    rows.splice(idx, 1);
    expect(await seedGuideDrafts(prisma)).toBe(0);
  });

  it('refreshes an unfinished draft (unpublished, placeholders left) with the checked text, never a reviewed or published page', async () => {
    const { prisma, rows } = fakePrisma();
    await seedGuideDrafts(prisma);
    const [a, b, c] = rows.filter((r) => !r.published);
    Object.assign(a, { body: 'old [YOXLA: x] text', title: 'Old' });
    Object.assign(b, { body: 'owner edited, no markers', title: 'Owner' });
    Object.assign(c, { body: 'old [CHECK: y]', title: 'Live', published: true });
    await seedGuideDrafts(prisma);
    const da = GUIDE_DRAFTS.find((d) => d.key === a.key && d.locale === a.locale)!;
    expect(a).toMatchObject({ title: da.title, body: da.body, published: false });
    expect(b).toMatchObject({ title: 'Owner', body: 'owner edited, no markers' });
    expect(c).toMatchObject({ title: 'Live', body: 'old [CHECK: y]', published: true });
  });
});
