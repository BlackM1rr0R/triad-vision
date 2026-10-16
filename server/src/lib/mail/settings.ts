import path from 'node:path';
import { config } from '../../config.js';

/**
 * Workspace mail settings (env). Read here rather than in config.ts so the mail module stays
 * self-contained; every value has a sensible default for development.
 */
const int = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const mailSettings = {
  /** Newest messages fetched per folder when a mailbox is synced for the first time. */
  initialSyncLimit: int('MAIL_INITIAL_SYNC_LIMIT', 500),
  /** Seconds between two background sync runs. */
  syncIntervalSec: int('MAIL_SYNC_INTERVAL_SEC', 60),
  /** IMAP IDLE on/off (MAIL_IDLE=0 disables push; every account is polled every syncIntervalSec). */
  idleEnabled: process.env.MAIL_IDLE !== '0' && process.env.MAIL_IDLE !== 'false',
  /** Long-lived IDLE connections at most (one per account); accounts beyond the cap are polled. */
  idleMaxConnections: int('MAIL_IDLE_MAX_CONNECTIONS', 50),
  /** Safety-net full sync for accounts whose INBOX is watched by IDLE (seconds). */
  idlePollIntervalSec: int('MAIL_IDLE_POLL_INTERVAL_SEC', 300),
  /** Per-attachment cap (uploads and IMAP downloads). */
  attachmentMaxBytes: int('MAIL_ATTACHMENT_MAX_MB', 25) * 1024 * 1024,
  /** How much of a message source is fetched during sync (text parts come first; attachments are fetched lazily). */
  fetchSourceMaxBytes: int('MAIL_FETCH_SOURCE_MAX_MB', 3) * 1024 * 1024,
  /** Outgoing messages per account per hour. */
  sendPerHour: int('MAIL_SEND_PER_HOUR', 60),
  /** Known messages per folder whose flags are re-read on every sync (reads done on the phone show up). */
  flagResyncWindow: int('MAIL_FLAG_RESYNC_WINDOW', 200),
  /** Attachment store: <DOCS_DIR>/mail/<key>. */
  dir: path.join(config.docs.dir, 'mail'),
  /** Socket/command timeout for IMAP and SMTP operations. */
  timeoutMs: int('MAIL_TIMEOUT_MS', 30_000),
};
