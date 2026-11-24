/**
 * Which e-mail addresses found on a listing page belong to the employer (pure, unit-tested in
 * tests/unit/employerEmailDiscovery.test.ts). An address is accepted only when its domain is the employer's:
 *   - the registrable domain of the page itself, when that page is not a job board / ATS / provider, or
 *   - a domain that matches the listing's company name (token overlap) — the only way on a board / ATS page.
 * Job boards, ATS vendors and provider domains are never accepted, nor no-reply / privacy / technical mailboxes.
 */

/** Second-level public suffixes seen in employer domains (everything else: the last two labels). */
const MULTI_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.at', 'or.at', 'ac.at', 'gv.at', 'com.tr', 'org.tr', 'gen.tr', 'com.au', 'co.nz', 'co.jp', 'com.pl', 'com.ua', 'org.ua', 'co.za', 'com.br', 'com.cn', 'co.il', 'co.in', 'com.az', 'org.az']);

/** "karriere.nord-logistik.de" → "nord-logistik.de"; "jobs.example.co.uk" → "example.co.uk". */
export const registrableDomain = (host: string) => {
  const labels = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return MULTI_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
};

/**
 * Job boards, aggregators, ATS vendors, provider tracking hosts and social networks. Their own addresses are never
 * the employer's; a page on them may still carry the company's own address (accepted only by company-name match).
 */
export const BOARD_DOMAINS = [
  // providers + tracking
  'careerjet.de', 'careerjet.com', 'careerjet.at', 'careerjet.ch', 'jobviewtrack.com', 'jooble.org', 'jooble.com', 'adzuna.de', 'adzuna.com', 'adzuna.co.uk', 'arbeitnow.com',
  // boards / aggregators
  'indeed.com', 'indeed.de', 'stepstone.de', 'stepstone.com', 'stepstone.at', 'arbeitsagentur.de', 'linkedin.com', 'xing.com', 'monster.de', 'monster.com', 'kleinanzeigen.de',
  'meinestadt.de', 'jobware.de', 'stellenanzeigen.de', 'kimeta.de', 'glassdoor.de', 'glassdoor.com', 'yourfirm.de', 'jobs.de', 'kununu.com', 'heyjobs.co', 'heyjobs.de',
  'jobvector.de', 'stellenwerk.de', 'absolventa.de', 'praktikum.info', 'azubiyo.de', 'ausbildung.de', 'aubi-plus.de', 'jobbörse.de', 'stellenmarkt.de', 'jobanzeiger.de',
  'jobsuche.de', 'jobmensa.de', 'hokify.de', 'hokify.at', 'talent.com', 'jobrapido.com', 'jobted.de', 'jobijoba.de', 'whatjobs.com', 'jobleads.com', 'stellenonline.de',
  'medi-jobs.de', 'pflegejobs.de', 'kalaydo.de', 'regiojob.de', 'jobstairs.de', 'gigajob.com', 'trovit.de', 'mitula.de', 'neuvoo.de', 'careerbuilder.com', 'joblift.de',
  'jobninja.com', 'join.com', 'workwise.io', 'get-in-it.de', 'jobteaser.com', 'europa.eu', 'make-it-in-germany.com',
  // ATS vendors (their pages often show the company's own address — that is matched by company name)
  'softgarden.io', 'softgarden.de', 'personio.de', 'personio.com', 'smartrecruiters.com', 'myworkdayjobs.com', 'workday.com', 'successfactors.com', 'successfactors.eu',
  'sapsf.com', 'sapsf.eu', 'greenhouse.io', 'lever.co', 'recruitee.com', 'dvinci.de', 'dvinci-easy.com', 'rexx-systems.com', 'rexx-recruitment.com', 'umantis.com',
  'onlyfy.jobs', 'onlyfy.com', 'prescreen.io', 'concludis.de', 'bewerbung.dvinci.de', 'jobbase.io', 'teamtailor.com', 'workable.com', 'bamboohr.com', 'jobvite.com',
  'icims.com', 'taleo.net', 'oraclecloud.com', 'csod.com', 'zohorecruit.com', 'zohorecruit.eu', 'pitchyou.de', 'coveto.de', 'perbit.com', 'haufe.com', 'ubivent.com',
  'jobposting.ch', 'heyrecruit.de', 'talentsconnect.com', 'kenjo.io', 'factorial.de', 'factorialhr.com', 'hrworks.de', 'b-ite.de', 'mysolution.de', 'jobs.ashbyhq.com', 'ashbyhq.com',
  // freemail / platforms (cannot prove the employer; a matching company name alone is not enough there)
  'gmail.com', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 'gmx.at', 't-online.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'yahoo.com', 'yahoo.de',
  'icloud.com', 'freenet.de', 'mail.de', 'posteo.de', 'aol.com', 'arcor.de', 'online.de', 'mail.ru', 'yandex.ru', 'proton.me', 'protonmail.com',
  'google.com', 'facebook.com', 'instagram.com', 'wixsite.com', 'wix.com', 'jimdo.com', 'jimdosite.com', 'sentry.io', 'sentry-next.wixpress.com', 'wixpress.com',
  'triad-vision.de',
];

