import fsp from 'node:fs/promises';
import { Router, type Request } from 'express';
import { limiter, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { attachLeadContext } from '../lib/marketing/leadScoring.js';
import { partnerIdFromRequest } from '../lib/partners/owned.js';
import { decodeOriginalName, verifyUploadedFile } from '../middleware/upload.js';
import { searchQuery } from '../lib/germanyJobs/common.js';
import { enabledProviders, searchGermanyJobs } from '../lib/germanyJobs/providers.js';
import {
  applicantPhone,
  applyInput,
  createExternalApplication,
  cvUpload,
  sendApplicantConfirmation,
  siteLocale,
  type StoredCv,
} from '../lib/germanyJobs/apply.js';

/**
 * Almaniya iş bazası — mounted at /api/germany-jobs (public):
 *   GET  /config   { search: bool, sources: [{ id, name, url }] } — the enabled job sources (lib/germanyJobs/providers)
 *   GET  /search   ?q&where&radius&type=job|ausbildung&time=any|full|part&remote&visa&sort&page&lng → merged,
 *                  de-duplicated listings of the enabled providers with per-source attribution
 *                  (404 FEATURE_DISABLED when none is enabled; 30 per minute per IP; provider caches)
 *   POST /apply    multipart: listing + candidate fields + optional CV ("cv": PDF / DOC / DOCX) → Inquiry lead,
 *                  staff notice, confirmation e-mail. Honeypot `website`, consent required, 10 per hour per IP.
 * Third-party listings are never stored beyond the short search cache (lib/germanyJobs/adzuna.ts).
 */
export const germanyJobsRouter = Router();

const searchLimiter = limiter({ windowMs: 60 * 1000, limit: 30 });
const applyLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

germanyJobsRouter.get('/config', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  const sources = enabledProviders().map((p) => p.info);
  res.json({ search: sources.length > 0, sources });
});

germanyJobsRouter.get('/search', searchLimiter, async (req, res) => {
  if (!enabledProviders().length) throw notFound('FEATURE_DISABLED');
  const q = parse(searchQuery, req.query);
  // Careerjet requires the visitor's IP / user agent per call: passed through, never stored or logged.
  const result = await searchGermanyJobs(q, { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 300) ?? null });
  // Third-party content: never indexed, only briefly reused by the browser.
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.json(result);
});

const removeFile = (file: Express.Multer.File | undefined) => (file ? fsp.unlink(file.path).catch(() => undefined) : undefined);

const accountOf = (req: Request) => {
  const u = req.user;
  if (!u || u.role !== 'CLIENT' || req.impersonator) return null;
  return u;
};

germanyJobsRouter.post('/apply', applyLimiter, cvUpload.single('cv'), async (req, res) => {
  const file = req.file;
  try {
    const parsed = applyInput.safeParse(req.body ?? {});
    if (!parsed.success) throw parsed.error;
    const body = parsed.data;
    if (body.website) {
      // A bot filled the hidden field: look like a success, store nothing.
      await removeFile(file);
      res.status(201).json({ ok: true });
      return;
    }
    const phone = applicantPhone(body.phone);
    let cv: StoredCv | null = null;
    if (file) {
      await verifyUploadedFile(file); // magic bytes must match the type (removes the file and answers 400 otherwise)
      cv = { storedName: file.filename, originalName: decodeOriginalName(file.originalname), mime: file.mimetype, size: file.size };
    }
    const lng = siteLocale(body.lng);
    const account = accountOf(req);
    const inquiry = await createExternalApplication(body, {
      phone,
      lng,
      cv,
      userId: account?.id ?? null,
      partnerId: await partnerIdFromRequest(req),
      accountLabel: account ? `${account.email} (${account.id})` : null,
    });
    void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
    const job = body.listingTitle ?? body.listingCompany ?? new URL(body.listingUrl).hostname;
    await notifyStaff(`Xarici vakansiyaya müraciət: ${body.name} · ${job}`.slice(0, 200), inquiry.message, { link: `/admin/inquiries?open=${inquiry.id}` });
    await sendApplicantConfirmation(body.email, body.name, job, lng);
    await attachLeadContext(inquiry.id, { visitorId: body.visitorId });
    res.status(201).json({ ok: true, id: inquiry.id });
  } catch (err) {
    await removeFile(file);
    throw err;
  }
});
