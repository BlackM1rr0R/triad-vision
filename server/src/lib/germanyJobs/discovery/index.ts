import { prisma } from '../../../db.js';
import { FetchBudgetExceeded, SafeFetchError, safeGet, type SafeResponse } from '../../net/safeFetch.js';
import { acceptCandidate, isBoardDomain, isProviderHost, registrableDomain, type AcceptContext } from './domains.js';
import { contactLinks, extractCandidates, jsonLdFacts, softRedirect } from './extract.js';
import { robotsAllowsUrl } from './robots.js';

/**
 * Employer e-mail discovery engine of the retired "apply via Triad Vision" automatic sending (lib/germanyJobs/autoSend.ts).
 * The scheduler run that fed the pipeline (SEARCHING applications → discovery → sending) was removed with it; what
 * stays is the self-contained, unit-tested engine and the housekeeping of the old cache rows:
 *
 *   listing link ─► GET the provider link, follow redirects (≤5 hops, also a meta-refresh / literal location jump of a
 *                  small interstitial) to the employer / job-board page; robots.txt of every non-provider host is
 *                  obeyed; SSRF guard, 10 s, 2 MB, no cookies, no JS (lib/net/safeFetch.ts)
 *                → addresses from JSON-LD, mailto: and text (also obfuscated), ranked (extract.ts) and accepted only
 *                  on the employer's domain (domains.ts); nothing on the page → at most two same-site pages
 *                  (careers / contact / Impressum)
 * Rate (politeFetcher): at most FETCHES_PER_MINUTE requests a minute, one request per host every PER_HOST_MS.
 */

export const FETCHES_PER_MINUTE = 12;
export const PER_HOST_MS = 5_000;
const EXTRA_PAGES = 2;

export type DiscoveryOutcome = 'FOUND' | 'NOT_FOUND' | 'ROBOTS' | 'FAILED';

export interface DiscoveryResult {
  outcome: DiscoveryOutcome;
  /** Final listing page after redirects (null when not even the first hop answered). */
  pageUrl: string | null;
  email: string | null;
  evidenceUrl: string | null;
  evidence: string | null;
  error: string | null;
}

/** GET with every safety rule applied (replaceable in tests). Throws SafeFetchError('POLICY') when robots.txt says no. */
export type PageFetcher = (url: string) => Promise<SafeResponse>;

/** Requests per minute + per host spacing within a run deadline (pure timing; clock and sleep injectable). */
export class FetchLimiter {
  private times: number[] = [];
  private hostAt = new Map<string, number>();
  constructor(
    private o: { perMinute: number; perHostMs: number; deadline: number; now?: () => number; sleep?: (ms: number) => Promise<void> },
  ) {}

  async acquire(host: string): Promise<true> {
    const now = this.o.now ?? Date.now;
    const sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const key = registrableDomain(host);
    for (;;) {
      const t = now();
      this.times = this.times.filter((x) => x > t - 60_000);
      let wait = this.times.length >= this.o.perMinute ? this.times[0] + 60_000 - t : 0;
      const last = this.hostAt.get(key);
      if (last !== undefined) wait = Math.max(wait, last + this.o.perHostMs - t);
      if (wait <= 0) {
        this.times.push(t);
        this.hostAt.set(key, t);
        return true;
      }
      if (t + wait > this.o.deadline) throw new FetchBudgetExceeded();
      await sleep(wait);
    }
  }
}

/** The real fetcher: limiter for every request (robots.txt included), robots.txt for every non-provider host. */
export const politeFetcher = (limiter: FetchLimiter): PageFetcher => {
  const limited = async (u: URL) => limiter.acquire(u.hostname);
  return (url) =>
    safeGet(url, {
      beforeRequest: async (u) => {
        if (!isProviderHost(u.hostname) && !(await robotsAllowsUrl(u, { beforeRequest: limited }))) return false;
        return limited(u);
      },
    });
};

const isHtml = (r: SafeResponse) => /html|xml/i.test(r.contentType) || (!r.contentType && /<html|<body/i.test(r.body.slice(0, 2000)));

