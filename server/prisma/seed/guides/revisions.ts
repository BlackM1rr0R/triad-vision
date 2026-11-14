import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { GUIDES } from './index.js';
import { GUIDE_LOCALES, type GuideLocale, type GuideSeed } from './types.js';

/**
 * Content updates of shipped guides for databases that already have them.
 *
 * seedGuides() writes each (key, locale) only once, so a later change to a seed file never reaches an existing
 * row. A revision closes that gap without ever touching the owner's work: for every field (title, description,
 * body, FAQ) of every language, the row is updated to the current seed text ONLY if the stored value still equals
 * the previously shipped text — compared by SHA-256 of the normalised value (CRLF → LF, trimmed; FAQ as [q, a]
 * pairs). A field the owner edited in /admin/guides keeps the owner's text. Each (revision, locale) is processed
 * once (marker setting `seed.guides.revisions`), so a later admin edit — or deliberately restoring the old text —
 * is never overwritten again.
 *
 * Shipping a new revision of a guide:
 *  1. Before editing the seed file, compute the hashes of the shipped version (what seedGuides + the calculator
 *     shortcode wrote): `guideRevisionHashes(GUIDES.find(g => g.key === '<key>')!)` and paste them as `previous`.
 *  2. Edit the seed file, append a revision with a new unique `id` below. Never change an existing revision.
 *  3. server/tests/unit/guideRevisions.test.ts checks that every `previous` hash differs from the current text
 *     (otherwise the revision would be a no-op) and the e2e test covers the update rules.
 */

export type GuideField = 'title' | 'description' | 'body' | 'faq';
export const GUIDE_FIELDS: GuideField[] = ['title', 'description', 'body', 'faq'];

export type FieldHashes = Partial<Record<GuideField, string>>;

export interface GuideRevision {
  /** Unique, never reused (part of the marker). */
  id: string;
  key: string;
  /** SHA-256 per field of the previously shipped text, per language. */
  previous: Partial<Record<GuideLocale, FieldHashes>>;
}

type FaqItem = { q: string; a: string };

const normalise = (field: GuideField, value: unknown): string => {
  if (field === 'faq') {
    const list = Array.isArray(value) ? (value as Partial<FaqItem>[]) : [];
    return JSON.stringify(list.map((f) => [String(f?.q ?? '').trim(), String(f?.a ?? '').trim()]));
  }
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
};

export const guideFieldHash = (field: GuideField, value: unknown) => createHash('sha256').update(normalise(field, value)).digest('hex');

/** Hashes of the text a guide seed writes (the `previous` of the next revision). */
export const guideRevisionHashes = (guide: GuideSeed): Record<GuideLocale, Required<FieldHashes>> =>
  Object.fromEntries(
    GUIDE_LOCALES.map((l) => {
      const p = guide.pages[l];
      return [l, { title: guideFieldHash('title', p.title), description: guideFieldHash('description', p.description), body: guideFieldHash('body', p.body), faq: guideFieldHash('faq', p.faq) }];
    }),
  ) as Record<GuideLocale, Required<FieldHashes>>;

