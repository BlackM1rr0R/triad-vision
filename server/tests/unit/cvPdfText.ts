import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, type PDFPage } from 'pdf-lib';

/**
 * Text of a PDF drawn with embedded (fontkit) fonts: pdf-lib writes glyph ids as <HEX> Tj, so the codes are
 * mapped back to Unicode through each font's ToUnicode CMap (tracking the current font from `Tf`).
 */

const streamText = (s: unknown) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '');

const hexToUtf16 = (hex: string) => {
  const bytes = Buffer.from(hex, 'hex');
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes.readUInt16BE(i));
  return out;
};

const parseCMap = (cmap: string) => {
  const map = new Map<string, string>();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(m[1].toUpperCase(), hexToUtf16(m[2]));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const base = parseInt(m[3], 16);
      for (let c = lo; c <= hi; c++) map.set(c.toString(16).toUpperCase().padStart(m[1].length, '0'), String.fromCharCode(base + c - lo));
    }
  }
  return map;
};

const pageText = (doc: PDFDocument, page: PDFPage) => {
  const fonts = new Map<string, Map<string, string>>();
  const fontDict = page.node.Resources()?.lookup(PDFName.of('Font'));
  if (fontDict instanceof PDFDict) {
    for (const [name, ref] of fontDict.entries()) {
      const font = doc.context.lookup(ref);
      if (!(font instanceof PDFDict)) continue;
      const tu = font.lookup(PDFName.of('ToUnicode'));
      fonts.set(name.asString().replace(/^\//, ''), parseCMap(streamText(tu)));
    }
  }
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  const raw = streams.map(streamText).join('\n');
  let current: Map<string, string> | undefined;
  const lines: string[] = [];
  for (const m of raw.matchAll(/\/([^\s/]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj/g)) {
    if (m[1]) current = fonts.get(m[1]);
    else if (m[2] !== undefined) {
      const hex = m[2].toUpperCase();
      let s = '';
      for (let i = 0; i < hex.length; i += 4) s += current?.get(hex.slice(i, i + 4)) ?? '';
      lines.push(s);
    }
  }
  return lines.join('\n');
};

export const cvPdfText = async (pdf: Buffer | Uint8Array) => {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((p) => pageText(doc, p)).join('\n');
};

export const pdfPageCount = async (pdf: Buffer | Uint8Array) => (await PDFDocument.load(pdf)).getPageCount();
