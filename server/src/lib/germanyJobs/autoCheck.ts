import { GERMAN_LEVELS, germanRank, type GermanLevel } from '../matching.js';

/**
 * What old "apply via Triad Vision" applications still use: the stored missing-data codes (AutoMissing / readMissing),
 * the German level a listing asks for and employer e-mail addresses found in listing data. The automatic check itself
 * (account / CV / level / profession / passport conditions) was removed with the retired sending.
 */

export const AUTO_MISSING_CODES = ['ACCOUNT', 'CV', 'GERMAN_LEVEL', 'PROFESSION', 'PASSPORT', 'PHONE', 'EMAIL'] as const;
export type AutoMissing = (typeof AUTO_MISSING_CODES)[number];

const LEVEL_RE = /\b([ABC][12])\b/g;
const GERMAN_WORD = /deutsch|german|sprachniveau|sprachkenntnis|немецк/i;

/**
 * German level a listing asks for, from its title / text: "Deutsch B1", "Deutschkenntnisse (mind. B2)",
 * "B1-Niveau Deutsch", "gute Deutschkenntnisse" ≈ B1, "sehr gute / fließende" ≈ B2, "Grundkenntnisse" ≈ A2,
 * "keine Deutschkenntnisse erforderlich" = none. null = not stated. With several levels the lowest near a German
 * word wins ("Deutsch A2–B1" = A2).
 */
export const parseGermanRequirement = (text: string | null | undefined): GermanLevel | null => {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ');
  // Explicit CEFR levels close to a German word (within ~40 characters either side; "mind. B2" keeps its dot).
  const found: GermanLevel[] = [];
  for (const m of t.matchAll(LEVEL_RE)) {
    const at = m.index ?? 0;
    if (GERMAN_WORD.test(t.slice(Math.max(0, at - 40), at + 40))) found.push(m[1].toUpperCase() as GermanLevel);
  }
  if (found.length) return found.sort((a, b) => germanRank(a) - germanRank(b))[0];
  const f = t.toLowerCase();
  if (/(keine|ohne)\s+(deutsch|sprach)kenntnisse|deutsch(kenntnisse)?\s+(nicht|keine?)\s+(erforderlich|notwendig|nötig|vorausgesetzt)|no german (required|needed|necessary)|german (is )?not required/.test(f)) return 'none';
  if (/(sehr gute|fließende|fliessende|verhandlungssichere|exzellente|ausgezeichnete)\s+deutschkenntnisse|deutsch\s+(fließend|fliessend|verhandlungssicher)|fließend(es)? deutsch|fluent (in )?german|excellent german|business fluent german/.test(f)) return 'B2';
  if (/(gute|solide)\s+deutschkenntnisse|deutsch\s+in\s+wort\s+und\s+schrift|good (command of )?german|good german/.test(f)) return 'B1';
  if (/grundkenntnisse|deutsch(kenntnisse)?\s+(von )?vorteil|basic german|basic knowledge of german|erste deutschkenntnisse/.test(f)) return 'A2';
  return null;
};

/** "CV,PASSPORT" → ['CV', 'PASSPORT'] (unknown codes dropped). */
export const readMissing = (s: string | null | undefined): AutoMissing[] =>
  (s ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c): c is AutoMissing => (AUTO_MISSING_CODES as readonly string[]).includes(c));

export const isGermanLevel = (s: string | null | undefined): s is GermanLevel => (GERMAN_LEVELS as readonly string[]).includes(s ?? '');

// ─── Employer e-mail addresses in listing data ──────────────────────────────

/** Job boards / aggregators: an address there is never the employer's (we would mail the board). */
const JOB_BOARD_DOMAINS = [
  'arbeitnow.com', 'careerjet.de', 'careerjet.com', 'jooble.org', 'jooble.com', 'adzuna.de', 'adzuna.com', 'indeed.com', 'indeed.de',
  'stepstone.de', 'stepstone.com', 'arbeitsagentur.de', 'xing.com', 'linkedin.com', 'monster.de', 'monster.com', 'kleinanzeigen.de',
  'meinestadt.de', 'jobware.de', 'stellenanzeigen.de', 'kimeta.de', 'jobbörse.de', 'glassdoor.de', 'glassdoor.com', 'yourfirm.de',
  'triad-vision.de',
];
const NO_REPLY = /^(no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster|abuse)@/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;

/** Registrable-ish domain: the last two labels (good enough for .de / .com employers; co.uk style is rare here). */
export const baseDomain = (host: string) => host.toLowerCase().replace(/^www\./, '').split('.').slice(-2).join('.');

const isJobBoard = (domain: string) => JOB_BOARD_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));

/** Usable addresses in a text (lower-cased, unique, no job boards / no-reply / obvious placeholders). */
export const extractEmails = (text: string | null | undefined): string[] => {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].replace(/\.+$/, '').toLowerCase();
    const domain = e.split('@')[1] ?? '';
    if (e.length > 190 || NO_REPLY.test(e) || isJobBoard(domain) || /example\.(com|org|de)$/.test(domain)) continue;
    out.add(e);
  }
  return [...out];
};

/**
 * Employer address from text the applicant pasted (the listing link's description): trusted only when the address
 * belongs to the site of the listing itself (careers page of the employer), never for job boards, so the form can
 * not be used to mail CVs to arbitrary addresses in our name.
 */
export const employerEmailFromText = (text: string | null | undefined, listingUrl: string): string | null => {
  let host = '';
  try {
    host = new URL(listingUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || isJobBoard(baseDomain(host))) return null;
  const site = baseDomain(host);
  return extractEmails(text).find((e) => baseDomain(e.split('@')[1] ?? '') === site) ?? null;
};
