import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Prisma, ReportSchedule, SavedReport } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { DATASETS } from '../../lib/reports/datasets.js';
import { AGG_LABEL, datasetFor, describeDataset, planReport, reportConfigSchema, runReport, type ReportResult } from '../../lib/reports/engine.js';
import { EXPORT_FORMATS, MIME, buildExport, reportFilename, type ExportFormat } from '../../lib/reports/export.js';
import { maskerFor } from '../../lib/reports/mask.js';
import { DeliveryError, asIdList, deliverSchedule, nextOccurrence } from '../../lib/reports/schedule.js';
import { getReportSettings, isAllowedExternal, reportSettingsSchema, saveReportSettings } from '../../lib/reports/settings.js';
import { AGG_FNS, GRANULARITIES, MAX_ROWS, PREVIEW_ROWS, RELATIVE_RANGES, pickLang, type RunCtx } from '../../lib/reports/types.js';
import { getProfitSettings } from '../../lib/profitability/settings.js';

/**
 * Report builder "Hesabat qurucusu" — /api/admin/reports (ADMIN and above).
 *
 *   GET    /datasets                     curated datasets (columns, labels, operators) for this viewer
 *   GET    /users                        staff users (filter / recipient pickers)
 *   POST   /preview                      { dataset, config } → first 1 000 rows (or groups), totals
 *   POST   /export                       { dataset, config, format, name } → .xlsx / .csv / .pdf (≤ 50 000 rows)
 *   GET    /saved · POST /saved          own + shared reports · save { name, dataset, config, shared }
 *   GET    /saved/:id · PATCH · DELETE   (edit / delete: owner or SUPER_ADMIN)
 *   GET    /saved/:id/export?format=     export a saved report
 *   GET    /saved/:id/schedules · POST   schedules of a report · new schedule
 *   PATCH  /schedules/:id · DELETE       edit / pause / resume · delete (creator, report owner or SUPER_ADMIN)
 *   GET    /schedules/:id/deliveries     delivery log · POST /schedules/:id/send-now
 *   GET    /settings · PUT /settings     external e-mail allow-list (PUT: SUPER_ADMIN)
 *
 * Audit: REPORT_EXPORTED (every export), REPORT_SCHEDULED (schedule created / changed / deleted / sent now).
 */
export const adminReportsRouter = Router();
adminReportsRouter.use(requireMinRole('ADMIN'));

const langOf = (req: Request) => pickLang(req.get('x-locale') ?? req.user?.locale);

const ctxOf = async (req: Request): Promise<RunCtx> => ({ eurAzn: (await getProfitSettings()).eurAzn, userId: req.user!.id, role: req.user!.role, now: new Date() });

const runBody = z.object({ dataset: z.string().min(1).max(40), config: z.unknown().optional() });

/** JSON form of a result: the preview keeps the first PREVIEW_ROWS rows. */
const previewJson = (r: ReportResult) => ({ ...r, rows: r.rows.slice(0, PREVIEW_ROWS), previewRows: Math.min(r.rows.length, PREVIEW_ROWS) });

adminReportsRouter.get('/datasets', async (req, res) => {
  const masker = await maskerFor(req.user!);
  const visible = DATASETS.filter((d) => (d.available?.() ?? true) && hasMinRole(req.user!.role, d.minRole));
  res.json({
    datasets: visible.map((d) => describeDataset(d, masker)),
    relativeRanges: RELATIVE_RANGES,
    aggregations: AGG_FNS.map((fn) => ({ fn, label: AGG_LABEL[fn] })),
    granularities: GRANULARITIES,
    limits: { previewRows: PREVIEW_ROWS, exportRows: MAX_ROWS },
  });
});

adminReportsRouter.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  res.json({ users: users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, role: u.role })) });
});

adminReportsRouter.post('/preview', async (req, res) => {
  const body = parse(runBody, req.body);
  const def = datasetFor(body.dataset, req.user!.role);
  const r = await runReport(def, body.config, await ctxOf(req), await maskerFor(req.user!));
  res.json(previewJson(r));
});

