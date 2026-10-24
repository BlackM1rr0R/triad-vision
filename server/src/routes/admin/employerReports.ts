import fs from 'node:fs/promises';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { sendPdf } from '../../lib/esign/http.js';
import { storedPath } from '../../lib/esign/service.js';
import { MONTH_RE, previousMonth } from '../../lib/employerReports/stats.js';
import { generateReport, renderReport, reportFileName, reportRecipients, reportView, sendReport } from '../../lib/employerReports/service.js';

/**
 * Admin: monthly employer reports — mounted at /api/admin/employer-reports (staff; the company page panel).
 *
 *   GET  /?companyId=                        reports of a company + recipients of the e-mail + default month
 *   GET  /preview.pdf?companyId=&month=&lang= render without storing
 *   POST /generate { companyId, month, lang? }  create or regenerate (overwrites stats + file)
 *   POST /:id/send                            e-mail the stored report to the company's recipients
 *   GET  /:id/pdf                             the stored file
 */
export const adminEmployerReportsRouter = Router();

const month = z.string().regex(MONTH_RE);
const lang = z.enum(['de', 'en']).optional();

const company = async (id: string) => {
  const c = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!c) throw notFound('COMPANY_NOT_FOUND');
  return c;
};

adminEmployerReportsRouter.get('/', async (req, res) => {
  const q = parse(z.object({ companyId: z.string().min(1).max(40) }), req.query);
  await company(q.companyId);
  const [rows, recipients] = await Promise.all([
    prisma.employerReport.findMany({ where: { companyId: q.companyId }, orderBy: { month: 'desc' }, take: 36 }),
    reportRecipients(q.companyId),
  ]);
  res.json({ items: rows.map(reportView), recipients: recipients.map((r) => r.email), defaultMonth: previousMonth() });
});

adminEmployerReportsRouter.get('/preview.pdf', async (req, res) => {
  const q = parse(z.object({ companyId: z.string().min(1).max(40), month, lang }), req.query);
  const c = await company(q.companyId);
  const { pdf } = await renderReport(c.id, q.month, q.lang);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="preview-${q.month}.pdf"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

adminEmployerReportsRouter.post('/generate', async (req, res) => {
  const body = parse(z.object({ companyId: z.string().min(1).max(40), month, lang }), req.body);
  const c = await company(body.companyId);
  const { report } = await generateReport(c.id, body.month, { force: true, lang: body.lang });
  await audit(req, 'EMPLOYER_REPORT_GENERATED', `company:${c.id}`, { month: body.month });
  res.json({ report: reportView(report) });
});

adminEmployerReportsRouter.post('/:id/send', async (req, res) => {
  const r = await prisma.employerReport.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound('REPORT_NOT_FOUND');
  const sent = await sendReport(r);
  if (!sent) throw conflict('NO_RECIPIENTS');
  await audit(req, 'EMPLOYER_REPORT_SENT', `company:${r.companyId}`, { month: r.month, recipients: sent });
  const fresh = await prisma.employerReport.findUniqueOrThrow({ where: { id: r.id } });
  res.json({ report: reportView(fresh), recipients: sent });
});

adminEmployerReportsRouter.get('/:id/pdf', async (req, res) => {
  const r = await prisma.employerReport.findUnique({ where: { id: String(req.params.id) } });
  if (!r?.fileKey) throw notFound('REPORT_NOT_FOUND');
  try {
    await fs.access(storedPath(r.fileKey));
  } catch {
    throw notFound('REPORT_NOT_FOUND');
  }
  sendPdf(res, r.fileKey, reportFileName(r), req.query.download === '1');
});
