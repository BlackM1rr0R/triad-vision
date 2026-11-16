import { Router } from 'express';
import { limiter, notFound } from '../lib/http.js';
import { config } from '../config.js';
import { getBrand } from '../lib/brand/index.js';
import { isValidQuarter } from '../lib/quarterlyReport/aggregate.js';
import { buildQuarterlyReportPdf } from '../lib/quarterlyReport/pdf.js';
import { getReport, introOf, listPublished, snapshotOf } from '../lib/quarterlyReport/service.js';
import { QR_TEXTS, REPORT_LANGS, reportLang } from '../lib/quarterlyReport/texts.js';

/**
 * Published quarterly labour mobility reports (public, /api/reports):
 *   GET /                         published reports (newest first): quarter, title per language, headline figure (k ≥ 3)
 *   GET /:year/:quarter.pdf?lng=  the PDF of a published report from its frozen snapshot (cached in-process)
 */
export const quarterlyReportsRouter = Router();

const publicLimiter = limiter({ windowMs: 60 * 1000, limit: 60, skip: () => config.isTest });

quarterlyReportsRouter.get('/', publicLimiter, async (_req, res) => {
  const rows = await listPublished();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    items: rows.map((r) => ({
      year: r.year,
      quarter: r.quarter,
      publishedAt: r.publishedAt,
      title: Object.fromEntries(REPORT_LANGS.map((l) => [l, QR_TEXTS[l].title(r.quarter, r.year)])),
      approved: snapshotOf(r as never)?.approved ?? null,
      languages: REPORT_LANGS,
    })),
  });
});

const pdfCache = new Map<string, Buffer>();
const MAX_CACHED = 40;

quarterlyReportsRouter.get('/:year/:file', publicLimiter, async (req, res) => {
  const m = /^q?([1-4])\.pdf$/i.exec(String(req.params.file));
  const year = Number(req.params.year);
  if (!m || !isValidQuarter(year, Number(m[1]))) throw notFound('REPORT_NOT_FOUND');
  const quarter = Number(m[1]);
  const lang = reportLang(req.query.lng);
  const report = await getReport(year, quarter);
  const stats = report?.published ? snapshotOf(report) : null;
  if (!report || !stats) throw notFound('REPORT_NOT_FOUND');
  const key = `${year}-${quarter}-${lang}-${report.publishedAt?.getTime() ?? 0}-${report.updatedAt.getTime()}`;
  let buf = pdfCache.get(key);
  if (!buf) {
    const brand = await getBrand();
    buf = await buildQuarterlyReportPdf(stats, lang, introOf(report)[lang], { name: brand.name, domain: brand.domain, phone: brand.phone });
    if (pdfCache.size >= MAX_CACHED) pdfCache.delete(pdfCache.keys().next().value!);
    pdfCache.set(key, buf);
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Disposition', `inline; filename="triad-vision-report-${year}-Q${quarter}-${lang}.pdf"`);
  res.send(buf);
});
