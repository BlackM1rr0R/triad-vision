import fs from 'node:fs/promises';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { sendPdf } from '../lib/esign/http.js';
import { storedPath } from '../lib/esign/service.js';
import { isOptedOut, reportFileName, reportView, setOptOut } from '../lib/employerReports/service.js';

/**
 * Monthly employer reports in the company portal — mounted at /api/company/reports (COMPANY role):
 *
 *   GET /               past reports of the own company (newest first)
 *   GET /:id/pdf        download (another company's report answers 404)
 *   GET /preferences    { monthlyEmail } of the signed-in portal user
 *   PUT /preferences    { monthlyEmail: boolean } — opt out of / back into the monthly e-mail
 */
export const companyReportsRouter = Router();
companyReportsRouter.use(requireRole('COMPANY'));
companyReportsRouter.use(async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: { select: { id: true, status: true } } } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  res.locals.companyId = u.company.id;
  next();
});

const companyId = (res: { locals: Record<string, unknown> }) => res.locals.companyId as string;

companyReportsRouter.get('/', async (_req, res) => {
  const rows = await prisma.employerReport.findMany({ where: { companyId: companyId(res) }, orderBy: { month: 'desc' }, take: 36 });
  res.json({ items: rows.map(reportView) });
});

companyReportsRouter.get('/preferences', async (req, res) => {
  res.json({ monthlyEmail: !(await isOptedOut(req.user!.id)) });
});

companyReportsRouter.put('/preferences', async (req, res) => {
  const body = parse(z.object({ monthlyEmail: z.boolean() }), req.body);
  await setOptOut(req.user!.id, !body.monthlyEmail);
  await audit(req, 'EMPLOYER_REPORT_PREFERENCE', `company:${companyId(res)}`, { monthlyEmail: body.monthlyEmail });
  res.json({ monthlyEmail: body.monthlyEmail });
});

companyReportsRouter.get('/:id/pdf', async (req, res) => {
  const r = await prisma.employerReport.findUnique({ where: { id: String(req.params.id) } });
  if (!r || r.companyId !== companyId(res) || !r.fileKey) throw notFound('REPORT_NOT_FOUND');
  try {
    await fs.access(storedPath(r.fileKey));
  } catch {
    throw notFound('REPORT_NOT_FOUND');
  }
  sendPdf(res, r.fileKey, reportFileName(r), req.query.inline !== '1');
});
