import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { safeText } from '../pdfSign.js';
import { imageKind, isPdfBytes, jpegOrientation, orientationRotation } from './image.js';

/**
 * Embassy package PDF (pure: files come in as buffers). Layout:
 *   1. cover sheet — Triad Vision header, applicant, passport no., visa type, appointment, case number, contact
 *   2. table of contents (one or more pages) with the page range of every section
 *   3. the sections in checklist order, each (optionally) behind a small separator sheet, repeated `copies` times
 * Every page is A4 (portrait, or landscape for landscape content): A4 PDF pages are copied as they are,
 * other PDF page sizes are scaled onto A4, JPEG/PNG images are fitted (aspect kept, EXIF orientation applied).
 * Files that cannot be embedded get a notice page instead. No image re-encoding (sharp is not a dependency).
 */

export const A4 = { w: 595.28, h: 841.89 } as const;
const NAVY = rgb(0.043, 0.122, 0.267);
const BLUE = rgb(0.082, 0.396, 0.91);
const GREY = rgb(0.36, 0.42, 0.53);
const LIGHT = rgb(0.93, 0.95, 0.98);
const WHITE = rgb(1, 1, 1);
const MARGIN = 44;
const IMG_MARGIN = 22;
const TOC_ROWS_FIRST = 26;
const TOC_ROWS_NEXT = 32;

export interface PackageFile {
  name: string;
  mimeType: string;
  /** null when the file is missing on disk. */
  bytes: Buffer | null;
}

export interface PackageSection {
  key: string;
  documentId: string | null;
  /** German label from the embassy checklist (or the requirement title). */
  title: string;
  file: PackageFile;
  copies: number;
}

export interface PackageInfo {
  caseNumber: string;
  applicant: string;
  passportNumber: string | null;
  visaType: string;
  appointment: string | null;
  appointmentPlace: string | null;
  contact: { company: string; phone: string; email: string; staff: string | null };
  date: Date;
  separators: boolean;
  /** Checklist items that are not part of the PDF (originals, fee …), listed on the contents page. */
  bringSeparately: string[];
}

export interface PackageEntry {
  key: string;
  documentId: string | null;
  title: string;
  /** 1-based first page of the section (its separator sheet when enabled). */
  startPage: number;
  endPage: number;
  /** Content pages of ONE copy (without separator). */
  pages: number;
  copies: number;
  note: 'NOT_EMBEDDABLE' | 'FILE_MISSING' | null;
  /** ZIP option: the section's own file (shown instead of page numbers). */
  file?: string;
}

const NOTE_DE: Record<NonNullable<PackageEntry['note']>, string> = {
  NOT_EMBEDDABLE: 'Dieses Dateiformat kann nicht in die PDF übernommen werden – bitte separat beilegen.',
  FILE_MISSING: 'Datei nicht gefunden – bitte separat beilegen.',
};

const near = (a: number, b: number) => Math.abs(a - b) < 3;
const isA4 = (w: number, h: number) => (near(w, A4.w) && near(h, A4.h)) || (near(w, A4.h) && near(h, A4.w));

const txt = (page: PDFPage, font: PDFFont, s: string, x: number, y: number, size: number, color = NAVY) =>
  page.drawText(safeText(font, s), { x, y, size, font, color });

const fit = (font: PDFFont, s: string, size: number, width: number) => {
  let t = safeText(font, s);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
};

const wrap = (font: PDFFont, s: string, size: number, maxWidth: number) => {
  const lines: string[] = [];
  let line = '';
  for (const w of safeText(font, s).split(/\s+/)) {
    const c = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(c, size) <= maxWidth) line = c;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
};

/** Placement of content (display size w×h, after rotation) on an A4 page of matching orientation. */
const placeOnA4 = (w: number, h: number, margin: number) => {
  const landscape = w > h;
  const pageW = landscape ? A4.h : A4.w;
  const pageH = landscape ? A4.w : A4.h;
  const scale = Math.min((pageW - 2 * margin) / w, (pageH - 2 * margin) / h);
  const dw = w * scale;
  const dh = h * scale;
  return { pageW, pageH, x: (pageW - dw) / 2, y: (pageH - dh) / 2, dw, dh, scale };
};

