import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { isStaff, requireAuth } from '../middleware/auth.js';
import { notFound } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { logDocumentAccess } from '../lib/privacy/accessLog.js'; // "who viewed my documents"

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
  // Explicit staff downloads feed the bulk-download security rule (lib/aiMgmt/security).
  if (req.query.download && doc.case.clientId !== req.user!.id) void audit(req, 'FILE_DOWNLOADED', `document:${doc.id}`, { caseId: doc.caseId });
  // Client access log: staff previews / downloads (aggregated per 10 minutes, never blocks the response).
  void logDocumentAccess(req.user, { id: doc.id, caseId: doc.caseId, name: doc.originalName, clientId: doc.case.clientId }, req.query.download ? 'DOWNLOAD' : 'VIEW', 'FILES');
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.sendFile(path.join(config.uploads.privateDir, doc.storedName));
});
