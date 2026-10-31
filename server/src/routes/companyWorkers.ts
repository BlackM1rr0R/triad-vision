import fs from 'node:fs/promises';
import { Router } from 'express';
import type { Company } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { STEP_COUNT, workersXlsx } from '../lib/requests/workers.js';
import { buildPanel, employerDocumentFile, panelSummary, workerDetail } from '../lib/employerWorkers/panel.js';
import { workersCsv } from '../lib/employerWorkers/csv.js';
import { pickLoc } from '../lib/employerWorkers/texts.js';
import { sendPdf } from '../lib/esign/http.js';
import { storedPath } from '../lib/esign/service.js';
import { addItem, companyChecklist, companyOverview, createInput, deleteItem, patchInput, updateItem } from '../lib/employerArrival.js';

/**
 * "My workers" (Mitarbeiter) — mounted at /api/company/workers, before the main company router, so the
 * company guards are applied here (COMPANY role; a suspended company sees nothing).
 *
 *   GET /                       panel rows + summary tiles (own company's cases only)
 *   GET /export.xlsx|csv        the panel as a sheet (?lang=de|en|az|ru)
 *   GET /:caseId                worker drawer: timeline, upcoming dates, documents, check-in history, contact
 *   GET /:caseId/documents/:kind/:id   download of an employer-visible PDF (kind = signature | form)
 *   GET /checklists/overview   arrival checklist progress of every approved / arrived worker (lib/employerArrival)
 *   GET|POST /:caseId/checklist, PATCH|DELETE /:caseId/checklist/:itemId   the company's arrival checklist of one worker
 *
 * Every lookup is scoped by Case.companyId: another company's worker answers 404 exactly like a missing one.
 */
export const companyWorkersRouter = Router();
companyWorkersRouter.use(requireRole('COMPANY'));
companyWorkersRouter.use(async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: true } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  res.locals.company = u.company;
  next();
});

const co = (res: { locals: Record<string, unknown> }) => res.locals.company as Company;
const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const langOf = (req: { query: Record<string, unknown>; get: (h: string) => string | undefined }) => pickLoc(req.query.lang) ?? pickLoc(req.get('X-Locale')) ?? 'de';

companyWorkersRouter.get('/', async (_req, res) => {
  const now = new Date();
  const items = await buildPanel(co(res).id, now);
  res.json({ stepCount: STEP_COUNT, summary: panelSummary(items, now), items });
});

/** The worker panel as an Excel sheet (stage fields of the earlier panel). */
companyWorkersRouter.get('/export.xlsx', async (req, res) => {
  const buf = workersXlsx(await buildPanel(co(res).id), langOf(req));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="workers-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

/** The full panel (phase, dates, check-ins, risk, open items, next action) as CSV. */
companyWorkersRouter.get('/export.csv', async (req, res) => {
  const csv = workersCsv(await buildPanel(co(res).id), langOf(req));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="workers-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

/** Arrival checklists: progress of every worker whose visa was approved (travelling or arrived). */
companyWorkersRouter.get('/checklists/overview', async (_req, res) => {
  res.json({ items: await companyOverview(co(res).id) });
});

const caseIdOf = (req: { params: Record<string, string> }) => {
  const caseId = String(req.params.caseId);
  if (!ID_RE.test(caseId)) throw notFound('WORKER_NOT_FOUND');
  return caseId;
};

companyWorkersRouter.get('/:caseId/checklist', async (req, res) => {
  res.json(await companyChecklist(co(res).id, caseIdOf(req)));
});

companyWorkersRouter.post('/:caseId/checklist', async (req, res) => {
  const body = parse(createInput, req.body);
  res.status(201).json({ item: await addItem(req, co(res).id, caseIdOf(req), body) });
});

companyWorkersRouter.patch('/:caseId/checklist/:itemId', async (req, res) => {
  const body = parse(patchInput, req.body);
  res.json({ item: await updateItem(req, co(res).id, caseIdOf(req), String(req.params.itemId).slice(0, 40), body) });
});

companyWorkersRouter.delete('/:caseId/checklist/:itemId', async (req, res) => {
  await deleteItem(req, co(res).id, caseIdOf(req), String(req.params.itemId).slice(0, 40));
  res.json({ ok: true });
});

companyWorkersRouter.get('/:caseId', async (req, res) => {
  const caseId = String(req.params.caseId);
  if (!ID_RE.test(caseId)) throw notFound('WORKER_NOT_FOUND');
  const detail = await workerDetail(co(res).id, caseId);
  if (!detail) throw notFound('WORKER_NOT_FOUND');
  res.json(detail);
});

companyWorkersRouter.get('/:caseId/documents/:kind/:id', async (req, res) => {
  const { caseId, kind, id } = req.params as Record<string, string>;
  if (kind !== 'signature' && kind !== 'form') throw badRequest('INVALID_KIND');
  if (!ID_RE.test(caseId) || !ID_RE.test(id)) throw notFound('DOCUMENT_NOT_FOUND');
  const file = await employerDocumentFile(co(res).id, caseId, kind, id);
  if (!file) throw notFound('DOCUMENT_NOT_FOUND');
  try {
    await fs.access(storedPath(file.key));
  } catch {
    throw notFound('DOCUMENT_NOT_FOUND');
  }
  await audit(req, 'EMPLOYER_DOCUMENT_DOWNLOADED', `case:${caseId}`, { kind, id });
  sendPdf(res, file.key, file.name, true);
});
