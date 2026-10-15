import crypto from 'node:crypto';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type { MailAccount, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, badRequest, notFound } from '../http.js';
import { publish } from '../messaging/realtime.js';
import { dedupeAddresses, formatAddress, formatAddressList, type Address } from './address.js';
import { rememberCorrespondents } from './contacts.js';
import { enqueueRemote, ensureRoleFolder, isLocalFolder, recountFolders, smtpConnectionOf } from './core.js';
import { htmlToText, sanitizeMailHtml, snippetOf } from './sanitize.js';
import { mailSettings } from './settings.js';
import { createSmtpTransport } from './smtp.js';
import { readStored, storeBuffer } from './storage.js';
import { ensureAttachmentBytes } from './attachments.js';
import { withRemote } from './sync.js';
import { cleanMessageId, parseReferences, threadKeyOf } from './thread.js';

/**
 * Outgoing mail: the message is composed once (nodemailer MailComposer) so the bytes sent over
 * SMTP and the copy appended to the IMAP Sent folder are identical. Local state first: the SENT
 * row is written as soon as SMTP accepted the message; the IMAP append is queued best effort.
 */
export interface SendInput {
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  html: string;
  text?: string | null;
  draftId?: string | null;
  replyToMessageId?: string | null;
  forwardOfMessageId?: string | null;
  attachmentIds: string[];
}

const HOUR = 60 * 60 * 1000;

const messageIdFor = (account: MailAccount) => `${crypto.randomUUID()}@${account.email.split('@')[1] ?? 'triad-vision.de'}`;

