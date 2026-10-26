import { rgb } from 'pdf-lib';
import { config } from '../../config.js';
import { A4, BAND, BRAND, Flow, INK, LINE, MUTED, createDoc, fit, numberPages, wrap } from '../cv/pdfKit.js';
import type { Range } from './params.js';
import type { BudgetResponse } from './service.js';
import { shareQuery } from './service.js';
import { BUDGET_TEXTS, type BudgetLang } from './texts.js';

/**
 * First-month budget as an A4 PDF (DejaVu via the CV toolkit, so all four languages render): inputs,
 * net salary, costs until the first salary, monthly budget, how much money to bring and the disclaimer.
 * The literal "Triad Vision" is swapped for the instance brand by lib/brand/pdfPatch.ts.
 */

const M = 48;
const W = A4[0] - 2 * M;
const AMOUNT_X = A4[0] - M;
const ESTIMATE_BG = rgb(1, 0.96, 0.86);
const ESTIMATE_FG = rgb(0.55, 0.36, 0.02);

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = (n: number, cents = false) => `${(cents ? nf2 : nf0).format(n)} €`;
const range = (r: Range) => (r[0] === r[1] ? eur(r[0]) : `${eur(r[0])} – ${eur(r[1])}`);
const dateFmt = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

export const budgetShareUrl = (r: BudgetResponse, lang: BudgetLang) => `${new URL(config.clientUrl).origin}${lang === 'az' ? '' : `/${lang}`}/budget?${shareQuery(r)}`;

