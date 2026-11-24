import { APPLY_WORDS, HR_LOCAL, type Candidate } from './domains.js';

/**
 * E-mail addresses in a listing page (pure, no network; tests/unit/employerEmailDiscovery.test.ts):
 *   - JSON-LD JobPosting: applicationContact.email, hiringOrganization.email / contactPoint.email (+ the description)
 *   - mailto: links
 *   - addresses in the visible text, also obfuscated: "name [at] firma [dot] de", "name(at)firma.de",
 *     "name at firma dot de", "name @ firma.de", HTML entities (&#64; &commat; …)
 * Candidates are ranked: JSON-LD contact > JSON-LD organisation > mailto > text; applications mailboxes
 * (bewerbung@, jobs@, karriere@, personal@, hr@, recruiting@ …) and addresses near "Bewerbung", "Ansprechpartner",
 * "Personal", "HR", "Karriere" rank higher. Acceptance (employer domain) is decided in domains.ts.
 */

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', commat: '@', period: '.', at: '@', dot: '.', hyphen: '-', lowbar: '_', plus: '+', shy: '' };

export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });

/** Visible-ish text: scripts, styles and comments removed, tags → spaces, entities decoded. */
export const htmlToText = (html: string) =>
  decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[​-‍﻿]/g, '')
    .replace(/[ \t\f\v ]+/g, ' ');

// "@" and "." in plain and obfuscated forms.
const AT = String.raw`(?:\s*(?:\[\s*(?:at|ät|@)\s*\]|\(\s*(?:at|ät|@)\s*\)|\{\s*(?:at|ät|@)\s*\}|<\s*at\s*>)\s*|\s+(?:at|ät)\s+|\s*@\s*)`;
const DOT = String.raw`(?:\s*(?:\[\s*(?:dot|punkt|\.)\s*\]|\(\s*(?:dot|punkt|\.)\s*\)|\{\s*(?:dot|punkt)\s*\})\s*|\s+(?:dot|punkt)\s+|\.)`;
const ADDRESS = new RegExp(String.raw`([a-z0-9][a-z0-9._%+-]{0,63})${AT}((?:[a-z0-9-]{1,63}${DOT}){1,4}[a-z]{2,24})(?![a-z0-9-])`, 'gi');
const DOT_SPLIT = new RegExp(DOT, 'gi');

const normalizeAddress = (local: string, domain: string) => `${local.replace(/\.+$/, '')}@${domain.split(DOT_SPLIT).filter(Boolean).join('.')}`.toLowerCase();

const around = (text: string, at: number, len: number, radius = 140) => text.slice(Math.max(0, at - radius), at + len + radius).replace(/\s+/g, ' ').trim();

