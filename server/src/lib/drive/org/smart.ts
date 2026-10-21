import type { DocWorkflowStage, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../db.js';
import { runOnce } from './flags.js';
import { seedTags } from './tags.js';

/**
 * Saved searches ("smart folders") and the query engine behind them, the tag search and the board filters.
 * Criteria: words (in the name or a tag name), tags, file types, workflow stages, uploaded within N days,
 * below a folder, uploaded by. Words / tags / stages combine with AND (`match: 'all'`) or OR (`'any'`); the
 * other filters always narrow. Results are access-filtered by the caller (buildItems).
 */

export const WORKFLOW_STAGES: DocWorkflowStage[] = ['INCOMING', 'REVIEW', 'TRANSLATION', 'APOSTILLE', 'READY', 'SENT_TO_EMBASSY'];
export const FILE_TYPES = ['folder', 'pdf', 'image', 'word', 'excel', 'presentation', 'archive', 'text'] as const;

export const TYPE_MIME: Record<string, string[]> = {
  pdf: ['application/pdf'],
  word: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/rtf'],
  excel: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.spreadsheet', 'text/csv'],
  presentation: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  archive: ['application/zip', 'application/x-zip-compressed'],
  text: ['text/plain'],
};

const id = z.string().min(1).max(120);

export const smartQuerySchema = z.object({
  words: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  tagIds: z.array(id).max(20).optional(),
  tagMode: z.enum(['any', 'all']).optional(),
  types: z.array(z.enum(FILE_TYPES)).max(FILE_TYPES.length).optional(),
  stages: z.array(z.enum(WORKFLOW_STAGES as [DocWorkflowStage, ...DocWorkflowStage[]])).max(6).optional(),
  uploadedWithinDays: z.number().int().min(1).max(3650).optional(),
  folderId: id.optional(),
  uploadedById: id.optional(),
  match: z.enum(['all', 'any']).optional(),
});
export type SmartQuery = z.infer<typeof smartQuerySchema>;

/** Ids of the live folders below `rootId` (the root included), one query per level. */
export const folderSubtreeIds = async (rootId: string, limit = 20_000) => {
  const out = [rootId];
  let frontier = [rootId];
  for (let depth = 0; frontier.length && depth < 60 && out.length < limit; depth++) {
    const rows = await prisma.driveNode.findMany({ where: { parentId: { in: frontier }, kind: 'FOLDER', deletedAt: null }, select: { id: true } });
    frontier = rows.map((r) => r.id);
    out.push(...frontier);
  }
  return out;
};

const typeWhere = (t: (typeof FILE_TYPES)[number]): Prisma.DriveNodeWhereInput =>
  t === 'folder' ? { kind: 'FOLDER' } : t === 'image' ? { kind: 'FILE', mimeType: { startsWith: 'image/' } } : { kind: 'FILE', mimeType: { in: TYPE_MIME[t] } };

/** The Prisma filter of a smart query (live, non-system nodes). */
export const smartWhere = async (q: SmartQuery, now = new Date()): Promise<Prisma.DriveNodeWhereInput> => {
  const and: Prisma.DriveNodeWhereInput[] = [{ deletedAt: null, system: false }];
  if (q.types?.length) and.push({ OR: q.types.map(typeWhere) });
  else and.push({ kind: 'FILE' });
  if (q.uploadedWithinDays) and.push({ createdAt: { gte: new Date(now.getTime() - q.uploadedWithinDays * 86_400_000) } });
  if (q.uploadedById) and.push({ createdById: q.uploadedById });
  if (q.folderId) {
    const ids = await folderSubtreeIds(q.folderId);
    and.push({ parentId: { in: ids } });
  }
  const groups: Prisma.DriveNodeWhereInput[] = [];
  if (q.words?.length) {
    groups.push({ OR: [...q.words.map((w) => ({ name: { contains: w } })), { tags: { some: { tag: { OR: q.words.map((w) => ({ name: { contains: w } })) } } } }] });
  }
  if (q.tagIds?.length) {
    groups.push(q.tagMode === 'all' ? { AND: q.tagIds.map((tagId) => ({ tags: { some: { tagId } } })) } : { tags: { some: { tagId: { in: q.tagIds } } } });
  }
  if (q.stages?.length) groups.push({ workflowStage: { in: q.stages } });
  if (groups.length) and.push(q.match === 'any' ? { OR: groups } : { AND: groups });
  return { AND: and };
};

/** Two shared examples, created once. */
export const seedSmartFolders = () =>
  runOnce('drive.org.smartSeeded', async () => {
    await seedTags();
    const translate = await prisma.driveTag.findUnique({ where: { name: 'Tərcüməyə' }, select: { id: true } });
    await prisma.driveSmartFolder.createMany({
      data: [
        { name: 'Bu həftə yüklənən pasportlar', shared: true, icon: 'passport', sortOrder: 0, query: { words: ['Pass', 'Pasport', 'Reisepass'], uploadedWithinDays: 7 } },
        {
          name: 'Tərcüməsi gözlənilən sənədlər',
          shared: true,
          icon: 'languages',
          sortOrder: 1,
          query: { ...(translate ? { tagIds: [translate.id] } : {}), stages: ['TRANSLATION'], match: 'any' },
        },
      ],
    });
  });
