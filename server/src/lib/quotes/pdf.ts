import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { pdfSafe, wrap, type InvoicingSettings, type SellerInfo } from '../invoicePdf.js';
import { formatEur, formatInvoiceDate } from '../invoiceTexts.js';
import { itemTotalCents, percentLabel, unitLabel, type Discount, type QuoteItem, type QuoteTotals } from './math.js';

/**
 * Angebot (quote) as an A4 PDF in German, laid out like the invoice: seller block from the 'legal'
 * setting, recipient window, meta block (Angebotsnummer, Datum, gültig bis), subject, salutation and
 * intro, the item table (Pos / Bezeichnung / Menge / Einheit / Einzelpreis / Gesamt), subtotal, discount,
 * net, VAT per rate and gross, payment and delivery terms, closing text, an acceptance signature box
 * and the bank / legal footer. Small businesses (§ 19 UStG) get the exemption note instead of VAT.
 */

export interface QuotePdfInput {
  quote: {
    number: string | null;
    status: string;
    date: Date;
    validUntil: Date;
    title: string;
    salutation: string | null;
    introText: string | null;
    closingText: string | null;
    items: QuoteItem[];
    discount: Discount;
    /** default rate of lines without their own */
    vatRate: number;
    totals: QuoteTotals;
    paymentTerms: string | null;
    deliveryTerms: string | null;
    contactName: string | null;
    acceptedAt: Date | null;
    acceptedByName: string | null;
  };
  company: { name: string; legalForm?: string | null; address?: string | null; city?: string | null; vatId?: string | null };
  seller: SellerInfo;
  invoicing: InvoicingSettings;
}

const A4: [number, number] = [595.28, 841.89];
const M = 50;
const NAVY = rgb(0.043, 0.122, 0.267);
const BRAND = rgb(0.082, 0.396, 0.91);
const GREY = rgb(0.36, 0.42, 0.53);
const LIGHT = rgb(0.93, 0.95, 0.98);
const GREEN = rgb(0.02, 0.47, 0.34);
const PLACEHOLDER = '[ fehlt / missing ]';
const qtyFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export const defaultSalutation = (contactName: string | null | undefined) =>
  contactName?.trim() ? `Guten Tag ${contactName.trim()},` : 'Sehr geehrte Damen und Herren,';

export const quoteFileName = (q: { number: string | null; status: string }) => (q.number ? `Angebot-${q.number}.pdf` : 'Angebot-Entwurf.pdf');