/** Addresses in a text, plain and obfuscated, with the text around each. */
export const textAddresses = (text: string): { email: string; context: string }[] => {
  const out: { email: string; context: string }[] = [];
  for (const m of text.matchAll(ADDRESS)) {
    const local = m[1];
    // "Apply at Firma dot de" without a plausible local part is prose, not an address.
    // Spelled-out "name at firma dot de" without brackets: only a mailbox-like name ("karriere at …", "m.weber at …"),
    // never prose ("bewerben Sie sich at Firma dot com").
    if (!m[0].includes('@') && !/[[({<]/.test(m[0]) && !HR_LOCAL.test(local) && !/[._-]/.test(local)) continue;
    out.push({ email: normalizeAddress(local, m[2]), context: around(text, m.index ?? 0, m[0].length) });
  }
  return out;
};

// ─── JSON-LD ────────────────────────────────────────────────────────────────

export interface JsonLdFacts {
  contacts: string[];
  orgEmails: string[];
  /** hiringOrganization url / sameAs (the company's own site, if any). */
  orgUrls: string[];
  orgName: string | null;
  description: string;
}

const asArray = <T>(v: T | T[] | undefined | null): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const mailOf = (v: unknown) => str(v).replace(/^mailto:/i, '');

export const jsonLdFacts = (html: string): JsonLdFacts => {
  const facts: JsonLdFacts = { contacts: [], orgEmails: [], orgUrls: [], orgName: null, description: '' };
  const blocks = html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi);
  const postings: Record<string, unknown>[] = [];
  const walk = (node: unknown, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const o = node as Record<string, unknown>;
    if (asArray(o['@type'] as string | string[]).some((t) => String(t).toLowerCase() === 'jobposting')) postings.push(o);
    if (o['@graph']) walk(o['@graph'], depth + 1);
  };
  for (const b of blocks) {
    const raw = b[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').replace(/^\s*<!--|-->\s*$/g, '');
    try {
      walk(JSON.parse(raw));
    } catch {
      /* broken JSON-LD: ignored */
    }
  }
  for (const p of postings) {
    for (const c of asArray(p.applicationContact as unknown)) {
      const e = mailOf((c as Record<string, unknown>)?.email);
      if (e) facts.contacts.push(e.toLowerCase());
    }
    for (const org of asArray(p.hiringOrganization as unknown)) {
      if (!org || typeof org !== 'object') continue;
      const o = org as Record<string, unknown>;
      const e = mailOf(o.email);
      if (e) facts.orgEmails.push(e.toLowerCase());
      for (const cp of asArray(o.contactPoint as unknown)) {
        const ce = mailOf((cp as Record<string, unknown>)?.email);
        if (ce) facts.orgEmails.push(ce.toLowerCase());
      }
      for (const u of [...asArray(o.url as unknown), ...asArray(o.sameAs as unknown)]) if (str(u)) facts.orgUrls.push(str(u));
      facts.orgName ??= str(o.name) || null;
    }
    const d = str(p.description);
    if (d) facts.description += ` ${htmlToText(decodeEntities(d))}`;
  }
  return facts;
};

// ─── Candidates + ranking ───────────────────────────────────────────────────

const SOURCE_SCORE: Record<Candidate['source'], number> = { 'jsonld-contact': 60, 'jsonld-org': 40, mailto: 25, text: 10 };

export interface RankedCandidate extends Candidate {
  score: number;
}

export const scoreCandidate = (c: Candidate, seen = 1) => {
  const local = c.email.split('@')[0];
  let s = SOURCE_SCORE[c.source];
  if (HR_LOCAL.test(local)) s += 30;
  else if (/^[a-z]+[._-][a-z]+$/.test(local)) s += 5; // a named contact person
  if (APPLY_WORDS.test(c.context)) s += 20;
  else if (/kontakt|contact|ansprechpartner/i.test(c.context)) s += 5;
  return s + Math.min(10, (seen - 1) * 2);
};

/** Every address on the page, best first (unique by address; the best source / context is kept). */
export const extractCandidates = (html: string): RankedCandidate[] => {
  const found: Candidate[] = [];
  const ld = jsonLdFacts(html);
  for (const e of ld.contacts) found.push({ email: e, source: 'jsonld-contact', context: 'JSON-LD applicationContact' });
  for (const e of ld.orgEmails) found.push({ email: e, source: 'jsonld-org', context: 'JSON-LD hiringOrganization' });
  for (const a of textAddresses(ld.description)) found.push({ email: a.email, source: 'text', context: a.context });

  for (const m of html.matchAll(/href\s*=\s*["']\s*mailto:([^"'?#]+)/gi)) {
    let addr = decodeEntities(m[1]).trim();
    try {
      addr = decodeURIComponent(addr);
    } catch {
      /* keep as is */
    }
    const at = m.index ?? 0;
    const ctx = htmlToText(html.slice(Math.max(0, at - 600), at + 400)).replace(/\s+/g, ' ').trim().slice(-400);
    for (const one of addr.split(/[,;]/)) if (one.trim()) found.push({ email: one.trim().toLowerCase(), source: 'mailto', context: ctx });
  }
  for (const a of textAddresses(htmlToText(html))) found.push({ email: a.email, source: 'text', context: a.context });

  const by = new Map<string, { best: RankedCandidate; seen: number }>();
  for (const c of found) {
    const prev = by.get(c.email);
    const seen = (prev?.seen ?? 0) + 1;
    const score = scoreCandidate(c, 1);
    if (!prev || score > prev.best.score) by.set(c.email, { best: { ...c, score }, seen });
    else prev.seen = seen;
  }
  return [...by.values()].map(({ best, seen }) => ({ ...best, score: best.score + Math.min(10, (seen - 1) * 2) })).sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
};

// ─── Navigation helpers (no JS is ever run) ─────────────────────────────────

/**
 * A redirect written into a small interstitial page (tracking links): <meta http-equiv="refresh" content="0;url=…">
 * or a literal `location.href = "…"` / `location.replace("…")`. Read as text, never executed.
 */
export const softRedirect = (html: string, base: string): string | null => {
  if (html.length > 30_000) return null;
  const meta = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']\s*\d*\s*;?\s*url\s*=\s*['"]?([^"'>\s]+)/i) ?? html.match(/<meta[^>]+content\s*=\s*["']\s*\d*\s*;\s*url\s*=\s*['"]?([^"'>\s]+)['"]?[^>]*http-equiv\s*=\s*["']?refresh/i);
  const js = html.match(/(?:window\.|document\.|top\.|self\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i) ?? html.match(/location\.(?:replace|assign)\(\s*["']([^"']+)["']\s*\)/i);
  const raw = meta?.[1] ?? js?.[1];
  if (!raw) return null;
  try {
    const u = new URL(decodeEntities(raw).replace(/\\\//g, '/'), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
};

/**
 * Same-site pages worth one more look when the listing page has no address: careers / jobs first, then contact,
 * then the Impressum (German sites must name an e-mail there).
 */
export const contactLinks = (html: string, base: string): string[] => {
  let baseHost = '';
  try {
    baseHost = new URL(base).hostname;
  } catch {
    return [];
  }
  const ranked: { url: string; rank: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const text = htmlToText(m[2]).toLowerCase();
    const href = decodeEntities(m[1]);
    const probe = `${href.toLowerCase()} ${text}`;
    const rank = /bewerb|karriere|career|jobs?\b|stellen/.test(probe) ? 1 : /kontakt|contact/.test(probe) ? 2 : /impressum|imprint/.test(probe) ? 3 : 0;
    if (!rank) continue;
    try {
      const u = new URL(href, base);
      if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.hostname !== baseHost) continue;
      u.hash = '';
      ranked.push({ url: u.href, rank });
    } catch {
      /* not a URL */
    }
  }
  const seen = new Set<string>([base]);
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.url)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
};
