import QRCode from 'qrcode';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { config } from '../../config.js';
import { brandSync } from '../brand/index.js';
import { localizedPath } from '../seo.js';
import { STATIC_PAGES, textIn } from '../seoCatalogue.js';
import { BAND, BRAND, INK, LINE, MUTED, clean, createDoc, fit, wrap, type Fonts } from '../cv/pdfKit.js';
import { DEUTSCHLANDTICKET_STEPS, MINIMUM_WAGE_STEPS, stepAt, type DatedStep } from '../budget/params.js';
import { EMBASSY } from '../departure/arrivalCard.js';
import { POCKET_GUIDE_CHECKED, POCKET_TEXT, type PocketFacts, type PocketLocale, type PocketText, type Section } from './content.js';
import { POCKET_PHRASES } from './phrases.js';
import { buergeramtFor, FEDERAL_ANMELDUNG_URL } from './cities.js';

/**
 * Printable "Germany pocket guide": a 16-page A5 booklet (pdf-lib, DejaVu Sans via lib/cv/pdfKit.ts so Azerbaijani and
 * Cyrillic letters render) in az / ru / en / de. Two layouts:
 *   - 'a5'      16 single A5 pages in reading order;
 *   - 'booklet' the same pages imposed two-up on 8 A4 landscape pages (4 sheets, duplex "flip on short edge"): fold
 *               the stack in the middle and staple → an A5 booklet.
 * Facts come from the verified constants (budget/params.ts: minimum wage / Deutschlandticket by date; departure/
 * arrivalCard.ts: embassy) and content.ts; the content check date (POCKET_GUIDE_CHECKED) is printed.
 * The generic PDFs are cached in memory per language / layout / facts; the personalised one (client portal: name,
 * employer, city Bürgeramt link) is built on demand and never stored.
 */

export const POCKET_GUIDE_VERSION = '2026.11-1';
export { POCKET_GUIDE_CHECKED } from './content.js';
export const POCKET_PAGES = 16;
export const LAYOUTS = ['a5', 'booklet'] as const;
export type PocketLayout = (typeof LAYOUTS)[number];

export interface PocketPersonal {
  name?: string | null;
  employer?: { name?: string | null; address?: string | null; phone?: string | null } | null;
  city?: string | null;
}

const A5: [number, number] = [419.53, 595.28];
const A4L: [number, number] = [841.89, 595.28];
const W = A5[0];
const H = A5[1];
const M = 30; // outer margin
const CW = W - 2 * M;
const HEAD = 62; // header band height
const BODY_TOP = H - HEAD - 22;
const BODY_BOTTOM = 40;
const ACCENT = rgb(0.082, 0.396, 0.91);
const DANGER = rgb(0.75, 0.13, 0.13);
const WHITE = rgb(1, 1, 1);

const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

export const eur = (n: number, lng: PocketLocale) => (lng === 'en' ? `€${n.toFixed(2)}` : `${n.toFixed(2).replace('.', ',')} €`);

const nextStep = (steps: readonly DatedStep[], at: Date) => {
  const day = at.toISOString().slice(0, 10);
  return steps.find((s) => s.from > day) ?? null;
};

/** Figures of the day `at` (the next decided step is mentioned too). */
export const pocketFacts = (lng: PocketLocale, at = new Date()): PocketFacts => {
  const wage = stepAt(MINIMUM_WAGE_STEPS, at);
  const wageNext = nextStep(MINIMUM_WAGE_STEPS, at);
  const ticket = stepAt(DEUTSCHLANDTICKET_STEPS, at);
  const ticketNext = nextStep(DEUTSCHLANDTICKET_STEPS, at);
  const b = brandSync();
  return {
    minWage: eur(wage.value, lng),
    minWageFrom: dmy(wage.from),
    minWageNext: wageNext ? `${eur(wageNext.value, lng)} (${dmy(wageNext.from)})` : null,
    ticket: eur(ticket.value, lng),
    ticketNext: ticketNext ? `${eur(ticketNext.value, lng)} (${dmy(ticketNext.from)})` : null,
    rundfunk: eur(18.36, lng),
    asOf: dmy(POCKET_GUIDE_CHECKED),
    brand: b.name,
    phone: b.phone,
    domain: b.domain,
  };
};

