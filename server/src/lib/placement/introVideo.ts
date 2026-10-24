import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import multer from 'multer';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';

/**
 * Short video introduction of a candidate for employers (User.introVideoKey).
 *
 * Storage: <uploads>/private/intro-video/<random>.<ext>; only the file name is stored on the user. Served to
 * the candidate, to staff and through a live employer share link (lib/placement/shareLinks.ts), always with
 * range support so browsers can seek. Content check: the first bytes must match the claimed container
 * (MP4 / QuickTime "ftyp" box or a WebM EBML header), anything else is deleted again.
 */

export const INTRO_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
export const INTRO_VIDEO_DIR = path.join(config.uploads.privateDir, 'intro-video');
fs.mkdirSync(INTRO_VIDEO_DIR, { recursive: true });

type Matcher = (b: Buffer) => boolean;
const ascii = (s: string, at = 0): Matcher => (b) => b.length >= at + s.length && b.subarray(at, at + s.length).toString('latin1') === s;
/** ISO-BMFF image brands (HEIC / AVIF stills) are not videos. */
const IMAGE_BRANDS = ['heic', 'heix', 'mif1', 'msf1', 'avif'];

export const VIDEO_KINDS: Record<string, { match: Matcher; ext: string }> = {
  'video/mp4': { match: (b) => ascii('ftyp', 4)(b) && !IMAGE_BRANDS.includes(b.subarray(8, 12).toString('latin1')), ext: '.mp4' },
  // iPhones record .mov (QuickTime): same box structure, brand "qt  ".
  'video/quicktime': { match: (b) => ascii('ftyp', 4)(b) && !IMAGE_BRANDS.includes(b.subarray(8, 12).toString('latin1')), ext: '.mov' },
  'video/webm': { match: (b) => b.length > 8 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && b.subarray(0, 64).toString('latin1').includes('webm'), ext: '.webm' },
};
const ALIASES: Record<string, string> = { 'video/x-m4v': 'video/mp4', 'video/mov': 'video/quicktime' };
const EXT_MIME: Record<string, string> = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };

/** Normalises a browser-supplied type ("video/webm;codecs=vp9" → "video/webm"); falls back to the extension. */
export const normaliseVideoMime = (claimed: string, filename = '') => {
  const base = claimed.split(';')[0].trim().toLowerCase();
  const mime = ALIASES[base] ?? base;
  if (VIDEO_KINDS[mime]) return mime;
  if (!base || base === 'application/octet-stream') return EXT_MIME[path.extname(filename).toLowerCase()] ?? null;
  return null;
};

export const videoMatches = (head: Buffer, mime: string) => !!VIDEO_KINDS[mime]?.match(head);

/** multer for one video ("file"), streamed to disk (up to 60 MB) and checked afterwards. */
export const introVideoUpload = multer({
  storage: multer.diskStorage({
    destination: INTRO_VIDEO_DIR,
    filename: (_req, file, cb) => {
      const mime = normaliseVideoMime(file.mimetype, file.originalname) ?? 'video/mp4';
      cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${VIDEO_KINDS[mime].ext}`);
    },
  }),
  limits: { fileSize: INTRO_VIDEO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = normaliseVideoMime(file.mimetype, Buffer.from(file.originalname, 'latin1').toString('utf8'));
    if (!mime) return cb(badRequest('UNSUPPORTED_FILE_TYPE'));
    file.mimetype = mime;
    cb(null, true);
  },
});

const readHead = async (file: string) => {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(64);
    const { bytesRead } = await fh.read(buf, 0, 64, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
};

export const introVideoPath = (key: string) => path.join(INTRO_VIDEO_DIR, path.basename(key));

const removeKey = (key: string | null | undefined) => (key ? fsp.unlink(introVideoPath(key)).catch(() => undefined) : Promise.resolve());

/** Checks the stored upload, replaces the user's previous video and returns the new key. */
export const saveIntroVideo = async (userId: string, file: Express.Multer.File | undefined) => {
  if (!file?.path) throw badRequest('FILE_REQUIRED');
  const head = await readHead(file.path).catch(() => Buffer.alloc(0));
  if (file.size < 1024 || !videoMatches(head, file.mimetype)) {
    await fsp.unlink(file.path).catch(() => undefined);
    throw badRequest('FILE_CONTENT_MISMATCH');
  }
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { introVideoKey: true } });
  const key = path.basename(file.path);
  await prisma.user.update({ where: { id: userId }, data: { introVideoKey: key } });
  if (before?.introVideoKey && before.introVideoKey !== key) await removeKey(before.introVideoKey);
  return { key, size: file.size, mimeType: file.mimetype };
};

export const deleteIntroVideo = async (userId: string) => {
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { introVideoKey: true } });
  if (!before?.introVideoKey) return false;
  await prisma.user.update({ where: { id: userId }, data: { introVideoKey: null } });
  await removeKey(before.introVideoKey);
  return true;
};

/** Size and type of a stored video, or null when there is none (or the file is gone). */
export const introVideoInfo = async (key: string | null | undefined) => {
  if (!key) return null;
  const st = await fsp.stat(introVideoPath(key)).catch(() => null);
  if (!st) return null;
  return { size: st.size, mimeType: EXT_MIME[path.extname(key).toLowerCase()] ?? 'video/mp4', updatedAt: st.mtime };
};

/** Streams a stored video with range support (seeking); 404 when it is missing. */
export const sendIntroVideo = async (res: Response, key: string | null | undefined) => {
  const info = await introVideoInfo(key);
  if (!key || !info) throw notFound('VIDEO_NOT_FOUND');
  res.setHeader('Content-Type', info.mimeType);
  res.setHeader('Content-Disposition', 'inline; filename="intro-video"');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  await new Promise<void>((resolve, reject) => {
    res.sendFile(introVideoPath(key), { acceptRanges: true, cacheControl: false, lastModified: false, etag: false }, (err) => {
      if (err && !res.headersSent) reject(notFound('VIDEO_NOT_FOUND'));
      else resolve();
    });
  });
};
