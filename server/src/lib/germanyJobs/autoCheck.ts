import { GERMAN_LEVELS, canonicalProfession, germanRank, professionSimilarity, type GermanLevel } from '../matching.js';

/**
 * Automatic check of an "apply via Triad Vision" application before it is sent to the employer (pure, no
 * database; lib/germanyJobs/autoSend.ts collects the inputs). Conditions:
 *   ACCOUNT        the applicant has a client account (profile, CV and passport live there)
 *   CV             an uploaded CV or a saved / attached Lebenslauf
 *   GERMAN_LEVEL   the client's level meets the listing's requirement when it is stated, otherwise at least A2
 *   PROFESSION     the client's profession (form or profile) matches the listing title (lib/matching synonyms)
 *   PASSPORT       passport data (number) filled
 *   PHONE / EMAIL  contact data filled
 * Rule changes here change who is sent automatically: keep tests/unit/externalAutoCheck.test.ts in step.
 */

export const AUTO_MISSING_CODES = ['ACCOUNT', 'CV', 'GERMAN_LEVEL', 'PROFESSION', 'PASSPORT', 'PHONE', 'EMAIL'] as const;
export type AutoMissing = (typeof AUTO_MISSING_CODES)[number];

/** Level asked for when the listing states none. */
export const DEFAULT_REQUIRED_GERMAN: GermanLevel = 'A2';

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

/** The client's level meets `required` (null = not stated → the default minimum A2). */
export const meetsGerman = (level: string | null | undefined, required: GermanLevel | null) => germanRank(level) >= germanRank(required ?? DEFAULT_REQUIRED_GERMAN);

/**
 * Does any of the client's professions fit the listing title? Same canonical profession or same family (driver ↔
 * courier) counts; unknown titles fall back to shared words. No title = cannot be checked = passes.
 */
export const professionMatches = (professions: (string | null | undefined)[], title: string | null | undefined) => {
  if (!title || !title.trim()) return true;
  const own = professions.filter((p): p is string => !!p && !!p.trim());
  if (!own.length) return false;
  // Gender suffixes and contract words in German titles carry no profession.
  const cleanTitle = title.replace(/\((?:m|w|d|f|x|div)(?:\s*\/\s*(?:m|w|d|f|x|div))*\)/gi, ' ');
  return own.some((p) => professionSimilarity(p, cleanTitle) >= 0.5 || professionSimilarity(cleanTitle, p) >= 0.5);
};

export interface AutoCheckInput {
  hasAccount: boolean;
  hasCv: boolean;
  /** Best known level (profile or form). */
  germanLevel: string | null;
  /** Listing requirement (parseGermanRequirement), null = not stated. */
  requiredGerman: GermanLevel | null;
  professions: (string | null | undefined)[];
  listingTitle: string | null;
  passport: boolean;
  phone: string | null | undefined;
  email: string | null | undefined;
}

export interface AutoCheckResult {
  ok: boolean;
  missing: AutoMissing[];
  /** Level the check asked for (listing requirement or the default). */
  requiredGerman: GermanLevel;
  /** Canonical profession found in the title (for the staff panel), if any. */
  listingProfession: string | null;
}

export const checkExternalApplication = (i: AutoCheckInput): AutoCheckResult => {
  const missing: AutoMissing[] = [];
  if (!i.hasAccount) missing.push('ACCOUNT');
  if (!i.hasCv) missing.push('CV');
  if (!meetsGerman(i.germanLevel, i.requiredGerman)) missing.push('GERMAN_LEVEL');
  if (!professionMatches(i.professions, i.listingTitle)) missing.push('PROFESSION');
  if (!i.passport) missing.push('PASSPORT');
  if (!i.phone || !i.phone.trim()) missing.push('PHONE');
  if (!i.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email.trim())) missing.push('EMAIL');
  return { ok: missing.length === 0, missing, requiredGerman: i.requiredGerman ?? DEFAULT_REQUIRED_GERMAN, listingProfession: canonicalProfession(i.listingTitle) };
};

/** "CV,PASSPORT" ⇄ ['CV', 'PASSPORT'] (unknown codes dropped). */
export const missingKey = (codes: readonly AutoMissing[]) => [...codes].sort().join(',');
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
