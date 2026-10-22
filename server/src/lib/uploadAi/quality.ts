import { PDFDocument } from 'pdf-lib';
import { imageSize } from '../docsIntel/passportScan.js';
import { decodeInChild } from './decoder.js';

/**
 * Scan quality check, right after an upload (in the request, well below a second for a phone photo).
 *
 * Images are decoded and downscaled with @napi-rs/canvas (prebuilt Skia binaries; already installed as the
 * optional canvas of pdfjs-dist) in an isolated child process (decoder.ts: Skia crashes on some malformed
 * files) — without it, or when the decode fails, only the header checks run. The metrics work on
 * an 8-bit grayscale copy whose long side is at most ANALYSIS_EDGE pixels:
 *   - resolution     short side of the original (documents: WARN < 1000 px, BAD < 600 px);
 *   - blur           99.5th percentile and variance of the 4-neighbour Laplacian (sharp text has strong
 *                    second derivatives; a blurred photo has none);
 *   - exposure       mean / spread of the luminance, share of nearly black pixels;
 *   - glare          the largest connected patch of clipped (≥ 250) cells on a photo that is not a white page;
 *   - cut off        strong edges in the outer band of a side about as dense as inside the document AND that
 *                    band as bright as the page (text running into the border, not a table around the paper);
 *   - compression    JPEG bytes per pixel.
 * PDFs: page count, page size, text layer vs. scan; the first scanned page's embedded image goes through the
 * image metrics (blur, darkness…) and its dpi is checked.
 *
 * Every metric is a pure function on a `Gray` buffer, unit tested with synthetic images.
 */

export type QualityLevel = 'OK' | 'WARN' | 'BAD';
export type QualityCode =
  | 'LOW_RESOLUTION'
  | 'BLURRY'
  | 'TOO_DARK'
  | 'OVEREXPOSED'
  | 'NO_CONTENT'
  | 'GLARE'
  | 'CUT_OFF'
  | 'TOO_COMPRESSED'
  | 'PDF_UNREADABLE'
  | 'PDF_LOW_DPI'
  | 'PDF_SMALL_PAGE'
  | 'PDF_NO_PAGES'
  | 'UNREADABLE';

export interface QualityReason {
  code: QualityCode;
  level: 'WARN' | 'BAD';
  params?: Record<string, number | string>;
}

export interface QualityReport {
  level: QualityLevel;
  reasons: QualityReason[];
  kind: 'image' | 'pdf' | 'other';
  metrics: Record<string, number | boolean | string | null>;
  /** True when the pixels could not be analysed (no canvas, undecodable): only header checks ran. */
  partial?: boolean;
  ms: number;
}

export interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Long side of the analysed grayscale copy. */
export const ANALYSIS_EDGE = 1200;
/** Images above this many pixels are not decoded (memory); only their size is checked. */
export const MAX_DECODE_PIXELS = 60_000_000;

export const THRESHOLDS = {
  document: { minShortWarn: 1000, minShortBad: 600 },
  photo: { minShortWarn: 600, minShortBad: 300 },
  /** 99.5th percentile of |Laplacian| on the analysis copy. */
  blurBad: 28,
  blurWarn: 48,
  darkBad: 45,
  darkWarn: 75,
  /** Luminance standard deviation below which the image has no content at all. */
  blankStd: 6,
  glareWarn: 0.02,
  glareBad: 0.08,
  /** Edge density of a border band relative to the interior that counts as "content touches the edge". */
  cutRatio: 0.55,
  cutBrightness: 30,
  /** JPEG bytes per pixel below which the photo is over-compressed (only above 1 MP). */
  minBytesPerPixel: 0.02,
  pdfDpiWarn: 150,
  pdfDpiBad: 100,
} as const;

// ─── Pure metrics ───────────────────────────────────────────────────────

