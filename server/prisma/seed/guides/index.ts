import type { PrismaClient } from '@prisma/client';
import { GUIDE_LOCALES, type GuideSeed } from './types.js';
import { chancenkarteGuide } from './chancenkarte.js';
import { blueCardGuide } from './blueCard.js';
import { ausbildungGuide } from './ausbildung.js';
import { anerkennungGuide } from './anerkennung.js';
import { pflegeGuide } from './pflege.js';
import { familiennachzugGuide } from './familiennachzug.js';

export const GUIDES: GuideSeed[] = [chancenkarteGuide, blueCardGuide, ausbildungGuide, anerkennungGuide, pflegeGuide, familiennachzugGuide];

const MARKER = 'seed.guides';

/**
 * Seeds the topic guides (6 keys × 6 languages). Idempotent: every (key, locale) is written at most once —
 * the marker setting remembers what was seeded, so a version the admin edits or deletes later is never
 * overwritten or re-created by a later deploy. A row that already exists (created in the admin) is kept, and
 * a version whose slug is already used in that language is skipped.
 */
export const seedGuides = async (prisma: PrismaClient) => {
  const row = await prisma.setting.findUnique({ where: { key: MARKER } });
  const done = new Set<string>(Array.isArray((row?.value as { done?: unknown } | null)?.done) ? ((row!.value as { done: string[] }).done) : []);
  let created = 0;
  for (const guide of GUIDES) {
    for (const locale of GUIDE_LOCALES) {
      const id = `${guide.key}:${locale}`;
      if (done.has(id)) continue;
      const page = guide.pages[locale];
      const [existing, slugTaken] = await Promise.all([
        prisma.guidePage.findUnique({ where: { key_locale: { key: guide.key, locale } }, select: { id: true } }),
        prisma.guidePage.findUnique({ where: { locale_slug: { locale, slug: page.slug } }, select: { id: true } }),
      ]);
      if (!existing && !slugTaken) {
        await prisma.guidePage.create({
          data: { key: guide.key, locale, slug: page.slug, title: page.title, description: page.description, body: page.body.trim(), faq: page.faq, published: true },
        });
        created++;
      }
      done.add(id);
    }
  }
  const value = { done: [...done].sort(), at: new Date().toISOString() };
  await prisma.setting.upsert({ where: { key: MARKER }, create: { key: MARKER, value }, update: { value } });
  return created;
};
