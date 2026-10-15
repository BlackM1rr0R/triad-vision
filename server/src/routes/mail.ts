import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Prisma, type MailFolderRole, type MailProvider } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, requireMinRole } from '../middleware/auth.js';
import { decodeOriginalName } from '../middleware/upload.js';
import { audit } from '../lib/audit.js';
import { incomingDir } from '../lib/drive/storage.js';
import { FileCheckError, INLINE_MIME, WORKSPACE_MIME, resolveMime, verifyStoredFile } from '../lib/fileCheck.js';
import { HttpError, badRequest, forbidden, notFound, parse } from '../lib/http.js';
import { publish } from '../lib/messaging/realtime.js';
import { seal } from '../lib/secretBox.js';
import { asAddressList, dedupeAddresses, normalizeEmail, type Address } from '../lib/mail/address.js';
import { ensureAttachmentBytes } from '../lib/mail/attachments.js';
import { rememberCorrespondents } from '../lib/mail/contacts.js';
import {
  accountDto,
  attachmentDto,
  enqueueRemote,
  ensureRoleFolder,
  folderDto,
  isLocalFolder,
  labelDto,
  loadOwnAccount,
  loadOwnMessage,
  messageDetailDto,
  messageInclude,
  messageListDto,
  recountFolders,
  type MessageRow,
} from '../lib/mail/core.js';
import { verifyImap } from '../lib/mail/imap.js';
import { PROVIDERS, providerForEmail } from '../lib/mail/providers.js';
import { ruleActionsSchema, ruleConditionsSchema } from '../lib/mail/rules.js';
import { htmlToText, sanitizeMailHtml, snippetOf } from '../lib/mail/sanitize.js';
import { sendMessage } from '../lib/mail/send.js';
import { mailSettings } from '../lib/mail/settings.js';
import { verifySmtp } from '../lib/mail/smtp.js';
import { SNOOZE_PRESETS, snoozeUntil } from '../lib/mail/snooze.js';
import { adoptMailUpload, mailPath, removeMailStored } from '../lib/mail/storage.js';
import { applyRules, syncAccount, withRemote } from '../lib/mail/sync.js';
import { threadKeyOf } from '../lib/mail/thread.js';

/**
 * Workspace mail (/api/mail): every staff member's own IMAP/SMTP mailboxes. Accounts, folders and
 * messages are private to their owner; admins only see account health (never passwords or content).
 */
export const mailRouter = Router();
mailRouter.use(requireMinRole('STAFF'));

const id = z.string().trim().min(1).max(40);
const addressIn = z.object({ name: z.string().max(255).default(''), address: z.string().trim().email().max(255) });
const addressList = z.array(addressIn).max(50).default([]);
const html = z.string().max(2_000_000);

const toAddresses = (list: { name: string; address: string }[]): Address[] => list.map((a) => ({ name: a.name.trim(), address: normalizeEmail(a.address) }));

const errorText = (err: unknown) => {
  const e = err as { responseText?: string; response?: string; message?: string; code?: string };
  return (e?.responseText || e?.response || e?.message || e?.code || String(err)).replace(/\s+/g, ' ').slice(0, 300);
};

const uid = (req: Request) => req.user!.id;

// ─── Providers & accounts ─────────────────────────────────────────────

mailRouter.get('/providers', (_req, res) => {
  res.json({ providers: PROVIDERS });
});

const connectionSchema = z.object({
  email: z.string().trim().email().max(190),
  displayName: z.string().trim().max(120).nullable().optional(),
  provider: z.enum(['GMAIL', 'OUTLOOK', 'YANDEX', 'MAILRU', 'CUSTOM']).optional(),
  imapHost: z.string().trim().min(1).max(190),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapSecure: z.boolean().default(true),
  smtpHost: z.string().trim().min(1).max(190),
  smtpPort: z.number().int().min(1).max(65535).default(465),
  smtpSecure: z.boolean().default(true),
  username: z.string().trim().min(1).max(190),
  password: z.string().min(1).max(500),
});

const accountCreateSchema = connectionSchema.extend({
  signatureHtml: html.nullable().optional(),
  isDefault: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
});

const accountPatchSchema = accountCreateSchema.partial();

mailRouter.get('/accounts', async (req, res) => {
  const accounts = await prisma.mailAccount.findMany({ where: { userId: uid(req) }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  res.json({ accounts: accounts.map(accountDto) });
});

/** Tries IMAP login and SMTP verify() without saving anything. */
mailRouter.post('/accounts/test', async (req, res) => {
  const body = parse(connectionSchema, req.body);
  const result: { imap: { ok: boolean; error?: string }; smtp: { ok: boolean; error?: string } } = { imap: { ok: false }, smtp: { ok: false } };
  try {
    await verifyImap({ host: body.imapHost, port: body.imapPort, secure: body.imapSecure, username: body.username, password: body.password });
    result.imap.ok = true;
  } catch (err) {
    result.imap.error = errorText(err);
  }
  try {
    await verifySmtp({ host: body.smtpHost, port: body.smtpPort, secure: body.smtpSecure, username: body.username, password: body.password });
    result.smtp.ok = true;
  } catch (err) {
    result.smtp.error = errorText(err);
  }
  res.json({ ok: result.imap.ok && result.smtp.ok, ...result });
});

mailRouter.post('/accounts', async (req, res) => {
  const body = parse(accountCreateSchema, req.body);
  const email = normalizeEmail(body.email);
  const existing = await prisma.mailAccount.findUnique({ where: { userId_email: { userId: uid(req), email } } });
  if (existing) throw new HttpError(409, 'MAIL_ACCOUNT_EXISTS');
  const count = await prisma.mailAccount.count({ where: { userId: uid(req) } });
  const isDefault = body.isDefault ?? count === 0;
  const account = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.mailAccount.updateMany({ where: { userId: uid(req) }, data: { isDefault: false } });
    return tx.mailAccount.create({
      data: {
        userId: uid(req),
        email,
        displayName: body.displayName ?? null,
        provider: (body.provider ?? providerForEmail(email)) as MailProvider,
        imapHost: body.imapHost,
        imapPort: body.imapPort,
        imapSecure: body.imapSecure,
        smtpHost: body.smtpHost,
        smtpPort: body.smtpPort,
        smtpSecure: body.smtpSecure,
        username: body.username,
        passwordEnc: seal(body.password),
        signatureHtml: body.signatureHtml ? sanitizeMailHtml(body.signatureHtml, { keepRemoteImages: true }) : null,
        isDefault,
        syncEnabled: body.syncEnabled ?? true,
      },
    });
  });
  await audit(req, 'MAIL_ACCOUNT_CREATED', account.id, { email });
  if (account.syncEnabled) void syncAccount(account.id).catch(() => undefined);
  res.status(201).json({ account: accountDto(account) });
});

