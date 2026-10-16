import { simpleParser } from 'mailparser';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type { MessageStructureObject } from 'imapflow';
import type { ImapChangeKind, ImapClient, ImapConnection, ImapFactory, ImapFetched, ImapFolder, ImapMailboxState, ImapWatch, ImapWatchFactory, ImapWatchHandlers } from './imap.js';

/**
 * In-memory IMAP server for tests and offline development. Holds folders with raw messages; the
 * `ImapClient` it hands out behaves like the imapflow-backed one (UIDs, flags, moves, appends,
 * per-part downloads) without any network. Body structures are derived from the parsed message:
 * part "1" is the text body, attachments get "2", "3", … in document order.
 */
export interface FakeMessageInput {
  from: string;
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  date?: Date;
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
  attachments?: { filename: string; content: Buffer | string; contentType?: string; cid?: string }[];
  flags?: string[];
}

interface StoredMessage {
  uid: number;
  flags: Set<string>;
  raw: Buffer;
  internalDate: Date;
  bodyStructure: MessageStructureObject;
  parts: Map<string, { content: Buffer; contentType: string; filename?: string }>;
}

interface FakeFolder {
  path: string;
  specialUse?: string;
  uidValidity: bigint;
  uidNext: number;
  messages: Map<number, StoredMessage>;
}

export const composeRaw = async (m: FakeMessageInput): Promise<Buffer> => {
  const composer = new MailComposer({
    from: m.from,
    to: m.to,
    cc: m.cc,
    subject: m.subject,
    text: m.text,
    html: m.html,
    date: m.date ?? new Date(),
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
    references: m.references,
    attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid, contentDisposition: a.cid ? 'inline' : 'attachment' })),
  });
  return composer.compile().build();
};

const structureOf = async (raw: Buffer) => {
  const parsed = await simpleParser(raw);
  const parts = new Map<string, { content: Buffer; contentType: string; filename?: string }>();
  const children: MessageStructureObject[] = [];
  const bodyText = parsed.html ? String(parsed.html) : (parsed.text ?? '');
  parts.set('1', { content: Buffer.from(bodyText, 'utf8'), contentType: parsed.html ? 'text/html' : 'text/plain' });
  children.push({ part: '1', type: parsed.html ? 'text/html' : 'text/plain', size: Buffer.byteLength(bodyText), parameters: { charset: 'utf-8' } });
  let n = 2;
  for (const a of parsed.attachments) {
    const part = String(n++);
    parts.set(part, { content: a.content, contentType: a.contentType, filename: a.filename });
    children.push({
      part,
      type: a.contentType,
      size: a.size,
      id: a.contentId,
      disposition: a.contentDisposition ?? (a.related ? 'inline' : 'attachment'),
      dispositionParameters: a.filename ? { filename: a.filename } : undefined,
      parameters: a.filename ? { name: a.filename } : undefined,
    });
  }
  const bodyStructure: MessageStructureObject = children.length === 1 ? children[0]! : { type: 'multipart/mixed', childNodes: children };
  return { bodyStructure, parts };
};

/** Mailbox contents shared by every client the factory creates; one server per test account. */
export class FakeImapServer {
  folders = new Map<string, FakeFolder>();
  /** credentials accepted by connect(); null = accept anything */
  credentials: { username: string; password: string } | null = null;
  /** connect() throws when set (unreachable host, wrong password) */
  failConnect: string | null = null;
  /** every call recorded for assertions */
  log: { op: string; path?: string; uids?: number[]; args?: unknown }[] = [];
  connections = 0;
  /** command connections currently logged in, and the most seen at once (sync mutex assertions) */
  activeSessions = 0;
  maxActiveSessions = 0;
  /** awaited before every mailbox command of a command connection (tests slow a sync down with it) */
  beforeCommand: ((op: string, path?: string) => Promise<void>) | null = null;
  /** IDLE connections currently open */
  watches = new Set<FakeWatch>();
  /** IDLE connections ever started successfully */
  watchStarts = 0;

