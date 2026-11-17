import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { requireManageAccess } from '../../lib/access/api.js';
import { auditCsv, auditRows, whoCanAccessCase, whoCanAccessClient } from '../../lib/accessAudit/whoCanSee.js';
import { completeReview, createQuarterlyReview, decideItem, listReviews, reviewDetail } from '../../lib/accessAudit/reviews.js';
import { anomalySettingsUpdate, getAnomalySettings, recentAnomalyAlerts, saveAnomalySettings, ANOMALY_RULES } from '../../lib/accessAudit/anomalies.js';
import { presentAlert } from '../../lib/aiMgmt/security/alerts.js';

/**
 * Access Center > Audit — mounted at /api/admin/access/audit (SUPER_ADMIN, or an ADMIN granted "manage access"):
 *
 *   GET  /users?kind=STAFF|PARTNER|COMPANY&search&elevated=1&inactive=1   who can see what (matrix, scope, masks, 2FA …)
 *   GET  /users.csv                                                       the same as CSV (audit ACCESS_AUDIT_EXPORTED)
 *   GET  /case-access/:caseId · GET /client-access/:clientId             reverse view: who can open this case / client
 *   GET  /reviews · GET /reviews/:id · POST /reviews (create the current quarter's review now)
 *   POST /reviews/items/:id { status: CONFIRMED | CHANGED, note? } · POST /reviews/:id/complete
 *   GET  /anomalies (settings + recent alerts) · PUT /anomalies/settings (thresholds)
 * Every change is audit-logged with before → after.
 */
export const adminAccessAuditRouter = Router();
adminAccessAuditRouter.use(requireManageAccess);

const listQuery = z.object({
  kind: z.enum(['STAFF', 'PARTNER', 'COMPANY']).optional(),
  search: z.string().trim().max(120).optional(),
  elevated: z.enum(['1', 'true']).optional(),
  inactive: z.enum(['1', 'true']).optional(),
});

const rowsFor = (q: z.infer<typeof listQuery>) => auditRows({ kind: q.kind, search: q.search || undefined, elevated: !!q.elevated, includeInactive: !!q.inactive });

adminAccessAuditRouter.get('/users', async (req, res) => {
  const rows = await rowsFor(parse(listQuery, req.query));
  res.json({ rows, generatedAt: new Date() });
});

adminAccessAuditRouter.get('/users.csv', async (req, res) => {
  const q = parse(listQuery, req.query);
  const rows = await rowsFor(q);
  await audit(req, 'ACCESS_AUDIT_EXPORTED', undefined, { rows: rows.length, kind: q.kind ?? null, elevated: !!q.elevated });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="access-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(auditCsv(rows));
});

adminAccessAuditRouter.get('/case-access/:caseId', async (req, res) => {
  const r = await whoCanAccessCase(String(req.params.caseId));
  if (!r) throw notFound('CASE_NOT_FOUND');
  res.json(r);
});

adminAccessAuditRouter.get('/client-access/:clientId', async (req, res) => {
  res.json({ cases: await whoCanAccessClient(String(req.params.clientId)) });
});

// ─── Access reviews ───────────────────────────────────────────────────────

adminAccessAuditRouter.get('/reviews', async (_req, res) => {
  res.json({ reviews: await listReviews() });
});

adminAccessAuditRouter.get('/reviews/:id', async (req, res) => {
  res.json({ review: await reviewDetail(String(req.params.id)) });
});

adminAccessAuditRouter.post('/reviews', async (req, res) => {
  const review = await createQuarterlyReview(new Date(), { force: true });
  if (review) await audit(req, 'ACCESS_REVIEW_CREATED', `accessReview:${review.id}`, { quarter: review.quarter });
  res.status(review ? 201 : 200).json({ review, created: !!review });
});

adminAccessAuditRouter.post('/reviews/items/:id', async (req, res) => {
  const body = parse(z.object({ status: z.enum(['CONFIRMED', 'CHANGED']), note: z.string().trim().max(500).optional() }), req.body);
  const r = await decideItem(String(req.params.id), body.status, req.user!.id, body.note);
  await audit(req, 'ACCESS_REVIEW_ITEM_DECIDED', `user:${r.item.userId}`, { itemId: r.item.id, reviewId: r.item.reviewId, before: r.before, after: body.status, note: body.note ?? null });
  res.json({ item: r.item });
});

adminAccessAuditRouter.post('/reviews/:id/complete', async (req, res) => {
  const r = await completeReview(String(req.params.id), req.user!.id);
  await audit(req, 'ACCESS_REVIEW_COMPLETED', `accessReview:${r.id}`, { quarter: r.quarter });
  res.json({ review: r });
});

// ─── Anomaly alerts ───────────────────────────────────────────────────────

adminAccessAuditRouter.get('/anomalies', async (req, res) => {
  const [settings, alerts] = await Promise.all([getAnomalySettings(), recentAnomalyAlerts()]);
  const locale = (['az', 'de', 'en', 'ru'] as const).find((l) => l === req.user!.locale) ?? 'az';
  res.json({ settings, rules: ANOMALY_RULES, alerts: alerts.map((a) => presentAlert(a, locale)) });
});

adminAccessAuditRouter.put('/anomalies/settings', async (req, res) => {
  const patch = parse(anomalySettingsUpdate, req.body);
  const { before, after } = await saveAnomalySettings(patch);
  await audit(req, 'ACCESS_ANOMALY_SETTINGS_CHANGED', 'access.anomalyRules', { before, after } as never);
  res.json({ settings: after });
});
