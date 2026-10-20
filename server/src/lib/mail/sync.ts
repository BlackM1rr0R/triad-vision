import crypto from 'node:crypto';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { MailAccount, MailFolder, MailFolderRole, Prisma } from '@prisma/client';
import type { MessageStructureObject } from 'imapflow';
import { prisma } from '../../db.js';
import { publish } from '../messaging/realtime.js';
import { fromParsed } from './address.js';
import { LOCAL_PREFIX, ROLE_ORDER, enqueueRemote, imapConnectionOf, isLocalFolder, recountFolders } from './core.js';
import { leafParts, withImap, type ImapClient, type ImapFetched, type ImapFolder } from './imap.js';
import { parseActions, ruleMatches } from './rules.js';
import { htmlToText, sanitizeMailHtml, snippetOf } from './sanitize.js';
import { mailSettings } from './settings.js';
import { storeBuffer } from './storage.js';
import { cleanMessageId, threadCandidates, threadKeyOf } from './thread.js';
// AI mail triage hook (see announceArrivals); the feature lives in lib/ai/features/mailTriage.ts.
import { detectAutoMail, onNewInboundMessage, type SkipReason } from '../ai/features/mailTriage.js';

/**
 * IMAP → database synchronisation. One run per account: list folders, fetch new messages by UID,
 * re-read the flags of the newest known messages, apply inbox rules, publish realtime events.
 * A per-account mutex keeps the scheduler and manual syncs from overlapping; errors are recorded
 * on the account (syncStatus/syncError) and never thrown out of `runMailSync`.
 */
const FETCH_BATCH = 25;

// ─── Mutex ────────────────────────────────────────────────────────────

const running = new Map<string, Promise<SyncResult>>();

export interface SyncResult {
  ok: boolean;
  error?: string;
  newMessages: number;
  folders: number;
}

export const isSyncing = (accountId: string) => running.has(accountId);

/**
 * Every run against an account's mailbox (full sync or a single-folder sync triggered by IDLE)
 * goes through this per-account queue, so two of them never work on the same account at once.
 */
const accountLocks = new Map<string, Promise<unknown>>();

const withAccountLock = <T>(accountId: string, fn: () => Promise<T>): Promise<T> => {
  const prev = accountLocks.get(accountId) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(
    () => undefined,
    () => undefined,
  );
  accountLocks.set(accountId, tail);
  void tail.then(() => {
    if (accountLocks.get(accountId) === tail) accountLocks.delete(accountId);
  });
  return p;
};

/** true while a full sync or a folder sync of the account runs or waits for its turn. */
export const isAccountBusy = (accountId: string) => accountLocks.has(accountId);

/** Syncs the account; a second call while a sync runs joins the running one. */
export const syncAccount = (accountId: string): Promise<SyncResult> => {
  const inFlight = running.get(accountId);
  if (inFlight) return inFlight;
  const p = withAccountLock(accountId, () => doSync(accountId)).finally(() => {
    if (running.get(accountId) === p) running.delete(accountId);
  });
  running.set(accountId, p);
  return p;
};

// ─── Folder roles ─────────────────────────────────────────────────────

const ROLE_BY_FLAG: Record<string, MailFolderRole> = {
  '\\Inbox': 'INBOX',
  '\\Sent': 'SENT',
  '\\Drafts': 'DRAFTS',
  '\\Trash': 'TRASH',
  '\\Junk': 'JUNK',
  '\\Archive': 'ARCHIVE',
};

const NAME_ROLES: [RegExp, MailFolderRole][] = [
  [/^inbox$/i, 'INBOX'],
  [/^(sent( items| mail| messages)?|gesendet(e objekte)?|отправленные|göndərilən(lər)?|envoyés)$/i, 'SENT'],
  [/^(drafts?|entwürfe|черновики|qaralama(lar)?|brouillons)$/i, 'DRAFTS'],
  [/^(trash|deleted( items| messages)?|bin|papierkorb|gelöscht(e elemente)?|корзина|удал[её]нные|zibil|corbeille)$/i, 'TRASH'],
  [/^(junk( e-?mail)?|spam|спам)$/i, 'JUNK'],
  [/^(archiv(e|es)?|all mail|архив|arxiv)$/i, 'ARCHIVE'],
];

