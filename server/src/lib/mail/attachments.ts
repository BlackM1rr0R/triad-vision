import type { MailAttachment, MailFolder } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, notFound } from '../http.js';
import { imapConnectionOf } from './core.js';
import { withImap } from './imap.js';
import { mailSettings } from './settings.js';
import { storeBuffer, storedExists } from './storage.js';

/**
 * Attachment bytes are fetched from the IMAP server the first time somebody asks for them
 * (`download(uid, partId)`), then kept under <DOCS_DIR>/mail/<key>. Inline parts and uploads are
 * stored up front.
 */
type Row = MailAttachment & { message: { uid: bigint | null; folder: Pick<MailFolder, 'path'>; accountId: string } };

export const ensureAttachmentBytes = async (a: Row): Promise<string> => {
  if (a.storageKey && (await storedExists(a.storageKey))) return a.storageKey;
  if (a.size > mailSettings.attachmentMaxBytes) throw new HttpError(413, 'ATTACHMENT_TOO_LARGE');
  if (a.message.uid === null) throw notFound('ATTACHMENT_NOT_AVAILABLE');
  const account = await prisma.mailAccount.findUnique({ where: { id: a.message.accountId } });
  if (!account) throw notFound('MAIL_ACCOUNT_NOT_FOUND');
  const uid = Number(a.message.uid);
  let fetched: { content: Buffer } | null;
  try {
    fetched = await withImap(imapConnectionOf(account), (c) => c.download(a.message.folder.path, uid, a.partId ?? undefined, mailSettings.attachmentMaxBytes));
  } catch (err) {
    if ((err as Error)?.message === 'ATTACHMENT_TOO_LARGE') throw new HttpError(413, 'ATTACHMENT_TOO_LARGE');
    throw new HttpError(502, 'MAIL_SERVER_UNREACHABLE', (err as Error)?.message?.slice(0, 300));
  }
  if (!fetched || !fetched.content.length) throw notFound('ATTACHMENT_NOT_AVAILABLE');
  const key = await storeBuffer(fetched.content);
  await prisma.mailAttachment.update({ where: { id: a.id }, data: { storageKey: key, size: fetched.content.length } });
  return key;
};