export const sendMessage = async (userId: string, account: MailAccount, input: SendInput) => {
  const recipients = dedupeAddresses([...input.to, ...input.cc, ...input.bcc]);
  if (!recipients.length) throw badRequest('NO_RECIPIENTS');
  if (recipients.length > 50) throw badRequest('TOO_MANY_RECIPIENTS');

  const sent = await ensureRoleFolder(account.id, 'SENT');
  const recent = await prisma.mailMessage.count({ where: { accountId: account.id, folderId: sent.id, isDraft: false, createdAt: { gt: new Date(Date.now() - HOUR) } } });
  if (recent >= mailSettings.sendPerHour) throw new HttpError(429, 'MAIL_SEND_LIMIT', `At most ${mailSettings.sendPerHour} messages per hour per account`);

  // Reply / forward context.
  const original = input.replyToMessageId
    ? await prisma.mailMessage.findFirst({ where: { id: input.replyToMessageId, accountId: account.id }, include: { folder: true } })
    : null;
  if (input.replyToMessageId && !original) throw notFound('MAIL_MESSAGE_NOT_FOUND');
  const forwarded = input.forwardOfMessageId ? await prisma.mailMessage.findFirst({ where: { id: input.forwardOfMessageId, accountId: account.id } }) : null;
  if (input.forwardOfMessageId && !forwarded) throw notFound('MAIL_MESSAGE_NOT_FOUND');

  const draft = input.draftId ? await prisma.mailMessage.findFirst({ where: { id: input.draftId, accountId: account.id, isDraft: true } }) : null;
  if (input.draftId && !draft) throw notFound('MAIL_DRAFT_NOT_FOUND');

  // Attachments: the draft's own uploads plus any attachment of the user's messages (forwarding).
  const ids = [...new Set(input.attachmentIds)];
  const attachments = ids.length ? await prisma.mailAttachment.findMany({ where: { id: { in: ids }, message: { account: { userId } } }, include: { message: { include: { folder: true, account: true } } } }) : [];
  if (attachments.length !== ids.length) throw badRequest('INVALID_ATTACHMENT');
  const files: { filename: string; content: Buffer; contentType: string; cid?: string }[] = [];
  let totalBytes = 0;
  for (const a of attachments) {
    const key = await ensureAttachmentBytes(a);
    const content = await readStored(key);
    totalBytes += content.length;
    if (totalBytes > mailSettings.attachmentMaxBytes * 2) throw new HttpError(413, 'MAIL_TOO_LARGE');
    files.push({ filename: a.filename, content, contentType: a.mimeType, cid: a.inline && a.contentId ? a.contentId : undefined });
  }

  const html = sanitizeMailHtml(input.html, { keepRemoteImages: true });
  const text = (input.text ?? '').trim() || htmlToText(html);
  const messageId = messageIdFor(account);
  const inReplyTo = original ? cleanMessageId(original.messageId) : null;
  const references = original ? [...parseReferences(original.refs), ...(inReplyTo ? [inReplyTo] : [])].filter((v, i, arr) => arr.indexOf(v) === i) : [];
  const from: Address = { name: account.displayName ?? '', address: account.email };
  const date = new Date();

  const composer = new MailComposer({
    from: formatAddress(from),
    to: input.to.length ? formatAddressList(input.to) : undefined,
    cc: input.cc.length ? formatAddressList(input.cc) : undefined,
    bcc: input.bcc.length ? formatAddressList(input.bcc) : undefined,
    subject: input.subject,
    html,
    text,
    date,
    messageId: `<${messageId}>`,
    inReplyTo: inReplyTo ? `<${inReplyTo}>` : undefined,
    references: references.length ? references.map((r) => `<${r}>`).join(' ') : undefined,
    attachments: files.map((f) => ({ filename: f.filename, content: f.content, contentType: f.contentType, cid: f.cid, contentDisposition: f.cid ? 'inline' : 'attachment' })),
    headers: { 'X-Mailer': 'Triad Vision Workspace' },
  });
  const raw = await composer.compile().build();

  const transport = createSmtpTransport(smtpConnectionOf(account));
  try {
    await transport.send({ envelope: { from: account.email, to: recipients.map((r) => r.address) }, raw });
  } catch (err) {
    const e = err as { responseCode?: number; response?: string; message?: string };
    throw new HttpError(502, 'MAIL_SEND_FAILED', (e.response || e.message || 'SMTP error').replace(/\s+/g, ' ').slice(0, 500));
  } finally {
    transport.close();
  }

  // Local copy in SENT (the draft row becomes the sent row so its attachments follow).
  const threadKey = original?.threadKey ?? threadKeyOf({ messageId, inReplyTo, references, subject: input.subject, fromAddr: account.email });
  const data: Prisma.MailMessageUncheckedCreateInput = {
    accountId: account.id,
    folderId: sent.id,
    uid: null,
    messageId,
    inReplyTo,
    refs: references.length ? references.map((r) => `<${r}>`).join(' ') : null,
    threadKey,
    subject: input.subject.slice(0, 1000) || null,
    fromName: from.name || null,
    fromAddr: from.address,
    toList: input.to as unknown as Prisma.InputJsonValue,
    ccList: input.cc.length ? (input.cc as unknown as Prisma.InputJsonValue) : undefined,
    bccList: input.bcc.length ? (input.bcc as unknown as Prisma.InputJsonValue) : undefined,
    date,
    snippet: snippetOf(text, html),
    text,
    html,
    hasAttachments: files.some((f) => !f.cid),
    size: raw.length,
    seen: true,
    flagged: false,
    answered: false,
    isDraft: false,
    snoozedUntil: null,
    caseId: original?.caseId ?? forwarded?.caseId ?? null,
  };
  const row = draft ? await prisma.mailMessage.update({ where: { id: draft.id }, data }) : await prisma.mailMessage.create({ data });
  // Forwarded attachments that belong to other messages are copied, not moved.
  for (const a of attachments) {
    if (a.messageId === row.id) continue;
    const key = a.storageKey ? await storeBuffer(await readStored(a.storageKey)) : null;
    await prisma.mailAttachment.create({ data: { messageId: row.id, filename: a.filename, mimeType: a.mimeType, size: a.size, contentId: a.contentId, inline: a.inline, partId: null, storageKey: key } });
  }

  if (original) {
    await prisma.mailMessage.update({ where: { id: original.id }, data: { answered: true } });
    if (original.uid !== null && !isLocalFolder(original.folder)) {
      const uid = Number(original.uid);
      const path = original.folder.path;
      enqueueRemote(account.id, () => withRemote(account.id, (c) => c.addFlags(path, [uid], ['\\Answered'])).then(() => undefined));
    }
  }
  await recountFolders([sent.id, ...(draft ? [draft.folderId] : [])]);

  // Append the identical bytes to the server's Sent folder when the account has one.
  if (!isLocalFolder(sent)) {
    const path = sent.path;
    enqueueRemote(account.id, async () => {
      const uid = await withRemote(account.id, (c) => c.append(path, raw, ['\\Seen']));
      if (uid) await prisma.mailMessage.updateMany({ where: { id: row.id, uid: null }, data: { uid: BigInt(uid) } });
    });
  }

  await rememberCorrespondents(userId, recipients, [account.email]);
  publish(account.userId, 'mail.updated', { accountId: account.id, reason: 'sent', messageId: row.id, folderId: sent.id });
  return row;
};