const origin = () => new URL(config.clientUrl).origin;

/** Tools linked by QR code on page 13 (names from the SEO catalogue in the booklet's language). */
export const QR_TOOLS = ['/send-money-home', '/emergency-wallpaper', '/waste-sorting', '/salary-calculator', '/phrase-of-the-day', '/glossary'] as const;

// ─── Drawing helpers ─────────────────────────────────────────────────────

interface Ctx {
  pdf: PDFDocument;
  fonts: Fonts;
  t: PocketText;
  f: PocketFacts;
  lng: PocketLocale;
}

const text = (c: Ctx, page: PDFPage, s: string, x: number, y: number, size: number, o: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
  const t = clean(s);
  if (t) page.drawText(t, { x, y, size, font: o.bold ? c.fonts.bold : c.fonts.regular, color: o.color ?? INK });
};

const newPage = (c: Ctx, title: string, n: number) => {
  const page = c.pdf.addPage(A5);
  page.drawRectangle({ x: 0, y: H - HEAD, width: W, height: HEAD, color: BRAND });
  page.drawRectangle({ x: 0, y: H - HEAD - 3, width: W, height: 3, color: ACCENT });
  const lines = wrap(title, c.fonts.bold, 17, CW);
  const size = lines.length > 1 ? 14 : 17;
  text(c, page, fit(title, c.fonts.bold, size, CW), M, H - HEAD + (HEAD - size) / 2 + 2, size, { bold: true, color: WHITE });
  // footer: page number + brand
  page.drawLine({ start: { x: M, y: 28 }, end: { x: W - M, y: 28 }, thickness: 0.5, color: LINE });
  text(c, page, `${c.f.brand} · ${c.f.domain}`, M, 16, 7, { color: MUTED });
  const num = String(n);
  text(c, page, num, W - M - c.fonts.bold.widthOfTextAtSize(num, 8), 16, 8, { bold: true, color: MUTED });
  return page;
};

/** Height a section needs at a font size (bullets / checkboxes with hanging indent). */
const sectionHeight = (c: Ctx, s: Section, size: number, width: number) => {
  const lead = size * 1.36;
  let h = 0;
  if (s.intro) h += wrap(s.intro, c.fonts.regular, size, width).length * lead + 6;
  for (const it of s.items) h += wrap(it, c.fonts.regular, size, width - 16).length * lead + size * 0.7;
  if (s.note) h += 8 + wrap(s.note, c.fonts.regular, size - 1, width - 16).length * (size - 1) * 1.36 + 12;
  return h;
};

/** Draws a section into [top, bottom], shrinking the font until it fits (the page count never changes). */
const drawSection = (c: Ctx, page: PDFPage, s: Section, top: number, bottom = BODY_BOTTOM) => {
  let size = 11.5;
  while (size > 6.2 && sectionHeight(c, s, size, CW) > top - bottom) size -= 0.25;
  const lead = size * 1.36;
  let y = top - size;
  if (s.intro) {
    for (const l of wrap(s.intro, c.fonts.regular, size, CW)) {
      text(c, page, l, M, y, size, { color: MUTED });
      y -= lead;
    }
    y -= 6;
  }
  for (const it of s.items) {
    const lines = wrap(it, c.fonts.regular, size, CW - 16);
    if (s.check) page.drawRectangle({ x: M, y: y - 1, width: size * 0.85, height: size * 0.85, borderColor: BRAND, borderWidth: 0.9 });
    else page.drawCircle({ x: M + 3, y: y + size * 0.32, size: 1.7, color: ACCENT });
    lines.forEach((l, i) => {
      text(c, page, l, M + 16, y, size);
      if (i < lines.length - 1) y -= lead;
    });
    y -= lead + size * 0.7;
  }
  if (s.note) {
    const ns = size - 1;
    const lines = wrap(s.note, c.fonts.regular, ns, CW - 16);
    const bh = lines.length * ns * 1.36 + 10;
    page.drawRectangle({ x: M, y: y - bh + ns + 2, width: CW, height: bh, color: BAND });
    lines.forEach((l, i) => text(c, page, l, M + 8, y - 3 - i * ns * 1.36, ns, { color: INK }));
    y -= bh + 4;
  }
  return y;
};