/** RGBA pixels → luminance (Rec. 601). */
export const toGray = (rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Gray => {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  return { data, width, height };
};

/** Absolute 4-neighbour Laplacian (border pixels 0). */
export const laplacian = (g: Gray): Uint16Array => {
  const { data, width: w, height: h } = g;
  const out = new Uint16Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const v = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      out[i] = v < 0 ? -v : v;
    }
  }
  return out;
};

/** Sharpness: variance and 99.5th percentile of |Laplacian|. */
export const sharpness = (g: Gray, lap = laplacian(g)) => {
  const hist = new Uint32Array(1021);
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < g.height - 1; y++) {
    for (let x = 1; x < g.width - 1; x++) {
      const v = lap[y * g.width + x];
      hist[v]++;
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  if (!n) return { variance: 0, p995: 0 };
  const mean = sum / n;
  const target = n * 0.995;
  let acc = 0;
  let p995 = 0;
  for (let v = 0; v < hist.length; v++) {
    acc += hist[v];
    if (acc >= target) {
      p995 = v;
      break;
    }
  }
  return { variance: sum2 / n - mean * mean, p995 };
};

/** Luminance statistics. */
export const exposure = (g: Gray) => {
  const hist = new Uint32Array(256);
  for (const v of g.data) hist[v]++;
  const n = g.data.length || 1;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  const mean = sum / n;
  let varSum = 0;
  for (let v = 0; v < 256; v++) varSum += hist[v] * (v - mean) * (v - mean);
  let acc = 0;
  let median = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n / 2) {
      median = v;
      break;
    }
  }
  let dark = 0;
  for (let v = 0; v < 25; v++) dark += hist[v];
  let bright = 0;
  for (let v = 250; v < 256; v++) bright += hist[v];
  return { mean, std: Math.sqrt(varSum / n), median, darkShare: dark / n, brightShare: bright / n };
};

/**
 * Share of the image covered by the largest flash reflection: a compact patch of saturated, texture-free
 * cells (≥ 70 % of the pixels ≥ 253) that does not touch the image border and covers at most 40 % of it.
 * A white scanned page (everything saturated, touching the border) or the ring of blank page margins around
 * the text (not compact) are not glare.
 */
export const glarePatch = (g: Gray) => {
  const cell = Math.max(4, Math.round(Math.min(g.width, g.height) / 48));
  const cw = Math.ceil(g.width / cell);
  const ch = Math.ceil(g.height / cell);
  const clipped = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      let hit = 0;
      let total = 0;
      for (let y = cy * cell; y < Math.min(g.height, (cy + 1) * cell); y++) {
        for (let x = cx * cell; x < Math.min(g.width, (cx + 1) * cell); x++) {
          total++;
          if (g.data[y * g.width + x] >= 253) hit++;
        }
      }
      clipped[cy * cw + cx] = total && hit / total >= 0.7 ? 1 : 0;
    }
  }
  const seen = new Uint8Array(cw * ch);
  let best = 0;
  const stack: number[] = [];
  for (let i = 0; i < clipped.length; i++) {
    if (!clipped[i] || seen[i]) continue;
    let size = 0;
    let border = false;
    let x0 = cw;
    let x1 = 0;
    let y0 = ch;
    let y1 = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const x = k % cw;
      const y = (k - x) / cw;
      if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) border = true;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      const next = [x > 0 ? k - 1 : -1, x < cw - 1 ? k + 1 : -1, y > 0 ? k - cw : -1, y < ch - 1 ? k + cw : -1];
      for (const m of next) {
        if (m >= 0 && clipped[m] && !seen[m]) {
          seen[m] = 1;
          stack.push(m);
        }
      }
    }
    const compact = size / ((x1 - x0 + 1) * (y1 - y0 + 1)) >= 0.5;
    const share = size / (cw * ch || 1);
    if (!border && compact && share <= 0.4 && share > best) best = share;
  }
  return best;
};

/**
 * Which sides of the image have content running into the border: in the outer band of that side the strong
 * edges are about as dense as in the middle of the image, and the band is about as bright as the middle
 * (paper with text, not a desk or a background around the document).
 */