const sendFile = (res: Response, buf: Buffer, format: ExportFormat, name: string) => {
  res.setHeader('Content-Type', MIME[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(name, format)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
};

const exportReport = async (req: Request, res: Response, input: { dataset: string; config: unknown; name: string; format: ExportFormat; reportId?: string }) => {
  const def = datasetFor(input.dataset, req.user!.role);
  const lang = langOf(req);
  const r = await runReport(def, input.config, await ctxOf(req), await maskerFor(req.user!));
  const meta = `${def.label[lang]} · ${r.grouped ? r.total : r.records}`;
  const buf = await buildExport(r, input.format, input.name || def.label[lang], lang, meta);
  await audit(req, 'REPORT_EXPORTED', input.reportId ?? `dataset:${def.key}`, {
    dataset: def.key,
    format: input.format,
    rows: r.records,
    grouped: r.grouped,
    truncated: r.truncated,
    masked: r.masked,
    columns: r.columns.map((c) => c.key),
  });
  sendFile(res, buf, input.format, input.name || def.label[lang]);
};

adminReportsRouter.post('/export', async (req, res) => {
  const body = parse(runBody.extend({ format: z.enum(EXPORT_FORMATS).default('xlsx'), name: z.string().trim().max(160).optional() }), req.body);
  await exportReport(req, res, { dataset: body.dataset, config: body.config, name: body.name ?? '', format: body.format });
});

// ─── Saved reports ──────────────────────────────────────────────────────

const visibleWhere = (req: Request): Prisma.SavedReportWhereInput =>
  req.user!.role === 'SUPER_ADMIN' ? {} : { OR: [{ ownerId: req.user!.id }, { shared: true }] };

const loadVisible = async (req: Request, id: string) => {
  const r = await prisma.savedReport.findFirst({ where: { AND: [{ id }, visibleWhere(req)] } });
  if (!r) throw notFound('REPORT_NOT_FOUND');
  // The dataset may have become unavailable for this role.
  datasetFor(r.dataset, req.user!.role);
  return r;
};

const canEdit = (req: Request, r: Pick<SavedReport, 'ownerId'>) => r.ownerId === req.user!.id || req.user!.role === 'SUPER_ADMIN';

const ownerNames = async (ids: (string | null)[]) => {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const users = list.length ? await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, firstName: true, lastName: true } }) : [];
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
};

const reportJson = (r: SavedReport & { _count?: { schedules: number } }, names: Map<string, string>, req: Request) => ({
  id: r.id,
  name: r.name,
  dataset: r.dataset,
  config: r.config,
  shared: r.shared,
  ownerId: r.ownerId,
  ownerName: r.ownerId ? (names.get(r.ownerId) ?? null) : null,
  canEdit: canEdit(req, r),
  schedules: r._count?.schedules ?? 0,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const saveBody = z.object({
  name: z.string().trim().min(1).max(160),
  dataset: z.string().min(1).max(40),
  config: z.unknown(),
  shared: z.boolean().default(false),
});

/** Validates the config against the dataset for this user and returns its normalized form. */
const checkedConfig = async (req: Request, dataset: string, config: unknown) => {
  const def = datasetFor(dataset, req.user!.role);
  planReport(def, config, await ctxOf(req), await maskerFor(req.user!));
  return reportConfigSchema.parse(config ?? {}) as Prisma.InputJsonValue;
};

adminReportsRouter.get('/saved', async (req, res) => {
  const rows = await prisma.savedReport.findMany({ where: visibleWhere(req), orderBy: [{ updatedAt: 'desc' }], include: { _count: { select: { schedules: true } } }, take: 500 });
  const allowed = rows.filter((r) => DATASETS.some((d) => d.key === r.dataset && hasMinRole(req.user!.role, d.minRole)));
  const names = await ownerNames(allowed.map((r) => r.ownerId));
  res.json({ reports: allowed.map((r) => reportJson(r, names, req)) });
});

adminReportsRouter.post('/saved', async (req, res) => {
  const body = parse(saveBody, req.body);
  const config = await checkedConfig(req, body.dataset, body.config);
  const r = await prisma.savedReport.create({ data: { name: body.name, dataset: body.dataset, config, shared: body.shared, ownerId: req.user!.id } });
  await audit(req, 'REPORT_SAVED', r.id, { dataset: r.dataset, shared: r.shared });
  res.status(201).json({ report: reportJson(r, await ownerNames([r.ownerId]), req) });
});

adminReportsRouter.get('/saved/:id', async (req, res) => {
  const r = await loadVisible(req, req.params.id);
  res.json({ report: reportJson(r, await ownerNames([r.ownerId]), req) });
});

adminReportsRouter.patch('/saved/:id', async (req, res) => {
  const r = await loadVisible(req, req.params.id);
  if (!canEdit(req, r)) throw forbidden('REPORT_NOT_OWNER');
  const body = parse(saveBody.partial(), req.body);
  const dataset = body.dataset ?? r.dataset;
  const data: Prisma.SavedReportUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.shared !== undefined) data.shared = body.shared;
  if (body.config !== undefined || body.dataset !== undefined) {
    data.dataset = dataset;
    data.config = await checkedConfig(req, dataset, body.config ?? r.config);
  }
  const updated = await prisma.savedReport.update({ where: { id: r.id }, data });
  res.json({ report: reportJson(updated, await ownerNames([updated.ownerId]), req) });
});

adminReportsRouter.delete('/saved/:id', async (req, res) => {
  const r = await loadVisible(req, req.params.id);
  if (!canEdit(req, r)) throw forbidden('REPORT_NOT_OWNER');
  await prisma.savedReport.delete({ where: { id: r.id } });
  await audit(req, 'REPORT_DELETED', r.id, { dataset: r.dataset });
  res.json({ ok: true });
});

adminReportsRouter.get('/saved/:id/export', async (req, res) => {
  const r = await loadVisible(req, req.params.id);
  const { format } = parse(z.object({ format: z.enum(EXPORT_FORMATS).default('xlsx') }), req.query);
  await exportReport(req, res, { dataset: r.dataset, config: r.config, name: r.name, format, reportId: r.id });
});

// ─── Schedules ──────────────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const scheduleBody = z
  .object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    weekday: z.coerce.number().int().min(1).max(7).nullable().optional(),
    monthDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    time: z.string().regex(HHMM).default('08:00'),
    recipientUserIds: z.array(z.string().min(1).max(40)).max(50).default([]),
    externalEmails: z.array(z.string().trim().toLowerCase().email().max(191)).max(20).default([]),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === 'WEEKLY' && !v.weekday) ctx.addIssue({ code: 'custom', path: ['weekday'], message: 'REQUIRED' });
    if (v.frequency === 'MONTHLY' && !v.monthDay) ctx.addIssue({ code: 'custom', path: ['monthDay'], message: 'REQUIRED' });
    if (!v.recipientUserIds.length && !v.externalEmails.length) ctx.addIssue({ code: 'custom', path: ['recipientUserIds'], message: 'NO_RECIPIENTS' });
  });

