import { AZ_PLACES } from '@/lib/azInGermany/data';

/**
 * Lock-screen emergency wallpaper (public /emergency-wallpaper and portal /account/emergency-wallpaper).
 * Everything is laid out and drawn on the device (canvas → PNG); nothing is uploaded or stored on the server.
 * The text on the picture is German on purpose: it is read by a helper, a paramedic or the police in Germany.
 *
 * This module is pure (no DOM): presets, themes, the content blocks and a layout that fits them between the
 * lock-screen clock (top, kept free) and the flashlight / camera buttons (bottom). Text width is measured by an
 * injected function so the layout is unit-testable; canvas.ts draws the result.
 */

export interface PhonePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  platform: 'ios' | 'android';
}

/** Native screen resolutions (portrait) of common phones. */
export const PHONE_PRESETS: PhonePreset[] = [
  { id: 'iphone-pro-max', label: 'iPhone 16 Pro Max', width: 1320, height: 2868, platform: 'ios' },
  { id: 'iphone-plus', label: 'iPhone 15 Pro Max / 15 Plus / 16 Plus', width: 1290, height: 2796, platform: 'ios' },
  { id: 'iphone-pro', label: 'iPhone 16 Pro', width: 1206, height: 2622, platform: 'ios' },
  { id: 'iphone', label: 'iPhone 14 Pro / 15 / 15 Pro / 16', width: 1179, height: 2556, platform: 'ios' },
  { id: 'iphone-13', label: 'iPhone 12 / 13 / 14', width: 1170, height: 2532, platform: 'ios' },
  { id: 'iphone-se', label: 'iPhone SE / 8', width: 750, height: 1334, platform: 'ios' },
  { id: 'android-fhd', label: 'Android Full HD+ (Samsung A, Xiaomi, Pixel 8)', width: 1080, height: 2400, platform: 'android' },
  { id: 'galaxy-s', label: 'Samsung Galaxy S24 / S25', width: 1080, height: 2340, platform: 'android' },
  { id: 'galaxy-ultra', label: 'Samsung Galaxy S24 / S25 Ultra', width: 1440, height: 3120, platform: 'android' },
  { id: 'pixel-pro', label: 'Google Pixel 9 Pro XL', width: 1344, height: 2992, platform: 'android' },
];

export type ThemeId = 'night' | 'red' | 'blue' | 'light';

export interface WallpaperTheme {
  id: ThemeId;
  /** Background gradient (top → bottom). */
  bg: [string, string];
  /** Panel behind the content. */
  panel: string;
  text: string;
  muted: string;
  /** Emergency numbers. */
  accent: string;
}

export const THEMES: Record<ThemeId, WallpaperTheme> = {
  night: { id: 'night', bg: ['#0f172a', '#1e293b'], panel: 'rgba(15,23,42,0.72)', text: '#f8fafc', muted: '#cbd5e1', accent: '#f87171' },
  red: { id: 'red', bg: ['#7f1d1d', '#450a0a'], panel: 'rgba(0,0,0,0.38)', text: '#ffffff', muted: '#fecaca', accent: '#fde047' },
  blue: { id: 'blue', bg: ['#0c4a6e', '#082f49'], panel: 'rgba(0,0,0,0.32)', text: '#ffffff', muted: '#bae6fd', accent: '#fca5a5' },
  light: { id: 'light', bg: ['#f8fafc', '#e2e8f0'], panel: 'rgba(255,255,255,0.86)', text: '#0f172a', muted: '#475569', accent: '#b91c1c' },
};

