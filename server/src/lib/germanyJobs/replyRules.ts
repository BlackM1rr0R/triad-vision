/**
 * Employer answers to automatic applications (pure, unit-tested; no AI): which application a mail belongs to and what
 * it most likely says. Keyword rules in German and English; the result is only a suggestion for staff.
 */

export type ReplyClass = 'INTERVIEW' | 'REJECTION' | 'DOCUMENTS' | 'OTHER';
export type SuggestedStatus = 'INTERVIEW' | 'REJECTED' | null;

/** Quoted history ("> …", "Am … schrieb …", "-----Original Message-----") is not the employer's answer. */
export const stripQuoted = (text: string) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*-{2,}\s*(original(nachricht| message)?|ursprüngliche nachricht|forwarded message|weitergeleitete nachricht)/i.test(line)) break;
    if (/^\s*(am|on)\s.{4,120}\s(schrieb|wrote)\b.*:?\s*$/i.test(line)) break;
    if (/^\s*(von|from):\s.+@/i.test(line) && out.length > 2) break; // Outlook header block of the quoted mail
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n');
};

interface Rule {
  re: RegExp;
  weight: number;
}

const RULES: Record<Exclude<ReplyClass, 'OTHER'>, Rule[]> = {
  REJECTION: [
    { re: /\babsage\b/i, weight: 3 },
    { re: /nicht (weiter )?berücksichtig/i, weight: 3 },
    { re: /\banderweitig\b|für einen anderen (bewerber|kandidaten)|andere[nm]? (bewerber|kandidat)/i, weight: 2 },
    { re: /\bleider\b/i, weight: 2 },
    { re: /nicht in die engere auswahl|keine berücksichtigung|stelle (ist )?bereits (besetzt|vergeben)/i, weight: 3 },
    { re: /\bunfortunately\b/i, weight: 2 },
    { re: /regret to inform|not (been )?successful|decided not to (proceed|move forward)|(position|role) has (already )?been filled|other candidates|not be (moving|taking) (forward|your application)/i, weight: 3 },
  ],
  INTERVIEW: [
    { re: /vorstellungsgespr(ä|ae)ch/i, weight: 3 },
    { re: /einladung zu(m|r)?\b/i, weight: 3 },
    { re: /\beinladung\b|\beinladen\b|laden (sie|dich) (gerne )?(herzlich )?ein/i, weight: 2 },
    { re: /\btermin(vorschlag|e)?\b|kennenlern|telefoninterview|videocall|video-?interview|probearbeit/i, weight: 1 },
    { re: /\binterview\b/i, weight: 3 },
    { re: /invite you|invitation|schedule a (call|meeting)|would like to meet/i, weight: 2 },
  ],
  DOCUMENTS: [
    { re: /nachreichen|nachzureichen/i, weight: 3 },
    { re: /\bzeugnisse?\b|\bnachweise?\b|\bzertifikate?\b/i, weight: 2 },
    { re: /\bunterlagen\b/i, weight: 1 },
    { re: /fehlende unterlagen|vollständige unterlagen|weitere unterlagen/i, weight: 2 },
    { re: /(send|provide|submit) (us )?(your |the |additional |further |missing )?(documents|certificates|references)/i, weight: 3 },
    { re: /\bdocuments\b|\bcertificates\b/i, weight: 1 },
  ],
};

/** Priority on equal scores: a rejection that mentions a "Termin" is still a rejection. */
const ORDER: Exclude<ReplyClass, 'OTHER'>[] = ['REJECTION', 'INTERVIEW', 'DOCUMENTS'];

export const classifyReply = (subject: string | null, text: string | null): { classification: ReplyClass; suggestedStatus: SuggestedStatus; scores: Record<string, number> } => {
  const body = `${subject ?? ''}\n${stripQuoted(text ?? '').slice(0, 20_000)}`;
  const scores: Record<string, number> = {};
  for (const k of ORDER) scores[k] = RULES[k].reduce((sum, r) => sum + (r.re.test(body) ? r.weight : 0), 0);
  let best: ReplyClass = 'OTHER';
  let bestScore = 1; // at least 2 points
  for (const k of ORDER) {
    if (scores[k]! > bestScore) {
      best = k;
      bestScore = scores[k]!;
    }
  }
  return { classification: best, suggestedStatus: best === 'INTERVIEW' ? 'INTERVIEW' : best === 'REJECTION' ? 'REJECTED' : null, scores };
};

// ─── Matching ───────────────────────────────────────────────────────────────

/** Message-IDs named in In-Reply-To / References (without <>, lower case). */
export const referencedIds = (inReplyTo: string | null, refs: string | null) =>
  Array.from(new Set(`${inReplyTo ?? ''} ${refs ?? ''}`.split(/[\s,]+/).map((t) => t.replace(/^<|>$/g, '').trim().toLowerCase()).filter((t) => t.includes('@'))));

export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 't-online.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de',
  'live.com', 'live.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'freenet.de', 'mail.de', 'posteo.de', 'aol.com', 'arcor.de', 'online.de', 'mail.ru',
  'yandex.ru', 'proton.me', 'protonmail.com',
]);

const domainOf = (address: string | null | undefined) => {
  const a = (address ?? '').trim().toLowerCase();
  const i = a.lastIndexOf('@');
  return i > 0 ? a.slice(i + 1) : '';
};
const registrable = (host: string) => host.replace(/^www\./, '').split('.').slice(-2).join('.');

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\(m\/w\/d\)|\(w\/m\/d\)|\(m\/f\/d\)|\(all genders\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface ReplyCandidate {
  id: string;
  employerEmail: string | null;
  listingTitle: string | null;
  contactName: string | null;
}

/** Title / candidate name named in the mail (whole title, or the candidate's first and last name). */
export const mentions = (c: ReplyCandidate, haystack: string) => {
  const h = ` ${norm(haystack)} `;
  const title = norm(c.listingTitle ?? '');
  if (title.length >= 4 && h.includes(` ${title} `)) return true;
  const nameParts = norm(c.contactName ?? '').split(' ').filter((p) => p.length >= 2);
  if (nameParts.length >= 2 && nameParts.every((p) => h.includes(` ${p} `))) return true;
  return false;
};

/**
 * Fallback without headers: the sender belongs to the employer we wrote to (same address, or same company domain unless
 * it is a free-mail domain) and the mail names the listing title or the candidate. Ambiguous → null.
 */
export const matchByDomain = (mail: { fromAddr: string | null; subject: string | null; text: string | null }, candidates: ReplyCandidate[]): string | null => {
  const from = (mail.fromAddr ?? '').trim().toLowerCase();
  const fromDomain = domainOf(from);
  if (!fromDomain) return null;
  const sameSender = candidates.filter((c) => {
    const e = (c.employerEmail ?? '').toLowerCase();
    if (!e) return false;
    if (e === from) return true;
    const d = domainOf(e);
    return !FREE_MAIL.has(d) && !FREE_MAIL.has(fromDomain) && registrable(d) === registrable(fromDomain);
  });
  if (!sameSender.length) return null;
  const haystack = `${mail.subject ?? ''}\n${stripQuoted(mail.text ?? '').slice(0, 20_000)}\n${(mail.text ?? '').slice(0, 20_000)}`;
  const named = sameSender.filter((c) => mentions(c, haystack));
  return named.length === 1 ? named[0]!.id : null;
};
