// Pure sizing rules of the upload image compression (lib/imageCompress.ts). No imports: the server test suite
// loads this file directly (server/tests/unit/imageCompress.test.ts).

export const COMPRESS = {
  maxLongEdge: 2200,
  minShortEdge: 1200,
  quality: 0.82,
  minBytes: 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/**
 * Output size for a w×h image (pure; unit-tested from the server suite).
 * null = keep the original size.
 */
export const targetSize = (
  width: number,
  height: number,
  opts: { maxLongEdge?: number; minShortEdge?: number } = {},
): { width: number; height: number } | null => {
  const maxLong = opts.maxLongEdge ?? COMPRESS.maxLongEdge;
  const minShort = opts.minShortEdge ?? COMPRESS.minShortEdge;
  if (!(width > 0) || !(height > 0)) return null;
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  let scale = Math.min(1, maxLong / long);
  // Keep enough resolution for the scan-quality check (and never upscale).
  if (short * scale < minShort) scale = Math.min(1, minShort / short);
  if (scale >= 1) return null;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

