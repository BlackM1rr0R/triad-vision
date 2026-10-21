import { Router } from 'express';
import { z } from 'zod';
import type { Locale, ManagementReport } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { asLocale } from '../../lib/aiStaff/texts.js';
import { addNarrativeLocale, generateReport, sendReportTo, type Narrative } from '../../lib/aiMgmt/report.js';
import type { ReportData } from '../../lib/aiMgmt/reportData.js';
import { getReportSettings, getSecuritySettings, reportSettingsUpdate, saveReportSettings, saveSecuritySettings, securitySettingsUpdate } from '../../lib/aiMgmt/settings.js';
import { explainAlert, presentAlert, recordAlertAction, runSecurityScan } from '../../lib/aiMgmt/security/alerts.js';

/**
 * AI for management and security — mounted at /api/admin/mgmt, SUPER_ADMIN only (2FA enforced by the admin router).
 *
 *   GET  /reports                       stored weekly reports (newest first) + report settings
 *   GET  /reports/:id                   one report: numbers + narrative in the viewer's language
 *   POST /reports/generate              "Generate now": last full week, numbers + one AI call (viewer's language)
 *   POST /reports/:id/narrative         write the narrative in the viewer's language (one AI call)
 *   POST /reports/:id/email             e-mail this report to the caller
 *   GET/PUT /reports-settings           enabled, includeAdmins, stuckDays
 *
 *   GET  /security/summary              open alert counts (dashboard widget)
 *   GET  /security/alerts               list (?status=OPEN|ACKNOWLEDGED|FALSE_POSITIVE|all)
 *   POST /security/alerts/:id/ack       acknowledge
 *   POST /security/alerts/:id/false-positive   resolve; the same pattern stays silent for 7 days
 *   POST /security/alerts/:id/actions   record an action done with the existing endpoints (revoke sessions,
 *                                       disable user, reset 2FA) — the page calls those first
 *   POST /security/alerts/:id/explain   (re)write the AI explanation in the viewer's language
 *   POST /security/scan                 run all rules now
 *   GET/PUT /security/settings          rule toggles, severities and thresholds
 */
export const adminMgmtRouter = Router();
adminMgmtRouter.use(requireRole('SUPER_ADMIN'));

const localeOf = (req: { query: Record<string, unknown>; user?: { locale: string } }) => asLocale(typeof req.query.locale === 'string' ? req.query.locale : req.user?.locale);
const idParam = (v: unknown) => parse(z.string().min(1).max(64), v);

// ─── Weekly reports ───────────────────────────────────────────────────────

const presentReport = (r: ManagementReport, locale: Locale) => {
  const narrative = (r.narrative as Narrative | null) ?? null;
  return {
    id: r.id,
    weekStart: r.weekStart,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    sentTo: r.sentTo,
    model: r.model,
    costUsd: r.costMicros / 1e6,
    data: r.data as unknown as ReportData,
    narrative: narrative?.[locale] ?? null,
    narrativeLocales: narrative ? Object.keys(narrative) : [],
  };
};

adminMgmtRouter.get('/reports', async (req, res) => {
  const locale = localeOf(req);
  const [rows, settings] = await Promise.all([prisma.managementReport.findMany({ orderBy: { weekStart: 'desc' }, take: 104 }), getReportSettings()]);
  res.json({
    settings,
    items: rows.map((r) => {
      const d = r.data as unknown as ReportData;
      const n = (r.narrative as Narrative | null)?.[locale] ?? null;
      return {
        id: r.id,
        weekStart: r.weekStart,
        weekEnd: d.weekEnd,
        createdAt: r.createdAt,
        sentTo: r.sentTo,
        hasNarrative: !!r.narrative,
        headline: n?.headline ?? null,
        key: { inquiries: d.metrics.inquiries, casesCreated: d.metrics.casesCreated, approvals: d.metrics.approvals, stuck: d.stuck.count, overdueTasks: d.overdueTasks.total },
      };
    }),
  });
});

adminMgmtRouter.get('/reports/:id', async (req, res) => {
  const r = await prisma.managementReport.findUnique({ where: { id: idParam(req.params.id) } });
  if (!r) throw notFound('REPORT_NOT_FOUND');
  res.json({ report: presentReport(r, localeOf(req)) });
});

adminMgmtRouter.post('/reports/generate', async (req, res) => {
  const locale = localeOf(req);
  const { report, aiReason } = await generateReport({ locales: [locale], userId: req.user!.id });
  res.json({ report: presentReport(report, locale), reason: aiReason });
});

adminMgmtRouter.post('/reports/:id/narrative', async (req, res) => {
  const locale = localeOf(req);
  const r = await prisma.managementReport.findUnique({ where: { id: idParam(req.params.id) } });
  if (!r) throw notFound('REPORT_NOT_FOUND');
  const { report, reason } = await addNarrativeLocale(r, locale, req.user!.id);
  res.json({ report: presentReport(report, locale), reason });
});

