import { describe, expect, it } from 'vitest';
import { AZ_PLACES } from '@/lib/azInGermany/data';
import { BOTTOM_SHARE, CLOCK_SHARE, EMBASSY_PHONE, EMPTY_FIELDS, PHONE_PRESETS, THEMES, buildBlocks, fileName, layoutWallpaper, spokenList, wrap, type Measure } from './layout';

/** Rough text width: average glyph ≈ 0.55 em (bold 0.6 em). */
const measure: Measure = (text, size, bold) => text.length * size * (bold ? 0.6 : 0.55);

const full = {
  ...EMPTY_FIELDS,
  name: 'Elvin Məmmədov',
  employerName: 'Musterbau GmbH',
  employerPhone: '+49 40 1234567',
  address: 'Beispielstraße 12, 20095 Hamburg',
  contactName: 'Aysel Məmmədova (Ehefrau)',
  contactPhone: '+994 50 123 45 67',
  bloodType: 'A+',
  allergies: 'Penicillin',
};

describe('emergency wallpaper', () => {
  it('has unique phone presets in portrait and four themes', () => {
    expect(new Set(PHONE_PRESETS.map((p) => p.id)).size).toBe(PHONE_PRESETS.length);
    for (const p of PHONE_PRESETS) {
      expect(p.height, p.id).toBeGreaterThan(p.width);
      expect(p.width, p.id).toBeGreaterThanOrEqual(640);
    }
    expect(Object.keys(THEMES)).toHaveLength(4);
  });

  it('always shows 112, 110 and 116 117 and reuses the verified embassy number', () => {
    const blocks = buildBlocks({ ...EMPTY_FIELDS, spoken: [], littleGerman: false, embassy: false });
    expect(blocks.filter((b) => b.kind === 'number').map((b) => b.number)).toEqual(['112', '110', '116 117']);
    expect(EMBASSY_PHONE).toBe(AZ_PLACES.find((p) => p.id === 'embassy')!.phone);
    const withEmbassy = buildBlocks(EMPTY_FIELDS);
    expect(withEmbassy.some((b) => b.number === EMBASSY_PHONE)).toBe(true);
  });

  it('writes the language sentence in German and leaves out empty fields', () => {
    expect(spokenList(['en', 'az', 'ru'])).toBe('Aserbaidschanisch, Russisch und Englisch');
    expect(spokenList(['ru'])).toBe('Russisch');
    const text = buildBlocks(EMPTY_FIELDS).map((b) => b.text).join('|');
    expect(text).toContain('Ich spreche wenig Deutsch. Ich spreche Aserbaidschanisch, Russisch und Englisch.');
    expect(text).not.toContain('ARBEITGEBER');
    expect(text).not.toContain('Blutgruppe');
    const all = buildBlocks(full).map((b) => `${b.text} ${b.number ?? ''}`).join('|');
    for (const s of ['Musterbau GmbH', '+49 40 1234567', 'Beispielstraße 12', '+994 50 123 45 67', 'Blutgruppe: A+', 'Allergien: Penicillin']) expect(all).toContain(s);
    expect(buildBlocks({ ...full, bloodType: 'X' }).some((b) => b.text.startsWith('Blutgruppe'))).toBe(false);
  });

  it('wraps long text within the width', () => {
    const lines = wrap('Ärztlicher Bereitschaftsdienst bei Nacht und am Wochenende', 300, 20, false, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l, 20, false)).toBeLessThanOrEqual(300);
    const cut = wrap('Donaudampfschifffahrtsgesellschaftskapitän', 100, 20, false, measure);
    for (const l of cut) expect(measure(l, 20, false)).toBeLessThanOrEqual(100);
  });

  it('keeps the clock area free and fits everything above the bottom buttons on every preset', () => {
    for (const p of PHONE_PRESETS) {
      const l = layoutWallpaper(buildBlocks(full), p.width, p.height, measure);
      expect(l.panel.y, p.id).toBeGreaterThanOrEqual(Math.round(p.height * CLOCK_SHARE));
      expect(l.panel.y + l.panel.h, p.id).toBeLessThanOrEqual(p.height - Math.round(p.height * BOTTOM_SHARE));
      for (const line of l.lines) {
        expect(line.y, p.id).toBeGreaterThan(l.panel.y);
        expect(line.y, p.id).toBeLessThan(l.panel.y + l.panel.h);
      }
    }
  });

  it('names the file after the resolution', () => {
    expect(fileName({ width: 1179, height: 2556 })).toBe('notfall-hintergrund-1179x2556.png');
  });
});
