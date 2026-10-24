import fs from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { config } from '../../config.js';
import { prisma } from '../../db.js';

/**
 * Biometric passport photo check (rules only, no AI / face detection), run with sharp right after a photo upload
 * and on demand. Checks a German / ICAO passport photo (35 × 45 mm):
 *
 *   FILE_TYPE        JPEG or PNG
 *   RESOLUTION       ≥ 827 × 1063 px (35 × 45 mm at 600 dpi); 300 dpi (413 × 531) still passes with a warning
 *   ASPECT_RATIO     35:45 ± 2 %
 *   BG_LIGHT         border strips (top + upper sides, where only background should be) are light
 *   BG_UNIFORM       … and uniform (low luminance spread)
 *   BG_NEUTRAL       … and neutral (no strong colour cast / coloured wall)
 *   BG_OVEREXPOSED   … but not blown-out pure white (contours of hair / face must stay visible)
 *   BRIGHTNESS       face region neither too dark nor too bright
 *   CONTRAST         face region has enough contrast
 *   SHARPNESS        variance of the Laplacian of the face region
 *   HEAD_SIZE        approximate: the subject is segmented against the border colour; crown = first row with
 *                    subject pixels, chin ≈ top of the neck (narrowest row between head and shoulders);
 *                    (chin − crown) / height should be 70–80 % (64–82 % is accepted: the chin is estimated)
 *   HEAD_TOP_MARGIN  approximate: some background above the head
 *   HEAD_CENTERED    approximate: the head is horizontally centred
 *
 * The result is stored on Document.photoCheck: { ok, level, checks: [{ key, ok, value, expected, severity,
 * approximate? }], width, height, checkedAt }. `ok` = no failed check of severity "error".
 */

export const PHOTO_REQUIREMENT_KEYS = ['PHOTO', 'PHOTO_2'];
export const isPhotoRequirement = (key: string | null | undefined) => !!key && PHOTO_REQUIREMENT_KEYS.includes(key);

export type CheckSeverity = 'error' | 'warning' | 'info';
export type PhotoCheckKey =
  | 'FILE_TYPE'
  | 'RESOLUTION'
  | 'ASPECT_RATIO'
  | 'BG_LIGHT'
  | 'BG_UNIFORM'
  | 'BG_NEUTRAL'
  | 'BG_OVEREXPOSED'
  | 'BRIGHTNESS'
  | 'CONTRAST'
  | 'SHARPNESS'
  | 'HEAD_SIZE'
  | 'HEAD_TOP_MARGIN'
  | 'HEAD_CENTERED';

export interface PhotoCheckItem {
  key: PhotoCheckKey;
  ok: boolean;
  value: string | number | null;
  expected: string;
  /** How bad a failure is ("error" blocks, "warning" is a hint); a passed check keeps the severity it would have. */
  severity: CheckSeverity;
  approximate?: boolean;
}

export interface PhotoCheckResult {
  ok: boolean;
  level: 'OK' | 'WARN' | 'BAD';
  checks: PhotoCheckItem[];
  width: number | null;
  height: number | null;
  checkedAt: string;
}

export const LIMITS = {
  minWidth: 827,
  minHeight: 1063,
  warnWidth: 413,
  warnHeight: 531,
  ratio: 35 / 45,
  ratioTolerance: 0.02,
  bgLightOk: 150,
  bgLightBad: 115,
  bgStdOk: 16,
  bgStdBad: 32,
  bgCastOk: 28,
  bgCastBad: 50,
  bgClippedWarn: 0.55,
  brightMin: 70,
  brightMax: 205,
  brightBadMin: 45,
  brightBadMax: 230,
  contrastOk: 22,
  contrastBad: 12,
  sharpOk: 60,
  sharpBad: 20,
  headMin: 0.64,
  headMax: 0.82,
  headIdealMin: 0.7,
  headIdealMax: 0.8,
};

/** Height of the analysed copy (pixels); the width follows the aspect ratio. */
export const ANALYSIS_HEIGHT = 600;
export const MAX_INPUT_PIXELS = 80_000_000;

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

interface Rgb {
  data: Buffer;
  width: number;
  height: number;
}

