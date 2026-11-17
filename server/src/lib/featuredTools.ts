import { z } from 'zod';
import { prisma } from '../db.js';
import { cached, clearCache } from './cache.js';
import { toolSlugs } from './toolLeads/tools.js';

/**
 * "Most useful" tools: the short row at the top of /tools and the header tools menu. An ordered list of tool
 * paths kept in Setting `tools.featured` (admin: Tool analytics → Featured tools, drag to reorder); until the
 * admin saves one, DEFAULT_FEATURED_TOOLS. Only known tool pages (toolLeads/tools.ts toolSlugs: the hub groups
 * plus the extra tool pages) are accepted; a tool removed later is skipped when read.
 */

export const FEATURED_TOOLS_KEY = 'tools.featured';
export const FEATURED_MAX = 8;

export const DEFAULT_FEATURED_TOOLS = [
  '/salary-calculator',
  '/when-in-germany',
  '/blue-card-check',
  '/visa-document-checklist',
  '/health-insurance-comparison',
  '/german-mock-exam/a1',
];

/** Paths that may be featured. */
export const featurableToolPaths = () => toolSlugs().map((s) => `/${s}`);

/** Known, unique paths in the given order, at most FEATURED_MAX. */
export const cleanFeatured = (paths: readonly unknown[], known: readonly string[] = featurableToolPaths()): string[] => {
  const ok = new Set(known);
  const out: string[] = [];
  for (const p of paths) if (typeof p === 'string' && ok.has(p) && !out.includes(p)) out.push(p);
  return out.slice(0, FEATURED_MAX);
};

export const featuredInput = z.object({ paths: z.array(z.string().max(80)).max(FEATURED_MAX) });

/** The stored list (cleaned), or null when the admin never saved one. */
const stored = async (): Promise<string[] | null> => {
  const row = await prisma.setting.findUnique({ where: { key: FEATURED_TOOLS_KEY } }).catch(() => null);
  const v = row?.value as { paths?: unknown } | null | undefined;
  return v && Array.isArray(v.paths) ? cleanFeatured(v.paths) : null;
};

/** The featured tools (public, cached like other CMS reads). */
export const getFeaturedTools = () =>
  cached('tools:featured', async () => {
    const s = await stored();
    return { paths: s && s.length ? s : cleanFeatured(DEFAULT_FEATURED_TOOLS), custom: !!(s && s.length) };
  });

/** Saves the order (empty list → back to the default). Returns what the public now sees. */
export const setFeaturedTools = async (paths: string[]) => {
  const clean = cleanFeatured(paths);
  if (clean.length) await prisma.setting.upsert({ where: { key: FEATURED_TOOLS_KEY }, create: { key: FEATURED_TOOLS_KEY, value: { paths: clean } }, update: { value: { paths: clean } } });
  else await prisma.setting.deleteMany({ where: { key: FEATURED_TOOLS_KEY } });
  clearCache();
  return getFeaturedTools();
};
