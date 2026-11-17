import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ADMIN_PAGE_HELP, HELP_LOCALES, kbSystemKey, type HelpLocale, type PageHelpEntry } from '../adminHelp/index.js';

/**
 * System Knowledge Base articles: one "page guide" per admin page, generated from the "What does this page do?"
 * texts (lib/adminHelp) so staff find them in the Knowledge Base search. Idempotent: prisma/seed.ts runs
 * `syncAdminHelpArticles` on every deploy.
 *   - missing article          → created (systemKey = "admin-page:<route>", systemHash = hash of what was written);
 *   - unchanged by staff       → updated when the generated text changed;
 *   - edited by staff          → kept as is (its current title + body no longer hash to systemHash);
 *   - deleted by staff         → created again on the next deploy (unpublish it to hide it instead).
 */

export const KB_HELP_CATEGORY = 'Admin səhifə bələdçiləri';
export const KB_HELP_TAG = 'admin-help';

const LANG_HEADING: Record<HelpLocale, string> = { az: 'Azərbaycanca', ru: 'Русский', en: 'English', de: 'Deutsch' };
const HOW: Record<HelpLocale, string> = { az: 'Necə istifadə etməli', ru: 'Как пользоваться', en: 'How to use it', de: 'So nutzen Sie die Seite' };
const TIPS: Record<HelpLocale, string> = { az: 'Məsləhətlər', ru: 'Советы', en: 'Tips', de: 'Tipps' };
const OPEN: Record<HelpLocale, string> = { az: 'Səhifəni aç', ru: 'Открыть страницу', en: 'Open the page', de: 'Seite öffnen' };

/** Link to the page (detail routes have no fixed URL: the list page above them is linked instead). */
export const pagePath = (route: string) => {
  const clean = route.replace(/\/\*$/, '');
  const fixed = clean.split('/').filter((s) => !s.startsWith(':')).join('/');
  return fixed ? `/admin/${fixed}` : '/admin';
};

export const articleHash = (title: string, body: string) => crypto.createHash('sha256').update(`${title}\n${body}`).digest('hex');

/** Title + markdown body of a page's article: az first (primary), then ru, en, de. */
export const buildHelpArticle = (entry: PageHelpEntry, brand: (s: string) => string = (s) => s) => {
  const az = entry.text.az;
  const title = brand(`${az.title} — səhifə bələdçisi`);
  const parts: string[] = [];
  for (const l of HELP_LOCALES) {
    const t = entry.text[l];
    parts.push(
      `## ${LANG_HEADING[l]}: ${t.title}`,
      '',
      t.purpose,
      '',
      `**${HOW[l]}**`,
      '',
      ...t.steps.map((s, i) => `${i + 1}. ${s}`),
      '',
      ...(t.tips.length ? [`**${TIPS[l]}**`, '', ...t.tips.map((s) => `- ${s}`), ''] : []),
    );
  }
  parts.push(`${OPEN.az}: ${pagePath(entry.route)}`);
  const body = parts.join('\n').trim();
  return { systemKey: kbSystemKey(entry.route), title, body, tags: [KB_HELP_TAG, 'səhifə bələdçisi', pagePath(entry.route)], hash: articleHash(title, body) };
};

export type SyncAction = 'create' | 'update' | 'keep' | 'edited';

/** What to do with one generated article given the stored row (pure; unit-tested). */
export const syncActionFor = (row: { title: string; body: string; systemHash: string | null } | null, nextHash: string): SyncAction => {
  if (!row) return 'create';
  if (row.systemHash !== articleHash(row.title, row.body)) return 'edited';
  return row.systemHash === nextHash ? 'keep' : 'update';
};

/** `brand`: white-label instances replace "Triad Vision" in the texts (applied before hashing, so the check stays exact). */
export const syncAdminHelpArticles = async (prisma: PrismaClient, opts: { entries?: PageHelpEntry[]; brand?: (s: string) => string } = {}) => {
  const entries = opts.entries ?? ADMIN_PAGE_HELP;
  const category =
    (await prisma.kbCategory.findFirst({ where: { name: KB_HELP_CATEGORY } })) ??
    (await prisma.kbCategory.create({ data: { name: KB_HELP_CATEGORY, sortOrder: 900 } }));
  const rows = await prisma.kbArticle.findMany({ where: { systemKey: { startsWith: 'admin-page:' } }, select: { id: true, systemKey: true, title: true, body: true, systemHash: true } });
  const byKey = new Map(rows.map((r) => [r.systemKey!, r]));
  const counts: Record<SyncAction, number> = { create: 0, update: 0, keep: 0, edited: 0 };
  for (const entry of entries) {
    const a = buildHelpArticle(entry, opts.brand);
    const row = byKey.get(a.systemKey) ?? null;
    const action = syncActionFor(row, a.hash);
    counts[action] += 1;
    if (action === 'create') {
      await prisma.kbArticle.create({ data: { systemKey: a.systemKey, systemHash: a.hash, title: a.title, body: a.body, tags: a.tags, categoryId: category.id, published: true } });
    } else if (action === 'update' && row) {
      await prisma.kbArticle.update({ where: { id: row.id }, data: { systemHash: a.hash, title: a.title, body: a.body, tags: a.tags } });
    }
  }
  return counts;
};
