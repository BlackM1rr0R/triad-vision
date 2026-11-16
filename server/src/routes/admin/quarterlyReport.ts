import { Router } from 'express';
import { z } from 'zod';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { getBrand } from '../../lib/brand/index.js';
import { isValidQuarter, lastCompletedQuarter } from '../../lib/quarterlyReport/aggregate.js';
import { buildQuarterlyReportPdf } from '../../lib/quarterlyReport/pdf.js';
import { getReport, introOf, saveIntro, setPublished, snapshotOf, statsFor } from '../../lib/quarterlyReport/service.js';
import { QR_TEXTS, REPORT_LANGS, bucketLabel, reportLang } from '../../lib/quarterlyReport/texts.js';
import { prisma } from '../../db.js';

/**
 * Quarterly labour mobility report — staff side (/api/admin/quarterly-report; the admin router requires STAFF):
 *   GET  /                          known reports (intro / publish state) + the default quarter
 *   GET  /:year/:quarter            aggregates (k ≥ 3; live, or the frozen snapshot when published) + intro + labels (?lng=)
 *   PUT  /:year/:quarter/intro      { intro: { az?, en?, de? } }                                           ADMIN+
 *   POST /:year/:quarter/publish    { published: boolean } — publishing freezes the aggregates             ADMIN+
 *   GET  /:year/:quarter/pdf?lng=   PDF download (az | en | de)
 */
export const adminQuarterlyReportRouter = Router();

const quarterOf = (p: { year?: unknown; quarter?: unknown }) => {
  const year = Number(p.year);
  const quarter = Number(String(p.quarter ?? '').replace(/^q/i, ''));
  if (!isValidQuarter(year, quarter)) throw badRequest('INVALID_QUARTER');
  return { year, quarter };
};

const reportView = (r: { year: number; quarter: number; published: boolean; publishedAt: Date | null; updatedAt: Date; intro: unknown; snapshot: unknown }) => ({
  year: r.year,
  quarter: r.quarter,
  published: r.published,
  publishedAt: r.publishedAt,
  updatedAt: r.updatedAt,
  intro: introOf(r as never),
  approved: snapshotOf(r as never)?.approved ?? null,
});

adminQuarterlyReportRouter.get('/', async (_req, res) => {
  const rows = await prisma.quarterlyReport.findMany({ orderBy: [{ year: 'desc' }, { quarter: 'desc' }], take: 100 });
  res.json({ reports: rows.map(reportView), defaultQuarter: lastCompletedQuarter(), languages: REPORT_LANGS });
});

adminQuarterlyReportRouter.get('/:year/:quarter', async (req, res) => {
  const { year, quarter } = quarterOf(req.params);
  const lang = reportLang(req.query.lng);
  const report = await getReport(year, quarter);
  const stats = await statsFor(year, quarter, report);
  const labels: Record<string, Record<string, string>> = {};
  for (const [dim, b] of Object.entries(stats.breakdowns)) {
    labels[dim] = Object.fromEntries([...b.buckets, ...stats.previousBreakdowns[dim as keyof typeof stats.breakdowns].buckets].map((x) => [x.key, bucketLabel(lang, dim, x.key)]));
  }
  const T = QR_TEXTS[lang];
  res.json({
    stats,
    labels,
    stageLabels: T.stages,
    title: T.title(quarter, year),
    defaultIntro: Object.fromEntries(REPORT_LANGS.map((l) => [l, QR_TEXTS[l].defaultIntro(quarter, year)])),
    report: report ? reportView(report) : { year, quarter, published: false, publishedAt: null, updatedAt: null, intro: {}, approved: null },
  });
});

const introBody = z.object({
  intro: z.object({ az: z.string().max(6000).optional(), en: z.string().max(6000).optional(), de: z.string().max(6000).optional() }),
});

adminQuarterlyReportRouter.put('/:year/:quarter/intro', requireMinRole('ADMIN'), async (req, res) => {
  const { year, quarter } = quarterOf(req.params);
  const { intro } = parse(introBody, req.body);
  const clean = Object.fromEntries(Object.entries(intro).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v));
  const row = await saveIntro(year, quarter, clean, req.user!.id);
  await audit(req, 'QUARTERLY_REPORT_INTRO_SAVED', `quarterly-report:${year}-Q${quarter}`, { languages: Object.keys(clean) });
  res.json({ report: reportView(row) });
});

adminQuarterlyReportRouter.post('/:year/:quarter/publish', requireMinRole('ADMIN'), async (req, res) => {
  const { year, quarter } = quarterOf(req.params);
  const { published } = parse(z.object({ published: z.boolean() }), req.body);
  const row = await setPublished(year, quarter, published, req.user!.id);
  await audit(req, published ? 'QUARTERLY_REPORT_PUBLISHED' : 'QUARTERLY_REPORT_UNPUBLISHED', `quarterly-report:${year}-Q${quarter}`);
  res.json({ report: reportView(row) });
});

adminQuarterlyReportRouter.get('/:year/:quarter/pdf', async (req, res) => {
  const { year, quarter } = quarterOf(req.params);
  const lang = reportLang(req.query.lng);
  const report = await getReport(year, quarter);
  const stats = await statsFor(year, quarter, report);
  const brand = await getBrand();
  const buf = await buildQuarterlyReportPdf(stats, lang, introOf(report)[lang], { name: brand.name, domain: brand.domain, phone: brand.phone });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="triad-vision-report-${year}-Q${quarter}-${lang}.pdf"`);
  res.send(buf);
});
