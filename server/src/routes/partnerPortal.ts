import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ReferralPartner } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { decodeOriginalName, documentUpload, verifyUploadedFile } from '../middleware/upload.js';
import { badRequest, forbidden, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { XLSX_MIME } from '../lib/clientsExcel.js';
import { FINAL_STATUSES } from '../lib/caseFlow.js';
import { caseLabels, commissionTotals, monthRange, settlementClientNames } from '../lib/partners/commissions.js';
import { buildCommissionWorkbook } from '../lib/partners/report.js';
import { ACTIVE_FILTER, listPartnerCases, partnerCaseDetail, storePartnerUpload } from '../lib/partnerPortal/cases.js';

/**
 * Referral-partner portal API — mounted at /api/partner. The login is a user with role AGENT that is
 * linked as `ReferralPartner.userId`; anyone else gets 403 (an AGENT without the link: NO_PARTNER_PROFILE).
 * Partners see only cases with their partnerId, in minimised form (lib/partnerPortal/cases.ts).
 */
export const partnerPortalRouter = Router();
partnerPortalRouter.use(requireRole('AGENT'));

const partnerOf = async (req: Request): Promise<ReferralPartner> => {
  const partner = await prisma.referralPartner.findUnique({ where: { userId: req.user!.id } });
  if (!partner) throw forbidden('NO_PARTNER_PROFILE');
  return partner;
};

partnerPortalRouter.get('/me', async (req, res) => {
  const partner = await partnerOf(req);
  const [user, agent] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true, phone: true, locale: true } }),
    prisma.agent.findUnique({ where: { userId: req.user!.id }, select: { id: true } }),
  ]);
  res.json({
    partner: { id: partner.id, name: partner.name, phone: partner.phone, email: partner.email, active: partner.active, commissionCents: partner.commissionCents, currency: partner.currency },
    user,
    // The same login may also take part in the agent programme: the portal then links to /agent.
    alsoAgent: !!agent,
  });
});

partnerPortalRouter.get('/dashboard', async (req, res) => {
  const partner = await partnerOf(req);
  const [cases, commissions, events] = await Promise.all([
    prisma.case.findMany({ where: { partnerId: partner.id }, select: { clientId: true, status: true } }),
    prisma.partnerCommission.findMany({ where: { partnerId: partner.id }, select: { amountCents: true, status: true, createdAt: true, paidAt: true } }),
    prisma.caseEvent.findMany({
      where: { visibleToClient: true, case: { partnerId: partner.id } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, type: true, toStatus: true, createdAt: true, case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } } },
    }),
  ]);
  const { start, end } = monthRange();
  const all = commissionTotals(commissions);
  res.json({
    currency: partner.currency,
    counts: {
      clients: new Set(cases.map((c) => c.clientId)).size,
      cases: cases.length,
      activeCases: cases.filter((c) => !FINAL_STATUSES.includes(c.status)).length,
      approvedVisas: cases.filter((c) => c.status === 'APPROVED').length,
    },
    commissions: { ...all, thisMonthCents: commissionTotals(commissions, start, end).totalCents },
    recent: events.map((e) => ({
      id: e.id,
      type: e.type,
      toStatus: e.toStatus,
      createdAt: e.createdAt,
      caseId: e.case.id,
      caseNumber: e.case.number,
      client: `${e.case.client.firstName} ${e.case.client.lastName}`.trim(),
    })),
  });
});

partnerPortalRouter.get('/cases', async (req, res) => {
  const partner = await partnerOf(req);
  const q = parse(z.object({ search: z.string().trim().max(120).optional(), filter: z.enum(ACTIVE_FILTER).default('all') }), req.query);
  res.json({ items: await listPartnerCases(partner.id, q) });
});

partnerPortalRouter.get('/cases/:id', async (req, res) => {
  const partner = await partnerOf(req);
  res.json({ case: await partnerCaseDetail(partner.id, String(req.params.id), req.user!.id) });
});

/** Upload on behalf of the client (multipart: file + requirementId); goes to the normal staff review. */
partnerPortalRouter.post('/cases/:id/documents', documentUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  try {
    const partner = await partnerOf(req);
    await verifyUploadedFile(file);
    const { requirementId } = parse(z.object({ requirementId: z.string().min(1).max(40) }), req.body);
    const out = await storePartnerUpload({
      partnerId: partner.id,
      caseId: String(req.params.id),
      requirementId,
      userId: req.user!.id,
      file: { originalName: decodeOriginalName(file.originalname), storedName: file.filename, mimeType: file.mimetype, size: file.size },
    });
    await audit(req, 'PARTNER_DOCUMENT_UPLOADED', `case:${req.params.id}`, { partnerId: partner.id, documentId: out.document.id });
    res.status(201).json({ document: out.document, checks: out.checks });
  } catch (err) {
    await fs.unlink(path.join(config.uploads.privateDir, file.filename)).catch(() => undefined);
    throw err;
  }
});

const commissionQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'PAID', 'CANCELLED']).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

partnerPortalRouter.get('/commissions', async (req, res) => {
  const partner = await partnerOf(req);
  const q = parse(commissionQuery, req.query);
  const range = q.month ? monthRange(q.month) : null;
  const rows = await prisma.partnerCommission.findMany({
    where: {
      partnerId: partner.id,
      ...(q.status ? { status: q.status } : {}),
      ...(range ? { OR: [{ createdAt: { gte: range.start, lt: range.end } }, { paidAt: { gte: range.start, lt: range.end } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  const [labels, settlementNames] = await Promise.all([caseLabels(rows.map((r) => r.caseId)), settlementClientNames(rows)]);
  res.json({
    currency: partner.currency,
    totals: commissionTotals(rows, range?.start, range?.end),
    items: rows.map((r) => {
      const c = r.caseId ? labels.get(r.caseId) : undefined;
      return {
        id: r.id,
        amountCents: r.amountCents,
        currency: r.currency,
        status: r.status,
        createdAt: r.createdAt,
        dueAt: r.dueAt,
        paidAt: r.paidAt,
        // Only the payout note of paid rows; other notes are internal.
        note: r.status === 'PAID' ? r.note : null,
        case: c ? { id: c.id, number: c.number, client: `${c.client.firstName} ${c.client.lastName}`.trim() } : null,
        // Settlement-ledger rows of clients not in the system yet: the name from the settlement sheet.
        clientName: c ? `${c.client.firstName} ${c.client.lastName}`.trim() : r.settlementEntryId ? (settlementNames.get(r.settlementEntryId) ?? null) : null,
      };
    }),
  });
});

partnerPortalRouter.get('/commissions/export.xlsx', async (req, res) => {
  const partner = await partnerOf(req);
  const q = parse(commissionQuery.omit({ status: true }), req.query);
  const { buffer, rows } = await buildCommissionWorkbook({ partnerId: partner.id, month: q.month, forPartner: true });
  await audit(req, 'PARTNER_COMMISSIONS_EXPORTED', partner.id, { month: q.month ?? null, rows });
  const name = `Komissiyalar${q.month ? `-${q.month}` : ''}.xlsx`;
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buffer);
});
