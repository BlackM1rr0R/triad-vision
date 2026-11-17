import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { A3, welcomePosterPdf } from '../../src/lib/welcomePoster/pdf.js';
import { POSTER_PHRASES, contactFromNote } from '../../src/lib/welcomePoster/texts.js';
import { cvPdfText as pdfText } from './cvPdfText';

/** Welcome poster for the first work day: bilingual A3 PDF with Azerbaijani glyphs, phrases, frames, contact. */
describe('welcome poster', () => {
  it('renders one A3 page with the bilingual welcome, the phrases, the contact and the first day', async () => {
    const pdf = await welcomePosterPdf({ firstName: 'Gülşən', company: 'Muster Bau GmbH', contact: 'Jana Schulz (Vorarbeiterin)', firstDay: new Date(Date.UTC(2027, 0, 4)) });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([Math.round(A3[0]), Math.round(A3[1])]);
    const text = await pdfText(pdf);
    expect(text).toContain('Xoş gəlmisiniz, Gülşən!');
    expect(text).toContain('Herzlich willkommen, Gülşən!');
    expect(text).toContain('Muster Bau GmbH');
    expect(text).toContain('Ihr Team · Komandanız');
    expect(text).toContain('Jana Schulz (Vorarbeiterin)');
    expect(text).toContain('04.01.2027');
    for (const [de, az] of POSTER_PHRASES) {
      expect(text).toContain(de);
      expect(text).toContain(az);
    }
  });

  it('works without contact, first day or logo and embeds a PNG logo when given', async () => {
    const bare = await pdfText(await welcomePosterPdf({ firstName: '', company: 'X GmbH' }));
    expect(bare).toContain('Xoş gəlmisiniz!');
    expect(bare).not.toContain('Ansprechperson');
    const png = await sharp({ create: { width: 200, height: 80, channels: 4, background: { r: 10, g: 60, b: 120, alpha: 1 } } }).png().toBuffer();
    const withLogo = await welcomePosterPdf({ firstName: 'Elvin', company: 'Logo GmbH', logoPng: png });
    expect(withLogo.length).toBeGreaterThan(1000);
    // a broken logo never breaks the poster
    expect((await welcomePosterPdf({ firstName: 'Elvin', company: 'Logo GmbH', logoPng: Buffer.from('nope') })).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('takes the contact person from the first line of the BUDDY note', () => {
    expect(contactFromNote('  \n Jana Schulz \n Tel. 0171 …')).toBe('Jana Schulz');
    expect(contactFromNote('')).toBeNull();
    expect(contactFromNote(null)).toBeNull();
    expect(contactFromNote('x'.repeat(200))).toHaveLength(80);
  });
});
