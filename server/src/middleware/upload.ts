import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest } from '../lib/http.js';
import { CASE_DOC_MIME, FileCheckError, HEIF_MIME, IMAGE_MIME, WORKSPACE_MIME, resolveMime, verifyStoredFile } from '../lib/fileCheck.js';
import { heicToJpeg } from '../lib/pdfTools/images.js';

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

/** Set by clientDocFilter on an accepted HEIC/HEIF photo: verifyUploadedFile turns it into a JPEG. */
type HeicFlagged = { convertHeicToJpeg?: boolean };

/**
 * Client documents (case documents, vault, housing, client-data forms, partner uploads, job applications):
 * the case-document types plus iPhone photos (HEIC/HEIF). A HEIC/HEIF photo is accepted here and converted to
 * JPEG right after its bytes were verified (verifyUploadedFile), so everything stored is something browsers,
 * the AI checks and the PDF tools can read. Multer keeps the same file object from the filter to req.file.
 */
export const clientDocFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
  if (mime && (CASE_DOC_MIME.has(mime) || HEIF_MIME.has(mime))) {
    file.mimetype = mime;
    if (HEIF_MIME.has(mime)) (file as HeicFlagged).convertHeicToJpeg = true;
    cb(null, true);
  } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
};

/** Case documents: stored outside the public folder, served only through an authorised route. */
export const documentUpload = multer({
  storage: randomStorage(config.uploads.privateDir),
  limits: { fileSize: config.uploads.maxFileSize, files: 1 },
  fileFilter: clientDocFilter,
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
  if ((file as HeicFlagged).convertHeicToJpeg && HEIF_MIME.has(file.mimetype)) await convertHeicUpload(file);
};

/**
 * HEIC/HEIF upload (verified) → JPEG next to it: the file object then describes the JPEG (path, filename,
 * name with ".jpg", type, size) and the original is removed. A photo whose JPEG would exceed the upload limit
 * is scaled down until it fits. Unreadable → 400 HEIC_UNREADABLE (nothing stays on disk).
 */
export const convertHeicUpload = async (file: Express.Multer.File, maxBytes = config.uploads.maxFileSize) => {
  const source = file.path;
  try {
    let jpeg = await heicToJpeg(await fsp.readFile(source));
    for (const edge of [4000, 3000, 2400]) {
      if (jpeg.length <= maxBytes) break;
      jpeg = await sharp(jpeg).resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
    if (jpeg.length > maxBytes) throw badRequest('FILE_TOO_LARGE');
    const filename = `${path.basename(file.filename, path.extname(file.filename))}.jpg`;
    const target = path.join(path.dirname(source), filename);
    await fsp.writeFile(target, jpeg);
    await fsp.unlink(source).catch(() => undefined);
    file.path = target;
    file.filename = filename;
    file.mimetype = 'image/jpeg';
    file.size = jpeg.length;
    // originalname is latin1-encoded by multer (decodeOriginalName); the extension is plain ASCII either way.
    file.originalname = `${file.originalname.replace(/\.(heic|heif)$/i, '') || 'photo'}.jpg`;
    delete (file as HeicFlagged).convertHeicToJpeg;
  } catch (err) {
    await fsp.unlink(source).catch(() => undefined);
    throw err;
  }
};
