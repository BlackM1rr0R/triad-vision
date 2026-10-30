import QRCode from 'qrcode';
import { rgb, type PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Locale } from '@prisma/client';
import { A4, BRAND, INK, LINE, MM, MUTED, createDoc, fit, wrap, type Fonts } from '../cv/pdfKit.js';
import { brandify } from '../brand/index.js';

/**
 * PDFs of the client referral programme:
 * - QR business card (85 × 55 mm): one card on its own page, or an A4 sheet of 10 cards with cut lines;
 * - receipt for a settled cash PAYOUT reward (German first, the recipient's language below).
 * DejaVu Sans (pdfKit) so Azerbaijani and Cyrillic names render.
 */

const CARD_W = 85 * MM;
const CARD_H = 55 * MM;

const CARD_TEXT: Record<Locale, { tagline: string; scan: string; code: string }> = {
  az: { tagline: 'Almaniyada iş — mənim linkimlə qeydiyyatdan keç', scan: 'Skan et və ya linki aç', code: 'Kod' },
  de: { tagline: 'Arbeit in Deutschland — registriere dich über meinen Link', scan: 'Scannen oder Link öffnen', code: 'Code' },
  en: { tagline: 'Work in Germany — sign up with my link', scan: 'Scan or open the link', code: 'Code' },
  ru: { tagline: 'Работа в Германии — регистрируйся по моей ссылке', scan: 'Сканируй или открой ссылку', code: 'Код' },
};

export interface CardInput {
  name: string;
  link: string;
  code: string;
  locale: Locale;
  layout: 'single' | 'sheet';
}