mailRouter.patch('/accounts/:id', async (req, res) => {
  const account = await loadOwnAccount(req.params.id, uid(req));
  const body = parse(accountPatchSchema, req.body);
  const data: Prisma.MailAccountUpdateInput = {};
  if (body.email !== undefined) data.email = normalizeEmail(body.email);
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.provider !== undefined) data.provider = body.provider as MailProvider;
  for (const k of ['imapHost', 'imapPort', 'imapSecure', 'smtpHost', 'smtpPort', 'smtpSecure', 'username', 'syncEnabled'] as const) {
    if (body[k] !== undefined) (data as Record<string, unknown>)[k] = body[k];
  }
  if (body.password !== undefined) data.passwordEnc = seal(body.password);
  if (body.signatureHtml !== undefined) data.signatureHtml = body.signatureHtml ? sanitizeMailHtml(body.signatureHtml, { keepRemoteImages: true }) : null;
  if (body.isDefault !== undefined) data.isDefault = body.isDefault;
  const updated = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await tx.mailAccount.updateMany({ where: { userId: uid(req), id: { not: account.id } }, data: { isDefault: false } });
    return tx.mailAccount.update({ where: { id: account.id }, data });
  });
  await audit(req, 'MAIL_ACCOUNT_UPDATED', account.id, { fields: Object.keys(data) });
  res.json({ account: accountDto(updated) });
});

mailRouter.delete('/accounts/:id', async (req, res) => {
  const account = await loadOwnAccount(req.params.id, uid(req));
  const keys = await prisma.mailAttachment.findMany({ where: { message: { accountId: account.id }, storageKey: { not: null } }, select: { storageKey: true } });
  await prisma.mailAccount.delete({ where: { id: account.id } });
  await removeMailStored(keys.map((k) => k.storageKey));
  if (account.isDefault) {
    const next = await prisma.mailAccount.findFirst({ where: { userId: uid(req) }, orderBy: { createdAt: 'asc' } });
    if (next) await prisma.mailAccount.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  await audit(req, 'MAIL_ACCOUNT_DELETED', account.id, { email: account.email });
  res.json({ ok: true });
});

mailRouter.post('/accounts/:id/sync', async (req, res) => {
  const account = await loadOwnAccount(req.params.id, uid(req));
  const result = await syncAccount(account.id);
  const fresh = await prisma.mailAccount.findUnique({ where: { id: account.id } });
  res.json({ ...result, account: fresh ? accountDto(fresh) : null });
});

/** ADMIN+: every account's health (owner, provider, sync status) — never passwords or messages. */
mailRouter.get('/admin/accounts', requireMinRole('ADMIN'), async (_req, res) => {
  const accounts = await prisma.mailAccount.findMany({
    orderBy: [{ user: { lastName: 'asc' } }, { createdAt: 'asc' }],
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, _count: { select: { messages: true, folders: true } } },
  });
  res.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      provider: a.provider,
      syncEnabled: a.syncEnabled,
      syncStatus: a.syncStatus,
      syncError: a.syncError,
      lastSyncAt: a.lastSyncAt,
      createdAt: a.createdAt,
      messages: a._count.messages,
      folders: a._count.folders,
      user: a.user,
    })),
  });
});

// ─── Folders, views, summary ──────────────────────────────────────────

const VIEWS = ['inbox', 'unread', 'flagged', 'snoozed', 'drafts', 'sent', 'archive', 'junk', 'trash', 'all'] as const;
type View = (typeof VIEWS)[number];

const ownAccountIds = async (userId: string, accountId?: string) => {
  const rows = await prisma.mailAccount.findMany({ where: { userId, ...(accountId ? { id: accountId } : {}) }, select: { id: true } });
  if (accountId && !rows.length) throw notFound('MAIL_ACCOUNT_NOT_FOUND');
  return rows.map((r) => r.id);
};

const viewCounts = async (accountIds: string[]) => {
  const base = { accountId: { in: accountIds }, isDraft: false };
  const [inbox, unread, flagged, snoozed, drafts] = await Promise.all([
    prisma.mailMessage.count({ where: { ...base, folder: { role: 'INBOX' }, seen: false, snoozedUntil: null } }),
    prisma.mailMessage.count({ where: { ...base, seen: false, snoozedUntil: null, folder: { role: { notIn: ['TRASH', 'JUNK'] } } } }),
    prisma.mailMessage.count({ where: { ...base, flagged: true, snoozedUntil: null, folder: { role: { notIn: ['TRASH', 'JUNK'] } } } }),
    prisma.mailMessage.count({ where: { accountId: { in: accountIds }, snoozedUntil: { not: null } } }),
    prisma.mailMessage.count({ where: { accountId: { in: accountIds }, isDraft: true } }),
  ]);
  return { inbox, unread, flagged, snoozed, drafts };
};