const lumAt = (d: Buffer, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

const stats = (img: Rgb, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sl = 0;
  let sl2 = 0;
  let clipped = 0;
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x++) {
      const i = (y * img.width + x) * 3;
      const l = lumAt(img.data, i);
      sr += img.data[i];
      sg += img.data[i + 1];
      sb += img.data[i + 2];
      sl += l;
      sl2 += l * l;
      if (img.data[i] >= 250 && img.data[i + 1] >= 250 && img.data[i + 2] >= 250) clipped++;
      n++;
    }
  }
  if (!n) return null;
  const mean = sl / n;
  return { n, r: sr / n, g: sg / n, b: sb / n, mean, std: Math.sqrt(Math.max(0, sl2 / n - mean * mean)), clipped: clipped / n };
};

/** Border strips that should only show background: the top band and the upper part of both sides. */
const borderStats = (img: Rgb) => {
  const { width: w, height: h } = img;
  const band = Math.max(2, Math.round(h * 0.06));
  const side = Math.max(2, Math.round(w * 0.07));
  // The middle of the top band is left out: hair touching the top edge is a head-position problem (HEAD_TOP_MARGIN), not the wall.
  const corner = Math.round(w * 0.3);
  const parts = [
    stats(img, 0, 0, corner, band),
    stats(img, w - corner, 0, w, band),
    stats(img, 0, band, side, Math.round(h * 0.55)),
    stats(img, w - side, band, w, Math.round(h * 0.55)),
  ].filter((s): s is NonNullable<typeof s> => !!s);
  const n = parts.reduce((a, s) => a + s.n, 0);
  const avg = (k: 'r' | 'g' | 'b' | 'mean' | 'clipped') => parts.reduce((a, s) => a + s[k] * s.n, 0) / n;
  const mean = avg('mean');
  // pooled standard deviation (within + between the strips: a gradient across the wall counts as non-uniform)
  const variance = parts.reduce((a, s) => a + s.n * (s.std * s.std + (s.mean - mean) ** 2), 0) / n;
  return { r: avg('r'), g: avg('g'), b: avg('b'), mean, std: Math.sqrt(variance), clipped: avg('clipped') };
};

/** Variance of the 4-neighbour Laplacian of the luminance inside a box. */
export const laplacianVariance = (img: Rgb, x0: number, y0: number, x1: number, y1: number) => {
  const { width: w } = img;
  let n = 0;
  let s = 0;
  let s2 = 0;
  for (let y = Math.max(1, y0); y < Math.min(img.height - 1, y1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) {
      const c = lumAt(img.data, (y * w + x) * 3);
      const lap = lumAt(img.data, (y * w + x - 1) * 3) + lumAt(img.data, (y * w + x + 1) * 3) + lumAt(img.data, ((y - 1) * w + x) * 3) + lumAt(img.data, ((y + 1) * w + x) * 3) - 4 * c;
      s += lap;
      s2 += lap * lap;
      n++;
    }
  }
  if (!n) return 0;
  const m = s / n;
  return s2 / n - m * m;
};

/**
 * Approximate head geometry: pixels far from the background colour are "subject". Returns the crown row, the
 * chin estimate (top of the neck: narrowest subject row between head and shoulders) and the head's centre column.
 */
