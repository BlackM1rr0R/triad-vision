import { describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { GUIDES, seedGuides } from '../../prisma/seed/guides/index.js';
import { guideFieldHash, seedGuideRevisions, type GuideRevision } from '../../prisma/seed/guides/revisions.js';

const blueCard = GUIDES.find((g) => g.key === 'blue-card')!;

const OLD = {
  title: 'Blaue Karte EU 2026: alter Titel',
  description: 'Alte Beschreibung der Blauen Karte.',
  body: '## Alt\n\nAlter Text.',
  faq: [{ q: 'Alte Frage?', a: 'Alte Antwort.' }],
};

const oldHashes = {
  title: guideFieldHash('title', OLD.title),
  description: guideFieldHash('description', OLD.description),
  body: guideFieldHash('body', OLD.body),
  faq: guideFieldHash('faq', OLD.faq),
};

const REV: GuideRevision = { id: 'test-blue-card', key: 'blue-card', previous: { de: oldHashes, en: oldHashes, ru: oldHashes } };

const createRow = (locale: 'de' | 'en' | 'ru', over: Partial<typeof OLD> = {}) =>
  prisma.guidePage.create({
    data: { key: 'blue-card', locale, slug: blueCard.pages[locale].slug, published: true, ...OLD, ...over } as never,
  });

describe('guide revisions', () => {
  it('updates only fields that still hold the previously shipped text, once per language', async () => {
    const de = await createRow('de');
    // The owner rewrote the English body (with Windows line endings from the browser) and the FAQ.
    const en = await createRow('en', { body: '## Eigener Text\r\n\r\nVom Inhaber.', faq: [{ q: 'Own?', a: 'Yes.' }] });
    // Unchanged text saved from the admin form with CRLF still counts as the shipped text.
    const ru = await createRow('ru', { body: OLD.body.replace(/\n/g, '\r\n') });

    const updated = await seedGuideRevisions(prisma, [REV]);
    expect(updated).toBe(4 + 2 + 4);

    const d = await prisma.guidePage.findUniqueOrThrow({ where: { id: de.id } });
    expect(d).toMatchObject({ title: blueCard.pages.de.title, description: blueCard.pages.de.description, body: blueCard.pages.de.body.trim(), slug: 'blaue-karte-eu' });
    expect(d.faq).toEqual(blueCard.pages.de.faq);

    const e = await prisma.guidePage.findUniqueOrThrow({ where: { id: en.id } });
    expect(e.title).toBe(blueCard.pages.en.title);
    expect(e.description).toBe(blueCard.pages.en.description);
    expect(e.body).toBe('## Eigener Text\r\n\r\nVom Inhaber.');
    expect(e.faq).toEqual([{ q: 'Own?', a: 'Yes.' }]);

    expect((await prisma.guidePage.findUniqueOrThrow({ where: { id: ru.id } })).body).toBe(blueCard.pages.ru.body.trim());

    // Second run: nothing to do, and an owner who restores the old text later keeps it.
    await prisma.guidePage.update({ where: { id: de.id }, data: { title: OLD.title } });
    expect(await seedGuideRevisions(prisma, [REV])).toBe(0);
    expect((await prisma.guidePage.findUniqueOrThrow({ where: { id: de.id } })).title).toBe(OLD.title);
    const marker = await prisma.setting.findUniqueOrThrow({ where: { key: 'seed.guides.revisions' } });
    expect((marker.value as { done: string[] }).done).toEqual(['test-blue-card:de', 'test-blue-card:en', 'test-blue-card:ru']);
  });

  it('leaves freshly seeded guides (already current) alone with the shipped revisions', async () => {
    expect(await seedGuides(prisma)).toBe(36);
    const before = await prisma.guidePage.findMany({ orderBy: { id: 'asc' }, select: { id: true, title: true, body: true, updatedAt: true } });
    expect(await seedGuideRevisions(prisma)).toBe(0);
    expect(await prisma.guidePage.findMany({ orderBy: { id: 'asc' }, select: { id: true, title: true, body: true, updatedAt: true } })).toEqual(before);
  });
});
