import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildIcs, foldLine, icsEscape, tzOffsetMs, zonedDay, zonedToUtc } from '../../src/lib/ics.js';
import { buildInvoicePdf, computeTotals, lineTotalCents, pdfSafe, readInvoicing, readLegal, servicePeriodLabel } from '../../src/lib/invoicePdf.js';
import { formatEur } from '../../src/lib/invoiceTexts.js';
import { bookingTexts, formatSlot, topicLabel } from '../../src/lib/bookingTexts.js';
import { expandTemplate, templateSchema } from '../../src/routes/admin/booking.js';

describe('time zones', () => {
  it('converts wall-clock times to UTC on both sides of a DST change', () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0, 'Europe/Berlin').toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(zonedToUtc(2026, 12, 1, 9, 0, 'Europe/Berlin').toISOString()).toBe('2026-12-01T08:00:00.000Z');
    expect(zonedToUtc(2026, 10, 25, 12, 0, 'Europe/Berlin').toISOString()).toBe('2026-10-25T11:00:00.000Z');
    expect(zonedToUtc(2026, 3, 29, 12, 0, 'Europe/Berlin').toISOString()).toBe('2026-03-29T10:00:00.000Z');
    expect(zonedToUtc(2026, 1, 5, 10, 30, 'Asia/Baku').toISOString()).toBe('2026-01-05T06:30:00.000Z');
    expect(tzOffsetMs(new Date('2026-01-01T00:00:00Z'), 'Asia/Baku')).toBe(4 * 3600000);
    expect(zonedDay(new Date('2026-10-15T21:30:00Z'), 'Asia/Baku')).toEqual({ y: 2026, m: 10, d: 16, weekday: 5 });
  });

  it('expands a weekly template, skipping the past and honouring the slot gap', () => {
    const t = templateSchema.parse({
      timeZone: 'Asia/Baku',
      minutes: 45,
      gapMinutes: 15,
      weeks: 1,
      startDate: '2026-10-12', // a Monday
      days: [{ weekday: 1, ranges: [{ from: '10:00', to: '13:00' }] }],
    });
    // 10:30 in Baku: the 10:00 slot is already past
    const slots = expandTemplate(t, new Date('2026-10-12T06:30:00Z'));
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(['2026-10-12T07:00:00.000Z', '2026-10-12T08:00:00.000Z']);
    expect(slots[0].endsAt.getTime() - slots[0].startsAt.getTime()).toBe(45 * 60000);
    expect(() => templateSchema.parse({ ...t, minutes: 20 })).toThrow();
  });
});

describe('ics', () => {
  it('escapes text and folds long lines at 75 octets without splitting characters', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const long = `DESCRIPTION:${'ə'.repeat(80)}`;
    const folded = foldLine(long);
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });

  it('builds a valid VEVENT and a cancellation', () => {
    const start = new Date('2026-11-02T09:00:00Z');
    const ics = buildIcs({ uid: 'u1@x', start, end: new Date('2026-11-02T09:30:00Z'), summary: 'Hello, world', url: 'https://meet.jit.si/x', stamp: start });
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20261102T090000Z');
    expect(ics).toContain('DTEND:20261102T093000Z');
    expect(ics).toContain('SUMMARY:Hello\\, world');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const cancel = buildIcs({ uid: 'u1@x', start, end: start, summary: 's', status: 'CANCELLED' });
    expect(cancel).toContain('METHOD:CANCEL');
    expect(cancel).toContain('STATUS:CANCELLED');
    expect(cancel).not.toContain('VALARM');
  });
});

describe('booking texts', () => {
  it('shows Baku and Berlin times in the reader language', () => {
    const d = new Date('2026-11-02T09:00:00Z');
    const en = formatSlot(d, 'en');
    expect(en).toContain('13:00 (Baku, GMT+4)');
    expect(en).toContain('10:00 (Berlin)');
    expect(formatSlot(d, 'ru')).toContain('Баку');
    expect(topicLabel('company', 'de')).toBe('Unternehmen (Personalsuche)');
    expect(topicLabel(null, 'az')).toBe('Digər sual');
    const ctx = { name: 'A', when: 'W', topic: 'T', meetingUrl: 'MEET', manageUrl: 'U', rebookUrl: 'R', message: 'note' };
    for (const l of ['az', 'de', 'en', 'ru'] as const) {
      expect(bookingTexts[l].confirmed(ctx).body).toContain('MEET');
      expect(bookingTexts[l].cancelledByStaff(ctx).body).toContain('note');
      expect(bookingTexts[l].reminder1h(ctx).body).toContain('MEET');
    }
  });
});

describe('invoice maths and settings', () => {
  it('computes totals in integer cents', () => {
    expect(lineTotalCents({ quantity: 1.5, unitPriceCents: 9999 })).toBe(14999);
    expect(computeTotals([{ quantity: 2, unitPriceCents: 150000 }, { quantity: 1.5, unitPriceCents: 9999 }], 19)).toEqual({ netCents: 314999, vatCents: 59850, grossCents: 374849 });
    expect(computeTotals([{ quantity: 3, unitPriceCents: 3333 }], 7)).toEqual({ netCents: 9999, vatCents: 700, grossCents: 10699 });
    expect(formatEur(374849)).toBe('3.748,49 €');
  });

  it('reads settings tolerantly', () => {
    expect(readInvoicing(null)).toMatchObject({ defaultVatRate: 19, paymentTermsDays: 14, smallBusiness: false });
    expect(readInvoicing({ defaultVatRate: '7', paymentTermsDays: 999, smallBusiness: 'yes' })).toMatchObject({ defaultVatRate: 7, paymentTermsDays: 14, smallBusiness: false });
    expect(readLegal(undefined).missing).toEqual(['name', 'address', 'vatId']);
    const l = readLegal({ name: { de: 'TV GmbH', en: 'TV Ltd' }, address: 'Str. 1\n10115 Berlin', ustId: 'DE1' });
    expect(l.missing).toEqual([]);
    expect(l.seller).toMatchObject({ name: 'TV GmbH', street: 'Str. 1', zipCity: '10115 Berlin', vatId: 'DE1' });
    expect(servicePeriodLabel([{ description: 'x', quantity: 1, unitPriceCents: 1, servicePeriod: { from: '2026-09-01', to: '2026-09-30' } }])).toBe('01.09.2026 - 30.09.2026');
    expect(servicePeriodLabel([{ description: 'x', quantity: 1, unitPriceCents: 1 }])).toBe('');
  });

  it('transliterates text the standard fonts cannot encode', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(pdfSafe(font, 'Əliyev Şəhriyar — Ölçü')).toBe('Eliyev Sehriyar - Ölçü');
    expect(pdfSafe(font, 'Иван Ж.')).toBe('Ivan ZH.');
    expect(pdfSafe(font, '漢字')).toBe('??');
  });

  it('renders draft, sent and cancelled PDFs even without any seller data', async () => {
    for (const status of ['DRAFT', 'SENT', 'CANCELLED']) {
      const pdf = await buildInvoicePdf({
        invoice: {
          number: 'TV-RE-2026-0001',
          status,
          issueDate: new Date(),
          dueDate: new Date(),
          items: [{ description: 'x'.repeat(400), quantity: 1, unitPriceCents: 100 }],
          vatRate: 19,
          netCents: 100,
          vatCents: 19,
          grossCents: 119,
          note: null,
        },
        company: { name: 'ООО Ромашка' },
        seller: readLegal(null).seller,
        invoicing: readInvoicing({ smallBusiness: true }),
      });
      expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    }
  });
});
