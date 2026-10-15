import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatEur, formatInvoiceDate } from './invoiceTexts.js';

/**
 * German invoice (Rechnung) as an A4 PDF, covering the §14 Abs. 4 UStG basics: full name and address of
 * seller and buyer, seller tax number / VAT ID, issue date, sequential invoice number, quantity and
 * description of the service, service period, net amount, VAT rate and amount, gross amount, and the
 * §19 UStG note for small businesses. Labels are German with small English print.
 */

// ─── Data shapes ──────────────────────────────────────────────────────

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** invoice-level service period, stored on every line (YYYY-MM-DD) */
  servicePeriod?: { from?: string | null; to?: string | null } | null;
}

export interface InvoicingSettings {
  accountHolder: string;
  iban: string;
  bic: string;
  bank: string;
  defaultVatRate: number;
  paymentTermsDays: number;
  smallBusiness: boolean;
  footer: string;
}

export const DEFAULT_INVOICING: InvoicingSettings = {
  accountHolder: '',
  iban: '',
  bic: '',
  bank: '',
  defaultVatRate: 19,
  paymentTermsDays: 14,
  smallBusiness: false,
  footer: '',
};

export interface SellerInfo {
  name: string;
  street: string;
  zipCity: string;
  country: string;
  vatId: string;
  taxNumber: string;
  register: string;
  managingDirector: string;
  email: string;
  phone: string;
  website: string;
}

const str = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['de', 'en', 'az', 'ru']) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
  }
  return '';
};

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return '';
};

export const readInvoicing = (value: unknown): InvoicingSettings => {
  const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
  };
  return {
    accountHolder: str(o.accountHolder),
    iban: str(o.iban),
    bic: str(o.bic),
    bank: str(o.bank),
    defaultVatRate: num(o.defaultVatRate, DEFAULT_INVOICING.defaultVatRate, 0, 100),
    paymentTermsDays: num(o.paymentTermsDays, DEFAULT_INVOICING.paymentTermsDays, 0, 365),
    smallBusiness: o.smallBusiness === true,
    footer: str(o.footer),
  };
};

/**
 * Seller data from the 'legal' setting (maintained in Admin → Settings by another feature). The shape is
 * read tolerantly; `missing` lists what an invoice legally needs but is not filled in.
 */
export const readLegal = (value: unknown): { seller: SellerInfo; missing: string[] } => {
  const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const zip = pick(o, 'zip', 'postalCode', 'plz');
  const city = pick(o, 'city', 'ort');
  const register = pick(o, 'register') || [pick(o, 'registerCourt', 'court'), pick(o, 'registerNumber', 'hrb')].filter(Boolean).join(' ');
  const seller: SellerInfo = {
    name: pick(o, 'companyName', 'legalName', 'name', 'company'),
    street: pick(o, 'street', 'address', 'addressLine'),
    zipCity: [zip, city].filter(Boolean).join(' '),
    country: pick(o, 'country') || 'Deutschland',
    vatId: pick(o, 'vatId', 'ustId', 'vat'),
    taxNumber: pick(o, 'taxNumber', 'steuernummer', 'taxId'),
    register,
    managingDirector: pick(o, 'managingDirector', 'ceo', 'representative', 'director'),
    email: pick(o, 'email'),
    phone: pick(o, 'phone'),
    website: pick(o, 'website', 'web'),
  };
  // Address given as one multi-line text: first line street, rest zip/city.
  if (seller.street.includes('\n') && !seller.zipCity) {
    const [first, ...rest] = seller.street.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    seller.street = first ?? '';
    seller.zipCity = rest.join(', ');
  }
  const missing: string[] = [];
  if (!seller.name) missing.push('name');
  if (!seller.street || !seller.zipCity) missing.push('address');
  if (!seller.vatId && !seller.taxNumber) missing.push('vatId');
  return { seller, missing };
};

export const lineTotalCents = (l: Pick<InvoiceLine, 'quantity' | 'unitPriceCents'>) => Math.round(l.quantity * l.unitPriceCents);

