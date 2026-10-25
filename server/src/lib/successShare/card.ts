import QRCode from 'qrcode';
import sharp from 'sharp';
import { loadFonts, textPath, widthOf, wrap, type Font } from '../ogImage.js';

/*
 * "Visa approved" share card: a branded PNG the client can post (1080×1350 portrait for Instagram / feeds)
 * or put in a story (1080×1920). Same technique as the Open Graph cards (lib/ogImage.ts): the text is drawn
 * as DejaVu outlines (no system fonts needed, Azerbaijani / Cyrillic / German all render), sharp rasterises
 * the SVG. The QR code points to the public share page (with the client's referral code when they chose to
 * include it), so every share can bring a lead.
 *
 * Privacy: the card only ever receives a display name already reduced to the first name or the initials.
 */

export const CARD_FORMATS = { post: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } } as const;
export type CardFormat = keyof typeof CARD_FORMATS;

export interface CardInput {
  format: CardFormat;
  /** First name or initials (never the surname). */
  displayName: string;
  kicker: string;
  headline: string;
  /** "§18b · Truck driver" */
  visaLine: string;
  /** "Berlin, Germany" or "Germany" */
  destination: string;
  subline: string;
  withUs: string;
  scanLabel: string;
  /** "Code: TV…" or null without referral. */
  codeLine: string | null;
  /** What the QR code opens. */
  qrUrl: string;
  /** Text locale (for upper-casing the kicker: Azerbaijani i → İ). */
  lang: string;
}

const NAVY = '#0b1f44';
const NAVY_2 = '#173a7a';
const AMBER = '#e8a317';

const centered = (font: Font, text: string, size: number, w: number, baseline: number) => textPath(font, text, size, (w - widthOf(font, text, size)) / 2, baseline);

/** QR code as one SVG path of dark modules, scaled to `size` px at (x, y) (quiet zone drawn by the caller). */
const qrPath = (url: string, x: number, y: number, size: number) => {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = size / n;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) parts.push(`M${(x + c * cell).toFixed(2)} ${(y + r * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`);
    }
  }
  return `<path fill="${NAVY}" d="${parts.join('')}"/>`;
};

/** German flag (3 stripes) at (x, y). */
const flagDe = (x: number, y: number, w = 66, h = 44) =>
  `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h / 3}" fill="#000000"/><rect y="${h / 3}" width="${w}" height="${h / 3}" fill="#dd0000"/><rect y="${(2 * h) / 3}" width="${w}" height="${h / 3}" fill="#ffce00"/><rect width="${w}" height="${h}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/></g>`;

