/**
 * Minimal PDF writer for the Novruz cards: one full-page JPEG per page (DCTDecode image XObject), so the A5 PDF is
 * built entirely in the browser from the same canvas as the PNG (no server round trip, no PDF library).
 * Pure function over bytes (unit-tested).
 */

/** A5 portrait in PDF points (148 × 210 mm). */
export const A5_PT: [number, number] = [419.53, 595.28];

export interface JpegPage {
  /** JPEG file bytes (baseline or progressive; RGB). */
  jpeg: Uint8Array;
  /** Pixel size of the image. */
  width: number;
  height: number;
}

const enc = new TextEncoder();

/** PDF with one page per image, each image stretched over the whole page (same aspect ratio expected). */
export const jpegsToPdf = (pages: JpegPage[], pageSize: [number, number] = A5_PT, title = 'Novruz'): Uint8Array<ArrayBuffer> => {
  if (!pages.length) throw new Error('NO_PAGES');
  const [pw, ph] = pageSize;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => {
    parts.push(b);
    length += b.length;
  };
  const str = (s: string) => push(enc.encode(s));
  const obj = (n: number, body: () => void) => {
    offsets[n] = length;
    str(`${n} 0 obj\n`);
    body();
    str('\nendobj\n');
  };
  const num = (x: number) => (Math.round(x * 100) / 100).toString();
  // Latin-1 safe title (PDF string, escaped).
  const pdfString = (s: string) => `(${s.replace(/[^\x20-\x7e]/g, '').replace(/([()\\])/g, '\\$1')})`;

  str('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment

  // 1 catalog, 2 pages, 3 info, then per page: page, content, image.
  const first = 4;
  const kids = pages.map((_, i) => `${first + i * 3} 0 R`).join(' ');
  obj(1, () => str('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => str(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  obj(3, () => str(`<< /Title ${pdfString(title)} /Producer (Triad Vision) >>`));
  pages.forEach((p, i) => {
    const pageNo = first + i * 3;
    const contentNo = pageNo + 1;
    const imageNo = pageNo + 2;
    obj(pageNo, () =>
      str(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pw)} ${num(ph)}] /Resources << /XObject << /Im0 ${imageNo} 0 R >> >> /Contents ${contentNo} 0 R >>`),
    );
    const content = `q ${num(pw)} 0 0 ${num(ph)} 0 0 cm /Im0 Do Q`;
    obj(contentNo, () => str(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(imageNo, () => {
      str(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      str('\nendstream');
    });
  });

  const size = first + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  str(table);
  str(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const b of parts) {
    out.set(b, at);
    at += b.length;
  }
  return out;
};
