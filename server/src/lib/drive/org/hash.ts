import crypto from 'node:crypto';
import fs from 'node:fs';
import { prisma } from '../../../db.js';
import type { DriveAccessCtx } from '../access.js';
import { buildItems, itemSelect } from '../items.js';
import { storagePath } from '../storage.js';

/**
 * Duplicate detection: every drive file carries the sha256 of its current content (DriveNode.contentHash).
 * Uploads, new versions and copies set it right away; older files get it from a slow background backfill.
 * A file whose bytes are gone from disk gets MISSING_HASH so the backfill does not retry it forever.
 */
export const MISSING_HASH = '-'.repeat(64);

export const hashBuffer = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

export const hashFile = (absPath: string) =>
  new Promise<string>((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(absPath);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });

/** sha256 of a stored file (null when it is missing on disk). */
export const hashStored = (key: string | null | undefined) => (key ? hashFile(storagePath(key)).catch(() => null) : Promise.resolve(null));

export interface DuplicateRef {
  id: string;
  name: string;
  /** Folder path of the existing file ("Gemeinsame Dokumente/Anträge/…/Erstdokumente"). */
  path: string;
  folderId: string | null;
  folderName: string | null;
}

/**
 * Live files with the same content the caller can see (the file itself left out). Never blocks anything:
 * the upload answer lists them and the person decides.
 */
export const findDuplicates = async (ctx: DriveAccessCtx, hash: string | null | undefined, exceptIds: string[] = [], limit = 10): Promise<DuplicateRef[]> => {
  if (!hash || hash === MISSING_HASH) return [];
  const rows = await prisma.driveNode.findMany({
    where: { contentHash: hash, kind: 'FILE', deletedAt: null, ...(exceptIds.length ? { id: { notIn: exceptIds } } : {}) },
    select: itemSelect,
    orderBy: { createdAt: 'asc' },
    take: limit * 3,
  });
  const items = await buildItems(ctx, rows);
  return items.slice(0, limit).map((i) => {
    const chain = ctx.chain(i.id).slice(0, -1);
    const parent = chain[chain.length - 1];
    return { id: i.id, name: i.name, path: chain.map((n) => n.name).join('/'), folderId: parent?.id ?? null, folderName: parent?.name ?? null };
  });
};

/**
 * Background backfill: hashes up to `maxFiles` files that have no hash yet, oldest first, one at a time
 * with a pause between files (low priority). The "modified" time of a file is left as it was.
 */
export const backfillContentHashes = async (opts: { maxFiles?: number; batch?: number; pauseMs?: number } = {}) => {
  const max = opts.maxFiles ?? 2000;
  const size = opts.batch ?? 100;
  let done = 0;
  let missing = 0;
  while (done + missing < max) {
    const rows = await prisma.driveNode.findMany({
      where: { kind: 'FILE', contentHash: null, storageKey: { not: null } },
      select: { id: true, storageKey: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
      take: Math.min(size, max - done - missing),
    });
    if (!rows.length) break;
    for (const r of rows) {
      const hash = await hashStored(r.storageKey);
      await prisma.driveNode.updateMany({ where: { id: r.id, storageKey: r.storageKey }, data: { contentHash: hash ?? MISSING_HASH, updatedAt: r.updatedAt } });
      if (hash) done++;
      else missing++;
      if (opts.pauseMs) await new Promise((res) => setTimeout(res, opts.pauseMs));
      else await new Promise((res) => setImmediate(res));
    }
  }
  return { hashed: done, missing };
};