export const borderContact = (g: Gray, lap = laplacian(g)) => {
  const { width: w, height: h } = g;
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.025));
  const EDGE = 40;
  const region = (x0: number, y0: number, x1: number, y1: number) => {
    let edges = 0;
    let lum = 0;
    let n = 0;
    for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y++) {
      for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) {
        const i = y * w + x;
        if (lap[i] > EDGE) edges++;
        lum += g.data[i];
        n++;
      }
    }
    return { density: n ? edges / n : 0, mean: n ? lum / n : 0 };
  };
  const inner = region(Math.round(w * 0.15), Math.round(h * 0.15), Math.round(w * 0.85), Math.round(h * 0.85));
  const sides = {
    top: region(0, 0, w, band + 1),
    bottom: region(0, h - band - 1, w, h),
    left: region(0, 0, band + 1, h),
    right: region(w - band - 1, 0, w, h),
  };
  const touching: string[] = [];
  if (inner.density >= 0.01) {
    for (const [name, s] of Object.entries(sides)) {
      if (s.density >= inner.density * THRESHOLDS.cutRatio && Math.abs(s.mean - inner.mean) <= THRESHOLDS.cutBrightness) touching.push(name);
    }
  }
  return { touching, innerDensity: inner.density };
};

const levelOf = (reasons: QualityReason[]): QualityLevel => (reasons.some((r) => r.level === 'BAD') ? 'BAD' : reasons.length ? 'WARN' : 'OK');
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** All pixel metrics of an analysis copy → reasons (no resolution / file size checks here). */
export const pixelReasons = (g: Gray) => {
  const reasons: QualityReason[] = [];
  const lap = laplacian(g);
  const ex = exposure(g);
  const sh = sharpness(g, lap);
  const metrics: QualityReport['metrics'] = { mean: round(ex.mean), std: round(ex.std), p995: sh.p995, lapVar: round(sh.variance) };
  if (ex.std < THRESHOLDS.blankStd) {
    reasons.push({ code: 'NO_CONTENT', level: 'BAD' });
    return { reasons, metrics };
  }
  if (ex.mean < THRESHOLDS.darkBad) reasons.push({ code: 'TOO_DARK', level: 'BAD' });
  else if (ex.mean < THRESHOLDS.darkWarn && ex.darkShare > 0.4) reasons.push({ code: 'TOO_DARK', level: 'WARN' });
  if (ex.brightShare > 0.92 && ex.std < 18) reasons.push({ code: 'OVEREXPOSED', level: 'WARN' });
  if (sh.p995 < THRESHOLDS.blurBad) reasons.push({ code: 'BLURRY', level: 'BAD', params: { score: sh.p995 } });
  else if (sh.p995 < THRESHOLDS.blurWarn) reasons.push({ code: 'BLURRY', level: 'WARN', params: { score: sh.p995 } });
  const glare = glarePatch(g);
  metrics.glare = round(glare, 3);
  if (glare > THRESHOLDS.glareBad) reasons.push({ code: 'GLARE', level: 'BAD' });
  else if (glare > THRESHOLDS.glareWarn) reasons.push({ code: 'GLARE', level: 'WARN' });
  const cut = borderContact(g, lap);
  metrics.cutSides = cut.touching.join(',') || null;
  if (cut.touching.length >= 3) reasons.push({ code: 'CUT_OFF', level: 'BAD', params: { sides: cut.touching.join(',') } });
  else if (cut.touching.length) reasons.push({ code: 'CUT_OFF', level: 'WARN', params: { sides: cut.touching.join(',') } });
  return { reasons, metrics };
};

/** Resolution of the original against the thresholds of the kind of upload. */
export const resolutionReason = (width: number, height: number, target: 'document' | 'photo'): QualityReason | null => {
  const t = THRESHOLDS[target];
  const short = Math.min(width, height);
  if (short < t.minShortBad) return { code: 'LOW_RESOLUTION', level: 'BAD', params: { width, height } };
  if (short < t.minShortWarn) return { code: 'LOW_RESOLUTION', level: 'WARN', params: { width, height } };
  return null;
};

