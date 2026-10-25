/**
 * Colour contrast maths (WCAG 2.x) and the site-theme derivation, for the Theme panel's live preview and the
 * design-system page. Mirror of server/src/lib/site/theme.ts (server/tests/unit/themeContrast.test.ts keeps
 * both identical) — the server re-validates on save.
 */

export type Rgb = [number, number, number];
export type RadiusScale = 'sm' | 'md' | 'lg';
export type Density = 'comfortable' | 'compact';
export type SiteTheme = { brandPrimary: string; accent: string; radiusScale: RadiusScale; defaultDensity: Density };
export type ThemeIssue = { field: 'brandPrimary' | 'accent'; check: string; ratio: number; min: number; adjustedTo?: string };
export type ThemeVars = Record<string, string>;

export const THEME_DEFAULTS: SiteTheme = { brandPrimary: '#0b1f44', accent: '#e8a317', radiusScale: 'md', defaultDensity: 'comfortable' };
export const RADIUS_SCALES: Record<RadiusScale, number> = { sm: 0.75, md: 1, lg: 1.25 };

export const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
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
const DARKEN_TO = '#0b1220';
const LIGHTEN_TO = '#ffffff';

export const adjustFor = (fg: string, backgrounds: string[], min: number, target: string): string | null => {
  for (let i = 0; i <= 40; i++) {
    const c = i === 0 ? fg : mix(fg, target, i / 40);
    if (backgrounds.every((bg) => contrastRatio(c, bg) >= min)) return c;
  }
  return null;
};

export const SURFACES = {
  light: ['#ffffff', '#fafaf7', '#f6f7f9', '#f3f1ea', '#eef0f4'],
  dark: ['#151b26', '#171c25', '#1d2330', '#11151c', '#0f141c'],
};
const TEXT_ON_ACCENT = ['#13203a', '#ffffff'];

export const deriveTheme = (theme: SiteTheme): { vars: ThemeVars; issues: ThemeIssue[] } => {
  const issues: ThemeIssue[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;

  let primary = theme.brandPrimary;
  const onPrimary = contrastRatio('#ffffff', primary);
  const vsCanvas = Math.min(...SURFACES.light.map((s) => contrastRatio(primary, s)));
  if (onPrimary < 4.5 || vsCanvas < 3) {
    const fixed = adjustFor(primary, ['#ffffff', ...SURFACES.light], 4.5, DARKEN_TO) ?? '#0b1f44';
    issues.push({ field: 'brandPrimary', check: 'white text on primary', ratio: r2(Math.min(onPrimary, vsCanvas)), min: 4.5, adjustedTo: fixed });
    primary = fixed;
  }
  const primaryHover = mix(primary, '#ffffff', 0.12);
  const primaryDark = darkModeTint(primary, 0.84);
  const primaryDarkLabel = contrastRatio(primary, primaryDark) >= 4.5 ? primary : '#0b1f44';

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

/** Reads a CSS colour (any format the browser understands) as #rrggbb, via a canvas-free computed style. */
export const cssColorToHex = (value: string): string | null => {
  const m = value.trim().match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return rgbToHex([Number(m[1]), Number(m[2]), Number(m[3])]);
  return isHex(value.trim()) ? value.trim().toLowerCase() : null;
};
