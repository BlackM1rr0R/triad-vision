import type { MailAccount, MailAttachment, MailFolder, MailFolderRole, MailLabel, MailMessage, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, notFound } from '../http.js';
import { open } from '../secretBox.js';
import { asAddressList, type Address } from './address.js';
import type { ImapConnection } from './imap.js';
import type { SmtpConnection } from './smtp.js';

/**
 * Shared helpers of the mail module: ownership checks, connection details, local placeholder
 * folders (an account that was never synced still needs DRAFTS/SENT), unread bookkeeping and the
 * JSON shapes the client receives.
 */
export const LOCAL_PREFIX = 'local:';

export const ROLE_NAMES: Record<MailFolderRole, string> = {
  INBOX: 'Inbox',
  SENT: 'Sent',
  DRAFTS: 'Drafts',
  TRASH: 'Trash',
  JUNK: 'Junk',
  ARCHIVE: 'Archive',
  OTHER: '',
};

export const ROLE_ORDER: Record<MailFolderRole, number> = { INBOX: 0, DRAFTS: 1, SENT: 2, ARCHIVE: 3, JUNK: 4, TRASH: 5, OTHER: 10 };

// ─── Accounts ─────────────────────────────────────────────────────────

/** The caller's account or 404 (another staff member's account is indistinguishable from a missing one). */
export const loadOwnAccount = async (accountId: string, userId: string) => {
  const a = await prisma.mailAccount.findFirst({ where: { id: accountId, userId } });
  if (!a) throw notFound('MAIL_ACCOUNT_NOT_FOUND');
  return a;
};

export class MailCredentialsError extends HttpError {
  constructor() {
    super(409, 'MAIL_PASSWORD_UNREADABLE', 'The stored password cannot be decrypted (server key changed). Enter it again.');
  }
}

/** syncError prefix of an account whose IMAP login was refused: it is not retried until the login changes. */
export const AUTH_FAILED_PREFIX = 'AUTH_FAILED: ';

/** The server refused the login (wrong user or password). Retrying only gets our IP banned by the mail server. */
export const isImapAuthFailure = (err: unknown) => {
  const e = err as { authenticationFailed?: boolean; serverResponseCode?: string; responseText?: string; message?: string } | null;
  if (!e) return false;
  if (e.authenticationFailed || e.serverResponseCode === 'AUTHENTICATIONFAILED') return true;
  return /AUTHENTICATIONFAILED/i.test(`${e.responseText ?? ''} ${e.message ?? ''}`);
};

export const isAuthBlocked = (a: { syncStatus: string; syncError: string | null }) => a.syncStatus === 'ERROR' && !!a.syncError?.startsWith(AUTH_FAILED_PREFIX);

export const imapConnectionOf = (a: MailAccount): ImapConnection => {
  const password = open(a.passwordEnc);
  if (password === null) throw new MailCredentialsError();
  return { host: a.imapHost, port: a.imapPort, secure: a.imapSecure, username: a.username, password };
};

export const smtpConnectionOf = (a: MailAccount): SmtpConnection => {
  const password = open(a.passwordEnc);
  if (password === null) throw new MailCredentialsError();
  return { host: a.smtpHost, port: a.smtpPort, secure: a.smtpSecure, username: a.username, password };
};

/** Public shape of an account: never the password. */
export const accountDto = (a: MailAccount) => ({
  id: a.id,
  email: a.email,
  displayName: a.displayName,
  provider: a.provider,
  imapHost: a.imapHost,
  imapPort: a.imapPort,
  imapSecure: a.imapSecure,
  smtpHost: a.smtpHost,
  smtpPort: a.smtpPort,
  smtpSecure: a.smtpSecure,
  username: a.username,
  signatureHtml: a.signatureHtml,
  isDefault: a.isDefault,
  syncEnabled: a.syncEnabled,
  syncStatus: a.syncStatus,
  syncError: a.syncError,
  lastSyncAt: a.lastSyncAt,
  createdAt: a.createdAt,
});

// ─── Folders ──────────────────────────────────────────────────────────

export const isLocalFolder = (f: Pick<MailFolder, 'path'>) => f.path.startsWith(LOCAL_PREFIX);

/**
 * Returns the account's folder with the given role, creating a local placeholder (not on the
 * IMAP server) when none exists yet. Sync merges the placeholder into the real folder later.
 */
export const ensureRoleFolder = async (accountId: string, role: Exclude<MailFolderRole, 'OTHER'>) => {
  const existing = await prisma.mailFolder.findFirst({ where: { accountId, role }, orderBy: { sortOrder: 'asc' } });
  if (existing) return existing;
  return prisma.mailFolder.upsert({
    where: { accountId_path: { accountId, path: `${LOCAL_PREFIX}${role}` } },
    update: {},
    create: { accountId, path: `${LOCAL_PREFIX}${role}`, name: ROLE_NAMES[role], role, sortOrder: ROLE_ORDER[role] },
  });
};

