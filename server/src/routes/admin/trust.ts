import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import { adminAvvList, sampleAvvPdf } from '../../lib/avv/service.js';
import { MEASURES } from '../../lib/trust/measures.js';
import { AVV_TEMPLATE_VERSION, avvApproved, getAvvSettings, getTrustSettings, saveTrustSettings, setAvvApproved } from '../../lib/trust/settings.js';
import { currentSubprocessors } from '../../lib/trust/subprocessors.js';

/**
 * Trust Center + AVV administration — mounted at /api/admin/trust (ADMIN+).
 *
 *   GET /                 settings, AVV approval state, measures with evidence, sub-processors, agreements
 *   PUT /settings         owner facts (data location, backup location, security contact, note)
 *   PUT /avv-approval     { approved } — "AVV template approved" (default OFF; companies see the AVV only when on)
 *   GET /avv-sample.pdf   the AVV with sample company data, for the legal review
 */
export const adminTrustRouter = Router();

adminTrustRouter.get('/', async (_req, res) => {
  const [trust, avv] = await Promise.all([getTrustSettings(), getAvvSettings()]);
  res.json({
    trust,
    avv: { ...avv, effective: avvApproved(avv), templateVersion: AVV_TEMPLATE_VERSION },
    measures: MEASURES,
    subprocessors: await currentSubprocessors(trust.dataLocation),
    agreements: await adminAvvList(),
  });
});

adminTrustRouter.put('/settings', async (req, res) => {
  const value = await saveTrustSettings(req.body ?? {});
  await audit(req, 'TRUST_SETTINGS_UPDATED', 'setting:trustCenter', { dataLocation: value.dataLocation, confirmed: value.dataLocationConfirmed });
  res.json({ trust: value });
});

adminTrustRouter.put('/avv-approval', async (req, res) => {
  const body = parse(z.object({ approved: z.boolean() }), req.body ?? {});
  const value = await setAvvApproved(body.approved, req.user!.id);
  await audit(req, body.approved ? 'AVV_TEMPLATE_APPROVED' : 'AVV_TEMPLATE_UNAPPROVED', 'setting:avvTemplate', { version: AVV_TEMPLATE_VERSION });
  res.json({ avv: { ...value, effective: avvApproved(value), templateVersion: AVV_TEMPLATE_VERSION } });
});

adminTrustRouter.get('/avv-sample.pdf', async (_req, res) => {
  const pdf = await sampleAvvPdf();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="avv-muster.pdf"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});
