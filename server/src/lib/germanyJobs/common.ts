import { z } from 'zod';
import { htmlToText } from '../mail/sanitize.js';

/**
 * Shared shapes of the German job search on /jobs/germany (lib/germanyJobs): the visitor's query, the
 * normalised listing every provider returns, the provider contract and small helpers (fetch injection for
 * tests, per-query cache, call budget, text clean-up).
 */

export const PAGE_SIZE = 20;
export const MAX_PAGE = 20;
/** Radius options of the form (km); 0 = only the place itself. Same values as the BA Jobbörse offers. */
export const RADII = [0, 10, 15, 25, 50, 100, 200] as const;
/** Identifies us to the job APIs (Arbeitnow asks not to abuse its free feed; a contact makes us reachable). */
export const USER_AGENT = 'TriadVisionJobSearch/1.0 (+https://triad-vision.de; job search for candidates)';

export const PROVIDER_IDS = ['arbeitnow', 'careerjet', 'jooble', 'adzuna'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

const flag = z
  .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false'), z.literal('')])
  .optional()
  .transform((v) => v === '1' || v === 'true');

export const searchQuery = z.object({
  q: z.string().trim().max(100).optional().default(''),
  where: z.string().trim().max(100).optional().default(''),
  radius: z.coerce
    .number()
    .int()
    .refine((n) => (RADII as readonly number[]).includes(n), 'RADIUS')
    .optional()
    .default(25),
  type: z.enum(['job', 'ausbildung']).optional().default('job'),
  time: z.enum(['any', 'full', 'part']).optional().default('any'),
  remote: flag,
  visa: flag,
  sort: z.enum(['relevance', 'date']).optional().default('relevance'),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).optional().default(1),
  lng: z.string().max(5).optional(),
});
export type SearchQuery = z.infer<typeof searchQuery>;

export interface GermanyJob {
  /** `<provider>:<provider's id>` — unique across providers. */
  id: string;
  source: ProviderId;
  title: string;
  company: string | null;
  location: string | null;
  /** Short plain-text snippet; the full text stays at the source. */
  snippet: string;
  salaryMin: number | null;
  salaryMax: number | null;
  /** Free-text salary when the provider only gives a string (Jooble). */
  salaryText: string | null;
  /** Salary period of salaryMin/Max: the providers differ (Adzuna yearly, Careerjet per salary_type). */
  salaryPeriod: 'year' | 'month' | 'week' | 'day' | 'hour' | null;
  salaryPredicted: boolean;
  created: string | null;
  contractTime: 'full_time' | 'part_time' | null;
  contractType: 'permanent' | 'contract' | null;
  remote: boolean | null;
  visaSponsorship: boolean | null;
  tags: string[];
  /** Link out to the listing at the source (the provider's own tracking URL where it requires one). */
  url: string;
}

/** Name + link of a provider shown as attribution (per card and in the source footer). */
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  url: string;
}

export interface ProviderPage {
  items: GermanyJob[];
  total: number;
  pages: number;
}

/** Visitor context some providers require per call (Careerjet: user_ip / user_agent). Never stored or cached. */
export interface SearchContext {
  ip: string | null;
  userAgent: string | null;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  /** Keys / switches present in the environment. */
  configured: boolean;
  /** Configured AND switched on: takes part in searches. */
  enabled: boolean;
  /** What is missing / why it is off (env names), for the admin note. */
  note: string | null;
  lastFetchAt: string | null;
  lastError: string | null;
  /** Feed providers: listings in memory. */
  items?: number;
}

export interface JobProvider {
  info: ProviderInfo;
  enabled: (env?: NodeJS.ProcessEnv) => boolean;
  search: (q: SearchQuery, ctx: SearchContext) => Promise<ProviderPage>;
  status: (env?: NodeJS.ProcessEnv) => ProviderStatus;
  /** Tests: forget caches, budgets and feed state. */
  reset: () => void;
}

// ─── fetch injection ─────────────────────────────────────────────────

type Fetch = typeof fetch;
let fetchImpl: Fetch | null = null;
/** Tests replace the network with a fake (null restores the global fetch). Shared by every provider. */
export const setJobsFetch = (fn: Fetch | null) => {
  fetchImpl = fn;
};
export const jobsFetch: Fetch = (input, init) => (fetchImpl ?? fetch)(input, init);

