/**
 * Client-side document quality check, run in the browser before every upload (case requirements and
 * the document vault). The server has no image library, so blur / darkness / cut-off are measured here
 * on a downscaled greyscale canvas. Warnings never block an upload; errors (wrong type, too big, empty,
 * not a PDF) do.
 *
 * The analysis functions are pure (typed arrays in, numbers out) and unit-tested from the server test
 * suite (server/tests/unit/docCheckClient.test.ts); only `checkFile` touches the DOM.
 */

export type DocCheckLevel = 'ok' | 'warn' | 'error';

export type ClientCheckCode =
  | 'BAD_TYPE'
  | 'TOO_LARGE'
  | 'EMPTY'
  | 'PDF_INVALID'
  | 'PDF_ENCRYPTED'
  | 'PDF_NO_PAGES'
  | 'PDF_TINY'
  | 'LOW_RESOLUTION'
  | 'TOO_DARK'
  | 'TOO_BRIGHT'
  | 'BLURRY'
  | 'CUT_OFF'
  | 'UNREADABLE_IMAGE';

export interface DocCheckIssue {
  code: ClientCheckCode;
  level: 'warn' | 'error';
  /** i18n key of the friendly explanation (pagesVault). */
  key: string;
  params?: Record<string, string | number>;
}

export interface DocCheckResult {
  level: DocCheckLevel;
  issues: DocCheckIssue[];
}

// ─── Thresholds ───────────────────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'];
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Long edge (px) below which an image is reported as low resolution. */
export const MIN_LONG_EDGE = 1000;
/** Analysis canvas size (long edge, px). */
export const ANALYSIS_EDGE = 512;
/** Mean luminance (0–255) below which a photo is too dark. */
export const DARK_MEAN = 55;
/** Mean luminance above which, with little contrast, a photo is washed out. */
export const BRIGHT_MEAN = 235;
export const BRIGHT_MAX_STD = 30;
/**
 * Variance of the Laplacian on the 512 px greyscale canvas below which a photo is blurry. Sharp phone
 * photos of documents land well above 100 at this size (text edges are strong); out-of-focus or shaken
 * shots fall under ~20–30, so 30 keeps false alarms rare.
 */
export const BLUR_MIN_VARIANCE = 30;
/** Gradient magnitude counting as an "edge" pixel. */
export const EDGE_GRADIENT = 40;
/** Border band width as a share of the edge length. */
export const BAND_SHARE = 0.03;
/** Edge density in a border band that counts as content touching that border. */
export const BAND_MIN_DENSITY = 0.1;
/** Small PDFs (bytes): a real scan is rarely below this, a text-only export can be. */
export const PDF_TINY_BYTES = 5 * 1024;

const keyOf = (code: ClientCheckCode) => `vault.check.client.${code}`;
const issue = (code: ClientCheckCode, level: 'warn' | 'error', params?: Record<string, string | number>): DocCheckIssue => ({
  code,
  level,
  key: keyOf(code),
  ...(params ? { params } : {}),
});

export const levelOf = (issues: { level: 'warn' | 'error' }[]): DocCheckLevel =>
  issues.some((i) => i.level === 'error') ? 'error' : issues.length ? 'warn' : 'ok';

// ─── Pure analysis ────────────────────────────────────────────────────

/** RGBA pixels → luminance (Rec. 601), one byte per pixel. */
export const toGray = (rgba: ArrayLike<number>, width: number, height: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) out[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return out;
};

/** Mean and standard deviation of a greyscale buffer. */
export const luminanceStats = (gray: ArrayLike<number>) => {
  let sum = 0;
  let sq = 0;
  const n = gray.length || 1;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
    sq += gray[i] * gray[i];
  }
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
};

/** Variance of the 4-neighbour Laplacian — the classic focus measure (low = blurry). */
export const laplacianVariance = (gray: ArrayLike<number>, width: number, height: number) => {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      sum += v;
      sq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sq / n - mean * mean;
};

/**
 * How many image borders strong content touches: the share of edge pixels (gradient above
 * EDGE_GRADIENT) in a thin band along each border. A document photographed with margins has quiet
 * borders; a cut-off one has text / edges running into the frame.
 */
export const touchedBorders = (gray: ArrayLike<number>, width: number, height: number) => {
  if (width < 8 || height < 8) return { count: 0, density: { top: 0, bottom: 0, left: 0, right: 0 } };
  const bandY = Math.max(2, Math.round(height * BAND_SHARE));
  const bandX = Math.max(2, Math.round(width * BAND_SHARE));
  const edge = (x: number, y: number) => {
    const i = y * width + x;
    const gx = gray[i + 1] - gray[i - 1];
    const gy = gray[i + width] - gray[i - width];
    return Math.abs(gx) + Math.abs(gy) > EDGE_GRADIENT;
  };
  const density = (x0: number, x1: number, y0: number, y1: number) => {
    let hits = 0;
    let total = 0;
    for (let y = Math.max(1, y0); y < Math.min(height - 1, y1); y++) {
      for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x++) {
        total++;
        if (edge(x, y)) hits++;
      }
    }
    return total ? hits / total : 0;
  };
  const d = {
    top: density(0, width, 0, bandY + 1),
    bottom: density(0, width, height - bandY - 1, height),
    left: density(0, bandX + 1, 0, height),
    right: density(width - bandX - 1, width, 0, height),
  };
  return { count: Object.values(d).filter((v) => v >= BAND_MIN_DENSITY).length, density: d };
};

