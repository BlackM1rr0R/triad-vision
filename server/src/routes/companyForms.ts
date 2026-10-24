import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { assertCompanyUser, companyFormDetail, employerPreview, listCompanyForms, submitEmployerForm } from '../lib/officialForms/employer.js';

/**
 * Employer portal: official forms to complete and sign — mounted at /api/company/forms (COMPANY role, own company).
 *
 *   GET  /                 forms sent to the company (open / signed)
 *   GET  /:id              worker, employer-side values, signing state
 *   POST /:id/preview      { values } → the PDF with these values (nothing stored)
 *   POST /:id/submit       { values } → corrections stored, PDF generated, signature request → { signerId }
 */
export const companyFormsRouter = Router();
companyFormsRouter.use(requireRole('COMPANY'));

companyFormsRouter.get('/', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  res.json(await listCompanyForms(u.companyId, u.id));
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
