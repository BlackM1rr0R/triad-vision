import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/components/audience/tools';
import { HELP_ROUTES, PORTAL_HELP_ROUTES, PUBLIC_HELP_ROUTES, helpRouteOf, isPortalHelpRoute, loadPageHelp, matchScore, type PageHelpText } from './registry';
import { HELP_AZ } from './texts/az';
import { HELP_DE } from './texts/de';
import { HELP_EN } from './texts/en';
import { HELP_RU } from './texts/ru';
import { HELP_TR } from './texts/tr';
import { HELP_UK } from './texts/uk';

const APP = readFileSync(fileURLToPath(new URL('../../App.tsx', import.meta.url)), 'utf8');

/** Every route under <Route path="account"> in App.tsx, as full patterns ("/account", "/account/cases/:id"). */
const accountRoutes = (): string[] => {
  const start = APP.indexOf('path="account"');
  const end = APP.indexOf('</Route>', start);
  const block = APP.slice(APP.indexOf(">", start), end);
  const out = ['/account'];
  for (const m of block.matchAll(/<Route\s+path="([^"]+)"/g)) out.push(`/account/${m[1]}`);
  return out;
};

const ok = (t: PageHelpText | undefined) => !!t && [t.what, t.why, t.todo].every((s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 200);

describe('page help registry', () => {
  it('has an entry for every tool of the tools registry', () => {
    const missing = TOOLS.map((x) => x.to).filter((p) => !(PUBLIC_HELP_ROUTES as readonly string[]).includes(p));
    expect(missing).toEqual([]);
  });

  it('has an entry for every /account route of App.tsx', () => {
    const routes = accountRoutes();
    expect(routes.length).toBeGreaterThan(30);
    const missing = routes.filter((p) => !(PORTAL_HELP_ROUTES as readonly string[]).includes(p));
    expect(missing).toEqual([]);
  });

  it('every route has a text in az, de, en, ru; public routes also in tr, uk', () => {
    for (const r of HELP_ROUTES) {
      for (const [l, texts] of Object.entries({ az: HELP_AZ, de: HELP_DE, en: HELP_EN, ru: HELP_RU })) expect(ok(texts[r]), `${r} ${l}`).toBe(true);
      if (!isPortalHelpRoute(r)) for (const [l, texts] of Object.entries({ tr: HELP_TR, uk: HELP_UK })) expect(ok((texts as Record<string, PageHelpText>)[r]), `${r} ${l}`).toBe(true);
    }
  });

  it('no admin or staff pages', () => {
    expect(HELP_ROUTES.some((r) => r.startsWith('/admin') || r.startsWith('/workspace'))).toBe(false);
  });

  it('matches paths to route patterns', () => {
    expect(helpRouteOf('/salary-calculator')).toBe('/salary-calculator');
    expect(helpRouteOf('/de/salary-calculator/')).toBe('/salary-calculator');
    expect(helpRouteOf('/ru/for/cook')).toBe('/for/:profession');
    expect(helpRouteOf('/german-mock-exam/a1')).toBe('/german-mock-exam/a1');
    expect(helpRouteOf('/account')).toBe('/account');
    expect(helpRouteOf('/account/cases/42')).toBe('/account/cases/:id');
    expect(helpRouteOf('/account/cases/42/confirm')).toBe('/account/cases/:id/confirm');
    expect(helpRouteOf('/account/letters/new/x')).toBe('/account/letters/*');
    expect(helpRouteOf('/account/letters-explain')).toBe('/account/letters-explain');
    expect(helpRouteOf('/start/plan?w=worker')).toBe('/start/plan');
    expect(helpRouteOf('/')).toBeNull();
    expect(helpRouteOf('/about')).toBeNull();
    expect(helpRouteOf('/admin/cases')).toBeNull();
    expect(matchScore('/a/:x', '/a/b')).toBeLessThan(matchScore('/a/b', '/a/b'));
  });

  it('loads texts per language with an English fallback', async () => {
    expect((await loadPageHelp('/budget', 'de'))?.what).toBe(HELP_DE['/budget'].what);
    expect((await loadPageHelp('/account/vault', 'tr'))?.what).toBe(HELP_EN['/account/vault'].what);
    expect((await loadPageHelp('/budget', 'xx'))?.what).toBe(HELP_EN['/budget'].what);
  });
});
