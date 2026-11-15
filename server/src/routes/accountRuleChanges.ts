import { Router } from 'express';
import type { Locale } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { forbidden } from '../lib/http.js';
import { clientRuleChanges } from '../lib/ruleChanges/service.js';

/** Client portal "Qayda dəyişiklikləri": GET /api/account/rule-changes — published changes sent to this client (lib/ruleChanges). */
export const accountRuleChangesRouter = Router();
accountRuleChangesRouter.use(requireAuth);
accountRuleChangesRouter.use((req, _res, next) => next(req.user!.role === 'CLIENT' ? undefined : forbidden('CLIENTS_ONLY')));

accountRuleChangesRouter.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const l = req.user!.locale;
  const locale: Locale = l === 'de' || l === 'en' || l === 'ru' ? l : 'az';
  res.json({ items: await clientRuleChanges(req.user!.id, locale) });
});
