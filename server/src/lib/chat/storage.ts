import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../../config.js';
import { decodeOriginalName } from '../../middleware/upload.js';
import { WORKSPACE_MIME, resolveMime } from '../fileCheck.js';
import { badRequest } from '../http.js';

/**
 * Chat attachments live flat under <DOCS_DIR>/chat/<key>. An upload is accepted before the message
 * exists (the composer shows progress per file), so the file waits as a "pending" attachment: the
 * bytes under <key> plus a small <key>.json sidecar naming the uploader. Sending a message turns
 * pending keys into ChatAttachment rows; pending files nobody attached within a day are purged.
 */
export const chatDir = path.join(config.docs.dir, 'chat');
export const chatIncomingDir = path.join(config.docs.dir, '.incoming');
export const CHAT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

fs.mkdirSync(chatDir, { recursive: true });
fs.mkdirSync(chatIncomingDir, { recursive: true });

const KEY = /^[a-f0-9]{32}$/;
export const isChatKey = (key: string) => KEY.test(key);
export const newChatKey = () => crypto.randomBytes(16).toString('hex');

export const chatFilePath = (key: string) => {
  if (!KEY.test(key)) throw badRequest('INVALID_STORAGE_KEY');
  return path.join(chatDir, key);
};
const sidecarPath = (key: string) => `${chatFilePath(key)}.json`;

export interface PendingAttachment {
  key: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  /** set when the attachment links a team-drive file (no bytes under <key>) */
  driveNodeId?: string;
  createdAt: string;
}

export const chatUpload = multer({
  storage: multer.diskStorage({
    destination: chatIncomingDir,
    filename: (_req, _file, cb) => cb(null, `chat-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`),
  }),
  limits: { fileSize: CHAT_MAX_FILE_BYTES, files: 1, fields: 5, fieldSize: 4096 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && WORKSPACE_MIME.has(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

const writePending = async (pending: PendingAttachment) => {
  await fsp.mkdir(chatDir, { recursive: true });
  await fsp.writeFile(sidecarPath(pending.key), JSON.stringify(pending));
  return pending;
};

/** Moves a verified upload into the chat store and records who may attach it. */
export const adoptChatUpload = async (tmpPath: string, meta: Omit<PendingAttachment, 'key' | 'createdAt'>) => {
  const key = newChatKey();
  await fsp.mkdir(chatDir, { recursive: true });
  await fsp.rename(tmpPath, chatFilePath(key));
  return writePending({ key, ...meta, createdAt: new Date().toISOString() });
};

/** Registers a drive-file link as a pending attachment (sidecar only, no bytes copied). */
export const addPendingDriveLink = (meta: Omit<PendingAttachment, 'key' | 'createdAt'> & { driveNodeId: string }) =>
  writePending({ key: newChatKey(), ...meta, createdAt: new Date().toISOString() });

export const readPending = async (key: string): Promise<PendingAttachment | null> => {
  if (!KEY.test(key)) return null;
  try {
    const p = JSON.parse(await fsp.readFile(sidecarPath(key), 'utf8')) as PendingAttachment;
    return p && p.key === key ? p : null;
  } catch {
    return null;
  }
};

/** Pending → attached: the sidecar goes away, the bytes stay under <key>. */
export const consumePending = async (key: string) => {
  await fsp.unlink(sidecarPath(key)).catch(() => undefined);
};

export const removeChatFiles = async (keys: string[]) => {
  for (const key of keys) {
    if (!KEY.test(key)) continue;
    await fsp.unlink(chatFilePath(key)).catch(() => undefined);
    await fsp.unlink(sidecarPath(key)).catch(() => undefined);
  }
};

/** Deletes pending uploads nobody attached within a day. Returns the number removed. */
export const purgePendingChatUploads = async (now = Date.now()) => {
  let removed = 0;
  let names: string[] = [];
  try {
    names = await fsp.readdir(chatDir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const key = name.slice(0, -5);
    const pending = await readPending(key);
    const age = pending ? now - Date.parse(pending.createdAt) : Number.POSITIVE_INFINITY;
    if (age > PENDING_TTL_MS) {
      await removeChatFiles([key]);
      removed++;
    }
  }
  return removed;
};
