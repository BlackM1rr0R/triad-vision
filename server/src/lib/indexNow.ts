import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { getSeoData, SITEMAP_GROUPS, siteOrigin, sitemapUrls } from './seo.js';

/**
 * IndexNow (Bing, Yandex, Seznam, Naver …; https://www.indexnow.org): new and changed public URLs are pushed to
 * the search engines instead of waiting for the next crawl. The key is public by design (the engines fetch it
 * from KEY_PATH to prove the site owns it), so it is derived from the site origin; INDEXNOW_KEY overrides it.
 *
 * The job compares every sitemap URL's lastmod with what was last submitted (Setting `seo:indexNow`) and sends
 * only the difference; the first run sends everything. Production only; INDEXNOW=0 turns it off.
 */

export const KEY_PATH = '/indexnow.txt';
const SETTING_KEY = 'seo:indexNow';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
/** The protocol's limit per request. */
const BATCH = 10_000;

export const indexNowKey = () => process.env.INDEXNOW_KEY || createHash('sha256').update(`indexnow:${siteOrigin()}`).digest('hex').slice(0, 32);

export const indexNowEnabled = () => config.isProd && process.env.INDEXNOW !== '0' && siteOrigin().startsWith('https://');

type Submitted = Record<string, string>;

/** URLs whose lastmod differs from the last submission (new ones included), and the full current map. */
export const changedUrls = (current: Submitted, previous: Submitted) => Object.keys(current).filter((u) => previous[u] !== current[u]);

const currentUrls = async (): Promise<Submitted> => {
  const data = await getSeoData();
  const out: Submitted = {};
  for (const g of SITEMAP_GROUPS) for (const u of sitemapUrls(data, g)) out[u.loc] = u.lastmod.toISOString();
  return out;
};

const submit = async (urls: string[], fetchImpl: typeof fetch) => {
  const origin = siteOrigin();
  for (let i = 0; i < urls.length; i += BATCH) {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(origin).host, key: indexNowKey(), keyLocation: `${origin}${KEY_PATH}`, urlList: urls.slice(i, i + BATCH) }),
      signal: AbortSignal.timeout(20_000),
    });
    // 200 = accepted, 202 = accepted, key validation pending.
    if (res.status !== 200 && res.status !== 202) throw new Error(`IndexNow answered ${res.status}`);
  }
};

/** One run: submits the changed URLs; returns how many were sent (0 when nothing changed or disabled). */
export const runIndexNow = async ({ fetchImpl = fetch, force = false }: { fetchImpl?: typeof fetch; force?: boolean } = {}) => {
  if (!force && !indexNowEnabled()) return 0;
  const current = await currentUrls();
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const previous = ((row?.value as { urls?: Submitted } | null)?.urls ?? {}) as Submitted;
  const changed = changedUrls(current, previous);
  if (!changed.length) return 0;
  await submit(changed, fetchImpl);
  const value = { urls: current, at: new Date().toISOString(), sent: changed.length } as unknown as Prisma.InputJsonObject;
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } });
  return changed.length;
};
