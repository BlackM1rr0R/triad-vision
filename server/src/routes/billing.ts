import { Router } from 'express';
import { prisma } from '../db.js';
import { forbidden, notFound } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { clientBilling, pdfFileName, receiptNumber, renderInvoicePdf, renderReceiptPdf } from '../lib/billing/service.js';

/**
 * Client portal › Documents › Payments — mounted at /api/account/billing (signed-in CLIENT): issued invoices
 * with PDF, receipts, the payment plan, paid / open balance and the bank details with the payment reference.
 */
export const accountBillingRouter = Router();
accountBillingRouter.use(requireAuth);
accountBillingRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

accountBillingRouter.get('/', async (req, res) => {
  res.json(await clientBilling(req.user!.id));
});

accountBillingRouter.get('/invoices/:id/pdf', async (req, res) => {
  const inv = await prisma.clientInvoice.findUnique({ where: { id: String(req.params.id) } });
  if (!inv || inv.clientId !== req.user!.id || inv.status === 'DRAFT') throw notFound('INVOICE_NOT_FOUND');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${pdfFileName(inv)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(await renderInvoicePdf(inv));
});

accountBillingRouter.get('/payments/:id/receipt', async (req, res) => {
  const p = await prisma.clientPayment.findUnique({ where: { id: String(req.params.id) } });
  if (!p || p.clientId !== req.user!.id) throw notFound('PAYMENT_NOT_FOUND');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Quittung-${await receiptNumber(p)}.pdf"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(await renderReceiptPdf(p));
});