export const roleOfFolder = (f: Pick<ImapFolder, 'path' | 'name' | 'specialUse'>): MailFolderRole => {
  if (f.path.toUpperCase() === 'INBOX') return 'INBOX';
  if (f.specialUse && ROLE_BY_FLAG[f.specialUse]) return ROLE_BY_FLAG[f.specialUse]!;
  for (const [re, role] of NAME_ROLES) if (re.test(f.name.trim())) return role;
  return 'OTHER';
};

/** Virtual folders that duplicate every other folder (Gmail "All Mail", "Starred"). */
const skipFolder = (f: ImapFolder) => f.noSelect || f.specialUse === '\\All' || f.specialUse === '\\Flagged' || f.specialUse === '\\Important';

const syncFolderList = async (account: MailAccount, remote: ImapFolder[]) => {
  const existing = await prisma.mailFolder.findMany({ where: { accountId: account.id } });
  const byPath = new Map(existing.map((f) => [f.path, f]));
  const taken = new Set<MailFolderRole>();
  const keep = new Set<string>();
  const result: MailFolder[] = [];
  const sorted = [...remote].filter((f) => !skipFolder(f)).sort((a, b) => ROLE_ORDER[roleOfFolder(a)] - ROLE_ORDER[roleOfFolder(b)] || a.path.localeCompare(b.path));
  let order = 0;
  for (const f of sorted) {
    let role = roleOfFolder(f);
    if (role !== 'OTHER' && taken.has(role)) role = 'OTHER';
    if (role !== 'OTHER') taken.add(role);
    keep.add(f.path);
    const data = { name: f.name, role, delimiter: f.delimiter, subscribed: f.subscribed, sortOrder: role === 'OTHER' ? 100 + order++ : ROLE_ORDER[role] };
    const current = byPath.get(f.path);
    if (current) {
      result.push(await prisma.mailFolder.update({ where: { id: current.id }, data }));
      continue;
    }
    // A local placeholder for this role (drafts/sent written before the first sync) becomes the real folder.
    const placeholder = role !== 'OTHER' ? byPath.get(`${LOCAL_PREFIX}${role}`) : undefined;
    if (placeholder) {
      byPath.delete(placeholder.path);
      result.push(await prisma.mailFolder.update({ where: { id: placeholder.id }, data: { ...data, path: f.path } }));
      continue;
    }
    result.push(await prisma.mailFolder.create({ data: { accountId: account.id, path: f.path, ...data } }));
  }
  // Folders that disappeared from the server (and are not local placeholders still in use).
  for (const f of existing) {
    if (keep.has(f.path) || isLocalFolder(f)) continue;
    if (result.some((r) => r.id === f.id)) continue;
    await prisma.mailFolder.delete({ where: { id: f.id } });
  }
  return result;
};

// ─── Message parsing / storing ────────────────────────────────────────

interface PartInfo {
  partId?: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string | null;
  inline: boolean;
}

const decodeFilename = (s: string) => s.replace(/[\r\n\0]/g, '').trim().slice(0, 255);

/** Attachment parts of a BODYSTRUCTURE (everything that is not a text body). */
const attachmentParts = (structure: MessageStructureObject | undefined): PartInfo[] => {
  const out: PartInfo[] = [];
  for (const p of leafParts(structure)) {
    const type = (p.type || 'application/octet-stream').toLowerCase();
    const disposition = (p.disposition || '').toLowerCase();
    const name = p.dispositionParameters?.filename || p.parameters?.name || '';
    const isText = type === 'text/plain' || type === 'text/html';
    if (isText && disposition !== 'attachment' && !name) continue;
    if (type.startsWith('multipart/')) continue;
    const contentId = cleanMessageId(p.id);
    const inline = !!contentId && (disposition === 'inline' || (!disposition && type.startsWith('image/')));
    out.push({
      partId: p.part,
      filename: decodeFilename(name) || (inline ? `inline-${out.length + 1}` : `attachment-${out.length + 1}`),
      mimeType: type.slice(0, 120),
      size: p.size ?? 0,
      contentId,
      inline,
    });
  }
  return out;
};

