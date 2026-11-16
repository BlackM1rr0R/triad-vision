import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { z } from 'zod';
import { parse } from '../lib/http.js';
import { searchOccupations } from '../lib/jobFeeds/occupations.js';
import { assertCompanyUser, companyFormDetail, employerDataSheet, employerPreview, listCompanyForms, startEmployerForm, submitEmployerForm } from '../lib/officialForms/employer.js';

/**
 * Employer portal: official forms to complete and sign — mounted at /api/company/forms (COMPANY role, own company).
 *
 *   GET  /                 forms sent to the company (open / signed)
 *   GET  /:id              worker, employer-side values, signing state
 *   POST /:id/preview      { values } → the PDF with these values (nothing stored)
 *   POST /:id/submit       { values } → corrections stored, PDF generated, signature request → { signerId }
 *   POST /:id/datasheet    { values } → data sheet PDF in the official question order (no official PDF needed)
 *   POST /start            { caseId } → the employer starts the declaration for one of its workers
 *   GET  /kldb?q=          KldB 2010 suggestions (wizard step "Tätigkeit")
 */
export const companyFormsRouter = Router();
companyFormsRouter.use(requireRole('COMPANY'));

companyFormsRouter.get('/', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  res.json(await listCompanyForms(u.companyId, u.id));
});

companyFormsRouter.get('/kldb', async (req, res) => {
  await assertCompanyUser(req.user!.id);
  const q = String(req.query.q ?? '').slice(0, 80);
  res.json({ items: searchOccupations(q, 12).map((o) => ({ code: o.code, de: o.de, en: o.en, az: o.az, verify: !!o.verify })) });
});

companyFormsRouter.post('/start', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  const body = parse(z.object({ caseId: z.string().trim().min(1).max(40) }), req.body ?? {});
  const fill = await startEmployerForm(u.companyId, body.caseId, u.id);
  await audit(req, 'OFFICIAL_FORM_EMPLOYER_STARTED', `case:${body.caseId}`, { fillId: fill.id });
  res.status(201).json({ fill: { id: fill.id, status: fill.status } });
});

companyFormsRouter.post('/:id/datasheet', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  const out = await employerDataSheet(u.companyId, String(req.params.id), (req.body ?? {}).values);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${out.name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(out.pdf);
});

companyFormsRouter.get('/:id', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  res.json({ form: await companyFormDetail(u.companyId, String(req.params.id), u.id) });
});

companyFormsRouter.post('/:id/preview', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  const out = await employerPreview(u.companyId, String(req.params.id), (req.body ?? {}).values);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${out.name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(out.pdf);
});

companyFormsRouter.post('/:id/submit', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  const out = await submitEmployerForm(u.companyId, String(req.params.id), u, (req.body ?? {}).values);
  await audit(req, 'OFFICIAL_FORM_EMPLOYER_SUBMITTED', `officialFormFill:${req.params.id}`, { signatureRequestId: out.signatureRequestId, contractChanged: out.contractChanged });
  res.json(out);
});
