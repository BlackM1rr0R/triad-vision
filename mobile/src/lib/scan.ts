/**
 * Pure helpers for the document scanner: output sizing for the compressed JPEG pages and the file
 * names the server will store. The native work (camera, rotate, resize) lives in features/case/scanner.ts.
 */
export const SCAN_MAX_EDGE = 1600;
export const SCAN_JPEG_QUALITY = 0.8;

export interface Size {
  width: number;
  height: number;
}

/** Image size after rotating by a multiple of 90°. */
export const rotatedSize = (size: Size, degrees: number): Size => {
  const quarter = ((Math.round(degrees / 90) % 4) + 4) % 4;
  return quarter % 2 === 1 ? { width: size.height, height: size.width } : { ...size };
};

/**
 * The resize action that brings the long edge down to `maxEdge` while keeping the aspect ratio.
 * Returns null when the image is already small enough (never upscale).
 */
export const fitLongEdge = (size: Size, maxEdge = SCAN_MAX_EDGE): { width: number } | { height: number } | null => {
  if (size.width <= 0 || size.height <= 0) return null;
  if (size.width <= maxEdge && size.height <= maxEdge) return null;
  return size.width >= size.height ? { width: maxEdge } : { height: maxEdge };
};

/** Normalises any rotation to 0 / 90 / 180 / 270. */
export const normaliseRotation = (degrees: number) => ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;

const stamp = (d: Date) => d.toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** "scan-2026-10-15-09-30-00-p2.jpg" — the page index keeps multi-page uploads ordered on the server. */
export const scanFileName = (page: number, total: number, now = new Date()) =>
  total > 1 ? `scan-${stamp(now)}-p${page}.jpg` : `scan-${stamp(now)}.jpg`;