adminMgmtRouter.post('/reports/:id/email', async (req, res) => {
  const r = await prisma.managementReport.findUnique({ where: { id: idParam(req.params.id) } });
  if (!r) throw notFound('REPORT_NOT_FOUND');
  const u = req.user!;
  await sendReportTo(r, { id: u.id, email: u.email, locale: localeOf(req), role: u.role });
  res.json({ ok: true, to: u.email });
});

adminMgmtRouter.get('/reports-settings', async (_req, res) => {
  res.json({ settings: await getReportSettings() });
});

adminMgmtRouter.put('/reports-settings', async (req, res) => {
  res.json({ settings: await saveReportSettings(parse(reportSettingsUpdate, req.body ?? {})) });
});

// ─── Security alerts ──────────────────────────────────────────────────────

const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'FALSE_POSITIVE'] as const;

adminMgmtRouter.get('/security/summary', async (_req, res) => {
  const [open, high, latest] = await Promise.all([
    prisma.securityAlert.count({ where: { status: 'OPEN' } }),
    prisma.securityAlert.count({ where: { status: 'OPEN', severity: 'HIGH' } }),
    prisma.securityAlert.findFirst({ where: { status: 'OPEN' }, orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }),
  ]);
  res.json({ open, high, latestAt: latest?.lastSeenAt ?? null });
});

adminMgmtRouter.get('/security/alerts', async (req, res) => {
  const q = parse(z.object({ status: z.enum([...STATUSES, 'all']).optional(), severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(), locale: z.string().optional() }), req.query);
  const locale = localeOf(req);
  const status = q.status ?? 'OPEN';
  const rows = await prisma.securityAlert.findMany({
    where: { ...(status === 'all' ? {} : { status }), ...(q.severity ? { severity: q.severity } : {}) },
    orderBy: [{ lastSeenAt: 'desc' }],
    take: 200,
  });
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const [users, sessions, counts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, totpEnabledAt: true } }),
    prisma.session.groupBy({ by: ['userId'], where: { userId: { in: userIds }, revokedAt: null, expiresAt: { gt: new Date() } }, _count: { _all: true } }),
    prisma.securityAlert.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const live = new Map(sessions.map((s) => [s.userId, s._count._all]));
  res.json({
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    items: rows.map((r) => {
      const u = r.userId ? byId.get(r.userId) : undefined;
      return {
        ...presentAlert(r, locale),
        subject: u
          ? { id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, role: u.role, isActive: u.isActive, twoFactor: !!u.totpEnabledAt, activeSessions: live.get(u.id) ?? 0 }
          : null,
      };
    }),
  });
});

const loadAlert = async (id: unknown) => {
  const a = await prisma.securityAlert.findUnique({ where: { id: idParam(id) } });
  if (!a) throw notFound('ALERT_NOT_FOUND');
  return a;
};

adminMgmtRouter.post('/security/alerts/:id/ack', async (req, res) => {
  const a = await recordAlertAction(await loadAlert(req.params.id), 'ACKNOWLEDGED', req.user!.id);
  res.json({ alert: presentAlert(a, localeOf(req)) });
});

adminMgmtRouter.post('/security/alerts/:id/false-positive', async (req, res) => {
  const a = await recordAlertAction(await loadAlert(req.params.id), 'FALSE_POSITIVE', req.user!.id);
  res.json({ alert: presentAlert(a, localeOf(req)) });
});

adminMgmtRouter.post('/security/alerts/:id/actions', async (req, res) => {
  const { action } = parse(z.object({ action: z.enum(['REVOKE_SESSIONS', 'DISABLE_USER', 'RESET_2FA']) }), req.body ?? {});
  const a = await recordAlertAction(await loadAlert(req.params.id), action, req.user!.id);
  res.json({ alert: presentAlert(a, localeOf(req)) });
});

adminMgmtRouter.post('/security/alerts/:id/explain', async (req, res) => {
  const locale = localeOf(req);
  const a = await loadAlert(req.params.id);
  const updated = await explainAlert(a, { locales: [locale] });
  res.json({ alert: presentAlert(updated ?? a, locale), reason: updated ? null : 'UNAVAILABLE' });
});

adminMgmtRouter.post('/security/scan', async (_req, res) => {
  res.json(await runSecurityScan());
});

adminMgmtRouter.get('/security/settings', async (_req, res) => {
  res.json({ settings: await getSecuritySettings() });
});

adminMgmtRouter.put('/security/settings', async (req, res) => {
  res.json({ settings: await saveSecuritySettings(parse(securitySettingsUpdate, req.body ?? {})) });
});
