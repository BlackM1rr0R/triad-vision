/*
 * Triad Vision service worker (installable site / PWA). Hand-written, no dependencies.
 *
 * Caching:
 *   /assets/*            cache-first (file names carry a content hash, so a cached file never goes stale;
 *                        old chunks stay available to tabs still running the previous build)
 *   page navigations     network-first, never cached (index.html is a Caddy template that carries the
 *                        page-specific SEO head and always points at the current build); offline → /offline.html
 *   icons, manifest,     stale-while-revalidate
 *   offline page
 *   /api/*, /uploads/*,  never touched: requests go straight to the network, nothing with personal data is
 *   /__seo/*, sitemap    written to a cache by the worker
 *   /__offline/*         offline documents the CLIENT chose to keep ("Oflayn saxla", src/lib/offlineDocs.ts): the page
 *                        writes them into the tv-offline-v1 cache, the worker only serves them from there (never from
 *                        the network), refuses items older than 30 days and deletes the whole cache once its index is
 *                        gone or expired. Offline navigations to /account/* open /offline-docs.html when something is
 *                        kept. Logout deletes the cache (src/lib/auth.tsx).
 *
 * Updates: the build stamps BUILD below (vite.config.ts → swBuildStamp), so every deployment ships a changed
 * sw.js. The new worker waits until the page asks it to take over ("New version available — Reload" toast,
 * src/lib/pwa.ts), then the page reloads once.
 */
const BUILD = '__TV_BUILD__';
const SHELL_CACHE = 'tv-shell-' + BUILD;
const ASSET_CACHE = 'tv-assets-v1';
const MAX_ASSETS = 400;
const PRECACHE = ['/offline.html', '/offline-docs.html', '/offline-docs.js', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/badge-96.png'];
const OFFLINE_CACHE = 'tv-offline-v1';
const OFFLINE_INDEX = '/__offline/index.json';
const OFFLINE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const BYPASS = [/^\/api\//, /^\/uploads\//, /^\/__seo\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/, /^\/sw\.js$/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('tv-shell-') && n !== SHELL_CACHE).map((n) => caches.delete(n)));
      await offlineIndex(); // drops expired offline documents
      await self.clients.claim();
    })(),
  );
});

const trimAssets = async () => {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_ASSETS) await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map((k) => cache.delete(k)));
};

const cacheFirst = async (request) => {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    await cache.put(request, res.clone());
    void trimAssets();
  }
  return res;
};

const staleWhileRevalidate = async (event) => {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((res) => {
      if (res.ok && res.type === 'basic') void cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || Response.error();
};

// ─── Offline documents ("Oflayn saxla") ─────────────────────────────────

const expiredAt = (savedAt) => !savedAt || Date.now() - new Date(savedAt).getTime() > OFFLINE_KEEP_MS;

/** The index of kept documents with expired items removed (null: nothing kept; the cache is deleted then). */
const offlineIndex = async () => {
  if (!(await caches.has(OFFLINE_CACHE))) return null;
  const cache = await caches.open(OFFLINE_CACHE);
  const res = await cache.match(OFFLINE_INDEX);
  let idx = null;
  try {
    idx = res ? await res.json() : null;
  } catch (e) {
    idx = null;
  }
  if (!idx || !Array.isArray(idx.docs)) {
    await caches.delete(OFFLINE_CACHE);
    return null;
  }
  const keep = idx.docs.filter((d) => !expiredAt(d.savedAt));
  const appointment = idx.appointment && !expiredAt(idx.appointment.savedAt) ? idx.appointment : null;
  if (!keep.length && !appointment) {
    await caches.delete(OFFLINE_CACHE);
    return null;
  }
  if (keep.length !== idx.docs.length || appointment !== idx.appointment) {
    await Promise.all(idx.docs.filter((d) => !keep.includes(d)).map((d) => cache.delete('/__offline/doc/' + d.id)));
    idx = Object.assign({}, idx, { docs: keep, appointment });
    await cache.put(OFFLINE_INDEX, new Response(JSON.stringify(idx), { headers: { 'content-type': 'application/json' } }));
  }
  return idx;
};

const serveOffline = async (url) => {
  const idx = await offlineIndex();
  if (!idx) return new Response('Not found', { status: 404 });
  if (url.pathname === OFFLINE_INDEX) return (await caches.open(OFFLINE_CACHE)).match(OFFLINE_INDEX);
  const id = url.pathname.slice('/__offline/doc/'.length);
  if (!idx.docs.some((d) => d.id === id)) return new Response('Not found', { status: 404 });
  const hit = await (await caches.open(OFFLINE_CACHE)).match('/__offline/doc/' + id);
  return hit || new Response('Not found', { status: 404 });
};

const navigate = async (request) => {
  try {
    return await fetch(request);
  } catch (err) {
    // Portal pages without internet: the kept documents and the appointment card, when there are any.
    const url = new URL(request.url);
    if (url.pathname.startsWith('/account') && (await offlineIndex())) {
      const docs = await caches.match('/offline-docs.html');
      if (docs) return docs;
    }
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    throw err;
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__offline/')) return event.respondWith(serveOffline(url));
  if (BYPASS.some((re) => re.test(url.pathname))) return;
  if (request.mode === 'navigate') return event.respondWith(navigate(request));
  if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request));
  if (PRECACHE.includes(url.pathname) || url.pathname.startsWith('/icons/')) return event.respondWith(staleWhileRevalidate(event));
});

// ─── Web Push ───────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Triad Vision';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { link: typeof data.link === 'string' ? data.link : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.link) || '/';
  const target = new URL(raw, self.location.origin);
  // Only our own pages open from a notification.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) {
          try {
            await client.navigate(url);
            return;
          } catch (e) {
            /* uncontrolled tab: fall through to postMessage */
          }
        }
        client.postMessage({ type: 'NAVIGATE', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser rotated the subscription: register the new one for the logged-in user (best effort).
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription;
  if (!old || !old.options) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe(old.options)
      .then((sub) =>
        fetch('/api/site/push/subscriptions', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        }),
      )
      .catch(() => undefined),
  );
});
