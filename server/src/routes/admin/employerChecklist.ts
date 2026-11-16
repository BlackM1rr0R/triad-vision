import { Router } from 'express';
import { requireMinRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { staffChecklist } from '../../lib/employerArrival.js';
import { KEY_RE, loadTemplates, resetTemplate, saveTemplate, templateInput } from '../../lib/employerArrivalTemplates.js';

/**
 * Employer arrival checklist — staff side (/api/admin/employer-checklist; the admin router requires STAFF):
 *   GET    /templates            built-in + admin templates (STAFF read)
 *   PUT    /templates/:key       create / replace a template (override of a built-in or a new key)   ADMIN+
 *   DELETE /templates/:key       reset a built-in to its defaults (new keys: switch off instead)       ADMIN+
 *   GET    /case/:caseId         the employer's checklist of a case with progress (case page card), null without employer
 */
export const adminEmployerChecklistRouter = Router();

adminEmployerChecklistRouter.get('/templates', async (_req, res) => {
  res.json({ templates: await loadTemplates() });
});

const keyOf = (v: unknown) => String(v ?? '').toUpperCase().slice(0, 30);

adminEmployerChecklistRouter.put('/templates/:key', requireMinRole('ADMIN'), async (req, res) => {
  const key = keyOf(req.params.key);
  const body = parse(templateInput, req.body);
  await saveTemplate(key, body, req.user!.id);
  await audit(req, 'EMPLOYER_CHECKLIST_TEMPLATE_SAVED', `employer-checklist-template:${key}`, { active: body.active, anchor: body.anchor, offsetDays: body.offsetDays });
  res.json({ templates: await loadTemplates() });
});

adminEmployerChecklistRouter.delete('/templates/:key', requireMinRole('ADMIN'), async (req, res) => {
  const key = keyOf(req.params.key);
  if (!KEY_RE.test(key)) throw notFound('TEMPLATE_NOT_FOUND');
  await resetTemplate(key);
  await audit(req, 'EMPLOYER_CHECKLIST_TEMPLATE_RESET', `employer-checklist-template:${key}`);
  res.json({ templates: await loadTemplates() });
});

adminEmployerChecklistRouter.get('/case/:caseId', async (req, res) => {
  res.json({ checklist: await staffChecklist(String(req.params.caseId).slice(0, 40)) });
});
