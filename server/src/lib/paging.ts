import { z } from 'zod';

/**
 * Page-based paging for staff lists (same shape as the agents / campaign-recipients / arrivals lists):
 * `?page=1&pageSize=50` in, `{ total, page, pageSize, pages }` next to the items out.
 *
 *   const q = parse(z.object({ status: …, ...pageShape(50) }), req.query);
 *   const [items, total] = await Promise.all([prisma.x.findMany({ where, orderBy, ...pageArgs(q) }), prisma.x.count({ where })]);
 *   res.json({ items, ...pageMeta(q, total) });
 *
 * Ordered lists must end with a unique key (id) so a page never repeats or skips a row.
 */
export const pageShape = (defaultSize = 50, maxSize = 200) => ({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(maxSize).default(defaultSize),
});

export type PageQuery = { page: number; pageSize: number };

export const pageArgs = (q: PageQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export const pageMeta = (q: PageQuery, total: number) => ({ total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)) });

/**
 * Slice [skip, skip + take) of a list made of two ordered parts (e.g. open requests first, then closed ones),
 * each fetched with its own query: returns the skip / take to use on each part.
 */
export const splitPage = (skip: number, take: number, firstTotal: number) => {
  const firstSkip = Math.min(skip, firstTotal);
  const firstTake = Math.max(0, Math.min(take, firstTotal - firstSkip));
  return {
    first: { skip: firstSkip, take: firstTake },
    second: { skip: Math.max(0, skip - firstTotal), take: take - firstTake },
  };
};
