import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { foldQuery, originalOf, snippetOf, type Snippet } from './normalize.js';

/**
 * Full-text part of the drive search: files whose indexed text (DriveNode.textContent: original + folded
 * copy, see ./normalize.ts) contains the folded query — MySQL LIKE, fine at this scale — and a snippet
 * (±60 characters, hit marked) for the rows shown.
 */

/** Shortest folded query searched in contents. */
export const MIN_CONTENT_QUERY = 2;
/** Content hits fetched at most / snippets built at most. */
export const CONTENT_LIMIT = 300;
export const SNIPPET_LIMIT = 60;

export interface ContentMatch {
  snippet: Snippet | null;
}

export const contentWhere = (q: string): Prisma.DriveNodeWhereInput | null => {
  const folded = foldQuery(q);
  if (folded.length < MIN_CONTENT_QUERY) return null;
  return { kind: 'FILE', textContent: { contains: folded } };
};

/** Snippets for the given node ids (the first SNIPPET_LIMIT of them). */
export const contentSnippets = async (ids: string[], q: string): Promise<Map<string, ContentMatch>> => {
  const folded = foldQuery(q);
  const out = new Map<string, ContentMatch>();
  const take = ids.slice(0, SNIPPET_LIMIT);
  if (!take.length) return out;
  const rows = await prisma.driveNode.findMany({ where: { id: { in: take } }, select: { id: true, textContent: true } });
  for (const r of rows) out.set(r.id, { snippet: snippetOf(originalOf(r.textContent), folded) });
  for (const id of ids.slice(SNIPPET_LIMIT)) out.set(id, { snippet: null });
  return out;
};
