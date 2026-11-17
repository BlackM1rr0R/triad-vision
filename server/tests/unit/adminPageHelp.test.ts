import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_HELP_REDIRECT_ROUTES, ADMIN_PAGE_HELP, HELP_LOCALES, kbSystemKey } from '../../src/lib/adminHelp/index.js';
import { articleHash, buildHelpArticle, pagePath, syncActionFor } from '../../src/lib/ops/kbSystemArticles.js';

/**
 * "What does this page do?" (server/src/lib/adminHelp + client/src/lib/adminHelp/registry.ts): every admin route
 * of client/src/App.tsx has an entry in az / ru / en / de (purpose, exactly three steps, 1–3 tips), the client
 * matcher finds the right entry for real paths, and the Knowledge Base seed only overwrites untouched articles.
 */

const clientSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src');

/** Paths of the direct children of <Route path="admin"> in App.tsx (the block ends at the matching indentation). */
const adminRoutes = (): string[] => {
  const lines = fs.readFileSync(path.join(clientSrc, 'App.tsx'), 'utf8').split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*path="admin"\s*$/.test(l));
  expect(at, 'admin route block in App.tsx').toBeGreaterThan(0);
  const indent = /^(\s*)/.exec(lines[at - 1])![1];
  const out: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i] === `${indent}</Route>`) return out;
    if (/^\s*<Route index\b/.test(lines[i])) out.push('');
    for (const m of lines[i].matchAll(/\bpath="([^"]*)"/g)) out.push(m[1]);
  }
  throw new Error('admin route block not closed');
};

interface Registry {
  matchAdminRoute: (pathname: string, routes: readonly string[]) => string | undefined;
  routeScore: (route: string, rest: string[]) => number;
  helpLocale: (lng: string | undefined) => string;
  kbSystemKeyFor: (route: string) => string;
  kbHrefFor: (route: string) => string;
}
let reg: Registry;
beforeAll(async () => {
  reg = (await import(/* @vite-ignore */ pathToFileURL(path.join(clientSrc, 'lib/adminHelp/registry.ts')).href)) as Registry;
}, 60_000);

