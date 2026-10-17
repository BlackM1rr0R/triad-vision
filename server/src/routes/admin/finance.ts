import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { PeriodError, resolvePeriod } from '../../lib/finance/period.js';
import {
  byTypeReport,
  commissionsReport,
  financeWorkbook,
  monthlyReport,
  receivablesReport,
  staffReport,
  summaryReport,
} from '../../lib/finance/report.js';

/**
 * Admin: financial reports — mounted at /api/admin/finance. ADMIN and above only (revenue figures
 * and per-employee results). Every endpoint takes `from` / `to` (YYYY-MM-DD, UTC days, default:
 * the current calendar year); monthly figures are always grouped by UTC calendar month.
 */
export const adminFinanceRouter = Router();
adminFinanceRouter.use(requireMinRole('ADMIN'));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query = z.object({ from: day.optional(), to: day.optional(), groupBy: z.enum(['month']).optional() });

const period = (req: Request) => {
  const q = parse(query, req.query);
  try {
    return resolvePeriod(q);
  } catch (err) {
    if (err instanceof PeriodError) throw badRequest(err.code);
    throw err;
  }
};

const range = (p: ReturnType<typeof resolvePeriod>) => ({ from: p.from, to: p.to });

adminFinanceRouter.get('/summary', async (req, res) => {
  const p = period(req);
  res.json({ range: range(p), summary: await summaryReport(p) });
});

adminFinanceRouter.get('/monthly', async (req, res) => {
  const p = period(req);
  res.json({ range: { ...range(p), groupBy: 'month' }, months: await monthlyReport(p) });
});

adminFinanceRouter.get('/receivables', async (req, res) => {
  const p = period(req);
  res.json({ range: range(p), ...(await receivablesReport(p)) });
});

adminFinanceRouter.get('/commissions', async (req, res) => {
  const p = period(req);
  res.json({ range: range(p), ...(await commissionsReport(p)) });
});

adminFinanceRouter.get('/staff', async (req, res) => {
  const p = period(req);
  res.json({ range: range(p), staff: await staffReport(p) });
});

adminFinanceRouter.get('/by-type', async (req, res) => {
  const p = period(req);
  res.json({ range: range(p), ...(await byTypeReport(p)) });
});

adminFinanceRouter.get('/export.xlsx', async (req, res) => {
  const p = period(req);
  const { buffer, filename, rows } = await financeWorkbook(p);
  await audit(req, 'FINANCE_EXPORT', undefined, { from: p.from, to: p.to, ...rows });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});
