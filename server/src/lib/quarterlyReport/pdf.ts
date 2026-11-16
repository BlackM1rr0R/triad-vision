import { rgb, type PDFPage } from 'pdf-lib';
import { A4, BAND, BRAND, Flow, INK, LINE, MUTED, createDoc, fit, numberPages, type Fonts } from '../cv/pdfKit.js';
import { DIMENSIONS, STAGES, type Breakdown, type Dimension, type QuarterStats } from './aggregate.js';
import { QR_TEXTS, bucketLabel, fmtDate, fmtNum, type ReportLang } from './texts.js';

/**
 * The quarterly labour mobility report as an A4 PDF (pdf-lib + DejaVu Sans via lib/cv/pdfKit, so "Ə", "ü" render):
 * cover with the key figures and the quarter-over-quarter bar, the editable introduction, horizontal bar charts per
 * breakdown (current quarter, previous quarter as a thin grey bar), processing times per stage and the methodology
 * with the k-anonymity note. Charts are drawn with rectangles and lines only. Input is already k-anonymous.
 */

const M = 50;
const W = A4[0];
const RIGHT = W - M;
const TOP = A4[1] - 90;
const BOTTOM = 70;
const ACCENT = rgb(0.85, 0.55, 0.1);
const GREY = rgb(0.72, 0.75, 0.8);
const GREEN = rgb(0.02, 0.47, 0.34);
const RED = rgb(0.72, 0.11, 0.11);

export interface PdfBrand {
  name: string;
  domain: string;
  phone: string;
}

const DIM_TITLE: Record<Dimension, 'byProfession' | 'byVisaType' | 'byState' | 'byLevel'> = {
  profession: 'byProfession',
  visaType: 'byVisaType',
  state: 'byState',
  germanLevel: 'byLevel',
};

