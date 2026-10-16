import type { Request, Response } from 'express';
import multer from 'multer';
import { badRequest } from '../http.js';
import { MAX_PDF_BYTES, storedPath } from './service.js';

/** Request metadata recorded on the audit trail. */
export const metaOf = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null });

/** PDFs (max 20 MB) are kept in memory: the bytes are checked and hashed before anything is stored. */
export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 10, fieldSize: 200_000 },
  fileFilter: (_req, file, cb) => {
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8').toLowerCase();
    if (file.mimetype === 'application/pdf' || (file.mimetype === 'application/octet-stream' && name.endsWith('.pdf'))) cb(null, true);
    else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

/** Serves a stored PDF like /api/files: nosniff + sandbox CSP, inline (preview) or attachment. */
export const sendPdf = (res: Response, key: string, filename: string, download: boolean) => {
  const name = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(storedPath(key));
};
