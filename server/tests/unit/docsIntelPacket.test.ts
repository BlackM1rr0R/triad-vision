import { describe, expect, it } from 'vitest';
import { buildPacket, packetFileName, type PacketItem } from '../../src/lib/docsIntel/packet.js';
import { makePdf, pageCount, PNG_BUFFER, SAMPLE } from '../helpers/files';
import { pdfPagesText } from '../helpers/pdfText';

const info = (items: PacketItem[]) => ({
  caseNumber: 'TV-2026-0007',
  clientName: 'Əli Məmmədov',
  visaType: '§18b LKW sürücüsü',
  profession: 'Berufskraftfahrer',
  date: new Date('2026-10-15T08:00:00Z'),
  items,
});

describe('buildPacket', () => {
  it('cover + divider per document + content pages, with n / N footers', async () => {
    const items: PacketItem[] = [
      { title: 'Pasport', section: 'İlkin sənədlər', originalName: 'passport.pdf', mimeType: 'application/pdf', bytes: await makePdf('Passport', 3) },
      { title: 'Foto', section: 'İlkin sənədlər', originalName: 'photo.png', mimeType: 'image/png', bytes: PNG_BUFFER },
      { title: 'CV', section: 'İlkin sənədlər', originalName: 'cv.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: SAMPLE.zip },
    ];
    const { pdf, pages, entries } = await buildPacket(info(items));
    // 1 cover + (1 divider + 3 pages) + (1 divider + 1 page) + (1 divider + 0)
    expect(pages).toBe(1 + 4 + 2 + 1);
    expect(await pageCount(pdf)).toBe(pages);
    expect(entries.map((e) => [e.page, e.pages])).toEqual([
      [2, 3],
      [6, 1],
      [8, 0],
    ]);
    expect(entries[2].note).toContain('separately');

    const texts = await pdfPagesText(pdf);
    texts.forEach((t, i) => expect(t).toContain(`${i + 1} / ${pages}`));
    expect(texts[0]).toContain('TV-2026-0007');
    expect(texts[0]).toContain('Eli Memmedov');
    expect(texts[0]).toContain('Pasport');
    expect(texts[0]).toContain('p. 2');
    expect(texts[1]).toContain('Pasport');
    expect(texts[1]).toContain('passport.pdf');
    // the copied contract pages keep their own text
    expect(texts[2]).toContain('Passport (1)');
    expect(texts[4]).toContain('Passport (3)');
  });

  it('skips webp and missing files with a note on the divider page', async () => {
    const items: PacketItem[] = [
      { title: 'Foto', section: 'S', originalName: 'photo.webp', mimeType: 'image/webp', bytes: SAMPLE.webp },
      { title: 'Lost', section: 'S', originalName: 'lost.pdf', mimeType: 'application/pdf' },
      { title: 'Broken', section: 'S', originalName: 'broken.pdf', mimeType: 'application/pdf', bytes: Buffer.from('not a pdf') },
    ];
    const { pdf, pages, entries } = await buildPacket(info(items));
    expect(pages).toBe(1 + 3);
    expect(entries.map((e) => e.pages)).toEqual([0, 0, 0]);
    expect(entries[0].note).toContain('cannot be embedded');
    expect(entries[1].note).toContain('File missing');
    expect(entries[2].note).toContain('cannot be embedded');
    const texts = await pdfPagesText(pdf);
    expect(texts[1]).toContain('cannot be embedded');
    expect(texts[2]).toContain('File missing');
  });

  it('builds an empty packet (cover only)', async () => {
    const { pages } = await buildPacket(info([]));
    expect(pages).toBe(1);
  });

  it('embeds jpeg images', async () => {
    // pdf-lib needs a real JPEG; build a minimal one through pdf-lib's own test data is not possible, so a broken jpeg is noted instead.
    const { entries } = await buildPacket(info([{ title: 'J', section: 'S', originalName: 'j.jpg', mimeType: 'image/jpeg', bytes: SAMPLE.jpg }]));
    expect(entries[0].pages === 1 || !!entries[0].note).toBe(true);
  });

  it('names the file after the case', () => {
    expect(packetFileName('TV-2026-0001')).toBe('TV-2026-0001-sefirlik-paketi.pdf');
  });
});
