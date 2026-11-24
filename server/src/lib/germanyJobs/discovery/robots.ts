import { BOT_TOKEN, FetchBudgetExceeded, safeGet, type SafeGetOptions } from '../../net/safeFetch.js';

/**
 * robots.txt for employer e-mail discovery (RFC 9309, the parts that matter): groups by User-agent, our product
 * token "triadvisionbot" first, else "*"; Allow / Disallow with "*" and "$"; the longest matching rule wins, Allow
 * wins a tie. Fetch result: 2xx → parsed rules, 4xx → everything allowed, 5xx / network error → everything
 * disallowed (the RFC's "unreachable"). Cached per origin for 24 h (errors 1 h), in memory.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

/** Rules of the group that applies to `token` (pure). */
export const parseRobots = (txt: string, token = BOT_TOKEN): RobotsRule[] => {
  type Group = { agents: string[]; rules: RobotsRule[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n|\r/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (key === 'disallow' && !value) continue; // "Disallow:" = nothing disallowed
      current.rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  const t = token.toLowerCase();
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && (t === a || t.startsWith(a))));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
};

const patternRegex = (pattern: string) => {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
};

/** Percent-encoding differences do not matter for the match ("/%7Ejoe" = "/~joe"). */
const normPath = (p: string) => {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
};

/** Is `pathAndQuery` allowed under `rules` (pure)? */
export const robotsAllows = (rules: RobotsRule[], pathAndQuery: string): boolean => {
  const path = normPath(pathAndQuery || '/');
  let best: RobotsRule | null = null;
  for (const r of rules) {
    if (!patternRegex(normPath(r.pattern)).test(path)) continue;
    const len = r.pattern.length;
    if (!best || len > best.pattern.length || (len === best.pattern.length && r.allow && !best.allow)) best = r;
  }
  return !best || best.allow;
};

const ALLOW_ALL: RobotsRule[] = [];
const DISALLOW_ALL: RobotsRule[] = [{ allow: false, pattern: '/' }];
const cache = new Map<string, { rules: RobotsRule[]; until: number }>();
const DAY = 24 * 60 * 60 * 1000;

/** Rules for an origin (cached). `get` options: the caller's rate limiter / test transport. */
export const robotsFor = async (origin: string, o: Pick<SafeGetOptions, 'beforeRequest' | 'resolver' | 'transport'> = {}, now = Date.now()): Promise<RobotsRule[]> => {
  const hit = cache.get(origin);
  if (hit && hit.until > now) return hit.rules;
  let rules: RobotsRule[];
  let ttl = DAY;
  try {
    const res = await safeGet(`${origin}/robots.txt`, { ...o, maxBytes: 500 * 1024, maxRedirects: 5, accept: 'text/plain,*/*;q=0.5' });
    if (res.status >= 200 && res.status < 300) rules = /html/i.test(res.contentType) && /<html/i.test(res.body) ? ALLOW_ALL : parseRobots(res.body);
    else if (res.status >= 400 && res.status < 500) rules = ALLOW_ALL;
    else {
      rules = DISALLOW_ALL;
      ttl = 60 * 60 * 1000;
    }
  } catch (err) {
    if (err instanceof FetchBudgetExceeded) throw err; // not an answer of the site: ask again later
    rules = DISALLOW_ALL;
    ttl = 60 * 60 * 1000;
  }
  cache.set(origin, { rules, until: now + ttl });
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return rules;
};

export const robotsAllowsUrl = async (url: URL, o: Pick<SafeGetOptions, 'beforeRequest' | 'resolver' | 'transport'> = {}) => robotsAllows(await robotsFor(url.origin, o), `${url.pathname}${url.search}`);

/** Tests. */
export const clearRobotsCache = () => cache.clear();
