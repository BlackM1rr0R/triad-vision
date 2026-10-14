/**
 * Works out the API base URL.
 *
 * 1. EXPO_PUBLIC_API_URL wins (set it in mobile/.env, or per EAS build profile).
 * 2. In development the Metro dev server's host (the PC's LAN IP, e.g. 192.168.1.20:8081)
 *    is reused with port 4000 — so a phone running Expo Go reaches the API on the same PC.
 * 3. Android emulator without a dev host: 10.0.2.2 is the emulator's alias for the PC.
 * 4. Otherwise localhost (iOS simulator).
 */
export const resolveApiUrl = (opts: {
  envUrl?: string | null;
  hostUri?: string | null;
  platform: string;
  port?: number;
}): string => {
  const port = opts.port ?? 4000;
  const env = opts.envUrl?.trim();
  if (env) return env.replace(/\/+$/, '');

  const host = opts.hostUri?.split(':')[0]?.trim();
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:${port}/api`;
  if (opts.platform === 'android') return `http://10.0.2.2:${port}/api`;
  return `http://localhost:${port}/api`;
};

/** Origin of the API (no /api) — used for public /uploads images. */
export const apiOrigin = (apiUrl: string) => apiUrl.replace(/\/api\/?$/, '');

/** CMS images are either absolute (https://…) or server paths (/uploads/…). */
export const resolveMediaUrl = (apiUrl: string, src?: string | null) => {
  if (!src) return undefined;
  if (/^https?:\/\//i.test(src)) return src;
  return `${apiOrigin(apiUrl)}${src.startsWith('/') ? '' : '/'}${src}`;
};
