import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { getSettings, listBeneficiaries, loadRows, projectsList, saveSettings, syncCommission, totalsOf } from '../../lib/settlement/service.js';
import { STAGES, applyChanges, markPaid, nextSortOrder, recalculate, type Change } from '../../lib/settlement/save.js';
import { linkCase, suggestCases } from '../../lib/settlement/link.js';
import { importWorkbook } from '../../lib/settlement/import.js';
import { confirmImport, confirmSchema, listBatches, previewImport, templateCsv, templateXlsx, undoBatch } from '../../lib/settlement/rowImport.js';
import { buildSettlementXlsx } from '../../lib/settlement/export.js';
import { buildSummary } from '../../lib/settlement/summary.js';
import { parseAmount, splitName } from '../../lib/settlement/parse.js';

/**
 * Settlement ledger "Hesablaşmalar" (/api/admin/settlements; the admin router is already STAFF+ with 2FA).
 * STAFF+ read and edit rows; ADMIN+ manage beneficiaries / rules / rate, import, delete, rename projects.
 *
 *   GET    /                         rows (?project=&partnerId=&stage=&q=&month=&unpaid=1) + totals + beneficiaries
 *   POST   /                         new row
 *   PATCH  /                         { changes: [{ id, field, value }] } batch save → per-change results + fresh rows
 *   DELETE /bulk                     (ADMIN+) { ids }
 *   PUT    /order                    { ids } new order (sortOrder = index)
 *   POST   /move                     { ids, project }
 *   POST   /recalculate              { ids } drop manual values · POST /:id/recalculate
 *   POST   /paid                     { items: [{ id, beneficiaryId }], paid } · POST /:id/paid { beneficiaryId, paid }
 *                                    beneficiaryId: a beneficiary id, "_partner" (Sanani) or "*" (all shares of the row)
 *   GET    /projects                 distinct projects (sheets) · PATCH /projects (ADMIN+) { from, to } rename
 *   GET    /summary?month=YYYY-MM    report numbers
 *   GET    /export.xlsx?project=     workbook like the team's
 *   POST   /import?dryRun=1          (ADMIN+) multipart "file" (.xlsx) → preview / import report
 *   GET    /import/template.csv|xlsx (ADMIN+) row import template (columns documented in rowImportParse.ts)
 *   POST   /import/rows/preview      (ADMIN+) multipart "file" (.csv / .xlsx, template format) → per-row matches + warnings
 *   POST   /import/rows/confirm      (ADMIN+) { rows, partners, beneficiaryColumns } → one transaction, batch id
 *   GET    /import/batches           (ADMIN+) recent import batches · DELETE /import/batches/:id (ADMIN+) undo
 *   GET    /beneficiaries            beneficiaries + rate · POST / PATCH /:id / DELETE /:id (ADMIN+) · PUT /settings (ADMIN+)
 *   GET    /:id/suggestions          cases matching the client name · POST /:id/link { caseId | null }
 *   DELETE /:id                      (ADMIN+)
 */
export const adminSettlementsRouter = Router();

const adminOnly = requireMinRole('ADMIN');
const id = z.string().min(1).max(40);
const month = z.string().regex(/^\d{4}-\d{2}$/);

const listQuery = z.object({
  project: z.string().max(80).optional(),
  partnerId: z.string().max(40).optional(),
  stage: z.enum(STAGES as [string, ...string[]]).optional(),
  q: z.string().max(100).optional(),
  month: month.optional(),
  unpaid: z.enum(['1', 'true', '0', 'false']).optional(),
});

const partnersOptions = () => prisma.referralPartner.findMany({ select: { id: true, name: true, active: true }, orderBy: { name: 'asc' } });

adminSettlementsRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const { rows, beneficiaries, eurAzn } = await loadRows({
    project: q.project || undefined,
    partnerId: q.partnerId || undefined,
    stage: q.stage as never,
    q: q.q?.trim() || undefined,
    month: q.month,
    unpaid: q.unpaid === '1' || q.unpaid === 'true',
  });
  const [projects, partners] = await Promise.all([projectsList(), partnersOptions()]);
  res.json({
    rows,
    totals: totalsOf(rows, beneficiaries),
    beneficiaries,
    projects,
    partners,
    settings: { eurAzn },
    canManage: hasMinRole(req.user!.role, 'ADMIN'),
  });
});

