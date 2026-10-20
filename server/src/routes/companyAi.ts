import { Router, type RequestHandler, type Response } from 'express';
import type { Company } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, forbidden, notFound } from '../lib/http.js';
import { anonymisedName, employerVisibleWhere } from '../lib/vacancies.js';
import { limitMessage } from '../lib/ai/limits.js';
import { requestLocale } from '../lib/aiWriting/common.js';
import { employerAiStatus, getEmployerTools } from '../lib/ai/features/employer/common.js';
import { draftView } from '../lib/ai/features/employer/profile.js';
import { profilePdf } from '../lib/ai/features/employer/pdf.js';
import { mountVacancyRoutes } from '../lib/ai/features/employer/http.js';

/**
 * Employer-portal AI — mounted at /api/company/ai (COMPANY, own company only; CLIENT-scope AI cost):
 *   GET /status                       can the vacancy writer work (key, limits, staff toggle)
 *   GET /profiles                     candidate profiles staff shared for this company's visible applications
 *   GET /profiles/:applicationId/pdf  PDF of one shared profile
 *   + the vacancy writer (lib/ai/features/employer/http.ts)
 */
export const companyAiRouter = Router();

const loadCompany: RequestHandler = async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: true } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  res.locals.company = u.company;
  next();
};

companyAiRouter.use(requireRole('COMPANY'), loadCompany);

const co = (res: Response) => res.locals.company as Company;

companyAiRouter.get('/status', async (req, res) => {
  res.json(await employerAiStatus(req.user!.id, 'CLIENT', { company: true }));
});

const sharedWhere = (companyId: string) => ({
  sharedAt: { not: null },
  application: { vacancy: { companyId }, ...employerVisibleWhere },
});

companyAiRouter.get('/profiles', async (_req, res) => {
  const rows = await prisma.candidateProfileDraft.findMany({ where: sharedWhere(co(res).id), orderBy: { updatedAt: 'desc' }, take: 500 });
  res.json({
    items: rows.map((r) => {
      const v = draftView(r);
      return { applicationId: v.applicationId, language: v.language, content: v.content, updatedAt: v.updatedAt };
    }),
  });
});

companyAiRouter.get('/profiles/:applicationId/pdf', async (req, res) => {
  const row = await prisma.candidateProfileDraft.findFirst({
    where: { ...sharedWhere(co(res).id), applicationId: String(req.params.applicationId) },
    include: { user: { select: { firstName: true, lastName: true } }, application: { select: { vacancy: { select: { title: true } } } } },
  });
  const v = row ? draftView(row) : null;
  if (!row || !v?.content) throw notFound('PROFILE_NOT_FOUND');
  const title = row.application?.vacancy.title as Record<string, string> | undefined;
  const name = anonymisedName(row.user);
  const pdf = await profilePdf({ content: v.content, lang: v.language, name, position: title ? title[v.language] || title.de || null : null, date: row.updatedAt });
  const file = `Kandidatenprofil-${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/-+$/, '')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file)}`);
  res.send(pdf);
});

mountVacancyRoutes(companyAiRouter, {
  scope: 'CLIENT',
  guard: async (req) => {
    if (!(await getEmployerTools()).companyEnabled) throw new HttpError(403, 'AI_DISABLED', limitMessage('DISABLED', requestLocale(req)));
  },
  company: (res) => {
    const c = co(res);
    return { id: c.id, name: c.name, sector: c.sector, city: c.city };
  },
  ownVacancy: async (_req, res, id) => {
    const v = await prisma.vacancy.findUnique({ where: { id }, select: { companyId: true } });
    if (!v || v.companyId !== co(res).id) throw notFound('VACANCY_NOT_FOUND');
  },
});
