import { degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { A4, createDoc, fit, wrap, type Fonts } from '../cv/pdfKit.js';
import { formatEur, formatInvoiceDate } from '../invoiceTexts.js';
import type { SellerInfo } from '../invoicePdf.js';
import { computeClientTotals, isPassThrough, lineTotal, type ClientLine } from './math.js';
import { DE_PDF, secondaryPdfLabels, type BillingLocale, type PdfLabels } from './texts.js';
import type { ClientBillingSettings } from './settings.js';

/**
 * Client invoice (Rechnung) and payment receipt (Zahlungsbestätigung) as A4 PDFs. German first, the client's
 * language as the small second line (English for German speakers), DejaVu Sans so Azerbaijani and Cyrillic
 * names render. §14 Abs. 4 UStG basics: seller and buyer name / address, Steuernummer or USt-IdNr., issue date,
 * sequential number, Leistungsdatum, quantities and descriptions, net, VAT rate and amount, gross; § 19 or the
 * exemption note; pass-through embassy fees shown separately without VAT.
 */

const NAVY = rgb(0.043, 0.122, 0.267);
const BRAND = rgb(0.082, 0.396, 0.91);
const GREY = rgb(0.36, 0.42, 0.53);
const LIGHT = rgb(0.93, 0.95, 0.98);
const RED = rgb(0.75, 0.1, 0.1);
const M = 50;
const W = A4[0];
const RIGHT = W - M;
const PLACEHOLDER = '[ fehlt / missing ]';

export interface ClientParty {
  name: string;
  address?: string | null;
  city?: string | null;
  email?: string | null;
  locale: BillingLocale;
}

export interface BankInfo {
  accountHolder: string;
  iban: string;
  bic: string;
  bank: string;
}

export interface ClientInvoicePdfInput {
  invoice: {
    number: string;
    status: string;
    issueDate: Date;
    dueDate: Date;
    items: ClientLine[];
    vatRate: number;
    netCents: number;
    vatCents: number;
    grossCents: number;
    paidCents: number;
    note: string | null;
  };
  client: ClientParty;
  seller: SellerInfo;
  bank: BankInfo;
  billing: Pick<ClientBillingSettings, 'vatMode' | 'exemptionNote' | 'footer'>;
}

const isoDay = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatInvoiceDate(new Date(`${s}T12:00:00Z`)) : '');

export const serviceDateLabel = (items: ClientLine[]) => {
  const p = items.find((l) => l.servicePeriod)?.servicePeriod;
  if (!p) return '';
  const from = isoDay(p.from);
  const to = isoDay(p.to);
  if (from && to) return from === to ? from : `${from} - ${to}`;
  return from || to;
};

const qtyFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** Small drawing helpers bound to one document. */
const painter = (fonts: Fonts) => {
  const text = (page: PDFPage, s: string, x: number, y: number, size = 9, f: PDFFont = fonts.regular, color = NAVY) => {
    const t = fit(s, f, size, RIGHT - x + 1);
    if (t) page.drawText(t, { x, y, size, font: f, color });
  };
  const textRight = (page: PDFPage, s: string, xRight: number, y: number, size = 9, f: PDFFont = fonts.regular, color = NAVY) => {
    const t = fit(s, f, size, xRight - M);
    if (t) page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y, size, font: f, color });
  };
  return { text, textRight };
};

