import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { adjustFor, contrastRatio, deriveTheme, mix, THEME_DEFAULTS, themeSchema, type SiteTheme } from '../../src/lib/site/theme.js';

/**
 * Theme builder colour maths (server/src/lib/site/theme.ts) and its client mirror (client/src/lib/contrast.ts,
 * used for the live preview): WCAG contrast ratios, auto-adjustment, and identical results on both sides.
 */

type ClientLib = { contrastRatio: typeof contrastRatio; deriveTheme: (t: SiteTheme) => ReturnType<typeof deriveTheme> };
const clientSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src');
let client: ClientLib;
beforeAll(async () => {
  client = (await import(/* @vite-ignore */ pathToFileURL(path.join(clientSrc, 'lib/contrast.ts')).href)) as ClientLib;
});

describe('contrast ratio (WCAG 2.x)', () => {
  it('matches the reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2); // the classic "just fails AA" grey
    expect(contrastRatio('#0b1f44', '#ffffff')).toBeGreaterThan(16);
    // symmetric
    expect(contrastRatio('#1565e8', '#fafaf7')).toBeCloseTo(contrastRatio('#fafaf7', '#1565e8'), 10);
  });

  it('mixes and adjusts towards a target until the minimum is met', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    const fixed = adjustFor('#9ab0ff', ['#ffffff'], 4.5, '#0b1220')!;
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(adjustFor('#0b1f44', ['#ffffff'], 4.5, '#0b1220')).toBe('#0b1f44'); // already passes: unchanged
  });
});

describe('deriveTheme', () => {
  it('keeps the default palette as is (no issues) and every derived pair passes AA', () => {
    const { vars, issues } = deriveTheme(THEME_DEFAULTS);
    expect(issues).toEqual([]);
    expect(vars['--tv-primary']).toBe('#0b1f44');
    expect(contrastRatio(vars['--tv-primary-contrast'], vars['--tv-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(vars['--tv-primary-dark-contrast'], vars['--tv-primary-dark'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(vars['--tv-accent-contrast'], vars['--tv-accent'])).toBeGreaterThanOrEqual(4.5);
    for (const bg of ['#ffffff', '#fafaf7', '#f3f1ea']) expect(contrastRatio(vars['--tv-accent-fg'], bg)).toBeGreaterThanOrEqual(4.5);
    for (const bg of ['#151b26', '#1d2330']) expect(contrastRatio(vars['--tv-accent-fg-dark'], bg)).toBeGreaterThanOrEqual(4.5);
    expect(vars['--tv-radius-scale']).toBe('1');
  });

  it('auto-adjusts a too-light primary and reports it', () => {
    const { vars, issues } = deriveTheme({ ...THEME_DEFAULTS, brandPrimary: '#7fb0ff', radiusScale: 'lg' });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'brandPrimary', min: 4.5 });
    expect(issues[0].ratio).toBeLessThan(4.5);
    expect(vars['--tv-primary']).toBe(issues[0].adjustedTo);
    expect(contrastRatio('#ffffff', vars['--tv-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(vars['--tv-radius-scale']).toBe('1.25');
  });

  it('picks the readable label for the accent and fixes an accent no label can sit on', () => {
    const dark = deriveTheme({ ...THEME_DEFAULTS, accent: '#7a1f9e' });
    expect(dark.issues).toEqual([]);
    expect(dark.vars['--tv-accent-contrast']).toBe('#ffffff');
    const mid = deriveTheme({ ...THEME_DEFAULTS, accent: '#7a7a7a' }); // ~3.8:1 on navy, ~4.3:1 on white
    expect(mid.issues.map((i) => i.field)).toEqual(['accent']);
    expect(contrastRatio(mid.vars['--tv-accent-contrast'], mid.vars['--tv-accent'])).toBeGreaterThanOrEqual(4.5);
  });

  it('validates the stored shape', () => {
    expect(themeSchema.parse({ brandPrimary: '#ABCDEF' }).brandPrimary).toBe('#abcdef');
    expect(themeSchema.safeParse({ brandPrimary: 'red' }).success).toBe(false);
    expect(themeSchema.safeParse({ radiusScale: 'xl' }).success).toBe(false);
  });

  it('gives identical results on the client (live preview) and the server', () => {
    const inputs: SiteTheme[] = [
      THEME_DEFAULTS,
      { brandPrimary: '#7fb0ff', accent: '#7a7a7a', radiusScale: 'sm', defaultDensity: 'compact' },
      { brandPrimary: '#1565e8', accent: '#f5c542', radiusScale: 'lg', defaultDensity: 'comfortable' },
      { brandPrimary: '#ffffff', accent: '#000000', radiusScale: 'md', defaultDensity: 'comfortable' },
    ];
    for (const t of inputs) expect(client.deriveTheme(t)).toEqual(deriveTheme(t));
    expect(client.contrastRatio('#123456', '#fedcba')).toBe(contrastRatio('#123456', '#fedcba'));
  });
});
