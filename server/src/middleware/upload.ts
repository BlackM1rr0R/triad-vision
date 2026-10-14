import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/http.js';

fs.mkdirSync(config.uploads.privateDir, { recursive: true });
fs.mkdirSync(config.uploads.publicDir, { recursive: true });

const DOC_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/avif']);

const storage = (dir: string) =>
  multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  });

/** Case documents: stored outside the public folder, served only through an authorised route. */
export const documentUpload = multer({
  storage: storage(config.uploads.privateDir),
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: (_req, file, cb) => {
    if (DOC_MIME.has(file.mimetype)) cb(null, true);
    else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

/** CMS images (admin only): publicly served. */
export const imageUpload = multer({
  storage: storage(config.uploads.publicDir),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME.has(file.mimetype)) cb(null, true);
    else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

/** multer decodes original names as latin1; restore UTF-8 so Azerbaijani/Cyrillic file names survive. */
export const decodeOriginalName = (name: string) => Buffer.from(name, 'latin1').toString('utf8');
