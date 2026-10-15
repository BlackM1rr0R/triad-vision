import { Router, type Request } from 'express';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { forbidden, notFound } from '../lib/http.js';
import { invoiceLines, pdfFileName, renderInvoicePdf } from './admin/invoices.js';

// Invoices visible to the employer — mounted at /api/company/invoices (COMPANY role, own company only).
export const companyInvoicesRouter = Router();
companyInvoicesRouter.use(requireRole('COMPANY'));

const companyIdOf = async (req: Request) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { companyId: true } });
  if (!u?.companyId) throw forbidden('NO_COMPANY');
  return u.companyId;
};

/** Drafts are internal; everything that was ever sent stays visible (including cancelled ones). */
const VISIBLE = ['SENT', 'OVERDUE', 'PAID', 'CANCELLED'] as const;

companyInvoicesRouter.get('/', async (req, res) => {
  const companyId = await companyIdOf(req);
  const invoices = await prisma.invoice.findMany({
    where: { companyId, status: { in: [...VISIBLE] } },
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const open = invoices.filter((i) => i.status === 'SENT' || i.status === 'OVERDUE');
  res.json({
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      sentAt: i.sentAt,
      paidAt: i.paidAt,
      currency: i.currency,
      netCents: i.netCents,
      vatRate: i.vatRate,
      vatCents: i.vatCents,
      grossCents: i.grossCents,
      items: invoiceLines(i.items),
    })),
    summary: {
      openCents: open.reduce((a, i) => a + i.grossCents, 0),
      openCount: open.length,
      overdueCents: open.filter((i) => i.status === 'OVERDUE').reduce((a, i) => a + i.grossCents, 0),
      overdueCount: open.filter((i) => i.status === 'OVERDUE').length,
    },
  });
});

companyInvoicesRouter.get('/:id/pdf', async (req, res) => {
  const companyId = await companyIdOf(req);
  const inv = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { company: true } });
  // Another company's invoice (or a draft) answers exactly like a missing one.
  if (!inv || inv.companyId !== companyId || inv.status === 'DRAFT') throw notFound('INVOICE_NOT_FOUND');
  const pdf = await renderInvoicePdf(inv);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(inv)}"`);
  res.send(pdf);
});