export const buildQuarterlyReportPdf = async (stats: QuarterStats, lang: ReportLang, intro: string | null | undefined, brand: PdfBrand) => {
  const T = QR_TEXTS[lang];
  const title = T.title(stats.quarter, stats.year);
  const { pdf, fonts } = await createDoc({ title, author: brand.name, subject: T.subtitle, lang });
  pdf.setCreator('Triad Vision quarterly report');

  const header = (page: PDFPage, f: Fonts, index: number) => {
    page.drawRectangle({ x: 0, y: A4[1] - 10, width: W, height: 10, color: BRAND });
    if (index === 0) return;
    page.drawText(fit(brand.name, f.bold, 11, 200), { x: M, y: A4[1] - 40, size: 11, font: f.bold, color: BRAND });
    const q = fit(title, f.regular, 8.5, 300);
    page.drawText(q, { x: RIGHT - f.regular.widthOfTextAtSize(q, 8.5), y: A4[1] - 40, size: 8.5, font: f.regular, color: MUTED });
    page.drawLine({ start: { x: M, y: A4[1] - 52 }, end: { x: RIGHT, y: A4[1] - 52 }, thickness: 0.6, color: LINE });
  };
  const flow = new Flow(pdf, fonts, { top: TOP, bottom: BOTTOM, onNewPage: (p, i) => header(p, fonts, i) });

  const h2 = (text: string) => {
    flow.need(60);
    flow.gap(10);
    flow.draw(text, M, { size: 13, bold: true, color: BRAND });
    flow.gap(7);
    flow.rule(M, RIGHT, LINE, 0.6);
    flow.gap(15);
  };
  const muted = (text: string) => flow.para(text, M, RIGHT - M, { size: 8.5, color: MUTED });

  // ── Cover ──
  flow.y = A4[1] - 70;
  flow.draw(brand.name, M, { size: 13, bold: true, color: BRAND });
  flow.gap(46);
  flow.para(title, M, RIGHT - M, { size: 22, bold: true, leading: 28 });
  flow.gap(4);
  flow.para(T.subtitle, M, RIGHT - M, { size: 11, color: MUTED });
  flow.gap(6);
  const lastDay = new Date(new Date(stats.to).getTime() - 24 * 60 * 60 * 1000);
  flow.draw(`${T.period}: ${fmtDate(stats.from)} – ${fmtDate(lastDay)}   ·   ${T.dataAsOf}: ${fmtDate(stats.generatedAt)}`, M, { size: 9, color: MUTED });
  flow.gap(26);

  // Key figure boxes.
  const fmtCount = (n: number | null) => (n === null ? T.fewer : String(n));
  const change = stats.trend ? `${stats.trend.delta > 0 ? '+' : ''}${stats.trend.delta}${stats.trend.percent !== null ? ` (${stats.trend.percent > 0 ? '+' : ''}${fmtNum(lang, stats.trend.percent)} %)` : ''}` : '—';
  const boxes: [string, string][] = [
    [T.approved, fmtCount(stats.approved)],
    [`${T.previousQuarter} (${T.quarterLabel(stats.previous.quarter, stats.previous.year)})`, fmtCount(stats.previous.approved)],
    [T.change, change],
  ];
  const boxW = (RIGHT - M - 2 * 12) / 3;
  const boxTop = flow.y + 8;
  boxes.forEach(([label, value], i) => {
    const x = M + i * (boxW + 12);
    flow.page.drawRectangle({ x, y: boxTop - 62, width: boxW, height: 62, color: BAND });
    const size = value.length > 10 ? 13 : 22;
    const color = i === 2 && stats.trend ? (stats.trend.delta >= 0 ? GREEN : RED) : INK;
    flow.page.drawText(fit(value, fonts.bold, size, boxW - 20), { x: x + 10, y: boxTop - 32, size, font: fonts.bold, color });
    flow.page.drawText(fit(label, fonts.regular, 8, boxW - 20), { x: x + 10, y: boxTop - 50, size: 8, font: fonts.regular, color: MUTED });
  });
  flow.y = boxTop - 62 - 24;

  // Quarter-over-quarter comparison bar.
  flow.draw(T.comparison, M, { size: 10, bold: true });
  flow.gap(14);
  if (stats.approved !== null && stats.previous.approved !== null) {
    const max = Math.max(stats.approved, stats.previous.approved, 1);
    const labelW = 150;
    const barW = RIGHT - M - labelW - 40;
    const rows: [string, number, typeof BRAND][] = [
      [T.quarterLabel(stats.previous.quarter, stats.previous.year), stats.previous.approved, GREY],
      [`${T.quarterLabel(stats.quarter, stats.year)} · ${T.thisQuarter}`, stats.approved, BRAND],
    ];
    for (const [label, n, color] of rows) {
      flow.need(20);
      flow.draw(fit(label, fonts.regular, 9, labelW - 8), M, { size: 9 });
      const w = Math.max(2, (n / max) * barW);
      flow.page.drawRectangle({ x: M + labelW, y: flow.y - 3, width: w, height: 13, color });
      flow.draw(String(n), M + labelW + w + 6, { size: 9, bold: true });
      flow.gap(20);
    }
  } else {
    muted(T.noTrend);
  }

  // Introduction.
  h2(T.intro);
  const text = intro?.trim() || T.defaultIntro(stats.quarter, stats.year);
  for (const p of text.split(/\n\s*\n/)) {
    flow.para(p.trim(), M, RIGHT - M, { size: 10.5, leading: 15 });
    flow.gap(6);
  }

  // ── Breakdowns ──
  const chart = (dim: Dimension, current: Breakdown, previous: Breakdown) => {
    h2(T[DIM_TITLE[dim]]);
    if (!current.buckets.length) {
      muted(stats.approved === null ? T.noData : T.suppressedNote);
      return;
    }
    const prevBy = new Map(previous.buckets.map((b) => [b.key, b.count]));
    const max = Math.max(1, ...current.buckets.map((b) => b.count), ...previous.buckets.map((b) => b.count));
    const labelW = 170;
    const barW = RIGHT - M - labelW - 40;
    for (const b of current.buckets) {
      flow.need(24);
      flow.draw(fit(bucketLabel(lang, dim, b.key), fonts.regular, 9, labelW - 8), M, { size: 9 });
      const w = Math.max(2, (b.count / max) * barW);
      flow.page.drawRectangle({ x: M + labelW, y: flow.y - 2, width: w, height: 11, color: b.key === 'other' ? ACCENT : BRAND });
      flow.draw(String(b.count), M + labelW + w + 6, { size: 9, bold: true });
      const prev = prevBy.get(b.key);
      if (prev !== undefined) {
        const pw = Math.max(2, (prev / max) * barW);
        flow.page.drawRectangle({ x: M + labelW, y: flow.y - 7, width: pw, height: 3, color: GREY });
      }
      flow.gap(19);
    }
    if (current.suppressed) muted(T.suppressedNote);
    if (previous.buckets.length) muted(`▬ ${T.previousQuarter} (${T.quarterLabel(stats.previous.quarter, stats.previous.year)})`);
    if (dim === 'germanLevel') muted(T.levelNote);
    if (dim === 'state') muted(T.stateNote);
  };
  for (const d of DIMENSIONS) chart(d, stats.breakdowns[d], stats.previousBreakdowns[d]);

  // ── Processing times ──
  h2(T.processing);
  const shown = STAGES.filter((s) => stats.stages[s]);
  if (!shown.length) muted(T.noData);
  else {
    const cols = [M, M + 200, M + 270, M + 340, M + 400];
    flow.draw(T.stage, cols[0]!, { size: 8.5, bold: true, color: MUTED });
    flow.draw(T.mean, cols[1]!, { size: 8.5, bold: true, color: MUTED });
    flow.draw(T.median, cols[2]!, { size: 8.5, bold: true, color: MUTED });
    flow.draw(T.cases, cols[3]!, { size: 8.5, bold: true, color: MUTED });
    flow.draw(T.previousQuarter, cols[4]!, { size: 8.5, bold: true, color: MUTED });
    flow.gap(6);
    flow.rule(M, RIGHT);
    flow.gap(13);
    const maxMed = Math.max(1, ...shown.map((s) => stats.stages[s]!.median));
    for (const s of shown) {
      const st = stats.stages[s]!;
      const prev = stats.previousStages[s];
      flow.need(30);
      flow.draw(fit(T.stages[s] ?? s, fonts.regular, 9, 195), cols[0]!, { size: 9, bold: s === 'total' });
      flow.draw(fmtNum(lang, st.mean), cols[1]!, { size: 9 });
      flow.draw(fmtNum(lang, st.median), cols[2]!, { size: 9, bold: true });
      flow.draw(String(st.n), cols[3]!, { size: 9 });
      flow.draw(prev ? `${fmtNum(lang, prev.median)} (${T.median.toLowerCase()})` : '—', cols[4]!, { size: 9, color: MUTED });
      flow.gap(7);
      flow.page.drawRectangle({ x: cols[0]!, y: flow.y - 1, width: Math.max(2, (st.median / maxMed) * (RIGHT - M)), height: 4, color: s === 'total' ? ACCENT : BRAND });
      flow.gap(14);
    }
  }
  muted(T.processingNote);

  // ── Methodology ──
  h2(T.methodology);
  for (const p of T.methodologyText) flow.bullet(p, M, RIGHT - M, { size: 9 });

  // Footer on every page.
  const footer = `${brand.name} · ${brand.domain} · ${T.contact}: ${brand.phone}`;
  for (const p of flow.pages) p.drawText(fit(footer, fonts.regular, 8, 360), { x: M, y: 24, size: 8, font: fonts.regular, color: MUTED });
  numberPages(flow.pages, fonts, T.page, RIGHT, T.of);
  return Buffer.from(await pdf.save());
};