export interface ImageMetrics {
  width: number;
  height: number;
  mean: number;
  std: number;
  blurVariance: number;
  touched: number;
}

/** Image metrics → issues (all warnings: the client may still upload). */
export const evaluateImage = (m: ImageMetrics): DocCheckIssue[] => {
  const out: DocCheckIssue[] = [];
  const longEdge = Math.max(m.width, m.height);
  if (longEdge < MIN_LONG_EDGE) out.push(issue('LOW_RESOLUTION', 'warn', { width: m.width, height: m.height, min: MIN_LONG_EDGE }));
  if (m.mean < DARK_MEAN) out.push(issue('TOO_DARK', 'warn'));
  else if (m.mean > BRIGHT_MEAN && m.std < BRIGHT_MAX_STD) out.push(issue('TOO_BRIGHT', 'warn'));
  if (m.blurVariance < BLUR_MIN_VARIANCE) out.push(issue('BLURRY', 'warn'));
  if (m.touched >= 2) out.push(issue('CUT_OFF', 'warn'));
  return out;
};

/** Greyscale analysis canvas → metrics (width/height are the ORIGINAL image size). */
export const analyseGray = (gray: ArrayLike<number>, w: number, h: number, original: { width: number; height: number }): ImageMetrics => {
  const { mean, std } = luminanceStats(gray);
  return { width: original.width, height: original.height, mean, std, blurVariance: laplacianVariance(gray, w, h), touched: touchedBorders(gray, w, h).count };
};

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** Type / size checks that need no file content. */
export const evaluateBasics = (f: { name: string; type: string; size: number }): DocCheckIssue[] => {
  const ext = extOf(f.name);
  if (!ALLOWED_EXT.includes(ext)) return [issue('BAD_TYPE', 'error')];
  if (f.size === 0) return [issue('EMPTY', 'error')];
  if (f.size > MAX_UPLOAD_BYTES) return [issue('TOO_LARGE', 'error', { max: 5 })];
  return [];
};

/** PDF checks on the raw bytes (latin1 text of the file): header, encryption, page objects. */
export const evaluatePdf = (text: string, size: number, complete = true): DocCheckIssue[] => {
  if (!text.startsWith('%PDF')) return [issue('PDF_INVALID', 'error')];
  const out: DocCheckIssue[] = [];
  if (/\/Encrypt\b/.test(text)) out.push(issue('PDF_ENCRYPTED', 'warn'));
  // Page objects are only countable when the whole file was read and they are not packed into
  // compressed object streams.
  if (complete && !/\/ObjStm\b/.test(text) && !/\/Type\s*\/Page(?!s)/.test(text)) out.push(issue('PDF_NO_PAGES', 'warn'));
  if (size < PDF_TINY_BYTES) out.push(issue('PDF_TINY', 'warn'));
  return out;
};

export const isImageFile = (f: { name: string; type: string }) =>
  IMAGE_TYPES.includes(f.type) || ['jpg', 'jpeg', 'png', 'webp'].includes(extOf(f.name));
export const isPdfFile = (f: { name: string; type: string }) => f.type === 'application/pdf' || extOf(f.name) === 'pdf';

export const result = (issues: DocCheckIssue[]): DocCheckResult => ({ level: levelOf(issues), issues });

// ─── Browser glue ─────────────────────────────────────────────────────

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });

/** Draws the image to a small canvas and measures it. */
const measureImage = async (file: File): Promise<ImageMetrics> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const scale = Math.min(1, ANALYSIS_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, w, h);
    const gray = toGray(ctx.getImageData(0, 0, w, h).data, w, h);
    return analyseGray(gray, w, h, { width, height });
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Full check of a chosen file. Never throws. */
export const checkFile = async (file: File): Promise<DocCheckResult> => {
  const basics = evaluateBasics(file);
  if (basics.length) return result(basics);
  try {
    if (isPdfFile(file)) {
      // Header + trailer are enough for the structural hints; never read more than 1 MB.
      const head = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
      let text = '';
      for (let i = 0; i < head.length; i++) text += String.fromCharCode(head[i]);
      return result(evaluatePdf(text, file.size, head.length >= file.size));
    }
    if (isImageFile(file)) return result(evaluateImage(await measureImage(file)));
  } catch {
    return result([issue('UNREADABLE_IMAGE', 'warn')]);
  }
  return result([]);
};