export const folderDto = (f: MailFolder) => ({
  id: f.id,
  accountId: f.accountId,
  path: f.path,
  name: f.name,
  role: f.role,
  unread: f.unread,
  total: f.total,
  local: isLocalFolder(f),
  sortOrder: f.sortOrder,
});

/** Recomputes `unread` and `total` of the given folders from the stored messages. */
export const recountFolders = async (folderIds: string[]) => {
  const ids = [...new Set(folderIds.filter(Boolean))];
  if (!ids.length) return;
  const [totals, unreads] = await Promise.all([
    prisma.mailMessage.groupBy({ by: ['folderId'], where: { folderId: { in: ids } }, _count: { _all: true } }),
    prisma.mailMessage.groupBy({ by: ['folderId'], where: { folderId: { in: ids }, seen: false, isDraft: false, snoozedUntil: null }, _count: { _all: true } }),
  ]);
  const t = new Map(totals.map((r) => [r.folderId, r._count._all]));
  const u = new Map(unreads.map((r) => [r.folderId, r._count._all]));
  await prisma.$transaction(ids.map((id) => prisma.mailFolder.update({ where: { id }, data: { total: t.get(id) ?? 0, unread: u.get(id) ?? 0 } })));
};

// ─── Messages ─────────────────────────────────────────────────────────

export const messageInclude = {
  attachments: true,
  labels: { include: { label: true } },
  folder: { select: { id: true, role: true, name: true, path: true } },
  case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } },
  // AI mail triage chips (lib/ai/features/mailTriage.ts)
  triage: { select: { status: true, category: true, urgency: true } },
} satisfies Prisma.MailMessageInclude;

export type MessageRow = Prisma.MailMessageGetPayload<{ include: typeof messageInclude }>;

/** The caller's message (through the account) or 404. */
export const loadOwnMessage = async (messageId: string, userId: string): Promise<MessageRow> => {
  const m = await prisma.mailMessage.findFirst({ where: { id: messageId, account: { userId } }, include: messageInclude });
  if (!m) throw notFound('MAIL_MESSAGE_NOT_FOUND');
  return m;
};

export const labelDto = (l: MailLabel) => ({ id: l.id, name: l.name, color: l.color, sortOrder: l.sortOrder });

export const attachmentDto = (a: MailAttachment) => ({
  id: a.id,
  filename: a.filename,
  mimeType: a.mimeType,
  size: a.size,
  inline: a.inline,
  contentId: a.contentId,
  /** bytes already on disk (otherwise the first download fetches them from the server) */
  cached: !!a.storageKey,
});

const fromOf = (m: MailMessage): Address | null => (m.fromAddr ? { name: m.fromName ?? '', address: m.fromAddr } : null);

export const messageListDto = (m: MessageRow, extra: { threadCount?: number } = {}) => ({
  id: m.id,
  accountId: m.accountId,
  folderId: m.folderId,
  folderRole: m.folder.role,
  threadKey: m.threadKey,
  subject: m.subject,
  from: fromOf(m),
  to: asAddressList(m.toList),
  date: m.date,
  snippet: m.snippet,
  hasAttachments: m.hasAttachments,
  size: m.size,
  seen: m.seen,
  flagged: m.flagged,
  answered: m.answered,
  isDraft: m.isDraft,
  snoozedUntil: m.snoozedUntil,
  caseId: m.caseId,
  labels: m.labels.map((l) => labelDto(l.label)),
  threadCount: extra.threadCount ?? 1,
  ai: m.triage ? { status: m.triage.status, category: m.triage.category, urgency: m.triage.urgency } : null,
});

export const messageDetailDto = (m: MessageRow) => ({
  ...messageListDto(m),
  messageId: m.messageId,
  inReplyTo: m.inReplyTo,
  cc: asAddressList(m.ccList),
  bcc: asAddressList(m.bccList),
  replyTo: m.replyTo,
  text: m.text,
  html: m.html,
  attachments: m.attachments.map(attachmentDto),
  case: m.case ? { id: m.case.id, number: m.case.number, clientName: `${m.case.client.firstName} ${m.case.client.lastName}`.trim() } : null,
  uid: m.uid === null ? null : Number(m.uid),
});

// ─── Serial queue per account for best-effort server-side operations ───

const queues = new Map<string, Promise<void>>();
const pending = new Set<Promise<void>>();

/**
 * Runs `fn` after the previous operation of the same account finished; errors are logged, never
 * thrown (local state is authoritative, the IMAP mirror is best effort).
 */
export const enqueueRemote = (accountId: string, fn: () => Promise<void>) => {
  const prev = queues.get(accountId) ?? Promise.resolve();
  const next = prev
    .then(fn)
    .catch((err) => {
      console.error('[mail] remote operation failed', accountId, (err as Error)?.message ?? err);
    })
    .finally(() => {
      pending.delete(next);
      if (queues.get(accountId) === next) queues.delete(accountId);
    });
  pending.add(next);
  queues.set(accountId, next);
  return next;
};

/** Waits until every queued remote operation finished (tests). */
export const flushRemote = async () => {
  while (pending.size) await Promise.all([...pending]);
};
