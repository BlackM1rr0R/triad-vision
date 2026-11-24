import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { brandSync } from '../brand/index.js';
import { getAutoSendSettings, replyToAddress } from '../germanyJobs/autoSettings.js';
import { matchEmployerReply } from '../germanyJobs/replies.js';
import type { ReportPart } from './dsn.js';
import { handleInboundReport } from './service.js';

/**
 * Hook of the workspace mail sync (lib/mail/sync.ts → announceArrivals): new INBOX mail of the agency mailboxes
 * (Reply-To of the employer e-mails, support / admin / From address, DELIVERABILITY_MAILBOXES) is checked for
 * bounce / complaint reports first (lib/deliverability), then for employer answers (lib/germanyJobs/replies).
 * Works only for mailboxes some staff member has added to the workspace mail with sync on. Runs in the background,
 * one message after another; never throws into the sync.
 */

export interface InboundItem {
  id: string;
  /** Top-level Content-Type with report-type (null = not a multipart/report). */
  contentType?: string | null;
  /** Report parts (delivery-status, feedback-report, rfc822 headers) read during the sync. */
  reportParts?: ReportPart[];
}

const addrOf = (s: string | null | undefined) => (/[^\s<>"]+@[^\s<>"]+/.exec(s ?? '')?.[0] ?? '').toLowerCase();

let cache: { at: number; set: Set<string> } | null = null;

/** Addresses whose mailbox receives bounces and employer answers. */
export const agencyMailboxes = async (): Promise<Set<string>> => {
  if (cache && Date.now() - cache.at < 60_000) return cache.set;
  const b = brandSync();
  const extra = (process.env.DELIVERABILITY_MAILBOXES ?? '').split(',').map((s) => s.trim().toLowerCase());
  let replyTo = '';
  try {
    replyTo = replyToAddress(await getAutoSendSettings());
  } catch {
    /* settings unreadable: the rest still works */
  }
  const set = new Set([replyTo, b.supportEmail, config.adminNotifyEmail, addrOf(b.emailFrom), addrOf(config.smtp.from), /@/.test(config.smtp.user) ? config.smtp.user : '', ...extra].map((s) => (s ?? '').trim().toLowerCase()).filter((s) => s.includes('@')));
  cache = { at: Date.now(), set };
  return set;
};

let chain: Promise<void> = Promise.resolve();
let inFlight = 0;

const handleOne = async (item: InboundItem) => {
  const m = await prisma.mailMessage.findUnique({
    where: { id: item.id },
    select: { id: true, messageId: true, inReplyTo: true, refs: true, fromAddr: true, fromName: true, subject: true, text: true, date: true },
  });
  if (!m) return;
  const report = await handleInboundReport({ rfcMessageId: m.messageId, fromAddr: m.fromAddr, subject: m.subject, text: m.text, contentType: item.contentType ?? null, parts: item.reportParts ?? [] });
  if (report) return;
  await matchEmployerReply({ mailMessageId: m.id, rfcMessageId: m.messageId, inReplyTo: m.inReplyTo, refs: m.refs, fromAddr: m.fromAddr, fromName: m.fromName, subject: m.subject, text: m.text, date: m.date });
};

/** Called by sync.ts for the new INBOX messages of one account. Returns at once. */
export const onAgencyInbound = (account: { email: string }, items: InboundItem[]) => {
  if (!items.length) return;
  inFlight++;
  chain = chain
    .then(async () => {
      if (!(await agencyMailboxes()).has(account.email.trim().toLowerCase())) return;
      for (const item of items) {
        try {
          await handleOne(item);
        } catch (err) {
          console.error('[deliverability] inbound mail not processed', item.id, (err as Error)?.message ?? err);
        }
      }
    })
    .catch((err) => console.error('[deliverability] inbound hook failed', (err as Error)?.message ?? err))
    .finally(() => {
      inFlight--;
    });
};

/** Waits until the background work is done (tests). */
export const flushAgencyInbound = async () => {
  while (inFlight > 0) await chain;
};

/** Tests: forget the cached mailbox list (settings changed). */
export const clearAgencyMailboxCache = () => {
  cache = null;
};
