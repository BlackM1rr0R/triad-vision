import type { PrismaClient } from '@prisma/client';
import type { GuideLocale, GuidePageSeed } from '../guides/types.js';
import { guidePlaceholders } from '../../../src/lib/guides/placeholders.js';
import { AZ_DRAFTS } from './az.js';
import { RU_DRAFTS } from './ru.js';
import { DE_DRAFTS } from './de.js';
import { EN_DRAFTS } from './en.js';

/**
 * SEO landing guides written for the target queries in docs/SEO.md ("Content suggestions"), seeded as
 * UNPUBLISHED drafts (GuidePage.published = false): the owner checks the legal facts in Admin → Guides
 * (/admin/guides), removes every review placeholder (YOXLA / ПРОВЕРИТЬ / PRÜFEN / CHECK in square brackets,
 * see src/lib/guides/placeholders.ts — the admin API refuses to publish a guide that still has one) and switches "Published" on.
 * Until then a draft is not in the public API, the sitemap, the guide lists or the crawler HTML, and
 * /__seo/status answers 404 for its URL.
 *
 * Keys (one row per key and language; a key's languages are hreflang alternates of each other):
 *   job seekers  driver-jobs (az, ru, en), work-visa (az, ru, en), salary-net (az, ru), first-month (az, ru),
 *                jobs-azerbaijan (az, ru)
 *   employers    employer-azerbaijan (de, en), employer-drivers (de), employer-nursing (de),
 *                employer-apprentices (de), fast-track-81a (de)
 * tr / uk are deliberately not written (no machine-quality duplicates). The existing guides (chancenkarte,
 * blue-card, ausbildung, anerkennung, pflege, familiennachzug) already cover those topics in every language.
 */
export const DRAFT_KEYS = [
  'driver-jobs',
  'work-visa',
  'salary-net',
  'first-month',
  'jobs-azerbaijan',
  'employer-azerbaijan',
  'employer-drivers',
  'employer-nursing',
  'employer-apprentices',
  'fast-track-81a',
] as const;
export type DraftKey = (typeof DRAFT_KEYS)[number];

export interface GuideDraft extends GuidePageSeed {
  key: DraftKey;
  locale: GuideLocale;
}

const BY_LOCALE: [GuideLocale, Partial<Record<DraftKey, GuidePageSeed>>][] = [
  ['az', AZ_DRAFTS],
  ['ru', RU_DRAFTS],
  ['de', DE_DRAFTS],
  ['en', EN_DRAFTS],
];

export const GUIDE_DRAFTS: GuideDraft[] = BY_LOCALE.flatMap(([locale, pages]) =>
  DRAFT_KEYS.filter((key) => pages[key]).map((key) => ({ ...pages[key]!, body: pages[key]!.body.trim(), key, locale })),
);

/** Every review placeholder of the drafts, per page (for the owner's checklist and the tests). */
export const draftPlaceholders = () => GUIDE_DRAFTS.map((d) => ({ key: d.key, locale: d.locale, slug: d.slug, placeholders: guidePlaceholders(d) }));

const MARKER = 'seed.guideDrafts';

/**
 * Inserts the missing drafts, unpublished. Idempotent and non-destructive: an existing (key, locale) row or a
 * slug already used in that language is never touched (whatever its state), and the marker setting remembers
 * every (key, locale) handled, so a draft the owner deletes is not re-created by a later deploy.
 * One exception: a row that is still an unpublished draft with review placeholders (the owner has not
 * finished it) is refreshed with the seed's text once the seed's version has none (facts checked in the
 * repository), so the checked text reaches the admin without overwriting a reviewed page.
 * Returns the number of rows created.
 */
/** Seed text over an unfinished draft row (unpublished, still with placeholders) when the seed text is clean. */
const refreshDraft = async (prisma: PrismaClient, d: GuideDraft) => {
  if (guidePlaceholders(d).length) return false;
  const row = await prisma.guidePage.findUnique({
    where: { key_locale: { key: d.key, locale: d.locale } },
    select: { id: true, published: true, title: true, description: true, body: true, faq: true },
  });
  if (!row || row.published || !guidePlaceholders(row).length) return false;
  await prisma.guidePage.update({ where: { id: row.id }, data: { title: d.title, description: d.description, body: d.body, faq: d.faq } });
  return true;
};

export const seedGuideDrafts = async (prisma: PrismaClient) => {
  const row = await prisma.setting.findUnique({ where: { key: MARKER } });
  const prev = (row?.value as { done?: unknown } | null)?.done;
  const done = new Set<string>(Array.isArray(prev) ? prev.filter((x): x is string => typeof x === 'string') : []);
  let created = 0;
  for (const d of GUIDE_DRAFTS) {
    const id = `${d.key}:${d.locale}`;
    if (done.has(id)) {
      await refreshDraft(prisma, d);
      continue;
    }
    const [existing, slugTaken] = await Promise.all([
      prisma.guidePage.findUnique({ where: { key_locale: { key: d.key, locale: d.locale } }, select: { id: true } }),
      prisma.guidePage.findUnique({ where: { locale_slug: { locale: d.locale, slug: d.slug } }, select: { id: true } }),
    ]);
    if (!existing && !slugTaken) {
      await prisma.guidePage.create({
        data: { key: d.key, locale: d.locale, slug: d.slug, title: d.title, description: d.description, body: d.body, faq: d.faq, published: false },
      });
      created++;
    }
    done.add(id);
  }
  const value = { done: [...done].sort(), at: new Date().toISOString() };
  await prisma.setting.upsert({ where: { key: MARKER }, create: { key: MARKER, value }, update: { value } });
  return created;
};