const sellerFooter = (page: PDFPage, fonts: Fonts, seller: SellerInfo, bank: BankInfo, footerNote: string, pageNo: number, pageLabel: string) => {
  const { text, textRight } = painter(fonts);
  const y0 = 92;
  page.drawLine({ start: { x: M, y: y0 + 12 }, end: { x: RIGHT, y: y0 + 12 }, thickness: 0.5, color: GREY });
  const colW = (RIGHT - M) / 4;
  const cols: string[][] = [
    [seller.name || PLACEHOLDER, seller.street || PLACEHOLDER, seller.zipCity || PLACEHOLDER, seller.country],
    [seller.phone && `Tel. ${seller.phone}`, seller.email, seller.website, seller.managingDirector && `GF: ${seller.managingDirector}`].filter(Boolean) as string[],
    [bank.bank ? `Bank: ${bank.bank}` : 'Bank: -', `IBAN: ${bank.iban || PLACEHOLDER}`, `BIC: ${bank.bic || '-'}`, bank.accountHolder ? `Inhaber: ${bank.accountHolder}` : ''].filter(Boolean),
    [seller.vatId ? `USt-IdNr.: ${seller.vatId}` : '', seller.taxNumber ? `Steuernr.: ${seller.taxNumber}` : '', !seller.vatId && !seller.taxNumber ? `USt-IdNr.: ${PLACEHOLDER}` : '', seller.register].filter(Boolean),
  ];
  cols.forEach((lines, i) => {
    let y = y0;
    for (const l of lines.slice(0, 5)) {
      for (const w of wrap(l, fonts.regular, 6.6, colW - 6).slice(0, 2)) {
        page.drawText(w, { x: M + i * colW, y, size: 6.6, font: fonts.regular, color: GREY });
        y -= 9;
      }
    }
  });
  if (footerNote) wrap(footerNote, fonts.regular, 6.6, RIGHT - M).slice(0, 2).forEach((l, i) => text(page, l, M, 38 - i * 9, 6.6, fonts.regular, GREY));
  textRight(page, `${pageLabel} ${pageNo}`, RIGHT, 24, 6.6, fonts.regular, GREY);
};

/** Recipient block (DIN 5008 window) with the sender line above it; returns the y below it. */
const recipient = (page: PDFPage, fonts: Fonts, seller: SellerInfo, client: ClientParty) => {
  const { text } = painter(fonts);
  text(page, [seller.name || PLACEHOLDER, seller.street, seller.zipCity].filter(Boolean).join(' · '), M, 728, 7, fonts.regular, GREY);
  page.drawLine({ start: { x: M, y: 724 }, end: { x: M + 250, y: 724 }, thickness: 0.4, color: GREY });
  let y = 708;
  for (const l of wrap(client.name, fonts.bold, 10.5, 250).slice(0, 2)) {
    text(page, l, M, y, 10.5, fonts.bold);
    y -= 14;
  }
  const lines = (client.address ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const l of lines.slice(0, 4)) {
    text(page, l, M, y, 9.5);
    y -= 13;
  }
  if (client.city && !lines.some((l) => l.includes(client.city!))) {
    text(page, client.city, M, y, 9.5);
    y -= 13;
  }
  if (client.email) {
    text(page, client.email, M, y, 8.5, fonts.regular, GREY);
    y -= 12;
  }
  return y;
};

/** Right-hand meta block: German label, second-language label below, value right-aligned. */
const metaBlock = (page: PDFPage, fonts: Fonts, rows: [string, string, string][]) => {
  const { text, textRight } = painter(fonts);
  let my = 712;
  const mx = 340;
  for (const [de, other, v] of rows) {
    text(page, de, mx, my, 8.5, fonts.bold);
    text(page, other, mx, my - 8.5, 6.4, fonts.regular, GREY);
    textRight(page, v, RIGHT, my, 9);
    my -= 22;
  }
  return my;
};