const BOARD_SET = new Set(BOARD_DOMAINS);
export const isBoardDomain = (domainOrHost: string) => {
  const host = domainOrHost.toLowerCase().replace(/^www\./, '');
  if (BOARD_SET.has(host) || BOARD_SET.has(registrableDomain(host))) return true;
  return BOARD_DOMAINS.some((d) => host.endsWith(`.${d}`));
};

/** Provider redirect hosts: the link we were given by the provider's API (robots.txt is checked for the hops after it). */
export const isProviderHost = (host: string) => /(^|\.)(careerjet\.[a-z.]+|jobviewtrack\.com|jooble\.(org|com)|adzuna\.[a-z.]+)$/i.test(host);

/** Mailboxes that never take applications. */
const BAD_LOCAL = /^(no-?reply|do-?not-?reply|noreply|donotreply|mailer-daemon|postmaster|hostmaster|abuse|bounce[s]?|webmaster|admin|root|privacy|datenschutz|dsb|dpo|datenschutzbeauftragte[r]?|gdpr|dsgvo|data-?protection|newsletter|presse|press|media|marketing|werbung|unsubscribe|abmelden|rechnung|rechnungen|invoice|billing|buchhaltung|einkauf|purchasing|sales|vertrieb|shop|order|bestellung|support|service-?desk|it|security|compliance|legal|whistleblow\w*|hinweisgeber\w*)$/i;

/** Mailboxes that clearly take applications (ranked first). */
export const HR_LOCAL = /^(bewerbung(en)?|bewerber|jobs?|karriere|career[s]?|personal|personalabteilung|hr|recruiting|recruitment|recruiter|talent|stellen|ausbildung|azubi|application[s]?|apply|personalwesen|human-?resources)([._-].*)?$/i;

/** Words near an address that mark it as the applications contact. */
export const APPLY_WORDS = /bewerb|ansprechpartner|ansprechperson|personalabteilung|personalwesen|\bhr\b|human resources|karriere|recruit|application|apply|bewerbungsunterlagen|lebenslauf/i;

export const BAD_TLD = /\.(png|jpe?g|gif|svg|webp|ico|bmp|css|js|json|xml|pdf|php|html?|aspx?)$/i;

const EMAIL_SHAPE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]+\.[a-z]{2,24}$/;

export type RejectReason = 'SHAPE' | 'BAD_MAILBOX' | 'BOARD' | 'PLACEHOLDER' | 'NOT_EMPLOYER';

/** Address is unusable whatever the page (pure). null = may be used if the domain matches. */
export const mailboxRejection = (email: string): RejectReason | null => {
  const e = email.toLowerCase();
  if (e.length > 190 || !EMAIL_SHAPE.test(e) || BAD_TLD.test(e) || e.includes('..')) return 'SHAPE';
  const [local, domain] = e.split('@');
  if (BAD_LOCAL.test(local)) return 'BAD_MAILBOX';
  if (/(^|\.)(example|beispiel|domain|test|musterfirma|mustermann|ihre-firma|ihrefirma)\.(com|org|net|de)$/.test(domain) || /^(name|vorname\.nachname|max\.mustermann|ihre?\.?email|email|e-mail|your\.?name)$/.test(local)) return 'PLACEHOLDER';
  if (isBoardDomain(domain)) return 'BOARD';
  return null;
};

// ─── Company name ↔ domain ────────────────────────────────────────────────

