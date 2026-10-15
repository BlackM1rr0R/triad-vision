import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { safeText } from '../pdfSign.js';

/**
 * Embassy packet: one PDF with a branded cover page (case data + table of contents), then every accepted
 * document in requirement order, each behind a divider page. Images are embedded scaled to A4, PDFs are
 * copied page by page, everything else is listed as "attached separately". Pure: files come in as buffers.
 */

export const A4: [number, number] = [595.28, 841.89];
const NAVY = rgb(0.043, 0.122, 0.267);
const GREY = rgb(0.36, 0.42, 0.53);
const LIGHT = rgb(0.93, 0.95, 0.98);
const WHITE = rgb(1, 1, 1);
const MARGIN = 40;

export interface PacketItem {
  /** Requirement title (already in the staff's language) */
  title: string;
  /** e.g. "Ilkin sənədlər" / stage label */
  section: string;
  originalName: string;
  mimeType: string;
  /** File bytes; undefined when the file is missing on disk. */
  bytes?: Buffer;
}

export interface PacketInfo {
  caseNumber: string;
  clientName: string;
  visaType: string;
  profession: string;
  date: Date;
  items: PacketItem[];
  /** Labels in the reader's language. */
  labels?: Partial<typeof DEFAULT_LABELS>;
}

export const DEFAULT_LABELS = {
  title: 'Səfirlik paketi / Botschaftsunterlagen / Embassy packet',
  case: 'Müraciət / Akte / Case',
  client: 'Müştəri / Antragsteller / Applicant',
  visa: 'Viza / Visum / Visa',
  profession: 'Peşə / Beruf / Profession',
  date: 'Tarix / Datum / Date',
  contents: 'Mündəricat / Inhalt / Contents',
  page: 'səh. / S. / p.',
  attachedSeparately: 'Ayrıca əlavə olunur / Separat beigefügt / Attached separately',
  notEmbeddable: 'Bu format PDF-ə daxil edilə bilmədi / Format kann nicht eingebettet werden / Format cannot be embedded',
  missingFile: 'Fayl tapılmadı / Datei fehlt / File missing',
  documentOf: 'Sənəd / Dokument / Document',
};

export interface PacketEntry {
  title: string;
  section: string;
  page: number;
  pages: number;
  note?: string;
}

const text = (page: PDFPage, font: PDFFont, s: string, x: number, y: number, size: number, color = NAVY) =>
  page.drawText(safeText(font, s), { x, y, size, font, color });

const header = (page: PDFPage, bold: PDFFont, sub?: string) => {
  page.drawRectangle({ x: 0, y: A4[1] - 42, width: A4[0], height: 42, color: NAVY });
  text(page, bold, 'TRIAD VISION', MARGIN, A4[1] - 27, 16, WHITE);
  if (sub) text(page, bold, sub, A4[0] - MARGIN - bold.widthOfTextAtSize(safeText(bold, sub), 10), A4[1] - 25, 10, WHITE);
};