export const buildClientInvoicePdf = async (input: ClientInvoicePdfInput) => {
  const { invoice, client, seller, bank, billing } = input;
  const L2 = secondaryPdfLabels(client.locale);
  const L = DE_PDF;
  const isDraft = invoice.status === 'DRAFT';
  const isCancelled = invoice.status === 'CANCELLED';
  const sign = isCancelled ? -1 : 1;
  const money = (c: number) => formatEur(sign * c);
  const { pdf, fonts } = await createDoc({ title: `${isCancelled ? 'Stornorechnung' : 'Rechnung'} ${invoice.number}`, author: seller.name || 'Triad Vision', lang: 'de' });
  const { text, textRight } = painter(fonts);

  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = pdf.addPage(A4);
    pages.push(p);
    if (isDraft || isCancelled) {
      p.drawText(isDraft ? 'ENTWURF' : 'STORNO', { x: 150, y: 260, size: 90, font: fonts.bold, color: isDraft ? GREY : RED, opacity: 0.1, rotate: degrees(35) });
    }
    return p;
  };

  let page = newPage();
  page.drawRectangle({ x: 0, y: A4[1] - 6, width: W, height: 6, color: BRAND });
  text(page, seller.name || 'Triad Vision', M, 790, 15, fonts.bold);
  textRight(page, isCancelled ? L.cancellation : L.invoice, RIGHT, 792, 17, fonts.bold, isCancelled ? RED : NAVY);
  textRight(page, isCancelled ? L2.cancellation : L2.invoice, RIGHT, 778, 8, fonts.regular, GREY);

  let y = recipient(page, fonts, seller, client);
  const service = serviceDateLabel(invoice.items);
  const taxRow: [string, string, string] = seller.vatId ? [L.vatId, L2.vatId, seller.vatId] : seller.taxNumber ? [L.taxNo, L2.taxNo, seller.taxNumber] : [L.vatId, L2.vatId, PLACEHOLDER];
  const my = metaBlock(page, fonts, [
    [L.invoiceNo, L2.invoiceNo, isDraft ? 'ENTWURF' : invoice.number],
    [L.invoiceDate, L2.invoiceDate, formatInvoiceDate(invoice.issueDate)],
    [L.serviceDate, L2.serviceDate, service || formatInvoiceDate(invoice.issueDate)],
    ...(!isCancelled ? ([[L.dueDate, L2.dueDate, formatInvoiceDate(invoice.dueDate)]] as [string, string, string][]) : []),
    taxRow,
  ]);

  y = Math.min(y, my) - 22;
  text(page, isCancelled ? L.cancelText(invoice.number, formatInvoiceDate(invoice.issueDate)) : L.intro, M, y, 9.5, fonts.bold, isCancelled ? RED : NAVY);
  y -= 12;
  text(page, isCancelled ? L2.cancelText(invoice.number, formatInvoiceDate(invoice.issueDate)) : L2.intro, M, y, 7.5, fonts.regular, GREY);
  y -= 20;

  // ── Items ──
  const col = { pos: M + 6, desc: M + 30, qty: 362, unit: 446, total: RIGHT - 6 };
  const descW = col.qty - 40 - col.desc;
  const header = (p: PDFPage, top: number) => {
    p.drawRectangle({ x: M, y: top - 20, width: RIGHT - M, height: 24, color: LIGHT });
    const heads: [string, string, number, boolean][] = [
      [L.pos, L2.pos, col.pos, false],
      [L.description, L2.description, col.desc, false],
      [L.qty, L2.qty, col.qty, true],
      [L.unitPrice, L2.unitPrice, col.unit, true],
      [L.amount, L2.amount, col.total, true],
    ];
    for (const [de, other, x, right] of heads) {
      if (right) {
        textRight(p, de, x, top - 6, 8, fonts.bold);
        textRight(p, other, x, top - 15, 6, fonts.regular, GREY);
      } else {
        text(p, de, x, top - 6, 8, fonts.bold);
        text(p, other, x, top - 15, 6, fonts.regular, GREY);
      }
    }
    return top - 34;
  };
  const BOTTOM = 135;
  y = header(page, y);
  invoice.items.forEach((l, i) => {
    const lines = wrap(l.description, fonts.regular, 9, descW);
    const cat = `${L.category[l.category]}${L2.category[l.category] !== L.category[l.category] ? ` / ${L2.category[l.category]}` : ''}`;
    const h = lines.length * 12 + 16;
    if (y - h < BOTTOM) {
      page = newPage();
      text(page, `${seller.name || 'Triad Vision'} · ${L.invoiceNo} ${isDraft ? 'ENTWURF' : invoice.number}`, M, 800, 8, fonts.regular, GREY);
      y = header(page, 780);
    }
    text(page, String(i + 1), col.pos, y, 9);
    lines.forEach((ln, k) => text(page, ln, col.desc, y - k * 12, 9));
    text(page, fit(cat, fonts.regular, 6.8, descW), col.desc, y - lines.length * 12 + 1, 6.8, fonts.regular, GREY);
    textRight(page, qtyFmt.format(l.quantity), col.qty, y, 9);
    textRight(page, money(l.unitPriceCents), col.unit, y, 9);
    textRight(page, money(lineTotal(l)), col.total, y, 9);
    y -= h;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: RIGHT, y: y + 8 }, thickness: 0.3, color: LIGHT });
  });

  // ── Totals ──
  const totals = computeClientTotals(invoice.items, invoice.vatRate);
  if (y - 140 < BOTTOM) {
    page = newPage();
    y = 780;
  }
  y -= 6;
  const tl = 320;
  const row = (de: string, other: string, v: string, strong = false) => {
    text(page, de, tl, y, strong ? 10 : 9, strong ? fonts.bold : fonts.regular);
    text(page, other, tl, y - 8, 6, fonts.regular, GREY);
    textRight(page, v, col.total, y, strong ? 11 : 9, strong ? fonts.bold : fonts.regular);
    y -= strong ? 22 : 19;
  };
  if (totals.passThroughCents) {
    row(L.net, L2.net, money(totals.taxableCents));
  } else row(L.net, L2.net, money(invoice.netCents));
  if (invoice.vatRate > 0) row(`${L.vat} ${invoice.vatRate} %`, `${L2.vat} ${invoice.vatRate} %`, money(invoice.vatCents));
  else row(`USt. 0 %`, `${L2.vat} 0 %`, money(0));
  if (totals.passThroughCents) row(L.passThrough, L2.passThrough, money(totals.passThroughCents));
  page.drawLine({ start: { x: tl, y: y + 6 }, end: { x: RIGHT, y: y + 6 }, thickness: 0.8, color: NAVY });
  y -= 10;
  row(isCancelled ? L.cancelledTotal : L.total, isCancelled ? L2.cancelledTotal : L2.total, money(invoice.grossCents), true);
  if (!isCancelled && !isDraft && invoice.paidCents > 0) {
    row(L.paid, L2.paid, formatEur(-invoice.paidCents));
    row(L.open, L2.open, formatEur(Math.max(0, invoice.grossCents - invoice.paidCents)), true);
  }

  // ── Notes ──
  y -= 6;
  const para = (s: string, size = 8.5, f: PDFFont = fonts.regular, color = NAVY) => {
    for (const ln of wrap(s, f, size, RIGHT - M)) {
      if (y < BOTTOM) {
        page = newPage();
        y = 780;
      }
      text(page, ln, M, y, size, f, color);
      y -= size + 3.5;
    }
    y -= 3;
  };
  if (invoice.vatRate === 0) {
    if (billing.vatMode === 'SMALL_BUSINESS') {
      para(L.smallBusiness);
      para(L2.smallBusiness, 6.8, fonts.regular, GREY);
    } else if (billing.exemptionNote) para(billing.exemptionNote);
  }
  if (totals.passThroughCents) {
    para(L.passThroughNote);
    para(L2.passThroughNote, 6.8, fonts.regular, GREY);
  }
  if (!service) {
    para(L.serviceDateIsInvoiceDate, 7.5, fonts.regular, GREY);
  }
  if (!isCancelled) {
    const ref = `${invoice.number}${client.name ? ` ${client.name}` : ''}`;
    para(`${L.terms(formatInvoiceDate(invoice.dueDate))} ${L.reference}: ${isDraft ? '—' : ref}`);
    para(`${L2.terms(formatInvoiceDate(invoice.dueDate))} ${L2.reference}: ${isDraft ? '—' : ref}`, 6.8, fonts.regular, GREY);
    if (bank.iban) para(`${L.bank} / ${L2.bank}: ${[bank.accountHolder, bank.bank, `IBAN ${bank.iban}`, bank.bic && `BIC ${bank.bic}`].filter(Boolean).join(' · ')}`);
  }
  if (invoice.note) para(invoice.note);

  pages.forEach((p, i) => sellerFooter(p, fonts, seller, bank, billing.footer, i + 1, `${L.page}`));
  return Buffer.from(await pdf.save());
};

