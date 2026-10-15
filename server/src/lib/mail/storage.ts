import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { badRequest } from '../http.js';
import { mailSettings } from './settings.js';

/**
 * Attachment bytes live flat under <DOCS_DIR>/mail/<storageKey> (random key, never a user-supplied
 * name). Uploads for drafts are spooled in <DOCS_DIR>/.incoming by multer and adopted after the
 * content check.
 */
export const mailDir = mailSettings.dir;
fs.mkdirSync(mailDir, { recursive: true });

const KEY = /^[a-f0-9]{32}$/;

export const newMailKey = () => crypto.randomBytes(16).toString('hex');

export const mailPath = (key: string) => {
  if (!KEY.test(key)) throw badRequest('INVALID_STORAGE_KEY');
  return path.join(mailDir, key);
};

export const storeBuffer = async (buf: Buffer) => {
  const key = newMailKey();
  await fsp.mkdir(mailDir, { recursive: true });
  await fsp.writeFile(mailPath(key), buf);
  return key;
};

export const adoptMailUpload = async (tmpPath: string) => {
  const key = newMailKey();
  await fsp.mkdir(mailDir, { recursive: true });
  await fsp.rename(tmpPath, mailPath(key));
  return key;
};

export const readStored = (key: string) => fsp.readFile(mailPath(key));

export const removeMailStored = async (keys: (string | null | undefined)[]) => {
  for (const key of keys) {
    if (!key || !KEY.test(key)) continue;
    try {
      await fsp.unlink(mailPath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[mail] unlink failed', key, err);
    }
  }
};

export const storedExists = async (key: string) => {
  try {
    await fsp.access(mailPath(key));
    return true;
  } catch {
    return false;
  }
};
