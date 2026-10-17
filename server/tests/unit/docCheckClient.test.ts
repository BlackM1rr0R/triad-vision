import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Pure analysis functions of the browser-side document check (client/src/lib/docCheck.ts). The client
 * has no test runner, so they are exercised here on synthetic greyscale images. The module is loaded
 * by URL so the server type-check does not pull client sources in.
 */

type Issue = { code: string; level: 'warn' | 'error' };
interface ClientDocCheck {
  laplacianVariance: (g: ArrayLike<number>, w: number, h: number) => number;
  luminanceStats: (g: ArrayLike<number>) => { mean: number; std: number };
  touchedBorders: (g: ArrayLike<number>, w: number, h: number) => { count: number };
  toGray: (rgba: ArrayLike<number>, w: number, h: number) => Uint8ClampedArray;
  analyseGray: (g: ArrayLike<number>, w: number, h: number, o: { width: number; height: number }) => {
    mean: number;
    std: number;
    blurVariance: number;
    touched: number;
  };
  evaluateImage: (m: { width: number; height: number; mean: number; std: number; blurVariance: number; touched: number }) => Issue[];
  evaluateBasics: (f: { name: string; type: string; size: number }) => Issue[];
  evaluatePdf: (text: string, size: number, complete?: boolean) => Issue[];
  levelOf: (i: Issue[]) => string;
  BLUR_MIN_VARIANCE: number;
}

let m: ClientDocCheck;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/docCheck.ts');
  m = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as ClientDocCheck;
});

const W = 400;
const H = 300;

/** White page with a dark "text" block (lines of glyph-like stripes) inside a margin. */
const documentImage = (opts: { margin: number; background?: number; ink?: number; blur?: number }) => {
  const bg = opts.background ?? 235;
  const ink = opts.ink ?? 30;
  let g = new Float32Array(W * H).fill(bg);
  for (let y = opts.margin; y < H - opts.margin; y++) {
    if (y % 12 >= 6) continue; // text lines
    for (let x = opts.margin; x < W - opts.margin; x++) {
      if (x % 7 < 3) g[y * W + x] = ink; // glyph strokes
    }
  }
  for (let pass = 0; pass < (opts.blur ?? 0); pass++) {
    const next = new Float32Array(g.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && yy < H && xx >= 0 && xx < W) {
              s += g[yy * W + xx];
              n++;
            }
          }
        }
        next[y * W + x] = s / n;
      }
    }
    g = next;
  }
  return Uint8ClampedArray.from(g);
};

describe('client document check (pure part)', () => {
  it('sharp document passes, blurred one is BLURRY', () => {
    const sharp = m.analyseGray(documentImage({ margin: 30 }), W, H, { width: 3000, height: 2250 });
    const blurred = m.analyseGray(documentImage({ margin: 30, blur: 3 }), W, H, { width: 3000, height: 2250 });
    expect(sharp.blurVariance).toBeGreaterThan(m.BLUR_MIN_VARIANCE * 10);
    expect(blurred.blurVariance).toBeLessThan(m.BLUR_MIN_VARIANCE);
    expect(m.evaluateImage({ ...sharp, width: 3000, height: 2250 })).toEqual([]);
    expect(m.evaluateImage({ ...blurred, width: 3000, height: 2250 }).map((i) => i.code)).toEqual(['BLURRY']);
  });

  it('dark and washed-out photos', () => {
    const dark = m.analyseGray(documentImage({ margin: 30, background: 40, ink: 5 }), W, H, { width: 3000, height: 2000 });
    expect(m.evaluateImage({ ...dark, width: 3000, height: 2000 }).map((i) => i.code)).toContain('TOO_DARK');
    const washed = { width: 3000, height: 2000, mean: 248, std: 6, blurVariance: 500, touched: 0 };
    expect(m.evaluateImage(washed).map((i) => i.code)).toEqual(['TOO_BRIGHT']);
    // A clean white scan with text keeps enough contrast.
    expect(m.evaluateImage({ ...washed, std: 60 })).toEqual([]);
  });

  it('content running into the frame is CUT_OFF, a page with margins is not', () => {
    expect(m.touchedBorders(documentImage({ margin: 30 }), W, H).count).toBe(0);
    expect(m.touchedBorders(documentImage({ margin: 0 }), W, H).count).toBeGreaterThanOrEqual(2);
    const cut = m.analyseGray(documentImage({ margin: 0 }), W, H, { width: 3000, height: 2250 });
    expect(m.evaluateImage({ ...cut, width: 3000, height: 2250 }).map((i) => i.code)).toContain('CUT_OFF');
  });

  it('low resolution below 1000 px long edge', () => {
    const issues = m.evaluateImage({ width: 800, height: 600, mean: 150, std: 60, blurVariance: 400, touched: 0 });
    expect(issues).toEqual([expect.objectContaining({ code: 'LOW_RESOLUTION', level: 'warn' })]);
    expect(m.levelOf(issues)).toBe('warn');
  });

  it('greyscale conversion and stats', () => {
    const g = m.toGray([255, 255, 255, 255, 0, 0, 0, 255], 2, 1);
    expect(Array.from(g)).toEqual([255, 0]);
    expect(m.luminanceStats([0, 255])).toEqual({ mean: 127.5, std: 127.5 });
    expect(m.laplacianVariance(new Uint8ClampedArray(100).fill(128), 10, 10)).toBe(0);
  });

  it('basics: type, emptiness and size are errors', () => {
    expect(m.evaluateBasics({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })[0]).toMatchObject({ code: 'BAD_TYPE', level: 'error' });
    expect(m.evaluateBasics({ name: 'a.pdf', type: 'application/pdf', size: 0 })[0].code).toBe('EMPTY');
    expect(m.evaluateBasics({ name: 'a.jpg', type: 'image/jpeg', size: 6 * 1024 * 1024 })[0].code).toBe('TOO_LARGE');
    expect(m.evaluateBasics({ name: 'a.JPG', type: 'image/jpeg', size: 1000 })).toEqual([]);
  });

  it('PDF: header, encryption, pages, tiny size', () => {
    const page = '%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n' + 'x'.repeat(6000);
    expect(m.evaluatePdf(page, 6100)).toEqual([]);
    expect(m.evaluatePdf('GIF89a', 6000)[0]).toMatchObject({ code: 'PDF_INVALID', level: 'error' });
    expect(m.evaluatePdf(page + '/Encrypt 5 0 R', 6100).map((i) => i.code)).toEqual(['PDF_ENCRYPTED']);
    expect(m.evaluatePdf('%PDF-1.4 /Type /Pages', 9000).map((i) => i.code)).toEqual(['PDF_NO_PAGES']);
    expect(m.evaluatePdf('%PDF-1.4 /Type /Pages', 9000, false)).toEqual([]);
    expect(m.evaluatePdf('%PDF-1.5 /ObjStm', 9000)).toEqual([]);
    expect(m.evaluatePdf('%PDF-1.4 /Type /Page', 1200).map((i) => i.code)).toEqual(['PDF_TINY']);
  });
});