/** Parts from mailparser when the server gave no usable structure. */
const partsFromParsed = (parsed: ParsedMail): PartInfo[] =>
  parsed.attachments.map((a, i) => ({
    partId: undefined,
    filename: decodeFilename(a.filename ?? '') || `attachment-${i + 1}`,
    mimeType: (a.contentType || 'application/octet-stream').toLowerCase().slice(0, 120),
    size: a.size ?? a.content?.length ?? 0,
    contentId: cleanMessageId(a.contentId ?? a.cid) ?? null,
    inline: !!(a.related || a.contentDisposition === 'inline') && !!(a.cid || a.contentId),
  }));

const newId = () => `c${crypto.randomBytes(12).toString('hex')}`;

export interface StoredNew {
  id: string;
  folderId: string;
  fromName: string | null;
  fromAddr: string | null;
  subject: string | null;
  seen: boolean;
  /** inserted by this run (rules apply) */
  isNew: boolean;
  /** inserted after the first sync of the folder (realtime notification) */
  notify: boolean;
  /** AI triage: auto-reply / bounce detected from the headers (no AI call for these) */
  autoReason?: SkipReason | null;
}

/** Parses one fetched message and inserts/updates its row. Returns the row id and whether it was new. */
export const storeFetched = async (account: MailAccount, folder: MailFolder, m: ImapFetched): Promise<StoredNew | null> => {
  const parsed = await simpleParser(m.source ?? Buffer.alloc(0), { skipTextToHtml: true, skipTextLinks: true, keepCidLinks: true });
  const from = fromParsed(parsed.from)[0] ?? null;
  const to = fromParsed(parsed.to);
  const cc = fromParsed(parsed.cc);
  const bcc = fromParsed(parsed.bcc);
  const replyTo = fromParsed(parsed.replyTo)[0] ?? null;
  const messageId = cleanMessageId(parsed.messageId);
  const inReplyTo = cleanMessageId(parsed.inReplyTo);
  const refs = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references ?? null);
  const subject = (parsed.subject ?? '').slice(0, 1000) || null;
  const date = parsed.date ?? m.internalDate ?? new Date();

  // Attachments: metadata from the structure (lazy download by part id); inline parts eagerly when the bytes arrived.
  let parts = attachmentParts(m.bodyStructure);
  if (!parts.length && parsed.attachments.length) parts = partsFromParsed(parsed);
  const attachmentRows: Prisma.MailAttachmentCreateManyInput[] = [];
  const inlineUrls = new Map<string, string>();
  for (const p of parts) {
    const id = newId();
    let storageKey: string | null = null;
    const bytes = parsed.attachments.find((a) => (p.contentId && (cleanMessageId(a.contentId ?? a.cid) === p.contentId)) || (!p.contentId && a.filename && a.filename === p.filename && !a.cid));
    if (p.inline && bytes?.content?.length && bytes.content.length <= mailSettings.attachmentMaxBytes) {
      try {
        storageKey = await storeBuffer(bytes.content);
      } catch (err) {
        console.error('[mail] inline part not stored', (err as Error).message);
      }
    }
    if (p.contentId) inlineUrls.set(p.contentId, `/api/mail/inline/${id}`);
    attachmentRows.push({
      id,
      messageId: '',
      filename: p.filename,
      mimeType: p.mimeType,
      size: p.size || bytes?.size || 0,
      contentId: p.contentId,
      inline: p.inline,
      partId: p.partId ?? null,
      storageKey,
    });
  }
  const hasAttachments = parts.some((p) => !p.inline);

  const rawHtml = parsed.html ? String(parsed.html) : '';
  const html = rawHtml ? sanitizeMailHtml(rawHtml, { inlineUrls }) : null;
  const text = (parsed.text ?? (html ? htmlToText(html) : '')).trim() || null;
  // Preview from the html when there is one (mailparser's text-from-html includes image urls).
  const snippet = snippetOf(html ? null : text, html);

  // Thread: inherit the key of a known message this one references.
  const candidates = threadCandidates({ messageId, inReplyTo, references: refs });
  const related = candidates.length ? await prisma.mailMessage.findFirst({ where: { accountId: account.id, messageId: { in: candidates } }, select: { threadKey: true } }) : null;
  const threadKey = related?.threadKey ?? threadKeyOf({ messageId, inReplyTo, references: refs, subject, fromAddr: from?.address });

  const flags = m.flags;
  const data = {
    messageId,
    inReplyTo,
    refs,
    threadKey,
    subject,
    fromName: from?.name?.slice(0, 255) || null,
    fromAddr: from?.address?.slice(0, 255) || null,
    toList: to as unknown as Prisma.InputJsonValue,
    ccList: cc.length ? (cc as unknown as Prisma.InputJsonValue) : undefined,
    bccList: bcc.length ? (bcc as unknown as Prisma.InputJsonValue) : undefined,
    replyTo: replyTo?.address?.slice(0, 255) || null,
    date,
    snippet,
    text,
    html,
    hasAttachments,
    size: m.size ?? m.source?.length ?? null,
    seen: flags.has('\\Seen'),
    flagged: flags.has('\\Flagged'),
    answered: flags.has('\\Answered'),
    isDraft: folder.role === 'DRAFTS' || flags.has('\\Draft'),
  };

  // A row for the same message without UID (sent/moved locally, appended to the server) is adopted instead of duplicated.
  const local = messageId ? await prisma.mailMessage.findFirst({ where: { folderId: folder.id, messageId, uid: null }, select: { id: true, seen: true } }) : null;
  if (local) {
    await prisma.mailMessage.update({ where: { id: local.id }, data: { uid: BigInt(m.uid), seen: data.seen, flagged: data.flagged, answered: data.answered } });
    return { id: local.id, folderId: folder.id, fromName: data.fromName, fromAddr: data.fromAddr, subject, seen: data.seen, isNew: false, notify: false };
  }
  const existing = await prisma.mailMessage.findUnique({ where: { folderId_uid: { folderId: folder.id, uid: BigInt(m.uid) } }, select: { id: true } });
  if (existing) {
    await prisma.mailMessage.update({ where: { id: existing.id }, data: { seen: data.seen, flagged: data.flagged, answered: data.answered } });
    return { id: existing.id, folderId: folder.id, fromName: data.fromName, fromAddr: data.fromAddr, subject, seen: data.seen, isNew: false, notify: false };
  }
  const id = newId();
  await prisma.$transaction([
    prisma.mailMessage.create({ data: { id, accountId: account.id, folderId: folder.id, uid: BigInt(m.uid), ...data } }),
    ...(attachmentRows.length ? [prisma.mailAttachment.createMany({ data: attachmentRows.map((a) => ({ ...a, messageId: id })) })] : []),
  ]);
  return { id, folderId: folder.id, fromName: data.fromName, fromAddr: data.fromAddr, subject, seen: data.seen, isNew: true, notify: true, autoReason: detectAutoMail(parsed.headers) };
};