mailRouter.get('/folders', async (req, res) => {
  const q = parse(z.object({ accountId: id.optional() }), req.query);
  const accounts = await prisma.mailAccount.findMany({ where: { userId: uid(req) }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  const accountIds = q.accountId ? accounts.filter((a) => a.id === q.accountId).map((a) => a.id) : accounts.map((a) => a.id);
  if (q.accountId && !accountIds.length) throw notFound('MAIL_ACCOUNT_NOT_FOUND');
  const [folders, labels, labelCounts, views] = await Promise.all([
    prisma.mailFolder.findMany({ where: { accountId: { in: accountIds } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.mailLabel.findMany({ where: { userId: uid(req) }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.mailMessageLabel.groupBy({ by: ['labelId'], where: { message: { accountId: { in: accountIds }, seen: false } }, _count: { _all: true } }),
    viewCounts(accountIds),
  ]);
  const unreadByLabel = new Map(labelCounts.map((c) => [c.labelId, c._count._all]));
  res.json({
    accounts: accounts.map(accountDto),
    folders: folders.map(folderDto),
    labels: labels.map((l) => ({ ...labelDto(l), unread: unreadByLabel.get(l.id) ?? 0 })),
    views,
  });
});

/** Unread per account + total (workspace rail badge). */
mailRouter.get('/summary', async (req, res) => {
  const accounts = await prisma.mailAccount.findMany({ where: { userId: uid(req) }, select: { id: true, email: true, syncStatus: true }, orderBy: { createdAt: 'asc' } });
  const counts = accounts.length
    ? await prisma.mailMessage.groupBy({
        by: ['accountId'],
        where: { accountId: { in: accounts.map((a) => a.id) }, seen: false, isDraft: false, snoozedUntil: null, folder: { role: 'INBOX' } },
        _count: { _all: true },
      })
    : [];
  const byAccount = new Map(counts.map((c) => [c.accountId, c._count._all]));
  const list = accounts.map((a) => ({ id: a.id, email: a.email, syncStatus: a.syncStatus, unread: byAccount.get(a.id) ?? 0 }));
  res.json({ unread: list.reduce((s, a) => s + a.unread, 0), total: list.reduce((s, a) => s + a.unread, 0), accounts: list });
});

// ─── Message listing & search ─────────────────────────────────────────

const listSchema = z.object({
  accountId: id.optional(),
  folderId: id.optional(),
  view: z.enum(VIEWS).optional(),
  labelId: id.optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().trim().max(190).optional(),
  to: z.string().trim().max(190).optional(),
  hasAttachments: z.enum(['1', 'true']).optional(),
  unread: z.enum(['1', 'true']).optional(),
  threads: z.enum(['1', 'true']).optional(),
  cursor: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const encodeCursor = (m: { date: Date; id: string }) => `${m.date.getTime()}_${m.id}`;
const decodeCursor = (c: string | undefined) => {
  if (!c) return null;
  const m = /^(\d{1,16})_([A-Za-z0-9]{1,40})$/.exec(c);
  return m ? { date: new Date(Number(m[1])), id: m[2]! } : null;
};

const ftTerms = (q: string) =>
  q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length >= 2)
    .slice(0, 8);

/** Message ids matching q/from/to inside the given accounts (fulltext ∪ LIKE), newest first. */
const searchIds = async (accountIds: string[], q?: string, from?: string, to?: string): Promise<string[]> => {
  if (!accountIds.length) return [];
  const ids = new Set<string>();
  if (q) {
    const terms = ftTerms(q);
    if (terms.length) {
      try {
        const rows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM MailMessage
          WHERE accountId IN (${Prisma.join(accountIds)})
            AND MATCH(subject, text) AGAINST (${terms.map((t) => `+${t}*`).join(' ')} IN BOOLEAN MODE)
          ORDER BY date DESC LIMIT 1000`;
        for (const r of rows) ids.add(r.id);
      } catch (err) {
        console.error('[mail] fulltext search failed, falling back to LIKE', (err as Error).message);
      }
    }
    const like = await prisma.mailMessage.findMany({
      where: { accountId: { in: accountIds }, OR: [{ subject: { contains: q } }, { fromAddr: { contains: q } }, { fromName: { contains: q } }, ...(ids.size ? [] : [{ text: { contains: q } }])] },
      orderBy: { date: 'desc' },
      take: 500,
      select: { id: true },
    });
    for (const r of like) ids.add(r.id);
  }
  let result = q ? [...ids] : null;
  if (from) {
    const rows = await prisma.mailMessage.findMany({
      where: { accountId: { in: accountIds }, ...(result ? { id: { in: result } } : {}), OR: [{ fromAddr: { contains: from } }, { fromName: { contains: from } }] },
      take: 1000,
      select: { id: true },
    });
    result = rows.map((r) => r.id);
  }
  if (to) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM MailMessage WHERE accountId IN (${Prisma.join(accountIds)})
        ${result ? Prisma.sql`AND id IN (${result.length ? Prisma.join(result) : Prisma.sql`''`})` : Prisma.empty}
        AND (JSON_SEARCH(LOWER(toList), 'one', ${`%${to.toLowerCase()}%`}) IS NOT NULL OR JSON_SEARCH(LOWER(IFNULL(ccList, '[]')), 'one', ${`%${to.toLowerCase()}%`}) IS NOT NULL)
      ORDER BY date DESC LIMIT 1000`;
    result = rows.map((r) => r.id);
  }
  return result ?? [];
};

const listWhere = async (userId: string, q: z.infer<typeof listSchema>): Promise<Prisma.MailMessageWhereInput> => {
  const accountIds = await ownAccountIds(userId, q.accountId);
  const and: Prisma.MailMessageWhereInput[] = [{ accountId: { in: accountIds } }];
  let view: View | null = q.view ?? null;
  if (q.folderId) {
    const folder = await prisma.mailFolder.findFirst({ where: { id: q.folderId, accountId: { in: accountIds } } });
    if (!folder) throw notFound('MAIL_FOLDER_NOT_FOUND');
    and.push({ folderId: folder.id });
    if (folder.role !== 'DRAFTS') and.push({ isDraft: false });
    view = null;
  } else if (!view && !q.labelId && !q.q && !q.from && !q.to) view = 'inbox';
  const roleIs = (role: MailFolderRole) => ({ folder: { role } });
  switch (view) {
    case 'inbox':
      and.push(roleIs('INBOX'), { isDraft: false });
      break;
    case 'unread':
      and.push({ seen: false, isDraft: false, folder: { role: { notIn: ['TRASH', 'JUNK'] } } });
      break;
    case 'flagged':
      and.push({ flagged: true, folder: { role: { notIn: ['TRASH', 'JUNK'] } } });
      break;
    case 'drafts':
      and.push({ isDraft: true });
      break;
    case 'sent':
    case 'archive':
    case 'junk':
    case 'trash':
      and.push(roleIs(view.toUpperCase() as MailFolderRole), { isDraft: false });
      break;
    case 'all':
      and.push({ folder: { role: { notIn: ['TRASH', 'JUNK'] } } });
      break;
    case 'snoozed':
    case null:
      break;
  }
  if (view === 'snoozed') and.push({ snoozedUntil: { not: null } });
  else and.push({ snoozedUntil: null });
  if (q.labelId) and.push({ labels: { some: { labelId: q.labelId, label: { userId } } } });
  if (q.hasAttachments) and.push({ hasAttachments: true });
  if (q.unread) and.push({ seen: false });
  if (q.q || q.from || q.to) and.push({ id: { in: await searchIds(accountIds, q.q, q.from, q.to) } });
  return { AND: and };
};

mailRouter.get('/messages', async (req, res) => {
  const q = parse(listSchema, req.query);
  const where = await listWhere(uid(req), q);
  const cursor = decodeCursor(q.cursor);
  const threads = !!q.threads;
  const take = threads ? Math.min(400, q.limit * 6) : q.limit;
  const rows = await prisma.mailMessage.findMany({
    where: cursor ? { AND: [where, { OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }] }] } : where,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    skip: !cursor && q.page ? (q.page - 1) * q.limit : 0,
    take: take + 1,
    include: messageInclude,
  });
  const hasMore = rows.length > take;
  const window = hasMore ? rows.slice(0, take) : rows;
  let items: ReturnType<typeof messageListDto>[];
  let nextCursor: string | null = null;
  if (threads) {
    const groups = new Map<string, { latest: MessageRow; count: number; unread: number; flagged: boolean; hasAttachments: boolean }>();
    for (const m of window) {
      const key = m.threadKey ?? m.id;
      const g = groups.get(key);
      if (g) {
        g.count++;
        if (!m.seen) g.unread++;
        g.flagged ||= m.flagged;
        g.hasAttachments ||= m.hasAttachments;
      } else groups.set(key, { latest: m, count: 1, unread: m.seen ? 0 : 1, flagged: m.flagged, hasAttachments: m.hasAttachments });
    }
    const list = [...groups.values()].slice(0, q.limit);
    items = list.map((g) => ({ ...messageListDto(g.latest, { threadCount: g.count }), seen: g.unread === 0, flagged: g.flagged, hasAttachments: g.hasAttachments }));
    const consumed = list.length < groups.size ? window.findIndex((m) => (m.threadKey ?? m.id) === [...groups.keys()][list.length]) : window.length;
    const last = window[Math.max(0, consumed - 1)];
    nextCursor = last && (hasMore || list.length < groups.size) ? encodeCursor(last) : null;
  } else {
    items = window.map((m) => messageListDto(m));
    nextCursor = hasMore && window.length ? encodeCursor(window[window.length - 1]!) : null;
  }
  const total = q.page ? await prisma.mailMessage.count({ where }) : undefined;
  res.json({ items, nextCursor, ...(total !== undefined ? { total } : {}) });
});

mailRouter.get('/messages/:id', async (req, res) => {
  const m = await loadOwnMessage(req.params.id, uid(req));
  const account = await prisma.mailAccount.findUnique({ where: { id: m.accountId }, select: { email: true } });
  const correspondents = dedupeAddresses([...(m.fromAddr ? [{ name: m.fromName ?? '', address: m.fromAddr }] : []), ...asAddressList(m.toList), ...asAddressList(m.ccList)], [account?.email ?? '']);
  void rememberCorrespondents(uid(req), correspondents, [account?.email ?? '']);
  res.json({ message: messageDetailDto(m) });
});

mailRouter.get('/messages/:id/thread', async (req, res) => {
  const m = await loadOwnMessage(req.params.id, uid(req));
  const rows = m.threadKey
    ? await prisma.mailMessage.findMany({ where: { accountId: m.accountId, threadKey: m.threadKey, isDraft: false }, orderBy: [{ date: 'asc' }, { id: 'asc' }], take: 100, include: messageInclude })
    : [m];
  res.json({ messages: rows.map(messageDetailDto) });
});

// ─── Actions (single + bulk) ──────────────────────────────────────────

const ACTIONS = ['read', 'unread', 'flag', 'unflag', 'move', 'trash', 'archive', 'snooze', 'unsnooze', 'label', 'unlabel', 'delete', 'spam'] as const;
type Action = (typeof ACTIONS)[number];

const actionSchema = z.object({
  ids: z.array(id).min(1).max(200),
  action: z.enum(ACTIONS),
  folderId: id.optional(),
  labelId: id.optional(),
  until: z.string().datetime({ offset: true }).optional(),
  preset: z.enum(SNOOZE_PRESETS).optional(),
  tzOffset: z.number().int().min(-840).max(840).optional(),
});

type Flagged = { id: string; uid: bigint | null; folderId: string; accountId: string; folder: { path: string; role: MailFolderRole }; isDraft: boolean };

/** Groups rows by (account, folder) for the remote mirror; local placeholder folders and drafts are skipped. */
const remoteGroups = (rows: Flagged[]) => {
  const groups = new Map<string, { accountId: string; path: string; uids: number[] }>();
  for (const r of rows) {
    if (r.uid === null || isLocalFolder(r.folder) || r.isDraft) continue;
    const key = `${r.accountId}|${r.folder.path}`;
    const g = groups.get(key) ?? { accountId: r.accountId, path: r.folder.path, uids: [] };
    g.uids.push(Number(r.uid));
    groups.set(key, g);
  }
  return [...groups.values()];
};

const mirrorFlags = (rows: Flagged[], add: string[], remove: string[] = []) => {
  for (const g of remoteGroups(rows)) {
    enqueueRemote(g.accountId, async () => {
      await withRemote(g.accountId, async (c) => {
        if (add.length) await c.addFlags(g.path, g.uids, add);
        if (remove.length) await c.removeFlags(g.path, g.uids, remove);
      });
    });
  }
};

/** Moves rows to `dest` (same account); the server move is queued per source folder. */
const moveRows = async (rows: Flagged[], dest: { id: string; path: string; accountId: string }) => {
  const mine = rows.filter((r) => r.accountId === dest.accountId && r.folderId !== dest.id);
  if (!mine.length) return [];
  await prisma.mailMessage.updateMany({ where: { id: { in: mine.map((r) => r.id) } }, data: { folderId: dest.id, uid: null, snoozedUntil: null } });
  if (!isLocalFolder(dest)) {
    for (const g of remoteGroups(mine)) {
      enqueueRemote(g.accountId, async () => {
        await withRemote(g.accountId, (c) => c.move(g.path, g.uids, dest.path));
      });
    }
  }
  return [...new Set([...mine.map((r) => r.folderId), dest.id])];
};

const applyAction = async (req: Request, input: z.infer<typeof actionSchema>) => {
  const userId = uid(req);
  const rows = await prisma.mailMessage.findMany({
    where: { id: { in: input.ids }, account: { userId } },
    select: { id: true, uid: true, folderId: true, accountId: true, isDraft: true, folder: { select: { path: true, role: true } } },
  });
  if (rows.length !== new Set(input.ids).size) throw notFound('MAIL_MESSAGE_NOT_FOUND');
  const ids = rows.map((r) => r.id);
  const touched = new Set<string>(rows.map((r) => r.folderId));
  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const action: Action = input.action;
  switch (action) {
    case 'read':
    case 'unread': {
      await prisma.mailMessage.updateMany({ where: { id: { in: ids } }, data: { seen: action === 'read' } });
      mirrorFlags(rows, action === 'read' ? ['\\Seen'] : [], action === 'unread' ? ['\\Seen'] : []);
      break;
    }
    case 'flag':
    case 'unflag': {
      await prisma.mailMessage.updateMany({ where: { id: { in: ids } }, data: { flagged: action === 'flag' } });
      mirrorFlags(rows, action === 'flag' ? ['\\Flagged'] : [], action === 'unflag' ? ['\\Flagged'] : []);
      break;
    }
    case 'move': {
      if (!input.folderId) throw badRequest('FOLDER_REQUIRED');
      const dest = await prisma.mailFolder.findFirst({ where: { id: input.folderId, account: { userId } } });
      if (!dest) throw notFound('MAIL_FOLDER_NOT_FOUND');
      if (rows.some((r) => r.accountId !== dest.accountId)) throw badRequest('CROSS_ACCOUNT_MOVE');
      for (const f of await moveRows(rows, dest)) touched.add(f);
      break;
    }
    case 'trash':
    case 'archive':
    case 'spam': {
      const role = action === 'trash' ? 'TRASH' : action === 'archive' ? 'ARCHIVE' : 'JUNK';
      for (const accountId of accountIds) {
        const mine = rows.filter((r) => r.accountId === accountId);
        // Trashing what is already in the bin deletes it for good.
        const already = mine.filter((r) => r.folder.role === role);
        const rest = mine.filter((r) => r.folder.role !== role);
        if (already.length && action === 'trash') {
          await deleteRows(already);
        }
        if (rest.length) {
          const dest = await ensureRoleFolder(accountId, role);
          for (const f of await moveRows(rest, dest)) touched.add(f);
        }
      }
      break;
    }
    case 'delete':
      await deleteRows(rows);
      break;
    case 'snooze': {
      const until = input.until ? new Date(input.until) : input.preset ? snoozeUntil(input.preset, new Date(), input.tzOffset ?? 0) : null;
      if (!until || Number.isNaN(until.getTime())) throw badRequest('UNTIL_REQUIRED');
      if (until.getTime() <= Date.now()) throw badRequest('UNTIL_IN_PAST');
      await prisma.mailMessage.updateMany({ where: { id: { in: ids } }, data: { snoozedUntil: until } });
      break;
    }
    case 'unsnooze':
      await prisma.mailMessage.updateMany({ where: { id: { in: ids } }, data: { snoozedUntil: null } });
      break;
    case 'label':
    case 'unlabel': {
      if (!input.labelId) throw badRequest('LABEL_REQUIRED');
      const label = await prisma.mailLabel.findFirst({ where: { id: input.labelId, userId } });
      if (!label) throw notFound('MAIL_LABEL_NOT_FOUND');
      if (action === 'label') await prisma.mailMessageLabel.createMany({ data: ids.map((messageId) => ({ messageId, labelId: label.id })), skipDuplicates: true });
      else await prisma.mailMessageLabel.deleteMany({ where: { messageId: { in: ids }, labelId: label.id } });
      break;
    }
  }
  await recountFolders([...touched]);
  for (const accountId of accountIds) publish(userId, 'mail.updated', { accountId, reason: action, messageIds: ids });
  return ids;
};

/** Permanent local delete + \Deleted flag on the server. */
const deleteRows = async (rows: Flagged[]) => {
  const ids = rows.map((r) => r.id);
  const keys = await prisma.mailAttachment.findMany({ where: { messageId: { in: ids }, storageKey: { not: null } }, select: { storageKey: true } });
  await prisma.mailMessage.deleteMany({ where: { id: { in: ids } } });
  await removeMailStored(keys.map((k) => k.storageKey));
  for (const g of remoteGroups(rows)) {
    enqueueRemote(g.accountId, async () => {
      await withRemote(g.accountId, (c) => c.addFlags(g.path, g.uids, ['\\Deleted']));
    });
  }
};

mailRouter.post('/messages/bulk', async (req, res) => {
  const input = parse(actionSchema, req.body);
  const ids = await applyAction(req, input);
  res.json({ ok: true, ids });
});

const single = (action: Action, body?: (req: Request) => Partial<z.infer<typeof actionSchema>>) => async (req: Request, res: Response) => {
  const extra = body ? body(req) : {};
  const messageId = String(req.params.id);
  await applyAction(req, parse(actionSchema, { ids: [messageId], action, ...extra }));
  const m = await prisma.mailMessage.findFirst({ where: { id: messageId, account: { userId: uid(req) } }, include: messageInclude });
  res.json({ ok: true, message: m ? messageDetailDto(m) : null });
};

const pick = (req: Request) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ['folderId', 'labelId', 'until', 'preset', 'tzOffset']) if (b[k] !== undefined) out[k] = b[k];
  return out as Partial<z.infer<typeof actionSchema>>;
};

mailRouter.post('/messages/:id/read', single('read'));
mailRouter.post('/messages/:id/unread', single('unread'));
mailRouter.post('/messages/:id/flag', single('flag'));
mailRouter.post('/messages/:id/unflag', single('unflag'));
mailRouter.post('/messages/:id/move', single('move', pick));
mailRouter.post('/messages/:id/trash', single('trash'));
mailRouter.post('/messages/:id/archive', single('archive'));
mailRouter.post('/messages/:id/spam', single('spam'));
mailRouter.post('/messages/:id/snooze', single('snooze', pick));
mailRouter.post('/messages/:id/unsnooze', single('unsnooze'));
mailRouter.delete('/messages/:id', single('delete'));

mailRouter.post('/messages/:id/labels', async (req, res) => {
  const body = parse(z.object({ add: z.array(id).max(50).default([]), remove: z.array(id).max(50).default([]) }), req.body);
  const m = await loadOwnMessage(req.params.id, uid(req));
  const labels = await prisma.mailLabel.findMany({ where: { userId: uid(req), id: { in: [...body.add, ...body.remove] } }, select: { id: true } });
  const known = new Set(labels.map((l) => l.id));
  if ([...body.add, ...body.remove].some((l) => !known.has(l))) throw notFound('MAIL_LABEL_NOT_FOUND');
  await prisma.$transaction([
    prisma.mailMessageLabel.createMany({ data: body.add.map((labelId) => ({ messageId: m.id, labelId })), skipDuplicates: true }),
    prisma.mailMessageLabel.deleteMany({ where: { messageId: m.id, labelId: { in: body.remove } } }),
  ]);
  const fresh = await loadOwnMessage(m.id, uid(req));
  publish(uid(req), 'mail.updated', { accountId: m.accountId, reason: 'label', messageIds: [m.id] });
  res.json({ message: messageDetailDto(fresh) });
});

mailRouter.post('/messages/:id/link-case', async (req, res) => {
  const body = parse(z.object({ caseId: id.nullable() }), req.body);
  const m = await loadOwnMessage(req.params.id, uid(req));
  if (body.caseId) {
    const c = await prisma.case.findUnique({ where: { id: body.caseId }, select: { id: true } });
    if (!c) throw badRequest('INVALID_CASE');
  }
  await prisma.mailMessage.update({ where: { id: m.id }, data: { caseId: body.caseId } });
  await audit(req, body.caseId ? 'MAIL_LINKED_CASE' : 'MAIL_UNLINKED_CASE', m.id, { caseId: body.caseId });
  res.json({ message: messageDetailDto(await loadOwnMessage(m.id, uid(req))) });
});

// ─── Attachments ──────────────────────────────────────────────────────

const sendStored = (res: Response, absPath: string, name: string, mime: string, inline: boolean) => {
  res.setHeader('Content-Type', mime.startsWith('text/') ? `${mime}; charset=utf-8` : mime);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(absPath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_MISSING_ON_DISK' });
  });
};

const loadOwnAttachment = async (attachmentId: string, userId: string) => {
  const a = await prisma.mailAttachment.findFirst({ where: { id: attachmentId, message: { account: { userId } } }, include: { message: { select: { uid: true, accountId: true, folder: { select: { path: true } } } } } });
  if (!a) throw notFound('ATTACHMENT_NOT_FOUND');
  return a;
};

mailRouter.get('/attachments/:id', async (req, res) => {
  const a = await loadOwnAttachment(req.params.id, uid(req));
  const key = await ensureAttachmentBytes(a);
  const inline = req.query.inline === '1' && INLINE_MIME.has(a.mimeType);
  sendStored(res, mailPath(key), a.filename, inline ? a.mimeType : 'application/octet-stream', inline);
});

/** Inline (cid:) images referenced by a message body. */
mailRouter.get('/inline/:id', async (req, res) => {
  const a = await loadOwnAttachment(req.params.id, uid(req));
  if (!a.mimeType.startsWith('image/') || a.mimeType === 'image/svg+xml') throw notFound('ATTACHMENT_NOT_FOUND');
  const key = await ensureAttachmentBytes(a);
  sendStored(res, mailPath(key), a.filename, a.mimeType, true);
});

// ─── Drafts & sending ─────────────────────────────────────────────────

const draftSchema = z.object({
  accountId: id,
  to: addressList,
  cc: addressList,
  bcc: addressList,
  subject: z.string().max(1000).default(''),
  html: html.default(''),
  replyToMessageId: id.nullable().optional(),
  forwardOfMessageId: id.nullable().optional(),
});

const draftData = async (userId: string, body: z.infer<typeof draftSchema>) => {
  const account = await loadOwnAccount(body.accountId, userId);
  const original = body.replyToMessageId ? await prisma.mailMessage.findFirst({ where: { id: body.replyToMessageId, accountId: account.id } }) : null;
  if (body.replyToMessageId && !original) throw notFound('MAIL_MESSAGE_NOT_FOUND');
  const clean = sanitizeMailHtml(body.html, { keepRemoteImages: true });
  const text = htmlToText(clean);
  const to = toAddresses(body.to);
  const cc = toAddresses(body.cc);
  const bcc = toAddresses(body.bcc);
  return {
    account,
    data: {
      subject: body.subject.trim() || null,
      toList: to as unknown as Prisma.InputJsonValue,
      ccList: cc as unknown as Prisma.InputJsonValue,
      bccList: bcc as unknown as Prisma.InputJsonValue,
      html: clean,
      text,
      snippet: snippetOf(text, clean),
      inReplyTo: original?.messageId ?? null,
      refs: original ? [original.refs, original.messageId ? `<${original.messageId}>` : ''].filter(Boolean).join(' ') || null : null,
      threadKey: original?.threadKey ?? null,
      caseId: original?.caseId ?? null,
      fromName: account.displayName ?? null,
      fromAddr: account.email,
      date: new Date(),
    },
  };
};

mailRouter.post('/drafts', async (req, res) => {
  const body = parse(draftSchema, req.body);
  const { account, data } = await draftData(uid(req), body);
  const folder = await ensureRoleFolder(account.id, 'DRAFTS');
  const draft = await prisma.mailMessage.create({
    data: { ...data, accountId: account.id, folderId: folder.id, uid: null, isDraft: true, seen: true, threadKey: data.threadKey ?? threadKeyOf({ subject: data.subject, fromAddr: account.email }) },
    include: messageInclude,
  });
  await recountFolders([folder.id]);
  res.status(201).json({ draft: messageDetailDto(draft) });
});

const loadOwnDraft = async (draftId: string, userId: string) => {
  const d = await prisma.mailMessage.findFirst({ where: { id: draftId, isDraft: true, account: { userId } }, include: messageInclude });
  if (!d) throw notFound('MAIL_DRAFT_NOT_FOUND');
  return d;
};

mailRouter.patch('/drafts/:id', async (req, res) => {
  const draft = await loadOwnDraft(req.params.id, uid(req));
  const body = parse(draftSchema.omit({ accountId: true }).partial(), req.body);
  const { data } = await draftData(uid(req), { ...body, accountId: draft.accountId, to: body.to ?? [], cc: body.cc ?? [], bcc: body.bcc ?? [], subject: body.subject ?? '', html: body.html ?? '' });
  const patch: Prisma.MailMessageUncheckedUpdateInput = {};
  if (body.subject !== undefined) patch.subject = data.subject;
  if (body.to !== undefined) patch.toList = data.toList;
  if (body.cc !== undefined) patch.ccList = data.ccList;
  if (body.bcc !== undefined) patch.bccList = data.bccList;
  if (body.html !== undefined) {
    patch.html = data.html;
    patch.text = data.text;
    patch.snippet = data.snippet;
  }
  if (body.replyToMessageId !== undefined) {
    patch.inReplyTo = data.inReplyTo;
    patch.refs = data.refs;
    if (data.threadKey) patch.threadKey = data.threadKey;
  }
  patch.date = new Date();
  const updated = await prisma.mailMessage.update({ where: { id: draft.id }, data: patch, include: messageInclude });
  res.json({ draft: messageDetailDto(updated) });
});

mailRouter.delete('/drafts/:id', async (req, res) => {
  const draft = await loadOwnDraft(req.params.id, uid(req));
  await prisma.mailMessage.delete({ where: { id: draft.id } });
  await removeMailStored(draft.attachments.map((a) => a.storageKey));
  await recountFolders([draft.folderId]);
  res.json({ ok: true });
});

const draftUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(incomingDir, { recursive: true });
      cb(null, incomingDir);
    },
    filename: (_req, _file, cb) => cb(null, `mail-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`),
  }),
  limits: { fileSize: mailSettings.attachmentMaxBytes, files: 1, fields: 5, fieldSize: 4096 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && WORKSPACE_MIME.has(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

mailRouter.post('/drafts/:id/attachments', draftUpload.single('file'), async (req, res) => {
  const draft = await loadOwnDraft(String(req.params.id), uid(req));
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  const name = decodeOriginalName(file.originalname).replace(/[\r\n\0/\\]/g, '_').slice(0, 255) || 'attachment';
  try {
    await verifyStoredFile(file.path, file.mimetype);
  } catch (err) {
    await fsp.unlink(file.path).catch(() => undefined);
    if (err instanceof FileCheckError) throw badRequest(err.code);
    throw err;
  }
  const key = await adoptMailUpload(file.path);
  const attachment = await prisma.mailAttachment.create({ data: { messageId: draft.id, filename: name, mimeType: file.mimetype, size: file.size, inline: false, storageKey: key } });
  await prisma.mailMessage.update({ where: { id: draft.id }, data: { hasAttachments: true } });
  res.status(201).json({ attachment: attachmentDto(attachment) });
});

mailRouter.delete('/drafts/:id/attachments/:aid', async (req, res) => {
  const draft = await loadOwnDraft(req.params.id, uid(req));
  const a = draft.attachments.find((x) => x.id === req.params.aid);
  if (!a) throw notFound('ATTACHMENT_NOT_FOUND');
  await prisma.mailAttachment.delete({ where: { id: a.id } });
  await removeMailStored([a.storageKey]);
  await prisma.mailMessage.update({ where: { id: draft.id }, data: { hasAttachments: draft.attachments.length > 1 } });
  res.json({ ok: true });
});

const sendSchema = z.object({
  accountId: id,
  to: addressList,
  cc: addressList,
  bcc: addressList,
  subject: z.string().trim().max(1000).default(''),
  html: html,
  text: z.string().max(2_000_000).nullable().optional(),
  draftId: id.nullable().optional(),
  replyToMessageId: id.nullable().optional(),
  forwardOfMessageId: id.nullable().optional(),
  attachmentIds: z.array(id).max(30).default([]),
});

mailRouter.post('/send', async (req, res) => {
  const body = parse(sendSchema, req.body);
  const account = await loadOwnAccount(body.accountId, uid(req));
  const row = await sendMessage(uid(req), account, {
    to: toAddresses(body.to),
    cc: toAddresses(body.cc),
    bcc: toAddresses(body.bcc),
    subject: body.subject,
    html: body.html,
    text: body.text ?? null,
    draftId: body.draftId ?? null,
    replyToMessageId: body.replyToMessageId ?? null,
    forwardOfMessageId: body.forwardOfMessageId ?? null,
    attachmentIds: body.attachmentIds,
  });
  await audit(req, 'MAIL_SENT', row.id, { accountId: account.id, to: body.to.length + body.cc.length + body.bcc.length });
  res.status(201).json({ message: messageDetailDto(await loadOwnMessage(row.id, uid(req))) });
});

/** Recent correspondents of my mailboxes (autocomplete fallback when the address book has nothing). */
mailRouter.get('/recipients', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(120).default('') }), req.query);
  const accountIds = await ownAccountIds(uid(req));
  if (!accountIds.length) {
    res.json({ recipients: [] });
    return;
  }
  const needle = q.q.toLowerCase();
  const seen = new Map<string, { name: string; address: string }>();
  const senders = await prisma.mailMessage.findMany({
    where: { accountId: { in: accountIds }, fromAddr: { not: null }, ...(needle ? { OR: [{ fromAddr: { contains: needle } }, { fromName: { contains: needle } }] } : {}) },
    orderBy: { date: 'desc' },
    take: 60,
    select: { fromName: true, fromAddr: true },
  });
  for (const s of senders) if (s.fromAddr && !seen.has(s.fromAddr.toLowerCase())) seen.set(s.fromAddr.toLowerCase(), { name: s.fromName ?? '', address: s.fromAddr });
  const sent = await prisma.mailMessage.findMany({ where: { accountId: { in: accountIds }, folder: { role: 'SENT' } }, orderBy: { date: 'desc' }, take: 200, select: { toList: true, ccList: true } });
  for (const m of sent) {
    for (const a of [...asAddressList(m.toList), ...asAddressList(m.ccList)]) {
      const k = a.address.toLowerCase();
      if (seen.has(k)) continue;
      if (!needle || k.includes(needle) || a.name.toLowerCase().includes(needle)) seen.set(k, a);
    }
  }
  res.json({ recipients: [...seen.values()].slice(0, 10) });
});