const wrap = (font: PDFFont, s: string, size: number, maxWidth: number) => {
  const words = safeText(font, s).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const isPdf = (m: string) => m === 'application/pdf';
const isEmbeddableImage = (m: string) => m === 'image/jpeg' || m === 'image/png';

export const packetFileName = (caseNumber: string) => `${caseNumber}-sefirlik-paketi.pdf`;

export const buildPacket = async (info: PacketInfo) => {
  const L = { ...DEFAULT_LABELS, ...info.labels };
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${info.caseNumber} – ${L.title}`);
  pdf.setAuthor('Triad Vision');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Cover page first; its table of contents is drawn once every page number is known.
  const cover = pdf.addPage(A4);
  const entries: PacketEntry[] = [];

  for (let i = 0; i < info.items.length; i++) {
    const item = info.items[i];
    const divider = pdf.addPage(A4);
    const dividerIndex = pdf.getPageCount();
    header(divider, bold, info.caseNumber);
    divider.drawRectangle({ x: MARGIN, y: 520, width: A4[0] - 2 * MARGIN, height: 160, color: LIGHT });
    text(divider, font, `${L.documentOf} ${i + 1} / ${info.items.length} · ${item.section}`, MARGIN + 20, 650, 10, GREY);
    let y = 615;
    for (const line of wrap(bold, item.title, 20, A4[0] - 2 * MARGIN - 40).slice(0, 3)) {
      text(divider, bold, line, MARGIN + 20, y, 20);
      y -= 26;
    }
    text(divider, font, item.originalName.slice(0, 90), MARGIN + 20, 540, 9, GREY);

    let note: string | undefined;
    let pages = 0;
    if (!item.bytes) note = L.missingFile;
    else if (isPdf(item.mimeType)) {
      try {
        const src = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
        const copied = await pdf.copyPages(src, src.getPageIndices());
        for (const p of copied) pdf.addPage(p);
        pages = copied.length;
      } catch {
        note = L.notEmbeddable;
      }
    } else if (isEmbeddableImage(item.mimeType)) {
      try {
        const image = item.mimeType === 'image/png' ? await pdf.embedPng(item.bytes) : await pdf.embedJpg(item.bytes);
        const page = pdf.addPage(A4);
        const box = { w: A4[0] - 2 * MARGIN, h: A4[1] - 2 * MARGIN - 30 };
        const dims = image.scaleToFit(box.w, box.h);
        page.drawImage(image, { x: (A4[0] - dims.width) / 2, y: MARGIN + 15 + (box.h - dims.height) / 2, width: dims.width, height: dims.height });
        pages = 1;
      } catch {
        note = L.notEmbeddable;
      }
    } else {
      note = item.mimeType.startsWith('image/') ? L.notEmbeddable : L.attachedSeparately;
    }
    if (note) {
      divider.drawRectangle({ x: MARGIN, y: 470, width: A4[0] - 2 * MARGIN, height: 34, borderColor: GREY, borderWidth: 0.5 });
      text(divider, bold, note, MARGIN + 12, 482, 10, GREY);
    }
    entries.push({ title: item.title, section: item.section, page: dividerIndex, pages, note });
  }

  // Cover
  header(cover, bold);
  text(cover, bold, L.title, MARGIN, 740, 18);
  cover.drawLine({ start: { x: MARGIN, y: 728 }, end: { x: A4[0] - MARGIN, y: 728 }, thickness: 1, color: NAVY });
  const rows: [string, string][] = [
    [L.case, info.caseNumber],
    [L.client, info.clientName],
    [L.visa, info.visaType],
    [L.profession, info.profession],
    [L.date, info.date.toISOString().slice(0, 10)],
  ];
  let y = 700;
  for (const [k, v] of rows) {
    text(cover, bold, k, MARGIN, y, 9, GREY);
    text(cover, font, v, 230, y, 11);
    y -= 20;
  }
  y -= 16;
  text(cover, bold, L.contents, MARGIN, y, 12);
  y -= 8;
  cover.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.5, color: GREY });
  y -= 18;
  const total = pdf.getPageCount();
  let lastSection = '';
  for (const [i, e] of entries.entries()) {
    if (y < 70) break; // very long lists: the rest is still in the packet, just not on the cover
    if (e.section !== lastSection) {
      text(cover, bold, e.section, MARGIN, y, 9, GREY);
      y -= 15;
      lastSection = e.section;
    }
    const label = wrap(font, `${i + 1}. ${e.title}`, 10, 400)[0] ?? '';
    text(cover, font, label, MARGIN + 10, y, 10);
    const right = `${L.page} ${e.page}${e.pages > 1 ? `-${e.page + e.pages}` : ''}`;
    text(cover, font, right, A4[0] - MARGIN - font.widthOfTextAtSize(safeText(font, right), 10), y, 10, GREY);
    if (e.note) {
      y -= 12;
      text(cover, font, e.note, MARGIN + 22, y, 8, GREY);
    }
    y -= 16;
  }

  // Footer "n / N" on every page
  for (let i = 0; i < total; i++) {
    const page = pdf.getPage(i);
    const { width } = page.getSize();
    const label = `${i + 1} / ${total}`;
    page.drawText(label, { x: width / 2 - font.widthOfTextAtSize(label, 9) / 2, y: 18, size: 9, font, color: GREY });
    page.drawText(safeText(font, `Triad Vision · ${info.caseNumber}`), { x: MARGIN, y: 18, size: 8, font, color: GREY });
  }

  return { pdf: Buffer.from(await pdf.save()), pages: total, entries };
};
