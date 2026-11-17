import { describe, expect, it } from 'vitest';
import { A5_PT, jpegsToPdf } from './pdf';
import { NOVRUZ_GREETINGS, fileSlug, firstNameOf, nextNovruz, novruzBannerVisible, parseNames, salutation } from './data';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('Novruz card data', () => {
  it('greetings are Azerbaijani with a German gloss and the classic wish first', () => {
    expect(NOVRUZ_GREETINGS[0].az).toBe('Novruz bayramınız mübarək!');
    for (const g of NOVRUZ_GREETINGS) {
      expect(g.az.length).toBeGreaterThan(10);
      expect(g.de.length).toBeGreaterThan(10);
    }
    expect(new Set(NOVRUZ_GREETINGS.map((g) => g.id)).size).toBe(NOVRUZ_GREETINGS.length);
  });

  it('builds salutations and first names', () => {
    expect(salutation('Elvin')).toBe('Əziz Elvin!');
    expect(salutation('  ')).toBe('Əziz həmkarımız!');
    expect(firstNameOf('Ali M.')).toBe('Ali');
    expect(firstNameOf('Ali Rza Ə.')).toBe('Ali Rza');
    expect(firstNameOf('Nicat')).toBe('Nicat');
    expect(parseNames('Elvin, Aysel\nelvin;  Gülnar  ')).toEqual(['Elvin', 'Aysel', 'Gülnar']);
    expect(parseNames(Array.from({ length: 40 }, (_, i) => `N${i}`).join(','))).toHaveLength(30);
    expect(fileSlug('Gülnar Əliyeva')).toBe('gulnar-eliyeva');
    expect(fileSlug('***')).toBe('card');
  });

  it('shows the portal reminder from 1 to 21 March only', () => {
    expect(novruzBannerVisible('2027-02-28')).toBe(false);
    expect(novruzBannerVisible('2027-03-01')).toBe(true);
    expect(novruzBannerVisible('2027-03-21')).toBe(true);
    expect(novruzBannerVisible('2027-03-22')).toBe(false);
  });

  it('uses the 2026 Cabinet decree and no official dates for 2027 yet', () => {
    expect(nextNovruz('2026-03-01')).toMatchObject({ year: 2026, official: { start: '2026-03-20', end: '2026-03-24', status: 'decree' } });
    expect(nextNovruz('2026-11-17')).toEqual({ year: 2027, official: null });
  });
});

describe('JPEG → PDF writer', () => {
  it('writes a valid single-object-per-offset PDF with one A5 page per image', () => {
    const fake = (n: number) => ({ jpeg: new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9]), width: 1240, height: 1754 });
    const pdf = jpegsToPdf([fake(1), fake(2)], A5_PT, 'Novruz – Elvin');
    const s = latin1(pdf);
    expect(s.startsWith('%PDF-1.4\n')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Count 2');
    expect(s.match(/\/MediaBox \[0 0 419\.53 595\.28\]/g)).toHaveLength(2);
    expect(s).toContain('/Filter /DCTDecode /Length 5');
    expect(s).toContain('/Title (Novruz  Elvin)');
    // xref offsets point at the objects
    const xrefAt = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const rows = s.slice(xrefAt).split('\n').slice(3, 12);
    rows.forEach((row, i) => {
      const off = Number(row.slice(0, 10));
      expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    expect(() => jpegsToPdf([])).toThrow('NO_PAGES');
  });
});
