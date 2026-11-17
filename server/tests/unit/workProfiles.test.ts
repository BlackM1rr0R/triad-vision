import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as server from '../../src/lib/workProfiles.js';

/**
 * Work profiles of the simple admin sidebar: client (components/command/workProfiles.ts, page lists) and server
 * (lib/workProfiles.ts, stored values) agree on keys, defaults and the view rule; profiles only name existing
 * pages; resolution never shows a page the role cannot open or a switched-off module.
 */

type Role = 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
interface Item {
  id: string;
  area: string;
  adminOnly?: boolean;
  superOnly?: boolean;
  module?: string;
}
interface Client {
  WORK_PROFILES: readonly string[];
  NAV_VIEWS: readonly string[];
  PROFILE_PAGES: Record<string, string[]>;
  defaultWorkProfile: (role: Role, desk?: string | null) => string;
  resolveWorkProfile: (stored: unknown, role: Role, desk?: string | null) => string;
  resolveNavView: (stored: unknown, storedProfile: unknown) => string;
  profileItems: (p: string, role: Role, modules: Record<string, boolean> | undefined) => Item[];
  simpleSidebarGroups: (p: string, pins: string[], role: Role, modules: Record<string, boolean> | undefined) => { key: string; hub?: string; items: Item[] }[];
}
interface Registry {
  STAFF_NAV: Item[];
  isVisible: (item: Item, role: Role, modules: Record<string, boolean> | undefined) => boolean;
}

const clientSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src');
let c: Client;
let r: Registry;
beforeAll(async () => {
  c = (await import(/* @vite-ignore */ pathToFileURL(path.join(clientSrc, 'components/command/workProfiles.ts')).href)) as Client;
  r = (await import(/* @vite-ignore */ pathToFileURL(path.join(clientSrc, 'components/command/navRegistry.ts')).href)) as Registry;
}, 60_000);

const ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

describe('work profiles', () => {
  it('client and server share keys, defaults and the view rule', () => {
    expect([...c.WORK_PROFILES]).toEqual([...server.WORK_PROFILES]);
    expect([...c.NAV_VIEWS]).toEqual([...server.NAV_VIEWS]);
    for (const role of ROLES)
      for (const desk of [null, undefined, 'MANAGER', 'FINANCE', 'MARKETING', 'ALL', 'bogus']) {
        expect(c.defaultWorkProfile(role, desk), `${role}/${desk}`).toBe(server.defaultWorkProfile(role, desk));
        for (const stored of [null, 'SALES', 'nope']) expect(c.resolveWorkProfile(stored, role, desk)).toBe(server.resolveWorkProfile(stored, role, desk));
      }
    for (const v of [null, 'simple', 'full', 'x']) for (const p of [null, 'CASES', 'x']) expect(c.resolveNavView(v, p)).toBe(server.resolveNavView(v, p));
  });

  it('resolves the default from desk, then role', () => {
    expect(server.defaultWorkProfile('STAFF')).toBe('CASES');
    expect(server.defaultWorkProfile('ADMIN')).toBe('OWNER');
    expect(server.defaultWorkProfile('SUPER_ADMIN', null)).toBe('OWNER');
    expect(server.defaultWorkProfile('STAFF', 'FINANCE')).toBe('FINANCE');
    expect(server.defaultWorkProfile('STAFF', 'MARKETING')).toBe('SALES');
    expect(server.defaultWorkProfile('ADMIN', 'MANAGER')).toBe('CASES');
    expect(server.resolveWorkProfile('EMPLOYERS', 'STAFF', 'FINANCE')).toBe('EMPLOYERS');
    expect(server.resolveWorkProfile('BOSS', 'STAFF', 'FINANCE')).toBe('FINANCE');
    // view: own choice > "a profile was chosen" > the full menu
    expect(server.resolveNavView(null, null)).toBe('full');
    expect(server.resolveNavView(null, 'SALES')).toBe('simple');
    expect(server.resolveNavView('full', 'SALES')).toBe('full');
    expect(server.resolveNavView('simple', null)).toBe('simple');
  });

  it('every profile lists existing pages, without duplicates', () => {
    const ids = new Set(r.STAFF_NAV.map((i) => i.id));
    for (const p of c.WORK_PROFILES) {
      const pages = c.PROFILE_PAGES[p];
      expect(pages.length, p).toBeGreaterThanOrEqual(5);
      expect(new Set(pages).size, `${p} duplicates`).toBe(pages.length);
      for (const id of pages) expect(ids.has(id), `${p}: ${id}`).toBe(true);
    }
  });

  it('never shows what the role cannot open or a switched-off module', () => {
    for (const p of c.WORK_PROFILES)
      for (const role of ROLES)
        for (const modules of [{}, { campaigns: false, quotes: false, knowledgeBase: false, timeTracking: false, settlements: false }] as Record<string, boolean>[])
          for (const item of c.profileItems(p, role, modules)) expect(r.isVisible(item, role, modules), `${p}/${role}: ${item.id}`).toBe(true);
    const finance = c.profileItems('FINANCE', 'STAFF', {}).map((i) => i.id);
    expect(finance).not.toContain('invoices'); // admin only
    expect(finance).toContain('settlements');
    expect(c.profileItems('FINANCE', 'STAFF', { settlements: false }).map((i) => i.id)).not.toContain('settlements');
    expect(c.profileItems('FINANCE', 'ADMIN', {}).map((i) => i.id)).toContain('invoices');
    expect(c.profileItems('SALES', 'ADMIN', { campaigns: false }).map((i) => i.id)).not.toContain('campaigns');
  });

  it('simple sidebar: favourites first (not repeated), then the profile grouped by hub, workspace last', () => {
    const groups = c.simpleSidebarGroups('CASES', ['invoices', 'review', 'bogus'], 'STAFF', {});
    expect(groups[0]).toMatchObject({ key: 'favourites' });
    expect(groups[0].items.map((i) => i.id)).toEqual(['review']); // invoices: admin only; bogus: unknown
    const rest = groups.slice(1).flatMap((g) => g.items.map((i) => i.id));
    expect(rest).not.toContain('review');
    expect(rest).toContain('cases');
    expect(groups.find((g) => g.key === 'hub:cases')?.items.map((i) => i.id)).toContain('cases');
    expect(groups[groups.length - 1]).toMatchObject({ key: 'workspace' });
    expect(groups[groups.length - 1].items.every((i) => i.area === 'workspace')).toBe(true);
    // no pins → no favourites group
    expect(c.simpleSidebarGroups('FINANCE', [], 'ADMIN', {})[0].key).not.toBe('favourites');
  });
});