export const BLOOD_TYPES = ['0+', '0−', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−'] as const;
export const SPOKEN = ['az', 'ru', 'en', 'tr'] as const;
export type Spoken = (typeof SPOKEN)[number];
const SPOKEN_DE: Record<Spoken, string> = { az: 'Aserbaidschanisch', ru: 'Russisch', en: 'Englisch', tr: 'Türkisch' };

const embassy = AZ_PLACES.find((p) => p.id === 'embassy');
/** Embassy of Azerbaijan in Berlin, the verified entry of the "Azerbaijan in Germany" map. */
export const EMBASSY_PHONE = embassy?.phone ?? '+49 30 2191613';

export interface WallpaperFields {
  name: string;
  employerName: string;
  employerPhone: string;
  address: string;
  contactName: string;
  contactPhone: string;
  bloodType: string;
  allergies: string;
  spoken: Spoken[];
  littleGerman: boolean;
  embassy: boolean;
}

export const EMPTY_FIELDS: WallpaperFields = {
  name: '',
  employerName: '',
  employerPhone: '',
  address: '',
  contactName: '',
  contactPhone: '',
  bloodType: '',
  allergies: '',
  spoken: ['az', 'ru', 'en'],
  littleGerman: true,
  embassy: true,
};

export const FIELD_MAX = { name: 80, employerName: 80, employerPhone: 30, address: 140, contactName: 80, contactPhone: 30, allergies: 120 } as const;

/** "Aserbaidschanisch, Russisch und Englisch". */
export const spokenList = (spoken: Spoken[]) => {
  const names = SPOKEN.filter((s) => spoken.includes(s)).map((s) => SPOKEN_DE[s]);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
};

export type BlockKind = 'title' | 'number' | 'label' | 'value' | 'note';

export interface Block {
  kind: BlockKind;
  /** Left text; for 'number' the service name. */
  text: string;
  /** Right-aligned phone number (number rows). */
  number?: string;
  /** Extra space above (in units of the base font size). */
  gap?: number;
}

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

/** The content, top to bottom. Empty optional fields are left out. */
export const buildBlocks = (f: WallpaperFields): Block[] => {
  const out: Block[] = [{ kind: 'title', text: 'IM NOTFALL' }];
  const name = clean(f.name, FIELD_MAX.name);
  if (name) out.push({ kind: 'note', text: name });
  out.push(
    { kind: 'number', text: 'Notruf Feuerwehr / Rettung', number: '112', gap: 0.6 },
    { kind: 'number', text: 'Polizei', number: '110' },
    { kind: 'number', text: 'Ärztlicher Bereitschaftsdienst', number: '116 117' },
  );
  const lang = spokenList(f.spoken);
  if (f.littleGerman || lang) {
    const parts = [f.littleGerman ? 'Ich spreche wenig Deutsch.' : '', lang ? `Ich spreche ${lang}.` : ''].filter(Boolean);
    out.push({ kind: 'value', text: parts.join(' '), gap: 0.7 });
  }
  const employer = clean(f.employerName, FIELD_MAX.employerName);
  const employerPhone = clean(f.employerPhone, FIELD_MAX.employerPhone);
  if (employer || employerPhone) {
    out.push({ kind: 'label', text: 'ARBEITGEBER', gap: 0.7 });
    out.push(employerPhone ? { kind: 'number', text: employer || '—', number: employerPhone } : { kind: 'value', text: employer });
  }
  const address = clean(f.address, FIELD_MAX.address);
  if (address) out.push({ kind: 'label', text: 'MEINE ADRESSE IN DEUTSCHLAND', gap: 0.7 }, { kind: 'value', text: address });
  const contact = clean(f.contactName, FIELD_MAX.contactName);
  const contactPhone = clean(f.contactPhone, FIELD_MAX.contactPhone);
  if (contact || contactPhone) {
    out.push({ kind: 'label', text: 'NOTFALLKONTAKT IN ASERBAIDSCHAN', gap: 0.7 });
    out.push(contactPhone ? { kind: 'number', text: contact || '—', number: contactPhone } : { kind: 'value', text: contact });
  }
  const blood = BLOOD_TYPES.includes(f.bloodType as (typeof BLOOD_TYPES)[number]) ? f.bloodType : '';
  const allergies = clean(f.allergies, FIELD_MAX.allergies);
  if (blood || allergies) {
    out.push({ kind: 'label', text: 'MEDIZINISCH', gap: 0.7 });
    if (blood) out.push({ kind: 'value', text: `Blutgruppe: ${blood}` });
    if (allergies) out.push({ kind: 'value', text: `Allergien: ${allergies}` });
  }
  if (f.embassy) out.push({ kind: 'label', text: 'BOTSCHAFT ASERBAIDSCHAN (BERLIN)', gap: 0.7 }, { kind: 'number', text: 'Telefon', number: EMBASSY_PHONE });
  return out;
};

/** Relative font size of each block kind (× base size). */
export const SCALE: Record<BlockKind, number> = { title: 1.5, number: 1.05, label: 0.72, value: 0.92, note: 0.9 };
const LINE = 1.28;

export type Measure = (text: string, fontPx: number, bold: boolean) => number;

export interface PlacedLine {
  kind: BlockKind;
  text: string;
  number?: string;
  /** Baseline y and font size in px. */
  y: number;
  size: number;
  bold: boolean;
}

export interface Layout {
  width: number;
  height: number;
  /** Lock-screen clock area kept free at the top (px). */
  clockArea: number;
  /** The content panel. */
  panel: { x: number; y: number; w: number; h: number; r: number };
  padding: number;
  lines: PlacedLine[];
  base: number;
}

const BOLD: Record<BlockKind, boolean> = { title: true, number: true, label: true, value: false, note: false };

/** Greedy word wrap with a measure function; long words are cut. */
export const wrap = (text: string, maxWidth: number, size: number, bold: boolean, measure: Measure): string[] => {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, size, bold) <= maxWidth) cur = next;
    else {
      if (cur) lines.push(cur);
      let word = w;
      while (measure(word, size, bold) > maxWidth && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut), size, bold) > maxWidth) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

