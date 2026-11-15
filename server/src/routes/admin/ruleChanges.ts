import { Router } from 'express';
import { z } from 'zod';
import { VisaType } from '@prisma/client';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import {
  createRuleChange,
  deleteRuleChange,
  listRuleChanges,
  previewAudience,
  publishRuleChange,
  ruleChangeInput,
  updateRuleChange,
} from '../../lib/ruleChanges/service.js';

/**
 * Rule-change notices (lib/ruleChanges), mounted at /api/admin/rule-changes (admin router: STAFF+).
 *   GET    /                       drafts + history of sent changes
 *   GET    /preview?visaTypes=WORK,STUDY   { count, email } affected active clients
 *   POST   /                       new draft (STAFF+)
 *   PUT    /:id                    edit a draft (STAFF+)
 *   DELETE /:id                    delete a draft (STAFF+)
 *   POST   /:id/publish            notify the affected clients (ADMIN+, once)
 */
export const adminRuleChangesRouter = Router();

adminRuleChangesRouter.get('/', async (_req, res) => {
  res.json({ items: await listRuleChanges() });
});

adminRuleChangesRouter.get('/preview', async (req, res) => {
  const { visaTypes } = parse(
    z.object({
      visaTypes: z
        .string()
        .max(200)
        .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
        .pipe(z.array(z.nativeEnum(VisaType)).min(1)),
    }),
    req.query,
  );
  res.json(await previewAudience(visaTypes));
});

adminRuleChangesRouter.post('/', async (req, res) => {
  const body = parse(ruleChangeInput, req.body);
  const item = await createRuleChange(body, req.user!.id);
  await audit(req, 'RULE_CHANGE_CREATED', `rule-change:${item.id}`, { visaTypes: item.visaTypes });
  res.status(201).json({ item });
});

adminRuleChangesRouter.put('/:id', async (req, res) => {
  const body = parse(ruleChangeInput, req.body);
  const item = await updateRuleChange(String(req.params.id), body);
  await audit(req, 'RULE_CHANGE_UPDATED', `rule-change:${item.id}`, { visaTypes: item.visaTypes });
  res.json({ item });
});

adminRuleChangesRouter.delete('/:id', async (req, res) => {
  await deleteRuleChange(String(req.params.id));
  await audit(req, 'RULE_CHANGE_DELETED', `rule-change:${String(req.params.id)}`);
  res.status(204).end();
});

adminRuleChangesRouter.post('/:id/publish', requireMinRole('ADMIN'), async (req, res) => {
  const item = await publishRuleChange(String(req.params.id), req.user!.id);
  await audit(req, 'RULE_CHANGE_PUBLISHED', `rule-change:${item.id}`, { visaTypes: item.visaTypes, recipients: item.recipientCount, emailed: item.emailCount });
  res.json({ item });
});
