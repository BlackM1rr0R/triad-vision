import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import zlib from 'node:zlib';
import type { Readable } from 'node:stream';

/**
 * Outbound GET of third-party pages with an SSRF guard (employer e-mail discovery, lib/germanyJobs/discovery):
 *   - only http / https, ports 80 / 443, no user:pass in the URL, no "localhost" / ".local" / ".internal" names
 *   - the host name is resolved first and EVERY address must be public (no loopback, private, link-local, CGNAT,
 *     multicast, documentation, NAT64 / 6to4 / mapped forms of those); the request then connects to exactly that
 *     checked address (pinned lookup), so a second DNS answer cannot point it inside (DNS rebinding)
 *   - every redirect hop is checked again; at most `maxRedirects` hops
 *   - per-request timeout (whole request incl. body), body cut at `maxBytes`, no cookies sent or kept, no JS
 *   - identifying bot User-Agent; no personal data in any header
 */

export const BOT_USER_AGENT = 'TriadVisionBot/1.0 (+https://triad-vision.de)';
/** Product token for robots.txt groups. */
export const BOT_TOKEN = 'triadvisionbot';

export type SafeFetchCode = 'BAD_URL' | 'BLOCKED_HOST' | 'DNS_FAILED' | 'TOO_MANY_REDIRECTS' | 'TIMEOUT' | 'NETWORK' | 'POLICY';

export class SafeFetchError extends Error {
  constructor(
    public code: SafeFetchCode,
    /** The URL the error belongs to (e.g. the hop a robots.txt refused). */
    public url: string | null = null,
  ) {
    super(code);
  }
}

/** The caller's fetch budget (rate limit window / run time) is used up: stop, try again in a later run. */
export class FetchBudgetExceeded extends Error {
  constructor() {
    super('FETCH_BUDGET_EXCEEDED');
  }
}

// ─── Address classification (pure) ─────────────────────────────────────────

const v4Parts = (ip: string) => ip.split('.').map((p) => Number(p));

const blockedV4 = (ip: string) => {
  const [a, b, c] = v4Parts(ip);
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  );
};

