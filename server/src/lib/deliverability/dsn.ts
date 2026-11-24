/**
 * Pure parsing of delivery reports that arrive in the agency mailbox (no I/O, unit-tested):
 *  - bounces / DSN (RFC 3464, multipart/report; report-type=delivery-status) and the plain-text bounces some servers send,
 *  - spam complaints from feedback loops (ARF, RFC 5965, report-type=feedback-report),
 *  - SMTP rejects while sending (nodemailer error: responseCode + message).
 * 5.x.x = HARD (permanent), 4.x.x = SOFT (temporary). Policy blocks (5.7.x: spam filter, authentication) are HARD but do
 * not suppress the address: the problem is our mail, not the mailbox.
 */

export type BounceKind = 'HARD' | 'SOFT';

export interface ReportPart {
  contentType: string;
  content: string;
}

export interface ReportInput {
  fromAddr: string | null;
  subject: string | null;
  /** Top-level Content-Type with parameters (multipart/report; report-type=…). */
  contentType: string | null;
  /** Human-readable text of the mail. */
  text: string | null;
  /** message/delivery-status, message/feedback-report, text/rfc822-headers, message/rfc822 … */
  parts: ReportPart[];
  /** Our own domains: never taken as the failed recipient (From of the original, the mailbox itself). */
  ownDomains: string[];
}

export interface BounceRecipient {
  address: string;
  kind: BounceKind;
  status: string | null;
  diagnostic: string | null;
  /** Put the address on the suppression list (HARD and not a policy block). */
  suppress: boolean;
}

export type ReportResult =
  | { type: 'BOUNCE'; recipients: BounceRecipient[]; originalMessageId: string | null }
  | { type: 'COMPLAINT'; recipients: { address: string; feedbackType: string }[]; originalMessageId: string | null };

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const EMAIL_G = new RegExp(EMAIL.source, 'g');
const ENHANCED = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/;

export const BOUNCE_SENDER = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon|bounces?)([+.-][^@]*)?@/i;
export const BOUNCE_SUBJECT =
  /(undeliver(able|ed)|delivery (status notification|has failed|failure|failed)|mail delivery (failed|subsystem|system)|returned mail|failure notice|non[- ]?delivery|unzustellbar|nicht zugestellt|zustellung fehlgeschlagen|unzustellbare|rückläufer|недоставлен|не доставлено)/i;

const clean = (s: string) => s.trim().replace(/^<|>$/g, '').toLowerCase();
const domainOf = (address: string) => address.slice(address.lastIndexOf('@') + 1).toLowerCase();
const isOwn = (address: string, own: string[]) => {
  const d = domainOf(address);
  return own.some((o) => d === o || d.endsWith(`.${o}`));
};

/** Unfolded "Name: value" fields of a header-like block (DSN / ARF parts). */
export const fieldsOf = (block: string): Map<string, string> => {
  const out = new Map<string, string>();
  let last: string | null = null;
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && last) {
      out.set(last, `${out.get(last)} ${line.trim()}`);
      continue;
    }
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line);
    if (!m) {
      last = null;
      continue;
    }
    last = m[1]!.toLowerCase();
    if (!out.has(last)) out.set(last, m[2]!.trim());
  }
  return out;
};

const addressField = (v: string | undefined) => {
  if (!v) return null;
  const after = v.includes(';') ? v.slice(v.indexOf(';') + 1) : v;
  const m = EMAIL.exec(after);
  return m ? clean(m[0]) : null;
};

/** Kind of an enhanced status code (5.1.1) and whether the address should be suppressed. */
export const statusKind = (status: string): { kind: BounceKind; suppress: boolean } | null => {
  const m = ENHANCED.exec(status);
  if (!m) return null;
  if (m[1] === '2') return null;
  if (m[1] === '4') return { kind: 'SOFT', suppress: false };
  return { kind: 'HARD', suppress: m[2] !== '7' };
};

const originalMessageIdOf = (texts: string[]) => {
  for (const t of texts) {
    const m = /^message-id:\s*<?([^\s<>]+@[^\s<>]+)>?/im.exec(t);
    if (m) return m[1]!.trim();
  }
  return null;
};

const parseDsnBlocks = (text: string, own: string[]): BounceRecipient[] => {
  const out: BounceRecipient[] = [];
  for (const block of text.split(/\r?\n[ \t]*\r?\n/)) {
    const f = fieldsOf(block);
    const address = addressField(f.get('final-recipient')) ?? addressField(f.get('original-recipient'));
    if (!address || isOwn(address, own)) continue;
    const action = (f.get('action') ?? '').toLowerCase();
    if (action && action !== 'failed' && action !== 'delayed') continue; // delivered / relayed / expanded
    const status = f.get('status') ?? null;
    const diagnostic = (f.get('diagnostic-code') ?? '').replace(/^smtp;\s*/i, '').slice(0, 500) || null;
    const kindInfo = (status && statusKind(status)) ?? (diagnostic && statusKind(diagnostic)) ?? (action === 'delayed' ? { kind: 'SOFT' as const, suppress: false } : null);
    const k = kindInfo ?? (action === 'failed' ? { kind: 'HARD' as const, suppress: true } : null);
    if (!k) continue;
    if (out.some((r) => r.address === address)) continue;
    out.push({ address, kind: k.kind, status: status ? (ENHANCED.exec(status)?.[0] ?? status.slice(0, 40)) : null, diagnostic, suppress: k.suppress });
  }
  return out;
};

