import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { parse } from '../../lib/http.js';

/**
 * Personal admin dashboard layout (mounted on /api/admin, STAFF+):
 *   GET /me/dashboard   { layout: { v: 1, items: [{ id, size, hidden? }] } | null }   null = the default layout
 *   PUT /me/dashboard   { layout: {...} | null }                                       null resets to the default
 *
 * The widget ids belong to the client registry (components/dashboard/registry.tsx); the server only checks the
 * shape and limits. Unknown ids are dropped by the client when it renders, so an old layout never breaks the page.
 */
export const adminDashboardLayoutRouter = Router();

export const WIDGET_ID_RE = /^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/;
export const WIDGETS_MAX = 40;

const itemSchema = z.object({
  id: z.string().regex(WIDGET_ID_RE),
  size: z.enum(['S', 'M', 'L']),
  hidden: z.boolean().optional(),
});
const layoutSchema = z.object({ v: z.literal(1), items: z.array(itemSchema).max(WIDGETS_MAX) });
export type DashboardLayout = z.infer<typeof layoutSchema>;

/** Stored value → layout (null when missing or not of the current shape). Duplicate ids keep the first one. */
export const toLayout = (raw: unknown): DashboardLayout | null => {
  const r = layoutSchema.safeParse(raw);
  if (!r.success) return null;
  const seen = new Set<string>();
  const items = r.data.items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  return { v: 1, items: items.map((i) => ({ id: i.id, size: i.size, ...(i.hidden ? { hidden: true } : {}) })) };
};

adminDashboardLayoutRouter.get('/me/dashboard', async (req, res) => {
  const prefs = await prisma.staffPreferences.findUnique({ where: { userId: req.user!.id }, select: { dashboardLayout: true } });
  res.json({ layout: toLayout(prefs?.dashboardLayout) });
});

adminDashboardLayoutRouter.put('/me/dashboard', async (req, res) => {
  const body = parse(z.object({ layout: layoutSchema.nullable() }), req.body ?? {});
  const layout = body.layout ? toLayout(body.layout) : null;
  const value = layout ? (layout as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
  const userId = req.user!.id;
  await prisma.staffPreferences.upsert({ where: { userId }, create: { userId, dashboardLayout: value }, update: { dashboardLayout: value } });
  res.json({ layout });
});
