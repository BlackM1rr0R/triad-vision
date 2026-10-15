import { ImapFlow, type MessageStructureObject } from 'imapflow';
import { mailSettings } from './settings.js';

/**
 * Thin IMAP abstraction over imapflow. Everything the mail module needs from a server goes through
 * `ImapClient`, so tests inject an in-memory implementation with `setImapFactory` and never open a
 * socket. One client = one connection; callers `connect()` once, run their commands and `logout()`.
 */
export interface ImapConnection {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface ImapFolder {
  path: string;
  name: string;
  delimiter: string;
  /** "\Inbox", "\Sent", "\Drafts", "\Trash", "\Junk", "\Archive", "\All" or undefined */
  specialUse?: string;
  subscribed: boolean;
  /** true for \Noselect containers */
  noSelect: boolean;
}

export interface ImapMailboxState {
  uidValidity: bigint;
  uidNext: number;
  exists: number;
}

export interface ImapFetched {
  uid: number;
  flags: Set<string>;
  size?: number;
  internalDate?: Date;
  bodyStructure?: MessageStructureObject;
  /** message source (possibly truncated to `maxBytes`) */
  source?: Buffer;
}

export interface ImapClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  list(): Promise<ImapFolder[]>;
  /** Selects the mailbox and reports its state. */
  open(path: string): Promise<ImapMailboxState>;
  /** All UIDs of the selected mailbox, ascending. */
  uids(path: string): Promise<number[]>;
  /** Fetches the given UIDs (flags, size, date, structure and source up to `maxBytes`). */
  fetch(path: string, uids: number[], opts: { maxBytes: number }): Promise<ImapFetched[]>;
  /** Flags of the given UIDs (missing UIDs = deleted/moved on the server). */
  fetchFlags(path: string, uids: number[]): Promise<{ uid: number; flags: Set<string> }[]>;
  /** Decoded bytes of one body part (null when the part is gone). */
  download(path: string, uid: number, partId: string | undefined, maxBytes: number): Promise<{ content: Buffer; contentType?: string; filename?: string } | null>;
  addFlags(path: string, uids: number[], flags: string[]): Promise<void>;
  removeFlags(path: string, uids: number[], flags: string[]): Promise<void>;
  move(path: string, uids: number[], destination: string): Promise<void>;
  /** Appends a raw message; returns the new UID when the server reports it. */
  append(path: string, raw: Buffer, flags: string[]): Promise<number | null>;
}

export type ImapFactory = (conn: ImapConnection) => ImapClient;

const streamToBuffer = (stream: NodeJS.ReadableStream, max: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new Error('ATTACHMENT_TOO_LARGE'));
        (stream as { destroy?: () => void }).destroy?.();
        return;
      }
      chunks.push(c);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

/** Default implementation on imapflow. */
class FlowClient implements ImapClient {
  private client: ImapFlow;

  constructor(conn: ImapConnection) {
    this.client = new ImapFlow({
      host: conn.host,
      port: conn.port,
      secure: conn.secure,
      auth: { user: conn.username, pass: conn.password },
      logger: false,
      disableAutoIdle: true,
      socketTimeout: mailSettings.timeoutMs,
      connectionTimeout: mailSettings.timeoutMs,
      greetingTimeout: mailSettings.timeoutMs,
      clientInfo: { name: 'Triad Vision Workspace', vendor: 'Triad Vision' },
    });
    // imapflow emits 'error' on dropped connections; without a listener that would crash the process.
    this.client.on('error', () => undefined);
  }

  connect() {
    return this.client.connect();
  }

  async logout() {
    try {
      await this.client.logout();
    } catch {
      this.client.close();
    }
  }

  async list(): Promise<ImapFolder[]> {
    const rows = await this.client.list();
    return rows.map((r) => ({
      path: r.path,
      name: r.name,
      delimiter: r.delimiter,
      specialUse: r.specialUse,
      subscribed: r.subscribed !== false,
      noSelect: r.flags.has('\\Noselect') || r.flags.has('\\NonExistent'),
    }));
  }

