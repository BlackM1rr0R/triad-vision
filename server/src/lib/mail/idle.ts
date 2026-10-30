import crypto from 'node:crypto';
import type { MailAccount } from '@prisma/client';
import { prisma } from '../../db.js';
import { AUTH_FAILED_PREFIX, imapConnectionOf, isAuthBlocked, isImapAuthFailure } from './core.js';
import { createImapWatch, type ImapChangeKind, type ImapWatch } from './imap.js';
import { mailSettings } from './settings.js';
import { syncMailbox, type FolderSyncResult } from './sync.js';

/**
 * Push mail (IMAP IDLE, RFC 2177). For every account with sync enabled — up to
 * MAIL_IDLE_MAX_CONNECTIONS — one long-lived connection selects INBOX read-only and idles. When the
 * server reports a change (EXISTS / EXPUNGE / FETCH flags) the INBOX is synced incrementally through
 * `syncMailbox` (queued behind any other sync of the account, see sync.ts), which publishes
 * 'mail.new' / 'mail.updated' to the owner's realtime stream.
 *
 * The connection is reopened with exponential backoff and jitter (capped at 5 minutes) after errors
 * and disconnects; after a reconnect the INBOX is synced once to catch up on what was missed.
 * IDLE is re-issued every 25 minutes. Accounts that are not watched (over the cap, connection
 * down) keep the regular poll of the mail-sync job; watched accounts are polled less often there.
 *
 * Started from src/index.ts (never in tests unless a test starts its own manager). Account routes
 * call `refreshMailIdle()` after a change; the mail-sync job reconciles on every run as well, so
 * accounts changed elsewhere (user deletion, admin tools) are picked up within a minute.
 */

export const IDLE_PATH = 'INBOX';

export interface IdleManagerOptions {
  /** connections at most; further accounts are left to the poll */
  maxConnections: number;
  /** IDLE re-issue interval */
  renewMs: number;
  /** change notifications within this window are coalesced into one sync */
  debounceMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** a connection that stayed up this long resets the backoff when it drops */
  stableMs: number;
  /** accounts that should be watched, in priority order (default: sync enabled, oldest first) */
  listAccounts: () => Promise<MailAccount[]>;
  loadAccount: (accountId: string) => Promise<MailAccount | null>;
  sync: (accountId: string, path: string) => Promise<FolderSyncResult | unknown>;
  /** the server refused the login: record it so neither IDLE nor the poll retries until the login changes */
  markAuthFailed: (accountId: string, error: string) => Promise<unknown>;
  random: () => number;
  log: (msg: string) => void;
}