/** Recipients must be active staff allowed to see the dataset; external addresses must be on the allow-list. */
const checkRecipients = async (dataset: string, userIds: string[], emails: string[]) => {
  const def = DATASETS.find((d) => d.key === dataset);
  if (userIds.length) {
    const users = await prisma.user.findMany({ where: { id: { in: userIds }, isActive: true }, select: { id: true, role: true } });
    const ok = new Set(users.filter((u) => hasMinRole(u.role, def?.minRole ?? 'ADMIN')).map((u) => u.id));
    const badIds = userIds.filter((id) => !ok.has(id));
    if (badIds.length) throw badRequest('REPORT_RECIPIENT_NOT_ALLOWED', badIds.join(','));
  }
  if (emails.length) {
    const allow = (await getReportSettings()).externalAllowList;
    const denied = emails.filter((e) => !isAllowedExternal(e, allow));
    if (denied.length) throw badRequest('REPORT_EXTERNAL_NOT_ALLOWED', denied.join(','));
  }
};

const scheduleJson = (s: ReportSchedule & { deliveries?: { status: string; createdAt: Date; periodKey: string; error: string | null }[] }, now = new Date()) => ({
  id: s.id,
  reportId: s.reportId,
  frequency: s.frequency,
  weekday: s.weekday,
  monthDay: s.monthDay,
  time: s.time,
  recipientUserIds: asIdList(s.recipientUserIds),
  externalEmails: asIdList(s.externalEmails),
  active: s.active,
  createdById: s.createdById,
  lastRunAt: s.lastRunAt,
  lastPeriodKey: s.lastPeriodKey,
  nextRunAt: s.active ? nextOccurrence(s, now) : null,
  lastDelivery: s.deliveries?.[0] ?? null,
  createdAt: s.createdAt,
});

adminReportsRouter.get('/saved/:id/schedules', async (req, res) => {
  const r = await loadVisible(req, req.params.id);
  const list = await prisma.reportSchedule.findMany({
    where: { reportId: r.id },
    orderBy: { createdAt: 'asc' },
    include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, createdAt: true, periodKey: true, error: true } } },
  });
  res.json({ schedules: list.map((s) => scheduleJson(s)) });
});

adminReportsRouter.post('/saved/:id/schedules', async (req, res) => {
  const r = await loadVisible(req, req.params.id);
  const body = parse(scheduleBody, req.body);
  await checkRecipients(r.dataset, body.recipientUserIds, body.externalEmails);
  const s = await prisma.reportSchedule.create({
    data: {
      reportId: r.id,
      frequency: body.frequency,
      weekday: body.frequency === 'WEEKLY' ? body.weekday! : null,
      monthDay: body.frequency === 'MONTHLY' ? body.monthDay! : null,
      time: body.time,
      recipientUserIds: [...new Set(body.recipientUserIds)],
      externalEmails: [...new Set(body.externalEmails)],
      active: body.active,
      createdById: req.user!.id,
    },
  });
  await audit(req, 'REPORT_SCHEDULED', s.id, { action: 'create', reportId: r.id, frequency: s.frequency, time: s.time, staff: body.recipientUserIds.length, external: body.externalEmails });
  res.status(201).json({ schedule: scheduleJson(s) });
});

