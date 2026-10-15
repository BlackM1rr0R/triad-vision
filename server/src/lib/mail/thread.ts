import crypto from 'node:crypto';

/**
 * Conversation grouping (pure). The thread key is the root Message-ID of the conversation: the
 * first entry of References, else In-Reply-To, else the message's own Message-ID. Messages without
 * any id get a key derived from the subject + correspondent so replies by broken clients still
 * land together.
 */
const MAX_KEY = 190;

export const cleanMessageId = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const s = raw.trim().replace(/^<|>$/g, '').trim();
  if (!s || s.length > 998) return null;
  return s;
};

/** Message-IDs from a References header (string or list), in order, cleaned. */
export const parseReferences = (refs: string | string[] | null | undefined): string[] => {
  if (!refs) return [];
  const raw = Array.isArray(refs) ? refs.join(' ') : refs;
  const out: string[] = [];
  for (const m of raw.matchAll(/<([^<>\s]+)>/g)) out.push(m[1]!);
  if (!out.length) {
    for (const token of raw.split(/\s+/)) {
      const c = cleanMessageId(token);
      if (c && c.includes('@')) out.push(c);
    }
  }
  return out;
};

const fit = (key: string) => (key.length <= MAX_KEY ? key : `h:${crypto.createHash('sha1').update(key).digest('hex')}`);

/** Subject without Re:/Fwd:/AW:/WG: prefixes (any language variants commonly seen). */
export const normalizeSubject = (subject: string | null | undefined) =>
  (subject ?? '')
    .replace(/^\s*((re|fwd?|fw|aw|wg|sv|vs|tr|отв|пересл|cavab)\s*(\[\d+\])?\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();

export interface ThreadInput {
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | string[] | null;
  subject?: string | null;
  fromAddr?: string | null;
}

/** Candidate ids that identify the conversation, most authoritative first. */
export const threadCandidates = (m: ThreadInput): string[] => {
  const refs = parseReferences(m.references);
  const inReplyTo = cleanMessageId(m.inReplyTo);
  const own = cleanMessageId(m.messageId);
  const out: string[] = [];
  for (const id of [...refs, inReplyTo, own]) if (id && !out.includes(id)) out.push(id);
  return out;
};

export const threadKeyOf = (m: ThreadInput): string => {
  const [root] = threadCandidates(m);
  if (root) return fit(root);
  const subject = normalizeSubject(m.subject);
  return fit(`s:${crypto.createHash('sha1').update(`${subject}|${(m.fromAddr ?? '').toLowerCase()}`).digest('hex')}`);
};

export const isReplySubject = (subject: string | null | undefined) => /^\s*(re|aw|sv|отв|cavab)\s*(\[\d+\])?\s*:/i.test(subject ?? '');

export const replySubject = (subject: string | null | undefined) => (isReplySubject(subject) ? (subject ?? '').trim() : `Re: ${(subject ?? '').trim()}`.trim());
export const forwardSubject = (subject: string | null | undefined) => (/^\s*(fwd?|fw|wg|tr)\s*:/i.test(subject ?? '') ? (subject ?? '').trim() : `Fwd: ${(subject ?? '').trim()}`.trim());
