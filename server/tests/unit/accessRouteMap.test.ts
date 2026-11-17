import { beforeAll, describe, expect, it } from 'vitest';
import { collectRoutes, installMountRecorder, type MountedRoute } from '../helpers/routeStack';
import { actionFor, classifyRoute } from '../../src/lib/access/routeMap.js';
import { AREAS } from '../../src/lib/access/types.js';
import { canWith, effectivePermissions } from '../../src/lib/access/resolve.js';
import { BUILT_IN_TEMPLATES, LEGACY_ADMIN, LEGACY_STAFF } from '../../src/lib/access/templates.js';

/**
 * Route mapping completeness: walks the mounted admin router (express router stacks, mount paths recorded
 * while the routers are built) and classifies every route. A new admin route that the central table
 * (lib/access/routeMap.ts) does not know fails this test, so the mapping stays complete.
 */

let routes: MountedRoute[] = [];
beforeAll(async () => {
  installMountRecorder();
  const { adminRouter } = await import('../../src/routes/admin/index.js');
  routes = collectRoutes(adminRouter as unknown as { stack: never[] }, '/admin');
}, 120_000);

/** '/admin/cases/:id/documents/:docId' → a concrete path the guard would see. */
const sample = (p: string) => p.replace(/:([A-Za-z_]+)\??/g, 'ckabc123def456ghi789jkl0').replace(/\*\w*/g, 'x');

describe('access route map', () => {
  it('finds the admin routes', () => {
    expect(routes.length).toBeGreaterThan(900);
    expect(routes.some((r) => r.method === 'GET' && r.path === '/admin/cases/:id')).toBe(true);
  });

  it('maps every mounted admin route to an area + action (or an explicit self route)', () => {
    const unmapped = routes.filter((r) => !r.path.startsWith('<regexp') && classifyRoute(r.method === 'ALL' ? 'GET' : r.method, sample(r.path)) === null);
    expect(unmapped.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('legacy templates allow every mounted admin route (defaults = today; role checks stay in the routes)', () => {
    for (const key of [LEGACY_STAFF, LEGACY_ADMIN]) {
      const allowed = effectivePermissions(BUILT_IN_TEMPLATES.find((t) => t.key === key)!.matrix);
      const blocked = routes.filter((r) => {
        const c = classifyRoute(r.method === 'ALL' ? 'GET' : r.method, sample(r.path));
        return c && 'area' in c && !canWith({ superAdmin: false, allowed }, c.area, c.action);
      });
      expect(blocked.map((r) => `${key} ${r.method} ${r.path}`)).toEqual([]);
    }
  });

  it('has no regexp routes the table cannot see', () => {
    expect(routes.filter((r) => r.path.includes('<regexp')).map((r) => r.path)).toEqual([]);
  });

  it('derives the action from the method and downloads', () => {
    expect(actionFor('GET', '/admin/cases/x')).toBe('view');
    expect(actionFor('HEAD', '/admin/cases/x')).toBe('view');
    expect(actionFor('POST', '/admin/cases/x/notes')).toBe('edit');
    expect(actionFor('PUT', '/admin/settings/x')).toBe('edit');
    expect(actionFor('PATCH', '/admin/cases/x')).toBe('edit');
    expect(actionFor('DELETE', '/admin/cases/x/requirements/y')).toBe('delete');
    expect(actionFor('GET', '/admin/finance/export.xlsx')).toBe('export');
    expect(actionFor('GET', '/admin/invoices/export.csv')).toBe('export');
    expect(actionFor('GET', '/admin/invoices/x/pdf')).toBe('export');
    expect(actionFor('POST', '/admin/bulk/cases/export')).toBe('export');
    expect(actionFor('GET', '/files/x', { download: '1' })).toBe('export');
    expect(actionFor('GET', '/files/x', {})).toBe('view');
    expect(actionFor('POST', '/admin/reports/preview')).toBe('view');
  });

  it('classifies the key staff routes', () => {
    expect(classifyRoute('GET', '/admin/cases')).toEqual({ area: 'cases', action: 'view' });
    expect(classifyRoute('GET', '/admin/cases/abc/messages')).toEqual({ area: 'communications', action: 'view' });
    expect(classifyRoute('POST', '/admin/cases/abc/documents')).toEqual({ area: 'documents', action: 'edit' });
    expect(classifyRoute('GET', '/files/doc1', { download: '1' })).toEqual({ area: 'documents', action: 'export' });
    expect(classifyRoute('GET', '/admin/client-billing/invoices')).toEqual({ area: 'finance', action: 'view' });
    expect(classifyRoute('GET', '/admin/invoices')).toEqual({ area: 'finance', action: 'view' });
    expect(classifyRoute('GET', '/drive/nodes/x')).toEqual({ area: 'drive', action: 'view' });
    expect(classifyRoute('GET', '/admin/users/staff')).toEqual({ self: true });
    expect(classifyRoute('GET', '/admin/users')).toEqual({ area: 'settings', action: 'view' });
    expect(classifyRoute('GET', '/admin/ops/kb/articles')).toEqual({ self: true });
    expect(classifyRoute('POST', '/admin/ops/kb/articles')).toEqual({ area: 'content', action: 'edit' });
    expect(classifyRoute('POST', '/admin/access/break-glass')).toEqual({ self: true });
    expect(classifyRoute('GET', '/admin/me/nav')).toEqual({ self: true });
    // not staff routes: left alone
    expect(classifyRoute('GET', '/account')).toBeNull();
    expect(classifyRoute('POST', '/auth/login')).toBeNull();
    expect(classifyRoute('GET', '/public/settings')).toBeNull();
  });

  it('prints the per-router summary (areas used)', () => {
    const byRouter = new Map<string, Set<string>>();
    for (const r of routes) {
      const c = classifyRoute(r.method === 'ALL' ? 'GET' : r.method, sample(r.path));
      const key = r.path.split('/')[2] ?? '';
      const set = byRouter.get(key) ?? new Set<string>();
      set.add(c === null ? 'UNMAPPED' : 'self' in c ? 'self' : c.area);
      byRouter.set(key, set);
    }
    for (const s of byRouter.values()) for (const a of s) expect(['self', ...AREAS]).toContain(a);
  });
});
