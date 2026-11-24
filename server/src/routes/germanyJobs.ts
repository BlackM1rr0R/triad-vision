import fsp from 'node:fs/promises';
import { Router, type Request, type RequestHandler } from 'express';
import { forbidden, limiter, notFound, parse } from '../lib/http.js';
import { getApplicationPolicy } from '../lib/vacancyPlaces/policy.js'; // "apply via Triad Vision" on/off
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
import { germanyJobAlertsRouter, savedGermanyJobsRouter } from './germanyJobAlerts.js';
import { attachLebenslaufCopy } from '../lib/germanyJobs/lebenslaufAttach.js';
import { processExternalApplication } from '../lib/germanyJobs/autoSend.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { prisma } from '../db.js';

/**
 * Almaniya iş bazası — mounted at /api/germany-jobs (public):
 *   GET  /config   { search: bool, sources: [{ id, name, url }] } — the enabled job sources (lib/germanyJobs/providers)
 *   GET  /search   ?q&where&radius&type=job|ausbildung&time=any|full|part&remote&visa&sort&page&lng → merged,
 *                  de-duplicated listings of the enabled providers with per-source attribution
 *                  (404 FEATURE_DISABLED when none is enabled; 30 per minute per IP; provider caches)
 *   POST /apply    multipart: listing + candidate fields + optional CV ("cv": PDF / DOC / DOCX) → Inquiry lead,
 *                  staff notice, confirmation e-mail. Honeypot `website`, consent required, 10 per hour per IP.
 *                  `forwardConsent` (DSGVO, logged as EXTERNAL_JOB_FORWARD) starts the automatic check and sending.
 *   /alerts/…      "notify me about new jobs like this" (routes/germanyJobAlerts.ts)
 *   /saved/…       saved listings of signed-in clients (snapshot only; routes/germanyJobAlerts.ts)
 * Third-party listings are never stored beyond the short search cache (lib/germanyJobs/adzuna.ts); saved jobs and
 * alert e-mails keep a small snapshot (title, company, place, link) only.
 */
export const germanyJobsRouter = Router();

germanyJobsRouter.use('/alerts', germanyJobAlertsRouter);
germanyJobsRouter.use('/saved', savedGermanyJobsRouter);

const searchLimiter = limiter({ windowMs: 60 * 1000, limit: 30 });
const applyLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

germanyJobsRouter.get('/config', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  const sources = enabledProviders().map((p) => p.info);
  // `apply`: "apply via Triad Vision" for these listings (admin setting, default off: they are not our vacancies).
  res.json({ search: sources.length > 0, sources, apply: (await getApplicationPolicy()).allowExternalApplications });
});

/** Admin setting "Allow applications to external Germany job listings" (lib/vacancyPlaces/policy.ts), checked before the upload. */
const requireExternalApply: RequestHandler = async (_req, _res, next) => {
  if (!(await getApplicationPolicy()).allowExternalApplications) return next(forbidden('EXTERNAL_APPLICATIONS_DISABLED'));
  next();
};

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

germanyJobsRouter.post('/apply', applyLimiter, requireExternalApply, cvUpload.single('cv'), async (req, res) => {
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
    // Signed-in client without an upload: a copy of the newest saved Lebenslauf (built now when none is saved yet).
    if (!cv && account && body.attachLebenslauf) cv = await attachLebenslaufCopy(account.id);
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
    const forward = !!body.forwardConsent;
    if (forward) await recordConsent({ userId: account?.id ?? null, email: body.email, type: 'EXTERNAL_JOB_FORWARD', granted: true, source: 'EXTERNAL_JOB_APPLY', req });
    await sendApplicantConfirmation(body.email, body.name, job, lng, forward);
    await attachLeadContext(inquiry.id, { visitorId: body.visitorId });
    // Automatic check → Anschreiben → e-mail to the employer / staff queue (lib/germanyJobs/autoSend.ts; never throws).
    if (forward) {
      const row = await prisma.externalJobApplication.findUnique({ where: { inquiryId: inquiry.id }, select: { id: true } });
      if (row) await processExternalApplication(row.id);
    }
    res.status(201).json({ ok: true, id: inquiry.id });
  } catch (err) {
    await removeFile(file);
    throw err;
  }
});