export const computeTotals = (items: Pick<InvoiceLine, 'quantity' | 'unitPriceCents'>[], vatRate: number) => {
  const netCents = items.reduce((a, l) => a + lineTotalCents(l), 0);
  const vatCents = Math.round((netCents * vatRate) / 100);
  return { netCents, vatCents, grossCents: netCents + vatCents };
};

// ─── Text safety ─────────────────────────────────────────────────────

const TRANSLIT: Record<string, string> = {
  ə: 'e', Ə: 'E', ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '„': '"',
  ' ': ' ', ' ': ' ', ' ': ' ', '\t': ' ',
};

/** Standard PDF fonts only cover WinAnsi: transliterate (Azerbaijani, Cyrillic) and replace the rest. */
export const pdfSafe = (font: PDFFont, text: string) =>
  [...text.replace(/\r?\n/g, ' ')]
    .map((ch) => {
      const lower = ch.toLowerCase();
      const mapped = TRANSLIT[ch] ?? (TRANSLIT[lower] !== undefined && lower !== ch ? TRANSLIT[lower].toUpperCase() : ch);
      try {
        font.encodeText(mapped);
        return mapped;
      } catch {
        return '?';
      }
    })
    .join('');

const wrap = (font: PDFFont, text: string, size: number, width: number) => {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = pdfSafe(font, para).split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      // A single word wider than the column is hard-broken.
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
};

// ─── PDF ────────────────────────────────────────────────────────────

export interface InvoicePdfInput {
  invoice: {
    number: string;
    status: string;
    issueDate: Date;
    dueDate: Date;
    items: InvoiceLine[];
    vatRate: number;
    netCents: number;
    vatCents: number;
    grossCents: number;
    note: string | null;
  };
  company: { name: string; legalForm?: string | null; contactName?: string | null; address?: string | null; city?: string | null; vatId?: string | null };
  seller: SellerInfo;
  invoicing: InvoicingSettings;
}

const A4: [number, number] = [595.28, 841.89];
const M = 50; // side margin
const NAVY = rgb(0.043, 0.122, 0.267);
const BRAND = rgb(0.082, 0.396, 0.91);
const GREY = rgb(0.36, 0.42, 0.53);
const LIGHT = rgb(0.93, 0.95, 0.98);
const RED = rgb(0.75, 0.1, 0.1);
const PLACEHOLDER = '[ fehlt / missing ]';

const isoDay = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatInvoiceDate(new Date(`${s}T12:00:00Z`)) : '');

export const servicePeriodLabel = (items: InvoiceLine[]) => {
  const p = items.find((l) => l.servicePeriod)?.servicePeriod;
  if (!p) return '';
  const from = isoDay(p.from);
  const to = isoDay(p.to);
  if (from && to) return from === to ? from : `${from} - ${to}`;
  return from || to;
};

const qtyFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export const buildInvoicePdf = async (input: InvoicePdfInput) => {
  const { invoice, company, seller, invoicing } = input;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rechnung ${invoice.number}`);
  pdf.setAuthor(seller.name || 'Triad Vision');
  pdf.setCreator('Triad Vision');
  pdf.setProducer('Triad Vision');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4[0];
  const right = W - M;

  const text = (page: PDFPage, s: string, x: number, y: number, size = 9, f: PDFFont = font, color = NAVY) => {
    page.drawText(pdfSafe(f, s), { x, y, size, font: f, color });
  };
  const textRight = (page: PDFPage, s: string, xRight: number, y: number, size = 9, f: PDFFont = font, color = NAVY) => {
    const safe = pdfSafe(f, s);
    page.drawText(safe, { x: xRight - f.widthOfTextAtSize(safe, size), y, size, font: f, color });
  };

  const isDraft = invoice.status === 'DRAFT';
  const isCancelled = invoice.status === 'CANCELLED';
  const sellerName = seller.name || PLACEHOLDER;

  const stamp = (page: PDFPage) => {
    if (!isDraft && !isCancelled) return;
    const label = isDraft ? 'ENTWURF' : 'STORNIERT';
    page.drawText(label, {
      x: 140,
      y: 260,
      size: 90,
      font: bold,
      color: isDraft ? GREY : RED,
      opacity: 0.12,
      rotate: degrees(35),
    });
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
      const lines = wrap(font, invoicing.footer, 6.8, right - M).slice(0, 2);
      lines.forEach((l, i) => text(page, l, M, 38 - i * 9, 6.8, font, GREY));
    }
    textRight(page, `Seite ${pageNo}`, right, 24, 6.8, font, GREY);
  };

  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = pdf.addPage(A4);
    pages.push(p);
    stamp(p);
    return p;
  };

  // ── Page 1 header ──
  let page = newPage();
  page.drawRectangle({ x: 0, y: A4[1] - 6, width: W, height: 6, color: BRAND });
  text(page, sellerName, M, 790, 15, bold);
  textRight(page, isCancelled ? 'STORNORECHNUNG' : 'RECHNUNG', right, 792, 18, bold, isCancelled ? RED : NAVY);
  textRight(page, isCancelled ? 'Cancellation invoice' : 'Invoice', right, 778, 8, font, GREY);

  // Sender line above the recipient window (DIN 5008 style)
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
  if (company.contactName) {
    text(page, `z. Hd. ${company.contactName}`, M, y, 9.5);
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
  if (company.vatId) {
    y -= 3;
    text(page, `USt-IdNr.: ${company.vatId}`, M, y, 8.5, font, GREY);
    y -= 12;
  }

  // Meta block (right)
  const period = servicePeriodLabel(invoice.items);
  const meta: [string, string, string][] = [
    ['Rechnungsnummer', 'Invoice no.', isDraft ? 'ENTWURF' : invoice.number],
    ['Rechnungsdatum', 'Invoice date', formatInvoiceDate(invoice.issueDate)],
    ...(period ? ([['Leistungszeitraum', 'Service period', period]] as [string, string, string][]) : []),
    ['Fällig am', 'Due date', formatInvoiceDate(invoice.dueDate)],
    ...(seller.vatId
      ? ([['USt-IdNr.', 'VAT ID', seller.vatId]] as [string, string, string][])
      : seller.taxNumber
        ? ([['Steuernummer', 'Tax no.', seller.taxNumber]] as [string, string, string][])
        : ([['USt-IdNr.', 'VAT ID', PLACEHOLDER]] as [string, string, string][])),
  ];
  let my = 712;
  const mx = 340;
  for (const [de, en, v] of meta) {
    text(page, de, mx, my, 8.5, bold, NAVY);
    text(page, en, mx, my - 8.5, 6.5, font, GREY);
    textRight(page, v, right, my, 9);
    my -= 22;
  }

  // Title
  y = Math.min(y, my) - 24;
  const title = isCancelled ? `Stornorechnung zu Rechnung Nr. ${invoice.number}` : isDraft ? 'Rechnung (Entwurf)' : `Rechnung Nr. ${invoice.number}`;
  text(page, title, M, y, 13, bold, isCancelled ? RED : NAVY);
  y -= 16;
  text(page, isCancelled ? 'Die oben genannte Rechnung wird hiermit storniert. Es ist keine Zahlung erforderlich.' : 'Für unsere Leistungen berechnen wir Ihnen wie folgt:', M, y, 9, font, GREY);
  y -= 20;

  // ── Item table ──
  const col = { pos: M + 6, desc: M + 32, qty: 368, unit: 450, total: right - 6 };
  const descW = col.qty - 44 - col.desc; // leave room for the right-aligned quantity
  const tableHeader = (p: PDFPage, top: number) => {
    p.drawRectangle({ x: M, y: top - 20, width: right - M, height: 24, color: LIGHT });
    text(p, 'Pos.', col.pos, top - 6, 8, bold);
    text(p, 'Beschreibung', col.desc, top - 6, 8, bold);
    textRight(p, 'Menge', col.qty, top - 6, 8, bold);
    textRight(p, 'Einzelpreis', col.unit, top - 6, 8, bold);
    textRight(p, 'Gesamt', col.total, top - 6, 8, bold);
    text(p, 'Item', col.pos, top - 15, 6, font, GREY);
    text(p, 'Description', col.desc, top - 15, 6, font, GREY);
    textRight(p, 'Qty', col.qty, top - 15, 6, font, GREY);
    textRight(p, 'Unit price', col.unit, top - 15, 6, font, GREY);
    textRight(p, 'Amount', col.total, top - 15, 6, font, GREY);
    return top - 34;
  };
  const BOTTOM = 130;
  y = tableHeader(page, y);
  invoice.items.forEach((l, i) => {
    const lines = wrap(font, l.description, 9, descW);
    const h = lines.length * 12 + 6;
    if (y - h < BOTTOM) {
      page = newPage();
      text(page, `${sellerName} · Rechnung ${isDraft ? '(Entwurf)' : invoice.number}`, M, 800, 8, font, GREY);
      y = tableHeader(page, 780);
    }
    text(page, String(i + 1), col.pos, y, 9);
    lines.forEach((ln, k) => text(page, ln, col.desc, y - k * 12, 9));
    textRight(page, qtyFmt.format(l.quantity), col.qty, y, 9);
    textRight(page, formatEur(l.unitPriceCents), col.unit, y, 9);
    textRight(page, formatEur(lineTotalCents(l)), col.total, y, 9);
    y -= h;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.3, color: LIGHT });
  });

  // ── Totals ──
  if (y - 90 < BOTTOM) {
    page = newPage();
    y = 780;
  }
  y -= 6;
  const tl = 340;
  const totalRow = (de: string, en: string, v: string, strong = false) => {
    text(page, de, tl, y, strong ? 10 : 9, strong ? bold : font);
    text(page, en, tl, y - 8, 6, font, GREY);
    textRight(page, v, col.total, y, strong ? 11 : 9, strong ? bold : font);
    y -= strong ? 22 : 19;
  };
  totalRow('Nettobetrag', 'Net amount', formatEur(invoice.netCents));
  if (invoicing.smallBusiness && invoice.vatRate === 0) {
    totalRow('Umsatzsteuer', 'VAT', formatEur(0));
  } else {
    totalRow(`zzgl. ${invoice.vatRate} % USt.`, `VAT ${invoice.vatRate} %`, formatEur(invoice.vatCents));
  }
  page.drawLine({ start: { x: tl, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 0.8, color: NAVY });
  y -= 10;
  totalRow(isCancelled ? 'Stornierter Betrag' : 'Gesamtbetrag', isCancelled ? 'Cancelled amount' : 'Total amount due', formatEur(invoice.grossCents), true);

  // ── Notes ──
  y -= 8;
  const para = (s: string, size = 8.5, f: PDFFont = font, color = NAVY) => {
    for (const ln of wrap(f, s, size, right - M)) {
      if (y < BOTTOM) {
        page = newPage();
        y = 780;
      }
      text(page, ln, M, y, size, f, color);
      y -= size + 3.5;
    }
    y -= 4;
  };
  if (invoicing.smallBusiness) {
    para('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).');
    para('No VAT is charged according to § 19 UStG (small business regulation).', 6.8, font, GREY);
  }
  if (!isCancelled) {
    para(`Zahlbar ohne Abzug bis zum ${formatInvoiceDate(invoice.dueDate)}. Bitte geben Sie als Verwendungszweck die Rechnungsnummer${isDraft ? '' : ` ${invoice.number}`} an.`);
    para(`Payable without deduction by ${formatInvoiceDate(invoice.dueDate, 'en')}. Please quote the invoice number as payment reference.`, 6.8, font, GREY);
    if (invoicing.iban) {
      para(`Bankverbindung: ${[invoicing.accountHolder, invoicing.bank, `IBAN ${invoicing.iban}`, invoicing.bic && `BIC ${invoicing.bic}`].filter(Boolean).join(' · ')}`);
    }
  }
  if (invoice.note) para(invoice.note);

  pages.forEach((p, i) => footer(p, i + 1));
  return Buffer.from(await pdf.save());
};