// ─── Decoding (isolated child process, see decoder.ts) ─────────────────

/** Replaceable for tests (decoder failure / "no image library" paths). */
export const qualityDeps = { decode: decodeInChild };

/** Decodes an image and returns its size and a grayscale copy with the long side ≤ `edge`. Null when it cannot. */
export const decodeGray = async (buf: Buffer, edge = ANALYSIS_EDGE): Promise<{ width: number; height: number; gray: Gray } | null> => {
  try {
    const r = await qualityDeps.decode(buf, 'gray', { edge });
    return r?.ok && r.gray ? { width: r.width, height: r.height, gray: r.gray } : null;
  } catch {
    return null;
  }
};

/** A JPEG copy with the long side ≤ `edge` (for the AI: fewer tokens, smaller request). Null when it cannot. */
export const downscaleJpeg = async (buf: Buffer, edge = 1568, quality = 80): Promise<Buffer | null> => {
  try {
    const r = await qualityDeps.decode(buf, 'jpeg', { edge, quality });
    return r?.ok && r.jpeg ? r.jpeg : null;
  } catch {
    return null;
  }
};

// ─── Reports ────────────────────────────────────────────────────────────

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const imageQuality = async (buf: Buffer, mime: string, target: 'document' | 'photo' = 'document'): Promise<Omit<QualityReport, 'ms'>> => {
  const reasons: QualityReason[] = [];
  const metrics: QualityReport['metrics'] = {};
  const header = imageSize(buf);
  if (header) {
    metrics.width = header.width;
    metrics.height = header.height;
  }
  const big = header ? header.width * header.height > MAX_DECODE_PIXELS : false;
  const raw = big ? null : await qualityDeps.decode(buf, 'gray', { edge: ANALYSIS_EDGE }).catch(() => null);
  const decoded = raw?.ok && raw.gray ? { width: raw.width, height: raw.height, gray: raw.gray } : null;
  // The decoder could run but not read the file (or crashed on it): the image itself is broken.
  if (raw && !raw.ok && raw.error !== 'DECODER_UNAVAILABLE' && raw.error !== 'DECODE_TIMEOUT') {
    return { level: 'BAD', reasons: [{ code: 'UNREADABLE', level: 'BAD' }], kind: 'image', metrics: { ...metrics, decodeError: raw.error } };
  }
  const width = decoded?.width ?? header?.width;
  const height = decoded?.height ?? header?.height;
  if (width && height) {
    metrics.width = width;
    metrics.height = height;
    const res = resolutionReason(width, height, target);
    if (res) reasons.push(res);
    if (mime === 'image/jpeg' && width * height > 1_000_000) metrics.bytesPerPixel = round(buf.length / (width * height), 3);
  }
  if (!decoded) return { level: levelOf(reasons), reasons, kind: 'image', metrics, partial: true };
  // Over-compression only tells on a photo with real content: a mostly white page compresses to little legitimately.
  const bpp = typeof metrics.bytesPerPixel === 'number' ? metrics.bytesPerPixel : null;
  if (bpp !== null && bpp < THRESHOLDS.minBytesPerPixel && exposure(decoded.gray).mean < 225) reasons.push({ code: 'TOO_COMPRESSED', level: 'WARN' });
  // A tiny image says nothing reliable about blur / edges.
  if (Math.min(decoded.gray.width, decoded.gray.height) >= 64) {
    const px = pixelReasons(decoded.gray);
    reasons.push(...px.reasons);
    Object.assign(metrics, px.metrics);
  }
  return { level: levelOf(reasons), reasons, kind: 'image', metrics };
};

/** The largest image of the first scanned page (bytes tesseract / canvas can read), lazily from driveIntel. */
const firstPageImage = async (buf: Buffer): Promise<Buffer | null> => {
  try {
    const { pdfPageImages } = await import('../driveIntel/extract.js');
    const imgs = (await pdfPageImages(buf, [0])).get(0) ?? [];
    return imgs.sort((a, b) => b.length - a.length)[0] ?? null;
  } catch {
    return null;
  }
};

