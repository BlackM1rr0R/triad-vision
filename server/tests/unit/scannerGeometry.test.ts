import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Pure geometry / image functions of the in-browser document scanner (client/src/lib/scanner/geometry.ts):
 * homography, quad detection on synthetic photos, perspective warp, output size, enhancement. The client has
 * no test runner; the module is loaded by URL so the server type-check does not pull client sources in.
 */

type Pt = { x: number; y: number };
type Quad = [Pt, Pt, Pt, Pt];
interface Geometry {
  homography: (src: Quad, dst: Quad) => number[] | null;
  applyHomography: (H: number[], x: number, y: number) => Pt;
  convexHull: (pts: Pt[]) => Pt[];
  quadFromHull: (hull: Pt[]) => Quad | null;
  orderQuad: (pts: Pt[]) => Quad;
  isConvexQuad: (q: Quad) => boolean;
  detectDocument: (rgba: ArrayLike<number>, w: number, h: number, maxSide?: number) => { quad: Quad; found: boolean; coverage: number };
  outputSize: (q: Quad, maxLong?: number) => { width: number; height: number };
  warpPerspective: (rgba: ArrayLike<number>, w: number, h: number, q: Quad, outW: number, outH: number) => Uint8ClampedArray;
  rotateRgba: (rgba: Uint8ClampedArray, w: number, h: number, turns: number) => { data: Uint8ClampedArray; width: number; height: number };
  enhance: (rgba: Uint8ClampedArray, w: number, h: number, mode: 'auto' | 'gray' | 'bw' | 'original') => Uint8ClampedArray;
}

let g: Geometry;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/scanner/geometry.ts');
  g = (await import(pathToFileURL(file).href)) as Geometry;
});

/** Deterministic pseudo-random numbers (no flaky tests). */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const inside = (q: Pt[], x: number, y: number) => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    const s = Math.sign(c);
    if (s === 0) continue;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
};

/**
 * Synthetic phone photo: textured darker table, a white sheet (the quad) with uneven light and dark
 * "text lines" inside, plus noise.
 */
const photo = (w: number, h: number, q: Quad, opts: { seed?: number; table?: number; paper?: number } = {}) => {
  const rand = rng(opts.seed ?? 7);
  const data = new Uint8ClampedArray(w * h * 4);
  const H = g.homography(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    q,
  )!;
  // Inverse mapping from the image into sheet coordinates, to draw text lines in the sheet's frame.
  const Hinv = g.homography(q, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ])!;
  expect(H).toBeTruthy();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      let v: number;
      if (inside(q, x, y)) {
        const s = g.applyHomography(Hinv, x, y);
        const line = s.x > 0.1 && s.x < 0.9 && s.y > 0.12 && s.y < 0.88 && Math.floor(s.y * 40) % 3 === 0 && (s.x * 37) % 1 < 0.8;
        v = (opts.paper ?? 225) - x * 0.04 - (line ? 150 : 0);
      } else {
        v = (opts.table ?? 70) + 18 * Math.sin(x / 9) * Math.cos(y / 13);
      }
      v += (rand() - 0.5) * 16;
      data[p] = v;
      data[p + 1] = v * 0.98;
      data[p + 2] = v * 0.93;
      data[p + 3] = 255;
    }
  }
  return data;
};

const near = (a: Pt, b: Pt, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('scanner geometry — homography', () => {
  it('maps the four source corners onto the destination corners and keeps lines straight', () => {
    const src: Quad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 140 },
      { x: 0, y: 140 },
    ];
    const dst: Quad = [
      { x: 12, y: 30 },
      { x: 410, y: 8 },
      { x: 450, y: 590 },
      { x: 30, y: 560 },
    ];
    const H = g.homography(src, dst)!;
    src.forEach((p, i) => expect(near(g.applyHomography(H, p.x, p.y), dst[i], 1e-6)).toBe(true));
    // The midpoint of a source edge lands on the destination edge (collinear).
    const m = g.applyHomography(H, 50, 0);
    const cross = (dst[1].x - dst[0].x) * (m.y - dst[0].y) - (dst[1].y - dst[0].y) * (m.x - dst[0].x);
    expect(Math.abs(cross)).toBeLessThan(1e-6 * 400 * 400);
    // Inverse composes to the identity.
    const back = g.homography(dst, src)!;
    const p = g.applyHomography(back, ...(Object.values(g.applyHomography(H, 33, 77)) as [number, number]));
    expect(near(p, { x: 33, y: 77 }, 1e-6)).toBe(true);
    // Degenerate input (three collinear corners) has no solution.
    expect(g.homography(src, [dst[0], dst[0], dst[0], dst[0]])).toBeNull();
  });

  it('orders corners, builds hulls and the largest inscribed quad', () => {
    const q = g.orderQuad([
      { x: 90, y: 95 },
      { x: 5, y: 10 },
      { x: 10, y: 92 },
      { x: 95, y: 3 },
    ]);
    expect(q).toEqual([
      { x: 5, y: 10 },
      { x: 95, y: 3 },
      { x: 90, y: 95 },
      { x: 10, y: 92 },
    ]);
    expect(g.isConvexQuad(q)).toBe(true);
    // Points of a rotated rectangle outline plus interior noise → the rectangle's corners.
    const corners: Quad = [
      { x: 40, y: 20 },
      { x: 180, y: 50 },
      { x: 160, y: 200 },
      { x: 20, y: 170 },
    ];
    const pts: Pt[] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      for (let t = 0; t <= 1; t += 0.05) pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    for (let i = 0; i < 50; i++) pts.push({ x: 60 + (i % 10) * 9, y: 60 + Math.floor(i / 10) * 20 });
    const hull = g.convexHull(pts);
    const found = g.quadFromHull(hull)!;
    found.forEach((p, i) => expect(near(p, corners[i], 2)).toBe(true));
  });
});

