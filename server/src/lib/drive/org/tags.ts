import { prisma } from '../../../db.js';
import { runOnce } from './flags.js';

/** Coloured labels on drive items ("Təcili", "Yoxlanılıb" …): admins manage the list, staff apply them. */
export const TAG_COLORS = ['red', 'green', 'blue', 'amber', 'violet', 'pink', 'teal', 'slate'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const DEFAULT_TAGS: { name: string; color: TagColor }[] = [
  { name: 'Təcili', color: 'red' },
  { name: 'Yoxlanılıb', color: 'green' },
  { name: 'Tərcüməyə', color: 'blue' },
  { name: 'Orijinal lazımdır', color: 'amber' },
];

export const seedTags = () =>
  runOnce('drive.org.tagsSeeded', async () => {
    await prisma.driveTag.createMany({ data: DEFAULT_TAGS.map((t, i) => ({ ...t, sortOrder: i })), skipDuplicates: true });
  });

export const tagSelect = { id: true, name: true, color: true, sortOrder: true } as const;

export const listTags = async () => {
  await seedTags();
  return prisma.driveTag.findMany({ select: tagSelect, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
};