export const headGeometry = (img: Rgb, bg: { r: number; g: number; b: number; std: number }) => {
  const { width: w, height: h } = img;
  const thr = Math.max(38, bg.std * 3.5);
  const widths = new Array<number>(h).fill(0);
  const lefts = new Array<number>(h).fill(-1);
  const rights = new Array<number>(h).fill(-1);
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const d = Math.abs(img.data[i] - bg.r) + Math.abs(img.data[i + 1] - bg.g) + Math.abs(img.data[i + 2] - bg.b);
      if (d / 1.7 > thr) {
        count++;
        if (lefts[y] < 0) lefts[y] = x;
        rights[y] = x;
      }
    }
    widths[y] = count;
  }
  const minRow = Math.max(2, Math.round(w * 0.03));
  const crown = widths.findIndex((c) => c >= minRow);
  if (crown < 0) return null;
  // Widest row of the head (upper half below the crown) and the narrowest row (neck) further down.
  const headZoneEnd = Math.min(h - 1, crown + Math.round((h - crown) * 0.55));
  let headWidth = 0;
  for (let y = crown; y <= headZoneEnd; y++) headWidth = Math.max(headWidth, widths[y]);
  const searchFrom = crown + Math.round((h - crown) * 0.45);
  const searchTo = Math.round(h * 0.985);
  let neckWidth = Infinity;
  for (let y = searchFrom; y < searchTo; y++) if (widths[y] >= minRow && widths[y] < neckWidth) neckWidth = widths[y];
  if (!Number.isFinite(neckWidth) || neckWidth > headWidth * 0.92) return { crown, chin: null, center: null, headWidth };
  let chin = searchFrom;
  for (let y = searchFrom; y < searchTo; y++) {
    if (widths[y] <= neckWidth * 1.08 + 1) {
      chin = y;
      break;
    }
  }
  let cx = 0;
  let rows = 0;
  for (let y = crown; y < chin; y++) {
    if (lefts[y] >= 0) {
      cx += (lefts[y] + rights[y]) / 2;
      rows++;
    }
  }
  return { crown, chin, center: rows ? cx / rows / w : null, headWidth };
};

const item = (key: PhotoCheckKey, ok: boolean, value: PhotoCheckItem['value'], expected: string, severity: CheckSeverity, approximate = false): PhotoCheckItem => ({ key, ok, value, expected, severity, ...(approximate ? { approximate } : {}) });

const finish = (checks: PhotoCheckItem[], width: number | null, height: number | null): PhotoCheckResult => {
  const bad = checks.some((c) => !c.ok && c.severity === 'error');
  const warn = checks.some((c) => !c.ok && c.severity === 'warning');
  return { ok: !bad, level: bad ? 'BAD' : warn ? 'WARN' : 'OK', checks, width, height, checkedAt: new Date().toISOString() };
};