// ─── Labels ───────────────────────────────────────────────────────────

const labelSchema = z.object({ name: z.string().trim().min(1).max(60), color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#1565e8'), sortOrder: z.number().int().min(0).max(10_000).optional() });

mailRouter.get('/labels', async (req, res) => {
  const labels = await prisma.mailLabel.findMany({ where: { userId: uid(req) }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  res.json({ labels: labels.map(labelDto) });
});

mailRouter.post('/labels', async (req, res) => {
  const body = parse(labelSchema, req.body);
  const label = await prisma.mailLabel.create({ data: { userId: uid(req), name: body.name, color: body.color, sortOrder: body.sortOrder ?? 0 } });
  res.status(201).json({ label: labelDto(label) });
});

mailRouter.patch('/labels/:id', async (req, res) => {
  const body = parse(labelSchema.partial(), req.body);
  const label = await prisma.mailLabel.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!label) throw notFound('MAIL_LABEL_NOT_FOUND');
  const updated = await prisma.mailLabel.update({ where: { id: label.id }, data: body });
  res.json({ label: labelDto(updated) });
});

mailRouter.delete('/labels/:id', async (req, res) => {
  const label = await prisma.mailLabel.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!label) throw notFound('MAIL_LABEL_NOT_FOUND');
  await prisma.mailLabel.delete({ where: { id: label.id } });
  res.json({ ok: true });
});

// ─── Rules ────────────────────────────────────────────────────────────

const ruleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  accountId: id.nullable().optional(),
  conditions: ruleConditionsSchema,
  actions: ruleActionsSchema,
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const ruleDto = (r: { id: string; name: string; enabled: boolean; accountId: string | null; conditions: unknown; actions: unknown; sortOrder: number; createdAt: Date }) => ({
  id: r.id,
  name: r.name,
  enabled: r.enabled,
  accountId: r.accountId,
  conditions: r.conditions,
  actions: r.actions,
  sortOrder: r.sortOrder,
  createdAt: r.createdAt,
});

const validateRuleRefs = async (userId: string, body: Partial<z.infer<typeof ruleSchema>>) => {
  if (body.accountId) await loadOwnAccount(body.accountId, userId);
  if (body.actions?.addLabelId && !(await prisma.mailLabel.findFirst({ where: { id: body.actions.addLabelId, userId } }))) throw badRequest('INVALID_LABEL');
  if (body.actions?.moveToFolderId && !(await prisma.mailFolder.findFirst({ where: { id: body.actions.moveToFolderId, account: { userId } } }))) throw badRequest('INVALID_FOLDER');
  if (body.actions?.caseId && !(await prisma.case.findUnique({ where: { id: body.actions.caseId }, select: { id: true } }))) throw badRequest('INVALID_CASE');
};

mailRouter.get('/rules', async (req, res) => {
  const rules = await prisma.mailRule.findMany({ where: { userId: uid(req) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  res.json({ rules: rules.map(ruleDto) });
});

mailRouter.post('/rules', async (req, res) => {
  const body = parse(ruleSchema, req.body);
  await validateRuleRefs(uid(req), body);
  const rule = await prisma.mailRule.create({
    data: { userId: uid(req), name: body.name, enabled: body.enabled, accountId: body.accountId ?? null, conditions: body.conditions, actions: body.actions, sortOrder: body.sortOrder ?? 0 },
  });
  res.status(201).json({ rule: ruleDto(rule) });
});

mailRouter.patch('/rules/:id', async (req, res) => {
  const rule = await prisma.mailRule.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!rule) throw notFound('MAIL_RULE_NOT_FOUND');
  const body = parse(ruleSchema.partial(), req.body);
  await validateRuleRefs(uid(req), body);
  const updated = await prisma.mailRule.update({
    where: { id: rule.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.accountId !== undefined ? { accountId: body.accountId } : {}),
      ...(body.conditions !== undefined ? { conditions: body.conditions } : {}),
      ...(body.actions !== undefined ? { actions: body.actions } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
  });
  res.json({ rule: ruleDto(updated) });
});

mailRouter.delete('/rules/:id', async (req, res) => {
  const rule = await prisma.mailRule.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!rule) throw notFound('MAIL_RULE_NOT_FOUND');
  await prisma.mailRule.delete({ where: { id: rule.id } });
  res.json({ ok: true });
});

/** Applies one rule to the existing inbox (newest 1000 messages per account). */
mailRouter.post('/rules/:id/run', async (req, res) => {
  const rule = await prisma.mailRule.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!rule) throw notFound('MAIL_RULE_NOT_FOUND');
  const accountIds = await ownAccountIds(uid(req), rule.accountId ?? undefined);
  let matched = 0;
  for (const accountId of accountIds) {
    const inbox = await prisma.mailMessage.findMany({ where: { accountId, isDraft: false, folder: { role: 'INBOX' } }, orderBy: { date: 'desc' }, take: 1000, select: { id: true } });
    matched += await applyRules(uid(req), accountId, inbox.map((m) => m.id), rule.id);
    publish(uid(req), 'mail.updated', { accountId, reason: 'rule' });
  }
  res.json({ ok: true, matched });
});

// ─── Templates ────────────────────────────────────────────────────────

const templateSchema = z.object({ name: z.string().trim().min(1).max(80), subject: z.string().trim().max(300).nullable().optional(), html: z.string().min(1).max(60_000), shared: z.boolean().default(false) });

const templateDto = (t: { id: string; userId: string; shared: boolean; name: string; subject: string | null; html: string; updatedAt: Date; user?: { firstName: string; lastName: string } }, me: string, admin: boolean) => ({
  id: t.id,
  name: t.name,
  subject: t.subject,
  html: t.html,
  shared: t.shared,
  mine: t.userId === me,
  canEdit: t.userId === me || admin,
  author: t.user ? `${t.user.firstName} ${t.user.lastName}`.trim() : null,
  updatedAt: t.updatedAt,
});

const templateAccess = async (req: Request, templateId: string) => {
  const t = await prisma.mailTemplate.findUnique({ where: { id: templateId }, include: { user: { select: { firstName: true, lastName: true } } } });
  if (!t || (!t.shared && t.userId !== uid(req))) throw notFound('MAIL_TEMPLATE_NOT_FOUND');
  if (t.userId !== uid(req) && !hasMinRole(req.user!.role, 'ADMIN')) throw forbidden();
  return t;
};

mailRouter.get('/templates', async (req, res) => {
  const admin = hasMinRole(req.user!.role, 'ADMIN');
  const rows = await prisma.mailTemplate.findMany({ where: { OR: [{ userId: uid(req) }, { shared: true }] }, orderBy: [{ shared: 'asc' }, { name: 'asc' }], include: { user: { select: { firstName: true, lastName: true } } } });
  res.json({ templates: rows.map((t) => templateDto(t, uid(req), admin)) });
});

mailRouter.post('/templates', async (req, res) => {
  const body = parse(templateSchema, req.body);
  const t = await prisma.mailTemplate.create({
    data: { userId: uid(req), name: body.name, subject: body.subject ?? null, html: sanitizeMailHtml(body.html, { keepRemoteImages: true }), shared: body.shared },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  res.status(201).json({ template: templateDto(t, uid(req), hasMinRole(req.user!.role, 'ADMIN')) });
});

mailRouter.patch('/templates/:id', async (req, res) => {
  const t = await templateAccess(req, req.params.id);
  const body = parse(templateSchema.partial(), req.body);
  const updated = await prisma.mailTemplate.update({
    where: { id: t.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.html !== undefined ? { html: sanitizeMailHtml(body.html, { keepRemoteImages: true }) } : {}),
      ...(body.shared !== undefined ? { shared: body.shared } : {}),
    },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  res.json({ template: templateDto(updated, uid(req), hasMinRole(req.user!.role, 'ADMIN')) });
});

mailRouter.delete('/templates/:id', async (req, res) => {
  const t = await templateAccess(req, req.params.id);
  await prisma.mailTemplate.delete({ where: { id: t.id } });
  res.json({ ok: true });
});