const createSchema = z.object({
  project: z.string().trim().min(1).max(80).default('Ümumi'),
  clientName: z.string().trim().min(1).max(160),
  partnerId: id.nullish(),
  employer: z.string().trim().max(160).nullish(),
  amount: z.union([z.string().max(60), z.number()]).nullish(),
  currency: z.enum(['AZN', 'EUR']).optional(),
  partnerShareCents: z.number().int().min(0).max(1e10).nullish(),
  partnerShareCurrency: z.enum(['AZN', 'EUR']).optional(),
  caseId: id.nullish(),
  note: z.string().max(5000).nullish(),
  /** Insert right after this row (same project). */
  afterId: id.optional(),
});

adminSettlementsRouter.post('/', async (req, res) => {
  const b = parse(createSchema, req.body);
  if (b.partnerId && !(await prisma.referralPartner.findUnique({ where: { id: b.partnerId }, select: { id: true } }))) throw badRequest('PARTNER_NOT_FOUND');
  if (b.caseId && !(await prisma.case.findUnique({ where: { id: b.caseId }, select: { id: true } }))) throw badRequest('CASE_NOT_FOUND');
  const amount = b.amount == null ? null : typeof b.amount === 'number' ? { amountCents: Math.round(b.amount), currency: null } : parseAmount(b.amount);
  const sn = splitName(b.clientName);
  let sortOrder = await nextSortOrder(b.project);
  if (b.afterId) {
    const after = await prisma.settlementEntry.findUnique({ where: { id: b.afterId }, select: { project: true, sortOrder: true } });
    if (after && after.project === b.project) {
      await prisma.settlementEntry.updateMany({ where: { project: b.project, sortOrder: { gt: after.sortOrder } }, data: { sortOrder: { increment: 1 } } });
      sortOrder = after.sortOrder + 1;
    }
  }
  const created = await prisma.settlementEntry.create({
    data: {
      project: b.project,
      clientName: sn.name || b.clientName,
      licence: sn.licence,
      employer: b.employer ?? null,
      partnerId: b.partnerId ?? null,
      caseId: b.caseId ?? null,
      amountCents: amount?.amountCents ?? null,
      currency: b.currency ?? amount?.currency ?? 'AZN',
      payAfterVisa: !!(amount && 'payAfterVisa' in amount && amount.payAfterVisa),
      partnerShareCents: b.partnerShareCents ?? null,
      partnerShareCurrency: b.partnerShareCurrency ?? 'EUR',
      note: b.note ?? sn.note ?? null,
      sortOrder,
      createdById: req.user!.id,
    },
  });
  await syncCommission(created.id);
  await audit(req, 'SETTLEMENT_CREATED', created.id, { project: created.project });
  const { rows } = await loadRows({ ids: [created.id] });
  res.status(201).json({ row: rows[0] });
});

const changesSchema = z.object({
  changes: z
    .array(
      z.object({
        id,
        field: z.string().min(1).max(60),
        value: z.union([
          z.string().max(5000),
          z.number(),
          z.boolean(),
          z.null(),
          z.object({ cents: z.number().nullish(), currency: z.string().max(3).nullish(), text: z.string().max(40).nullish() }),
        ]),
      }),
    )
    .min(1)
    .max(5000),
});

adminSettlementsRouter.patch('/', async (req, res) => {
  const { changes } = parse(changesSchema, req.body);
  const { results, touched } = await applyChanges(changes as Change[]);
  const saved = results.filter((r) => r.ok).length;
  if (saved) {
    await audit(req, 'SETTLEMENT_SAVED', undefined, {
      changes: saved,
      failed: results.length - saved,
      rows: touched.length,
      fields: [...new Set(results.filter((r) => r.ok).map((r) => r.field.split(':')[0]))].slice(0, 30),
    });
  }
  const { rows } = touched.length ? await loadRows({ ids: touched }) : { rows: [] };
  res.json({ results, saved, failed: results.length - saved, rows });
});

const idsSchema = z.object({ ids: z.array(id).min(1).max(5000) });

const deleteRows = async (req: Request, ids: string[]) => {
  const existing = await prisma.settlementEntry.findMany({ where: { id: { in: ids } }, select: { id: true, clientName: true, project: true } });
  if (!existing.length) return 0;
  const found = existing.map((e) => e.id);
  await prisma.partnerCommission.deleteMany({ where: { settlementEntryId: { in: found } } });
  await prisma.settlementEntry.deleteMany({ where: { id: { in: found } } });
  await audit(req, 'SETTLEMENT_DELETED', undefined, { count: found.length, rows: existing.slice(0, 50).map((e) => `${e.project}: ${e.clientName}`) });
  return found.length;
};

