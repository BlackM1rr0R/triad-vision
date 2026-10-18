import { Router, type Request } from 'express';
import { z } from 'zod';
import type { PartnerCommission, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../http.js';
import { audit } from '../audit.js';
import { XLSX_MIME } from '../clientsExcel.js';
import { notifyPartnerCommissionsPaid } from '../partnerPortal/notify.js';
import { caseLabels, settlementClientNames, COMMISSION_STATUSES, commissionInclude, commissionTotals, monthRange, periodWhere } from './commissions.js';
import { buildCommissionWorkbook } from './report.js';

/**
 * Referral-partner commissions — mounted at /api/admin/partners/commissions.
 * Permissions: STAFF view, export and add PENDING commissions (and edit rows that are still PENDING);
 * ADMIN and above also approve, mark paid (single / bulk), cancel and edit approved rows.
 */
export const partnerCommissionsRouter = Router();

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(`${s}T00:00:00.000Z`));
const note = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((v) => (v === '' ? null : v));

const filter = z.object({
  partnerId: z.string().max(40).optional(),
  status: z.enum(COMMISSION_STATUSES).optional(),
  month: month.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

type Row = PartnerCommission & { partner: { id: string; name: string } };

const view = async (rows: Row[]) => {
  const [labels, names] = await Promise.all([caseLabels(rows.map((r) => r.caseId)), settlementClientNames(rows)]);
  return rows.map((r) => {
    const c = r.caseId ? labels.get(r.caseId) : undefined;
    return {
      ...r,
      clientName: c ? `${c.client.firstName} ${c.client.lastName}`.trim() : r.settlementEntryId ? (names.get(r.settlementEntryId) ?? null) : null,
      case: c ? { id: c.id, number: c.number, status: c.status, client: `${c.client.firstName} ${c.client.lastName}`.trim() } : null,
    };
  });
};

partnerCommissionsRouter.get('/', async (req, res) => {
  const q = parse(filter, req.query);
  const range = q.month ? monthRange(q.month) : null;
  const base: Prisma.PartnerCommissionWhereInput = {
    ...(q.partnerId ? { partnerId: q.partnerId } : {}),
    ...(range ? periodWhere(range.start, range.end) : {}),
  };
  const where: Prisma.PartnerCommissionWhereInput = { ...base, ...(q.status ? { status: q.status } : {}) };
  const pageSize = 50;
  const [items, total, all] = await Promise.all([
    prisma.partnerCommission.findMany({ where, include: commissionInclude, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * pageSize, take: pageSize }),
    prisma.partnerCommission.count({ where }),
    prisma.partnerCommission.findMany({ where: base, select: { amountCents: true, status: true, createdAt: true, paidAt: true } }),
  ]);
  res.json({ items: await view(items), total, page: q.page, pageSize, totals: commissionTotals(all, range?.start, range?.end) });
});

/** GET /export.xlsx?month=YYYY-MM&partnerId= — monthly report: summary per partner + detail rows. */
partnerCommissionsRouter.get('/export.xlsx', async (req, res) => {
  const q = parse(z.object({ month: month.optional(), partnerId: z.string().max(40).optional() }), req.query);
  if (q.partnerId && !(await prisma.referralPartner.count({ where: { id: q.partnerId } }))) throw notFound('PARTNER_NOT_FOUND');
  const { buffer, rows, partners } = await buildCommissionWorkbook({ month: q.month, partnerId: q.partnerId });
  await audit(req, 'PARTNER_COMMISSIONS_EXPORTED', q.partnerId, { month: q.month ?? null, rows, partners });
  const name = `Partnyor-komissiyalari${q.month ? `-${q.month}` : ''}.xlsx`;
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buffer);
});

const amount = z.number().int().min(0).max(100_000_000);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

/** POST / — manual commission (always PENDING). With a case it must be one of the partner's cases. */
partnerCommissionsRouter.post('/', async (req, res) => {
  const body = parse(
    z.object({
      partnerId: z.string().min(1).max(40),
      caseId: z.string().min(1).max(40).nullable().optional(),
      amountCents: amount,
      currency: currency.optional(),
      note,
      dueAt: day.nullable().optional(),
    }),
    req.body,
  );
  const partner = await prisma.referralPartner.findUnique({ where: { id: body.partnerId }, select: { id: true, currency: true } });
  if (!partner) throw badRequest('INVALID_PARTNER');
  if (body.caseId) {
    const c = await prisma.case.findUnique({ where: { id: body.caseId }, select: { partnerId: true } });
    if (!c || c.partnerId !== partner.id) throw badRequest('INVALID_CASE');
    const dup = await prisma.partnerCommission.findUnique({ where: { partnerId_caseId: { partnerId: partner.id, caseId: body.caseId } } });
    if (dup) throw conflict('COMMISSION_EXISTS');
  }
  const row = await prisma.partnerCommission.create({
    data: {
      partnerId: partner.id,
      caseId: body.caseId ?? null,
      amountCents: body.amountCents,
      currency: body.currency ?? partner.currency,
      note: body.note ?? null,
      dueAt: body.dueAt ?? null,
      createdById: req.user!.id,
    },
    include: commissionInclude,
  });
  await audit(req, 'PARTNER_COMMISSION_CREATED', row.id, { partnerId: row.partnerId, caseId: row.caseId, amountCents: row.amountCents });
  res.status(201).json({ commission: (await view([row]))[0] });
});

const loadRow = async (id: string) => {
  const row = await prisma.partnerCommission.findUnique({ where: { id }, include: commissionInclude });
  if (!row) throw notFound('COMMISSION_NOT_FOUND');
  return row;
};

const isAdmin = (req: Request) => hasMinRole(req.user?.role, 'ADMIN');

/** PATCH /:id — amount / currency / note / due date. Staff: PENDING rows only; admins: also APPROVED, and the note of PAID rows. */
partnerCommissionsRouter.patch('/:id', async (req, res) => {
  const body = parse(z.object({ amountCents: amount.optional(), currency: currency.optional(), note, dueAt: day.nullable().optional() }), req.body);
  const row = await loadRow(String(req.params.id));
  if (row.status === 'CANCELLED') throw conflict('COMMISSION_CLOSED');
  if (!isAdmin(req) && row.status !== 'PENDING') throw forbidden('FORBIDDEN');
  if (row.status === 'PAID' && (body.amountCents !== undefined || body.currency !== undefined || body.dueAt !== undefined)) throw conflict('COMMISSION_PAID');
  const updated = await prisma.partnerCommission.update({ where: { id: row.id }, data: body, include: commissionInclude });
  await audit(req, 'PARTNER_COMMISSION_UPDATED', row.id, { fields: Object.keys(body), from: row.amountCents, to: updated.amountCents });
  res.json({ commission: (await view([updated]))[0] });
});

partnerCommissionsRouter.post('/:id/approve', requireMinRole('ADMIN'), async (req, res) => {
  const row = await loadRow(String(req.params.id));
  const { count } = await prisma.partnerCommission.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'APPROVED' } });
  if (!count) throw conflict('INVALID_STATUS');
  await audit(req, 'PARTNER_COMMISSION_APPROVED', row.id, { partnerId: row.partnerId, amountCents: row.amountCents });
  res.json({ commission: (await view([await loadRow(row.id)]))[0] });
});

