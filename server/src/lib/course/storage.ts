import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import multer from 'multer';
import { config } from '../../config.js';
import { badRequest, notFound } from '../http.js';
import { bufferMatches } from '../fileCheck.js';
import { VIDEO_KINDS, normaliseVideoMime, videoMatches } from '../placement/introVideo.js';

/**
 * Course files in our own storage: <uploads>/private/course/<random>.<ext>. Only the file name is kept on the
 * lesson (videoKey / posterKey / subtitles[locale]). Everything is served through authorised routes:
 * videos with HTTP range support (seeking, resume), posters and WebVTT subtitles as small files.
 *
 * Checks: the video's first bytes must match its container (MP4 / QuickTime / WebM, same rules as the intro
 * video), posters must really be JPEG / PNG / WebP, subtitles must be UTF-8 text starting with "WEBVTT".
 */

export const COURSE_DIR = path.join(config.uploads.privateDir, 'course');
fs.mkdirSync(COURSE_DIR, { recursive: true });

export const COURSE_VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const COURSE_POSTER_MAX_BYTES = 5 * 1024 * 1024;
export const COURSE_VTT_MAX_BYTES = 1024 * 1024;

const POSTER_EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const EXT_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.vtt': 'text/vtt; charset=utf-8',
};

const randomName = (ext: string) => `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;

/** multer for one lesson video ("file"), streamed to disk and checked afterwards. */
export const courseVideoUpload = multer({
  storage: multer.diskStorage({
    destination: COURSE_DIR,
    filename: (_req, file, cb) => cb(null, randomName(VIDEO_KINDS[normaliseVideoMime(file.mimetype, file.originalname) ?? 'video/mp4'].ext)),
  }),
  limits: { fileSize: COURSE_VIDEO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = normaliseVideoMime(file.mimetype, Buffer.from(file.originalname, 'latin1').toString('utf8'));
    if (!mime) return cb(badRequest('UNSUPPORTED_FILE_TYPE'));
    file.mimetype = mime;
    cb(null, true);
  },
});

/** multer for a poster image or a subtitle file (small, kept in memory until checked). */
export const courseAssetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: COURSE_POSTER_MAX_BYTES, files: 1 } });

export const coursePath = (key: string) => path.join(COURSE_DIR, path.basename(key));

export const removeCourseFile = (key: string | null | undefined) => (key ? fsp.unlink(coursePath(key)).catch(() => undefined) : Promise.resolve());

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

/** Checks an uploaded video; deletes it again when the bytes are not a video. Returns the stored key. */
export const acceptVideo = async (file: Express.Multer.File | undefined) => {
  if (!file?.path) throw badRequest('FILE_REQUIRED');
  const head = await readHead(file.path).catch(() => Buffer.alloc(0));
  if (file.size < 1024 || !videoMatches(head, file.mimetype)) {
    await fsp.unlink(file.path).catch(() => undefined);
    throw badRequest('FILE_CONTENT_MISMATCH');
  }
  return { key: path.basename(file.path), mime: file.mimetype, size: file.size };
};

/** Stores a poster (JPEG / PNG / WebP, sniffed) and returns its key. */
export const storePoster = async (file: Express.Multer.File | undefined) => {
  if (!file?.buffer?.length) throw badRequest('FILE_REQUIRED');
  const mime = Object.keys(POSTER_EXT).find((m) => bufferMatches(file.buffer, m));
  if (!mime) throw badRequest('UNSUPPORTED_FILE_TYPE');
  const key = randomName(POSTER_EXT[mime]);
  await fsp.writeFile(coursePath(key), file.buffer);
  return key;
};

/** Stores WebVTT subtitles (UTF-8, "WEBVTT" header, ≤ 1 MB, no NUL bytes) and returns the key. */
export const storeSubtitles = async (file: Express.Multer.File | undefined) => {
  if (!file?.buffer?.length) throw badRequest('FILE_REQUIRED');
  if (file.buffer.length > COURSE_VTT_MAX_BYTES) throw badRequest('FILE_TOO_LARGE');
  const text = file.buffer.toString('utf8').replace(/^﻿/, '');
  if (!/^WEBVTT(?:[ \t][^\r\n]*)?(?:\r?\n|$)/.test(text) || text.includes('\u0000') || text.includes('�')) throw badRequest('INVALID_SUBTITLES');
  const key = randomName('.vtt');
  await fsp.writeFile(coursePath(key), text, 'utf8');
  return key;
};

/** Streams a stored course file (range requests for videos); 404 when it is missing. */
export const sendCourseFile = async (res: Response, key: string | null | undefined, opts: { mime?: string | null } = {}) => {
  if (!key) throw notFound('FILE_NOT_FOUND');
  const file = coursePath(key);
  const st = await fsp.stat(file).catch(() => null);
  if (!st) throw notFound('FILE_NOT_FOUND');
  res.setHeader('Content-Type', opts.mime || EXT_MIME[path.extname(key).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=600');
  await new Promise<void>((resolve, reject) => {
    res.sendFile(file, { acceptRanges: true, cacheControl: false, lastModified: false, etag: false }, (err) => {
      if (err && !res.headersSent) reject(notFound('FILE_NOT_FOUND'));
      else resolve();
    });
  });
};