export const renderBudgetPdf = async (r: BudgetResponse, lang: BudgetLang): Promise<Uint8Array> => {
  const T = BUDGET_TEXTS[lang];
  const { pdf, fonts } = await createDoc({ title: `${T.title} — Triad Vision`, author: 'Triad Vision', subject: T.subtitle, lang });
  const flow = new Flow(pdf, fonts, { top: A4[1] - 64, bottom: 56 });
  const { regular, bold } = fonts;

  // Header
  const header = (page = flow.page) => {
    page.drawRectangle({ x: 0, y: A4[1] - 40, width: A4[0], height: 40, color: BRAND });
    page.drawText('TRIAD VISION', { x: M, y: A4[1] - 26, size: 12, font: bold, color: rgb(1, 1, 1) });
    const right = `${T.estimate} · ${T.asOf} ${dateFmt(r.checkedAt)}`;
    page.drawText(right, { x: AMOUNT_X - regular.widthOfTextAtSize(right, 9), y: A4[1] - 25, size: 9, font: regular, color: rgb(1, 1, 1) });
  };
  header();
  flow.opts.onNewPage = (p) => header(p);

  flow.gap(4);
  flow.para(T.title, M, W, { size: 18, bold: true, color: BRAND, leading: 22 });
  flow.para(T.subtitle, M, W, { size: 10, color: MUTED });
  flow.gap(6);

  const row = (label: string, value: string, o: { bold?: boolean; size?: number; color?: typeof INK; indent?: number } = {}) => {
    const size = o.size ?? 10;
    flow.need(size * 1.6);
    const font = o.bold ? bold : regular;
    const vw = font.widthOfTextAtSize(value, size);
    flow.page.drawText(fit(label, font, size, W - vw - 16 - (o.indent ?? 0)), { x: M + (o.indent ?? 0), y: flow.y, size, font, color: o.color ?? INK });
    flow.page.drawText(value, { x: AMOUNT_X - vw, y: flow.y, size, font, color: o.color ?? INK });
    flow.y -= size * 1.55;
  };
  const section = (title: string) => {
    flow.need(40);
    flow.gap(8);
    flow.page.drawRectangle({ x: M - 6, y: flow.y - 5, width: W + 12, height: 20, color: BAND });
    flow.page.drawText(title, { x: M, y: flow.y + 1, size: 11.5, font: bold, color: BRAND });
    flow.y -= 24;
  };
  const rule = () => {
    flow.y += 4;
    flow.rule(M, AMOUNT_X, LINE);
    flow.y -= 10;
  };
  const note = (text: string, color = MUTED) => {
    flow.gap(2);
    flow.para(text, M, W, { size: 8.5, color });
  };

  // Inputs
  const i = r.input;
  section(T.inputs);
  row(T.city, `${r.city.name}${r.city.kind === 'GENERIC' ? ` (${i.state})` : r.city.state ? ` (${r.city.state})` : ''}`);
  row(T.gross, eur(i.gross));
  row(T.taxClass, `${['I', '', 'III', 'IV'][i.taxClass - 1]} · ${T.church}: ${i.church ? T.yes : T.no}`);
  row(T.household, `${T.households[i.household]}${r.children ? ` · ${T.children}: ${r.children}` : ''}`);
  row(T.housing, `${T.housings[i.housingUsed]}${i.housingUsed === 'company' && i.companyRent != null ? ` (${eur(i.companyRent)})` : ''}`);
  row(`${T.arrival} / ${T.start}`, `${dateFmt(r.timeline.arrival)} / ${dateFmt(r.timeline.start)}`);
  row(T.firstPay, dateFmt(r.timeline.firstPay), { bold: true });

  // Net salary
  const n = r.net;
  section(T.netTitle);
  row(T.gross, eur(n.gross, true));
  row(T.incomeTax, `− ${eur(n.incomeTax, true)}`, { indent: 8 });
  if (n.soli) row(T.soli, `− ${eur(n.soli, true)}`, { indent: 8 });
  if (n.churchTax) row(T.churchTax, `− ${eur(n.churchTax, true)}`, { indent: 8 });
  row(T.pension, `− ${eur(n.pension, true)}`, { indent: 8 });
  row(T.unemployment, `− ${eur(n.unemployment, true)}`, { indent: 8 });
  row(`${T.health} (${nf2.format(7.3 + (n.zusatzbeitrag * 100) / 2)} %)`, `− ${eur(n.health, true)}`, { indent: 8 });
  row(`${T.care} (${nf2.format(n.careRate * 100)} %)`, `− ${eur(n.care, true)}`, { indent: 8 });
  rule();
  row(T.net, eur(n.net, true), { bold: true, size: 11 });
  if (n.midijob) note(T.midijob);

  // One-off costs
  section(`${T.oneOffTitle} (${T.oneOffIntro}: ${nf0.format(r.timeline.daysUntilPay)} d)`);
  for (const l of r.oneOff.items) if (l.amount[1] > 0) row(T.oneOff[l.key], range(l.amount));
  rule();
  row(T.total, range(r.oneOff.total), { bold: true, size: 11 });

  // Monthly budget
  section(T.monthlyTitle);
  for (const l of r.monthly.items) row(T.monthly[l.key], range(l.amount));
  rule();
  row(T.costs, range(r.monthly.total), { bold: true });
  row(T.income, eur(r.monthly.income.total, true), { bold: true });
  if (r.monthly.income.kindergeld) row(T.kindergeld, eur(r.monthly.income.kindergeld), { indent: 8, color: MUTED });
  row(T.remaining, range(r.monthly.remaining), { bold: true, color: r.monthly.remaining[0] < 0 ? rgb(0.7, 0.1, 0.1) : INK });
  if (r.warnings.includes('MONTHLY_DEFICIT')) note(T.deficit, rgb(0.7, 0.1, 0.1));

  // Money to bring
  section(T.bringTitle);
  row(T.recommended, eur(r.bring.recommended), { bold: true, size: 13 });
  row(T.buffer, eur(r.bring.buffer), { indent: 8, color: MUTED });
  const b = r.bring.blockedAccount;
  flow.gap(2);
  if (b) {
    flow.para(T.blockedTitle, M, W, { size: 10, bold: true });
    flow.para(T.blockedText({ year: eur(b.year), monthly: eur(b.monthly, true), releases: b.releasesBeforePay, released: eur(b.releasedBeforePay), besides: eur(b.cashBesides) }), M, W, { size: 9.5 });
  } else note(T.noBlocked);

  // Disclaimer + source + link
  flow.gap(10);
  const lines = wrap(T.disclaimer, regular, 8.5, W - 16);
  const lead = 8.5 * 1.38;
  const boxH = lines.length * lead + 14;
  flow.need(boxH + 10);
  flow.page.drawRectangle({ x: M, y: flow.y - boxH + 12, width: W, height: boxH, color: ESTIMATE_BG });
  flow.y -= 2;
  for (const line of lines) {
    flow.page.drawText(line, { x: M + 8, y: flow.y, size: 8.5, font: regular, color: ESTIMATE_FG });
    flow.y -= lead;
  }
  flow.gap(10);
  if (r.city.sourceNote) note(`${T.source}: ${r.city.sourceNote} (${T.asOf} ${dateFmt(r.city.checkedAt)})`);
  note(`${T.link}: ${budgetShareUrl(r, lang)}`, BRAND);

  numberPages(flow.pages, fonts, T.page, AMOUNT_X, T.of);
  return pdf.save();
};
