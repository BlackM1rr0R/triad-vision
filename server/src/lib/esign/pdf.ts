import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { SignatureEventType, SignerRole } from '@prisma/client';
import { safeText } from '../pdfSign.js';

/**
 * Final PDF of a completed signature request: the original pages untouched, then a signature page
 * (every signature with name, role and UTC time) and a certificate of completion (audit trail and
 * hashes). Standard fonts only cover WinAnsi, so Azerbaijani and Cyrillic text is transliterated
 * (see safeText). Labels are German / English.
 */

const A4: [number, number] = [595.28, 841.89];
const M = 40;
const NAVY = rgb(0.043, 0.122, 0.267);
const GREY = rgb(0.36, 0.42, 0.53);
const LINE = rgb(0.85, 0.88, 0.93);
const GREEN = rgb(0.07, 0.55, 0.31);

export const ROLE_LABEL: Record<SignerRole, string> = {
  CANDIDATE: 'Kandidat / Candidate',
  COMPANY: 'Arbeitgeber / Employer',
  STAFF: 'Triad Vision',
  OTHER: 'Weitere Partei / Other party',
};

const EVENT_LABEL: Record<SignatureEventType, string> = {
  CREATED: 'Erstellt / Created',
  SENT: 'Gesendet / Sent',
  VIEWED: 'Angesehen / Viewed',
  OTP_SENT: 'Code gesendet / Code sent',
  OTP_VERIFIED: 'Identität bestätigt / Identity verified',
  SIGNED: 'Unterschrieben / Signed',
  DECLINED: 'Abgelehnt / Declined',
  REMINDED: 'Erinnert / Reminded',
  COMPLETED: 'Abgeschlossen / Completed',
  CANCELLED: 'Storniert / Cancelled',
  EXPIRED: 'Abgelaufen / Expired',
  DOWNLOADED: 'Heruntergeladen / Downloaded',
};

export const LEGAL_DE =
  'Einfache elektronische Signatur gemäß Art. 3 Nr. 10 und Art. 25 Abs. 1 der Verordnung (EU) Nr. 910/2014 (eIDAS). Keine qualifizierte elektronische Signatur. Die Identität der Unterzeichnenden wurde per E-Mail-Code bzw. Portal-Anmeldung geprüft; alle Schritte sind oben protokolliert.';
export const LEGAL_EN =
  'Simple electronic signature under Art. 3(10) and Art. 25(1) of Regulation (EU) No 910/2014 (eIDAS). Not a qualified electronic signature. Signers were identified by an emailed one-time code or by their portal login; every step is logged above.';

