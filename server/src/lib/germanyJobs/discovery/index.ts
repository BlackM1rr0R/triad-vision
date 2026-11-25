import crypto from 'node:crypto';
import { prisma } from '../../../db.js';
import { audit } from '../../audit.js';
import { FetchBudgetExceeded, SafeFetchError, safeGet, type SafeResponse } from '../../net/safeFetch.js';
import { processExternalApplication } from '../autoSend.js';
import { EXTERNAL_APPLY_RETIRED, getAutoSendSettings } from '../autoSettings.js';
import { acceptCandidate, isBoardDomain, isProviderHost, registrableDomain, type AcceptContext } from './domains.js';
import { contactLinks, extractCandidates, jsonLdFacts, softRedirect } from './extract.js';
import { robotsAllowsUrl } from './robots.js';

/**
 * Employer e-mail discovery for "apply via Triad Vision" applications without an employer address (Careerjet /
 * Jooble / Adzuna give only a tracking link). Runs only in the scheduler (jobs/germanyJobs.ts), never in a request:
 *
 *   SEARCHING application ─► cache (per listing URL, 7 days, success and failure)
 *        └─ miss → GET the provider link, follow redirects (≤5 hops, also a meta-refresh / literal location jump of a
 *                  small interstitial) to the employer / job-board page; robots.txt of every non-provider host is
 *                  obeyed; SSRF guard, 10 s, 2 MB, no cookies, no JS (lib/net/safeFetch.ts)
 *                → addresses from JSON-LD, mailto: and text (also obfuscated), ranked (extract.ts) and accepted only
 *                  on the employer's domain (domains.ts); nothing on the page → at most two same-site pages
 *                  (careers / contact / Impressum)
 *   FOUND → employerEmail (source DISCOVERED) + page + evidence → the normal pipeline (consent, limits, dedupe)
 *   else  → the resolved page is kept (direct link for the client / staff) → the pipeline hands it to the client
 * Rate: at most FETCHES_PER_MINUTE requests a minute, one request per host every PER_HOST_MS; failures are logged
 * quietly and never change anything but the discovery fields.
 */

export const FETCHES_PER_MINUTE = 12;
export const PER_HOST_MS = 5_000;
export const CACHE_DAYS = 7;
const APPS_PER_RUN = 10;
const RUN_BUDGET_MS = 5 * 60 * 1000;
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

export const listingHash = (url: string) => crypto.createHash('sha256').update(url).digest('hex');

const fromCache = async (listingUrl: string, now: Date): Promise<DiscoveryResult | null> => {
  const row = await prisma.employerEmailDiscovery.findUnique({ where: { urlHash: listingHash(listingUrl) } });
  if (!row || row.expiresAt <= now) return null;
  return { outcome: row.outcome as DiscoveryOutcome, pageUrl: row.pageUrl, email: row.email, evidenceUrl: row.evidenceUrl, evidence: row.evidence, error: row.error };
};

const toCache = async (listingUrl: string, r: DiscoveryResult, now: Date) => {
  const data = {
    listingUrl: listingUrl.slice(0, 1000),
    outcome: r.outcome,
    pageUrl: r.pageUrl?.slice(0, 1000) ?? null,
    email: r.email,
    evidenceUrl: r.evidenceUrl?.slice(0, 1000) ?? null,
    evidence: r.evidence?.slice(0, 500) ?? null,
    error: r.error?.slice(0, 200) ?? null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CACHE_DAYS * 24 * 60 * 60 * 1000),
  };
  const urlHash = listingHash(listingUrl);
  await prisma.employerEmailDiscovery.upsert({ where: { urlHash }, create: { urlHash, ...data }, update: data });
};

const systemReq = { user: undefined, ip: undefined } as unknown as Parameters<typeof audit>[0];

/** Writes the result to a still-searching application and lets the pipeline continue (send / hand to the client). */
const applyResult = async (id: string, inquiryId: string, r: DiscoveryResult | null, now: Date) => {
  const found = r?.outcome === 'FOUND' && !!r.email;
  const moved = await prisma.externalJobApplication.updateMany({
    where: { id, autoState: 'SEARCHING', autoSentAt: null },
    data: {
      discoveryState: r ? r.outcome : 'SKIPPED',
      discoveryAt: now,
      ...(r?.pageUrl ? { employerPageUrl: r.pageUrl.slice(0, 1000) } : {}),
      ...(found ? { employerEmail: r.email, employerEmailSource: 'DISCOVERED', employerEmailEvidenceUrl: r.evidenceUrl?.slice(0, 1000) ?? null, employerEmailEvidence: r.evidence?.slice(0, 500) ?? null } : {}),
    },
  });
  if (!moved.count) return;
  if (found) await audit(systemReq, 'EXTERNAL_JOB_EMPLOYER_EMAIL_DISCOVERED', `inquiry:${inquiryId}`, { email: r.email, page: r.evidenceUrl });
  await processExternalApplication(id, { now });
};

/**
 * Scheduler step (jobs/germanyJobs.ts, after the automatic sending): applications waiting in SEARCHING. Discovery
 * switched off → they continue at once without it. `fetchPage` replaces the network in tests.
 */
export const runEmployerDiscovery = async (opts: { now?: Date; fetchPage?: PageFetcher; maxApps?: number; budgetMs?: number } = {}) => {
  // Retired (owner decision): no employer e-mail discovery for external listings any more.
  if (EXTERNAL_APPLY_RETIRED) return { checked: 0, found: 0, skipped: 0, deferred: 0 };
  const now = opts.now ?? new Date();
  const settings = await getAutoSendSettings();
  const rows = await prisma.externalJobApplication.findMany({
    where: { autoState: 'SEARCHING', status: 'SUBMITTED', autoSentAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, inquiryId: true, listingUrl: true, listingCompany: true },
    take: settings.discovery ? (opts.maxApps ?? APPS_PER_RUN) : 100,
  });
  const out = { checked: 0, found: 0, skipped: 0, deferred: 0 };
  if (!settings.discovery) {
    for (const r of rows) await applyResult(r.id, r.inquiryId, null, now).catch((err) => console.error('[discovery] continue failed', r.id, err));
    out.skipped = rows.length;
    return out;
  }
  const fetchPage = opts.fetchPage ?? politeFetcher(new FetchLimiter({ perMinute: FETCHES_PER_MINUTE, perHostMs: PER_HOST_MS, deadline: Date.now() + (opts.budgetMs ?? RUN_BUDGET_MS) }));
  for (const r of rows) {
    try {
      let result = await fromCache(r.listingUrl, now);
      if (!result) {
        result = await discoverEmployerEmail(r.listingUrl, r.listingCompany, fetchPage);
        await toCache(r.listingUrl, result, now);
        if (result.outcome !== 'FOUND') console.info(`[discovery] ${result.outcome}${result.error ? ` ${result.error}` : ''} ${hostOfUrl(result.pageUrl ?? r.listingUrl)}`);
      }
      out.checked++;
      if (result.outcome === 'FOUND') out.found++;
      await applyResult(r.id, r.inquiryId, result, now);
    } catch (err) {
      if (err instanceof FetchBudgetExceeded) {
        out.deferred = rows.length - out.checked;
        break; // the rest waits for the next run
      }
      console.error('[discovery] failed', r.id, err);
    }
  }
  return out;
};

/** Housekeeping: expired cache rows. */
export const purgeDiscoveryCache = (now = new Date()) => prisma.employerEmailDiscovery.deleteMany({ where: { expiresAt: { lt: now } } });
