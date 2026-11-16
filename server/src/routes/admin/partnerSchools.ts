import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { PARTNER_CATEGORIES, RECORD_STATUSES, categoryOf, recordView, reviewRecord, sendCertificate } from '../../lib/partners/schools.js';

/**
 * Colleges / language schools — staff side (/api/admin/partner-schools; the admin router requires STAFF):
 *   GET   /partners                     every referral partner with its category and student-record counts
 *   PATCH /partners/:id/category        set AGENCY | SCHOOL | LANGUAGE_SCHOOL                               ADMIN+
 *   GET   /records?status=&partnerId=   attendance / exam records of school partners (review queue)
 *   GET   /records/:id/certificate      the uploaded certificate
 *   POST  /records/:id/confirm          confirm (a passed exam raises the client's German level)
 *   POST  /records/:id/reject           reject with a note
 */
export const adminPartnerSchoolsRouter = Router();

adminPartnerSchoolsRouter.get('/partners', async (_req, res) => {
  const [partners, pending] = await Promise.all([
    prisma.referralPartner.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { id: true, name: true, category: true, active: true, city: true, country: true }, take: 2000 }),
    prisma.partnerStudentRecord.groupBy({ by: ['partnerId'], where: { status: 'PENDING' }, _count: { _all: true } }),
  ]);
  const pendingBy = new Map(pending.map((p) => [p.partnerId, p._count._all]));
  res.json({ categories: PARTNER_CATEGORIES, items: partners.map((p) => ({ ...p, category: categoryOf(p.category), pendingRecords: pendingBy.get(p.id) ?? 0 })) });
});

adminPartnerSchoolsRouter.patch('/partners/:id/category', requireMinRole('ADMIN'), async (req, res) => {
  const { category } = parse(z.object({ category: z.enum(PARTNER_CATEGORIES) }), req.body);
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, select: { id: true, category: true } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const updated = await prisma.referralPartner.update({ where: { id: partner.id }, data: { category }, select: { id: true, name: true, category: true, active: true } });
  if (partner.category !== category) await audit(req, 'PARTNER_CATEGORY_CHANGED', `partner:${partner.id}`, { from: partner.category, to: category });
  res.json({ partner: updated });
});

adminPartnerSchoolsRouter.get('/records', async (req, res) => {
  const q = parse(z.object({ status: z.enum(RECORD_STATUSES).optional(), partnerId: z.string().max(40).optional() }), req.query);
  const rows = await prisma.partnerStudentRecord.findMany({
    where: { ...(q.status ? { status: q.status } : {}), ...(q.partnerId ? { partnerId: q.partnerId } : {}) },
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  });
  const [partners, clients] = rows.length
    ? await Promise.all([
        prisma.referralPartner.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.partnerId))] } }, select: { id: true, name: true, category: true } }),
        prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, firstName: true, lastName: true, germanLevel: true } }),
      ])
    : [[], []];
  const partnerBy = new Map(partners.map((p) => [p.id, p]));
  const clientBy = new Map(clients.map((c) => [c.id, c]));
  const counts = await prisma.partnerStudentRecord.groupBy({ by: ['status'], _count: { _all: true } });
  res.json({
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    items: rows.map((r) => ({
      ...recordView(r),
      levelBefore: r.levelBefore,
      partner: partnerBy.get(r.partnerId) ?? { id: r.partnerId, name: '—', category: 'AGENCY' },
      client: clientBy.get(r.clientId) ?? { id: r.clientId, firstName: '—', lastName: '', germanLevel: null },
    })),
  });
});

adminPartnerSchoolsRouter.get('/records/:id/certificate', async (req, res) => {
  const r = await prisma.partnerStudentRecord.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound('RECORD_NOT_FOUND');
  void audit(req, 'PARTNER_STUDENT_CERTIFICATE_VIEWED', `user:${r.clientId}`, { recordId: r.id });
  sendCertificate(res, r);
});

const reviewBody = z.object({ note: z.string().trim().max(2000).optional().nullable() });

adminPartnerSchoolsRouter.post('/records/:id/confirm', async (req, res) => {
  const { note } = parse(reviewBody, req.body ?? {});
  const out = await reviewRecord(String(req.params.id), 'CONFIRM', req.user!.id, note);
  await audit(req, 'PARTNER_STUDENT_RECORD_CONFIRMED', `user:${out.record.clientId}`, {
    recordId: out.record.id,
    partnerId: out.record.partnerId,
    kind: out.record.kind,
    germanLevel: out.levelApplied ? { from: out.levelBefore, to: out.levelApplied } : null,
  });
  res.json({ record: recordView(out.record), levelBefore: out.levelBefore, levelApplied: out.levelApplied });
});

adminPartnerSchoolsRouter.post('/records/:id/reject', async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().min(1).max(2000) }), req.body ?? {});
  const out = await reviewRecord(String(req.params.id), 'REJECT', req.user!.id, note);
  await audit(req, 'PARTNER_STUDENT_RECORD_REJECTED', `user:${out.record.clientId}`, { recordId: out.record.id, partnerId: out.record.partnerId });
  res.json({ record: recordView(out.record) });
});
