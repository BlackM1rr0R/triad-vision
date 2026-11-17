/**
 * Draws a Novruz greeting card on a canvas (A5 portrait, 1240 × 1754 px ≈ 213 dpi): one of four self-drawn
 * designs (semeni wheat-grass dish, tongues of fire, khoncha tray, pomegranate + buta pattern), the salutation,
 * the Azerbaijani greeting, an optional German line and the company name / logo. Browser only (canvas); the same
 * drawing feeds the preview, the PNG and the JPEG pages of the A5 PDF (./pdf.ts). No external images.
 */
import type { NovruzTemplate } from './data';

export const CARD_W = 1240;
export const CARD_H = 1754;

export interface CardInput {
  template: NovruzTemplate;
  salutation: string;
  greeting: string;
  german?: string;
  company?: string;
  logo?: CanvasImageSource | null;
}

interface Theme {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
}

const THEMES: Record<NovruzTemplate, Theme> = {
  semeni: { bg: '#fbf6e8', ink: '#1f3a24', muted: '#5b6b52', accent: '#c0392b' },
  fire: { bg: '#18203d', ink: '#fff6e5', muted: '#f3c98b', accent: '#ffb02e' },
  khoncha: { bg: '#7b1e2b', ink: '#fff7ea', muted: '#f6d7a7', accent: '#f2c14e' },
  buta: { bg: '#fdf8ef', ink: '#5a1222', muted: '#3c6e71', accent: '#a4161a' },
};

const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif';
const SANS = 'Onest, system-ui, -apple-system, "Segoe UI", "DejaVu Sans", sans-serif';

type Ctx = CanvasRenderingContext2D;

// ─── Small shapes ───────────────────────────────────────────────────────

/** Buta (paisley / flame-drop): rounded body with a curled tip; (x, y) = centre of the body, s = size. */
const buta = (ctx: Ctx, x: number, y: number, s: number, rot: number, fill: string, line?: string) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.55);
  ctx.bezierCurveTo(-s * 0.6, s * 0.55, -s * 0.62, -s * 0.15, -s * 0.2, -s * 0.45);
  ctx.bezierCurveTo(s * 0.05, -s * 0.62, s * 0.3, -s * 0.85, s * 0.22, -s * 1.05);
  ctx.bezierCurveTo(s * 0.55, -s * 0.8, s * 0.62, -s * 0.2, s * 0.45, s * 0.15);
  ctx.bezierCurveTo(s * 0.35, s * 0.42, s * 0.22, s * 0.55, 0, s * 0.55);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (line) {
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.02, s * 0.12, s * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

const pomegranate = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#e35d5b');
  g.addColorStop(1, '#8e1b24');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // crown
  ctx.fillStyle = '#8e1b24';
  ctx.beginPath();
  ctx.moveTo(-r * 0.32, -r * 0.88);
  ctx.lineTo(-r * 0.4, -r * 1.22);
  ctx.lineTo(-r * 0.14, -r * 1.02);
  ctx.lineTo(0, -r * 1.3);
  ctx.lineTo(r * 0.14, -r * 1.02);
  ctx.lineTo(r * 0.4, -r * 1.22);
  ctx.lineTo(r * 0.32, -r * 0.88);
  ctx.closePath();
  ctx.fill();
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.35, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/** Wheat-grass blades growing from a dish; (cx, top of dish = baseY), width w. */
const semeniGrass = (ctx: Ctx, cx: number, baseY: number, w: number, h: number, seed = 7) => {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const greens = ['#4f9a3a', '#64b043', '#3d7f2e', '#7cc35a'];
  for (let i = 0; i < 110; i++) {
    const x0 = cx - w / 2 + rnd() * w;
    const lean = (x0 - cx) / (w / 2);
    const hh = h * (0.65 + rnd() * 0.35) * (1 - Math.abs(lean) * 0.25);
    ctx.strokeStyle = greens[i % greens.length];
    ctx.lineWidth = 5 + rnd() * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, baseY);
    ctx.quadraticCurveTo(x0 + lean * 30, baseY - hh * 0.6, x0 + lean * 70 + (rnd() - 0.5) * 30, baseY - hh);
    ctx.stroke();
  }
};