/** The card as SVG (exported for tests). */
export const successCardSvg = async (input: CardInput) => {
  const { bold, regular } = await loadFonts();
  const { w: W, h: H } = CARD_FORMATS[input.format];
  const story = input.format === 'story';
  const FOOTER = 300;
  const top = story ? 300 : 210;
  const bottom = H - FOOTER - (story ? 120 : 64);

  // Content block, measured first so it can be centred vertically between the header and the footer.
  let headSize = story ? 92 : 84;
  let headLines = wrap(bold, input.headline, headSize, W - 160, 2);
  if (headLines.length === 2) {
    headSize -= 8;
    headLines = wrap(bold, input.headline, headSize, W - 160, 2);
  }
  let nameSize = 72;
  while (nameSize > 44 && widthOf(bold, input.displayName, nameSize) > W - 200) nameSize -= 4;
  const visaSize = 36;
  const visaLines = wrap(regular, input.visaLine, visaSize, W - 280, 2);
  const visaPillH = visaLines.length * visaSize * 1.3 + 44;
  const destSize = 44;
  const gap = story ? 70 : 38;
  const blocks = [210, headLines.length * headSize * 1.15, nameSize * 1.1, visaPillH, destSize * 1.2, 40];
  const total = blocks.reduce((a, b) => a + b, 0) + gap * (blocks.length - 1);
  let y = top + Math.max(0, (bottom - top - total) / 2);

  const out: string[] = [];
  // Badge: amber circle with a check mark.
  const cx = W / 2;
  out.push(`<circle cx="${cx}" cy="${y + 100}" r="104" fill="${AMBER}" fill-opacity="0.18"/>`);
  out.push(`<circle cx="${cx}" cy="${y + 100}" r="84" fill="${AMBER}"/>`);
  out.push(`<path d="M${cx - 38} ${y + 102}l26 26l52 -56" fill="none" stroke="${NAVY}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`);
  y += blocks[0] + gap;
  // Headline.
  headLines.forEach((l, i) => out.push(`<g fill="#ffffff">${centered(bold, l, headSize, W, y + headSize * 0.85 + i * headSize * 1.15)}</g>`));
  y += blocks[1] + gap;
  // Name.
  out.push(`<g fill="${AMBER}">${centered(bold, input.displayName, nameSize, W, y + nameSize * 0.85)}</g>`);
  y += blocks[2] + gap;
  // Visa pill.
  const pillW = Math.min(W - 160, Math.max(...visaLines.map((l) => widthOf(regular, l, visaSize))) + 96);
  out.push(`<rect x="${(W - pillW) / 2}" y="${y}" width="${pillW}" height="${visaPillH}" rx="${Math.min(visaPillH / 2, 40)}" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>`);
  visaLines.forEach((l, i) => out.push(`<g fill="#ffffff">${centered(regular, l, visaSize, W, y + 22 + visaSize * 0.95 + i * visaSize * 1.3)}</g>`));
  y += blocks[3] + gap;
  // Destination: flag + city, country.
  const destW = widthOf(bold, input.destination, destSize);
  const flagW = 66;
  const rowW = flagW + 24 + destW;
  const rowX = (W - rowW) / 2;
  out.push(flagDe(rowX, y + 4, flagW, 44));
  out.push(`<g fill="#ffffff">${textPath(bold, input.destination, destSize, rowX + flagW + 24, y + destSize * 0.92)}</g>`);
  y += blocks[4] + gap;
  // Subline.
  out.push(`<g fill="#cbd5e1">${centered(regular, input.subline, 34, W, y + 30)}</g>`);

  // Footer: site, "start yours" and the QR code to the share page.
  const qrBox = 220;
  const qrX = W - 80 - qrBox;
  const qrY = H - FOOTER + 40;
  const footer = [
    `<rect x="0" y="${H - FOOTER}" width="${W}" height="${FOOTER}" fill="#000000" fill-opacity="0.22"/>`,
    `<g fill="${AMBER}">${textPath(bold, input.scanLabel, 32, 80, H - FOOTER + 92)}</g>`,
    `<g fill="#ffffff">${textPath(bold, 'triad-vision.de', 50, 80, H - FOOTER + 162)}</g>`,
    `<g fill="#cbd5e1">${textPath(regular, input.codeLine ?? input.withUs, 32, 80, H - FOOTER + 222)}</g>`,
    `<rect x="${qrX}" y="${qrY}" width="${qrBox}" height="${qrBox}" rx="18" fill="#ffffff"/>`,
    qrPath(input.qrUrl, qrX + 16, qrY + 16, qrBox - 32),
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle cx="${W - 60}" cy="120" r="260" fill="${AMBER}" fill-opacity="0.08"/>
<circle cx="40" cy="${H * 0.62}" r="220" fill="#3b82f6" fill-opacity="0.10"/>
<circle cx="${W - 140}" cy="${H * 0.45}" r="10" fill="${AMBER}"/>
<rect x="120" y="${H * 0.3}" width="18" height="18" rx="3" fill="#ffffff" fill-opacity="0.35" transform="rotate(20 129 ${H * 0.3 + 9})"/>
<circle cx="170" cy="${H * 0.52}" r="7" fill="#93c5fd"/>
<g fill="#ffffff">${textPath(bold, 'TRIAD VISION', 40, 80, story ? 170 : 120)}</g>
<g fill="${AMBER}">${textPath(bold, input.kicker.toLocaleUpperCase(input.lang), 24, 80, story ? 214 : 160)}</g>
<g transform="translate(${W - 80 - 76} ${story ? 132 : 82})"><rect width="16" height="44" rx="2" fill="#00b5e2"/><rect x="20" width="16" height="44" rx="2" fill="#ef3340"/><rect x="40" width="16" height="44" rx="2" fill="#509e2f"/><rect x="60" width="16" height="44" rx="2" fill="#ffce00"/></g>
${out.join('\n')}
${footer.join('\n')}
</svg>`;
};

const cache = new Map<string, Promise<Buffer>>();
const CACHE_MAX = 40;

/** PNG of the card (small in-memory cache: the same share is often fetched for preview, download and share). */
export const successCardPng = (input: CardInput): Promise<Buffer> => {
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = successCardSvg(input).then((svg) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer());
  job.catch(() => cache.delete(key));
  cache.set(key, job);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return job;
};

/** Drops cached cards (a revoked share must not linger in memory). */
export const clearSuccessCardCache = () => cache.clear();
