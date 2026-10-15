import crypto from 'node:crypto';
import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';

const TRANSLIT: Record<string, string> = {
  ə: 'e', Ə: 'E', ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Standard PDF fonts only cover WinAnsi; transliterate everything else so names never break the PDF. */
export const safeText = (font: PDFFont, text: string) =>
  [...text]
    .map((ch) => {
      const lower = ch.toLowerCase();
      const mapped = TRANSLIT[ch] ?? (TRANSLIT[lower] !== undefined ? TRANSLIT[lower].toUpperCase() : ch);
      try {
        font.encodeText(mapped);
        return mapped;
      } catch {
        return '?';
      }
    })
    .join('');

export interface SignatureInfo {
  caseNumber: string;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  ip: string;
  userAgent: string;
  signaturePng: Buffer;
}

/**
 * Appends a signature certificate page to the contract and returns the new PDF.
 * The SHA-256 of the original contract is printed so the signed copy can be matched to what was sent.
 */
export const signContractPdf = async (original: Buffer, info: SignatureInfo) => {
  const originalHash = crypto.createHash('sha256').update(original).digest('hex');
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const signature = await pdf.embedPng(info.signaturePng);

  const page = pdf.addPage([595.28, 841.89]); // A4
  const navy = rgb(0.043, 0.122, 0.267);
  const grey = rgb(0.36, 0.42, 0.53);
  let y = 780;

  page.drawRectangle({ x: 0, y: 800, width: 595.28, height: 41.89, color: navy });
  page.drawText('TRIAD VISION', { x: 40, y: 815, size: 16, font: bold, color: rgb(1, 1, 1) });
  y = 760;
  page.drawText('Elektron imza sertifikati / Elektronische Signatur / Electronic signature', {
    x: 40, y, size: 12, font: bold, color: navy,
  });
  y -= 36;

  const rows: [string, string][] = [
    ['Case / Akte', info.caseNumber],
    ['Signer / Unterzeichner', info.signerName],
    ['E-mail', info.signerEmail],
    ['Signed at (UTC)', info.signedAt.toISOString().replace('T', ' ').slice(0, 19)],
    ['IP address', info.ip],
    ['User agent', info.userAgent.slice(0, 90)],
    ['Original SHA-256', originalHash.slice(0, 32)],
    ['', originalHash.slice(32)],
  ];
  for (const [label, value] of rows) {
    page.drawText(safeText(font, label), { x: 40, y, size: 9, font: bold, color: grey });
    page.drawText(safeText(font, value), { x: 170, y, size: 10, font, color: navy });
    y -= 20;
  }

  y -= 20;
  page.drawText('Signature / Imza / Unterschrift:', { x: 40, y, size: 10, font: bold, color: navy });
  const dims = signature.scaleToFit(300, 120);
  y -= dims.height + 10;
  page.drawRectangle({ x: 38, y: y - 4, width: 304, height: dims.height + 8, borderColor: grey, borderWidth: 0.5 });
  page.drawImage(signature, { x: 40, y, width: dims.width, height: dims.height });

  y -= 40;
  const statement = [
    'The signer confirmed that they read the contract above and agree to its terms,',
    'and signed it electronically in the Triad Vision client portal after logging in.',
    'Imzalayan sexs yuxaridaki muqavileni oxudugunu ve sertlerle razi oldugunu tesdiq edir.',
    'Der Unterzeichner bestaetigt, den obigen Vertrag gelesen zu haben und ihm zuzustimmen.',
  ];
  for (const line of statement) {
    page.drawText(line, { x: 40, y, size: 9, font, color: grey });
    y -= 14;
  }

  const bytes = await pdf.save();
  return { pdf: Buffer.from(bytes), originalHash };
};
