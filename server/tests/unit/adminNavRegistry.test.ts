import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { DESKS as SERVER_DESKS, MODULE_KEYS as SERVER_MODULES, normalizeModules, defaultDesk } from '../../src/lib/navModules.js';

/**
 * Admin navigation registry (client/src/components/command/navRegistry.ts): every admin page sits in exactly
 * one hub, desks point at existing pages, module keys match the server, every route exists in App.tsx and
 * every new label exists in all four languages. The client has no test runner; the modules are loaded by URL.
 */

type Role = 'CLIENT' | 'COMPANY' | 'AGENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
interface Item {
  id: string;
  to: string;
  labelKey: string;
  area: 'admin' | 'workspace';
  adminOnly?: boolean;
  superOnly?: boolean;
  module?: string;
}
interface Registry {
  STAFF_NAV: Item[];
  HUB_NAV: Item[];
  HUBS: { key: string; tabs: string[] }[];
  DESKS: readonly string[];
  DESK_ITEMS: Record<string, string[]>;
  MODULE_KEYS: readonly string[];
  hubOf: (id: string) => string | undefined;
  hubTabs: (key: string, role: Role, modules: Record<string, boolean> | undefined) => Item[];
  isVisible: (item: Item, role: Role, modules: Record<string, boolean> | undefined) => boolean;
  activeNavItem: (pathname: string, items?: Item[]) => Item | undefined;
  defaultDeskFor: (role: Role) => string;
}
type Copy = Record<'az' | 'de' | 'en' | 'ru', { anav: Record<string, unknown>; admin: { nav: Record<string, string> } }>;

const clientSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src');
let r: Registry;
let copy: Copy;
beforeAll(async () => {
  r = (await import(/* @vite-ignore */ pathToFileURL(path.join(clientSrc, 'components/command/navRegistry.ts')).href)) as Registry;
  copy = ((await import(/* @vite-ignore */ pathToFileURL(path.join(clientSrc, 'i18n/adminNav.ts')).href)) as { adminNavCopy: Copy }).adminNavCopy;
});

describe('admin navigation registry', () => {
  it('puts every admin page in exactly one hub (the workspace link aside)', () => {
    const admin = r.STAFF_NAV.filter((i) => i.area === 'admin' && i.id !== 'workspace').map((i) => i.id);
    const inHubs = r.HUBS.flatMap((h) => h.tabs);
    expect(new Set(inHubs).size).toBe(inHubs.length);
    expect([...inHubs].sort()).toEqual([...admin].sort());
    expect(r.HUBS.length).toBe(12);
    expect(r.hubOf('invoices')).toBe('finance');
    expect(r.hubOf('hub.site')).toBe('site');
  });

  it('desks and modules match the server', () => {
    expect([...r.DESKS]).toEqual([...SERVER_DESKS]);
    expect([...r.MODULE_KEYS].sort()).toEqual([...SERVER_MODULES].sort());
    for (const role of ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const) expect(r.defaultDeskFor(role)).toBe(defaultDesk(role));
    const ids = new Set([...r.STAFF_NAV, ...r.HUB_NAV].map((i) => i.id));
    for (const desk of r.DESKS) for (const id of r.DESK_ITEMS[desk]) expect(ids.has(id), `${desk}: ${id}`).toBe(true);
    for (const i of r.STAFF_NAV) if (i.module) expect(r.MODULE_KEYS, i.id).toContain(i.module);
    expect(normalizeModules({ campaigns: false, bogus: false, calls: 'no' })).toMatchObject({ campaigns: false, calls: true });
  });

  it('hides switched-off modules and pages above the role; a hub stays while one tab is visible', () => {
    const campaigns = r.STAFF_NAV.find((i) => i.id === 'campaigns')!;
    expect(r.isVisible(campaigns, 'ADMIN', {})).toBe(true);
    expect(r.isVisible(campaigns, 'ADMIN', { campaigns: false })).toBe(false);
    expect(r.isVisible(campaigns, 'STAFF', {})).toBe(false);
    const ai = r.HUB_NAV.find((i) => i.id === 'hub.ai')!;
    expect(r.isVisible(ai, 'SUPER_ADMIN', {})).toBe(true);
    expect(r.isVisible(ai, 'SUPER_ADMIN', { aiAssistant: false })).toBe(false);
    expect(r.isVisible(ai, 'STAFF', {})).toBe(false);
    expect(r.hubTabs('finance', 'STAFF', {}).map((i) => i.id)).toEqual(['settlements']);
    expect(r.activeNavItem('/admin/cases/abc')?.id).toBe('cases');
    expect(r.activeNavItem('/admin/system/modules')?.id).toBe('modules');
  });

  it('every admin page has a route in App.tsx', () => {
    const app = fs.readFileSync(path.join(clientSrc, 'App.tsx'), 'utf8');
    for (const i of r.STAFF_NAV.filter((x) => x.area === 'admin' && x.to.startsWith('/admin/'))) {
      const rest = i.to.slice('/admin/'.length);
      const route = rest.startsWith('content/') ? 'content/:resource' : rest;
      const found = app.includes(`path="${route}"`) || app.includes(`path="${route}/*"`);
      expect(found, `${i.id} → ${i.to}`).toBe(true);
    }
  });

  it('labels hubs, desks, modules and the new pages in all four languages', () => {
    for (const l of ['az', 'de', 'en', 'ru'] as const) {
      const a = copy[l].anav as { hubs: Record<string, string>; desks: Record<string, string>; modules: Record<string, { title: string; desc: string }> };
      for (const h of r.HUBS) expect(a.hubs[h.key], `${l} hub ${h.key}`).toBeTruthy();
      for (const d of r.DESKS) expect(a.desks[d], `${l} desk ${d}`).toBeTruthy();
      for (const m of r.MODULE_KEYS) expect(a.modules[m]?.title && a.modules[m]?.desc, `${l} module ${m}`).toBeTruthy();
      for (const id of ['modules', 'usage', 'desks']) expect(copy[l].admin.nav[id], `${l} nav ${id}`).toBeTruthy();
    }
  });
});
