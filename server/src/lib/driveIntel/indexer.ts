import fsp from 'node:fs/promises';
import { prisma } from '../../db.js';
import { storagePath } from '../drive/storage.js';
import { MAX_EXTRACT_BYTES, extractText, intelKind } from './extract.js';
import { storedText } from './normalize.js';
import { releaseOcr } from './ocr.js';

/**
 * Background full-text indexer of the drive. A file needs (re)indexing when `textIndexedAt` is null or
 * older than `updatedAt` (uploads, new versions, restores and renames all bump updatedAt — no hooks in the
 * drive routes are needed). The result is written with raw SQL so `updatedAt` itself does not move, and
 * only when `updatedAt` is still the value read before the extraction (a version saved meanwhile is
 * picked up by the next run). Failures and unsupported types are marked indexed with no text, so nothing
 * loops.
 */

export const INDEX_BATCH = 8;

interface Candidate {
  id: string;
  name: string;
  mimeType: string | null;
  storageKey: string | null;
  size: number | null;
  updatedAt: Date;
}

const write = async (c: Candidate, text: string | null) => {
  // textIndexedAt must not be older than updatedAt (clocks of app and DB may differ by a little)
  const at = new Date(Math.max(Date.now(), c.updatedAt.getTime()));
  return prisma.$executeRaw`UPDATE DriveNode SET textContent = ${text}, textIndexedAt = ${at} WHERE id = ${c.id} AND updatedAt = ${c.updatedAt}`;
};

/** Extracts and stores the text of one file node. Returns the stored text length (0 = nothing). */
export const indexCandidate = async (c: Candidate) => {
  const kind = intelKind(c.name, c.mimeType);
  if (!kind || !c.storageKey || (c.size ?? 0) > MAX_EXTRACT_BYTES) {
    await write(c, null);
    return 0;
  }
  let text = '';
  try {
    const buf = await fsp.readFile(storagePath(c.storageKey));
    const res = await extractText(buf, kind);
    text = storedText(res.chunks.join('\n\n'));
  } catch (err) {
    console.warn(`[drive-index] ${c.id} (${c.name}) could not be read:`, (err as Error)?.message ?? err);
    text = '';
  }
  await write(c, text || null);
  return text.length;
};

const candidateSelect = { id: true, name: true, mimeType: true, storageKey: true, size: true, updatedAt: true } as const;

/** Indexes one node right away (tests, or a caller that wants the text now). */
export const indexNode = async (nodeId: string) => {
  const c = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: candidateSelect });
  if (!c) return 0;
  return indexCandidate(c);
};

/** Marks a node dirty so the next run indexes it again. */
export const queueIndex = async (nodeId: string) => {
  await prisma.$executeRaw`UPDATE DriveNode SET textIndexedAt = NULL WHERE id = ${nodeId}`;
};

/** One indexer run: up to `limit` files that need it, newest changes first. Returns how many were processed. */
export const runDriveIndex = async (limit = INDEX_BATCH) => {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM DriveNode
    WHERE kind = 'FILE' AND deletedAt IS NULL AND storageKey IS NOT NULL
      AND (textIndexedAt IS NULL OR textIndexedAt < updatedAt)
    ORDER BY updatedAt DESC
    LIMIT ${limit}`;
  if (!rows.length) return 0;
  const list = await prisma.driveNode.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: candidateSelect });
  let done = 0;
  try {
    for (const c of list) {
      await indexCandidate(c);
      done++;
      // stay a low-priority guest on the event loop
      await new Promise((r) => setImmediate(r));
    }
  } finally {
    await releaseOcr();
  }
  return done;
};
