import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { arrivalCertificatePdf } from '../lib/arrivalCertificate/pdf.js';
import { CERT_LOCALES, asCertLocale } from '../lib/arrivalCertificate/texts.js';
import { certificateForPdf, clientCertificates, setRevoked, staffCertificateView, verifyArrivalCertificate, verifyUrlOf } from '../lib/arrivalCertificate/service.js';

/**
 * "Welcome to Germany" arrival certificate (lib/arrivalCertificate).
 *
 * Client — mounted at /api/account/arrival-certificate (CLIENT only, own cases only):
 *   GET /                              certificates of the client's arrived cases (issued on the first visit)
 *   GET /:caseId/certificate.pdf       ?lang=az|de|en|ru&employer=0|1 → A4 landscape PDF (revoked → 410)
 *
 * Public — mounted at /api/arrival-certificates:
 *   GET /:code                         { valid, number, holder: "Aynur Q.", arrivedAt: YYYY-MM-DD } — nothing else;
 *                                      revoked → 410 CERTIFICATE_REVOKED, unknown → 404
 *
 * Staff — mounted at /api/admin/arrival-certificates (admin router: STAFF+):
 *   GET  /?caseId=<id>                 the case's certificate (or null)
 *   POST /:id/revoke  { reason? }      revoke (public check then answers "revoked"); POST /:id/restore undoes it
 */
export const accountArrivalCertificateRouter = Router();
accountArrivalCertificateRouter.use(requireAuth);
accountArrivalCertificateRouter.use((req, _res, next) => next(req.user!.role === 'CLIENT' ? undefined : forbidden('CLIENTS_ONLY')));
accountArrivalCertificateRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

accountArrivalCertificateRouter.get('/', async (req, res) => {
  res.json({ items: await clientCertificates(req.user!.id) });
});

const pdfQuery = z.object({ lang: z.enum(CERT_LOCALES).optional(), employer: z.enum(['0', '1']).default('1') });

accountArrivalCertificateRouter.get('/:caseId/certificate.pdf', async (req, res) => {
  const q = parse(pdfQuery, req.query);
  const caseId = String(req.params.caseId).slice(0, 41);
  await clientCertificates(req.user!.id); // issues it if the arrival was just confirmed
  const data = await certificateForPdf(req.user!.id, caseId);
  if (!data) throw notFound('CERTIFICATE_NOT_FOUND');
  if (data.revoked) throw new HttpError(410, 'CERTIFICATE_REVOKED');
  const locale = q.lang ?? asCertLocale(req.user!.locale);
  const pdf = await arrivalCertificatePdf({
    fullName: data.fullName,
    city: data.city,
    arrivedAt: data.cert.arrivedAt,
    profession: data.profession,
    employer: q.employer === '1' ? data.employer : null,
    number: data.cert.number,
    verifyUrl: verifyUrlOf(data.cert.code),
    locale,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="welcome-to-germany-${data.cert.number}-${locale}.pdf"`);
  res.send(pdf);
});

// ─── Public verification ───────────────────────────────────────────────

export const publicArrivalCertificateRouter = Router();
const verifyLimiter = limiter({ windowMs: 60 * 1000, limit: 30, skip: () => config.isTest });

publicArrivalCertificateRouter.get('/:code', verifyLimiter, async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'no-store');
  const r = await verifyArrivalCertificate(String(req.params.code).toUpperCase());
  if (!r) throw notFound('CERTIFICATE_NOT_FOUND');
  if (r.revoked) throw new HttpError(410, 'CERTIFICATE_REVOKED');
  res.json(r);
});

// ─── Staff ──────────────────────────────────────────────────────────────

export const adminArrivalCertificateRouter = Router();

adminArrivalCertificateRouter.get('/', async (req, res) => {
  const { caseId } = parse(z.object({ caseId: z.string().min(1).max(40) }), req.query);
  const cert = await prisma.arrivalCertificate.findUnique({ where: { caseId } });
  res.json({ certificate: staffCertificateView(cert) });
});

const revokeSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();

adminArrivalCertificateRouter.post('/:id/revoke', async (req, res) => {
  const { reason } = parse(revokeSchema, req.body ?? {});
  const cert = await setRevoked(String(req.params.id), true, req.user!.id, reason);
  if (!cert) throw notFound('CERTIFICATE_NOT_FOUND');
  await audit(req, 'ARRIVAL_CERTIFICATE_REVOKED', cert.id, { caseId: cert.caseId, number: cert.number, reason: reason ?? null });
  res.json({ certificate: staffCertificateView(cert) });
});

adminArrivalCertificateRouter.post('/:id/restore', async (req, res) => {
  const cert = await setRevoked(String(req.params.id), false, req.user!.id);
  if (!cert) throw notFound('CERTIFICATE_NOT_FOUND');
  await audit(req, 'ARRIVAL_CERTIFICATE_RESTORED', cert.id, { caseId: cert.caseId, number: cert.number });
  res.json({ certificate: staffCertificateView(cert) });
});