// ─── Rules ────────────────────────────────────────────────────────────

/** Applies the user's enabled rules to the given messages (INBOX arrivals or a manual run). Returns the number of matches. */
export const applyRules = async (userId: string, accountId: string, messageIds: string[], onlyRuleId?: string) => {
  if (!messageIds.length) return 0;
  const rules = await prisma.mailRule.findMany({
    where: { userId, enabled: true, OR: [{ accountId: null }, { accountId }], ...(onlyRuleId ? { id: onlyRuleId } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (!rules.length) return 0;
  const messages = await prisma.mailMessage.findMany({ where: { id: { in: messageIds }, accountId } });
  const touched = new Set<string>();
  let matches = 0;
  for (const m of messages) {
    let folderId = m.folderId;
    for (const r of rules) {
      if (!ruleMatches(r.conditions, m)) continue;
      const actions = parseActions(r.actions);
      if (!actions) continue;
      matches++;
      const data: Prisma.MailMessageUpdateInput = {};
      if (actions.markRead) data.seen = true;
      if (actions.flag) data.flagged = true;
      if (actions.caseId) {
        const c = await prisma.case.findUnique({ where: { id: actions.caseId }, select: { id: true } });
        if (c) data.case = { connect: { id: c.id } };
      }
      if (actions.moveToFolderId && actions.moveToFolderId !== folderId) {
        const dest = await prisma.mailFolder.findFirst({ where: { id: actions.moveToFolderId, accountId } });
        if (dest) {
          data.folder = { connect: { id: dest.id } };
          data.uid = null;
          touched.add(folderId);
          touched.add(dest.id);
          const src = await prisma.mailFolder.findUnique({ where: { id: folderId } });
          if (src && m.uid !== null && !isLocalFolder(src) && !isLocalFolder(dest)) {
            const uid = Number(m.uid);
            enqueueRemote(accountId, () => withRemote(accountId, (c) => c.move(src.path, [uid], dest.path)));
          }
          folderId = dest.id;
        }
      }
      if (actions.addLabelId) {
        const label = await prisma.mailLabel.findFirst({ where: { id: actions.addLabelId, userId } });
        if (label) await prisma.mailMessageLabel.upsert({ where: { messageId_labelId: { messageId: m.id, labelId: label.id } }, update: {}, create: { messageId: m.id, labelId: label.id } });
      }
      if (Object.keys(data).length) await prisma.mailMessage.update({ where: { id: m.id }, data });
      if (actions.markRead || actions.flag) touched.add(folderId);
      if ((actions.markRead || actions.flag) && m.uid !== null) {
        const folder = await prisma.mailFolder.findUnique({ where: { id: m.folderId } });
        if (folder && !isLocalFolder(folder) && !data.folder) {
          const uid = Number(m.uid);
          const flags = [...(actions.markRead ? ['\\Seen'] : []), ...(actions.flag ? ['\\Flagged'] : [])];
          enqueueRemote(accountId, () => withRemote(accountId, (c) => c.addFlags(folder.path, [uid], flags)));
        }
      }
    }
  }
  await recountFolders([...touched]);
  return matches;
};

/** Runs `fn` on a fresh connection of the account (used by queued best-effort operations). */
export const withRemote = async <T>(accountId: string, fn: (client: ImapClient) => Promise<T>): Promise<T | undefined> => {
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) return undefined;
  return withImap(imapConnectionOf(account), fn);
};

// ─── The sync run ─────────────────────────────────────────────────────

const chunk = <T>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const syncFolder = async (client: ImapClient, account: MailAccount, folder: MailFolder): Promise<StoredNew[]> => {
  const state = await client.open(folder.path);
  let current = folder;
  // UIDVALIDITY changed: every stored UID is meaningless, start over for this folder.
  if (current.uidValidity !== null && current.uidValidity !== state.uidValidity) {
    await prisma.mailMessage.deleteMany({ where: { folderId: current.id, uid: { not: null } } });
    current = await prisma.mailFolder.update({ where: { id: current.id }, data: { uidValidity: state.uidValidity, lastUid: 0 } });
  } else if (current.uidValidity === null) {
    current = await prisma.mailFolder.update({ where: { id: current.id }, data: { uidValidity: state.uidValidity } });
  }
  const initial = current.lastUid === 0n;
  const all = await client.uids(folder.path);
  const lastUid = Number(current.lastUid);
  let fresh = all.filter((u) => u > lastUid);
  if (initial && fresh.length > mailSettings.initialSyncLimit) fresh = fresh.slice(-mailSettings.initialSyncLimit);

  const stored: StoredNew[] = [];
  let highest = lastUid;
  for (const batch of chunk(fresh, FETCH_BATCH)) {
    const fetched = await client.fetch(folder.path, batch, { maxBytes: mailSettings.fetchSourceMaxBytes });
    for (const m of fetched) {
      try {
        const row = await storeFetched(account, current, m);
        if (row) stored.push({ ...row, notify: row.notify && !initial });
      } catch (err) {
        console.error('[mail] message not stored', account.email, folder.path, m.uid, (err as Error)?.message ?? err);
      }
      if (m.uid > highest) highest = m.uid;
    }
    // Checkpoint after each batch so an interrupted sync does not re-fetch everything.
    await prisma.mailFolder.update({ where: { id: current.id }, data: { lastUid: BigInt(highest) } });
  }
  if (!fresh.length && all.length) {
    const max = all[all.length - 1]!;
    if (max > highest) highest = max;
  }
  if (highest !== lastUid) await prisma.mailFolder.update({ where: { id: current.id }, data: { lastUid: BigInt(highest) } });

  // Flags of the newest known messages (reads/flags/deletions done elsewhere).
  const known = await prisma.mailMessage.findMany({
    where: { folderId: current.id, uid: { not: null } },
    orderBy: { uid: 'desc' },
    take: mailSettings.flagResyncWindow,
    select: { id: true, uid: true, seen: true, flagged: true, answered: true },
  });
  if (known.length) {
    const uids = known.map((k) => Number(k.uid));
    const remote = new Map((await client.fetchFlags(folder.path, uids)).map((r) => [r.uid, r.flags]));
    const liveSet = new Set(all);
    const gone: string[] = [];
    for (const k of known) {
      const uid = Number(k.uid);
      const flags = remote.get(uid);
      if (!flags) {
        if (!liveSet.has(uid)) gone.push(k.id);
        continue;
      }
      const seen = flags.has('\\Seen');
      const flagged = flags.has('\\Flagged');
      const answered = flags.has('\\Answered');
      if (seen !== k.seen || flagged !== k.flagged || answered !== k.answered) {
        await prisma.mailMessage.update({ where: { id: k.id }, data: { seen, flagged, answered } });
      }
    }
    if (gone.length) await prisma.mailMessage.deleteMany({ where: { id: { in: gone } } });
  }
  return stored;
};

const errorText = (err: unknown) => {
  const e = err as { responseText?: string; message?: string; code?: string };
  return (e?.responseText || e?.message || e?.code || String(err)).replace(/\s+/g, ' ').slice(0, 500);
};

const doSync = async (accountId: string): Promise<SyncResult> => {
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, error: 'MAIL_ACCOUNT_NOT_FOUND', newMessages: 0, folders: 0 };
  await prisma.mailAccount.update({ where: { id: accountId }, data: { syncStatus: 'SYNCING' } });
  const arrived: StoredNew[] = [];
  let folderCount = 0;
  try {
    const conn = imapConnectionOf(account);
    await withImap(conn, async (client) => {
      const folders = await syncFolderList(account, await client.list());
      folderCount = folders.length;
      for (const folder of folders) {
        try {
          arrived.push(...(await syncFolder(client, account, folder)));
        } catch (err) {
          console.error('[mail] folder sync failed', account.email, folder.path, errorText(err));
        }
      }
      await recountFolders(folders.map((f) => f.id));
    });
    await prisma.mailAccount.update({ where: { id: accountId }, data: { syncStatus: 'OK', syncError: null, lastSyncAt: new Date() } });
  } catch (err) {
    const error = errorText(err);
    await prisma.mailAccount.update({ where: { id: accountId }, data: { syncStatus: 'ERROR', syncError: error, lastSyncAt: new Date() } }).catch(() => undefined);
    publish(account.userId, 'mail.updated', { accountId, reason: 'sync-error', error });
    return { ok: false, error, newMessages: arrived.length, folders: folderCount };
  }

  await announceArrivals(account, arrived);
  publish(account.userId, 'mail.updated', { accountId, reason: 'sync', newMessages: arrived.filter((a) => a.isNew).length });
  return { ok: true, newMessages: arrived.filter((a) => a.isNew).length, folders: folderCount };
};

/** Inbox rules for what just arrived, then one 'mail.new' per unread arrival. Returns the announced ids. */
const announceArrivals = async (account: MailAccount, arrived: StoredNew[]) => {
  const accountId = account.id;
  const inbox = await prisma.mailFolder.findFirst({ where: { accountId, role: 'INBOX' }, select: { id: true } });
  const newInbox = arrived.filter((a) => a.isNew && inbox && a.folderId === inbox.id);
  if (newInbox.length) {
    try {
      await applyRules(account.userId, accountId, newInbox.map((a) => a.id));
    } catch (err) {
      console.error('[mail] rules failed', errorText(err));
    }
    // ── AI mail triage hook: queued in the background (fire-and-forget), never breaks the sync ──
    for (const a of newInbox) onNewInboundMessage(a.id, { autoReason: a.autoReason ?? null, initial: !a.notify });
  }
  const announce = newInbox.filter((a) => a.notify);
  const fresh = announce.length ? await prisma.mailMessage.findMany({ where: { id: { in: announce.map((a) => a.id) } }, select: { id: true, folderId: true, seen: true, fromName: true, fromAddr: true, subject: true } }) : [];
  const announced: string[] = [];
  for (const m of fresh) {
    if (m.seen) continue;
    announced.push(m.id);
    publish(account.userId, 'mail.new', { accountId, folderId: m.folderId, messageId: m.id, from: m.fromName || m.fromAddr || '', subject: m.subject ?? '' });
  }
  return announced;
};

// ─── Single-folder sync (IDLE) ────────────────────────────────────────

export interface FolderSyncResult {
  ok: boolean;
  error?: string;
  folderId?: string;
  /** unread count of the folder after the sync */
  unread?: number;
  /** rows inserted by this run */
  newMessageIds: string[];
}

const doFolderSync = async (accountId: string, path: string): Promise<FolderSyncResult> => {
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, error: 'MAIL_ACCOUNT_NOT_FOUND', newMessageIds: [] };
  const folder = await prisma.mailFolder.findUnique({ where: { accountId_path: { accountId, path } } });
  // Never synced (or the folder is new): the full sync creates the folder rows.
  if (!folder) {
    const full = await doSync(accountId);
    const created = await prisma.mailFolder.findUnique({ where: { accountId_path: { accountId, path } }, select: { id: true, unread: true } });
    return { ok: full.ok, error: full.error, folderId: created?.id, unread: created?.unread, newMessageIds: [] };
  }
  let arrived: StoredNew[] = [];
  try {
    await withImap(imapConnectionOf(account), async (client) => {
      arrived = await syncFolder(client, account, folder);
    });
    await recountFolders([folder.id]);
  } catch (err) {
    const error = errorText(err);
    console.error('[mail] folder sync failed', account.email, path, error);
    return { ok: false, error, folderId: folder.id, newMessageIds: [] };
  }
  await announceArrivals(account, arrived);
  // Rules may have moved arrivals elsewhere (applyRules recounts the folders it touched).
  const after = await prisma.mailFolder.findUnique({ where: { id: folder.id }, select: { unread: true } });
  const newMessageIds = arrived.filter((a) => a.isNew).map((a) => a.id);
  const unread = after?.unread ?? 0;
  publish(account.userId, 'mail.updated', { accountId, reason: 'idle', folderId: folder.id, unread, newMessages: newMessageIds.length, newMessageIds });
  return { ok: true, folderId: folder.id, unread, newMessageIds };
};

/**
 * Incremental sync of one folder (new UIDs, flags of the newest known messages, deletions) on a
 * short-lived connection, queued behind any other sync of the account. Used by the IDLE watcher.
 */
export const syncMailbox = (accountId: string, path = 'INBOX'): Promise<FolderSyncResult> => withAccountLock(accountId, () => doFolderSync(accountId, path));

// ─── Scheduler entry points ───────────────────────────────────────────

/**
 * Every account with sync enabled, one after another; never throws. `due` can skip accounts
 * (the job polls accounts kept current by IDLE less often).
 */
export const runMailSync = async (opts: { due?: (a: { id: string; lastSyncAt: Date | null }) => boolean } = {}) => {
  const accounts = await prisma.mailAccount.findMany({ where: { syncEnabled: true }, select: { id: true, lastSyncAt: true } });
  for (const a of accounts) {
    if (isSyncing(a.id)) continue;
    if (opts.due && !opts.due(a)) continue;
    try {
      await syncAccount(a.id);
    } catch (err) {
      console.error('[mail] sync failed', a.id, errorText(err));
    }
  }
};

/** Snoozed messages whose time has come return to their list as unread and announce themselves. */
export const wakeSnoozed = async (now = new Date()) => {
  const due = await prisma.mailMessage.findMany({
    where: { snoozedUntil: { lte: now } },
    select: { id: true, accountId: true, folderId: true, fromName: true, fromAddr: true, subject: true, account: { select: { userId: true } } },
  });
  if (!due.length) return 0;
  await prisma.mailMessage.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { snoozedUntil: null, seen: false } });
  await recountFolders(due.map((d) => d.folderId));
  for (const m of due) {
    publish(m.account.userId, 'mail.new', { accountId: m.accountId, folderId: m.folderId, messageId: m.id, from: m.fromName || m.fromAddr || '', subject: m.subject ?? '', snoozed: true });
  }
  return due.length;
};

