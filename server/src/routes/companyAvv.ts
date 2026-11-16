import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { sendPdf } from '../lib/esign/http.js';
import { assertCompanyUser } from '../lib/officialForms/employer.js';
import { assertAvvAvailable, companyAvvFile, companyAvvOverview, parseAvvData, renderAvvPdf, signAvv } from '../lib/avv/service.js';

/**
 * Employer portal: AVV (Auftragsverarbeitungsvertrag, Art. 28 DSGVO) — mounted at /api/company/avv (COMPANY role,
 * own company only). Everything answers 404 AVV_NOT_AVAILABLE until the owner approved the template.
 *
 *   GET  /            template version, prefill (company profile), current agreement + history
 *   POST /preview     { data } → contract PDF (nothing stored)
 *   POST /sign        { data } → stored, e-signature request company → Triad Vision → { signerId }
 *   GET  /:id/file    the signed PDF of a completed agreement
 */
export const companyAvvRouter = Router();
companyAvvRouter.use(requireRole('COMPANY'));

companyAvvRouter.get('/', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  res.json(await companyAvvOverview(u.companyId, u));
});

companyAvvRouter.post('/preview', async (req, res) => {
  await assertCompanyUser(req.user!.id);
  await assertAvvAvailable();
  const pdf = await renderAvvPdf(parseAvvData((req.body ?? {}).data));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="avv-vorschau.pdf"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

companyAvvRouter.post('/sign', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  const out = await signAvv(u.companyId, u, (req.body ?? {}).data);
  await audit(req, 'AVV_SIGN_STARTED', `company:${u.companyId}`, { agreementId: out.agreement.id });
  res.status(201).json(out);
});

companyAvvRouter.get('/:id/file', async (req, res) => {
  const u = await assertCompanyUser(req.user!.id);
  const key = await companyAvvFile(u.companyId, String(req.params.id));
  sendPdf(res, key, 'auftragsverarbeitungsvertrag.pdf', req.query.download === '1');
});
