import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { limiter, parse } from '../lib/http.js';
import { attachmentHeader } from '../lib/cv/pdf.js';
import { disclosureSchema } from '../lib/rentalDisclosure/schema.js';
import { disclosureFilename, renderDisclosurePdf } from '../lib/rentalDisclosure/pdf.js';
import { disclosurePrefill } from '../lib/rentalDisclosure/prefill.js';

/**
 * Mieterselbstauskunft generator (/apartment-viewing) — mounted at /api/rental-disclosure:
 *   POST /pdf   public: the form (lib/rentalDisclosure/schema.ts, DSK-permissible fields only) → German A4 PDF.
 *               Rendered from the request and not stored or logged.
 *   GET  /me    client portal: prefill from the own profile and application (lib/rentalDisclosure/prefill.ts).
 */
export const rentalDisclosureRouter = Router();

const pdfLimiter = limiter({ windowMs: 60 * 1000, limit: 20 });

rentalDisclosureRouter.post('/pdf', pdfLimiter, async (req, res) => {
  const d = parse(disclosureSchema, req.body);
  const bytes = await renderDisclosurePdf(d);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(disclosureFilename(d)));
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(Buffer.from(bytes));
});

rentalDisclosureRouter.get('/me', requireRole('CLIENT'), async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await disclosurePrefill(req.user!.id));
});