// ─── Receipt ────────────────────────────────────────────────────────

export interface ReceiptPdfInput {
  receiptNo: string;
  payment: { amountCents: number; method: string; paidAt: Date; reference: string | null; note: string | null };
  invoice: { number: string; grossCents: number; paidCents: number; issueDate: Date };
  client: ClientParty;
  seller: SellerInfo;
  bank: BankInfo;
  footer: string;
}

export const buildReceiptPdf = async (input: ReceiptPdfInput) => {
  const { payment, invoice, client, seller, bank } = input;
  const L = DE_PDF;
  const L2: PdfLabels = secondaryPdfLabels(client.locale);
  const { pdf, fonts } = await createDoc({ title: `Zahlungsbestätigung ${input.receiptNo}`, author: seller.name || 'Triad Vision', lang: 'de' });
  const { text, textRight } = painter(fonts);
  const page = pdf.addPage(A4);
  page.drawRectangle({ x: 0, y: A4[1] - 6, width: W, height: 6, color: BRAND });
  text(page, seller.name || 'Triad Vision', M, 790, 15, fonts.bold);
  textRight(page, L.receipt, RIGHT, 792, 16, fonts.bold);
  textRight(page, L2.receipt, RIGHT, 778, 8, fonts.regular, GREY);
  let y = recipient(page, fonts, seller, client);
  const method = (k: string) => (k in L.methods ? L.methods[k as keyof PdfLabels['methods']] : k);
  const method2 = (k: string) => (k in L2.methods ? L2.methods[k as keyof PdfLabels['methods']] : k);
  const my = metaBlock(page, fonts, [
    [L.receiptNo, L2.receiptNo, input.receiptNo],
    [L.paymentDate, L2.paymentDate, formatInvoiceDate(payment.paidAt)],
    [L.method, L2.method, `${method(payment.method)} / ${method2(payment.method)}`],
    [L.forInvoice, L2.forInvoice, invoice.number],
  ]);
  y = Math.min(y, my) - 30;
  text(page, L.receiptText, M, y, 10, fonts.bold);
  y -= 13;
  text(page, L2.receiptText, M, y, 7.5, fonts.regular, GREY);
  y -= 34;
  page.drawRectangle({ x: M, y: y - 14, width: RIGHT - M, height: 46, color: LIGHT });
  text(page, `${L.receivedFrom}: ${client.name}`, M + 12, y + 14, 9);
  text(page, L2.receivedFrom, M + 12, y + 4, 6.5, fonts.regular, GREY);
  textRight(page, formatEur(payment.amountCents), RIGHT - 12, y + 6, 18, fonts.bold);
  y -= 46;
  const remaining = Math.max(0, invoice.grossCents - invoice.paidCents);
  text(page, `${L.remaining}: ${formatEur(remaining)}`, M, y, 9);
  text(page, `${L2.remaining}: ${formatEur(remaining)}`, M, y - 10, 6.8, fonts.regular, GREY);
  y -= 30;
  if (payment.reference) {
    text(page, `${L.reference} / ${L2.reference}: ${payment.reference}`, M, y, 8.5);
    y -= 14;
  }
  if (payment.note) for (const l of wrap(payment.note, fonts.regular, 8.5, RIGHT - M).slice(0, 6)) {
    text(page, l, M, y, 8.5);
    y -= 12;
  }
  sellerFooter(page, fonts, seller, bank, input.footer, 1, L.page);
  return Buffer.from(await pdf.save());
};
