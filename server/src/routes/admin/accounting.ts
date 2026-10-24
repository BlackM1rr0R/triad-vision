import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { CURRENCIES, getExchangeRates, saveExchangeRates } from '../../lib/billing/currency.js';
import { getBillingEntities, saveBillingEntities } from '../../lib/billing/entities.js';
import { buildDatevExport, datevZip, getDatevSettings, saveDatevSettings } from '../../lib/accounting/datev.js';
import { CHART_DEFAULTS, datevAmount } from '../../lib/accounting/datevFormat.js';
import { pdfFileName as clientPdfName, renderInvoicePdf as renderClientPdf } from '../../lib/billing/service.js';
import { pdfFileName as companyPdfName, renderInvoicePdf as renderCompanyPdf } from './invoices.js';

/**
 * Accounting (Admin › Finance › Accounting) — mounted at /api/admin/accounting (ADMIN+):
 *   GET/PUT /currencies        document currencies: billing entities (DE / AZ, entity per currency, default
 *                              currency) + exchange rates (1 EUR = x AZN / TRY, with date) — lib/billing/{entities,currency}.ts
 *   GET/PUT /datev/settings    Beraternummer, Mandantennummer, SKR03/SKR04, accounts, BU keys, Debitor numbering
 *   GET     /datev/preview     ?from&to&payments=1 → counts, warnings and the first rows
 *   GET     /datev/export      ?from&to&payments=1&pdfs=1 → EXTF CSV (CP1252) or ZIP with the invoice PDFs
 */
export const adminAccountingRouter = Router();

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)), 'INVALID_DATE');
const flag = z.enum(['0', '1', 'true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === '1' || v === 'true'));
const periodQuery = z.object({ from: day, to: day, payments: flag, pdfs: flag });

// ─── Currencies, entities, exchange rates ────────────────────────────

const currenciesView = async () => {
  const [entities, rates] = await Promise.all([getBillingEntities(), getExchangeRates()]);
  return { currencies: CURRENCIES, entities, rates };
};

adminAccountingRouter.get('/currencies', async (_req, res) => {
  res.json(await currenciesView());
});

adminAccountingRouter.put('/currencies', async (req, res) => {
  const body = parse(z.object({ entities: z.unknown().optional(), rates: z.unknown().optional() }), req.body ?? {});
  try {
    if (body.entities !== undefined) await saveBillingEntities(body.entities);
    if (body.rates !== undefined) await saveExchangeRates(body.rates);
  } catch (err) {
    if (err instanceof z.ZodError) throw badRequest('VALIDATION_ERROR', err.issues[0]?.message);
    throw err;
  }
  await audit(req, 'ACCOUNTING_CURRENCIES', 'billingEntities', { entities: body.entities !== undefined, rates: body.rates !== undefined });
  res.json(await currenciesView());
});

// ─── DATEV ───────────────────────────────────────────────────────────

adminAccountingRouter.get('/datev/settings', async (_req, res) => {
  res.json({ settings: await getDatevSettings(), chartDefaults: CHART_DEFAULTS });
});

adminAccountingRouter.put('/datev/settings', async (req, res) => {
  const settings = await saveDatevSettings(req.body?.settings ?? req.body ?? {});
  await audit(req, 'DATEV_SETTINGS', 'datev', { chart: settings.chart });
  res.json({ settings, chartDefaults: CHART_DEFAULTS });
});

adminAccountingRouter.get('/datev/preview', async (req, res) => {
  const q = parse(periodQuery, req.query);
  const r = await buildDatevExport({ from: q.from, to: q.to, includePayments: q.payments });
  res.json({
    fileName: r.fileName,
    counts: r.counts,
    warnings: r.warnings,
    total: r.rows.length,
    rows: r.rows.slice(0, 200).map((x) => ({
      amount: datevAmount(x.amountCents),
      side: x.side,
      currency: x.currency ?? 'EUR',
      account: x.account,
      contraAccount: x.contraAccount,
      buKey: x.buKey ?? '',
      date: x.date,
      beleg1: x.beleg1,
      text: x.text,
    })),
  });
});

adminAccountingRouter.get('/datev/export', async (req, res) => {
  const q = parse(periodQuery, req.query);
  const r = await buildDatevExport({ from: q.from, to: q.to, includePayments: q.payments });
  await audit(req, 'DATEV_EXPORT', undefined, { from: q.from, to: q.to, rows: r.rows.length, pdfs: !!q.pdfs, ...r.counts });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Datev-Warnings', String(r.warnings.length));
  if (!q.pdfs) {
    res.setHeader('Content-Type', 'text/csv; charset=windows-1252');
    res.setHeader('Content-Disposition', `attachment; filename="${r.fileName}"`);
    res.send(r.file);
    return;
  }
  const zip = await datevZip(r, {
    company: async (id) => {
      const inv = await prisma.invoice.findUnique({ where: { id }, include: { company: true } });
      if (!inv) throw notFound('INVOICE_NOT_FOUND');
      return { name: companyPdfName(inv), pdf: await renderCompanyPdf(inv) };
    },
    client: async (id) => {
      const inv = await prisma.clientInvoice.findUnique({ where: { id } });
      if (!inv) throw notFound('INVOICE_NOT_FOUND');
      return { name: clientPdfName(inv), pdf: await renderClientPdf(inv) };
    },
  });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${r.fileName.replace(/\.csv$/, '')}.zip"`);
  res.send(zip);
});