adminSettlementsRouter.delete('/bulk', adminOnly, async (req, res) => {
  const { ids } = parse(idsSchema, req.body);
  res.json({ deleted: await deleteRows(req, ids) });
});

adminSettlementsRouter.put('/order', async (req, res) => {
  const { ids } = parse(idsSchema, req.body);
  await prisma.$transaction(ids.map((x, i) => prisma.settlementEntry.updateMany({ where: { id: x }, data: { sortOrder: i } })));
  await audit(req, 'SETTLEMENT_REORDERED', undefined, { count: ids.length });
  res.json({ ok: true });
});

adminSettlementsRouter.post('/move', async (req, res) => {
  const { ids, project } = parse(idsSchema.extend({ project: z.string().trim().min(1).max(80) }), req.body);
  let order = await nextSortOrder(project);
  const rows = await prisma.settlementEntry.findMany({ where: { id: { in: ids } }, orderBy: [{ project: 'asc' }, { sortOrder: 'asc' }], select: { id: true, project: true } });
  for (const r of rows) if (r.project !== project) await prisma.settlementEntry.update({ where: { id: r.id }, data: { project, sortOrder: order++ } });
  await audit(req, 'SETTLEMENT_MOVED', undefined, { count: rows.length, project });
  const fresh = await loadRows({ ids: rows.map((r) => r.id) });
  res.json({ moved: rows.length, rows: fresh.rows });
});

const doRecalc = async (req: Request, res: Response, ids: string[]) => {
  const done = await recalculate(ids);
  if (done.length) await audit(req, 'SETTLEMENT_RECALCULATED', done.length === 1 ? done[0] : undefined, { count: done.length });
  const { rows } = done.length ? await loadRows({ ids: done }) : { rows: [] };
  res.json({ rows });
};

adminSettlementsRouter.post('/recalculate', async (req, res) => {
  const { ids } = parse(idsSchema, req.body);
  await doRecalc(req, res, ids);
});

const paidSchema = z.object({ items: z.array(z.object({ id, beneficiaryId: z.string().min(1).max(40) })).min(1).max(5000), paid: z.boolean() });

const doPaid = async (req: Request, res: Response, items: { id: string; beneficiaryId: string }[], paid: boolean) => {
  const touched = await markPaid(items.map((i) => ({ id: i.id, key: i.beneficiaryId })), paid);
  await audit(req, paid ? 'SETTLEMENT_SHARE_PAID' : 'SETTLEMENT_SHARE_UNPAID', touched.length === 1 ? touched[0] : undefined, {
    count: items.length,
    keys: [...new Set(items.map((i) => i.beneficiaryId))].slice(0, 20),
  });
  const { rows } = touched.length ? await loadRows({ ids: touched }) : { rows: [] };
  res.json({ rows });
};

adminSettlementsRouter.post('/paid', async (req, res) => {
  const { items, paid } = parse(paidSchema, req.body);
  await doPaid(req, res, items, paid);
});

// ─── Projects ──────────────────────────────────────────────────────────

adminSettlementsRouter.get('/projects', async (_req, res) => {
  res.json({ projects: await projectsList() });
});

adminSettlementsRouter.patch('/projects', adminOnly, async (req, res) => {
  const { from, to } = parse(z.object({ from: z.string().trim().min(1).max(80), to: z.string().trim().min(1).max(80) }), req.body);
  const r = await prisma.settlementEntry.updateMany({ where: { project: from }, data: { project: to } });
  if (!r.count) throw notFound('PROJECT_NOT_FOUND');
  await audit(req, 'SETTLEMENT_PROJECT_RENAMED', undefined, { from, to, rows: r.count });
  res.json({ renamed: r.count, projects: await projectsList() });
});

// ─── Reports, export, import ───────────────────────────────────────────

adminSettlementsRouter.get('/summary', async (req, res) => {
  const q = parse(z.object({ month: month.optional() }), req.query);
  res.json(await buildSummary(q.month));
});

