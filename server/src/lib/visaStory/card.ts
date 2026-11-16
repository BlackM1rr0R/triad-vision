import sharp from 'sharp';
import { loadFonts, textPath, widthOf } from '../ogImage.js';
import { brandify } from '../brand/index.js';

/*
 * "Your visa story" share card (last slide of the story): 1080×1920 for stories, 1080×1080 square. Same technique
 * as the success card (lib/successShare/card.ts): DejaVu outlines rendered by sharp, deterministic output.
 *
 * Privacy: the card gets a display name already reduced to the first name, the initials or an anonymous label
 * (successShare displayNameOf) and only counts — never a document name, a case number or the employer.
 */

export const STORY_FORMATS = { story: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } } as const;
export type StoryFormat = keyof typeof STORY_FORMATS;

export interface StoryCardInput {
  format: StoryFormat;
  displayName: string;
  kicker: string;
  headline: string;
  /** Up to four big numbers with their label ("412" / "days from sign-up to approval"). */
  stats: { value: string; label: string }[];
  footer: string;
  lang: string;
}

const NAVY = '#0b1f44';
const VIOLET = '#5b21b6';
const AMBER = '#f59e0b';
const PINK = '#ec4899';

export const storyCardSvg = async (input: StoryCardInput) => {
  const { bold, regular } = await loadFonts();
  const { w: W, h: H } = STORY_FORMATS[input.format];
  const square = input.format === 'square';
  const centered = (font: typeof bold, text: string, size: number, baseline: number) => textPath(font, text, size, (W - widthOf(font, text, size)) / 2, baseline);
  const fit = (font: typeof bold, text: string, size: number, max: number, min = 20) => {
    let s = size;
    while (s > min && widthOf(font, text, s) > max) s -= 2;
    return s;
  };

  const out: string[] = [];
  const brandY = square ? 90 : 150;
  out.push(`<g fill="#ffffff">${textPath(bold, brandify('TRIAD VISION'), 36, 70, brandY)}</g>`);
  out.push(`<g fill="${AMBER}">${textPath(bold, input.kicker.toLocaleUpperCase(input.lang), 24, 70, brandY + 40)}</g>`);

  let y = square ? 250 : 420;
  const headSize = fit(bold, input.headline, square ? 64 : 84, W - 140);
  out.push(`<g fill="#ffffff">${centered(bold, input.headline, headSize, y)}</g>`);
  y += square ? 80 : 120;
  const nameSize = fit(bold, input.displayName, square ? 52 : 68, W - 160);
  out.push(`<g fill="${AMBER}">${centered(bold, input.displayName, nameSize, y)}</g>`);
  y += square ? 60 : 110;

  // Stats: 2 × 2 grid of tiles.
  const stats = input.stats.slice(0, 4);
  const cols = 2;
  const gap = square ? 24 : 36;
  const tileW = (W - 140 - gap) / cols;
  const tileH = square ? 230 : 330;
  stats.forEach((s, i) => {
    const cx = 70 + (i % cols) * (tileW + gap);
    const cy = y + Math.floor(i / cols) * (tileH + gap);
    out.push(`<rect x="${cx}" y="${cy}" width="${tileW}" height="${tileH}" rx="36" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>`);
    const vSize = fit(bold, s.value, square ? 84 : 110, tileW - 60, 40);
    out.push(`<g fill="#ffffff">${textPath(bold, s.value, vSize, cx + (tileW - widthOf(bold, s.value, vSize)) / 2, cy + (square ? 115 : 165))}</g>`);
    // Label: up to two lines.
    const lSize = square ? 26 : 32;
    const words = s.label.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (widthOf(regular, next, lSize) > tileW - 50 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 2).forEach((l, k) => {
      const ls = fit(regular, l, lSize, tileW - 40, 16);
      out.push(`<g fill="#e2e8f0">${textPath(regular, l, ls, cx + (tileW - widthOf(regular, l, ls)) / 2, cy + (square ? 165 : 235) + k * lSize * 1.25)}</g>`);
    });
  });

  const footY = H - (square ? 70 : 140);
  out.push(`<g fill="${AMBER}">${centered(bold, input.footer, square ? 30 : 38, footY - (square ? 46 : 64))}</g>`);
  out.push(`<g fill="#ffffff">${centered(bold, brandify('triad-vision.de'), square ? 40 : 52, footY)}</g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="0.6" stop-color="${VIOLET}"/><stop offset="1" stop-color="${PINK}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle cx="${W - 80}" cy="${H * 0.18}" r="${square ? 180 : 280}" fill="${AMBER}" fill-opacity="0.12"/>
<circle cx="60" cy="${H * 0.8}" r="${square ? 160 : 260}" fill="#38bdf8" fill-opacity="0.12"/>
<path d="M-20 ${H * 0.92} C ${W * 0.3} ${H * 0.82}, ${W * 0.6} ${H * 0.95}, ${W + 20} ${H * 0.84}" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="4" stroke-dasharray="4 18" stroke-linecap="round"/>
<g transform="translate(${W - 70 - 76} ${brandY - 34})"><rect width="16" height="44" rx="2" fill="#00b5e2"/><rect x="20" width="16" height="44" rx="2" fill="#ef3340"/><rect x="40" width="16" height="44" rx="2" fill="#509e2f"/><rect x="60" width="16" height="44" rx="2" fill="#ffce00"/></g>
${out.join('\n')}
</svg>`;
};

export const storyCardPng = async (input: StoryCardInput) => sharp(Buffer.from(await storyCardSvg(input))).png({ compressionLevel: 9 }).toBuffer();