const dish = (ctx: Ctx, cx: number, y: number, w: number, color: string, rim: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, y);
  ctx.quadraticCurveTo(cx, y + w * 0.32, cx + w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(cx, y, w / 2, w * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
};

/** Red ribbon tied round the grass with a bow. */
const ribbon = (ctx: Ctx, cx: number, y: number, w: number) => {
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(cx - w / 2, y - 14, w, 28);
  ctx.beginPath();
  ctx.ellipse(cx - 40, y, 44, 24, -0.35, 0, Math.PI * 2);
  ctx.ellipse(cx + 40, y, 44, 24, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 8, y + 10);
  ctx.lineTo(cx - 40, y + 90);
  ctx.lineTo(cx - 18, y + 84);
  ctx.lineTo(cx + 4, y + 12);
  ctx.moveTo(cx + 8, y + 10);
  ctx.lineTo(cx + 44, y + 86);
  ctx.lineTo(cx + 22, y + 82);
  ctx.lineTo(cx - 4, y + 12);
  ctx.fill();
  ctx.fillStyle = '#962d22';
  ctx.beginPath();
  ctx.arc(cx, y, 15, 0, Math.PI * 2);
  ctx.fill();
};

const flame = (ctx: Ctx, x: number, baseY: number, w: number, h: number, colors: [string, string]) => {
  const g = ctx.createLinearGradient(x, baseY, x, baseY - h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, baseY);
  ctx.bezierCurveTo(x - w * 0.7, baseY - h * 0.45, x - w * 0.05, baseY - h * 0.55, x + w * 0.05, baseY - h);
  ctx.bezierCurveTo(x + w * 0.2, baseY - h * 0.65, x + w * 0.75, baseY - h * 0.4, x + w / 2, baseY);
  ctx.closePath();
  ctx.fill();
};

const egg = (ctx: Ctx, x: number, y: number, r: number, color: string, band: string) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = band;
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r * 0.2, 0, Math.PI * 0.05, Math.PI * 0.95);
  ctx.stroke();
  ctx.restore();
};

/** Şəkərbura: half-moon pastry with the pinched pattern. */
const shekerbura = (ctx: Ctx, x: number, y: number, s: number, rot: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#f3d08a';
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(0, -s * 1.15, s, 0);
  ctx.quadraticCurveTo(0, s * 0.25, -s, 0);
  ctx.fill();
  ctx.strokeStyle = '#c8913e';
  ctx.lineWidth = s * 0.07;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.22, -s * 0.05);
    ctx.lineTo(i * s * 0.2 + s * 0.06, -s * 0.38 + Math.abs(i) * s * 0.06);
    ctx.stroke();
  }
  ctx.restore();
};

/** Paxlava: rhombus with an almond on top. */
const pakhlava = (ctx: Ctx, x: number, y: number, s: number) => {
  ctx.fillStyle = '#b5652a';
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.7, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s * 0.7, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7a3d15';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f1e2c4';
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.14, s * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
};

const candle = (ctx: Ctx, x: number, baseY: number, h: number) => {
  ctx.fillStyle = '#fff3d6';
  ctx.fillRect(x - 7, baseY - h, 14, h);
  flame(ctx, x, baseY - h - 2, 16, 34, ['#ff8c1a', '#ffe08a']);
};

// ─── Design backgrounds (top art area) ──────────────────────────────────

const drawSemeni = (ctx: Ctx, W: number, artH: number) => {
  ctx.fillStyle = '#eef5df';
  ctx.beginPath();
  ctx.arc(W / 2, artH * 0.55, artH * 0.48, 0, Math.PI * 2);
  ctx.fill();
  const baseY = artH * 0.78;
  semeniGrass(ctx, W / 2, baseY, 380, artH * 0.6);
  ribbon(ctx, W / 2, baseY - artH * 0.12, 420);
  dish(ctx, W / 2, baseY, 520, '#c9763d', '#e39a5c');
  // small spring dots
  ['#f2c14e', '#c0392b', '#64b043'].forEach((c, i) =>
    [0, 1, 2, 3].forEach((k) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(140 + k * 320 + i * 40, 90 + ((k + i) % 2) * 50, 9, 0, Math.PI * 2);
      ctx.fill();
    }),
  );
};

