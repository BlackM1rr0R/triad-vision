import QRCode from 'qrcode';
import sharp from 'sharp';
import { loadFonts, textPath, widthOf, wrap, type Font } from '../ogImage.js';
import { brandify } from '../brand/index.js'; // white-label name + domain on the card

/*
 * "Visa approved" share card: a branded PNG the client can post (1080×1350 portrait for feeds, 1080×1080
 * square for the Instagram grid) or put in a story (1080×1920). Same technique as the Open Graph cards
 * (lib/ogImage.ts): the text is drawn as DejaVu outlines (no system fonts needed, Azerbaijani / Cyrillic /
 * German all render, ✈ included), sharp rasterises the SVG, so the same input always gives the same image.
 * The QR code points to the public share page (with the client's referral code when they chose to include
 * it) or, for a private Instagram card, to the website.
 *
 * Privacy: the card only ever receives a display name already reduced to the first name, the initials or an
 * anonymous label (lib/successShare/service.displayNameOf).
 */

export const CARD_FORMATS = { post: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } } as const;
export type CardFormat = keyof typeof CARD_FORMATS;
export const isCardFormat = (v: unknown): v is CardFormat => typeof v === 'string' && Object.prototype.hasOwnProperty.call(CARD_FORMATS, v);

export interface CardInput {
  format: CardFormat;
  /** First name, initials or the anonymous label (never the surname). */
  displayName: string;
  kicker: string;
  headline: string;
  /** "§18b · Truck driver" */
  visaLine: string;
  /** Optional profession line under the name ("LKW-Fahrer"). */
  profession?: string | null;
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

/** Per-format layout: content area, sizes and the footer band. */
const LAYOUT: Record<CardFormat, { top: number; footer: number; bottomPad: number; gap: number; head: number; name: number; badge: number; brandY: number; qr: number }> = {
  post: { top: 210, footer: 300, bottomPad: 64, gap: 34, head: 84, name: 72, badge: 1, brandY: 120, qr: 220 },
  story: { top: 300, footer: 300, bottomPad: 120, gap: 64, head: 92, name: 72, badge: 1, brandY: 170, qr: 220 },
  square: { top: 150, footer: 230, bottomPad: 26, gap: 18, head: 66, name: 58, badge: 0.7, brandY: 96, qr: 170 },
};

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

/** Illustration: a dashed flight path from Baku (bottom left) towards Germany (top right) with a small plane. */
const flightPath = async (W: number, H: number, top: number) => {
  const { bold } = await loadFonts();
  const y0 = H * 0.78;
  const y1 = top - 30;
  const d = `M-40 ${y0.toFixed(0)} C ${(W * 0.25).toFixed(0)} ${(y0 - H * 0.08).toFixed(0)}, ${(W * 0.55).toFixed(0)} ${(y1 + H * 0.22).toFixed(0)}, ${(W - 150).toFixed(0)} ${(y1 + 40).toFixed(0)}`;
  return [
    `<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="4" stroke-dasharray="4 18" stroke-linecap="round"/>`,
    `<g fill="${AMBER}" fill-opacity="0.85" transform="rotate(-24 ${W - 120} ${y1 + 26})">${textPath(bold, '✈', 64, W - 150, y1 + 48)}</g>`,
  ].join('\n');
};

/** The card as SVG (exported for tests). */
export const successCardSvg = async (input: CardInput) => {
  const { bold, regular } = await loadFonts();
  const { w: W, h: H } = CARD_FORMATS[input.format];
  const L = LAYOUT[input.format];
  const FOOTER = L.footer;
  const top = L.top;
  const bottom = H - FOOTER - L.bottomPad;

  // Content block, measured first so it can be centred vertically between the header and the footer.
  let headSize = L.head;
  let headLines = wrap(bold, input.headline, headSize, W - 160, 2);
  if (headLines.length === 2) {
    headSize -= 8;
    headLines = wrap(bold, input.headline, headSize, W - 160, 2);
  }
  let nameSize = L.name;
  while (nameSize > 40 && widthOf(bold, input.displayName, nameSize) > W - 200) nameSize -= 4;
  const profession = input.profession?.trim() || null;
  let profSize = input.format === 'square' ? 34 : 40;
  while (profession && profSize > 24 && widthOf(regular, profession, profSize) > W - 200) profSize -= 2;
  const visaSize = input.format === 'square' ? 30 : 36;
  const visaLines = wrap(regular, input.visaLine, visaSize, W - 280, input.format === 'square' ? 1 : 2);
  const visaPillH = visaLines.length * visaSize * 1.3 + (input.format === 'square' ? 30 : 44);
  const destSize = input.format === 'square' ? 38 : 44;
  const gap = L.gap;
  const badgeH = 210 * L.badge;
  const blocks = [badgeH, headLines.length * headSize * 1.15, nameSize * 1.1, profession ? profSize * 1.2 : 0, visaPillH, destSize * 1.2, input.format === 'square' ? 0 : 40];
  const used = blocks.filter((b) => b > 0);
  const total = used.reduce((a, b) => a + b, 0) + gap * (used.length - 1);
  let y = top + Math.max(0, (bottom - top - total) / 2);
  const next = (h: number) => {
    if (h > 0) y += h + gap;
  };

  const out: string[] = [];
  // Badge: amber circle with a check mark.
  const cx = W / 2;
  out.push(
    `<g transform="translate(${cx} ${y}) scale(${L.badge})"><circle cy="100" r="104" fill="${AMBER}" fill-opacity="0.18"/><circle cy="100" r="84" fill="${AMBER}"/><path d="M-38 102l26 26l52 -56" fill="none" stroke="${NAVY}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  );
  next(blocks[0]);
  // Headline.
  headLines.forEach((l, i) => out.push(`<g fill="#ffffff">${centered(bold, l, headSize, W, y + headSize * 0.85 + i * headSize * 1.15)}</g>`));
  next(blocks[1]);
  // Name.
  out.push(`<g fill="${AMBER}">${centered(bold, input.displayName, nameSize, W, y + nameSize * 0.85)}</g>`);
  next(blocks[2]);
  // Profession.
  if (profession) {
    out.push(`<g fill="#e2e8f0">${centered(regular, profession, profSize, W, y + profSize * 0.9)}</g>`);
    next(blocks[3]);
  }
  // Visa pill.
  const pillW = Math.min(W - 160, Math.max(...visaLines.map((l) => widthOf(regular, l, visaSize))) + 96);
  const pillPad = (visaPillH - visaLines.length * visaSize * 1.3) / 2;
  out.push(`<rect x="${(W - pillW) / 2}" y="${y}" width="${pillW}" height="${visaPillH}" rx="${Math.min(visaPillH / 2, 40)}" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>`);
  visaLines.forEach((l, i) => out.push(`<g fill="#ffffff">${centered(regular, l, visaSize, W, y + pillPad + visaSize * 0.95 + i * visaSize * 1.3)}</g>`));
  next(blocks[4]);
  // Destination: flag + city, country.
  const destW = widthOf(bold, input.destination, destSize);
  const flagW = input.format === 'square' ? 57 : 66;
  const flagH = input.format === 'square' ? 38 : 44;
  const rowW = flagW + 24 + destW;
  const rowX = (W - rowW) / 2;
  out.push(flagDe(rowX, y + 4, flagW, flagH));
  out.push(`<g fill="#ffffff">${textPath(bold, input.destination, destSize, rowX + flagW + 24, y + destSize * 0.92)}</g>`);
  next(blocks[5]);
  // Subline (not on the square card: no room).
  if (input.format !== 'square') out.push(`<g fill="#cbd5e1">${centered(regular, input.subline, 34, W, y + 30)}</g>`);

  // Footer: site, "start yours" and the QR code.
  const f = FOOTER / 300;
  const qrBox = L.qr;
  const qrX = W - 80 - qrBox;
  const qrY = H - FOOTER + (FOOTER - qrBox) / 2;
  const footer = [
    `<rect x="0" y="${H - FOOTER}" width="${W}" height="${FOOTER}" fill="#000000" fill-opacity="0.22"/>`,
    `<g fill="${AMBER}">${textPath(bold, input.scanLabel, 32 * f, 80, H - FOOTER + 92 * f)}</g>`,
    `<g fill="#ffffff">${textPath(bold, brandify('triad-vision.de'), 50 * f, 80, H - FOOTER + 162 * f)}</g>`,
    `<g fill="#cbd5e1">${textPath(regular, input.codeLine ?? input.withUs, 32 * f, 80, H - FOOTER + 222 * f)}</g>`,
    `<rect x="${qrX}" y="${qrY}" width="${qrBox}" height="${qrBox}" rx="18" fill="#ffffff"/>`,
    qrPath(input.qrUrl, qrX + 16, qrY + 16, qrBox - 32),
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle cx="${W - 60}" cy="120" r="260" fill="${AMBER}" fill-opacity="0.08"/>
<circle cx="40" cy="${H * 0.62}" r="220" fill="#3b82f6" fill-opacity="0.10"/>
${await flightPath(W, H - FOOTER, top)}
<circle cx="${W - 140}" cy="${H * 0.45}" r="10" fill="${AMBER}"/>
<rect x="120" y="${H * 0.3}" width="18" height="18" rx="3" fill="#ffffff" fill-opacity="0.35" transform="rotate(20 129 ${H * 0.3 + 9})"/>
<circle cx="170" cy="${H * 0.52}" r="7" fill="#93c5fd"/>
<g fill="#ffffff">${textPath(bold, brandify('TRIAD VISION'), 40, 80, L.brandY)}</g>
<g fill="${AMBER}">${textPath(bold, input.kicker.toLocaleUpperCase(input.lang), 24, 80, L.brandY + 44)}</g>
<g transform="translate(${W - 80 - 76} ${L.brandY - 38})"><rect width="16" height="44" rx="2" fill="#00b5e2"/><rect x="20" width="16" height="44" rx="2" fill="#ef3340"/><rect x="40" width="16" height="44" rx="2" fill="#509e2f"/><rect x="60" width="16" height="44" rx="2" fill="#ffce00"/></g>
${out.join('\n')}
${footer.join('\n')}
</svg>`;
};

/** PNG of the card (deterministic: the same input always gives the same bytes). */
export const renderCardPng = async (input: CardInput) => sharp(Buffer.from(await successCardSvg(input))).png({ compressionLevel: 9 }).toBuffer();

const cache = new Map<string, Promise<Buffer>>();
const CACHE_MAX = 40;

/** PNG of the card (small in-memory cache: the same share is often fetched for preview, download and share). */
export const successCardPng = (input: CardInput): Promise<Buffer> => {
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = renderCardPng(input);
  job.catch(() => cache.delete(key));
  cache.set(key, job);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return job;
};

/** Drops cached cards (a revoked share must not linger in memory). */
export const clearSuccessCardCache = () => cache.clear();
