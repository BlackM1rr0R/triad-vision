import { Router } from 'express';
import { z } from 'zod';
import { gone, limiter, notFound, parse } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';
import { searchQuery } from '../lib/germanyJobs/common.js';
import { enabledProviders, searchGermanyJobs } from '../lib/germanyJobs/providers.js';
import { germanyJobAlertsRouter, savedGermanyJobsRouter } from './germanyJobAlerts.js';
import { coverLetterPdf, draftCoverLetter } from '../lib/coverLetters/index.js';
import { attachmentHeader } from '../lib/cv/pdf.js';
import { prisma } from '../db.js';

/**
 * Almaniya iş bazası — mounted at /api/germany-jobs (public):
 *   GET  /config   { search: bool, sources: [{ id, name, url }], apply: false } — the enabled job sources (lib/germanyJobs/providers)
 *   GET  /search   ?q&where&radius&type=job|ausbildung&time=any|full|part&remote&visa&sort&page&lng → merged,
 *                  de-duplicated listings of the enabled providers with per-source attribution
 *                  (404 FEATURE_DISABLED when none is enabled; 30 per minute per IP; provider caches)
 *   POST /apply    retired (owner decision): 410 EXTERNAL_APPLY_DIRECT — the candidate applies to the employer
 *                  directly with their own CV; Triad Vision is not an intermediary for these listings. Existing
 *                  applications stay readable (routes/externalApplications.ts, admin inquiries).
 *   POST /cover-letter.pdf  signed-in clients: { title?, company?, location?, type? } → generic Anschreiben PDF for
 *                  that listing from the template engine (lib/coverLetters; nothing is stored), for the candidate's own
 *                  application
 *   /alerts/…      "notify me about new jobs like this" (routes/germanyJobAlerts.ts)
 *   /saved/…       saved listings of signed-in clients (snapshot only; routes/germanyJobAlerts.ts)
 * Third-party listings are never stored beyond the short search cache (lib/germanyJobs/adzuna.ts); saved jobs and
 * alert e-mails keep a small snapshot (title, company, place, link) only.
 */
export const germanyJobsRouter = Router();

germanyJobsRouter.use('/alerts', germanyJobAlertsRouter);
germanyJobsRouter.use('/saved', savedGermanyJobsRouter);

const searchLimiter = limiter({ windowMs: 60 * 1000, limit: 30 });

germanyJobsRouter.get('/config', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  const sources = enabledProviders().map((p) => p.info);
  // `apply`: always false — "apply via Triad Vision" for external listings is retired (the candidate applies directly).
  res.json({ search: sources.length > 0, sources, apply: false });
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

/** Retired: applications to external listings go from the candidate to the employer directly (owner decision). */
germanyJobsRouter.post('/apply', () => {
  throw gone('EXTERNAL_APPLY_DIRECT');
});

const letterLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30 });
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const letterInput = z
  .object({ title: opt(300), company: opt(200), location: opt(200), type: z.enum(['job', 'ausbildung']).optional().catch(undefined) })
  .strict();

/** Generic Anschreiben for one listing (template engine, the client's profile + CV): download only, nothing stored. */
germanyJobsRouter.post('/cover-letter.pdf', requireRole('CLIENT'), letterLimiter, async (req, res) => {
  const body = parse(letterInput, req.body ?? {});
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } });
  const app = {
    userId: user.id,
    listingTitle: body.title,
    listingCompany: body.company,
    listingLocation: body.location,
    jobType: body.type ?? null,
    profession: null,
    experienceYears: null,
    germanLevel: null,
    inquiry: { contactName: `${user.firstName} ${user.lastName}`.trim(), email: user.email, phone: user.phone },
  };
  const draft = await draftCoverLetter(app);
  const out = await coverLetterPdf(app, { subject: draft.subject, body: draft.body });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename, false));
  res.send(out.pdf);
});