const drawFire = (ctx: Ctx, W: number, artH: number) => {
  const glow = ctx.createRadialGradient(W / 2, artH * 0.8, 20, W / 2, artH * 0.75, artH * 0.7);
  glow.addColorStop(0, 'rgba(255,150,40,0.55)');
  glow.addColorStop(1, 'rgba(255,150,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, artH * 1.6);
  const baseY = artH * 0.9;
  flame(ctx, W / 2 - 150, baseY, 190, artH * 0.5, ['#d9381e', '#ff9a1f']);
  flame(ctx, W / 2 + 160, baseY, 200, artH * 0.55, ['#d9381e', '#ff9a1f']);
  flame(ctx, W / 2, baseY, 280, artH * 0.75, ['#e8461f', '#ffb02e']);
  flame(ctx, W / 2 - 40, baseY, 150, artH * 0.5, ['#ff9a1f', '#ffe08a']);
  flame(ctx, W / 2 + 60, baseY, 130, artH * 0.42, ['#ff9a1f', '#fff1b8']);
  // logs
  ctx.strokeStyle = '#6b3b1f';
  ctx.lineCap = 'round';
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 260, baseY + 30);
  ctx.lineTo(W / 2 + 200, baseY - 10);
  ctx.moveTo(W / 2 + 260, baseY + 30);
  ctx.lineTo(W / 2 - 200, baseY - 10);
  ctx.stroke();
  // sparks and stars
  for (let i = 0; i < 26; i++) {
    const x = 80 + ((i * 197) % (W - 160));
    const y = 40 + ((i * 113) % Math.round(artH * 0.6));
    ctx.fillStyle = i % 3 ? 'rgba(255,214,120,0.85)' : 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, i % 3 ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawKhoncha = (ctx: Ctx, W: number, artH: number) => {
  const cx = W / 2;
  const cy = artH * 0.6;
  // tray (copper)
  ctx.fillStyle = '#b87333';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 18, 470, 170, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d9a066';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 460, 160, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a5222';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 410, 138, 0, 0, Math.PI * 2);
  ctx.stroke();
  // sweets around
  const ring = 300;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = cx + Math.cos(a) * ring;
    const y = cy + Math.sin(a) * ring * 0.33;
    if (i % 3 === 0) shekerbura(ctx, x, y + 10, 46, Math.cos(a) * 0.3);
    else if (i % 3 === 1) pakhlava(ctx, x, y, 34);
    else egg(ctx, x, y - 6, 30, ['#c0392b', '#2e86de', '#27ae60', '#f1c40f'][i % 4], '#ffffff');
  }
  // semeni in the middle, candles around it
  const baseY = cy + 10;
  semeniGrass(ctx, cx, baseY, 160, 230, 11);
  ribbon(ctx, cx, baseY - 40, 190);
  dish(ctx, cx, baseY, 230, '#e9c46a', '#f4d58d');
  candle(ctx, cx - 170, cy + 4, 70);
  candle(ctx, cx + 170, cy + 4, 70);
};

const drawButaBorder = (ctx: Ctx, W: number, H: number) => {
  const step = 116;
  const colors = ['#a4161a', '#3c6e71', '#d4a017'];
  let k = 0;
  for (let x = 70; x <= W - 60; x += step) {
    buta(ctx, x, 62, 40, 0.3, colors[k++ % 3], 'rgba(255,255,255,0.6)');
    buta(ctx, x, H - 70, 40, Math.PI + 0.3, colors[k++ % 3], 'rgba(255,255,255,0.6)');
  }
  for (let y = 70 + step; y <= H - 70 - step; y += step) {
    buta(ctx, 58, y, 36, -Math.PI / 2 + 0.3, colors[k++ % 3], 'rgba(255,255,255,0.6)');
    buta(ctx, W - 58, y, 36, Math.PI / 2 + 0.3, colors[k++ % 3], 'rgba(255,255,255,0.6)');
  }
};

