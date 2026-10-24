import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { requireMinRole } from '../../middleware/auth.js';
import {
  cancelInvoice,
  caseBilling,
  createDraft,
  deleteDraft,
  findInvoice,
  invoiceView,
  invoicesCsv,
  listInvoices,
  listQuery,
  pdfFileName,
  receiptNumber,
  recordPayment,
  renderInvoicePdf,
  renderReceiptPdf,
  sendInvoice,
  todayIso,
  updateDraft,
  voidPayment,
} from '../../lib/billing/service.js';
import { clientBillingSchema, effectiveVatRate, loadBillingContext, saveClientBillingSettings } from '../../lib/billing/settings.js';
import { CURRENCIES } from '../../lib/billing/currency.js';
import { entityForCurrency } from '../../lib/billing/entities.js';
import {
  PLAN_TEMPLATES,
  addInstallment,
  cancelPlan,
  createPlan,
  deleteInstallment,
  invoiceInstallment,
  planWithItems,
  updateInstallment,
  updatePlan,
} from '../../lib/billing/plans.js';

/**
 * Client billing for staff — mounted at /api/admin/client-billing (STAFF+). Case-level work (invoices, payments,
 * plans of a case) is open to every staff member; the cross-client list, the CSV export, the settings, voiding
 * a payment and cancelling a plan are ADMIN+.
 */
export const adminClientBillingRouter = Router();

const admin = requireMinRole('ADMIN');
const id = (req: Request) => String(req.params.id);
const sendPdf = (res: import('express').Response, pdf: Buffer, name: string, inline: boolean) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(pdf);
};

// ─── Settings ────────────────────────────────────────────────────────

/** Settings + the document currencies (default currency, entity per currency) for the invoice / plan editors. */
const settingsView = async () => {
  const ctx = await loadBillingContext();
  return {
    settings: ctx.billing,
    seller: ctx.seller,
    legalMissing: ctx.legalMissing,
    bank: ctx.bank,
    templates: PLAN_TEMPLATES,
    currencies: CURRENCIES,
    defaultCurrency: ctx.entities.defaultCurrency,
    entityByCurrency: Object.fromEntries(CURRENCIES.map((c) => [c, entityForCurrency(c, ctx.entities)])),
    /** VAT rate a new invoice gets per currency (the issuing entity's VAT mode / rate). */
    vatRateByCurrency: Object.fromEntries(
      await Promise.all(CURRENCIES.map(async (c) => [c, effectiveVatRate((await loadBillingContext({ currency: c })).billing)] as const)),
    ),
  };
};

adminClientBillingRouter.get('/settings', async (_req, res) => {
  res.json(await settingsView());
});

adminClientBillingRouter.put('/settings', admin, async (req, res) => {
  const value = parse(clientBillingSchema, req.body?.settings ?? req.body ?? {});
  await saveClientBillingSettings(value);
  await audit(req, 'CLIENT_BILLING_SETTINGS', 'clientBilling');
  res.json(await settingsView());
});

// ─── Lists ───────────────────────────────────────────────────────────

adminClientBillingRouter.get('/invoices', admin, async (req, res) => {
  res.json(await listInvoices(parse(listQuery, req.query)));
});

adminClientBillingRouter.get('/invoices.csv', admin, async (req, res) => {
  const { invoices } = await listInvoices(parse(listQuery, req.query), 10_000);
  await audit(req, 'CLIENT_INVOICES_EXPORT', undefined, { count: invoices.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Kundenrechnungen-${todayIso()}.csv"`);
  res.send(invoicesCsv(invoices));
});

/** Clients for the "new invoice" picker (name / e-mail search). */
adminClientBillingRouter.get('/clients', async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().max(80).default('') }), req.query);
  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const clients = await prisma.user.findMany({
    where: { role: 'CLIENT', AND: words.map((w) => ({ OR: [{ firstName: { contains: w } }, { lastName: { contains: w } }, { email: { contains: w } }] })) },
    select: { id: true, firstName: true, lastName: true, email: true, cases: { select: { id: true, number: true, status: true }, orderBy: { createdAt: 'desc' }, take: 5 } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ clients });
});

/** Everything billing of one case: invoices, payments, plans, balance. */
adminClientBillingRouter.get('/cases/:id', async (req, res) => {
  res.json(await caseBilling(id(req)));
});

// ─── Invoices ────────────────────────────────────────────────────────

adminClientBillingRouter.post('/invoices', async (req, res) => {
  const inv = await createDraft(req.body ?? {}, req.user!.id);
  await audit(req, 'CLIENT_INVOICE_CREATE', inv.id, { clientId: inv.clientId, grossCents: inv.grossCents });
  res.status(201).json({ invoice: invoiceView(inv) });
});

adminClientBillingRouter.get('/invoices/:id', async (req, res) => {
  res.json({ invoice: invoiceView(await findInvoice(id(req))) });
});

adminClientBillingRouter.put('/invoices/:id', async (req, res) => {
  const inv = await updateDraft(id(req), req.body ?? {});
  await audit(req, 'CLIENT_INVOICE_UPDATE', inv.id);
  res.json({ invoice: invoiceView(inv) });
});

adminClientBillingRouter.delete('/invoices/:id', async (req, res) => {
  await deleteDraft(id(req));
  await audit(req, 'CLIENT_INVOICE_DELETE', id(req));
  res.json({ ok: true });
});