/** Text bounce without DSN fields: status code + the foreign addresses next to it. */
const parseTextBounce = (text: string, own: string[]): BounceRecipient[] => {
  const lines = text.split(/\r?\n/);
  const out: BounceRecipient[] = [];
  const add = (address: string, status: string | null, line: string) => {
    if (isOwn(address, own) || BOUNCE_SENDER.test(address) || out.some((r) => r.address === address)) return;
    const k = status ? statusKind(status) : null;
    const smtp = /\b(5[05]\d|4[25]\d)\b/.exec(line)?.[1];
    const kind = k ?? (smtp ? { kind: smtp.startsWith('5') ? ('HARD' as const) : ('SOFT' as const), suppress: smtp.startsWith('5') } : null);
    if (!kind) return;
    out.push({ address, kind: kind.kind, status: status ?? (smtp ? `${smtp[0]}.0.0` : null), diagnostic: line.trim().slice(0, 500) || null, suppress: kind.suppress });
  };
  // Lines that carry both an address and an error code ("<a@b.de>: 550 5.1.1 User unknown").
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const window = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');
    const status = ENHANCED.exec(window)?.[0] ?? null;
    if (!status && !/\b(5[05]\d|4[25]\d)\b/.test(window)) continue;
    for (const m of line.match(EMAIL_G) ?? []) add(clean(m), status, window);
  }
  return out.filter((r) => r.status || r.kind);
};

const isComplaint = (input: ReportInput) =>
  /report-type\s*=\s*"?feedback-report/i.test(input.contentType ?? '') || input.parts.some((p) => /message\/feedback-report/i.test(p.contentType));

const isBounceMail = (input: ReportInput) =>
  /report-type\s*=\s*"?delivery-status/i.test(input.contentType ?? '') ||
  input.parts.some((p) => /message\/(global-)?delivery-status/i.test(p.contentType)) ||
  BOUNCE_SENDER.test(input.fromAddr ?? '') ||
  BOUNCE_SUBJECT.test(input.subject ?? '');

/** Bounce or complaint report → recipients; null for any other mail (or a report without a usable recipient). */
export const parseDeliveryReport = (input: ReportInput): ReportResult | null => {
  const own = input.ownDomains.map((d) => d.toLowerCase()).filter(Boolean);
  const partTexts = input.parts.map((p) => p.content);
  const originalParts = input.parts.filter((p) => /rfc822/i.test(p.contentType)).map((p) => p.content);
  const originalMessageId = originalMessageIdOf([...originalParts, ...partTexts, input.text ?? '']);

  if (isComplaint(input)) {
    const report = input.parts.find((p) => /feedback-report/i.test(p.contentType))?.content ?? input.text ?? '';
    const f = fieldsOf(report);
    const feedbackType = (f.get('feedback-type') ?? 'abuse').toLowerCase().slice(0, 40);
    const direct = [f.get('original-rcpt-to'), f.get('removal-recipient')].map((v) => addressField(v)).filter((v): v is string => !!v);
    const fromOriginal = originalParts.flatMap((t) => {
      const to = fieldsOf(t.split(/\r?\n\r?\n/)[0] ?? '').get('to');
      return to ? (to.match(EMAIL_G) ?? []).map(clean) : [];
    });
    const recipients = Array.from(new Set([...direct, ...fromOriginal])).filter((a) => !isOwn(a, own));
    return recipients.length ? { type: 'COMPLAINT', recipients: recipients.map((address) => ({ address, feedbackType })), originalMessageId } : null;
  }

  if (!isBounceMail(input)) return null;
  const dsnText = input.parts.filter((p) => /delivery-status/i.test(p.contentType)).map((p) => p.content).join('\n\n');
  let recipients = dsnText ? parseDsnBlocks(dsnText, own) : [];
  if (!recipients.length && /final-recipient:/i.test(input.text ?? '')) recipients = parseDsnBlocks(input.text ?? '', own);
  if (!recipients.length) recipients = parseTextBounce(input.text ?? '', own);
  return recipients.length ? { type: 'BOUNCE', recipients, originalMessageId } : null;
};

/**
 * SMTP reject while sending: only recipient problems count (unknown mailbox, disabled address), not our own server's
 * errors (authentication 535, relay denied, size). null = not about the recipient.
 */
export const smtpRejectKind = (responseCode: number | undefined, message: string | undefined): BounceRecipient['kind'] | null => {
  if (!responseCode || responseCode < 500) return null;
  const msg = message ?? '';
  const enhanced = ENHANCED.exec(msg);
  if (enhanced) {
    const [, cls, subject, detail] = enhanced;
    if (cls !== '5') return null;
    if (subject === '1' || (subject === '2' && detail === '1') || (subject === '4' && detail === '4')) return 'HARD';
    return null;
  }
  if (responseCode >= 550 && responseCode <= 553 && /(user unknown|no such (user|mailbox|recipient)|mailbox (unavailable|not found|does not exist)|does not exist|recipient (address )?rejected|invalid (recipient|mailbox|address)|unknown (user|recipient)|address rejected)/i.test(msg)) return 'HARD';
  return null;
};

/** Lower-case domain of an address ('' when there is none). */
export const emailDomain = (address: string | null | undefined) => {
  const a = (address ?? '').trim().toLowerCase();
  const i = a.lastIndexOf('@');
  return i > 0 ? a.slice(i + 1).replace(/>$/, '') : '';
};
