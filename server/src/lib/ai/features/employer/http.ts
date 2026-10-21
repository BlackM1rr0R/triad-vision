import type { Request, Response, Router } from 'express';
import type { AiScope } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../../audit.js';
import { limiter, parse } from '../../../http.js';
import { requestLocale, sendAiFailure } from '../../../aiWriting/common.js';
import { draftInput, draftVacancy, googleInput, improveForGoogle, textsInput, translateMissing } from './vacancy.js';

/**
 * The vacancy-writer endpoints, mounted for staff (/api/admin/ai/employer, ADMIN-scope cost) and for employers
 * (/api/company/ai, CLIENT-scope cost, only their own vacancies):
 *   POST /vacancy/draft      employer's notes (+ optional sector / city / type) → form values in 4 languages
 *   POST /vacancy/translate  fills the empty languages of title / description / requirements / benefits
 *   POST /vacancy/google     Google-Jobs checklist + AI rewrite suggestion of the description
 *   POST /vacancies/:id/ai-saved  audit entry after the form with AI text was saved
 * AI failures: 403 AI_DISABLED, 429 AI_LIMIT { reason, message }, 503 AI_UNAVAILABLE { reason }.
 */

export interface VacancyCtx {
  scope: AiScope;
  /** Throws (403 / 404) when the user may not use the tools / the vacancy. */
  guard: (req: Request, res: Response) => Promise<void>;
  company: (res: Response) => { id: string; name: string; sector: string | null; city: string | null } | null;
  ownVacancy: (req: Request, res: Response, id: string) => Promise<void>;
}

const aiLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30, keyGenerator: (req) => `aiemp:${(req as Request).user?.id ?? 'anon'}` });

export const mountVacancyRoutes = (router: Router, ctx: VacancyCtx) => {
  router.post('/vacancy/draft', aiLimiter, async (req, res) => {
    await ctx.guard(req, res);
    const body = parse(draftInput, req.body);
    const locale = requestLocale(req);
    const r = await draftVacancy(body, { userId: req.user!.id, scope: ctx.scope, locale, company: ctx.company(res) });
    if (!r.ok) return sendAiFailure(res, r.reason, locale);
    res.json({ draft: r.value, costUsd: r.costUsd, model: r.model });
  });

  router.post('/vacancy/translate', aiLimiter, async (req, res) => {
    await ctx.guard(req, res);
    const body = parse(textsInput, req.body);
    const r = await translateMissing(body, { userId: req.user!.id, scope: ctx.scope });
    if (!r.ok) return sendAiFailure(res, r.reason, requestLocale(req));
    res.json({ texts: r.value, filled: r.filled, costUsd: r.costUsd, model: r.model });
  });

  router.post('/vacancy/google', aiLimiter, async (req, res) => {
    await ctx.guard(req, res);
    const body = parse(googleInput, req.body);
    res.json(await improveForGoogle(body, { userId: req.user!.id, scope: ctx.scope }));
  });

  router.post('/vacancies/:id/ai-saved', async (req, res) => {
    const body = parse(z.object({ features: z.array(z.enum(['draft', 'translate', 'google'])).min(1).max(3) }).strict(), req.body);
    await ctx.ownVacancy(req, res, String(req.params.id));
    await audit(req, 'AI_EMPLOYER_VACANCY_SAVED', `vacancy:${req.params.id}`, { features: [...new Set(body.features)], by: ctx.scope === 'ADMIN' ? 'staff' : 'company' });
    res.json({ ok: true });
  });
};