export interface PdfSigner {
  name: string;
  email: string;
  role: SignerRole;
  order: number;
  signedAt: Date | null;
  mode: 'DRAW' | 'TYPE' | null;
  imagePng?: Buffer | null;
  typedName?: string | null;
  authMethod?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface PdfEvent {
  at: Date;
  type: SignatureEventType;
  who: string;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface FinalPdfInput {
  original: Buffer;
  requestId: string;
  title: string;
  originalName: string;
  originalSha256: string;
  createdAt: Date;
  sentAt: Date | null;
  completedAt: Date;
  order: 'SEQUENTIAL' | 'PARALLEL';
  signers: PdfSigner[];
  events: PdfEvent[];
}

export const utc = (d: Date | null | undefined) => (d ? `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC` : '-');

const shortUa = (ua?: string | null) => {
  if (!ua) return '-';
  const s = ua.replace(/\s+/g, ' ').trim();
  return s.length > 70 ? `${s.slice(0, 67)}...` : s;
};

const authLabel = (m?: string | null) => (m === 'PORTAL' ? 'Portal-Anmeldung / portal login' : m === 'EMAIL_OTP' ? 'E-Mail-Code / email code' : '-');

/** Splits text into lines that fit `width` (long words are cut). */
const wrap = (font: PDFFont, text: string, size: number, width: number) => {
  const out: string[] = [];
  for (const para of safeText(font, text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
};

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private pdf: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    private heading: string,
    private subtitle: string,
  ) {}

  newPage() {
    this.page = this.pdf.addPage(A4);
    this.page.drawRectangle({ x: 0, y: A4[1] - 42, width: A4[0], height: 42, color: NAVY });
    this.page.drawText('TRIAD VISION', { x: M, y: A4[1] - 27, size: 15, font: this.bold, color: rgb(1, 1, 1) });
    const sub = safeText(this.font, this.subtitle).slice(0, 80);
    this.page.drawText(sub, { x: A4[0] - M - this.font.widthOfTextAtSize(sub, 8), y: A4[1] - 26, size: 8, font: this.font, color: rgb(0.8, 0.85, 0.95) });
    this.y = A4[1] - 74;
    this.page.drawText(safeText(this.bold, this.heading), { x: M, y: this.y, size: 14, font: this.bold, color: NAVY });
    this.y -= 24;
  }

  ensure(h: number) {
    if (this.y - h < 50) this.newPage();
  }

  text(s: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = opts.size ?? 9;
    const f = opts.bold ? this.bold : this.font;
    const x = opts.x ?? M;
    const lines = wrap(f, s, size, opts.width ?? A4[0] - x - M);
    for (const l of lines) {
      this.ensure(size + 4);
      this.page.drawText(l, { x, y: this.y, size, font: f, color: opts.color ?? NAVY });
      this.y -= size + (opts.gap ?? 4);
    }
  }

  row(label: string, value: string, labelWidth = 150) {
    const lines = wrap(this.font, value || '-', 9, A4[0] - M - labelWidth - M);
    this.ensure(lines.length * 13 + 2);
    this.page.drawText(safeText(this.bold, label), { x: M, y: this.y, size: 8, font: this.bold, color: GREY });
    for (const l of lines) {
      this.page.drawText(l, { x: M + labelWidth, y: this.y, size: 9, font: this.font, color: NAVY });
      this.y -= 13;
    }
    this.y -= 2;
  }

  /** One line of cells [x, text, maxWidth, bold]; text that does not fit is cut with "...". */
  cells(cols: [number, string, number, boolean][], size: number, color: ReturnType<typeof rgb>) {
    this.ensure(size + 4);
    for (const [x, raw, width, isBold] of cols) {
      const f = isBold ? this.bold : this.font;
      let t = safeText(f, raw);
      if (f.widthOfTextAtSize(t, size) > width) {
        while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
        t = `${t}...`;
      }
      this.page.drawText(t, { x, y: this.y, size, font: f, color });
    }
    this.y -= size + 4;
  }

  rule() {
    this.ensure(10);
    this.page.drawLine({ start: { x: M, y: this.y + 4 }, end: { x: A4[0] - M, y: this.y + 4 }, thickness: 0.6, color: LINE });
    this.y -= 8;
  }
}

/** Appends the signature page(s); returns the bytes of "original + signature page". */
const addSignaturePages = async (pdf: PDFDocument, input: FinalPdfInput) => {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const w = new Writer(pdf, font, bold, 'Unterschriften / Signatures', input.title);
  w.newPage();
  w.text(`Dokument / Document: ${input.title}`, { size: 10, bold: true });
  w.text(`Datei / File: ${input.originalName}  ·  ID: ${input.requestId}`, { size: 8, color: GREY });
  w.y -= 8;

  const images = new Map<number, PDFImage>();
  for (const [i, s] of input.signers.entries()) {
    if (s.mode === 'DRAW' && s.imagePng) images.set(i, await pdf.embedPng(s.imagePng));
  }

  const BLOCK = 128;
  for (const [i, s] of input.signers.entries()) {
    w.ensure(BLOCK);
    const top = w.y;
    const p = w.page;
    p.drawRectangle({ x: M, y: top - BLOCK + 14, width: A4[0] - 2 * M, height: BLOCK - 6, borderColor: LINE, borderWidth: 0.8 });
    p.drawText(safeText(bold, ROLE_LABEL[s.role].toUpperCase()), { x: M + 12, y: top, size: 7.5, font: bold, color: GREY });
    p.drawText(safeText(bold, s.name), { x: M + 12, y: top - 14, size: 11, font: bold, color: NAVY });
    // signature area
    const boxX = M + 12;
    const boxY = top - 92;
    p.drawLine({ start: { x: boxX, y: boxY - 2 }, end: { x: boxX + 250, y: boxY - 2 }, thickness: 0.6, color: GREY });
    const img = images.get(i);
    if (img) {
      const dims = img.scaleToFit(250, 62);
      p.drawImage(img, { x: boxX, y: boxY, width: dims.width, height: dims.height });
    } else if (s.typedName) {
      const typed = safeText(script, s.typedName);
      let size = 28;
      while (size > 12 && script.widthOfTextAtSize(typed, size) > 250) size -= 1;
      p.drawText(typed, { x: boxX, y: boxY + 10, size, font: script, color: NAVY });
    }
    const infoX = M + 290;
    const info: [string, string][] = [
      ['Unterschrieben am / Signed at', utc(s.signedAt)],
      ['Art / Method', s.mode === 'TYPE' ? 'Getippter Name / typed name' : 'Gezeichnet / drawn'],
      ['Identität / Identity', authLabel(s.authMethod)],
    ];
    let iy = top - 34;
    for (const [label, value] of info) {
      p.drawText(safeText(bold, label), { x: infoX, y: iy, size: 7, font: bold, color: GREY });
      p.drawText(safeText(font, value), { x: infoX, y: iy - 10, size: 8.5, font, color: NAVY });
      iy -= 24;
    }
    if (s.signedAt) p.drawText('SIGNED', { x: A4[0] - M - 50, y: top, size: 8, font: bold, color: GREEN });
    w.y = top - BLOCK;
  }
  w.y -= 4;
  w.text('Die Unterschriften wurden elektronisch geleistet; Details siehe Abschlusszertifikat auf der folgenden Seite.', { size: 8, color: GREY });
  w.text('The signatures were given electronically; see the certificate of completion on the next page for details.', { size: 8, color: GREY });
  return Buffer.from(await pdf.save());
};

/** Appends the certificate of completion (audit trail) page(s). */
const addCertificate = async (pdf: PDFDocument, input: FinalPdfInput, signedContentSha256: string) => {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold, 'Abschlusszertifikat / Certificate of completion', input.title);
  w.newPage();

  w.row('Dokument / Document', input.title);
  w.row('Datei / File', input.originalName);
  w.row('Anfrage-ID / Request ID', input.requestId);
  w.row('Reihenfolge / Order', input.order === 'SEQUENTIAL' ? 'Nacheinander / sequential' : 'Parallel / parallel');
  w.row('Erstellt / Created', utc(input.createdAt));
  w.row('Gesendet / Sent', utc(input.sentAt));
  w.row('Abgeschlossen / Completed', utc(input.completedAt));
  w.row('SHA-256 Original', input.originalSha256);
  w.row('SHA-256 signiert / signed', signedContentSha256);
  w.text('("signiert" = Original + Unterschriftenseite / "signed" = original + signature page)', { size: 7.5, color: GREY, x: M + 150 });
  w.text('Der SHA-256-Wert dieser finalen Datei wird bei Triad Vision gespeichert und in der Abschluss-E-Mail genannt. / The SHA-256 of this final file is stored by Triad Vision and stated in the completion email.', {
    size: 7.5,
    color: GREY,
  });
  w.y -= 6;
  w.rule();

  w.text('Unterzeichnende / Signers', { size: 10, bold: true, gap: 6 });
  for (const s of input.signers) {
    w.ensure(30);
    w.cells([[M, `${s.order}. ${s.name}`, 200, true], [M + 205, ROLE_LABEL[s.role], 120, false], [M + 330, s.email, 185, false]], 8.5, NAVY);
    w.cells(
      [
        [M + 12, `Signed: ${utc(s.signedAt)}`, 160, false],
        [M + 175, authLabel(s.authMethod), 150, false],
        [M + 330, `IP ${s.ip ?? '-'}`, 70, false],
        [M + 405, shortUa(s.userAgent), 110, false],
      ],
      7,
      GREY,
    );
    w.y -= 3;
  }
  w.rule();

  w.text('Protokoll / Audit trail', { size: 10, bold: true, gap: 6 });
  w.cells([[M, 'Zeit / Time (UTC)', 90, true], [M + 92, 'Ereignis / Event', 120, true], [M + 215, 'Person', 120, true], [M + 338, 'IP', 64, true], [M + 405, 'Browser', 110, true]], 6.5, GREY);
  for (const e of input.events) {
    w.ensure(11);
    w.cells(
      [
        [M, utc(e.at).replace(' UTC', ''), 90, false],
        [M + 92, EVENT_LABEL[e.type], 120, false],
        [M + 215, e.who, 120, false],
        [M + 338, e.ip ?? '-', 64, false],
        [M + 405, e.userAgent ? shortUa(e.userAgent) : '-', 110, false],
      ],
      6.5,
      NAVY,
    );
  }
  w.y -= 6;
  w.rule();
  w.text(LEGAL_DE, { size: 7.5, color: GREY });
  w.y -= 2;
  w.text(LEGAL_EN, { size: 7.5, color: GREY });
};

/** Builds the final PDF. `signedContentSha256` = hash of the original + signature page (before the certificate). */
export const buildFinalPdf = async (input: FinalPdfInput) => {
  const doc = await PDFDocument.load(input.original);
  const withSignatures = await addSignaturePages(doc, input);
  const signedContentSha256 = crypto.createHash('sha256').update(withSignatures).digest('hex');
  const doc2 = await PDFDocument.load(withSignatures);
  await addCertificate(doc2, input, signedContentSha256);
  const pdf = Buffer.from(await doc2.save());
  return { pdf, signedContentSha256, sha256: crypto.createHash('sha256').update(pdf).digest('hex') };
};