adminClientBillingRouter.get('/invoices/:id/pdf', async (req, res) => {
  const inv = await findInvoice(id(req));
  sendPdf(res, await renderInvoicePdf(inv), pdfFileName(inv), req.query.inline === '1');
});

adminClientBillingRouter.post('/invoices/:id/send', async (req, res) => {
  const r = await sendInvoice(id(req));
  await audit(req, r.resent ? 'CLIENT_INVOICE_RESEND' : 'CLIENT_INVOICE_SEND', r.invoice.id, { number: r.invoice.number, emailed: r.emailed });
  res.json({ invoice: invoiceView(r.invoice), emailed: r.emailed });
});

adminClientBillingRouter.post('/invoices/:id/cancel', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(1000).optional() }), req.body ?? {});
  const inv = await cancelInvoice(id(req), reason ?? null);
  await audit(req, 'CLIENT_INVOICE_CANCEL', inv.id, { number: inv.number, reason: reason ?? null });
  res.json({ invoice: invoiceView(inv) });
});

// ─── Payments ────────────────────────────────────────────────────────

adminClientBillingRouter.post('/invoices/:id/payments', async (req, res) => {
  const r = await recordPayment(id(req), req.body ?? {}, req.user!.id);
  await audit(req, 'CLIENT_PAYMENT_RECORD', r.payment.id, { invoiceId: r.invoice.id, amountCents: r.payment.amountCents, method: r.payment.method });
  res.status(201).json({ payment: r.payment, invoice: invoiceView(r.invoice) });
});

adminClientBillingRouter.get('/payments/:id/receipt', async (req, res) => {
  const p = await prisma.clientPayment.findUnique({ where: { id: id(req) } });
  if (!p) throw notFound('PAYMENT_NOT_FOUND');
  sendPdf(res, await renderReceiptPdf(p), `Quittung-${await receiptNumber(p)}.pdf`, req.query.inline === '1');
});

adminClientBillingRouter.delete('/payments/:id', admin, async (req, res) => {
  const inv = await voidPayment(id(req));
  await audit(req, 'CLIENT_PAYMENT_VOID', id(req), { invoiceId: inv?.id ?? null });
  res.json({ invoice: inv ? invoiceView(inv) : null });
});

// ─── Plans ───────────────────────────────────────────────────────────

adminClientBillingRouter.get('/plan-templates', (_req, res) => {
  res.json({ templates: PLAN_TEMPLATES });
});

adminClientBillingRouter.post('/plans', async (req, res) => {
  const { plan, invoiced } = await createPlan(req.body ?? {}, req.user!.id);
  await audit(req, 'PAYMENT_PLAN_CREATE', plan.id, { clientId: plan.clientId, totalCents: plan.totalCents, invoiced: invoiced.length });
  res.status(201).json({ plan: await planWithItems(plan.id), invoiced });
});

adminClientBillingRouter.patch('/plans/:id', async (req, res) => {
  const body = parse(z.object({ title: z.string().trim().min(2).max(200).optional() }), req.body ?? {});
  await updatePlan(id(req), body);
  res.json({ plan: await planWithItems(id(req)) });
});

adminClientBillingRouter.post('/plans/:id/cancel', admin, async (req, res) => {
  await cancelPlan(id(req));
  await audit(req, 'PAYMENT_PLAN_CANCEL', id(req));
  res.json({ plan: await planWithItems(id(req)) });
});

adminClientBillingRouter.post('/plans/:id/installments', async (req, res) => {
  const i = await addInstallment(id(req), req.body ?? {});
  await audit(req, 'PAYMENT_INSTALLMENT_ADD', i.id, { planId: i.planId });
  res.status(201).json({ plan: await planWithItems(id(req)) });
});

adminClientBillingRouter.put('/installments/:id', async (req, res) => {
  const i = await updateInstallment(id(req), req.body ?? {});
  await audit(req, 'PAYMENT_INSTALLMENT_UPDATE', i.id);
  res.json({ plan: await planWithItems(i.planId) });
});

adminClientBillingRouter.delete('/installments/:id', async (req, res) => {
  const i = await prisma.paymentInstallment.findUnique({ where: { id: id(req) }, select: { planId: true } });
  if (!i) throw notFound('INSTALLMENT_NOT_FOUND');
  await deleteInstallment(id(req));
  await audit(req, 'PAYMENT_INSTALLMENT_DELETE', id(req));
  res.json({ plan: await planWithItems(i.planId) });
});

/** Invoice a pending instalment now (e.g. after its earlier invoice was cancelled). */
adminClientBillingRouter.post('/installments/:id/invoice', async (req, res) => {
  const i = await prisma.paymentInstallment.findUnique({ where: { id: id(req) } });
  if (!i) throw notFound('INSTALLMENT_NOT_FOUND');
  const inv = await invoiceInstallment(i.id, req.user!.id);
  if (!inv) {
    res.status(409).json({ error: 'INSTALLMENT_NOT_PENDING' });
    return;
  }
  await audit(req, 'PAYMENT_INSTALLMENT_INVOICE', i.id, { invoiceId: inv.id });
  res.status(201).json({ invoice: invoiceView(inv), plan: await planWithItems(i.planId) });
});
