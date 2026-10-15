import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../../config.js';
import { decodeOriginalName } from '../../middleware/upload.js';
import { WORKSPACE_MIME, resolveMime } from '../fileCheck.js';
import { badRequest } from '../http.js';
import { incomingDir } from './storage.js';

/**
 * One file per request (the client uploads files one after another with per-file progress). Files are
 * spooled under a random name in <DOCS_DIR>/.incoming, content-checked (magic bytes) by the route and
 * only then adopted into the drive store.
 */
export const driveUpload = multer({
  storage: multer.diskStorage({
    destination: incomingDir,
    filename: (_req, _file, cb) => cb(null, `drive-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`),
  }),
  limits: { fileSize: config.drive.maxFileSize, files: 1, fields: 10, fieldSize: 4096 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && WORKSPACE_MIME.has(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});