const evidenceOf = (source: string, context: string) => `${source}: ${context}`.replace(/\s+/g, ' ').slice(0, 500);

const hostOfUrl = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};

/** Best accepted address on one page (or null). */
const pickFrom = (html: string, ctx: AcceptContext) => {
  for (const c of extractCandidates(html)) if (!acceptCandidate(c, ctx)) return c;
  return null;
};

/**
 * Resolves one listing link and looks for the employer's address (no database). Never throws except
 * FetchBudgetExceeded (the caller stops and tries again later).
 */
export const discoverEmployerEmail = async (listingUrl: string, company: string | null, fetchPage: PageFetcher): Promise<DiscoveryResult> => {
  const r = await discoverRaw(listingUrl, company, fetchPage);
  // Only a page other than the tracking link itself is worth keeping as the direct link.
  const direct = r.pageUrl && r.pageUrl !== listingUrl && !isProviderHost(hostOfUrl(r.pageUrl)) ? r.pageUrl : null;
  return { ...r, pageUrl: direct };
};

const discoverRaw = async (listingUrl: string, company: string | null, fetchPage: PageFetcher): Promise<DiscoveryResult> => {
  const base: DiscoveryResult = { outcome: 'NOT_FOUND', pageUrl: null, email: null, evidenceUrl: null, evidence: null, error: null };
  let res: SafeResponse;
  try {
    res = await fetchPage(listingUrl);
    for (let i = 0; i < 2 && isHtml(res); i++) {
      const next = softRedirect(res.body, res.url);
      if (!next || next === res.url) break;
      res = await fetchPage(next);
    }
  } catch (err) {
    if (err instanceof FetchBudgetExceeded) throw err;
    const at = err instanceof SafeFetchError ? err.url : null;
    // The page robots.txt refused (or the hop that failed) is still the direct link for people.
    const pageUrl = at && /^https?:/i.test(at) && at !== listingUrl && !isProviderHost(hostOfUrl(at)) ? at : null;
    if (err instanceof SafeFetchError && err.code === 'POLICY') return { ...base, outcome: 'ROBOTS', pageUrl };
    return { ...base, outcome: 'FAILED', pageUrl, error: err instanceof SafeFetchError ? err.code : String((err as Error)?.message ?? err).slice(0, 200) };
  }
  const pageUrl = res.url;
  if (res.status >= 400) return { ...base, outcome: 'FAILED', pageUrl, error: `HTTP_${res.status}` };
  if (!isHtml(res)) return { ...base, pageUrl };

  const ld = jsonLdFacts(res.body);
  const ctx: AcceptContext = { pageUrl, company: company || ld.orgName, companyDomains: ld.orgUrls.map(hostOfUrl).filter(Boolean) };
  const hit = pickFrom(res.body, ctx);
  if (hit) return { ...base, outcome: 'FOUND', pageUrl, email: hit.email, evidenceUrl: pageUrl, evidence: evidenceOf(hit.source, hit.context) };

  // Nothing on the listing page: on the employer's own site, its careers / contact / Impressum page.
  const host = hostOfUrl(pageUrl);
  if (host && !isBoardDomain(host)) {
    for (const link of contactLinks(res.body, pageUrl).slice(0, EXTRA_PAGES)) {
      try {
        const sub = await fetchPage(link);
        if (sub.status >= 400 || !isHtml(sub) || registrableDomain(hostOfUrl(sub.url)) !== registrableDomain(host)) continue;
        const found = pickFrom(sub.body, { ...ctx, pageUrl: sub.url });
        if (found) return { ...base, outcome: 'FOUND', pageUrl, email: found.email, evidenceUrl: sub.url, evidence: evidenceOf(found.source, found.context) };
      } catch (err) {
        if (err instanceof FetchBudgetExceeded) throw err;
      }
    }
  }
  return { ...base, pageUrl };
};

/** Housekeeping: expired rows of the old discovery cache (EmployerEmailDiscovery; nothing new is written). */
export const purgeDiscoveryCache = (now = new Date()) => prisma.employerEmailDiscovery.deleteMany({ where: { expiresAt: { lt: now } } });
