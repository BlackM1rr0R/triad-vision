import { Router } from 'express';
import { z } from 'zod';
import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { listExpiring, parseDay, setDocumentExpiry } from '../../lib/expiry/index.js';

/**
 * Document expiry (STAFF+, mounted under /api/admin which already requires staff with 2FA):
 *   PATCH /cases/:caseId/documents/:docId/expiry  { expiresAt: 'YYYY-MM-DD' | null }  — set or clear, audited
 *   GET   /expiring?days=30|60|90|180&staffId=&visaType=                                — the /admin/expiring table
 */
export const adminDocumentExpiryRouter = Router();

const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

adminDocumentExpiryRouter.patch('/cases/:caseId/documents/:docId/expiry', async (req, res) => {
  const body = parse(
    z.object({
      expiresAt: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
        .refine((v) => parseDay(v) !== null, 'Invalid date')
        .nullable(),
    }),
    req.body,
  );
  const doc = await prisma.document.findFirst({ where: { id: String(req.params.docId), caseId: String(req.params.caseId) }, select: { id: true, expiresAt: true } });
  if (!doc) throw notFound('DOCUMENT_NOT_FOUND');
  const expiresAt = body.expiresAt ? parseDay(body.expiresAt) : null;
  const updated = await setDocumentExpiry(doc.id, expiresAt);
  await audit(req, 'DOCUMENT_EXPIRY_SET', doc.id, {
    caseId: String(req.params.caseId),
    from: doc.expiresAt ? doc.expiresAt.toISOString().slice(0, 10) : null,
    to: body.expiresAt,
  });
  res.json({ document: { id: updated.id, expiresAt: updated.expiresAt, expiryRemindedAt: updated.expiryRemindedAt } });
});

adminDocumentExpiryRouter.get('/expiring', async (req, res) => {
  const q = parse(
    z.object({
      days: z.coerce.number().int().refine((d) => [30, 60, 90, 180].includes(d), 'days must be 30, 60, 90 or 180').default(30),
      staffId: z.string().trim().min(1).max(40).optional(),
      visaType: z.enum(VISA_TYPES).optional(),
    }),
    req.query,
  );
  const locale = (req.user!.locale as Locale) ?? 'az';
  const items = await listExpiring({ days: q.days, staffId: q.staffId, visaType: q.visaType, locale });
  res.json({ items, days: q.days });
});