  constructor(folders: { path: string; specialUse?: string }[] = [
    { path: 'INBOX', specialUse: '\\Inbox' },
    { path: 'Sent', specialUse: '\\Sent' },
    { path: 'Drafts', specialUse: '\\Drafts' },
    { path: 'Trash', specialUse: '\\Trash' },
    { path: 'Junk', specialUse: '\\Junk' },
    { path: 'Archive', specialUse: '\\Archive' },
  ]) {
    for (const f of folders) this.addFolder(f.path, f.specialUse);
  }

  addFolder(path: string, specialUse?: string) {
    const f: FakeFolder = { path, specialUse, uidValidity: BigInt(Math.floor(Math.random() * 1e6) + 1), uidNext: 1, messages: new Map() };
    this.folders.set(path, f);
    return f;
  }

  folder(path: string) {
    const f = this.folders.get(path);
    if (!f) throw new Error(`NO_SUCH_MAILBOX ${path}`);
    return f;
  }

  /** Changes UIDVALIDITY (what a server does after a mailbox rebuild). */
  resetFolder(path: string) {
    const f = this.folder(path);
    f.uidValidity += 1000n;
    const old = [...f.messages.values()];
    f.messages = new Map();
    f.uidNext = 1;
    for (const m of old) {
      m.uid = f.uidNext++;
      f.messages.set(m.uid, m);
    }
  }

  async addRaw(path: string, raw: Buffer, flags: string[] = [], internalDate = new Date()) {
    const f = this.folder(path);
    const { bodyStructure, parts } = await structureOf(raw);
    const uid = f.uidNext++;
    f.messages.set(uid, { uid, flags: new Set(flags), raw, internalDate, bodyStructure, parts });
    this.notify(path, 'exists');
    return uid;
  }

  /** Sends an untagged change to every IDLE connection watching `path` (what a real server pushes). */
  notify(path: string, kind: ImapChangeKind) {
    for (const w of [...this.watches]) if (w.path === path) w.handlers.onChange(kind);
  }

  /** Drops every IDLE connection as a network failure would (their onClose fires). */
  dropWatches(reason = 'ECONNRESET') {
    for (const w of [...this.watches]) w.drop(new Error(reason));
  }

  /** IDLE connections of the given login. */
  watchesOf(username: string) {
    return [...this.watches].filter((w) => w.conn.username === username);
  }

  createWatchFactory(): ImapWatchFactory {
    return (conn, path, handlers) => new FakeWatch(this, conn, path, handlers);
  }

  /** Delivers a message to a folder (default INBOX); returns its UID. */
  async deliver(input: FakeMessageInput, path = 'INBOX') {
    return this.addRaw(path, await composeRaw(input), input.flags ?? [], input.date ?? new Date());
  }

  message(path: string, uid: number) {
    return this.folder(path).messages.get(uid) ?? null;
  }

  createFactory(): ImapFactory {
    return (conn) => new FakeClient(this, conn);
  }
}

export class FakeWatch implements ImapWatch {
  private open = false;

  constructor(
    private server: FakeImapServer,
    readonly conn: ImapConnection,
    readonly path: string,
    readonly handlers: ImapWatchHandlers,
  ) {}

  async start() {
    this.server.log.push({ op: 'idle', path: this.path, args: { username: this.conn.username } });
    if (this.server.failConnect) throw new Error(this.server.failConnect);
    const c = this.server.credentials;
    if (c && (c.username !== this.conn.username || c.password !== this.conn.password)) throw new Error('AUTHENTICATIONFAILED');
    this.server.folder(this.path);
    this.open = true;
    this.server.watches.add(this);
    this.server.watchStarts++;
  }

  async close() {
    this.open = false;
    this.server.watches.delete(this);
  }

  drop(err: Error) {
    if (!this.open) return;
    this.open = false;
    this.server.watches.delete(this);
    this.handlers.onClose(err);
  }
}

class FakeClient implements ImapClient {
  private connected = false;

  constructor(
    private server: FakeImapServer,
    private conn: ImapConnection,
  ) {}

  async connect() {
    this.server.log.push({ op: 'connect', args: { host: this.conn.host, username: this.conn.username } });
    if (this.server.failConnect) throw new Error(this.server.failConnect);
    const c = this.server.credentials;
    if (c && (c.username !== this.conn.username || c.password !== this.conn.password)) throw new Error('AUTHENTICATIONFAILED');
    this.connected = true;
    this.server.connections++;
    this.server.activeSessions++;
    this.server.maxActiveSessions = Math.max(this.server.maxActiveSessions, this.server.activeSessions);
  }

