import dns from 'node:dns/promises';
import net from 'node:net';
import type { MailProvider } from '@prisma/client';
import { stalwartDomain, stalwartMailHost } from '../stalwart/config.js';
import { PROVIDERS } from './providers.js';

/**
 * "E-mail + password is enough": IMAP/SMTP settings for an address, for the workspace mail account dialog.
 *
 *   1. our own domain (STALWART_DOMAIN) → our Stalwart server, 993/465 implicit TLS
 *   2. well-known providers (Gmail, Outlook, Yandex, Mail.ru, iCloud, Yahoo, GMX, WEB.DE, T-Online)
 *   3. the domain's own autoconfig file (https://autoconfig.<domain>/mail/config-v1.1.xml)
 *   4. Mozilla's ISPDB (https://autoconfig.thunderbird.net/v1.1/<domain>)
 *
 * Steps 3 and 4 are fetched server-side with a short timeout, https only, no redirects, and step 3 only
 * when the host resolves to public addresses (the domain is user input). Results are cached for an hour.
 * The username is the full address unless the provider's file says otherwise.
 */

export type DiscoverySource = 'OWN' | 'PRESET' | 'AUTOCONFIG' | 'ISPDB' | 'NONE';

export interface DiscoveredSettings {
  source: DiscoverySource;
  domain: string;
  provider: MailProvider;
  /** Key of the hint the client shows (mail.settings.accounts.hint.<key>), e.g. GMAIL, ICLOUD, OWN, CUSTOM. */
  hint: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  /** true = implicit TLS (465), false = STARTTLS (587). */
  smtpSecure: boolean;
  username: string;
}

type Preset = Omit<DiscoveredSettings, 'source' | 'domain' | 'username'> & { domains: string[] };

/** Providers that have no own MailProvider value: stored as CUSTOM with their servers filled in. */
const EXTRA_PRESETS: Preset[] = [
  { provider: 'CUSTOM', hint: 'ICLOUD', imapHost: 'imap.mail.me.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.mail.me.com', smtpPort: 587, smtpSecure: false, domains: ['icloud.com', 'me.com', 'mac.com'] },
  { provider: 'CUSTOM', hint: 'YAHOO', imapHost: 'imap.mail.yahoo.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465, smtpSecure: true, domains: ['yahoo.com', 'yahoo.de', 'yahoo.co.uk', 'yahoo.fr', 'ymail.com', 'rocketmail.com'] },
  { provider: 'CUSTOM', hint: 'GMX', imapHost: 'imap.gmx.net', imapPort: 993, imapSecure: true, smtpHost: 'mail.gmx.net', smtpPort: 465, smtpSecure: true, domains: ['gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch'] },
  { provider: 'CUSTOM', hint: 'WEBDE', imapHost: 'imap.web.de', imapPort: 993, imapSecure: true, smtpHost: 'smtp.web.de', smtpPort: 587, smtpSecure: false, domains: ['web.de'] },
  { provider: 'CUSTOM', hint: 'TONLINE', imapHost: 'secureimap.t-online.de', imapPort: 993, imapSecure: true, smtpHost: 'securesmtp.t-online.de', smtpPort: 465, smtpSecure: true, domains: ['t-online.de', 'magenta.de'] },
];

/** Extra domains of the built-in providers (the dropdown presets list the main ones). */
const EXTRA_DOMAINS: Partial<Record<MailProvider, string[]>> = {
  OUTLOOK: ['outlook.de', 'hotmail.de', 'hotmail.co.uk', 'live.de', 'live.co.uk', 'msn.com', 'outlook.com.tr'],
  YANDEX: ['yandex.az', 'yandex.by', 'yandex.kz', 'yandex.ua', 'yandex.com.tr'],
  MAILRU: ['internet.ru'],
};

const PRESETS: Preset[] = [
  ...PROVIDERS.filter((p) => p.provider !== 'CUSTOM').map(
    (p): Preset => ({
      provider: p.provider,
      hint: p.provider,
      imapHost: p.imapHost,
      imapPort: p.imapPort,
      imapSecure: p.imapSecure,
      smtpHost: p.smtpHost,
      smtpPort: p.smtpPort,
      smtpSecure: p.smtpSecure,
      domains: [...p.domains, ...(EXTRA_DOMAINS[p.provider] ?? [])],
    }),
  ),
  ...EXTRA_PRESETS,
];

const DOMAIN_RE = /^(?=.{3,190}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const emailDomain = (email: string) => {
  const d = email.trim().toLowerCase().split('@')[1] ?? '';
  return DOMAIN_RE.test(d) ? d : '';
};

/** Our own server (always the full address as the login). */
export const ownSettings = (email: string): DiscoveredSettings => {
  const host = stalwartMailHost();
  return { source: 'OWN', domain: stalwartDomain(), provider: 'CUSTOM', hint: 'OWN', imapHost: host, imapPort: 993, imapSecure: true, smtpHost: host, smtpPort: 465, smtpSecure: true, username: email.trim().toLowerCase() };
};

/** Settings without any network call: own domain or a known provider; null otherwise. */
export const knownSettings = (email: string): DiscoveredSettings | null => {
  const domain = emailDomain(email);
  if (!domain) return null;
  if (domain === stalwartDomain()) return ownSettings(email);
  const p = PRESETS.find((x) => x.domains.includes(domain));
  if (!p) return null;
  const { domains: _domains, ...rest } = p;
  return { ...rest, source: 'PRESET', domain, username: email.trim().toLowerCase() };
};

// ─── Autoconfig XML (Thunderbird format) ─────────────────────────────

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`, 'i'))?.[1] ?? '';

interface Server {
  host: string;
  port: number;
  socket: string;
  username: string;
}

const servers = (xml: string, element: 'incomingServer' | 'outgoingServer', type: string): Server[] => {
  const re = new RegExp(`<${element}\\b[^>]*\\btype=["']${type}["'][^>]*>([\\s\\S]*?)</${element}>`, 'gi');
  const out: Server[] = [];
  for (const m of xml.matchAll(re)) {
    const body = m[1] ?? '';
    const host = tag(body, 'hostname').toLowerCase();
    const port = Number(tag(body, 'port'));
    if (!host || !/^[a-z0-9.-]{1,190}$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) continue;
    out.push({ host, port, socket: tag(body, 'socketType').toUpperCase(), username: tag(body, 'username') });
  }
  return out;
};

const fillUser = (template: string, email: string) => {
  const e = email.trim().toLowerCase();
  if (!template) return e;
  const out = template.replace(/%EMAILADDRESS%/gi, e).replace(/%EMAILLOCALPART%/gi, e.split('@')[0] ?? '').replace(/%EMAILDOMAIN%/gi, e.split('@')[1] ?? '');
  return /%[A-Z]+%/i.test(out) ? e : out;
};

/** Parses a config-v1.1.xml: prefers implicit TLS, accepts STARTTLS, never plain text. null if unusable. */
export const parseAutoconfigXml = (xml: string, email: string): Omit<DiscoveredSettings, 'source' | 'domain' | 'provider' | 'hint'> | null => {
  const rank = (s: Server) => (s.socket === 'SSL' ? 0 : s.socket === 'STARTTLS' ? 1 : 9);
  const imap = servers(xml, 'incomingServer', 'imap')
    .filter((s) => rank(s) < 9)
    .sort((a, b) => rank(a) - rank(b))[0];
  const smtp = servers(xml, 'outgoingServer', 'smtp')
    .filter((s) => rank(s) < 9)
    .sort((a, b) => rank(a) - rank(b))[0];
  // IMAP with STARTTLS is not supported by the sync client: implicit TLS only for incoming mail.
  if (!imap || imap.socket !== 'SSL' || !smtp) return null;
  return {
    imapHost: imap.host,
    imapPort: imap.port,
    imapSecure: true,
    smtpHost: smtp.host,
    smtpPort: smtp.port,
    smtpSecure: smtp.socket === 'SSL',
    username: fillUser(imap.username, email),
  };
};

// ─── Fetching ────────────────────────────────────────────────────────

/** Loopback, private, link-local, CGNAT, multicast and reserved ranges (IPv4 and IPv6). */
export const isPrivateIp = (ip: string): boolean => {
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
};

export interface DiscoveryDeps {
  fetch: typeof fetch;
  /** All addresses of a host name. */
  resolve: (host: string) => Promise<string[]>;
  timeoutMs: number;
}

const defaultDeps = (): DiscoveryDeps => ({
  fetch: (...args) => fetch(...args),
  resolve: async (host) => (await dns.lookup(host, { all: true })).map((r) => r.address),
  timeoutMs: 4000,
});

const getXml = async (url: string, deps: DiscoveryDeps, checkHost: boolean): Promise<string | null> => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    if (checkHost) {
      const ips = await deps.resolve(u.hostname);
      if (!ips.length || ips.some(isPrivateIp)) return null;
    }
    const res = await deps.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(deps.timeoutMs), headers: { accept: 'application/xml, text/xml' } });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200_000 ? null : text;
  } catch {
    return null;
  }
};