export class UpstreamError extends Error {
  constructor(
    public code: 'UPSTREAM_ERROR' | 'UPSTREAM_BUSY',
    message: string,
  ) {
    super(message);
  }
}

/** GET/POST JSON with a timeout; non-2xx → UpstreamError (the URL is never logged: it can carry a key). */
export const fetchJson = async (url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> => {
  const { timeoutMs = 8000, ...rest } = init;
  let res: Response;
  try {
    res = await jobsFetch(url, { ...rest, headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...(rest.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new UpstreamError('UPSTREAM_ERROR', `request failed: ${(err as Error).message}`);
  }
  if (!res.ok) throw new UpstreamError(res.status === 429 ? 'UPSTREAM_BUSY' : 'UPSTREAM_ERROR', `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new UpstreamError('UPSTREAM_ERROR', 'invalid JSON');
  }
};

// ─── per-query cache + call budget (query providers) ────────────────

export class QueryCache<T> {
  private map = new Map<string, { at: number; data: T }>();
  private inflight = new Map<string, Promise<T>>();
  constructor(
    private ttlMs: number,
    private max = 300,
  ) {}

  /** Cached value, else `load()` (concurrent identical keys share one call). Expired entries are dropped. */
  async get(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
    const hit = this.map.get(key);
    if (hit && now - hit.at < this.ttlMs) return hit.data;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = load();
    this.inflight.set(key, p);
    try {
      const data = await p;
      for (const [k, v] of this.map) if (now - v.at >= this.ttlMs) this.map.delete(k);
      this.map.delete(key);
      this.map.set(key, { at: now, data });
      while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
      return data;
    } finally {
      this.inflight.delete(key);
    }
  }

  clear() {
    this.map.clear();
    this.inflight.clear();
  }
}

export class CallBudget {
  private calls: number[] = [];
  constructor(private limits: () => { perMinute: number; perDay: number }) {}
  take(now = Date.now()) {
    const { perMinute, perDay } = this.limits();
    this.calls = this.calls.filter((t) => t > now - 24 * 60 * 60 * 1000);
    if (this.calls.filter((t) => t > now - 60 * 1000).length >= perMinute || this.calls.length >= perDay) return false;
    this.calls.push(now);
    return true;
  }
  reset() {
    this.calls = [];
  }
}

export const positiveInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : fallback;
};

export const isOn = (raw: string | undefined) => raw === '1' || raw?.toLowerCase() === 'true';

/** Cache key of a query (no visitor data in it). */
export const queryKey = (q: SearchQuery) => JSON.stringify([q.q.toLowerCase(), q.where.toLowerCase(), q.where ? q.radius : 0, q.type, q.time, q.sort, q.page]);

/** What query providers search for: Ausbildung has no own ad type anywhere, the word in the ad is the signal. */
export const keywordsFor = (q: SearchQuery) => (q.type === 'ausbildung' ? `Ausbildung ${q.q}`.trim() : q.q);

// ─── text helpers ────────────────────────────────────────────────────

/** Provider HTML / text → a plain-text snippet (through the app's HTML sanitiser; rendered as text, never HTML). */
export const plainText = (raw: unknown, max = 400) => {
  const s = String(raw ?? '');
  const text = /[<&]/.test(s) ? htmlToText(s.replace(/<\/?(strong|b|em|i|span)[^>]*>/gi, '')) : s;
  const flat = text.replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Math.min(Number(d), 0x10ffff))).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export const httpUrl = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};

export const positiveNumber = (x: unknown) => {
  const n = typeof x === 'string' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** Lower-case, umlauts / accents folded: "Köln" ~ "koeln" ~ "koln". */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Same listing on two providers: normalised title + company + first location word. */
export const dedupeKey = (j: Pick<GermanyJob, 'title' | 'company' | 'location'>) =>
  [j.title, j.company ?? '', (j.location ?? '').split(/[,(/-]/)[0] ?? ''].map((s) => fold(s).replace(/[^a-z0-9]+/g, '')).join('|');

const AUSBILDUNG = /\b(ausbildung|azubi|auszubildende[rn]?|apprentice(ship)?|duales studium)\b/i;
export const looksLikeAusbildung = (text: string) => AUSBILDUNG.test(text);