/**
 * Draw origin for content of stored size (w×h) that must be turned `rot` degrees clockwise to be upright, so
 * that its upright bounding box starts at (bx, by). pdf-lib rotates counter-clockwise around the origin.
 */
const rotatedOrigin = (rot: 0 | 90 | 180 | 270, bx: number, by: number, w: number, h: number) => {
  if (rot === 90) return { x: bx, y: by + w, rotate: degrees(-90) };
  if (rot === 180) return { x: bx + w, y: by + h, rotate: degrees(180) };
  if (rot === 270) return { x: bx + h, y: by, rotate: degrees(90) };
  return { x: bx, y: by, rotate: degrees(0) };
};

interface Fonts {
  font: PDFFont;
  bold: PDFFont;
}

const band = (page: PDFPage, f: Fonts, right?: string) => {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 44, width, height: 44, color: NAVY });
  txt(page, f.bold, 'TRIAD VISION', MARGIN, height - 28, 16, WHITE);
  if (right) {
    const r = fit(f.bold, right, 10, width / 2);
    page.drawText(r, { x: width - MARGIN - f.bold.widthOfTextAtSize(r, 10), y: height - 26, size: 10, font: f.bold, color: WHITE });
  }
};

const noticePage = (pdf: PDFDocument, f: Fonts, title: string, fileName: string, note: string) => {
  const page = pdf.addPage([A4.w, A4.h]);
  page.drawRectangle({ x: MARGIN, y: A4.h / 2 - 60, width: A4.w - 2 * MARGIN, height: 120, borderColor: GREY, borderWidth: 0.8, color: LIGHT });
  txt(page, f.bold, fit(f.bold, title, 14, A4.w - 2 * MARGIN - 40), MARGIN + 20, A4.h / 2 + 30, 14);
  txt(page, f.font, fit(f.font, fileName, 9, A4.w - 2 * MARGIN - 40), MARGIN + 20, A4.h / 2 + 10, 9, GREY);
  wrap(f.font, note, 11, A4.w - 2 * MARGIN - 40).slice(0, 3).forEach((l, i) => txt(page, f.font, l, MARGIN + 20, A4.h / 2 - 16 - i * 15, 11));
  return 1;
};