  async logout() {
    if (this.connected) this.server.activeSessions--;
    this.connected = false;
  }

  private check() {
    if (!this.connected) throw new Error('NOT_CONNECTED');
  }

  private async hook(op: string, path?: string) {
    if (this.server.beforeCommand) await this.server.beforeCommand(op, path);
  }

  async list(): Promise<ImapFolder[]> {
    this.check();
    return [...this.server.folders.values()].map((f) => ({
      path: f.path,
      name: f.path.split('/').pop()!,
      delimiter: '/',
      specialUse: f.specialUse,
      subscribed: true,
      noSelect: false,
    }));
  }

  async open(path: string): Promise<ImapMailboxState> {
    this.check();
    await this.hook('open', path);
    const f = this.server.folder(path);
    return { uidValidity: f.uidValidity, uidNext: f.uidNext, exists: f.messages.size };
  }

  async uids(path: string) {
    this.check();
    return [...this.server.folder(path).messages.keys()].sort((a, b) => a - b);
  }

  async fetch(path: string, uids: number[], opts: { maxBytes: number }): Promise<ImapFetched[]> {
    this.check();
    this.server.log.push({ op: 'fetch', path, uids });
    const f = this.server.folder(path);
    const out: ImapFetched[] = [];
    for (const uid of uids) {
      const m = f.messages.get(uid);
      if (!m) continue;
      out.push({ uid, flags: new Set(m.flags), size: m.raw.length, internalDate: m.internalDate, bodyStructure: m.bodyStructure, source: m.raw.subarray(0, opts.maxBytes) });
    }
    return out;
  }

  async fetchFlags(path: string, uids: number[]) {
    this.check();
    const f = this.server.folder(path);
    return uids.filter((u) => f.messages.has(u)).map((uid) => ({ uid, flags: new Set(f.messages.get(uid)!.flags) }));
  }

  async download(path: string, uid: number, partId: string | undefined, maxBytes: number) {
    this.check();
    this.server.log.push({ op: 'download', path, uids: [uid], args: partId });
    const m = this.server.folder(path).messages.get(uid);
    if (!m) return null;
    if (!partId) return { content: m.raw.subarray(0, maxBytes), contentType: 'message/rfc822' };
    const p = m.parts.get(partId);
    if (!p) return null;
    if (p.content.length > maxBytes) throw new Error('ATTACHMENT_TOO_LARGE');
    return { content: p.content, contentType: p.contentType, filename: p.filename };
  }

  async addFlags(path: string, uids: number[], flags: string[]) {
    this.check();
    this.server.log.push({ op: 'addFlags', path, uids, args: flags });
    const f = this.server.folder(path);
    for (const uid of uids) for (const fl of flags) f.messages.get(uid)?.flags.add(fl);
    if (uids.length) this.server.notify(path, 'flags');
  }

  async removeFlags(path: string, uids: number[], flags: string[]) {
    this.check();
    this.server.log.push({ op: 'removeFlags', path, uids, args: flags });
    const f = this.server.folder(path);
    for (const uid of uids) for (const fl of flags) f.messages.get(uid)?.flags.delete(fl);
    if (uids.length) this.server.notify(path, 'flags');
  }

  async move(path: string, uids: number[], destination: string) {
    this.check();
    this.server.log.push({ op: 'move', path, uids, args: destination });
    const from = this.server.folder(path);
    const to = this.server.folder(destination);
    for (const uid of uids) {
      const m = from.messages.get(uid);
      if (!m) continue;
      from.messages.delete(uid);
      m.uid = to.uidNext++;
      to.messages.set(m.uid, m);
    }
    if (uids.length) {
      this.server.notify(path, 'expunge');
      this.server.notify(destination, 'exists');
    }
  }

  async append(path: string, raw: Buffer, flags: string[]) {
    this.check();
    this.server.log.push({ op: 'append', path, args: flags });
    return this.server.addRaw(path, raw, flags);
  }
}
