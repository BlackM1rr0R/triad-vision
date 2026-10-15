import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Admin-editable overrides of the notification texts (NotificationTemplate rows). notifications.ts
 * asks `getOverride(type, locale)` before rendering from its code catalog. Rows are cached for
 * 60 s; saving through the admin API calls `invalidateTemplateCache()`.
 *
 * Templates use {{placeholders}}; unknown placeholders render as an empty string, so a typo can never
 * leak "undefined" or raw braces to a client.
 */

export const TEMPLATE_CACHE_MS = 60_000;

export interface TemplateOverride {
  title: string;
  body: string;
}

let cache: { at: number; rows: Map<string, TemplateOverride> } | null = null;
let loading: Promise<Map<string, TemplateOverride>> | null = null;

const key = (type: string, locale: string) => `${type}:${locale}`;

const load = async (): Promise<Map<string, TemplateOverride>> => {
  const rows = new Map<string, TemplateOverride>();
  try {
    const list = await prisma.notificationTemplate.findMany({ select: { type: true, locale: true, title: true, body: true } });
    for (const r of list) rows.set(key(r.type, r.locale), { title: r.title, body: r.body });
  } catch {
    // No table / mocked prisma: behave as if there were no overrides.
  }
  return rows;
};

export const invalidateTemplateCache = () => {
  cache = null;
  loading = null;
};

const overrides = async () => {
  if (cache && Date.now() - cache.at < TEMPLATE_CACHE_MS) return cache.rows;
  if (!loading) {
    loading = load().then((rows) => {
      cache = { at: Date.now(), rows };
      loading = null;
      return rows;
    });
  }
  return loading;
};

export const getOverride = async (type: string, locale: Locale): Promise<TemplateOverride | null> =>
  (await overrides()).get(key(type, locale)) ?? null;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Tiny safe interpolation: `{{name}}` → params.name (strings/numbers only), unknown → ''. */
export const renderTemplate = (template: string, params: object) =>
  template.replace(PLACEHOLDER, (_m, name: string) => {
    const v = (params as Record<string, unknown>)[name];
    return v === undefined || v === null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
  });

/** Placeholders found in a template (for validation / UI hints). */
export const placeholdersIn = (template: string) => Array.from(new Set(Array.from(template.matchAll(PLACEHOLDER), (m) => m[1])));
