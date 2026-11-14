import fs from 'node:fs';
import { Router } from 'express';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { notFound } from '../../lib/http.js';
import { providerStatuses } from '../../lib/germanyJobs/providers.js';
import { cvPath } from '../../lib/germanyJobs/apply.js';

/**
 * Almaniya iş bazası, staff side — mounted at /api/admin/germany-jobs (STAFF+):
 *   GET /status                 each job source: configured / enabled, last fetch, last error (Admin → job channels)
 *   GET /applications/:id/cv    CV of an "apply via Triad Vision" lead (`id` = inquiry id), as a download
 */
export const adminGermanyJobsRouter = Router();

adminGermanyJobsRouter.get('/status', (_req, res) => {
  const providers = providerStatuses();
  res.json({ search: providers.some((p) => p.enabled), providers });
});

adminGermanyJobsRouter.get('/applications/:id/cv', async (req, res) => {
  const app = await prisma.externalJobApplication.findUnique({ where: { inquiryId: req.params.id } });
  if (!app?.cvStoredName) throw notFound('CV_NOT_FOUND');
  const file = cvPath(app.cvStoredName);
  if (!fs.existsSync(file)) throw notFound('FILE_NOT_FOUND');
  await audit(req, 'EXTERNAL_JOB_CV_DOWNLOADED', `inquiry:${app.inquiryId}`, {});
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file, app.cvOriginalName ?? 'cv', { headers: { 'Content-Type': app.cvMime ?? 'application/octet-stream' } });
});
