import { rgb, type PDFPage } from 'pdf-lib';
import { A4, BAND, BRAND, Flow, INK, LINE, MUTED, createDoc, fit, wrap, type Fonts } from '../cv/pdfKit.js';
import type { Letterhead } from '../docCreate/pdf.js';
import { PANEL_TEXTS } from '../employerWorkers/texts.js';
import { STAGE_TEXT } from '../requests/workers.js';
import type { ReportStats } from './stats.js';
import { REPORT_TEXTS, fmtDay } from './texts.js';

/**
 * Monthly employer report as an A4 PDF (DejaVu Sans, so Azerbaijani names like "Ə" render): brand band and
 * letterhead like the other documents, the month at a glance (KPI boxes), the workers table, dates of the
 * next 60 days, risks with recommended actions, check-in response rates and the employer's open items;
 * footer with the letterhead contact lines, a confidentiality note and page numbers.
 */

const M = 48;
const W = A4[0];
const RIGHT = W - M;
const TOP = A4[1] - 118;
const BOTTOM = 86;
const RED = rgb(0.72, 0.11, 0.11);
const AMBER = rgb(0.7, 0.42, 0.02);
const GREEN = rgb(0.02, 0.47, 0.34);

export const buildEmployerReportPdf = async (stats: ReportStats, letterhead: Letterhead) => {
  const T = REPORT_TEXTS[stats.lang];
  const P = PANEL_TEXTS[stats.lang];
  const { pdf, fonts } = await createDoc({ title: `${T.docTitle(stats.month)} · ${stats.company.name}`, author: letterhead.name, subject: T.subheading, lang: stats.lang });

  const header = (page: PDFPage, f: Fonts) => {
    page.drawRectangle({ x: 0, y: A4[1] - 8, width: W, height: 8, color: BRAND });
    page.drawText(fit(letterhead.name, f.bold, 15, 260), { x: M, y: A4[1] - 44, size: 15, font: f.bold, color: BRAND });
    letterhead.lines.slice(0, 2).forEach((l, i) => page.drawText(fit(l, f.regular, 7.5, 260), { x: M, y: A4[1] - 58 - i * 10, size: 7.5, font: f.regular, color: MUTED }));
    const h = T.heading;
    page.drawText(h, { x: RIGHT - f.bold.widthOfTextAtSize(h, 16), y: A4[1] - 44, size: 16, font: f.bold, color: INK });
    const ml = T.monthLabel(stats.month);
    page.drawText(ml, { x: RIGHT - f.regular.widthOfTextAtSize(ml, 10), y: A4[1] - 58, size: 10, font: f.regular, color: MUTED });
    const co = fit(`${T.preparedFor}: ${stats.company.name}`, f.bold, 9, 300);
    page.drawText(co, { x: RIGHT - f.bold.widthOfTextAtSize(co, 9), y: A4[1] - 72, size: 9, font: f.bold, color: INK });
    page.drawLine({ start: { x: M, y: A4[1] - 92 }, end: { x: RIGHT, y: A4[1] - 92 }, thickness: 0.6, color: LINE });
  };

  const flow = new Flow(pdf, fonts, { top: TOP, bottom: BOTTOM, onNewPage: (p) => header(p, fonts) });

  const h2 = (text: string) => {
    flow.need(40);
    flow.gap(8);
    flow.draw(text, M, { size: 12, bold: true, color: BRAND });
    flow.gap(6);
    flow.rule(M, RIGHT, LINE, 0.6);
    flow.gap(13);
  };
  const muted = (text: string) => flow.para(text, M, RIGHT - M, { size: 9, color: MUTED });

  // ── Intro line ──
  flow.draw(T.subheading, M, { size: 10, color: MUTED });
  flow.gap(13);
  flow.draw(`${T.period}: ${fmtDay(stats.lang, stats.period.from)} – ${fmtDay(stats.lang, stats.period.to)}   ·   ${T.generated}: ${fmtDay(stats.lang, stats.generatedAt)}`, M, { size: 8.5, color: MUTED });
  flow.gap(10);

  // ── Month at a glance ──
  h2(T.summary);
  const kpis: [string, number][] = [
    [T.kpi.newPlacements, stats.period.newPlacements],
    [T.kpi.approvals, stats.period.approvals],
    [T.kpi.arrivals, stats.period.arrivals],
    [T.kpi.departures, stats.period.departures],
  ];
  const boxW = (RIGHT - M - 3 * 10) / 4;
  flow.need(62);
  const boxTop = flow.y + 8;
  kpis.forEach(([label, value], i) => {
    const x = M + i * (boxW + 10);
    flow.page.drawRectangle({ x, y: boxTop - 54, width: boxW, height: 54, color: BAND });
    const v = String(value);
    flow.page.drawText(v, { x: x + 10, y: boxTop - 28, size: 20, font: fonts.bold, color: INK });
    flow.page.drawText(fit(label, fonts.regular, 8, boxW - 20), { x: x + 10, y: boxTop - 44, size: 8, font: fonts.regular, color: MUTED });
  });
  flow.y = boxTop - 54 - 18;
  const phaseLine = (['IN_PROCESS', 'TRAVELLING', 'WORKING', 'LEFT'] as const).map((p) => `${P.phase[p]}: ${stats.phases[p]}`).join('   ·   ');
  flow.para(`${T.phases}: ${phaseLine}`, M, RIGHT - M, { size: 9 });

  // ── Workers table ──
  h2(T.workers);
  if (!stats.workers.length) muted(T.noWorkers);
  else {
    const cols = [
      { key: 'name', w: 74 },
      { key: 'position', w: 88 },
      { key: 'status', w: 100 },
      { key: 'arrival', w: 54 },
      { key: 'title', w: 70 },
      { key: 'probation', w: 62 },
      { key: 'risk', w: 51 },
    ] as const;
    const head = () => {
      flow.need(30);
      flow.page.drawRectangle({ x: M, y: flow.y - 4, width: RIGHT - M, height: 15, color: BAND });
      let x = M + 3;
      for (const c of cols) {
        flow.draw(fit(T.cols[c.key], fonts.bold, 7.5, c.w - 4), x, { size: 7.5, bold: true, color: MUTED });
        x += c.w;
      }
      flow.gap(16);
    };
    head();
    for (const w of stats.workers) {
      if (flow.y - 14 < BOTTOM) {
        flow.newPage();
        head();
      }
      const status = w.phase === 'IN_PROCESS' ? STAGE_TEXT[stats.lang][w.stage] : P.phase[w.phase];
      const cells: { text: string; color?: typeof INK; bold?: boolean }[] = [
        { text: w.name, bold: true },
        { text: w.position },
        { text: status },
        { text: w.arrival ? fmtDay(stats.lang, w.arrival) : '—' },
        { text: w.title ? fmtDay(stats.lang, w.title.until) : '—', color: w.title?.warn === 'CRITICAL' || w.title?.warn === 'EXPIRED' ? RED : w.title?.warn === 'WARN' ? AMBER : undefined },
        { text: w.probationEnd ? fmtDay(stats.lang, w.probationEnd) : '—', color: w.probationWarn === 'WARN' ? AMBER : undefined },
        { text: w.risk ? P.risk[w.risk] : '—', color: w.risk === 'HIGH' ? RED : w.risk === 'MEDIUM' ? AMBER : w.risk === 'LOW' ? GREEN : undefined },
      ];
      let x = M + 3;
      cols.forEach((c, i) => {
        const cell = cells[i];
        const font = cell.bold ? fonts.bold : fonts.regular;
        flow.draw(fit(cell.text, font, 8, c.w - 5), x, { size: 8, bold: cell.bold, color: cell.color ?? INK });
        x += c.w;
      });
      flow.gap(5);
      flow.rule(M, RIGHT, LINE, 0.3);
      flow.gap(9);
    }
  }

  // ── Upcoming 60 days ──
  h2(T.upcoming);
  if (!stats.upcoming.length) muted(T.noUpcoming);
  for (const u of stats.upcoming) {
    flow.need(14);
    flow.draw(fmtDay(stats.lang, u.at), M, { size: 9, bold: true });
    flow.draw(fit(`${T.upcomingCode[u.code]} — ${u.name}`, fonts.regular, 9, RIGHT - M - 80), M + 80, { size: 9 });
    flow.gap(13);
  }

  // ── Risks and recommendations ──
  h2(T.risks);
  if (!stats.risks.length) muted(T.noRisks);
  for (const r of stats.risks) {
    flow.need(28);
    flow.draw(r.name, M, { size: 9.5, bold: true });
    const lvl = `${T.riskLevel}: ${P.risk[r.level]}`;
    flow.draw(lvl, RIGHT - fonts.bold.widthOfTextAtSize(lvl, 9), { size: 9, bold: true, color: r.level === 'HIGH' ? RED : AMBER });
    flow.gap(12);
    for (const reason of r.reasons) flow.bullet(P.riskReason(reason.code, reason.params), M + 6, RIGHT - M - 6, { size: 8.5, color: INK });
    flow.gap(4);
  }
  flow.gap(4);
  flow.need(30);
  flow.draw(T.recommended, M, { size: 10, bold: true });
  flow.gap(14);
  if (!stats.actions.length) muted(T.noActions);
  for (const a of stats.actions) flow.bullet(`${a.name}: ${P.action[a.action]}`, M + 6, RIGHT - M - 6, { size: 9 });

  // ── Check-in response rates ──
  h2(T.checkIns);
  for (const [label, v] of [
    [T.checkInEmployer, stats.checkIns.employer],
    [T.checkInWorker, stats.checkIns.worker],
  ] as const) {
    flow.need(22);
    flow.draw(label, M, { size: 9 });
    flow.draw(T.answered(v.answered, v.sent, v.rate), M + 190, { size: 9, bold: true });
    // Small bar.
    const barX = M + 400;
    const barW = RIGHT - barX;
    flow.page.drawRectangle({ x: barX, y: flow.y - 1, width: barW, height: 7, color: BAND });
    if (v.rate) flow.page.drawRectangle({ x: barX, y: flow.y - 1, width: (barW * v.rate) / 100, height: 7, color: v.rate >= 60 ? GREEN : AMBER });
    flow.gap(16);
  }

  // ── Open items ──
  h2(T.openItems);
  if (!stats.openItems.length) muted(T.noOpenItems);
  for (const o of stats.openItems) flow.bullet(`${o.name} — ${T.openKind[o.kind] ?? o.kind}: ${o.title}`, M + 6, RIGHT - M - 6, { size: 9 });

  flow.gap(14);
  flow.need(40);
  flow.para(T.portal, M, RIGHT - M, { size: 8.5, color: MUTED });
  flow.para(T.contact, M, RIGHT - M, { size: 8.5, color: MUTED });

  // ── Footer on every page ──
  const pages = flow.pages;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 62 }, end: { x: RIGHT, y: 62 }, thickness: 0.5, color: LINE });
    const contact = [letterhead.name, ...letterhead.lines, ...letterhead.contact].filter(Boolean).join(' · ');
    wrap(contact, fonts.regular, 7, RIGHT - M - 90)
      .slice(0, 2)
      .forEach((l, j) => p.drawText(l, { x: M, y: 50 - j * 9, size: 7, font: fonts.regular, color: MUTED }));
    p.drawText(fit(T.confidential, fonts.regular, 6.5, RIGHT - M - 90), { x: M, y: 28, size: 6.5, font: fonts.regular, color: MUTED });
    const num = `${T.page} ${i + 1} ${T.of} ${pages.length}`;
    p.drawText(num, { x: RIGHT - fonts.regular.widthOfTextAtSize(num, 7.5), y: 28, size: 7.5, font: fonts.regular, color: MUTED });
  });

  return Buffer.from(await pdf.save());
};