/** Per domain: which source answered and its XML (null = nothing found), for an hour. */
const cache = new Map<string, { at: number; hit: { source: DiscoverySource; xml: string } | null }>();
const CACHE_MS = 60 * 60 * 1000;
export const resetAutoconfigCache = () => cache.clear();

/** Remote lookup (domain autoconfig, then ISPDB) for a domain that is neither ours nor a known provider. */
const remoteSettings = async (email: string, domain: string, deps: DiscoveryDeps): Promise<DiscoveredSettings | null> => {
  const build = (hit: { source: DiscoverySource; xml: string }) => {
    const parsed = parseAutoconfigXml(hit.xml, email);
    return parsed ? { ...parsed, source: hit.source, domain, provider: 'CUSTOM' as const, hint: 'CUSTOM' } : null;
  };
  const cached = cache.get(domain);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.hit ? build(cached.hit) : null;
  const tries: { source: DiscoverySource; url: string; checkHost: boolean }[] = [
    { source: 'AUTOCONFIG', url: `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`, checkHost: true },
    { source: 'ISPDB', url: `https://autoconfig.thunderbird.net/v1.1/${domain}`, checkHost: false },
  ];
  for (const t of tries) {
    const xml = await getXml(t.url, deps, t.checkHost);
    const value = xml ? build({ source: t.source, xml }) : null;
    if (xml && value) {
      cache.set(domain, { at: Date.now(), hit: { source: t.source, xml } });
      return value;
    }
  }
  cache.set(domain, { at: Date.now(), hit: null });
  return null;
};

/** Best settings for an address; source NONE (empty hosts) when nothing was found. */
export const discoverMailSettings = async (email: string, deps: Partial<DiscoveryDeps> = {}): Promise<DiscoveredSettings> => {
  const e = email.trim().toLowerCase();
  const domain = emailDomain(e);
  const known = knownSettings(e);
  if (known) return known;
  const remote = domain ? await remoteSettings(e, domain, { ...defaultDeps(), ...deps }) : null;
  if (remote) return remote;
  return { source: 'NONE', domain, provider: 'CUSTOM', hint: 'CUSTOM', imapHost: '', imapPort: 993, imapSecure: true, smtpHost: '', smtpPort: 465, smtpSecure: true, username: e };
};
