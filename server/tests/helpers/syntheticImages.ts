import { encodePng } from '../../src/lib/driveIntel/ocr.js';
import type { Gray } from '../../src/lib/uploadAi/quality.js';

/**
 * Synthetic grayscale "documents" for the scan-quality tests — no image library involved: a page with
 * lines of text-like strokes, optionally blurred, darkened, cut off at the borders, on a desk, with a flash
 * reflection. `png()` encodes one with the drive's own PNG encoder for upload tests.
 */

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

export interface PageOpts {
  width?: number;
  height?: number;
  /** Strokes run into every border (a photo that cut the document off). */
  cut?: boolean;
  /** Box-blur radius applied three times (≈ Gaussian). */
  blur?: number;
  /** Multiplies every pixel (0.15 = very dark photo). */
  gain?: number;
  /** Paper on a mid-grey desk (margins around the page). */
  desk?: boolean;
  /** A saturated, text-free flash reflection in the middle. */
  glare?: boolean;
  /** Uniform image (no content). */
  blank?: boolean;
  seed?: number;
}

const boxBlur = (g: Gray, r: number) => {
  const { width: w, height: h } = g;
  const tmp = new Float32Array(w * h);
  const src = g.data;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(acc / (2 * r + 1));
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return { data: out, width: w, height: h };
};

export const syntheticPage = (o: PageOpts = {}): Gray => {
  const w = o.width ?? 900;
  const h = o.height ?? 1200;
  const data = new Uint8Array(w * h);
  if (o.blank) {
    data.fill(200);
    return { data, width: w, height: h };
  }
  const desk = o.desk ? Math.round(Math.min(w, h) * 0.08) : 0;
  data.fill(o.desk ? 110 : 245);
  for (let y = desk; y < h - desk; y++) for (let x = desk; x < w - desk; x++) data[y * w + x] = 245;
  const rand = rng(o.seed ?? 7);
  const margin = o.cut ? -20 : desk + Math.round(w * 0.08);
  const lineH = Math.max(12, Math.round(h / 45));
  for (let y = margin + lineH; y < h - margin - lineH; y += lineH * 1.6) {
    let x = margin;
    while (x < w - margin) {
      const len = 6 + Math.floor(rand() * 40);
      const tall = 0.5 + rand() * 0.5;
      for (let yy = Math.round(y - lineH * tall); yy < y; yy++) {
        for (let xx = x; xx < x + len; xx++) {
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          // letter-like strokes: vertical bars 2 px wide with gaps
          if ((xx - x) % 5 < 2 || yy === y - 1 || yy === Math.round(y - lineH * tall)) data[yy * w + xx] = 25;
        }
      }
      x += len + 8 + Math.floor(rand() * 10);
    }
  }
  let g: Gray = { data, width: w, height: h };
  if (o.glare) {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.17;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) g.data[y * w + x] = 255;
  }
  if (o.blur) for (let i = 0; i < 3; i++) g = boxBlur(g, o.blur);
  if (o.gain !== undefined) for (let i = 0; i < g.data.length; i++) g.data[i] = Math.round(g.data[i] * o.gain!);
  return g;
};

/** PNG bytes of a synthetic page (8-bit grey). */
export const pagePng = (o: PageOpts = {}) => {
  const g = syntheticPage(o);
  return encodePng(Buffer.from(g.data), g.width, g.height, 1);
};
