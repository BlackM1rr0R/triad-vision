import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notFound, parse } from '../http.js';
import { audit } from '../audit.js';
import { employerVisibleWhere } from '../vacancies.js';
import { CV_LANGS, CV_TEMPLATES } from './schema.js';
import { buildCvPdf } from './load.js';
import { attachmentHeader } from './pdf.js';

/** CV downloads for employers (anonymised) and staff (full) — the route files only wire these up. */

const query = z.object({ template: z.enum(CV_TEMPLATES).optional(), lang: z.enum(CV_LANGS).default('de'), inline: z.enum(['0', '1']).optional() });

const send = (res: Response, out: { pdf: Buffer; filename: string }, inline: boolean) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename, inline));
  res.send(out.pdf);
};

/**
 * GET /api/company/candidates/:applicationId/cv.pdf — only for an application presented to this company
 * (same visibility rule as the candidate list) and only when the candidate shares the CV with employers.
 */
export const sendEmployerCv = async (req: Request, res: Response, companyId: string) => {
  const q = parse(query, req.query);
  const app = await prisma.vacancyApplication.findFirst({
    where: { id: String(req.params.applicationId), vacancy: { companyId }, AND: [employerVisibleWhere] },
    select: { id: true, userId: true },
  });
  if (!app) throw notFound('APPLICATION_NOT_FOUND');
  const cv = await prisma.candidateCv.findUnique({ where: { userId: app.userId }, select: { shareWithEmployers: true } });
  // No CV row yet means the default (sharing on): the PDF is then built from the profile.
  if (cv && !cv.shareWithEmployers) throw notFound('CV_NOT_SHARED');
  const out = await buildCvPdf(app.userId, { template: q.template, lang: q.lang, anonymised: true });
  if (!out) throw notFound('APPLICATION_NOT_FOUND');
  await audit(req, 'CV_DOWNLOADED_BY_EMPLOYER', `application:${app.id}`, { companyId });
  send(res, out, q.inline === '1');
};

/** GET /api/admin/candidates/:userId/cv.pdf — full CV (with photo) for staff. */
export const sendStaffCv = async (req: Request, res: Response) => {
  const q = parse(query.extend({ photo: z.enum(['0', '1']).default('1') }), req.query);
  const user = await prisma.user.findUnique({ where: { id: String(req.params.userId) }, select: { id: true, role: true } });
  if (!user || user.role !== 'CLIENT') throw notFound('CANDIDATE_NOT_FOUND');
  const out = await buildCvPdf(user.id, { template: q.template, lang: q.lang, photo: q.photo === '1' });
  if (!out) throw notFound('CANDIDATE_NOT_FOUND');
  await audit(req, 'CV_DOWNLOADED_BY_STAFF', `user:${user.id}`);
  send(res, out, q.inline === '1');
};