const qrPng = (url: string) => QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 300 });

// ─── Pages ───────────────────────────────────────────────────────────────

const cover = (c: Ctx, personal: PocketPersonal | null) => {
  const page = c.pdf.addPage(A5);
  page.drawRectangle({ x: 0, y: H * 0.42, width: W, height: H * 0.58, color: BRAND });
  // self-drawn decoration: a few rings (no third-party artwork)
  for (const [x, y, r, o] of [
    [W - 40, H - 60, 90, 0.08],
    [W - 10, H * 0.5, 60, 0.1],
    [40, H * 0.47, 30, 0.12],
  ] as const) page.drawCircle({ x, y, size: r, borderColor: WHITE, borderWidth: 10, borderOpacity: o });
  text(c, page, c.f.brand.toUpperCase(), M, H - 52, 12, { bold: true, color: WHITE });
  let y = H * 0.42 + 150;
  // never break inside a word ("Deutschland-Taschenguide"): smaller type instead
  let ts = 30;
  while (ts > 18 && c.t.title.split(/\s+/).some((w) => c.fonts.bold.widthOfTextAtSize(w, ts) > CW)) ts -= 1;
  for (const l of wrap(c.t.title, c.fonts.bold, ts, CW)) {
    text(c, page, l, M, y, ts, { bold: true, color: WHITE });
    y -= ts * 1.2;
  }
  y -= 4;
  for (const l of wrap(c.t.subtitle, c.fonts.regular, 12.5, CW)) {
    text(c, page, l, M, y, 12.5, { color: WHITE });
    y -= 17;
  }
  page.drawRectangle({ x: 0, y: H * 0.42 - 4, width: W, height: 4, color: ACCENT });
  let by = H * 0.42 - 44;
  if (personal?.name) {
    text(c, page, c.t.preparedFor, M, by, 10, { color: MUTED });
    by -= 22;
    text(c, page, fit(personal.name, c.fonts.bold, 18, CW), M, by, 18, { bold: true });
    by -= 30;
  }
  text(c, page, c.t.edition(c.f.asOf), M, by, 10, { color: MUTED });
  text(c, page, c.t.language, M, by - 16, 10, { color: MUTED });
  text(c, page, c.f.domain, M, 44, 11, { bold: true, color: BRAND });
  text(c, page, c.f.phone, M, 28, 10, { color: MUTED });
};

const emergencyPage = (c: Ctx, personal: PocketPersonal | null) => {
  const e = c.t.emergency;
  const page = newPage(c, e.title, 2);
  let y = BODY_TOP;
  const boxH = personal?.employer ? 52 : 60;
  for (const r of e.rows) {
    page.drawRectangle({ x: M, y: y - boxH + 10, width: CW, height: boxH - 6, color: BAND });
    const numSize = 21;
    text(c, page, r.number, M + 10, y - 22, numSize, { bold: true, color: r.number === '112' ? DANGER : BRAND });
    const tx = M + 112;
    text(c, page, fit(r.label, c.fonts.bold, 10, CW - 120), tx, y - 8, 10, { bold: true });
    wrap(r.note, c.fonts.regular, 7.6, CW - 120)
      .slice(0, 3)
      .forEach((l, i) => text(c, page, l, tx, y - 20 - i * 9.6, 7.6, { color: MUTED }));
    y -= boxH;
  }
  y -= 4;
  text(c, page, e.embassy, M, y, 9.5, { bold: true });
  y -= 13;
  text(c, page, `${EMBASSY.phone} · ${EMBASSY.website.replace(/^https:\/\//, '')}`, M, y, 9);
  y -= 12;
  text(c, page, fit(`${e.consular}: ${EMBASSY.consular.phone} · ${EMBASSY.consular.address}`, c.fonts.regular, 8.5, CW), M, y, 8.5);
  y -= 18;
  text(c, page, `${e.support}: ${c.f.phone}`, M, y, 9.5, { bold: true, color: BRAND });
  y -= 18;
  const emp = personal?.employer;
  if (emp && (emp.name || emp.address || emp.phone)) {
    page.drawRectangle({ x: M, y: y - 44, width: CW, height: 52, borderColor: ACCENT, borderWidth: 1 });
    text(c, page, e.myEmployer, M + 8, y - 6, 8, { color: MUTED });
    if (emp.name) text(c, page, fit(emp.name, c.fonts.bold, 10, CW - 16), M + 8, y - 19, 10, { bold: true });
    const sub = [emp.address, emp.phone].filter(Boolean).join(' · ');
    if (sub) text(c, page, fit(sub, c.fonts.regular, 8.5, CW - 16), M + 8, y - 32, 8.5);
    y -= 60;
  }
  wrap(e.sayHelp, c.fonts.regular, 8.5, CW)
    .slice(0, 3)
    .forEach((l, i) => text(c, page, l, M, Math.max(BODY_BOTTOM, y - i * 11.5), 8.5, { color: MUTED }));
};