/** Top share of the screen kept free for the lock-screen clock and date; bottom share for the shortcut buttons. */
export const CLOCK_SHARE = 0.34;
export const BOTTOM_SHARE = 0.1;

/**
 * Places the blocks inside the free area, shrinking the base font until everything fits.
 * Number rows: the service on the left (wrapped into the space the number leaves), the number right-aligned.
 */
export const layoutWallpaper = (blocks: Block[], width: number, height: number, measure: Measure): Layout => {
  const clockArea = Math.round(height * CLOCK_SHARE);
  const bottom = Math.round(height * BOTTOM_SHARE);
  const margin = Math.round(width * 0.06);
  const avail = height - clockArea - bottom;
  const panelW = width - 2 * margin;
  let base = Math.round(width * 0.05);
  const minBase = Math.max(10, Math.round(width * 0.022));
  for (;;) {
    const padding = Math.round(base * 0.9);
    const inner = panelW - 2 * padding;
    const lines: PlacedLine[] = [];
    let y = padding;
    for (const b of blocks) {
      const size = Math.round(base * SCALE[b.kind]);
      const bold = BOLD[b.kind];
      y += (b.gap ?? 0) * base;
      if (b.kind === 'number' && b.number) {
        const numW = measure(b.number, size, true);
        const textW = Math.max(inner * 0.35, inner - numW - base * 0.6);
        const parts = wrap(b.text, textW, size, bold, measure);
        parts.forEach((p, i) => {
          y += size * LINE;
          lines.push({ kind: b.kind, text: p, number: i === 0 ? b.number : undefined, y, size, bold });
        });
      } else {
        for (const p of wrap(b.text, inner, size, bold, measure)) {
          y += size * LINE;
          lines.push({ kind: b.kind, text: p, y, size, bold });
        }
      }
    }
    const h = Math.round(y + padding);
    if (h <= avail || base <= minBase) {
      const top = clockArea + Math.max(0, Math.round((avail - h) / 2));
      return {
        width,
        height,
        clockArea,
        panel: { x: margin, y: top, w: panelW, h, r: Math.round(base * 0.9) },
        padding,
        lines: lines.map((l) => ({ ...l, y: Math.round(top + l.y - l.size * 0.28) })),
        base,
      };
    }
    base = Math.max(minBase, Math.floor(base * 0.94));
  }
};

/** File name for the download, e.g. "notfall-hintergrund-1179x2556.png". */
export const fileName = (p: Pick<PhonePreset, 'width' | 'height'>) => `notfall-hintergrund-${p.width}x${p.height}.png`;
