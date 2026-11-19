import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Vacancy } from '@prisma/client';
import { prisma } from '../../db.js';
import { conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { emitWebhook } from '../../lib/ops/webhooks.js';
import { onVacancyPublished } from '../../lib/jobAlerts/service.js';
import { hasMinRole } from '../../middleware/auth.js';
import { toggleRefusal, type ToggleError } from '../../lib/vacancyActive.js';

/**
 * Per-vacancy "Aktiv / Deaktiv" (lib/vacancyActive.ts) — mounted inside /api/admin/vacancies before /:id. Area
 * "employers", action edit (lib/access/routeMap.ts: POST = edit).
 *   POST /active        { ids: string[] (≤ 100), active }  bulk: { results: [{ id, ok, error? }], changed }
 *   POST /:id/active    { active }                         one: { vacancy } | 404 VACANCY_NOT_FOUND | 409 <ToggleError>
 * Activate = CLOSED → OPEN (first publication date kept; job alert digests + the waitlist are told, the existing
 * publish hook), deactivate = OPEN → CLOSED. Each change is audit-logged (VACANCY_ACTIVATED / VACANCY_DEACTIVATED).
 */
export const adminVacancyActiveRouter = Router();

type Outcome = { ok: true; vacancy: Vacancy } | { ok: false; error: ToggleError | 'VACANCY_NOT_FOUND' };

const toggleOne = async (req: Request, id: string, active: boolean, bulk: boolean): Promise<Outcome> => {
  const v = await prisma.vacancy.findUnique({ where: { id }, include: { company: { select: { status: true } } } });
  if (!v) return { ok: false, error: 'VACANCY_NOT_FOUND' };
  const refusal = toggleRefusal(v, active, { companyActive: v.company ? v.company.status === 'ACTIVE' : undefined, superAdmin: hasMinRole(req.user?.role, 'SUPER_ADMIN') });
  if (refusal) return { ok: false, error: refusal };
  // Conditional update: a concurrent toggle of the same vacancy changes it once.
  const from = v.status;
  const { count } = await prisma.vacancy.updateMany({
    where: { id: v.id, status: from },
    data: active ? { status: 'OPEN', publishedAt: v.publishedAt ?? new Date() } : { status: 'CLOSED' },
  });
  if (!count) return { ok: false, error: active ? 'ALREADY_ACTIVE' : 'ALREADY_INACTIVE' };
  const vacancy = await prisma.vacancy.findUniqueOrThrow({ where: { id: v.id } });
  await audit(req, active ? 'VACANCY_ACTIVATED' : 'VACANCY_DEACTIVATED', `vacancy:${v.id}`, { from, to: vacancy.status, ...(bulk ? { bulk: true } : {}) });
  if (active) await emitWebhook('vacancy.published', { id: vacancy.id, slug: vacancy.slug, publishedAt: vacancy.publishedAt?.toISOString() ?? null }, vacancy.companyId);
  return { ok: true, vacancy };
};

adminVacancyActiveRouter.post('/active', async (req, res) => {
  const body = parse(z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(100), active: z.boolean() }), req.body);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of [...new Set(body.ids)]) {
    const r = await toggleOne(req, id, body.active, true);
    results.push(r.ok ? { id, ok: true } : { id, ok: false, error: r.error });
  }
  const changed = results.filter((r) => r.ok).length;
  // Reactivated vacancies with free places: job alert digests + waitlist notices (background, coalesced).
  if (body.active && changed) onVacancyPublished();
  res.json({ results, changed });
});

adminVacancyActiveRouter.post('/:id/active', async (req, res) => {
  const body = parse(z.object({ active: z.boolean() }), req.body);
  const r = await toggleOne(req, String(req.params.id), body.active, false);
  if (!r.ok) throw r.error === 'VACANCY_NOT_FOUND' ? notFound(r.error) : conflict(r.error);
  if (body.active) onVacancyPublished();
  res.json({ vacancy: r.vacancy });
});