/** Content of one file appended to `pdf`; returns the number of pages added (≥ 1) and a note when it fell back. */
const appendFile = async (pdf: PDFDocument, f: Fonts, title: string, file: PackageFile): Promise<{ pages: number; note: PackageEntry['note'] }> => {
  if (!file.bytes) return { pages: noticePage(pdf, f, title, file.name, NOTE_DE.FILE_MISSING), note: 'FILE_MISSING' };
  const bytes = file.bytes;
  if (file.mimeType === 'application/pdf' || isPdfBytes(bytes)) {
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const indices = src.getPageIndices();
      if (!indices.length) throw new Error('empty');
      let added = 0;
      for (const i of indices) {
        const sp = src.getPage(i);
        const { width, height } = sp.getSize();
        const rot = (((sp.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
        if (isA4(width, height)) {
          const [copied] = await pdf.copyPages(src, [i]);
          pdf.addPage(copied);
        } else {
          // Other page sizes (Letter, scans at odd sizes …) are scaled onto A4.
          const embedded = await pdf.embedPage(sp);
          const turned = rot === 90 || rot === 270;
          const box = placeOnA4(turned ? height : width, turned ? width : height, 0);
          const page = pdf.addPage([box.pageW, box.pageH]);
          const o = rotatedOrigin(rot, box.x, box.y, width * box.scale, height * box.scale);
          page.drawPage(embedded, { x: o.x, y: o.y, width: width * box.scale, height: height * box.scale, rotate: o.rotate });
        }
        added++;
      }
      return { pages: added, note: null };
    } catch {
      return { pages: noticePage(pdf, f, title, file.name, NOTE_DE.NOT_EMBEDDABLE), note: 'NOT_EMBEDDABLE' };
    }
  }
  const kind = imageKind(bytes);
  if (kind) {
    try {
      const image = kind === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const rot = kind === 'jpeg' ? orientationRotation(jpegOrientation(bytes)) : 0;
      const turned = rot === 90 || rot === 270;
      const box = placeOnA4(turned ? image.height : image.width, turned ? image.width : image.height, IMG_MARGIN);
      const page = pdf.addPage([box.pageW, box.pageH]);
      const w = image.width * box.scale;
      const h = image.height * box.scale;
      const o = rotatedOrigin(rot, box.x, box.y, w, h);
      page.drawImage(image, { x: o.x, y: o.y, width: w, height: h, rotate: o.rotate });
      return { pages: 1, note: null };
    } catch {
      /* fall through to the notice */
    }
  }
  return { pages: noticePage(pdf, f, title, file.name, NOTE_DE.NOT_EMBEDDABLE), note: 'NOT_EMBEDDABLE' };
};

const separatorPage = (pdf: PDFDocument, f: Fonts, info: PackageInfo, n: number, total: number, s: PackageSection, copy: number) => {
  const page = pdf.addPage([A4.w, A4.h]);
  band(page, f, info.caseNumber);
  page.drawRectangle({ x: MARGIN, y: A4.h - 250, width: A4.w - 2 * MARGIN, height: 150, color: LIGHT });
  page.drawRectangle({ x: MARGIN, y: A4.h - 250, width: 5, height: 150, color: BLUE });
  txt(page, f.font, `Unterlage ${n} von ${total}${s.copies > 1 ? ` · Kopie ${copy} von ${s.copies}` : ''}`, MARGIN + 22, A4.h - 130, 10, GREY);
  let y = A4.h - 162;
  for (const line of wrap(f.bold, s.title, 20, A4.w - 2 * MARGIN - 44).slice(0, 3)) {
    txt(page, f.bold, line, MARGIN + 22, y, 20);
    y -= 25;
  }
  txt(page, f.font, fit(f.font, s.file.name, 9, A4.w - 2 * MARGIN - 44), MARGIN + 22, A4.h - 238, 9, GREY);
};

const coverPage = (page: PDFPage, f: Fonts, info: PackageInfo) => {
  band(page, f);
  txt(page, f.bold, 'Antragsunterlagen – Nationales Visum', MARGIN, A4.h - 100, 20);
  txt(page, f.font, 'Deutsche Botschaft Baku', MARGIN, A4.h - 120, 11, GREY);
  page.drawLine({ start: { x: MARGIN, y: A4.h - 134 }, end: { x: A4.w - MARGIN, y: A4.h - 134 }, thickness: 1, color: NAVY });
  const rows: [string, string][] = [
    ['Antragsteller/in', info.applicant],
    ['Reisepass-Nr.', info.passportNumber || '—'],
    ['Visumart', info.visaType],
    ['Termin', info.appointment ? `${info.appointment}${info.appointmentPlace ? ` · ${info.appointmentPlace}` : ''}` : '—'],
    ['Aktenzeichen', info.caseNumber],
    ['Erstellt am', info.date.toLocaleDateString('de-DE', { timeZone: 'Asia/Baku', day: '2-digit', month: '2-digit', year: 'numeric' })],
  ];
  let y = A4.h - 170;
  for (const [k, v] of rows) {
    txt(page, f.bold, k, MARGIN, y, 10, GREY);
    const lines = wrap(f.font, v, 13, A4.w - MARGIN - 200).slice(0, 2);
    lines.forEach((l, i) => txt(page, f.font, l, 200, y - i * 16, 13));
    y -= 28 + (lines.length - 1) * 16;
  }
  // Contact box
  const boxY = 120;
  page.drawRectangle({ x: MARGIN, y: boxY, width: A4.w - 2 * MARGIN, height: 104, color: LIGHT });
  txt(page, f.bold, 'Kontakt / Ansprechpartner', MARGIN + 18, boxY + 80, 11);
  const contact = [info.contact.company, info.contact.staff ? `Sachbearbeitung: ${info.contact.staff}` : '', `Telefon: ${info.contact.phone}`, `E-Mail: ${info.contact.email}`].filter(Boolean);
  contact.forEach((l, i) => txt(page, f.font, l, MARGIN + 18, boxY + 60 - i * 15, 10));
};

const tocPageCount = (entries: number, extras: number) => {
  const rows = entries + (extras ? extras + 2 : 0);
  return rows <= TOC_ROWS_FIRST ? 1 : 1 + Math.ceil((rows - TOC_ROWS_FIRST) / TOC_ROWS_NEXT);
};

const drawToc = (pages: PDFPage[], f: Fonts, info: PackageInfo, entries: PackageEntry[]) => {
  let pi = 0;
  let page = pages[0];
  band(page, f, info.caseNumber);
  txt(page, f.bold, 'Inhaltsverzeichnis', MARGIN, A4.h - 92, 18);
  let y = A4.h - 124;
  let rows = 0;
  const next = () => {
    rows++;
    const limit = pi === 0 ? TOC_ROWS_FIRST : TOC_ROWS_NEXT;
    if (rows > limit && pi + 1 < pages.length) {
      pi++;
      rows = 1;
      page = pages[pi];
      band(page, f, info.caseNumber);
      txt(page, f.bold, 'Inhaltsverzeichnis (Fortsetzung)', MARGIN, A4.h - 92, 14);
      y = A4.h - 124;
    }
  };
  entries.forEach((e, i) => {
    next();
    const right = e.file ? fit(f.font, e.file, 10, 190) : e.startPage === e.endPage ? `S. ${e.startPage}` : `S. ${e.startPage}–${e.endPage}`;
    const rw = f.font.widthOfTextAtSize(right, 10);
    const label = `${i + 1}. ${e.title}${e.copies > 1 ? ` (${e.copies}×)` : ''}`;
    const l = fit(f.font, label, 10.5, A4.w - 2 * MARGIN - rw - 30);
    txt(page, f.font, l, MARGIN, y, 10.5);
    // dotted leader
    const from = MARGIN + f.font.widthOfTextAtSize(l, 10.5) + 6;
    const to = A4.w - MARGIN - rw - 6;
    for (let x = from; x < to; x += 4) page.drawCircle({ x, y: y + 2, size: 0.45, color: GREY });
    page.drawText(right, { x: A4.w - MARGIN - rw, y, size: 10, font: f.font, color: GREY });
    if (e.note) {
      y -= 12;
      txt(page, f.font, fit(f.font, NOTE_DE[e.note], 8, A4.w - 2 * MARGIN - 20), MARGIN + 16, y, 8, GREY);
    }
    y -= 19;
  });
  if (info.bringSeparately.length) {
    next();
    y -= 6;
    txt(page, f.bold, 'Separat vorzulegen (nicht in dieser PDF):', MARGIN, y, 10.5);
    y -= 19;
    for (const s of info.bringSeparately) {
      next();
      txt(page, f.font, fit(f.font, `• ${s}`, 10, A4.w - 2 * MARGIN - 10), MARGIN + 8, y, 10, GREY);
      y -= 17;
    }
  }
};

const footer = (pdf: PDFDocument, f: Fonts, caseNumber: string) => {
  const total = pdf.getPageCount();
  for (let i = 0; i < total; i++) {
    const page = pdf.getPage(i);
    const { width } = page.getSize();
    const label = `Seite ${i + 1} / ${total} · ${caseNumber}`;
    const w = f.font.widthOfTextAtSize(label, 7);
    page.drawRectangle({ x: width - MARGIN - w - 6, y: 8, width: w + 12, height: 12, color: WHITE, opacity: 0.85 });
    page.drawText(label, { x: width - MARGIN - w, y: 11, size: 7, font: f.font, color: GREY });
  }
};

const newDoc = async (title: string, date: Date) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor('Triad Vision');
  pdf.setProducer('Triad Vision');
  pdf.setCreationDate(date);
  pdf.setModificationDate(date);
  const f: Fonts = { font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  return { pdf, f };
};

const appendSection = async (pdf: PDFDocument, f: Fonts, info: PackageInfo, s: PackageSection, n: number, total: number) => {
  let pages = 0;
  let note: PackageEntry['note'] = null;
  for (let copy = 1; copy <= s.copies; copy++) {
    if (info.separators) separatorPage(pdf, f, info, n, total, s, copy);
    const r = await appendFile(pdf, f, s.title, s.file);
    pages = r.pages;
    note = r.note;
  }
  return { pages, note };
};

/** The whole package as one PDF. */
export const buildPackagePdf = async (info: PackageInfo, sections: PackageSection[]) => {
  const { pdf, f } = await newDoc(`${info.caseNumber} – Antragsunterlagen ${info.applicant}`, info.date);
  coverPage(pdf.addPage([A4.w, A4.h]), f, info);
  const tocPages = Array.from({ length: tocPageCount(sections.length, info.bringSeparately.length) }, () => pdf.addPage([A4.w, A4.h]));
  const entries: PackageEntry[] = [];
  for (const [i, s] of sections.entries()) {
    const startPage = pdf.getPageCount() + 1;
    const r = await appendSection(pdf, f, info, s, i + 1, sections.length);
    entries.push({ key: s.key, documentId: s.documentId, title: s.title, startPage, endPage: pdf.getPageCount(), pages: r.pages, copies: s.copies, note: r.note });
  }
  drawToc(tocPages, f, info, entries);
  footer(pdf, f, info.caseNumber);
  return { pdf: Buffer.from(await pdf.save({ useObjectStreams: true })), pages: pdf.getPageCount(), tocPages: tocPages.length, entries };
};

/**
 * One PDF per section (for the ZIP option) plus "00 cover + contents". The contents page lists the section
 * files instead of page numbers.
 */
export const buildPackageParts = async (info: PackageInfo, sections: PackageSection[], fileNameOf: (i: number, s: PackageSection) => string) => {
  const parts: { name: string; pdf: Buffer; pages: number }[] = [];
  const entries: PackageEntry[] = [];
  for (const [i, s] of sections.entries()) {
    const { pdf, f } = await newDoc(`${info.caseNumber} – ${s.title}`, info.date);
    const r = await appendSection(pdf, f, info, s, i + 1, sections.length);
    footer(pdf, f, info.caseNumber);
    const count = pdf.getPageCount();
    const name = fileNameOf(i, s);
    parts.push({ name, pdf: Buffer.from(await pdf.save({ useObjectStreams: true })), pages: count });
    entries.push({ key: s.key, documentId: s.documentId, title: s.title, startPage: 1, endPage: count, pages: r.pages, copies: s.copies, note: r.note, file: name });
  }
  const { pdf, f } = await newDoc(`${info.caseNumber} – Deckblatt`, info.date);
  coverPage(pdf.addPage([A4.w, A4.h]), f, info);
  const tocPages = Array.from({ length: tocPageCount(sections.length, info.bringSeparately.length) }, () => pdf.addPage([A4.w, A4.h]));
  drawToc(tocPages, f, info, entries);
  footer(pdf, f, info.caseNumber);
  parts.unshift({ name: '00_Deckblatt_Inhalt.pdf', pdf: Buffer.from(await pdf.save({ useObjectStreams: true })), pages: pdf.getPageCount() });
  return { parts, entries };
};
