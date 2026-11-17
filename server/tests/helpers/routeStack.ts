import { createRequire } from 'node:module';

/**
 * Express 5 (router 2.x) does not keep the mount path of `router.use('/path', sub)` on the layer, so the
 * route-mapping completeness test records it while the routers are built: install the recorder BEFORE
 * importing any router module, then walk the stacks with collectRoutes().
 */
const require = createRequire(import.meta.url);

interface Layer {
  route?: { path: string | string[] | RegExp; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
  __mount?: unknown;
}

let installed = false;
export const installMountRecorder = () => {
  if (installed) return;
  installed = true;
  const Router = require('router') as { prototype: { use: (...args: unknown[]) => unknown; stack?: Layer[] } };
  const original = Router.prototype.use;
  Router.prototype.use = function patchedUse(this: { stack: Layer[] }, ...args: unknown[]) {
    const before = this.stack.length;
    let mount: unknown = '/';
    let first: unknown = args[0];
    while (Array.isArray(first) && first.length) first = first[0];
    if (typeof first !== 'function') mount = args[0];
    const out = original.apply(this, args);
    for (let i = before; i < this.stack.length; i++) this.stack[i].__mount = mount;
    return out;
  };
};

export interface MountedRoute {
  method: string;
  path: string;
}

const join = (a: string, b: string) => `${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/';

const asPaths = (p: unknown): string[] => {
  if (Array.isArray(p)) return p.flatMap(asPaths);
  if (typeof p === 'string') return [p];
  if (p instanceof RegExp) return [`<regexp ${p.source}>`];
  return ['/'];
};

/** Every (method, path) reachable through the router, mount prefixes included. */
export const collectRoutes = (router: { stack?: Layer[] }, prefix = ''): MountedRoute[] => {
  const out: MountedRoute[] = [];
  for (const layer of router.stack ?? []) {
    if (layer.route) {
      for (const p of asPaths(layer.route.path))
        for (const m of Object.keys(layer.route.methods)) out.push({ method: m === '_all' ? 'ALL' : m.toUpperCase(), path: join(prefix, p) });
    } else if (layer.handle?.stack) {
      for (const p of asPaths(layer.__mount ?? '/')) out.push(...collectRoutes(layer.handle, join(prefix, p)));
    }
  }
  return out;
};