const firstDaysPage = async (c: Ctx, personal: PocketPersonal | null) => {
  const page = newPage(c, c.t.firstDays.title, 3);
  const b = buergeramtFor(personal?.city);
  const label = personal ? `${c.t.buergeramt}${b.city ? ` (${b.city})` : ''}` : c.t.buergeramt;
  const url = personal ? b.url : FEDERAL_ANMELDUNG_URL;
  // Bürgeramt box with QR at the bottom
  const boxH = 64;
  page.drawRectangle({ x: M, y: BODY_BOTTOM, width: CW, height: boxH, color: BAND });
  const qr = await c.pdf.embedPng(await qrPng(url));
  page.drawImage(qr, { x: W - M - boxH + 6, y: BODY_BOTTOM + 4, width: boxH - 8, height: boxH - 8 });
  text(c, page, fit(label, c.fonts.bold, 9.5, CW - boxH - 10), M + 8, BODY_BOTTOM + boxH - 16, 9.5, { bold: true, color: BRAND });
  wrap(url.replace(/^https:\/\//, ''), c.fonts.regular, 7.2, CW - boxH - 14)
    .slice(0, 4)
    .forEach((l, i) => text(c, page, l, M + 8, BODY_BOTTOM + boxH - 30 - i * 9, 7.2));
  drawSection(c, page, c.t.firstDays, BODY_TOP, BODY_BOTTOM + boxH + 8);
};

const phrasePages = (c: Ctx) => {
  const per = [14, 13, 13];
  let idx = 0;
  per.forEach((count, p) => {
    const page = newPage(c, c.t.phrasesTitle(p + 1), 4 + p);
    let y = BODY_TOP;
    if (p === 0) {
      text(c, page, fit(c.t.phrasesIntro, c.fonts.regular, 8, CW), M, y - 8, 8, { color: MUTED });
      y -= 18;
    }
    const rowH = (y - BODY_BOTTOM) / count;
    for (let i = 0; i < count; i++, idx++) {
      const [, de, az, ru, en, pronAz, pronRu] = POCKET_PHRASES[idx];
      const pron = c.lng === 'az' ? pronAz : c.lng === 'ru' ? pronRu : '';
      const meaning = c.lng === 'az' ? az : c.lng === 'ru' ? ru : c.lng === 'en' ? en : `${az} · ${ru}`;
      if (i % 2 === 0) page.drawRectangle({ x: M - 6, y: y - rowH + 4, width: CW + 12, height: rowH, color: BAND });
      text(c, page, fit(de, c.fonts.bold, 9.6, CW), M, y - 9, 9.6, { bold: true, color: BRAND });
      const second = pron ? `[${pron}]  ${meaning}` : meaning;
      let ss = 8.2;
      while (ss > 6.6 && c.fonts.regular.widthOfTextAtSize(second, ss) > CW) ss -= 0.2;
      text(c, page, fit(second, c.fonts.regular, ss, CW), M, y - 20.5, ss);
      y -= rowH;
    }
  });
};

const sectionPage = (c: Ctx, s: Section, n: number) => {
  const page = newPage(c, s.title, n);
  drawSection(c, page, s, BODY_TOP);
};

const linksPage = async (c: Ctx) => {
  const page = newPage(c, c.t.links.title, 13);
  text(c, page, c.t.links.intro, M, BODY_TOP - 8, 9, { color: MUTED });
  const cols = 2;
  const cellW = CW / cols;
  const qs = 92;
  let y = BODY_TOP - 22;
  for (let i = 0; i < QR_TOOLS.length; i++) {
    const path = QR_TOOLS[i];
    const col = i % cols;
    if (i && col === 0) y -= qs + 44;
    const x = M + col * cellW;
    const url = `${origin()}${localizedPath(path, c.lng)}`;
    const png = await c.pdf.embedPng(await qrPng(url));
    page.drawImage(png, { x: x + (cellW - qs) / 2, y: y - qs, width: qs, height: qs });
    const meta = STATIC_PAGES[path];
    const name = meta ? textIn(meta.name, c.lng) : path;
    const nl = fit(name, c.fonts.bold, 8.5, cellW - 8);
    text(c, page, nl, x + (cellW - c.fonts.bold.widthOfTextAtSize(nl, 8.5)) / 2, y - qs - 11, 8.5, { bold: true });
    const short = fit(`${c.f.domain}${localizedPath(path, c.lng)}`, c.fonts.regular, 7, cellW - 8);
    text(c, page, short, x + (cellW - c.fonts.regular.widthOfTextAtSize(short, 7)) / 2, y - qs - 21, 7, { color: MUTED });
  }
  text(c, page, `${c.t.links.website}: ${c.f.domain}`, M, BODY_BOTTOM + 14, 9.5, { bold: true, color: BRAND });
  text(c, page, `${c.t.links.phone}: ${c.f.phone}`, M, BODY_BOTTOM, 9.5, { bold: true, color: BRAND });
};

const notesPage = (c: Ctx, n: number) => {
  const page = newPage(c, c.t.notesTitle, n);
  for (let y = BODY_TOP - 18; y > BODY_BOTTOM; y -= 21) page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
};

const contactsPage = (c: Ctx, n: number) => {
  const page = newPage(c, c.t.contactsTitle, n);
  const rowH = (BODY_TOP - BODY_BOTTOM) / c.t.contactFields.length;
  c.t.contactFields.forEach((label, i) => {
    const y = BODY_TOP - i * rowH;
    text(c, page, label, M, y - 10, 8.5, { bold: true, color: BRAND });
    page.drawLine({ start: { x: M, y: y - 30 }, end: { x: W - M, y: y - 30 }, thickness: 0.5, color: LINE });
    page.drawLine({ start: { x: M, y: y - rowH + 8 }, end: { x: W - M, y: y - rowH + 8 }, thickness: 0.5, color: LINE });
  });
};

const backPage = (c: Ctx) => {
  const page = newPage(c, c.t.back.title, 16);
  const s: Section = { title: c.t.back.title, items: [c.t.back.sources, c.t.back.estimate, c.t.back.disclaimer] };
  const y = drawSection(c, page, s, BODY_TOP, 150);
  void y;
  page.drawRectangle({ x: 0, y: 30, width: W, height: 100, color: BRAND });
  text(c, page, c.f.brand.toUpperCase(), M, 100, 13, { bold: true, color: WHITE });
  text(c, page, c.f.domain, M, 80, 11, { color: WHITE });
  text(c, page, c.f.phone, M, 63, 11, { color: WHITE });
  text(c, page, `${c.t.edition(c.f.asOf)} · v${POCKET_GUIDE_VERSION}`, M, 44, 8, { color: WHITE });
};

// ─── Build ───────────────────────────────────────────────────────────────

/** The 16 A5 pages in reading order. */
export const buildPocketGuideA5 = async (lng: PocketLocale, personal: PocketPersonal | null = null, at = new Date()) => {
  const f = pocketFacts(lng, at);
  const t = POCKET_TEXT(f)[lng];
  const { pdf, fonts } = await createDoc({ title: `${t.title} — ${f.brand}`, author: f.brand, subject: t.subtitle, lang: lng });
  pdf.setCreator(`${f.brand} pocket guide`);
  const c: Ctx = { pdf, fonts, t, f, lng };
  cover(c, personal); // 1
  emergencyPage(c, personal); // 2
  await firstDaysPage(c, personal); // 3
  phrasePages(c); // 4–6
  sectionPage(c, t.waste, 7);
  sectionPage(c, t.tickets, 8);
  sectionPage(c, t.work, 9);
  sectionPage(c, t.doctor, 10);
  sectionPage(c, t.rent, 11);
  sectionPage(c, t.money, 12);
  await linksPage(c); // 13
  notesPage(c, 14);
  contactsPage(c, 15);
  backPage(c); // 16
  if (pdf.getPageCount() !== POCKET_PAGES) throw new Error(`POCKET_GUIDE_PAGES_${pdf.getPageCount()}`);
  return pdf;
};

/**
 * Saddle-stitch order of an n-page booklet (n divisible by 4), two pages per side: sheet s front = [n−2s, 1+2s],
 * back = [2+2s, n−1−2s] (1-based). Returns [left, right] per printed side, in print order.
 */
export const bookletOrder = (n: number): [number, number][] => {
  if (n % 4 !== 0) throw new Error('BOOKLET_PAGES_NOT_DIVISIBLE_BY_4');
  const out: [number, number][] = [];
  for (let s = 0; s < n / 4; s++) {
    out.push([n - 2 * s, 1 + 2 * s]);
    out.push([2 + 2 * s, n - 1 - 2 * s]);
  }
  return out;
};

/** A4 landscape imposition of the A5 pages for duplex printing (flip on the short edge), fold and staple. */
export const imposeBooklet = async (src: PDFDocument) => {
  const out = await PDFDocument.create();
  out.setTitle(src.getTitle() ?? 'Pocket guide');
  out.setProducer('Triad Vision');
  // Embed the SAVED pages: the subset fonts are only finalised by save(), live pages would lose their glyphs.
  const saved = await src.save();
  const embedded = await out.embedPdf(saved, src.getPages().map((_, i) => i));
  const half = A4L[0] / 2;
  for (const [l, r] of bookletOrder(embedded.length)) {
    const page = out.addPage(A4L);
    for (const [n, x0] of [
      [l, 0],
      [r, half],
    ] as const) {
      const e = embedded[n - 1];
      page.drawPage(e, { x: x0 + (half - e.width) / 2, y: (A4L[1] - e.height) / 2 });
    }
    // fold mark at the top and bottom edge
    page.drawLine({ start: { x: half, y: A4L[1] - 8 }, end: { x: half, y: A4L[1] }, thickness: 0.4, color: MUTED });
    page.drawLine({ start: { x: half, y: 0 }, end: { x: half, y: 8 }, thickness: 0.4, color: MUTED });
  }
  return out;
};

export const buildPocketGuide = async (lng: PocketLocale, layout: PocketLayout, personal: PocketPersonal | null = null, at = new Date()) => {
  const a5 = await buildPocketGuideA5(lng, personal, at);
  const doc = layout === 'booklet' ? await imposeBooklet(a5) : a5;
  return Buffer.from(await doc.save());
};

// ─── Cache of the generic PDFs ──────────────────────────────────────────

const cache = new Map<string, Promise<Buffer>>();

export const genericCacheKey = (lng: PocketLocale, layout: PocketLayout, at = new Date()) =>
  JSON.stringify([POCKET_GUIDE_VERSION, lng, layout, pocketFacts(lng, at), origin()]);

/** The generic (not personalised) PDF of a language / layout; cached until the version, a figure or the brand changes. */
export const genericPocketGuide = (lng: PocketLocale, layout: PocketLayout, at = new Date()) => {
  const key = genericCacheKey(lng, layout, at);
  let hit = cache.get(key);
  if (!hit) {
    if (cache.size > 32) cache.clear();
    hit = buildPocketGuide(lng, layout, null, at).catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, hit);
  }
  return hit;
};

export const clearPocketGuideCache = () => cache.clear();
