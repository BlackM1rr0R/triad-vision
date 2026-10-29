import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import multer from 'multer';
import { config } from '../../config.js';
import { badRequest, notFound } from '../http.js';
import { VIDEO_KINDS, normaliseVideoMime, videoMatches } from '../placement/introVideo.js';

/**
 * Files of the skill videos: <uploads>/private/skill-video/<random>.<ext> (+ <random>.poster.<jpg|png|webp>).
 *
 * No ffmpeg (the production box has 2 GB RAM): the container is checked by its magic bytes (the same
 * matchers as the intro video), the duration is read from the MP4 / QuickTime `mvhd` box or the WebM
 * `Info/Duration` element when present. Browser recordings (MediaRecorder WebM) often have no duration,
 * then the length measured by the browser is used, capped by the same limit. The poster frame is
 * captured by the browser from a <video> on a canvas and uploaded next to the video.
 */

export const SKILL_VIDEO_DIR = path.join(config.uploads.privateDir, 'skill-video');
fs.mkdirSync(SKILL_VIDEO_DIR, { recursive: true });

export const SKILL_VIDEO_MAX_BYTES = 150 * 1024 * 1024;
export const SKILL_VIDEO_MAX_SECONDS = 180;
export const SKILL_VIDEO_MAX_RECORD_SECONDS = 90;
export const POSTER_MAX_BYTES = 600 * 1024;