/** Runs every rule on an image buffer. Never throws: an unreadable file is a failed FILE_TYPE check. */
export const analyzePhoto = async (buf: Buffer, mimeType?: string | null): Promise<PhotoCheckResult> => {
  const checks: PhotoCheckItem[] = [];
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    checks.push(item('FILE_TYPE', false, mimeType ?? 'unknown', 'JPEG / PNG', 'error'));
    return finish(checks, null, null);
  }
  const format = meta.format ?? 'unknown';
  const typeOk = format === 'jpeg' || format === 'png';
  checks.push(item('FILE_TYPE', typeOk, format.toUpperCase(), 'JPEG / PNG', 'error'));
  if (!typeOk) return finish(checks, meta.width ?? null, meta.height ?? null);

  // EXIF orientation: phones store portrait photos rotated.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;

  const resOk = width >= LIMITS.minWidth && height >= LIMITS.minHeight;
  const resWarn = width >= LIMITS.warnWidth && height >= LIMITS.warnHeight;
  checks.push(item('RESOLUTION', resOk, `${width}×${height}`, `≥ ${LIMITS.minWidth}×${LIMITS.minHeight}`, resWarn ? 'warning' : 'error'));

  const ratio = width / Math.max(1, height);
  const dev = Math.abs(ratio - LIMITS.ratio) / LIMITS.ratio;
  checks.push(item('ASPECT_RATIO', dev <= LIMITS.ratioTolerance, round(ratio, 3), `0.778 ± 2 % (35:45)`, dev > 0.15 ? 'error' : 'warning'));

  let img: Rgb;
  try {
    const out = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ height: Math.min(ANALYSIS_HEIGHT, height || ANALYSIS_HEIGHT), withoutEnlargement: true })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    img = { data: out.data, width: out.info.width, height: out.info.height };
    if (out.info.channels !== 3) throw new Error('channels');
  } catch {
    return finish(checks, width, height);
  }

  const bg = borderStats(img);
  const cast = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
  checks.push(item('BG_LIGHT', bg.mean >= LIMITS.bgLightOk, Math.round(bg.mean), `≥ ${LIMITS.bgLightOk} / 255`, bg.mean < LIMITS.bgLightBad ? 'error' : 'warning'));
  checks.push(item('BG_UNIFORM', bg.std <= LIMITS.bgStdOk, round(bg.std), `≤ ${LIMITS.bgStdOk}`, bg.std > LIMITS.bgStdBad ? 'error' : 'warning'));
  checks.push(item('BG_NEUTRAL', cast <= LIMITS.bgCastOk, Math.round(cast), `≤ ${LIMITS.bgCastOk}`, cast > LIMITS.bgCastBad ? 'error' : 'warning'));
  checks.push(item('BG_OVEREXPOSED', bg.clipped <= LIMITS.bgClippedWarn, `${Math.round(bg.clipped * 100)} %`, `≤ ${Math.round(LIMITS.bgClippedWarn * 100)} %`, 'warning'));

  // Face region: the middle of the picture.
  const fx0 = Math.round(img.width * 0.28);
  const fx1 = Math.round(img.width * 0.72);
  const fy0 = Math.round(img.height * 0.22);
  const fy1 = Math.round(img.height * 0.68);
  const face = stats(img, fx0, fy0, fx1, fy1);
  if (face) {
    const brightOk = face.mean >= LIMITS.brightMin && face.mean <= LIMITS.brightMax;
    const brightBad = face.mean < LIMITS.brightBadMin || face.mean > LIMITS.brightBadMax;
    checks.push(item('BRIGHTNESS', brightOk, Math.round(face.mean), `${LIMITS.brightMin}–${LIMITS.brightMax} / 255`, brightBad ? 'error' : 'warning'));
    checks.push(item('CONTRAST', face.std >= LIMITS.contrastOk, round(face.std), `≥ ${LIMITS.contrastOk}`, face.std < LIMITS.contrastBad ? 'error' : 'warning'));
  }
  const sharp_ = laplacianVariance(img, fx0, fy0, fx1, fy1);
  checks.push(item('SHARPNESS', sharp_ >= LIMITS.sharpOk, round(sharp_), `≥ ${LIMITS.sharpOk}`, sharp_ < LIMITS.sharpBad ? 'error' : 'warning'));

  // Approximate head geometry (only meaningful on a plain background).
  if (bg.std <= LIMITS.bgStdBad) {
    const g = headGeometry(img, bg);
    if (g) {
      const top = g.crown / img.height;
      checks.push(item('HEAD_TOP_MARGIN', top >= 0.02, `${Math.round(top * 100)} %`, '≥ 2 %', 'warning', true));
      if (g.chin !== null) {
        const ratioHead = (g.chin - g.crown) / img.height;
        checks.push(item('HEAD_SIZE', ratioHead >= LIMITS.headMin && ratioHead <= LIMITS.headMax, `${Math.round(ratioHead * 100)} %`, `${Math.round(LIMITS.headIdealMin * 100)}–${Math.round(LIMITS.headIdealMax * 100)} %`, 'warning', true));
      }
      if (g.center !== null) checks.push(item('HEAD_CENTERED', Math.abs(g.center - 0.5) <= 0.08, `${Math.round(g.center * 100)} %`, '50 ± 8 %', 'warning', true));
    }
  }
  return finish(checks, width, height);
};

// ─── Documents ──────────────────────────────────────────────────────────

const docPath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));

/** Runs the check for a case document and stores it on Document.photoCheck. Returns null when the file is gone. */
export const checkDocumentPhoto = async (documentId: string): Promise<PhotoCheckResult | null> => {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, storedName: true, mimeType: true } });
  if (!doc) return null;
  let buf: Buffer;
  try {
    buf = await fs.readFile(docPath(doc.storedName));
  } catch {
    return null;
  }
  const result = await analyzePhoto(buf, doc.mimeType);
  await prisma.document.update({ where: { id: doc.id }, data: { photoCheck: result as unknown as Prisma.InputJsonValue } });
  return result;
};

/**
 * Upload hook: runs the check when the document belongs to a biometric photo requirement. Never throws (an
 * upload must not fail because of it); returns the result for the upload response, or null.
 */
export const photoCheckOnUpload = async (documentId: string): Promise<PhotoCheckResult | null> => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { requirement: { select: { key: true } } } });
    if (!isPhotoRequirement(doc?.requirement?.key)) return null;
    return await checkDocumentPhoto(documentId);
  } catch (err) {
    console.error('[photoCheck] upload check failed', documentId, err);
    return null;
  }
};