export const pdfQuality = async (buf: Buffer): Promise<Omit<QualityReport, 'ms'>> => {
  const reasons: QualityReason[] = [];
  const metrics: QualityReport['metrics'] = {};
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(buf, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    return { level: 'BAD', reasons: [{ code: 'PDF_UNREADABLE', level: 'BAD' }], kind: 'pdf', metrics };
  }
  const pages = pdf.getPageCount();
  metrics.pages = pages;
  if (!pages) return { level: 'BAD', reasons: [{ code: 'PDF_NO_PAGES', level: 'BAD' }], kind: 'pdf', metrics };
  const { width: wPt, height: hPt } = pdf.getPage(0).getSize();
  const mm = (pt: number) => Math.round((pt / 72) * 25.4);
  metrics.pageMm = `${mm(wPt)}x${mm(hPt)}`;
  if (Math.max(mm(wPt), mm(hPt)) < 100) reasons.push({ code: 'PDF_SMALL_PAGE', level: 'WARN', params: { size: String(metrics.pageMm) } });

  let text = 0;
  try {
    const { pdfPageTexts } = await import('../driveIntel/extract.js');
    text = (await pdfPageTexts(buf, 2)).join('').replace(/\s/g, '').length;
  } catch {
    text = 0;
  }
  metrics.textChars = text;
  const scanned = text < 16;
  metrics.scanned = scanned;
  if (scanned) {
    const img = await firstPageImage(buf);
    if (img) {
      const size = imageSize(img);
      const decoded = await decodeGray(img);
      const pxWidth = decoded?.width ?? size?.width;
      if (pxWidth) {
        const dpi = Math.round(pxWidth / (wPt / 72));
        metrics.dpi = dpi;
        if (dpi < THRESHOLDS.pdfDpiBad) reasons.push({ code: 'PDF_LOW_DPI', level: 'BAD', params: { dpi } });
        else if (dpi < THRESHOLDS.pdfDpiWarn) reasons.push({ code: 'PDF_LOW_DPI', level: 'WARN', params: { dpi } });
      }
      if (decoded && Math.min(decoded.gray.width, decoded.gray.height) >= 64) {
        const px = pixelReasons(decoded.gray);
        // A scanner's page image legitimately fills the page edge to edge: no cut-off verdict from it.
        reasons.push(...px.reasons.filter((r) => r.code !== 'CUT_OFF'));
        Object.assign(metrics, px.metrics);
      }
    }
  }
  return { level: levelOf(reasons), reasons, kind: 'pdf', metrics };
};

/**
 * Quality report of an uploaded file; never throws. `budgetMs` caps the time spent (a slow decode returns a
 * partial report instead of delaying the upload response).
 */
export const analyzeQuality = async (buf: Buffer, mime: string, opts: { target?: 'document' | 'photo'; budgetMs?: number } = {}): Promise<QualityReport> => {
  const started = Date.now();
  const work = (async (): Promise<Omit<QualityReport, 'ms'>> => {
    if (IMAGE_MIME.has(mime)) return imageQuality(buf, mime, opts.target ?? 'document');
    if (mime === 'application/pdf') return pdfQuality(buf);
    return { level: 'OK', reasons: [], kind: 'other', metrics: {} };
  })().catch((err): Omit<QualityReport, 'ms'> => {
    console.error('[uploadAi] quality check failed', err);
    return { level: 'OK', reasons: [], kind: 'other', metrics: {}, partial: true };
  });
  const timeout = new Promise<Omit<QualityReport, 'ms'>>((resolve) =>
    setTimeout(() => resolve({ level: 'OK', reasons: [], kind: IMAGE_MIME.has(mime) ? 'image' : mime === 'application/pdf' ? 'pdf' : 'other', metrics: { timeout: true }, partial: true }), opts.budgetMs ?? 2500).unref?.(),
  );
  const r = await Promise.race([work, timeout]);
  return { ...r, ms: Date.now() - started };
};
