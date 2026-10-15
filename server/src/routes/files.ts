import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { isStaff, requireAuth } from '../middleware/auth.js';
import { notFound } from '../lib/http.js';

export const filesRouter = Router();

/** Case documents are private: only the case owner and staff can download them. */
filesRouter.get('/:docId', requireAuth, async (req, res) => {
  const doc = await prisma.document.findUnique({
    where: { id: String(req.params.docId) },
    include: { case: { select: { clientId: true } } },
  });
  // Staff access counts only once 2FA is enrolled (same gate as /api/admin and /api/docs).
  const staffAccess = isStaff(req.user) && !!req.user!.twoFactorEnabled;
  if (!doc || (!staffAccess && doc.case.clientId !== req.user!.id)) throw notFound('DOCUMENT_NOT_FOUND');

  const disposition = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.sendFile(path.join(config.uploads.privateDir, doc.storedName));
});
