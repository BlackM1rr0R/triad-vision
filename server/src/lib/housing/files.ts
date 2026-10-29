import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import multer from 'multer';
import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { decodeOriginalName, verifyUploadedFile } from '../../middleware/upload.js';
import { CASE_DOC_MIME, resolveMime } from '../fileCheck.js';
import { badRequest, notFound } from '../http.js';
import { vaultDir } from '../docCheck/index.js';
import { vaultTitles } from './texts.js';

/**
 * Rental contract and Meldebescheinigung go into the client's personal vault (same folder, size and type
 * rules as vault uploads), so the client keeps them for later; the housing record points at them.
 */

const randomName = (original: string) => {
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '');
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
};

export const housingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => fs.mkdir(vaultDir(), { recursive: true }, (err) => cb(err ?? null, vaultDir())),
    filename: (_req, file, cb) => cb(null, randomName(file.originalname)),
  }),
  limits: { fileSize: config.uploads.maxFileSize, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && CASE_DOC_MIME.has(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

export const removeUpload = (file: Express.Multer.File | undefined) => (file ? fsp.unlink(file.path).catch(() => undefined) : Promise.resolve());

/** Verifies the bytes and stores the vault row (kind OTHER, titled in the client's language). */
export const storeInVault = async (file: Express.Multer.File, userId: string, kind: 'contract' | 'melde', locale: Locale) => {
  await verifyUploadedFile(file);
  return prisma.vaultDocument.create({
    data: {
      userId,
      kind: 'OTHER',
      title: vaultTitles[locale][kind],
      storageKey: file.filename,
      filename: decodeOriginalName(file.originalname).slice(0, 200),
      mimeType: file.mimetype,
      size: file.size,
    },
  });
};

const INLINE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/** Streams a vault file of `userId` (staff access goes through the case's housing record). */
export const sendVaultFile = async (res: Response, id: string | null, userId: string, download = false) => {
  const d = id ? await prisma.vaultDocument.findFirst({ where: { id, userId } }) : null;
  if (!d) throw notFound('FILE_NOT_FOUND');
  res.setHeader('Content-Type', d.mimeType);
  res.setHeader('Content-Disposition', `${download || !INLINE_MIME.has(d.mimeType) ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(path.join(vaultDir(), d.storageKey), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_NOT_FOUND' });
  });
  return d;
};