adminSettlementsRouter.get('/export.xlsx', async (req, res) => {
  const q = parse(z.object({ project: z.string().max(80).optional() }), req.query);
  const buf = await buildSettlementXlsx({ project: q.project || undefined });
  const name = `Hesablasmalar${q.project ? ` ${q.project}` : ''} ${new Date().toISOString().slice(0, 10)}.xlsx`;
  await audit(req, 'SETTLEMENT_EXPORTED', undefined, { project: q.project ?? null, bytes: buf.length });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname) || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') cb(null, true);
    else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
}).single('file');

const receiveFile = (req: Request, res: Response, next: NextFunction) => upload(req, res, (err: unknown) => next(err));

adminSettlementsRouter.post('/import', adminOnly, receiveFile, async (req, res) => {
  const q = parse(z.object({ dryRun: z.enum(['1', 'true', '0', 'false']).optional() }), req.query);
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  // OOXML is a zip container.
  if (file.buffer.subarray(0, 2).toString('latin1') !== 'PK') throw badRequest('INVALID_XLSX');
  const dryRun = q.dryRun === '1' || q.dryRun === 'true';
  const report = await importWorkbook(file.buffer, { dryRun, actorId: req.user!.id });
  if (!dryRun) {
    await audit(req, 'SETTLEMENT_IMPORTED', undefined, {
      file: file.originalname.slice(0, 120),
      rows: report.rows,
      created: report.created,
      updated: report.updated,
      newPartners: report.newPartners.length,
      skippedCredentials: report.skippedCredentials,
    } satisfies Prisma.InputJsonValue);
  }
  res.json(report);
});

// ─── Row import (CSV / XLSX template): preview → confirm → undo ─────────

const rowUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(csv|xlsx|txt)$/i.test(file.originalname)) cb(null, true);
    else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
}).single('file');

adminSettlementsRouter.get('/import/template.csv', adminOnly, async (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hesablasma-import.csv"');
  res.send(await templateCsv());
});

adminSettlementsRouter.get('/import/template.xlsx', adminOnly, async (_req, res) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="hesablasma-import.xlsx"');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(await templateXlsx());
});

adminSettlementsRouter.post(
  '/import/rows/preview',
  adminOnly,
  (req: Request, res: Response, next: NextFunction) => rowUpload(req, res, (err: unknown) => next(err)),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('FILE_REQUIRED');
    res.json(await previewImport(file.buffer, file.originalname.slice(0, 200)));
  },
);

adminSettlementsRouter.post('/import/rows/confirm', adminOnly, async (req, res) => {
  const input = parse(confirmSchema, req.body);
  const batch = await confirmImport(input, req.user!.id);
  await audit(req, 'SETTLEMENT_ROWS_IMPORTED', undefined, {
    batch: batch.id,
    file: batch.fileName.slice(0, 120),
    ...batch.counts,
    created: { partners: batch.created.partners.length, beneficiaries: batch.created.beneficiaries.length, companies: batch.created.companies.length },
  });
  res.status(201).json({ batch: { id: batch.id, at: batch.at, counts: batch.counts, created: batch.created } });
});

adminSettlementsRouter.get('/import/batches', adminOnly, async (_req, res) => {
  res.json({ batches: await listBatches() });
});

adminSettlementsRouter.delete('/import/batches/:batchId', adminOnly, async (req, res) => {
  const batchId = parse(z.string().regex(/^imp-[0-9a-z-]{4,40}$/), req.params.batchId);
  const result = await undoBatch(batchId, req.user!.id);
  if (!result.ok) {
    res.status(409).json({ error: 'IMPORT_EDITED', edited: result.edited });
    return;
  }
  await audit(req, 'SETTLEMENT_IMPORT_UNDONE', undefined, { batch: batchId, deleted: result.deleted, removed: result.removed });
  res.json(result);
});

// ─── Beneficiaries & rate ──────────────────────────────────────────────