const loadSchedule = async (req: Request, id: string) => {
  const s = await prisma.reportSchedule.findUnique({ where: { id }, include: { report: true } });
  if (!s) throw notFound('SCHEDULE_NOT_FOUND');
  await loadVisible(req, s.reportId);
  const may = s.createdById === req.user!.id || s.report.ownerId === req.user!.id || req.user!.role === 'SUPER_ADMIN';
  return { s, may };
};

adminReportsRouter.patch('/schedules/:id', async (req, res) => {
  const { s, may } = await loadSchedule(req, req.params.id);
  if (!may) throw forbidden('SCHEDULE_NOT_OWNER');
  const merged = parse(scheduleBody, {
    frequency: s.frequency,
    weekday: s.weekday,
    monthDay: s.monthDay,
    time: s.time,
    recipientUserIds: asIdList(s.recipientUserIds),
    externalEmails: asIdList(s.externalEmails),
    active: s.active,
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
  });
  await checkRecipients(s.report.dataset, merged.recipientUserIds, merged.externalEmails);
  const updated = await prisma.reportSchedule.update({
    where: { id: s.id },
    data: {
      frequency: merged.frequency,
      weekday: merged.frequency === 'WEEKLY' ? merged.weekday! : null,
      monthDay: merged.frequency === 'MONTHLY' ? merged.monthDay! : null,
      time: merged.time,
      recipientUserIds: [...new Set(merged.recipientUserIds)],
      externalEmails: [...new Set(merged.externalEmails)],
      active: merged.active,
    },
  });
  await audit(req, 'REPORT_SCHEDULED', s.id, { action: s.active !== merged.active ? (merged.active ? 'resume' : 'pause') : 'update', reportId: s.reportId, external: merged.externalEmails });
  res.json({ schedule: scheduleJson(updated) });
});

adminReportsRouter.delete('/schedules/:id', async (req, res) => {
  const { s, may } = await loadSchedule(req, req.params.id);
  if (!may) throw forbidden('SCHEDULE_NOT_OWNER');
  await prisma.reportSchedule.delete({ where: { id: s.id } });
  await audit(req, 'REPORT_SCHEDULED', s.id, { action: 'delete', reportId: s.reportId });
  res.json({ ok: true });
});

adminReportsRouter.get('/schedules/:id/deliveries', async (req, res) => {
  const { s } = await loadSchedule(req, req.params.id);
  const deliveries = await prisma.reportDelivery.findMany({ where: { scheduleId: s.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ deliveries: deliveries.map((d) => ({ ...d, recipients: asIdList(d.recipients) })) });
});

/** Sends the report now (a manual delivery, logged like a scheduled one; the schedule's periods are unaffected). */
adminReportsRouter.post('/schedules/:id/send-now', async (req, res) => {
  const { s, may } = await loadSchedule(req, req.params.id);
  if (!may) throw forbidden('SCHEDULE_NOT_OWNER');
  const now = new Date();
  const d = await prisma.reportDelivery.create({ data: { scheduleId: s.id, periodKey: `M${now.getTime().toString(36)}`, status: 'PENDING' } });
  try {
    const { sent, rows } = await deliverSchedule(s, now);
    const done = await prisma.reportDelivery.update({ where: { id: d.id }, data: { status: 'SENT', rows, recipients: sent } });
    await audit(req, 'REPORT_SCHEDULED', s.id, { action: 'send-now', reportId: s.reportId, recipients: sent.length });
    res.json({ delivery: { ...done, recipients: sent } });
  } catch (err) {
    const code = err instanceof DeliveryError ? err.message : 'DELIVERY_FAILED';
    await prisma.reportDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', error: code } });
    if (!(err instanceof DeliveryError)) throw err;
    throw badRequest(code);
  }
});

// ─── Settings ───────────────────────────────────────────────────────────

adminReportsRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getReportSettings() });
});

adminReportsRouter.put('/settings', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(reportSettingsSchema, req.body);
  const settings = await saveReportSettings(body);
  await audit(req, 'REPORT_SETTINGS', 'reports', { externalAllowList: settings.externalAllowList });
  res.json({ settings });
});
