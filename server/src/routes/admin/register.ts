import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { syncCaseFolder } from '../../lib/drive/caseFolders.js';
import { pickLang } from '../../lib/register/labels.js';
import { columnDto, listColumns, loadRows, registerDataOf, type RegisterRow } from '../../lib/register/rows.js';
import { applyChanges } from '../../lib/register/save.js';
import { syncCaseCommissions } from '../../lib/partners/commissions.js';
import { buildRegisterXlsx } from '../../lib/register/export.js';
import { requestMaskGroups } from '../../lib/privacy/mask.js';

/**
 * Excel-like client register (/api/admin/register; the admin router is already STAFF+ with 2FA).
 *
 *   GET    /                    rows (one per case) + custom columns + select options
 *   PATCH  /                    { changes: [{ caseId, field, value }] } batch save → per-change results
 *   GET    /export.xlsx         the register as a styled workbook
 *   GET    /columns             custom columns
 *   POST   /columns             (ADMIN+) add      { label, type, options?, width? }
 *   PATCH  /columns/:id         (ADMIN+) change   { label?, type?, options?, width? }
 *   DELETE /columns/:id         (ADMIN+) delete (its values are removed from every case)
 *   PUT    /columns/order       (ADMIN+) { ids } new order
 */
export const adminRegisterRouter = Router();

const adminOnly = requireMinRole('ADMIN');
const langOf = (req: Request) => pickLang(req.get('x-locale'), pickLang(req.user?.locale));

/** Rows as sent to the browser: without fields it never uses (the register is a few thousand rows). */
const lean = (rows: RegisterRow[]) => rows.map(({ clientId: _clientId, ...r }) => r);

const options = async () => {
  const [partners, staff] = await Promise.all([
    prisma.referralPartner.findMany({ select: { id: true, name: true, active: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ]);
  return {
    partners,
    staff: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim() })),
    visaTypes: ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'],
  };
};

adminRegisterRouter.get('/', async (req, res) => {
  const q = parse(z.object({ q: z.string().max(100).optional() }), req.query);
  const [{ rows, truncated }, columns, opts] = await Promise.all([loadRows(langOf(req), { q: q.q }), listColumns(), options()]);
  res.json({ rows: lean(rows), truncated, columns, options: opts, canManageColumns: hasMinRole(req.user!.role, 'ADMIN') });
});

const changesSchema = z.object({
  changes: z
    .array(
      z.object({
        caseId: z.string().min(1).max(40),
        field: z.string().min(1).max(40),
        value: z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]),
      }),
    )
    .min(1)
    .max(5000),
});

adminRegisterRouter.patch('/', async (req, res) => {
  const { changes } = parse(changesSchema, req.body);
  const columns = await listColumns();
  const { results, touchedCaseIds, folderSync, partnerChanges } = await applyChanges(changes, columns);
  if (partnerChanges.length) void syncCaseCommissions(partnerChanges, req.user!.id).catch(() => {});
  const saved = results.filter((r) => r.ok).length;
  const failed = results.length - saved;
  if (saved) {
    await audit(req, 'CLIENT_REGISTER_SAVED', undefined, {
      changes: saved,
      failed,
      cases: new Set(results.filter((r) => r.ok).map((r) => r.caseId)).size,
      fields: [...new Set(results.filter((r) => r.ok).map((r) => r.field))].slice(0, 50),
    });
  }
  for (const id of folderSync) void syncCaseFolder(id).catch(() => {});
  const { rows } = touchedCaseIds.length ? await loadRows(langOf(req), { ids: touchedCaseIds }) : { rows: [] };
  res.json({ results, saved, failed, rows: lean(rows) });
});

adminRegisterRouter.get('/export.xlsx', async (req, res) => {
  const buf = await buildRegisterXlsx(langOf(req), requestMaskGroups(res)); // masked for STAFF per settings
  const name = `Register ${new Date().toISOString().slice(0, 10)}.xlsx`;
  await audit(req, 'CLIENT_REGISTER_EXPORTED', undefined, { bytes: buf.length });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
});

