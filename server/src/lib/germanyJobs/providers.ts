import { HttpError } from '../http.js';
import { adzunaProvider } from './adzuna.js';
import { arbeitnowProvider } from './arbeitnow.js';
import { careerjetProvider } from './careerjet.js';
import { joobleProvider } from './jooble.js';
import { PAGE_SIZE, UpstreamError, dedupeKey, type GermanyJob, type JobProvider, type ProviderInfo, type SearchContext, type SearchQuery } from './common.js';

/**
 * Job sources of /jobs/germany, merged. Never the Bundesagentur "Jobsuche API" (rest.arbeitsagentur.de): its terms
 * forbid unauthorised interfaces — the page only links to the public BA Jobbörse (client/src/lib/germanyJobs.ts).
 *
 *   arbeitnow  free, no key, default ON (hourly feed, local filtering)        ARBEITNOW_ENABLED=0 switches it off
 *   careerjet  free publisher API, ON when CAREERJET_API_KEY is set           per query, cached 30 min
 *   jooble     free key, ON only with JOOBLE_API_KEY + JOOBLE_ENABLED=1        needs written permission from Jooble
 *   adzuna     paid after the trial, ON only with keys + ADZUNA_ENABLED=1     per query, cached 20 min
 *
 * Results of the enabled providers are fetched in parallel; one failing provider does not fail the search (its
 * footer entry says so). Duplicates (normalised title + company + city) keep the first copy. Order: interleaved by
 * provider (relevance) or newest first (sort=date).
 */
export const PROVIDERS: JobProvider[] = [arbeitnowProvider, careerjetProvider, joobleProvider, adzunaProvider];

export const enabledProviders = (env: NodeJS.ProcessEnv = process.env) => PROVIDERS.filter((p) => p.enabled(env));

export interface SourceResult extends ProviderInfo {
  ok: boolean;
  total: number;
}

export interface MergedResult {
  items: GermanyJob[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  sources: SourceResult[];
}

const interleave = (lists: GermanyJob[][]) => {
  const out: GermanyJob[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
};

export const mergeResults = (lists: GermanyJob[][], sort: SearchQuery['sort']) => {
  const merged = sort === 'date' ? lists.flat().sort((a, b) => (b.created ?? '').localeCompare(a.created ?? '')) : interleave(lists);
  const seen = new Set<string>();
  return merged.filter((j) => {
    const k = dedupeKey(j);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export const searchGermanyJobs = async (q: SearchQuery, ctx: SearchContext): Promise<MergedResult> => {
  const providers = enabledProviders();
  if (!providers.length) throw new HttpError(404, 'FEATURE_DISABLED');
  const settled = await Promise.allSettled(providers.map((p) => p.search(q, ctx)));
  const sources: SourceResult[] = providers.map((p, i) => {
    const r = settled[i];
    return { ...p.info, ok: r.status === 'fulfilled', total: r.status === 'fulfilled' ? r.value.total : 0 };
  });
  const ok = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!ok.length) {
    const busy = settled.some((r) => r.status === 'rejected' && r.reason instanceof UpstreamError && r.reason.code === 'UPSTREAM_BUSY');
    for (const r of settled) if (r.status === 'rejected') console.error('[germany-jobs] provider failed', (r.reason as Error)?.message);
    throw new HttpError(busy ? 503 : 502, busy ? 'UPSTREAM_BUSY' : 'UPSTREAM_ERROR');
  }
  const items = mergeResults(
    ok.map((r) => r.items),
    q.sort,
  );
  return {
    items,
    total: ok.reduce((n, r) => n + r.total, 0),
    page: q.page,
    pageSize: PAGE_SIZE,
    pages: Math.max(1, ...ok.map((r) => r.pages)),
    sources,
  };
};

export const providerStatuses = (env: NodeJS.ProcessEnv = process.env) => PROVIDERS.map((p) => p.status(env));

/** Tests: forget every cache, budget and feed. */
export const resetProviders = () => PROVIDERS.forEach((p) => p.reset());