/** "2001:db8::1" → 8 hextets (embedded dotted IPv4 at the end allowed); null = not parseable. */
export const expandV6 = (raw: string): number[] | null => {
  let ip = raw.toLowerCase().replace(/^\[|\]$/g, '');
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  const dotted = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const p = v4Parts(dotted[1]);
    if (p.some((n) => n > 255)) return null;
    ip = `${ip.slice(0, -dotted[1].length)}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => parseInt(h, 16));
};

const v4FromHextets = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

const blockedV6 = (ip: string) => {
  const h = expandV6(ip);
  if (!h) return true;
  const zeros = (from: number, to: number) => h.slice(from, to).every((x) => x === 0);
  if (zeros(0, 8)) return true; // ::
  if (zeros(0, 7) && h[7] === 1) return true; // ::1
  if (zeros(0, 5) && h[5] === 0xffff) return blockedV4(v4FromHextets(h[6], h[7])); // IPv4-mapped
  if (zeros(0, 6)) return true; // IPv4-compatible (deprecated)
  if (h[0] === 0x64 && h[1] === 0xff9b) return zeros(2, 6) ? blockedV4(v4FromHextets(h[6], h[7])) : true; // NAT64
  if (h[0] === 0x2002) return blockedV4(v4FromHextets(h[1], h[2])); // 6to4
  if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
  if (h[0] === 0x0100 && zeros(1, 4)) return true; // discard
  if ((h[0] & 0xfe00) === 0xfc00) return true; // unique local
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if (h[0] >> 8 === 0xff) return true; // multicast
  return false;
};

/** Is the address outside the public internet (or not an address at all)? */
export const isBlockedIp = (ip: string): boolean => {
  const kind = net.isIP(ip.replace(/^\[|\]$/g, '').replace(/%.*$/, ''));
  if (kind === 4) return blockedV4(ip);
  if (kind === 6) return blockedV6(ip);
  return true;
};

const BLOCKED_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa)$/i;

/** Parses and checks a URL before any request (scheme, port, credentials, host name / literal address). */
export const checkUrl = (raw: string | URL): URL => {
  let u: URL;
  try {
    u = typeof raw === 'string' ? new URL(raw) : new URL(raw.href);
  } catch {
    throw new SafeFetchError('BAD_URL', String(raw));
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SafeFetchError('BAD_URL', u.href);
  if (u.username || u.password) throw new SafeFetchError('BAD_URL', u.href);
  if (u.port && u.port !== '80' && u.port !== '443') throw new SafeFetchError('BLOCKED_HOST', u.href);
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host.endsWith('.')) throw new SafeFetchError('BAD_URL', u.href);
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new SafeFetchError('BLOCKED_HOST', u.href);
  } else if (BLOCKED_NAME.test(host) || !host.includes('.')) {
    throw new SafeFetchError('BLOCKED_HOST', u.href);
  }
  u.hash = '';
  return u;
};

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type Resolver = (host: string) => Promise<ResolvedAddress[]>;

const systemResolver: Resolver = async (host) => (await dns.lookup(host, { all: true, verbatim: true })).map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));

/** Resolves a host; every answer must be public (one private answer blocks the host). */
export const resolvePublic = async (host: string, resolver: Resolver = systemResolver): Promise<ResolvedAddress> => {
  const bare = host.replace(/^\[|\]$/g, '');
  const kind = net.isIP(bare);
  if (kind) {
    if (isBlockedIp(bare)) throw new SafeFetchError('BLOCKED_HOST', host);
    return { address: bare, family: kind === 6 ? 6 : 4 };
  }
  let list: ResolvedAddress[];
  try {
    list = await resolver(bare);
  } catch {
    throw new SafeFetchError('DNS_FAILED', host);
  }
  if (!list.length) throw new SafeFetchError('DNS_FAILED', host);
  if (list.some((a) => isBlockedIp(a.address))) throw new SafeFetchError('BLOCKED_HOST', host);
  return list[0];
};

// ─── Requests ───────────────────────────────────────────────────────────────

export interface RawResponse {
  status: number;
  location: string | null;
  contentType: string;
  body: string;
  truncated: boolean;
}

export interface RequestOptions {
  timeoutMs: number;
  maxBytes: number;
  accept: string;
}

/** One GET to a checked URL over a pinned, checked address. Replaceable in tests. */
export type Transport = (url: URL, address: ResolvedAddress, o: RequestOptions) => Promise<RawResponse>;

const charsetOf = (contentType: string) => {
  const m = contentType.match(/charset=["']?([\w-]+)/i);
  const cs = (m?.[1] ?? 'utf-8').toLowerCase();
  return cs === 'iso-8859-1' || cs === 'latin1' || cs === 'windows-1252' || cs === 'cp1252' ? 'windows-1252' : cs === 'iso-8859-15' ? 'iso-8859-15' : 'utf-8';
};

const decodeBody = (buf: Buffer, contentType: string) => {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
};

export const nodeTransport: Transport = (url, address, o) =>
  new Promise<RawResponse>((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    // Pinned lookup: the connection goes to the address checked above, whatever DNS answers now.
    const lookup = (_h: string, opts: { all?: boolean } | undefined, cb: (...args: unknown[]) => void) => {
      if (opts?.all) cb(null, [{ address: address.address, family: address.family }]);
      else cb(null, address.address, address.family);
    };
    const req = mod.request(
      {
        protocol: url.protocol,
        hostname: host,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        agent: false, // no shared sockets, no cookie jar (Node keeps none anyway)
        lookup: lookup as unknown as net.LookupFunction,
        servername: net.isIP(host) ? undefined : host,
        headers: {
          'User-Agent': BOT_USER_AGENT,
          Accept: o.accept,
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.6',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === 'string' ? res.headers.location : null;
        const contentType = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400 && location) {
          res.resume();
          finish(() => resolve({ status, location, contentType, body: '', truncated: false }));
          return;
        }
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        let stream: Readable = res;
        if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        const end = (truncated: boolean) => finish(() => resolve({ status, location, contentType, body: decodeBody(Buffer.concat(chunks), contentType), truncated }));
        stream.on('data', (c: Buffer) => {
          if (done) return;
          const room = o.maxBytes - size;
          if (c.length >= room) {
            chunks.push(c.subarray(0, Math.max(0, room)));
            size = o.maxBytes;
            end(true);
            req.destroy();
            return;
          }
          chunks.push(c);
          size += c.length;
        });
        stream.on('end', () => end(false));
        stream.on('error', (err) => finish(() => reject(err)));
      },
    );
    const timer = setTimeout(() => {
      finish(() => reject(new SafeFetchError('TIMEOUT', url.href)));
      req.destroy();
    }, o.timeoutMs);
    req.on('error', (err) => finish(() => reject(err instanceof SafeFetchError ? err : new SafeFetchError('NETWORK', url.href))));
    req.end();
  });

export interface SafeGetOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
  /** Called before every request (first URL and each redirect hop): robots.txt, rate limits. false = stop (POLICY). */
  beforeRequest?: (url: URL) => Promise<boolean>;
  resolver?: Resolver;
  transport?: Transport;
}

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
  /** Every URL requested, in order (the first is the one asked for). */
  hops: string[];
}

export const safeGet = async (raw: string, o: SafeGetOptions = {}): Promise<SafeResponse> => {
  const opts: RequestOptions = { timeoutMs: o.timeoutMs ?? 10_000, maxBytes: o.maxBytes ?? 2 * 1024 * 1024, accept: o.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' };
  const transport = o.transport ?? nodeTransport;
  const maxRedirects = o.maxRedirects ?? 5;
  let url = checkUrl(raw);
  const hops: string[] = [];
  for (let i = 0; i <= maxRedirects; i++) {
    if (o.beforeRequest && !(await o.beforeRequest(url))) throw new SafeFetchError('POLICY', url.href);
    const address = await resolvePublic(url.hostname, o.resolver);
    hops.push(url.href);
    const res = await transport(url, address, opts);
    if (res.status >= 300 && res.status < 400 && res.location) {
      let next: URL;
      try {
        next = new URL(res.location, url);
      } catch {
        throw new SafeFetchError('BAD_URL', res.location);
      }
      url = checkUrl(next);
      continue;
    }
    return { url: url.href, status: res.status, contentType: res.contentType, body: res.body, truncated: res.truncated, hops };
  }
  throw new SafeFetchError('TOO_MANY_REDIRECTS', url.href);
};