// ─── Columns ──────────────────────────────────────────────────────────

const MAX_COLUMNS = 100;
const optionList = z
  .array(z.string().trim().min(1).max(80))
  .max(200)
  .transform((a) => [...new Set(a)]);
const columnSchema = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX']).default('TEXT'),
  options: optionList.optional(),
  width: z.number().int().min(60).max(800).optional(),
});

adminRegisterRouter.get('/columns', async (_req, res) => {
  res.json({ columns: await listColumns() });
});

adminRegisterRouter.post('/columns', adminOnly, async (req, res) => {
  const body = parse(columnSchema, req.body);
  if ((await prisma.clientRegisterColumn.count()) >= MAX_COLUMNS) throw badRequest('TOO_MANY_COLUMNS');
  if (body.type === 'SELECT' && !body.options?.length) throw badRequest('OPTIONS_REQUIRED');
  const max = await prisma.clientRegisterColumn.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.clientRegisterColumn.create({
    data: {
      label: body.label,
      type: body.type,
      options: body.type === 'SELECT' ? body.options : Prisma.DbNull,
      width: body.width ?? 160,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  await audit(req, 'CLIENT_REGISTER_COLUMN_ADDED', `register-column:${created.id}`, { label: created.label, type: created.type });
  res.status(201).json({ column: columnDto(created) });
});

adminRegisterRouter.put('/columns/order', adminOnly, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().min(1).max(40)).max(MAX_COLUMNS) }), req.body);
  const existing = await prisma.clientRegisterColumn.findMany({ select: { id: true } });
  const known = new Set(existing.map((c) => c.id));
  const order = [...new Set(ids)].filter((id) => known.has(id));
  // Columns missing from the list keep their relative order after the listed ones.
  for (const c of existing) if (!order.includes(c.id)) order.push(c.id);
  await prisma.$transaction(order.map((id, i) => prisma.clientRegisterColumn.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ columns: await listColumns() });
});

adminRegisterRouter.patch('/columns/:id', adminOnly, async (req, res) => {
  const body = parse(columnSchema.partial(), req.body);
  const col = await prisma.clientRegisterColumn.findUnique({ where: { id: String(req.params.id) } });
  if (!col) throw notFound('COLUMN_NOT_FOUND');
  const type = body.type ?? col.type;
  const opts = body.options ?? (Array.isArray(col.options) ? (col.options as string[]) : []);
  if (type === 'SELECT' && !opts.length) throw badRequest('OPTIONS_REQUIRED');
  const updated = await prisma.clientRegisterColumn.update({
    where: { id: col.id },
    data: {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.width !== undefined ? { width: body.width } : {}),
      type,
      options: type === 'SELECT' ? opts : Prisma.DbNull,
    },
  });
  await audit(req, 'CLIENT_REGISTER_COLUMN_CHANGED', `register-column:${col.id}`, { label: updated.label, type: updated.type });
  res.json({ column: columnDto(updated) });
});

adminRegisterRouter.delete('/columns/:id', adminOnly, async (req, res) => {
  const col = await prisma.clientRegisterColumn.findUnique({ where: { id: String(req.params.id) } });
  if (!col) throw notFound('COLUMN_NOT_FOUND');
  await prisma.clientRegisterColumn.delete({ where: { id: col.id } });
  // Strip the column's values from every case (batched; ids of deleted columns are never reused anyway).
  let cleaned = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.case.findMany({
      where: { registerData: { not: Prisma.DbNull } },
      select: { id: true, registerData: true },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!batch.length) break;
    for (const c of batch) {
      const data = registerDataOf(c.registerData);
      if (!(col.id in data)) continue;
      delete data[col.id];
      await prisma.case.update({ where: { id: c.id }, data: { registerData: Object.keys(data).length ? data : Prisma.DbNull } });
      cleaned++;
    }
    cursor = batch[batch.length - 1].id;
  }
  await audit(req, 'CLIENT_REGISTER_COLUMN_DELETED', `register-column:${col.id}`, { label: col.label, cleaned });
  res.json({ ok: true, cleaned });
});