const drawButa = (ctx: Ctx, W: number, H: number, artH: number) => {
  drawButaBorder(ctx, W, H);
  const cx = W / 2;
  const cy = artH * 0.6;
  // leaves
  ctx.fillStyle = '#3c6e71';
  [-1, 1].forEach((d) => {
    ctx.beginPath();
    ctx.ellipse(cx + d * 210, cy + 80, 110, 42, d * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  pomegranate(ctx, cx - 190, cy + 20, 120);
  pomegranate(ctx, cx + 190, cy + 20, 120);
  pomegranate(ctx, cx, cy - 40, 160);
  // seeds of an open half
  ctx.fillStyle = '#fbe9e7';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 78, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c1121f';
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const r = 8 * Math.sqrt(i + 1);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 1.3, cy + 10 + Math.sin(a) * r, 8, 0, Math.PI * 2);
    ctx.fill();
  }
};

// ─── Text ───────────────────────────────────────────────────────────────

const wrapLines = (ctx: Ctx, text: string, max: number) => {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > max && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
};

/** Largest font size (≤ start) at which the wrapped text fits into max width × max lines. */
const fitText = (ctx: Ctx, text: string, font: (size: number) => string, start: number, min: number, maxW: number, maxLines: number) => {
  let size = start;
  for (; size > min; size -= 2) {
    ctx.font = font(size);
    if (wrapLines(ctx, text, maxW).length <= maxLines) break;
  }
  ctx.font = font(size);
  return { size, lines: wrapLines(ctx, text, maxW).slice(0, maxLines) };
};

/** Draws the whole card onto `ctx` (expects a CARD_W × CARD_H coordinate space). */
export const drawCard = (ctx: Ctx, input: CardInput) => {
  const W = CARD_W;
  const H = CARD_H;
  const th = THEMES[input.template];
  ctx.save();
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, W, H);
  const artH = H * 0.42;
  if (input.template === 'semeni') drawSemeni(ctx, W, artH);
  else if (input.template === 'fire') drawFire(ctx, W, artH);
  else if (input.template === 'khoncha') drawKhoncha(ctx, W, artH);
  else drawButa(ctx, W, H, artH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const maxW = W - 260;
  const footY = H - (input.template === 'buta' ? 170 : 120);
  const boxTop = artH + 60;
  const boxBottom = footY - (input.logo ? 250 : 90);
  const german = input.german?.trim() ?? '';

  // Largest greeting size at which salutation + greeting + divider + German line fit into the text box.
  const layout = (g: number) => {
    const sal = Math.round(g * 0.72);
    const de = Math.round(g * 0.52);
    ctx.font = `700 ${g}px ${SERIF}`;
    const gl = wrapLines(ctx, input.greeting, maxW);
    ctx.font = `italic 400 ${de}px ${SERIF}`;
    const dl = german ? wrapLines(ctx, german, maxW).slice(0, 3) : [];
    const height = sal * 1.6 + gl.length * g * 1.25 + 70 + (dl.length ? 30 + dl.length * de * 1.3 : 0);
    return { g, sal, de, gl, dl, height };
  };
  let L = layout(84);
  for (let g = 82; g >= 36 && L.height > boxBottom - boxTop; g -= 2) L = layout(g);
  let y = boxTop + Math.max(0, (boxBottom - boxTop - L.height) / 2);

  // Salutation
  ctx.fillStyle = th.muted;
  const sal = fitText(ctx, input.salutation, (s) => `italic 500 ${s}px ${SERIF}`, L.sal, 28, maxW, 1);
  y += sal.size;
  ctx.fillText(sal.lines[0] ?? '', W / 2, y);
  y += sal.size * 0.6;

  // Greeting (Azerbaijani)
  ctx.fillStyle = th.ink;
  ctx.font = `700 ${L.g}px ${SERIF}`;
  for (const l of L.gl) {
    y += L.g * 1.25;
    ctx.fillText(l, W / 2, y - L.g * 0.25);
  }

  // Accent divider
  y += 46;
  ctx.fillStyle = th.accent;
  buta(ctx, W / 2, y - 10, 20, 0.3, th.accent);
  ctx.fillRect(W / 2 - 170, y - 12, 120, 4);
  ctx.fillRect(W / 2 + 50, y - 12, 120, 4);
  y += 24;

  // German line
  if (L.dl.length) {
    ctx.fillStyle = th.muted;
    ctx.font = `italic 400 ${L.de}px ${SERIF}`;
    y += 30;
    for (const l of L.dl) {
      y += L.de * 1.3;
      ctx.fillText(l, W / 2, y - L.de * 0.3);
    }
  }

  // Footer: logo + company
  let nameY = footY;
  if (input.logo) {
    const img = input.logo as HTMLImageElement;
    const iw = img.naturalWidth || (img as unknown as { width: number }).width || 1;
    const ih = img.naturalHeight || (img as unknown as { height: number }).height || 1;
    const maxH = 130;
    const maxLW = 360;
    const k = Math.min(maxH / ih, maxLW / iw);
    const w = iw * k;
    const h = ih * k;
    // white tile so transparent / dark logos stay readable on every design
    ctx.fillStyle = '#ffffff';
    const pad = 18;
    const tileY = footY - h - 70;
    ctx.beginPath();
    ctx.roundRect(W / 2 - w / 2 - pad, tileY - pad, w + 2 * pad, h + 2 * pad, 18);
    ctx.fill();
    ctx.drawImage(input.logo, W / 2 - w / 2, tileY, w, h);
    nameY = footY + 4;
  }
  if (input.company?.trim()) {
    ctx.fillStyle = th.ink;
    const co = fitText(ctx, input.company.trim(), (s) => `600 ${s}px ${SANS}`, 46, 26, maxW, 1);
    ctx.fillText(co.lines[0] ?? '', W / 2, nameY);
  }
  ctx.restore();
};

/** A new canvas with the card drawn at `scale` (1 = print size). */
export const renderCard = (input: CardInput, scale = 1) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CARD_W * scale);
  canvas.height = Math.round(CARD_H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');
  ctx.scale(scale, scale);
  drawCard(ctx, input);
  return canvas;
};

export const canvasBlob = (canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('NO_BLOB'))), type, quality));

/** Loads a same-origin image (the company logo); null when it fails. */
export const loadImage = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