describe('scanner geometry — document detection', () => {
  it('finds a rotated sheet on a textured table', () => {
    const w = 800;
    const h = 600;
    const sheet: Quad = [
      { x: 230, y: 70 },
      { x: 560, y: 110 },
      { x: 520, y: 540 },
      { x: 175, y: 500 },
    ];
    const d = g.detectDocument(photo(w, h, sheet), w, h, 400);
    expect(d.found).toBe(true);
    d.quad.forEach((p, i) => expect(near(p, sheet[i], 0.025 * w)).toBe(true));
    expect(d.coverage).toBeGreaterThan(0.2);
  });

  it('finds a sheet seen in strong perspective (trapezoid)', () => {
    const w = 640;
    const h = 860;
    const sheet: Quad = [
      { x: 170, y: 140 },
      { x: 470, y: 150 },
      { x: 590, y: 760 },
      { x: 40, y: 740 },
    ];
    const d = g.detectDocument(photo(w, h, sheet, { seed: 3, table: 90 }), w, h, 400);
    expect(d.found).toBe(true);
    d.quad.forEach((p, i) => expect(near(p, sheet[i], 0.03 * h)).toBe(true));
  });

  it('falls back to the full frame when there is no document', () => {
    const w = 320;
    const h = 240;
    const rand = rng(11);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = 120 + (rand() - 0.5) * 30;
      data.set([v, v, v, 255], i * 4);
    }
    const d = g.detectDocument(data, w, h);
    expect(d.found).toBe(false);
    expect(d.quad).toEqual([
      { x: 0, y: 0 },
      { x: w - 1, y: 0 },
      { x: w - 1, y: h - 1 },
      { x: 0, y: h - 1 },
    ]);
  });
});

describe('scanner geometry — warp, size, enhancement', () => {
  it('sizes the output like A4 (long side 2000, short side ≥ 1000 for the quality check)', () => {
    const portrait = g.outputSize([
      { x: 0, y: 0 },
      { x: 700, y: 0 },
      { x: 700, y: 1000 },
      { x: 0, y: 1000 },
    ]);
    expect(portrait).toEqual({ width: 1414, height: 2000 });
    const landscape = g.outputSize([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 2100 },
      { x: 0, y: 2100 },
    ]);
    expect(landscape).toEqual({ width: 2000, height: 1414 });
    // Clearly not A4 (receipt): aspect kept.
    const receipt = g.outputSize([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 1200 },
      { x: 0, y: 1200 },
    ]);
    expect(receipt.height).toBe(2000);
    expect(receipt.width).toBe(500);
  });

  it('warps the sheet to a rectangle: corners white paper, outside table never sampled', () => {
    const w = 400;
    const h = 300;
    const sheet: Quad = [
      { x: 100, y: 40 },
      { x: 300, y: 60 },
      { x: 280, y: 270 },
      { x: 90, y: 250 },
    ];
    const img = photo(w, h, sheet, { seed: 5 });
    const out = g.warpPerspective(img, w, h, sheet, 100, 140);
    // Pixels just inside each corner of the output come from the paper (bright), not the table (dark).
    for (const [x, y] of [
      [3, 3],
      [96, 3],
      [96, 136],
      [3, 136],
    ]) {
      expect(out[(y * 100 + x) * 4]).toBeGreaterThan(160);
    }
    expect(out[3]).toBe(255);
    const r = g.rotateRgba(out, 100, 140, 1);
    expect([r.width, r.height]).toEqual([140, 100]);
    // Top-left of the rotated image is the bottom-left of the original.
    expect(r.data[0]).toBe(out[(139 * 100 + 0) * 4]);
  });

  it('flattens a shadow, stretches contrast and thresholds to pure black and white', () => {
    const w = 200;
    const h = 200;
    const base = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Paper 200 on the left fading to 110 on the right (shadow); a dark text bar in the middle.
        const paper = 200 - (x / w) * 90;
        const text = y > 95 && y < 105 && x > 20 && x < 180;
        const v = text ? paper * 0.35 : paper;
        base.set([v, v * 0.95, v * 0.85, 255], (y * w + x) * 4);
      }
    }
    const auto = g.enhance(base.slice(), w, h, 'auto');
    const left = (50 * w + 10) * 4;
    const right = (50 * w + 190) * 4;
    // After shadow removal both paper areas are near white and neutral (white balance).
    expect(auto[left]).toBeGreaterThan(225);
    expect(auto[right]).toBeGreaterThan(225);
    expect(Math.abs(auto[right] - auto[right + 2])).toBeLessThan(20);
    const bw = g.enhance(base.slice(), w, h, 'bw');
    const values = new Set<number>();
    for (let i = 0; i < bw.length; i += 4) values.add(bw[i]);
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255]);
    expect(bw[(100 * w + 100) * 4]).toBe(0); // text stays black
    expect(bw[right]).toBe(255); // shadowed paper becomes white
    const gray = g.enhance(base.slice(), w, h, 'gray');
    expect(gray[left]).toBe(gray[left + 1]);
    const original = base.slice();
    expect(g.enhance(original, w, h, 'original')).toEqual(base);
  });
});