export const defaultIdleOptions = (): IdleManagerOptions => ({
  maxConnections: mailSettings.idleMaxConnections,
  renewMs: 25 * 60 * 1000,
  debounceMs: 500,
  backoffBaseMs: 2000,
  backoffMaxMs: 5 * 60 * 1000,
  stableMs: 60_000,
  listAccounts: async () =>
    (await prisma.mailAccount.findMany({ where: { syncEnabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).filter((a) => !isAuthBlocked(a)),
  loadAccount: (id) => prisma.mailAccount.findUnique({ where: { id } }),
  sync: (accountId, path) => syncMailbox(accountId, path),
  markAuthFailed: (id, error) => prisma.mailAccount.update({ where: { id }, data: { syncStatus: 'ERROR', syncError: `${AUTH_FAILED_PREFIX}${error}`.slice(0, 500) } }),
  random: Math.random,
  log: (msg) => console.warn(msg),
});

/** "Equal jitter" backoff: half of the exponential step is fixed, half is random. */
export const backoffDelay = (attempt: number, baseMs: number, maxMs: number, random: () => number = Math.random) => {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.min(Math.max(attempt, 0), 30));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
};

/** Changes whenever the IMAP login changes (host, port, TLS, user, password); never logged. */
const fingerprintOf = (a: MailAccount) => crypto.createHash('sha256').update([a.imapHost, a.imapPort, a.imapSecure, a.username, a.passwordEnc].join('\u0000')).digest('hex');

const errorText = (err: unknown) => {
  const e = err as { responseText?: string; message?: string; code?: string };
  return (e?.responseText || e?.message || e?.code || String(err)).replace(/\s+/g, ' ').slice(0, 300);
};

export type WatcherState = 'connecting' | 'idle' | 'waiting' | 'stopped';

interface Watcher {
  accountId: string;
  fingerprint: string;
  state: WatcherState;
  watch: ImapWatch | null;
  /** consecutive failed connects / unstable connections */
  failures: number;
  connectedAt: number;
  everConnected: boolean;
  retryTimer: NodeJS.Timeout | null;
  debounceTimer: NodeJS.Timeout | null;
  syncing: Promise<void> | null;
  dirty: boolean;
  lastError: string | null;
  nextRetryMs: number | null;
}

/** A function (not an inline comparison): the state changes across awaits, which narrowing does not see. */
const isStopped = (w: Watcher) => w.state === 'stopped';

export interface WatcherStatus {
  accountId: string;
  state: WatcherState;
  failures: number;
  nextRetryMs: number | null;
  lastError: string | null;
}

export class IdleManager {
  private watchers = new Map<string, Watcher>();
  private started = false;
  private reconciling: Promise<void> = Promise.resolve();
  private opts: IdleManagerOptions;

  constructor(opts: Partial<IdleManagerOptions> = {}) {
    this.opts = { ...defaultIdleOptions(), ...opts };
  }

  get running() {
    return this.started;
  }

  async start() {
    this.started = true;
    await this.reconcile();
  }

  /** Closes every connection (graceful shutdown). */
  async stop() {
    this.started = false;
    await this.reconciling.catch(() => undefined);
    await Promise.all([...this.watchers.values()].map((w) => this.stopWatcher(w)));
  }

  /** Brings the watcher set in line with the database (calls are serialised). */
  reconcile(): Promise<void> {
    const next = this.reconciling.catch(() => undefined).then(() => this.doReconcile());
    this.reconciling = next;
    return next;
  }

  private async doReconcile() {
    if (!this.started) return;
    const accounts = await this.opts.listAccounts();
    if (!this.started) return;
    const wanted = new Map(accounts.slice(0, Math.max(0, this.opts.maxConnections)).map((a) => [a.id, a]));
    const stops: Promise<void>[] = [];
    for (const w of [...this.watchers.values()]) {
      const a = wanted.get(w.accountId);
      if (!a || fingerprintOf(a) !== w.fingerprint) stops.push(this.stopWatcher(w));
    }
    await Promise.all(stops);
    for (const a of wanted.values()) {
      if (this.watchers.has(a.id)) continue;
      const w: Watcher = {
        accountId: a.id,
        fingerprint: fingerprintOf(a),
        state: 'connecting',
        watch: null,
        failures: 0,
        connectedAt: 0,
        everConnected: false,
        retryTimer: null,
        debounceTimer: null,
        syncing: null,
        dirty: false,
        lastError: null,
        nextRetryMs: null,
      };
      this.watchers.set(a.id, w);
      void this.connect(w);
    }
  }

  /** true while the account's INBOX is held in IDLE (its poll can slow down). */
  isWatching(accountId: string) {
    return this.watchers.get(accountId)?.state === 'idle';
  }

  status(): WatcherStatus[] {
    return [...this.watchers.values()].map((w) => ({ accountId: w.accountId, state: w.state, failures: w.failures, nextRetryMs: w.nextRetryMs, lastError: w.lastError }));
  }

  /** Resolves when no change-triggered sync is pending or running (tests). */
  async settled() {
    for (;;) {
      const busy = [...this.watchers.values()].filter((w) => w.syncing || w.debounceTimer);
      if (!busy.length) return;
      await Promise.all(busy.map((w) => w.syncing ?? new Promise((r) => setTimeout(r, 10))));
    }
  }

  // ─── Connection lifecycle ───

  private async connect(w: Watcher) {
    if (w.state === 'stopped') return;
    w.state = 'connecting';
    w.retryTimer = null;
    let account: MailAccount | null;
    try {
      account = await this.opts.loadAccount(w.accountId);
    } catch (err) {
      this.fail(w, err);
      return;
    }
    if (isStopped(w)) return;
    if (!account || !account.syncEnabled || fingerprintOf(account) !== w.fingerprint) {
      // Gone, disabled or changed meanwhile: let reconcile decide (it creates a fresh watcher).
      await this.stopWatcher(w);
      void this.reconcile().catch(() => undefined);
      return;
    }
    let watch: ImapWatch | null = null;
    try {
      const conn = imapConnectionOf(account);
      const self: { watch: ImapWatch | null } = { watch: null };
      watch = createImapWatch(
        conn,
        IDLE_PATH,
        {
          onChange: (kind) => this.onChange(w, self.watch, kind),
          onClose: (err) => this.onClosed(w, self.watch, err),
        },
        { renewMs: this.opts.renewMs },
      );
      self.watch = watch;
      w.watch = watch;
      await watch.start();
    } catch (err) {
      if (watch) {
        if (w.watch === watch) w.watch = null;
        await watch.close().catch(() => undefined);
      }
      if (!isStopped(w)) this.fail(w, err);
      return;
    }
    if (isStopped(w) || w.watch !== watch) {
      await watch.close().catch(() => undefined);
      return;
    }
    const catchUp = w.everConnected || w.failures > 0;
    w.state = 'idle';
    w.connectedAt = Date.now();
    w.everConnected = true;
    w.lastError = null;
    w.nextRetryMs = null;
    // Changes that happened while the connection was down are only seen by a sync.
    if (catchUp) this.scheduleSync(w, 0);
  }

  private fail(w: Watcher, err: unknown) {
    if (w.state === 'stopped') return;
    w.watch = null;
    w.lastError = errorText(err);
    if (isImapAuthFailure(err)) {
      // Retrying a wrong password gets our IP banned by the mail server, which then also stops our outgoing mail.
      this.opts.log(`[mail-idle] account ${w.accountId}: login refused; not retried until the login changes`);
      void this.opts.markAuthFailed(w.accountId, w.lastError).catch(() => undefined);
      void this.stopWatcher(w);
      return;
    }
    const delay = backoffDelay(w.failures, this.opts.backoffBaseMs, this.opts.backoffMaxMs, this.opts.random);
    w.failures += 1;
    w.state = 'waiting';
    w.nextRetryMs = delay;
    this.opts.log(`[mail-idle] account ${w.accountId}: ${w.lastError}; retry #${w.failures} in ${Math.round(delay / 1000)} s`);
    if (w.retryTimer) clearTimeout(w.retryTimer);
    w.retryTimer = setTimeout(() => void this.connect(w), delay);
    w.retryTimer.unref?.();
  }

  private onClosed(w: Watcher, watch: ImapWatch | null, err: Error) {
    if (w.state === 'stopped' || !watch || w.watch !== watch) return;
    if (Date.now() - w.connectedAt >= this.opts.stableMs) w.failures = 0;
    void watch.close().catch(() => undefined);
    this.fail(w, err);
  }

  private onChange(w: Watcher, watch: ImapWatch | null, _kind: ImapChangeKind) {
    if (w.state === 'stopped' || !watch || w.watch !== watch) return;
    this.scheduleSync(w, this.opts.debounceMs);
  }

  private scheduleSync(w: Watcher, delay: number) {
    if (w.debounceTimer || w.state === 'stopped') return;
    w.debounceTimer = setTimeout(() => {
      w.debounceTimer = null;
      this.runSync(w);
    }, delay);
    w.debounceTimer.unref?.();
  }

  /** One sync at a time per watcher; changes during a sync trigger exactly one more. */
  private runSync(w: Watcher) {
    if (w.syncing) {
      w.dirty = true;
      return;
    }
    w.syncing = (async () => {
      do {
        w.dirty = false;
        try {
          await this.opts.sync(w.accountId, IDLE_PATH);
        } catch (err) {
          this.opts.log(`[mail-idle] account ${w.accountId}: sync failed: ${errorText(err)}`);
        }
      } while (w.dirty && w.state !== 'stopped');
    })().finally(() => {
      w.syncing = null;
    });
  }

  private async stopWatcher(w: Watcher) {
    w.state = 'stopped';
    if (w.retryTimer) clearTimeout(w.retryTimer);
    if (w.debounceTimer) clearTimeout(w.debounceTimer);
    w.retryTimer = null;
    w.debounceTimer = null;
    if (this.watchers.get(w.accountId) === w) this.watchers.delete(w.accountId);
    const watch = w.watch;
    w.watch = null;
    if (watch) await watch.close().catch(() => undefined);
  }
}

// ─── Process-wide instance (src/index.ts) ─────────────────────────────

let instance: IdleManager | null = null;

export const startMailIdle = async (opts: Partial<IdleManagerOptions> = {}) => {
  if (instance) return instance;
  instance = new IdleManager(opts);
  try {
    await instance.start();
  } catch (err) {
    console.error('[mail-idle] start failed', errorText(err));
  }
  return instance;
};

export const stopMailIdle = async () => {
  const m = instance;
  instance = null;
  if (m) await m.stop();
};

/** Re-reads the accounts after a create / update / delete; no-op when IDLE is not running. */
export const refreshMailIdle = () => {
  if (!instance) return;
  instance.reconcile().catch((err) => console.error('[mail-idle] reconcile failed', errorText(err)));
};

export const isIdleWatching = (accountId: string) => instance?.isWatching(accountId) ?? false;

export const mailIdleManager = () => instance;