describe('admin page help registry', () => {
  it('covers every admin route of App.tsx exactly once (redirect-only routes aside)', () => {
    const routes = adminRoutes();
    expect(routes.length).toBeGreaterThan(100);
    const pages = [...new Set(routes)].filter((r) => !ADMIN_HELP_REDIRECT_ROUTES.includes(r));
    const keys = ADMIN_PAGE_HELP.map((e) => e.route);
    expect(new Set(keys).size, 'duplicate help entries').toBe(keys.length);
    const missing = pages.filter((r) => !keys.includes(r));
    const extra = keys.filter((k) => !pages.includes(k));
    expect(missing, 'admin routes without a help entry (server/src/lib/adminHelp/pages)').toEqual([]);
    expect(extra, 'help entries without a route in App.tsx').toEqual([]);
    for (const r of ADMIN_HELP_REDIRECT_ROUTES) expect(routes, `redirect route ${r}`).toContain(r);
  });

  it('has a title, a purpose, exactly three steps and 1–3 tips in az, ru, en and de', () => {
    for (const e of ADMIN_PAGE_HELP) {
      for (const l of HELP_LOCALES) {
        const t = e.text[l];
        const where = `${e.route || '(index)'} [${l}]`;
        expect(t, where).toBeTruthy();
        expect(t.title.trim().length, `${where} title`).toBeGreaterThan(1);
        expect(t.purpose.trim().length, `${where} purpose`).toBeGreaterThan(20);
        expect(t.steps.length, `${where} steps`).toBe(3);
        for (const s of t.steps) expect(s.trim().length, `${where} step`).toBeGreaterThan(5);
        expect(t.tips.length, `${where} tips`).toBeGreaterThanOrEqual(1);
        expect(t.tips.length, `${where} tips`).toBeLessThanOrEqual(3);
        // plain text: no i18next placeholders or HTML (rendered as text in the panel and as markdown in the KB)
        expect(JSON.stringify(t), `${where} placeholders`).not.toMatch(/\{\{|<\/?[a-z]+>/);
      }
    }
  });

  it('matches real admin paths to the most specific route', () => {
    const routes = ADMIN_PAGE_HELP.map((e) => e.route);
    const m = (p: string) => reg.matchAdminRoute(p, routes);
    expect(m('/admin')).toBe('');
    expect(m('/admin/cases')).toBe('cases');
    expect(m('/admin/cases/abc123')).toBe('cases/:id');
    expect(m('/admin/finance/expenses')).toBe('finance/*');
    expect(m('/admin/finance')).toBe('finance/*');
    expect(m('/admin/content/faqs')).toBe('content/:resource');
    expect(m('/admin/system/modules')).toBe('system/modules');
    expect(m('/admin/oversight/staff/u1')).toBe('oversight/staff/:id');
    expect(m('/admin/signatures/sign/s1')).toBe('signatures/sign/:signerId');
    expect(m('/admin/ai/settings?tab=x')).toBe('ai/settings');
    expect(m('/admin/cases/abc/extra/deep')).toBe('cases/:id'); // unknown deeper path → its parent page
    expect(m('/account/cases')).toBeUndefined();
    expect(reg.routeScore('cases', ['cases'])).toBeGreaterThan(reg.routeScore('cases/*', ['cases']));
    expect(reg.helpLocale('ru')).toBe('ru');
    expect(reg.helpLocale('tr')).toBe('az');
    expect(reg.helpLocale(undefined)).toBe('az');
  });

  it('client and server agree on the Knowledge Base key; the KB link is a deep link', () => {
    for (const r of ['', 'cases/:id', 'finance/*']) expect(reg.kbSystemKeyFor(r)).toBe(kbSystemKey(r));
    expect(reg.kbHrefFor('cases/:id')).toBe(`/admin/kb?system=${encodeURIComponent('admin-page:cases/:id')}`);
  });
});

describe('Knowledge Base page guides (lib/ops/kbSystemArticles)', () => {
  it('builds one article per page with all four languages and a link to the page', () => {
    const entry = ADMIN_PAGE_HELP.find((e) => e.route === 'cases/:id')!;
    const a = buildHelpArticle(entry);
    expect(a.systemKey).toBe('admin-page:cases/:id');
    expect(a.title).toContain(entry.text.az.title);
    for (const l of HELP_LOCALES) expect(a.body).toContain(entry.text[l].purpose);
    expect(a.body).toContain('/admin/cases');
    expect(a.hash).toBe(articleHash(a.title, a.body));
    expect(buildHelpArticle(entry, (s) => `X ${s}`).title.startsWith('X ')).toBe(true); // white-label brand hook
    expect(pagePath('')).toBe('/admin');
    expect(pagePath('finance/*')).toBe('/admin/finance');
    expect(pagePath('oversight/staff/:id')).toBe('/admin/oversight/staff');
    expect(new Set(ADMIN_PAGE_HELP.map((e) => kbSystemKey(e.route))).size).toBe(ADMIN_PAGE_HELP.length);
    for (const e of ADMIN_PAGE_HELP) expect(kbSystemKey(e.route).length).toBeLessThanOrEqual(120);
  });

  it('creates missing, updates untouched, never overwrites staff edits', () => {
    const a = buildHelpArticle(ADMIN_PAGE_HELP[0]);
    expect(syncActionFor(null, a.hash)).toBe('create');
    const seeded = { title: a.title, body: a.body, systemHash: a.hash };
    expect(syncActionFor(seeded, a.hash)).toBe('keep');
    expect(syncActionFor(seeded, 'new-hash')).toBe('update');
    expect(syncActionFor({ ...seeded, body: `${a.body}\nstaff note` }, 'new-hash')).toBe('edited');
    expect(syncActionFor({ ...seeded, systemHash: null }, a.hash)).toBe('edited');
  });
});
