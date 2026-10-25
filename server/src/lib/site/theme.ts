import { z } from 'zod';
import { readSetting, writeSetting } from '../growth/settings.js';

/**
 * Site theme (Setting `theme`, SUPER_ADMIN → System settings → Theme). Four knobs on top of the design
 * tokens in client/src/index.css:
 *   brandPrimary   light-mode primary action colour (buttons, active nav); default navy #0b1f44
 *   accent         the rare amber highlight; default #e8a317
 *   radiusScale    sm | md | lg — multiplies every corner radius (0.75 / 1 / 1.25)
 *   defaultDensity comfortable | compact — admin table density until a user picks their own
 *
 * Every colour is checked against the surfaces it is used on (WCAG 2.x, 4.5 : 1 for text). In "adjust" mode
 * (default) a failing colour is darkened / lightened step by step until it passes and the change is
 * reported; in "strict" mode the request is refused. The browser receives ready CSS variables (`vars`),
 * set on <html> by client/src/lib/theme.ts. The colour maths is mirrored in client/src/lib/contrast.ts
 * (tests/unit/themeContrast.test.ts keeps them identical).
 */

export const THEME_KEY = 'theme';

const HEX = /^#[0-9a-fA-F]{6}$/;
export const RADIUS_SCALES = { sm: 0.75, md: 1, lg: 1.25 } as const;
export const DENSITIES = ['comfortable', 'compact'] as const;

export const themeSchema = z.object({
  brandPrimary: z.string().regex(HEX).transform((s) => s.toLowerCase()).default('#0b1f44'),
  accent: z.string().regex(HEX).transform((s) => s.toLowerCase()).default('#e8a317'),
  radiusScale: z.enum(['sm', 'md', 'lg']).default('md'),
  defaultDensity: z.enum(DENSITIES).default('comfortable'),
});
export type SiteTheme = z.infer<typeof themeSchema>;
export const THEME_DEFAULTS: SiteTheme = themeSchema.parse({});

// ─── Colour maths (keep in sync with client/src/lib/contrast.ts) ─────────

export type Rgb = [number, number, number];
export const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
export const rgbToHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
/** WCAG contrast ratio of two #rrggbb colours (1 … 21). */
export const contrastRatio = (a: string, b: string) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** Mixes `hex` with `target` by `amount` (0 … 1). */
export const mix = (hex: string, target: string, amount: number) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount) as Rgb);
};
/** #rrggbb → [h 0…360, s 0…1, l 0…1]. */
export const hexToHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
export const hslToHex = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
};
/** Light tint of a brand colour for dark mode: same hue, saturation kept in a calm range, high lightness. */
export const darkModeTint = (hex: string, lightness: number) => {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, s < 0.08 ? s : Math.min(0.7, Math.max(0.35, s)), lightness);
};
const DARKEN_TO = '#0b1220'; // a soft navy-black, never pure black
const LIGHTEN_TO = '#ffffff';

/** Smallest step towards `target` that makes `fg` reach `min` against every background; null when impossible. */
export const adjustFor = (fg: string, backgrounds: string[], min: number, target: string): string | null => {
  for (let i = 0; i <= 40; i++) {
    const c = i === 0 ? fg : mix(fg, target, i / 40);
    if (backgrounds.every((bg) => contrastRatio(c, bg) >= min)) return c;
  }
  return null;
};

/** The surfaces a theme colour has to work on (index.css: light canvases / cards, dark cards / raised). */
export const SURFACES = {
  light: ['#ffffff', '#fafaf7', '#f6f7f9', '#f3f1ea', '#eef0f4'],
  dark: ['#151b26', '#171c25', '#1d2330', '#11151c', '#0f141c'],
};
const TEXT_ON_ACCENT = ['#13203a', '#ffffff'];

export type ThemeIssue = { field: 'brandPrimary' | 'accent'; check: string; ratio: number; min: number; adjustedTo?: string };
export type ThemeVars = Record<string, string>;

/**
 * Derives the CSS variables of a theme and checks them. Returns the variables plus the issues found (with the
 * adjusted colour when one exists). Variables always hold passing colours.
 */
export const deriveTheme = (theme: SiteTheme): { vars: ThemeVars; issues: ThemeIssue[] } => {
  const issues: ThemeIssue[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // Primary (light): white label on it ≥ 4.5; as a filled control it also needs 3 : 1 against the canvas.
  let primary = theme.brandPrimary;
  const onPrimary = contrastRatio('#ffffff', primary);
  const vsCanvas = Math.min(...SURFACES.light.map((s) => contrastRatio(primary, s)));
  if (onPrimary < 4.5 || vsCanvas < 3) {
    const fixed = adjustFor(primary, ['#ffffff', ...SURFACES.light], 4.5, DARKEN_TO) ?? '#0b1f44';
    issues.push({ field: 'brandPrimary', check: 'white text on primary', ratio: r2(Math.min(onPrimary, vsCanvas)), min: 4.5, adjustedTo: fixed });
    primary = fixed;
  }
  const primaryHover = mix(primary, '#ffffff', 0.12);
  // Primary (dark): a light tint of the brand with the brand (or navy) as label.
  const primaryDark = darkModeTint(primary, 0.84);
  const primaryDarkLabel = contrastRatio(primary, primaryDark) >= 4.5 ? primary : '#0b1f44';

  // Accent: a filled highlight with the better of navy / white as label; text in the accent colour gets a
  // darker (light theme) / lighter (dark theme) variant that reaches 4.5 : 1 on every surface.
  let accent = theme.accent;
  let accentLabel = TEXT_ON_ACCENT.reduce((best, c) => (contrastRatio(c, accent) > contrastRatio(best, accent) ? c : best));
  const labelRatio = contrastRatio(accentLabel, accent);
  if (labelRatio < 4.5) {
    const towards = accentLabel === '#ffffff' ? DARKEN_TO : LIGHTEN_TO;
    const fixed = adjustFor(accent, [accentLabel], 4.5, towards) ?? THEME_DEFAULTS.accent;
    issues.push({ field: 'accent', check: 'label on accent', ratio: r2(labelRatio), min: 4.5, adjustedTo: fixed });
    accent = fixed;
    accentLabel = TEXT_ON_ACCENT.reduce((best, c) => (contrastRatio(c, accent) > contrastRatio(best, accent) ? c : best));
  }
  const accentFg = adjustFor(accent, SURFACES.light, 4.5, DARKEN_TO) ?? '#7a4d00';
  const accentFgDark = adjustFor(accent, SURFACES.dark, 4.5, LIGHTEN_TO) ?? '#f3c467';

  const scale = RADIUS_SCALES[theme.radiusScale];
  return {
    issues,
    vars: {
      '--tv-primary': primary,
      '--tv-primary-hover': primaryHover,
      '--tv-primary-contrast': '#ffffff',
      '--tv-primary-dark': primaryDark,
      '--tv-primary-dark-hover': darkModeTint(primary, 0.9),
      '--tv-primary-dark-contrast': primaryDarkLabel,
      '--tv-accent': accent,
      '--tv-accent-contrast': accentLabel,
      '--tv-accent-fg': accentFg,
      '--tv-accent-fg-dark': accentFgDark,
      '--tv-radius-scale': String(scale),
    },
  };
};

export const getSiteTheme = () => readSetting(THEME_KEY, themeSchema, THEME_DEFAULTS);
export const saveSiteTheme = (t: SiteTheme) => writeSetting(THEME_KEY, t);