const LEGAL_OR_FILLER = new Set([
  'gmbh', 'mbh', 'ag', 'kg', 'kgaa', 'co', 'ohg', 'ug', 'se', 'ek', 'gbr', 'eg', 'ev', 'inc', 'ltd', 'llc', 'plc', 'sa', 'sarl', 'bv', 'nv', 'haftungsbeschraenkt', 'und', 'and',
  'der', 'die', 'das', 'des', 'fuer', 'for', 'von', 'the', 'holding', 'group', 'gruppe', 'deutschland', 'germany', 'international', 'stiftung', 'verein', 'niederlassung',
  'zweigniederlassung', 'filiale', 'standort',
]);
/** Words many companies share: a match on them alone proves nothing. */
const GENERIC = new Set([
  'service', 'services', 'personal', 'personalservice', 'personaldienstleistungen', 'zeitarbeit', 'logistik', 'logistics', 'transport', 'pflege', 'bau', 'technik', 'industrie',
  'handel', 'klinik', 'klinikum', 'krankenhaus', 'hotel', 'stadt', 'gemeinde', 'jobs', 'karriere', 'solutions', 'systems', 'consulting', 'management', 'gesellschaft',
  'dienstleistungen', 'medical', 'care', 'nord', 'sued', 'west', 'ost', 'berlin', 'hamburg', 'muenchen', 'koeln', 'frankfurt', 'deutsche', 'german', 'energie', 'energy',
  'automotive', 'food', 'gastro', 'gastronomie', 'restaurant', 'elektro', 'metall', 'holz', 'reinigung', 'facility', 'security', 'sicherheit', 'immobilien', 'software', 'digital',
]);

export const translit = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

export const companyTokens = (company: string | null | undefined) =>
  translit(company ?? '')
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !LEGAL_OR_FILLER.has(t));

/** Does the e-mail / page domain belong to the company named in the listing (pure)? */
export const domainMatchesCompany = (domain: string, company: string | null | undefined) => {
  const tokens = companyTokens(company);
  if (!tokens.length) return false;
  const reg = registrableDomain(domain);
  const label = reg.split('.')[0] ?? '';
  const flat = label.replace(/-/g, '');
  if (flat.length < 2) return false;
  const joined = tokens.join('');
  // The whole name or its acronym ("Deutsche Bahn" → deutschebahn.de / db.de).
  if (flat === joined || (tokens.length >= 2 && flat === tokens.map((t) => t[0]).join('') && flat.length >= 2)) return true;
  // Domain label spelled out inside the name ("Lidl Vertriebs GmbH" ↔ lidl.de); short labels must be whole tokens.
  if (flat.length >= 4 && joined.includes(flat) && !GENERIC.has(flat)) return true;
  if (tokens.includes(flat) && !GENERIC.has(flat)) return true;
  const distinctive = tokens.filter((t) => t.length >= 3 && !GENERIC.has(t));
  const hits = tokens.filter((t) => t.length >= 3 && flat.includes(t));
  // A distinctive name word in the domain ("Rewe Markt GmbH" ↔ rewe-group.com), or two name words.
  if (distinctive.some((t) => t.length >= 4 && flat.includes(t))) return true;
  return hits.length >= 2;
};

export interface Candidate {
  email: string;
  /** mailto | jsonld-contact | jsonld-org | text */
  source: 'mailto' | 'jsonld-contact' | 'jsonld-org' | 'text';
  /** Text around the address (for staff and ranking). */
  context: string;
}

export interface AcceptContext {
  /** Final page URL (after redirects). */
  pageUrl: string;
  company: string | null;
  /** The company's own site(s), e.g. JSON-LD hiringOrganization.url / sameAs (boards are ignored). */
  companyDomains?: string[];
}

/**
 * Accept / reject one candidate (pure). On the employer's own site: the site's domain (or a company-name domain);
 * on a board / ATS page: only a company-name domain.
 */
export const acceptCandidate = (c: Pick<Candidate, 'email'> & Partial<Pick<Candidate, 'context'>>, ctx: AcceptContext): RejectReason | null => {
  const bad = mailboxRejection(c.email);
  if (bad) return bad;
  const domain = c.email.split('@')[1];
  let pageHost = '';
  try {
    pageHost = new URL(ctx.pageUrl).hostname.toLowerCase();
  } catch {
    return 'NOT_EMPLOYER';
  }
  const onBoard = isBoardDomain(pageHost);
  const own = (ctx.companyDomains ?? []).filter((d) => !isBoardDomain(d)).map(registrableDomain);
  if (own.includes(registrableDomain(domain))) return null;
  if (!onBoard && registrableDomain(domain) === registrableDomain(pageHost)) {
    // A site we do not know as a job board, whose name does not look like the company's either (an unknown board,
    // a staffing portal): its address counts only when it is clearly the applications mailbox.
    if (!ctx.company || !companyTokens(ctx.company).length || domainMatchesCompany(pageHost, ctx.company)) return null;
    return HR_LOCAL.test(c.email.split('@')[0]) || APPLY_WORDS.test(c.context ?? '') ? null : 'NOT_EMPLOYER';
  }
  if (domainMatchesCompany(domain, ctx.company)) return null;
  return 'NOT_EMPLOYER';
};
