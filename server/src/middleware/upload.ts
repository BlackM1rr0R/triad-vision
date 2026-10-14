import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/http.js';
import { CASE_DOC_MIME, FileCheckError, IMAGE_MIME, WORKSPACE_MIME, resolveMime, verifyStoredFile } from '../lib/fileCheck.js';

fs.mkdirSync(config.uploads.privateDir, { recursive: true });
fs.mkdirSync(config.uploads.publicDir, { recursive: true });
fs.mkdirSync(config.docs.dir, { recursive: true });

/** multer decodes original names as latin1; restore UTF-8 so Azerbaijani/Cyrillic file names survive. */
export const decodeOriginalName = (name: string) => Buffer.from(name, 'latin1').toString('utf8');

const randomStorage = (dir: string) =>
  multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  });

const filterFor = (allowed: Set<string>): multer.Options['fileFilter'] => (_req, file, cb) => {
  const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
  if (mime && allowed.has(mime)) {
    file.mimetype = mime;
    cb(null, true);
  } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
};

/** Case documents: stored outside the public folder, served only through an authorised route. */
export const documentUpload = multer({
  storage: randomStorage(config.uploads.privateDir),
  limits: { fileSize: config.uploads.maxFileSize, files: 1 },
  fileFilter: filterFor(CASE_DOC_MIME),
});

/** CMS images (admin only): publicly served. */
export const imageUpload = multer({
  storage: randomStorage(config.uploads.publicDir),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: filterFor(IMAGE_MIME),
});

/** Staff workspace files: spooled to a temp name first, then moved into /docs/<user>/... once checked. */
export const workspaceUpload = multer({
  storage: randomStorage(path.join(config.docs.dir, '.incoming')),
  limits: { fileSize: config.docs.maxFileSize, files: 1 },
  fileFilter: filterFor(WORKSPACE_MIME),
});
fs.mkdirSync(path.join(config.docs.dir, '.incoming'), { recursive: true });

/**
 * Verifies the bytes of a file multer just stored match its (already normalised) MIME type.
 * On mismatch the file is removed and a 400 is raised, so nothing unverified ever stays on disk.
 */
export const verifyUploadedFile = async (file: Express.Multer.File) => {
  try {
    await verifyStoredFile(file.path, file.mimetype);
  } catch (err) {
    await fsp.unlink(file.path).catch(() => undefined);
    if (err instanceof FileCheckError) throw badRequest(err.code);
    throw err;
  }
};