const beneficiarySchema = z.object({
  name: z.string().trim().min(1).max(80),
  rule: z.enum(['THIRD_OF_NET', 'PERCENT_OF_NET', 'FIXED', 'REMAINDER']),
  value: z.number().int().min(0).max(1e10).default(0),
  currency: z.enum(['AZN', 'EUR']).nullish(),
  userId: id.nullish(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

adminSettlementsRouter.get('/beneficiaries', async (_req, res) => {
  res.json({ beneficiaries: await listBeneficiaries(), settings: await getSettings() });
});

adminSettlementsRouter.post('/beneficiaries', adminOnly, async (req, res) => {
  const b = parse(beneficiarySchema, req.body);
  if (b.rule === 'PERCENT_OF_NET' && b.value > 10000) throw badRequest('INVALID_PERCENT');
  const max = await prisma.settlementBeneficiary.aggregate({ _max: { sortOrder: true } });
  try {
    const created = await prisma.settlementBeneficiary.create({
      data: { ...b, currency: b.rule === 'FIXED' ? (b.currency ?? 'AZN') : null, userId: b.userId ?? null, sortOrder: b.sortOrder ?? (max._max.sortOrder ?? -1) + 1 },
    });
    await audit(req, 'SETTLEMENT_BENEFICIARY_CREATED', created.id, { name: created.name, rule: created.rule, value: created.value });
    res.status(201).json({ beneficiary: created });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw badRequest('NAME_TAKEN');
    throw err;
  }
});

adminSettlementsRouter.patch('/beneficiaries/:id', adminOnly, async (req, res) => {
  const b = parse(beneficiarySchema.partial(), req.body);
  const prev = await prisma.settlementBeneficiary.findUnique({ where: { id: String(req.params.id) } });
  if (!prev) throw notFound();
  const rule = b.rule ?? prev.rule;
  if (rule === 'PERCENT_OF_NET' && (b.value ?? prev.value) > 10000) throw badRequest('INVALID_PERCENT');
  try {
    const updated = await prisma.settlementBeneficiary.update({
      where: { id: prev.id },
      data: { ...b, ...(b.rule || b.currency !== undefined ? { currency: rule === 'FIXED' ? (b.currency ?? prev.currency ?? 'AZN') : null } : {}) },
    });
    await audit(req, 'SETTLEMENT_BENEFICIARY_UPDATED', updated.id, { name: updated.name, rule: updated.rule, value: updated.value, active: updated.active });
    res.json({ beneficiary: updated });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw badRequest('NAME_TAKEN');
    throw err;
  }
});

adminSettlementsRouter.delete('/beneficiaries/:id', adminOnly, async (req, res) => {
  const prev = await prisma.settlementBeneficiary.findUnique({ where: { id: String(req.params.id) } });
  if (!prev) throw notFound();
  await prisma.settlementBeneficiary.delete({ where: { id: prev.id } });
  await audit(req, 'SETTLEMENT_BENEFICIARY_DELETED', prev.id, { name: prev.name });
  res.json({ ok: true });
});

adminSettlementsRouter.put('/settings', adminOnly, async (req, res) => {
  const s = parse(z.object({ eurAzn: z.number().min(0.01).max(100) }), req.body);
  const saved = await saveSettings({ eurAzn: Math.round(s.eurAzn * 10000) / 10000 });
  await audit(req, 'SETTLEMENT_SETTINGS_SAVED', undefined, { ...saved });
  res.json({ settings: saved });
});

// ─── One row ───────────────────────────────────────────────────────────

const mustExist = async (entryId: string) => {
  const e = await prisma.settlementEntry.findUnique({ where: { id: entryId } });
  if (!e) throw notFound('ENTRY_NOT_FOUND');
  return e;
};

adminSettlementsRouter.post('/:id/recalculate', async (req, res) => {
  await mustExist(String(req.params.id));
  await doRecalc(req, res, [String(req.params.id)]);
});

adminSettlementsRouter.post('/:id/paid', async (req, res) => {
  const b = parse(z.object({ beneficiaryId: z.string().min(1).max(40), paid: z.boolean() }), req.body);
  await mustExist(String(req.params.id));
  await doPaid(req, res, [{ id: String(req.params.id), beneficiaryId: b.beneficiaryId }], b.paid);
});

adminSettlementsRouter.get('/:id/suggestions', async (req, res) => {
  const e = await mustExist(String(req.params.id));
  res.json({ suggestions: await suggestCases(e.clientName) });
});

adminSettlementsRouter.post('/:id/link', async (req, res) => {
  const { caseId } = parse(z.object({ caseId: id.nullable() }), req.body);
  await mustExist(String(req.params.id));
  await linkCase(String(req.params.id), caseId);
  await audit(req, caseId ? 'SETTLEMENT_LINKED' : 'SETTLEMENT_UNLINKED', String(req.params.id), { caseId });
  const { rows } = await loadRows({ ids: [String(req.params.id)] });
  res.json({ row: rows[0] });
});

adminSettlementsRouter.delete('/:id', adminOnly, async (req, res) => {
  await mustExist(String(req.params.id));
  await deleteRows(req, [String(req.params.id)]);
  res.json({ ok: true });
});
