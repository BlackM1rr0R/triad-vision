import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Internal knowledge base (staff how-tos and template replies). Search uses the MySQL FULLTEXT index
 * on title+body and falls back to LIKE when the index yields nothing (short words, stop words, a
 * database without the index) so a search never comes back empty for a term that is clearly there.
 */

export const articleSelect = {
  id: true,
  categoryId: true,
  title: true,
  body: true,
  tags: true,
  pinned: true,
  published: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.KbArticleSelect;

export const normaliseTags = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? [...new Set(tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20)
    : [];

/** Text excerpt around the first hit (plain markdown, no rendering). */
export const excerpt = (body: string, q: string, len = 160) => {
  const plain = body.replace(/[#*_`>\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const at = plain.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return plain.slice(0, len);
  const start = Math.max(0, at - Math.floor(len / 3));
  return `${start > 0 ? '…' : ''}${plain.slice(start, start + len)}${start + len < plain.length ? '…' : ''}`;
};

export const searchArticles = async (q: string, opts: { limit?: number; includeUnpublished?: boolean } = {}) => {
  const limit = opts.limit ?? 20;
  const published = opts.includeUnpublished ? {} : { published: true };
  let ids: string[] = [];
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM KbArticle WHERE MATCH(title, body) AGAINST (${q} IN NATURAL LANGUAGE MODE) ${opts.includeUnpublished ? Prisma.empty : Prisma.sql`AND published = 1`} ORDER BY MATCH(title, body) AGAINST (${q} IN NATURAL LANGUAGE MODE) DESC, pinned DESC LIMIT ${limit}`,
    );
    ids = rows.map((r) => r.id);
  } catch (err) {
    // No fulltext index (or an unsupported engine): the LIKE path below answers instead.
    console.error('[kb] fulltext search failed, falling back to LIKE', (err as Error).message);
  }
  let items = ids.length
    ? await prisma.kbArticle.findMany({ where: { id: { in: ids } }, select: articleSelect })
    : [];
  if (ids.length) {
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  let mode: 'fulltext' | 'like' = 'fulltext';
  if (!items.length) {
    mode = 'like';
    items = await prisma.kbArticle.findMany({
      where: { ...published, OR: [{ title: { contains: q } }, { body: { contains: q } }] },
      select: articleSelect,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
  }
  return {
    mode,
    items: items.map(({ body, ...a }) => ({ ...a, tags: normaliseTags(a.tags), excerpt: excerpt(body, q) })),
  };
};
