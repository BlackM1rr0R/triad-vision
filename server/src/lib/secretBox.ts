import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Symmetric encryption for small server-side secrets (TOTP seeds). AES-256-GCM with a random
 * 96-bit IV per value. The key comes from TOTP_ENC_KEY when set (so rotating JWT_SECRET does not
 * lock every staff member out of 2FA), otherwise it is derived from JWT_SECRET with HKDF.
 *
 * Stored format: "v1:" + base64(iv | tag | ciphertext)
 */
const VERSION = 'v1';

let cachedKey: Buffer | null = null;
let cachedFrom = '';

const key = () => {
  const material = process.env.TOTP_ENC_KEY || config.jwtSecret;
  if (cachedKey && cachedFrom === material) return cachedKey;
  cachedKey = Buffer.from(crypto.hkdfSync('sha256', material, 'triad-vision', 'totp-secret-box/v1', 32));
  cachedFrom = material;
  return cachedKey;
};

export const seal = (plain: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString('base64')}`;
};

/** Returns null when the value is malformed or was sealed with another key (never throws). */
export const open = (sealed: string | null | undefined): string | null => {
  if (!sealed || !sealed.startsWith(`${VERSION}:`)) return null;
  try {
    const raw = Buffer.from(sealed.slice(VERSION.length + 1), 'base64');
    if (raw.length < 12 + 16 + 1) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};