  private async withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const lock = await this.client.getMailboxLock(path);
    try {
      return await fn();
    } finally {
      lock.release();
    }
  }

  private mailbox() {
    const mb = this.client.mailbox;
    if (!mb || typeof mb === 'boolean') throw new Error('MAILBOX_NOT_OPEN');
    return mb;
  }

  open(path: string) {
    return this.withLock(path, async () => {
      const mb = this.mailbox();
      return { uidValidity: mb.uidValidity, uidNext: mb.uidNext, exists: mb.exists };
    });
  }

  uids(path: string) {
    return this.withLock(path, async () => {
      const res = await this.client.search({ all: true }, { uid: true });
      return (res || []).map(Number).sort((a, b) => a - b);
    });
  }

  fetch(path: string, uids: number[], opts: { maxBytes: number }) {
    if (!uids.length) return Promise.resolve([]);
    return this.withLock(path, async () => {
      const out: ImapFetched[] = [];
      for await (const m of this.client.fetch(
        uids,
        { uid: true, flags: true, size: true, internalDate: true, bodyStructure: true, source: { maxLength: opts.maxBytes } },
        { uid: true },
      )) {
        out.push({
          uid: m.uid,
          flags: m.flags ?? new Set(),
          size: m.size,
          internalDate: m.internalDate ? new Date(m.internalDate) : undefined,
          bodyStructure: m.bodyStructure,
          source: m.source,
        });
      }
      return out;
    });
  }

  fetchFlags(path: string, uids: number[]) {
    if (!uids.length) return Promise.resolve([]);
    return this.withLock(path, async () => {
      const out: { uid: number; flags: Set<string> }[] = [];
      for await (const m of this.client.fetch(uids, { uid: true, flags: true }, { uid: true })) out.push({ uid: m.uid, flags: m.flags ?? new Set() });
      return out;
    });
  }

  download(path: string, uid: number, partId: string | undefined, maxBytes: number) {
    return this.withLock(path, async () => {
      const res = await this.client.download(uid, partId, { uid: true, maxBytes });
      if (!res.content) return null;
      const content = await streamToBuffer(res.content, maxBytes);
      return { content, contentType: res.meta.contentType, filename: res.meta.filename };
    });
  }

  addFlags(path: string, uids: number[], flags: string[]) {
    if (!uids.length) return Promise.resolve();
    return this.withLock(path, async () => {
      await this.client.messageFlagsAdd(uids, flags, { uid: true });
    });
  }

  removeFlags(path: string, uids: number[], flags: string[]) {
    if (!uids.length) return Promise.resolve();
    return this.withLock(path, async () => {
      await this.client.messageFlagsRemove(uids, flags, { uid: true });
    });
  }

  move(path: string, uids: number[], destination: string) {
    if (!uids.length) return Promise.resolve();
    return this.withLock(path, async () => {
      await this.client.messageMove(uids, destination, { uid: true });
    });
  }

  async append(path: string, raw: Buffer, flags: string[]) {
    const res = await this.client.append(path, raw, flags);
    return res && res.uid ? res.uid : null;
  }
}

let factory: ImapFactory = (conn) => new FlowClient(conn);

/** Tests (and a future OAuth variant) swap the implementation here. */
export const setImapFactory = (f: ImapFactory | null) => {
  factory = f ?? ((conn) => new FlowClient(conn));
};

export const createImapClient = (conn: ImapConnection) => factory(conn);

/** Opens a connection, runs `fn`, always logs out. */
export const withImap = async <T>(conn: ImapConnection, fn: (client: ImapClient) => Promise<T>): Promise<T> => {
  const client = createImapClient(conn);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout();
  }
};

/** Verifies the IMAP login only. Throws the server's error. */
export const verifyImap = (conn: ImapConnection) => withImap(conn, async () => undefined);

/** Walks a BODYSTRUCTURE tree and returns the leaf parts in document order. */
export const leafParts = (node: MessageStructureObject | undefined): MessageStructureObject[] => {
  if (!node) return [];
  if (node.childNodes?.length) return node.childNodes.flatMap(leafParts);
  return [node];
};