const POSTER_KINDS: Record<string, { ext: string; match: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: '.jpg', match: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: '.png', match: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: '.webp', match: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};
const EXT_MIME: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const randomName = (ext: string) => `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;

/** multer: "file" (the video, ≤ 150 MB) and an optional "poster" (JPEG / PNG / WebP still), streamed to disk. */
export const skillVideoUpload = multer({
  storage: multer.diskStorage({
    destination: SKILL_VIDEO_DIR,
    filename: (_req, file, cb) => {
      if (file.fieldname === 'poster') return cb(null, randomName(`.poster${POSTER_KINDS[file.mimetype]?.ext ?? '.jpg'}`));
      const mime = normaliseVideoMime(file.mimetype, file.originalname) ?? 'video/mp4';
      cb(null, randomName(VIDEO_KINDS[mime].ext));
    },
  }),
  limits: { fileSize: SKILL_VIDEO_MAX_BYTES, files: 2, fields: 10, fieldSize: 4096 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'poster') {
      if (!POSTER_KINDS[file.mimetype]) return cb(badRequest('UNSUPPORTED_POSTER_TYPE'));
      return cb(null, true);
    }
    if (file.fieldname !== 'file') return cb(badRequest('UNEXPECTED_FILE'));
    const mime = normaliseVideoMime(file.mimetype, Buffer.from(file.originalname, 'latin1').toString('utf8'));
    if (!mime) return cb(badRequest('UNSUPPORTED_FILE_TYPE'));
    file.mimetype = mime;
    cb(null, true);
  },
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'poster', maxCount: 1 },
]);

export const skillVideoPath = (name: string) => path.join(SKILL_VIDEO_DIR, path.basename(name));

export const removeSkillFile = async (name: string | null | undefined) => {
  if (!name) return 0;
  const file = skillVideoPath(name);
  const size = await fsp.stat(file).then((s) => s.size).catch(() => 0);
  await fsp.unlink(file).catch(() => undefined);
  return size;
};

const readAt = async (fh: fsp.FileHandle, pos: number, len: number) => {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
};

// ─── Duration ───────────────────────────────────────────────────────────

/** ISO-BMFF (MP4 / MOV): walks the top-level boxes to `moov`, then its children to `mvhd`. */
const mp4Duration = async (fh: fsp.FileHandle, fileSize: number): Promise<number | null> => {
  const walk = async (start: number, end: number, want: string): Promise<{ at: number; size: number } | null> => {
    let pos = start;
    for (let i = 0; i < 512 && pos + 8 <= end; i++) {
      const h = await readAt(fh, pos, 16);
      if (h.length < 8) return null;
      let size = h.readUInt32BE(0);
      const type = h.subarray(4, 8).toString('latin1');
      let header = 8;
      if (size === 1) {
        if (h.length < 16) return null;
        size = Number(h.readBigUInt64BE(8));
        header = 16;
      } else if (size === 0) size = end - pos;
      if (size < header) return null;
      if (type === want) return { at: pos + header, size: size - header };
      pos += size;
    }
    return null;
  };
  const moov = await walk(0, fileSize, 'moov');
  if (!moov) return null;
  const mvhd = await walk(moov.at, moov.at + moov.size, 'mvhd');
  if (!mvhd) return null;
  const b = await readAt(fh, mvhd.at, 32);
  if (b.length < 20) return null;
  const version = b[0];
  const timescale = version === 1 ? b.readUInt32BE(20) : b.readUInt32BE(12);
  const duration = version === 1 ? (b.length >= 32 ? Number(b.readBigUInt64BE(24)) : 0) : b.readUInt32BE(16);
  if (!timescale || !duration || duration === 0xffffffff) return null;
  return duration / timescale;
};

/** EBML variable-length integer at `pos` (ids keep their marker bit, sizes drop it). */
const vint = (b: Buffer, pos: number, keepMarker: boolean): { value: number; len: number; unknown: boolean } | null => {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || pos + len > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let allOnes = (first & (0xff >> len)) === 0xff >> len;
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[pos + i];
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !keepMarker && allOnes };
};

const EBML = { segment: 0x18538067, info: 0x1549a966, duration: 0x4489, timecodeScale: 0x2ad7b1, cluster: 0x1f43b675 };

/** WebM / Matroska: Segment → Info → Duration (× TimecodeScale), looked for in the first 256 KB. */
const webmDuration = async (fh: fsp.FileHandle): Promise<number | null> => {
  const b = await readAt(fh, 0, 256 * 1024);
  let pos = 0;
  let scale = 1_000_000;
  let duration: number | null = null;
  for (let i = 0; i < 4096 && pos < b.length; i++) {
    const id = vint(b, pos, true);
    if (!id) return null;
    const size = vint(b, pos + id.len, false);
    if (!size) return null;
    const data = pos + id.len + size.len;
    if (id.value === EBML.segment || id.value === EBML.info) {
      pos = data; // descend into the master element
      continue;
    }
    if (id.value === EBML.cluster) break; // media data: Info comes before it
    if (size.unknown) return null;
    if (id.value === EBML.duration && data + size.value <= b.length) {
      duration = size.value === 4 ? b.readFloatBE(data) : size.value === 8 ? b.readDoubleBE(data) : null;
    } else if (id.value === EBML.timecodeScale && size.value <= 8 && data + size.value <= b.length) {
      scale = b.readUIntBE(data, Math.min(size.value, 6));
    }
    pos = data + size.value;
  }
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return null;
  return (duration * scale) / 1e9;
};

export interface CheckedVideo {
  mimeType: string;
  size: number;
  /** Seconds read from the container, or null when the container does not say. */
  durationSec: number | null;
}

/**
 * Checks a stored upload: real container matching the claimed type (else FILE_CONTENT_MISMATCH),
 * duration from the container when present. The caller deletes the file on any error.
 */
export const inspectVideo = async (file: Express.Multer.File): Promise<CheckedVideo> => {
  const fh = await fsp.open(file.path, 'r');
  try {
    const head = await readAt(fh, 0, 64);
    if (file.size < 1024 || !videoMatches(head, file.mimetype)) throw badRequest('FILE_CONTENT_MISMATCH');
    const raw = file.mimetype === 'video/webm' ? await webmDuration(fh) : await mp4Duration(fh, file.size).catch(() => null);
    return { mimeType: file.mimetype, size: file.size, durationSec: raw != null ? Math.round(raw * 10) / 10 : null };
  } finally {
    await fh.close();
  }
};

/** The poster still: real JPEG / PNG / WebP of at most 600 KB, else it is dropped (never fails the upload). */
export const acceptPoster = async (file: Express.Multer.File | undefined): Promise<string | null> => {
  if (!file?.path) return null;
  const ok = await (async () => {
    if (file.size > POSTER_MAX_BYTES || file.size < 32) return false;
    const fh = await fsp.open(file.path, 'r');
    try {
      return !!POSTER_KINDS[file.mimetype]?.match(await readAt(fh, 0, 16));
    } finally {
      await fh.close();
    }
  })().catch(() => false);
  if (!ok) {
    await fsp.unlink(file.path).catch(() => undefined);
    return null;
  }
  return path.basename(file.path);
};

/** Streams a stored file with HTTP Range support (seeking); inline, never cached by shared caches. */
export const sendSkillFile = async (res: Response, name: string | null | undefined) => {
  if (!name) throw notFound('VIDEO_NOT_FOUND');
  const file = skillVideoPath(name);
  const st = await fsp.stat(file).catch(() => null);
  if (!st) throw notFound('VIDEO_NOT_FOUND');
  res.setHeader('Content-Type', EXT_MIME[path.extname(name).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  await new Promise<void>((resolve, reject) => {
    res.sendFile(file, { acceptRanges: true, cacheControl: false, lastModified: false, etag: false }, (err) => {
      if (err && !res.headersSent) reject(notFound('VIDEO_NOT_FOUND'));
      else resolve();
    });
  });
};
