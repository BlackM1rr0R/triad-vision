import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { THRESHOLDS } from '../../src/lib/uploadAi/quality.js';

/**
 * Sizing rules of the browser-side upload compression (client/src/lib/imageSize.ts) against the server scan
 * quality check: a compressed document photo must never fall under the "low resolution" warning.
 * Loaded by URL so the server type-check does not pull client sources in.
 */
interface Sizing {
  COMPRESS: { maxLongEdge: number; minShortEdge: number; quality: number; minBytes: number };
  targetSize: (w: number, h: number, opts?: { maxLongEdge?: number; minShortEdge?: number }) => { width: number; height: number } | null;
}

let m: Sizing;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/imageSize.ts');
  m = (await import(pathToFileURL(file).href)) as Sizing;
});

describe('upload image compression sizing', () => {
  it('keeps the short side above the server low-resolution threshold', () => {
    expect(m.COMPRESS.minShortEdge).toBeGreaterThan(THRESHOLDS.document.minShortWarn);
    for (const [w, h] of [[4032, 3024], [3024, 4032], [8000, 2000], [6000, 1300], [4000, 4000]]) {
      const out = m.targetSize(w, h)!;
      expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(m.COMPRESS.minShortEdge);
      expect(Math.min(out.width, out.height)).toBeGreaterThan(THRESHOLDS.document.minShortWarn);
    }
  });

  it('brings the long side down to 2200 px for normal photos and keeps the aspect ratio', () => {
    expect(m.targetSize(4032, 3024)).toEqual({ width: 2200, height: 1650 });
    expect(m.targetSize(3024, 4032)).toEqual({ width: 1650, height: 2200 });
  });

  it('never upscales and leaves small images alone', () => {
    expect(m.targetSize(2000, 1500)).toBeNull();
    expect(m.targetSize(2400, 1100)).toBeNull(); // short side already under 1200: kept
    expect(m.targetSize(0, 100)).toBeNull();
  });

  it('a very long image keeps 1200 px on its short side', () => {
    expect(m.targetSize(8000, 2000)).toEqual({ width: 4800, height: 1200 });
  });
});