export const GUIDE_REVISIONS: GuideRevision[] = [
  {
    // 2026-11: Blue Card guide — 2026 minimum salary prominently in title/description, derivation from the pension
    // contribution ceiling with 2024–2026 table, IT specialists without a degree, net example, FAQ on the calculation.
    id: 'blue-card-2026-11-mindestgehalt',
    key: 'blue-card',
    previous: {
      // Hashes of the version shipped until 2026-11 (commit 581195e, with the calculator shortcode).
      az: {
        title: 'aa8cf7c1de386b325664695c766e9e486aef9a09ff080e22dc2081a3ed36a693',
        description: '2f1f022151065053b4814a9b13938822272da34c1e8537dea5744adb48de06ba',
        body: '46a4a2a10f3d160cdb1d156a2f68fd6101d8b1fc821637d408908736079e117f',
        faq: '22208f86a8f675d30becbf10bc918955a0840fbe55ab9812f959e47be21168bb',
      },
      de: {
        title: '86e968a09e699dbcf1a1f9550b4469e707c2e06698992d1d01394192b58d2ea1',
        description: 'f8f0e6b3ea92929bb6442e09156cbd26ce9b79809333adafadc6478703d7f20a',
        body: 'f7a5877ff12fa5f49bb66e067b883997ad7206053552f98691cf4848f8c6466e',
        faq: 'd1ccc1d9bc4db1519c350ca29cd00d7468facb8f9d82975a25ccc050c275473d',
      },
      en: {
        title: '54a70d6643efca092a39950c216273415fa4777b7fcf7314bd56b2ba0248f5a0',
        description: 'db5dcc9d1ed359b69737d22c906d786a8585e7221fe617b1a9978c449b2f0f6c',
        body: '1414c4ce7c3d09df606022ce5497be82c26a55e73e5486d9506cf4aa342e97f1',
        faq: '89e73fc258bde3d58b42537d98fc9ea78370ccc491f476997ed3671af2bb2fe3',
      },
      ru: {
        title: '0344479f3520c1570a8fdf28191b8123b3e84433eafec4104160efd514c0484e',
        description: '05e8ff87215bb068a55346ef97277b53cb2300bc372592060e586ad20208c31d',
        body: '1130025c98043a79c7a3210be91717279e7f1b5b1d9d1f370f0d39d3d103536d',
        faq: '630be340a5fe2b783cbaec5e43b7185ec330aa32098ac78d970e962418ba9122',
      },
      tr: {
        title: '8d9724d7b47915288492d444c17f9edd5fd34ae50d37297fc74ef975d4b030c0',
        description: 'ca67da7dbc68e66a012e8b05e7656e16ef25f8d21a543fb2785f22dbcd145827',
        body: '874604749e7cced7cad7b6a77fa33c8137a73c922962737bfc26873b337fcba9',
        faq: '424cc7b805d3e0b428f694972e8639949c746cc582d8c16b0799bc5fadb166e0',
      },
      uk: {
        title: 'c6129a0b27770628f96185a1932f8185d693215e4ec2dd118b561b6320d1c5a5',
        description: '5bba2f78fbb6707accb5f849b5f54672a650f6008d808313af3d3a922ffbe7b6',
        body: '814056baab1b8e3abb63abfc248b5e1d58ec276517f414de363fa42088b0e422',
        faq: 'd4cbf37a0210b800222ac9bef9af2c984291eb6abcca476a5d22066e303dcfde',
      },
    },
  },
];

const MARKER = 'seed.guides.revisions';

/**
 * Applies the revisions (see above). Returns the number of fields updated. Run after seedGuides() and
 * seedGuideCalculators() so freshly created rows already carry the current text (nothing to do for them).
 */
export const seedGuideRevisions = async (prisma: PrismaClient, revisions: GuideRevision[] = GUIDE_REVISIONS, guides: GuideSeed[] = GUIDES) => {
  const row = await prisma.setting.findUnique({ where: { key: MARKER } });
  const done = new Set<string>(Array.isArray((row?.value as { done?: unknown } | null)?.done) ? (row!.value as { done: string[] }).done : []);
  let updated = 0;
  for (const rev of revisions) {
    const guide = guides.find((g) => g.key === rev.key);
    if (!guide) continue;
    for (const locale of GUIDE_LOCALES) {
      const id = `${rev.id}:${locale}`;
      const previous = rev.previous[locale];
      if (done.has(id) || !previous) continue;
      const page = await prisma.guidePage.findUnique({ where: { key_locale: { key: rev.key, locale } } });
      if (page) {
        const next = guide.pages[locale];
        const data: { title?: string; description?: string; body?: string; faq?: FaqItem[] } = {};
        for (const field of GUIDE_FIELDS) {
          const want = previous[field];
          if (!want) continue;
          const current = page[field];
          const target = field === 'body' ? next.body.trim() : next[field];
          if (guideFieldHash(field, current) !== want) continue; // owner edited (or already current): keep
          if (guideFieldHash(field, current) === guideFieldHash(field, target)) continue;
          (data as Record<string, unknown>)[field] = target;
        }
        if (Object.keys(data).length) {
          await prisma.guidePage.update({ where: { id: page.id }, data });
          updated += Object.keys(data).length;
        }
      }
      // Missing row: seedGuides creates it with the current text (or the owner deleted it on purpose) — done either way.
      done.add(id);
    }
  }
  const value = { done: [...done].sort(), at: new Date().toISOString() };
  await prisma.setting.upsert({ where: { key: MARKER }, create: { key: MARKER, value }, update: { value } });
  return updated;
};
