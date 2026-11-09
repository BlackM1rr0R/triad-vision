import type { DriveSpace, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, badRequest } from '../http.js';
import { DriveAccessCtx, nodeLiteSelect, requireNode, type NodeLite } from './access.js';
import { collectSubtree } from './items.js';
import { allows } from './levels.js';
import { pickFreeName } from './names.js';
import { copyIntoStore, removeStored, storagePath } from './storage.js';
import { hashStored } from './org/hash.js';

/**
 * Recursive copy of one drive node (a file, or a folder with every sub-folder and file) into a folder —
 * shared by "Kopyala…" (POST /api/drive/copy) and "İş axınına kopyala" (lib/drive/workflowFolders).
 *
 * Files need DOWNLOAD, folders EXPORT on the source. Copies get fresh storage keys (the bytes are copied), no
 * grants (they inherit from the target), no version history and no link to a case document. The folder
 * structure is kept below the target; only the copied root gets "name (2)" when its name is taken there.
 * Folders are created first (cheap rows, parents before children), then the file bytes are copied a few at
 * a time, so large folders do not take one round trip after the other.
 */

export const copySelect = { ...nodeLiteSelect, storageKey: true, mimeType: true, size: true, contentHash: true } satisfies Prisma.DriveNodeSelect;

/** Most nodes one copy may take (collectSubtree answers SUBTREE_TOO_LARGE above it). */
export const COPY_LIMIT = 5000;
const FILE_CONCURRENCY = 4;

export interface CopyTarget {
  id: string;
  space: DriveSpace;
  ownerId: string | null;
}

export interface CopyResult {
  node: NodeLite;
  /** The copied root (null when nothing could be copied, e.g. the file's bytes are gone). */
  newId: string | null;
  name: string;
  nodes: number;
}

/** Runs `fn` over `items`, at most `limit` at a time. */
const pool = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

/**
 * Copies node `id` into `target` (the caller checked EDIT on it). `taken` holds the lower-cased live names in
 * the target (siblingNames) and receives the chosen name. Throws INTO_ITSELF when a folder would be copied into
 * itself or below itself.
 */
export const copyNodeInto = async (ctx: DriveAccessCtx, actorId: string, id: string, target: CopyTarget, taken: Set<string>): Promise<CopyResult> => {
  const { node, level } = await requireNode(ctx, id, 'VIEW');
  if (!allows(level, node.kind === 'FILE' ? 'DOWNLOAD' : 'EXPORT')) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
  await ctx.load([target.id]);
  if (node.kind === 'FOLDER' && ctx.chain(target.id).some((n) => n.id === id)) throw badRequest('INTO_ITSELF');
  const sub = await collectSubtree([id], copySelect, { limit: COPY_LIMIT });
  ctx.add(sub as NodeLite[]);
  const base = { space: target.space, ownerId: target.ownerId, createdById: actorId };
  const newIds = new Map<string, string>();
  const files: { parentId: string; name: string; storageKey: string; mimeType: string; size: number; contentHash: string | null; root: boolean }[] = [];
  let rootName = node.name;
  for (const n of sub) {
    const isRoot = n.id === id;
    const parentNew = isRoot ? target.id : newIds.get(n.parentId!);
    if (!parentNew) continue; // the parent folder was not visible: its contents are skipped
    if (n.kind === 'FOLDER') {
      if (!allows(ctx.level(n.id), 'VIEW')) continue;
      const name = isRoot ? pickFreeName(taken, n.name, false) : n.name;
      if (isRoot) rootName = name;
      newIds.set(n.id, (await prisma.driveNode.create({ data: { ...base, kind: 'FOLDER', name, parentId: parentNew }, select: { id: true } })).id);
    } else if (allows(ctx.level(n.id), 'DOWNLOAD') && n.storageKey) {
      const name = isRoot ? pickFreeName(taken, n.name, true) : n.name;
      if (isRoot) rootName = name;
      files.push({ parentId: parentNew, name, storageKey: n.storageKey, mimeType: n.mimeType ?? 'application/octet-stream', size: n.size ?? 0, contentHash: n.contentHash, root: isRoot });
    }
  }
  await pool(files, FILE_CONCURRENCY, async (f) => {
    let key: string;
    try {
      key = await copyIntoStore(storagePath(f.storageKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // the bytes are gone: nothing to copy
      throw err;
    }
    try {
      const row = await prisma.driveNode.create({
        data: { ...base, kind: 'FILE', name: f.name, parentId: f.parentId, storageKey: key, mimeType: f.mimeType, size: f.size, contentHash: f.contentHash ?? (await hashStored(key)) },
        select: { id: true },
      });
      if (f.root) newIds.set(id, row.id);
    } catch (err) {
      await removeStored([key]);
      throw err;
    }
  });
  return { node, newId: newIds.get(id) ?? null, name: rootName, nodes: sub.length };
};
