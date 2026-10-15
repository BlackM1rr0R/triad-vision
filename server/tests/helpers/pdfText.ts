import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFPage } from 'pdf-lib';

/** Text drawn on a page: pdf-lib writes standard-font text as <HEX> Tj in (compressed) content streams. */
export const pageText = (page: PDFPage) => {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : [contents];
  let raw = '';
  for (const s of streams) {
    if (s instanceof PDFRawStream) raw += Buffer.from(decodePDFRawStream(s).decode()).toString('latin1');
  }
  return [...raw.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((mt) => Buffer.from(mt[1], 'hex').toString('latin1')).join('\n');
};

/** Text of every page of a PDF, in page order. */
export const pdfPagesText = async (pdf: Buffer) => {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map(pageText);
};

export const pdfText = async (pdf: Buffer) => (await pdfPagesText(pdf)).join('\n');