export const buildQuotePdf = async (input: QuotePdfInput) => {
  const { quote, company, seller, invoicing } = input;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Angebot ${quote.number ?? '(Entwurf)'}`);
  pdf.setAuthor(seller.name || 'Triad Vision');
  pdf.setCreator('Triad Vision');
  pdf.setProducer('Triad Vision');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4[0];
  const right = W - M;
  const isDraft = quote.status === 'DRAFT' || !quote.number;
  const sellerName = seller.name || PLACEHOLDER;

  const text = (page: PDFPage, s: string, x: number, y: number, size = 9, f: PDFFont = font, color = NAVY) => {
    page.drawText(pdfSafe(f, s), { x, y, size, font: f, color });
  };
  const textRight = (page: PDFPage, s: string, xRight: number, y: number, size = 9, f: PDFFont = font, color = NAVY) => {
    const safe = pdfSafe(f, s);
    page.drawText(safe, { x: xRight - f.widthOfTextAtSize(safe, size), y, size, font: f, color });
  };

  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = pdf.addPage(A4);
    pages.push(p);
    if (isDraft) p.drawText('ENTWURF', { x: 140, y: 260, size: 90, font: bold, color: GREY, opacity: 0.12, rotate: degrees(35) });
    return p;
  };

  const footer = (page: PDFPage, pageNo: number) => {
    const y0 = 92;
    page.drawLine({ start: { x: M, y: y0 + 12 }, end: { x: right, y: y0 + 12 }, thickness: 0.5, color: GREY });
    const colW = (right - M) / 4;
    const cols: string[][] = [
      [sellerName, seller.street || PLACEHOLDER, seller.zipCity || PLACEHOLDER, seller.country],
      [seller.phone && `Tel. ${seller.phone}`, seller.email, seller.website, seller.managingDirector && `GF: ${seller.managingDirector}`].filter(Boolean) as string[],
      [
        invoicing.bank ? `Bank: ${invoicing.bank}` : 'Bank: -',
        `IBAN: ${invoicing.iban || PLACEHOLDER}`,
        `BIC: ${invoicing.bic || '-'}`,
        invoicing.accountHolder ? `Inhaber: ${invoicing.accountHolder}` : '',
      ].filter(Boolean),
      [
        seller.vatId ? `USt-IdNr.: ${seller.vatId}` : '',
        seller.taxNumber ? `Steuernr.: ${seller.taxNumber}` : '',
        !seller.vatId && !seller.taxNumber ? `USt-IdNr.: ${PLACEHOLDER}` : '',
        seller.register,
      ].filter(Boolean),
    ];
    cols.forEach((lines, i) => {
      let y = y0;
      for (const l of lines.slice(0, 5)) {
        for (const w of wrap(font, l, 6.8, colW - 6).slice(0, 2)) {
          text(page, w, M + i * colW, y, 6.8, font, GREY);
          y -= 9;
        }
      }
    });
    if (invoicing.footer) {
      wrap(font, invoicing.footer, 6.8, right - M)
        .slice(0, 2)
        .forEach((l, i) => text(page, l, M, 38 - i * 9, 6.8, font, GREY));
    }
    textRight(page, `Seite ${pageNo} von ${pages.length}`, right, 24, 6.8, font, GREY);
  };

  // ── Page 1 header ──
  let page = newPage();
  page.drawRectangle({ x: 0, y: A4[1] - 6, width: W, height: 6, color: BRAND });
  text(page, sellerName, M, 790, 15, bold);
  textRight(page, 'ANGEBOT', right, 792, 18, bold);
  textRight(page, 'Quotation', right, 778, 8, font, GREY);

  const senderLine = [sellerName, seller.street, seller.zipCity].filter(Boolean).join(' · ');
  text(page, senderLine, M, 728, 7, font, GREY);
  page.drawLine({ start: { x: M, y: 724 }, end: { x: M + 240, y: 724 }, thickness: 0.4, color: GREY });

  // Recipient
  let y = 708;
  const buyerName = [company.name, company.legalForm && !company.name.includes(company.legalForm) ? company.legalForm : ''].filter(Boolean).join(' ');
  for (const l of wrap(bold, buyerName, 10.5, 240).slice(0, 2)) {
    text(page, l, M, y, 10.5, bold);
    y -= 14;
  }
  if (quote.contactName) {
    text(page, `z. Hd. ${quote.contactName}`, M, y, 9.5);
    y -= 13;
  }
  const addressLines = (company.address ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const l of addressLines.slice(0, 4)) {
    text(page, l, M, y, 9.5);
    y -= 13;
  }
  if (company.city && !addressLines.some((l) => l.includes(company.city!))) {
    text(page, company.city, M, y, 9.5);
    y -= 13;
  }

  // Meta block (right)
  const meta: [string, string, string][] = [
    ['Angebotsnummer', 'Quotation no.', isDraft ? 'ENTWURF' : quote.number!],
    ['Angebotsdatum', 'Date', formatInvoiceDate(quote.date)],
    ['Gültig bis', 'Valid until', formatInvoiceDate(quote.validUntil)],
    ...(seller.vatId ? ([['USt-IdNr.', 'VAT ID', seller.vatId]] as [string, string, string][]) : seller.taxNumber ? ([['Steuernummer', 'Tax no.', seller.taxNumber]] as [string, string, string][]) : []),
  ];
  let my = 712;
  const mx = 340;
  for (const [de, en, v] of meta) {
    text(page, de, mx, my, 8.5, bold);
    text(page, en, mx, my - 8.5, 6.5, font, GREY);
    textRight(page, v, right, my, 9);
    my -= 22;
  }

  const BOTTOM = 130;
  const ensure = (h: number) => {
    if (y - h < BOTTOM) {
      page = newPage();
      text(page, `${sellerName} · Angebot ${isDraft ? '(Entwurf)' : quote.number}`, M, 800, 8, font, GREY);
      y = 780;
    }
  };
  const para = (s: string, size = 9, f: PDFFont = font, color = NAVY, gap = 5) => {
    const lines = wrap(f, s, size, right - M);
    // Short paragraphs stay on one page.
    if (lines.length <= 5) ensure(lines.length * (size + 4));
    for (const ln of lines) {
      ensure(size + 4);
      text(page, ln, M, y, size, f, color);
      y -= size + 4;
    }
    y -= gap;
  };

  // Subject, salutation, intro
  y = Math.min(y, my) - 24;
  for (const l of wrap(bold, `Angebot${isDraft ? '' : ` Nr. ${quote.number}`}: ${quote.title}`, 13, right - M).slice(0, 3)) {
    text(page, l, M, y, 13, bold);
    y -= 17;
  }
  y -= 6;
  para(quote.salutation?.trim() || defaultSalutation(quote.contactName), 9.5, font, NAVY, 4);
  if (quote.introText?.trim()) para(quote.introText.trim(), 9.5);
  y -= 6;

  // ── Item table ──
  const mixedVat = quote.totals.vatBreakdown.length > 1;
  const col = { pos: M + 6, desc: M + 30, qty: 330, unit: 338, price: 466, total: right - 6 };
  const descW = col.qty - 34 - col.desc;
  const tableHeader = (top: number) => {
    page.drawRectangle({ x: M, y: top - 20, width: right - M, height: 24, color: LIGHT });
    const h = [
      ['Pos.', 'Item', col.pos, 'l'],
      ['Bezeichnung', 'Description', col.desc, 'l'],
      ['Menge', 'Qty', col.qty, 'r'],
      ['Einheit', 'Unit', col.unit, 'l'],
      ['Einzelpreis', 'Unit price', col.price, 'r'],
      ['Gesamt', 'Amount', col.total, 'r'],
    ] as const;
    for (const [de, en, x, align] of h) {
      if (align === 'l') {
        text(page, de, x, top - 6, 8, bold);
        text(page, en, x, top - 15, 6, font, GREY);
      } else {
        textRight(page, de, x, top - 6, 8, bold);
        textRight(page, en, x, top - 15, 6, font, GREY);
      }
    }
    return top - 34;
  };
  ensure(60);
  y = tableHeader(y);
  quote.items.forEach((l, i) => {
    const lines = wrap(font, l.description, 9, descW);
    const extra = mixedVat ? 1 : 0;
    const h = (lines.length + extra) * 12 + 6;
    if (y - h < BOTTOM) {
      page = newPage();
      text(page, `${sellerName} · Angebot ${isDraft ? '(Entwurf)' : quote.number}`, M, 800, 8, font, GREY);
      y = tableHeader(780);
    }
    text(page, String(i + 1), col.pos, y, 9);
    lines.forEach((ln, k) => text(page, ln, col.desc, y - k * 12, 9));
    if (mixedVat) text(page, `USt. ${l.vatRate ?? quote.vatRate} %`, col.desc, y - lines.length * 12, 7.5, font, GREY);
    textRight(page, qtyFmt.format(l.quantity), col.qty, y, 9);
    text(page, unitLabel(l.unit, l.quantity), col.unit, y, 9);
    textRight(page, formatEur(l.unitPriceCents), col.price, y, 9);
    textRight(page, formatEur(itemTotalCents(l)), col.total, y, 9);
    y -= h;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.3, color: LIGHT });
  });

  // ── Totals ──
  const t = quote.totals;
  const small = invoicing.smallBusiness && t.vatCents === 0;
  const rows = 3 + (t.discountCents ? 2 : 0) + (small ? 1 : t.vatBreakdown.length);
  ensure(rows * 19 + 30);
  y -= 6;
  const tl = 330;
  const totalRow = (de: string, en: string, v: string, strong = false) => {
    text(page, de, tl, y, strong ? 10 : 9, strong ? bold : font);
    text(page, en, tl, y - 8, 6, font, GREY);
    textRight(page, v, col.total, y, strong ? 11 : 9, strong ? bold : font);
    y -= strong ? 22 : 19;
  };
  if (t.discountCents) {
    totalRow('Zwischensumme', 'Subtotal', formatEur(t.subtotalCents));
    totalRow(
      quote.discount.type === 'PERCENT' ? `abzgl. Rabatt ${percentLabel(quote.discount.value)}` : 'abzgl. Rabatt',
      'Discount',
      `-${formatEur(t.discountCents)}`,
    );
  }
  totalRow('Nettobetrag', 'Net amount', formatEur(t.netCents));
  if (small) totalRow('Umsatzsteuer', 'VAT', formatEur(0));
  else for (const g of t.vatBreakdown) totalRow(`zzgl. ${g.rate} % USt.`, `VAT ${g.rate} %${t.vatBreakdown.length > 1 ? ` on ${formatEur(g.netCents)}` : ''}`, formatEur(g.vatCents));
  page.drawLine({ start: { x: tl, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 0.8, color: NAVY });
  y -= 10;
  totalRow('Gesamtbetrag', 'Total', formatEur(t.grossCents), true);
  y -= 6;

  // ── Terms and texts ──
  if (small) {
    para('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).', 8.5);
  }
  const section = (heading: string, body: string | null) => {
    if (!body?.trim()) return;
    ensure(30);
    text(page, heading, M, y, 9, bold);
    y -= 13;
    para(body.trim(), 9);
  };
  section('Zahlungsbedingungen', quote.paymentTerms);
  section('Lieferbedingungen', quote.deliveryTerms);
  para(`Dieses Angebot ist gültig bis zum ${formatInvoiceDate(quote.validUntil)}. Alle Preise verstehen sich in Euro${small ? '' : ' zuzüglich der gesetzlichen Umsatzsteuer, sofern nicht anders angegeben'}.`, 9);
  if (quote.closingText?.trim()) para(quote.closingText.trim(), 9.5);
  ensure(40);
  text(page, 'Mit freundlichen Grüßen', M, y, 9.5);
  y -= 14;
  text(page, sellerName, M, y, 9.5, bold);
  y -= 26;

  // ── Acceptance box ──
  ensure(96);
  const boxTop = y;
  page.drawRectangle({ x: M, y: boxTop - 84, width: right - M, height: 90, borderColor: LIGHT, borderWidth: 1, color: rgb(0.985, 0.99, 1) });
  text(page, 'Auftragserteilung', M + 10, boxTop - 10, 9.5, bold);
  text(page, `Hiermit nehmen wir das Angebot${isDraft ? '' : ` Nr. ${quote.number}`} verbindlich an.`, M + 10, boxTop - 24, 8.5, font, GREY);
  if (quote.acceptedAt && quote.acceptedByName) {
    text(page, `Online angenommen am ${formatInvoiceDate(quote.acceptedAt)} von ${quote.acceptedByName}.`, M + 10, boxTop - 50, 10, bold, GREEN);
    text(page, 'Elektronisch bestätigt, gültig ohne Unterschrift.', M + 10, boxTop - 64, 7.5, font, GREY);
  } else {
    const lineY = boxTop - 62;
    page.drawLine({ start: { x: M + 10, y: lineY }, end: { x: M + 190, y: lineY }, thickness: 0.5, color: GREY });
    page.drawLine({ start: { x: M + 230, y: lineY }, end: { x: right - 10, y: lineY }, thickness: 0.5, color: GREY });
    text(page, 'Ort, Datum', M + 10, lineY - 10, 7.5, font, GREY);
    text(page, 'Unterschrift / Firmenstempel des Auftraggebers', M + 230, lineY - 10, 7.5, font, GREY);
  }
  y = boxTop - 96;

  pages.forEach((p, i) => footer(p, i + 1));
  return Buffer.from(await pdf.save());
};