const drawCard = (page: PDFPage, fonts: Fonts, qr: PDFImage, x: number, y: number, c: CardInput) => {
  const tx = CARD_TEXT[c.locale];
  const pad = 4 * MM;
  const qrSize = CARD_H - 2 * pad - 6 * MM;
  page.drawRectangle({ x, y: y + CARD_H - 3 * MM, width: CARD_W, height: 3 * MM, color: BRAND });
  page.drawImage(qr, { x: x + CARD_W - pad - qrSize, y: y + pad + 4 * MM, width: qrSize, height: qrSize });
  page.drawText(fit(tx.scan, fonts.regular, 5.5, qrSize + 4), { x: x + CARD_W - pad - qrSize, y: y + pad + 1, size: 5.5, font: fonts.regular, color: MUTED });
  const textW = CARD_W - 3 * pad - qrSize;
  page.drawText(fit(brandify('Triad Vision'), fonts.bold, 8, textW), { x: x + pad, y: y + CARD_H - 3 * MM - pad - 6, size: 8, font: fonts.bold, color: BRAND });
  page.drawText(fit(c.name, fonts.bold, 12, textW), { x: x + pad, y: y + CARD_H - 3 * MM - pad - 22, size: 12, font: fonts.bold, color: INK });
  let ty = y + CARD_H - 3 * MM - pad - 36;
  for (const line of wrap(brandify(tx.tagline), fonts.regular, 7.5, textW).slice(0, 3)) {
    page.drawText(line, { x: x + pad, y: ty, size: 7.5, font: fonts.regular, color: INK });
    ty -= 10;
  }
  page.drawText(`${tx.code}: ${c.code}`, { x: x + pad, y: y + pad + 9, size: 8, font: fonts.bold, color: INK });
  page.drawText(fit(c.link.replace(/^https?:\/\//, ''), fonts.regular, 5.5, textW), { x: x + pad, y: y + pad, size: 5.5, font: fonts.regular, color: MUTED });
};

/** The card PDF: a single 85 × 55 mm page, or an A4 sheet with 2 × 5 cards and light cut lines. */
export const referralCardPdf = async (c: CardInput) => {
  const { pdf, fonts } = await createDoc({ title: `${brandify('Triad Vision')} — ${c.name}`, lang: c.locale });
  const qr = await pdf.embedPng(await QRCode.toBuffer(c.link, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 480 }));
  if (c.layout === 'single') {
    const page = pdf.addPage([CARD_W, CARD_H]);
    drawCard(page, fonts, qr, 0, 0, c);
  } else {
    const page = pdf.addPage(A4);
    const cols = 2;
    const rows = 5;
    const x0 = (A4[0] - cols * CARD_W) / 2;
    const y0 = (A4[1] - rows * CARD_H) / 2;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) drawCard(page, fonts, qr, x0 + k * CARD_W, y0 + r * CARD_H, c);
    for (let k = 0; k <= cols; k++) page.drawLine({ start: { x: x0 + k * CARD_W, y: y0 }, end: { x: x0 + k * CARD_W, y: y0 + rows * CARD_H }, thickness: 0.3, color: LINE });
    for (let r = 0; r <= rows; r++) page.drawLine({ start: { x: x0, y: y0 + r * CARD_H }, end: { x: x0 + cols * CARD_W, y: y0 + r * CARD_H }, thickness: 0.3, color: LINE });
  }
  return Buffer.from(await pdf.save());
};

// ─── Payout receipt ────────────────────────────────────────────────────

const RECEIPT_TEXT: Record<Locale, { title: string; number: string; date: string; recipient: string; amount: string; reason: string; statement: string; signature: string }> = {
  az: {
    title: 'Qəbz — tövsiyə mükafatının ödənişi',
    number: 'Qəbz nömrəsi',
    date: 'Ödəniş tarixi',
    recipient: 'Alan',
    amount: 'Məbləğ',
    reason: 'Səbəb',
    statement: 'Yuxarıdakı məbləğ "Dostunu gətir" proqramı üzrə tövsiyə mükafatı kimi ödənilmişdir.',
    signature: 'İmza',
  },
  de: {
    title: 'Quittung — Auszahlung Empfehlungsprämie',
    number: 'Belegnummer',
    date: 'Auszahlungsdatum',
    recipient: 'Empfänger/in',
    amount: 'Betrag',
    reason: 'Grund',
    statement: 'Der oben genannte Betrag wurde als Empfehlungsprämie aus dem Programm „Freunde werben“ ausgezahlt.',
    signature: 'Unterschrift',
  },
  en: {
    title: 'Receipt — referral reward payout',
    number: 'Receipt number',
    date: 'Payout date',
    recipient: 'Recipient',
    amount: 'Amount',
    reason: 'Reason',
    statement: 'The amount above was paid out as a referral reward of the "Refer a friend" programme.',
    signature: 'Signature',
  },
  ru: {
    title: 'Квитанция — выплата бонуса за приглашение',
    number: 'Номер квитанции',
    date: 'Дата выплаты',
    recipient: 'Получатель',
    amount: 'Сумма',
    reason: 'Основание',
    statement: 'Указанная сумма выплачена как бонус за приглашение по программе «Приведи друга».',
    signature: 'Подпись',
  },
};

/** Stable receipt number of a reward: RR-<year of settlement>-<last 8 of the id>. */
export const receiptNumber = (r: { id: string; settledAt: Date }) => `RR-${r.settledAt.getUTCFullYear()}-${r.id.slice(-8).toUpperCase()}`;

export interface ReceiptInput {
  id: string;
  amount: number;
  currency: string;
  settledAt: Date;
  reason: string;
  note: string | null;
  recipient: { name: string; email: string; locale: Locale };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export const rewardReceiptPdf = async (r: ReceiptInput) => {
  const { pdf, fonts } = await createDoc({ title: receiptNumber(r), lang: 'de' });
  const page = pdf.addPage(A4);
  const M = 56;
  let y = A4[1] - M;
  const de = RECEIPT_TEXT.de;
  const local = r.recipient.locale === 'de' ? RECEIPT_TEXT.en : RECEIPT_TEXT[r.recipient.locale];
  page.drawText(brandify('Triad Vision'), { x: M, y, size: 11, font: fonts.bold, color: BRAND });
  y -= 30;
  page.drawText(de.title, { x: M, y, size: 16, font: fonts.bold, color: INK });
  y -= 16;
  page.drawText(local.title, { x: M, y, size: 10, font: fonts.regular, color: MUTED });
  y -= 30;
  const row = (k: keyof typeof de, value: string) => {
    page.drawText(`${de[k]} / ${local[k]}`, { x: M, y, size: 8.5, font: fonts.regular, color: MUTED });
    y -= 13;
    for (const line of wrap(value, fonts.bold, 11, A4[0] - 2 * M)) {
      page.drawText(line, { x: M, y, size: 11, font: fonts.bold, color: INK });
      y -= 14;
    }
    y -= 8;
  };
  row('number', receiptNumber(r));
  row('date', day(r.settledAt));
  row('recipient', `${r.recipient.name} <${r.recipient.email}>`);
  row('amount', `${r.amount} ${r.currency}`);
  row('reason', r.note ? `${r.reason} — ${r.note}` : r.reason);
  y -= 6;
  for (const text of [de.statement, local.statement]) {
    for (const line of wrap(brandify(text), fonts.regular, 9.5, A4[0] - 2 * M)) {
      page.drawText(line, { x: M, y, size: 9.5, font: fonts.regular, color: INK });
      y -= 13;
    }
    y -= 4;
  }
  y -= 50;
  page.drawLine({ start: { x: M, y }, end: { x: M + 200, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(`${de.signature} / ${local.signature}`, { x: M, y: y - 12, size: 8.5, font: fonts.regular, color: MUTED });
  return Buffer.from(await (pdf as PDFDocument).save());
};