const payBody = z.object({ paidAt: day.optional(), note });

/** Marks rows paid (PENDING or APPROVED), returns the rows that changed and notifies their partners. */
const markPaid = async (req: Request, ids: string[], paidAt: Date | undefined, payoutNote: string | null | undefined) => {
  const rows = await prisma.partnerCommission.findMany({ where: { id: { in: ids }, status: { in: ['PENDING', 'APPROVED'] } } });
  if (!rows.length) return rows;
  const at = paidAt ?? new Date();
  await prisma.partnerCommission.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, status: { in: ['PENDING', 'APPROVED'] } },
    data: { status: 'PAID', paidAt: at, ...(payoutNote !== undefined ? { note: payoutNote } : {}) },
  });
  void notifyPartnerCommissionsPaid(rows);
  await audit(req, 'PARTNER_COMMISSIONS_PAID', undefined, { ids: rows.map((r) => r.id), paidAt: at.toISOString(), note: payoutNote ?? null });
  return rows;
};

partnerCommissionsRouter.post('/:id/pay', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(payBody, req.body);
  const row = await loadRow(String(req.params.id));
  const changed = await markPaid(req, [row.id], body.paidAt, body.note);
  if (!changed.length) throw conflict('INVALID_STATUS');
  res.json({ commission: (await view([await loadRow(row.id)]))[0] });
});

partnerCommissionsRouter.post('/bulk-pay', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(payBody.extend({ ids: z.array(z.string().min(1).max(40)).min(1).max(500) }), req.body);
  const ids = [...new Set(body.ids)];
  const changed = await markPaid(req, ids, body.paidAt, body.note);
  res.json({ updated: changed.length, skipped: ids.length - changed.length });
});

partnerCommissionsRouter.post('/:id/cancel', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ note }), req.body ?? {});
  const row = await loadRow(String(req.params.id));
  const { count } = await prisma.partnerCommission.updateMany({
    where: { id: row.id, status: { in: ['PENDING', 'APPROVED'] } },
    data: { status: 'CANCELLED', ...(body.note !== undefined ? { note: body.note } : {}) },
  });
  if (!count) throw conflict('INVALID_STATUS');
  await audit(req, 'PARTNER_COMMISSION_CANCELLED', row.id, { partnerId: row.partnerId, amountCents: row.amountCents });
  res.json({ commission: (await view([await loadRow(row.id)]))[0] });
});
