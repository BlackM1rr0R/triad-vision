// Pure image + geometry functions of the in-browser document scanner (components/scanner). No imports and no
// DOM: they run in the scanner Web Worker (lib/scanner/scanner.worker.ts), on the main thread as a fallback,
// and in the server test suite (server/tests/unit/scannerGeometry.test.ts loads this file by URL).
//
// Pipeline: downscale → grayscale → blur → Sobel edges (Otsu threshold) and a bright-region mask →
// connected components → convex hull → largest inscribed quadrilateral (corner refinement) → validation;
// then perspective warp (homography, bilinear) to ~A4 and an enhancement mode.

export type Pt = { x: number; y: number };
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];
export type EnhanceMode = 'auto' | 'gray' | 'bw' | 'original';

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Luminance (Rec. 601) of an RGBA buffer. */
export const toGray = (rgba: ArrayLike<number>, w: number, h: number): Float32Array => {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return out;
};

/** Area-average resize of a gray image (downscaling); bilinear when enlarging. */
export const resizeGray = (src: ArrayLike<number>, w: number, h: number, nw: number, nh: number): Float32Array => {
  const out = new Float32Array(nw * nh);
  const sx = w / nw;
  const sy = h / nh;
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * sy)));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.min(w, Math.floor((x + 1) * sx)));
        let sum = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += src[yy * w + xx];
        out[y * nw + x] = sum / ((y1 - y0) * (x1 - x0));
      }
    }
    return out;
  }
  for (let y = 0; y < nh; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const a = src[y0 * w + x0] * (1 - tx) + src[y0 * w + x1] * tx;
      const b = src[y1 * w + x0] * (1 - tx) + src[y1 * w + x1] * tx;
      out[y * nw + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
};

/** 5-tap binomial (≈ Gaussian σ 1) blur, separable, edges clamped. */
export const blur = (src: ArrayLike<number>, w: number, h: number): Float32Array => {
  const k = [1, 4, 6, 4, 1];
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) s += k[i + 2] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = s / 16;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) s += k[i + 2] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = s / 16;
    }
  }
  return out;
};

/** Box blur with radius r (summed-area table), edges clamped. */
export const boxBlur = (src: ArrayLike<number>, w: number, h: number, r: number): Float32Array => {
  const ii = integral(src, w, h);
  const out = new Float32Array(w * h);
  const W = w + 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0]) / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
};

/** Summed-area table, (w+1)×(h+1), Float64 so large images do not lose precision. */
export const integral = (src: ArrayLike<number>, w: number, h: number): Float64Array => {
  const W = w + 1;
  const ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row;
    }
  }
  return ii;
};

/** Sobel gradient magnitude. */
export const sobel = (src: ArrayLike<number>, w: number, h: number): Float32Array => {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = src[i - w - 1];
      const t = src[i - w];
      const tr = src[i - w + 1];
      const l = src[i - 1];
      const r = src[i + 1];
      const bl = src[i + w - 1];
      const b = src[i + w];
      const br = src[i + w + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
};

/** Otsu threshold of values in [0, max] (256 bins). */
export const otsu = (values: ArrayLike<number>, max = 255): number => {
  const hist = new Float64Array(256);
  const scale = 255 / (max || 1);
  for (let i = 0; i < values.length; i++) hist[Math.min(255, Math.max(0, Math.round(values[i] * scale)))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT / scale;
};

/** 3×3 binary dilation. */
export const dilate = (bin: Uint8Array, w: number, h: number): Uint8Array => {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!bin[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
};

export interface Component {
  size: number;
  /** Leftmost and rightmost pixel of each row the component touches (enough for its convex hull). */
  extremes: Pt[];
  bboxArea: number;
}

/** 8-connected components of a binary image (iterative flood fill), largest bounding box first. */
export const components = (bin: Uint8Array, w: number, h: number, minSize = 20): Component[] => {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Component[] = [];
  let next = 0;
  for (let start = 0; start < bin.length; start++) {
    if (!bin[start] || label[start]) continue;
    next++;
    let sp = 0;
    stack[sp++] = start;
    label[start] = next;
    const rowMin = new Map<number, number>();
    const rowMax = new Map<number, number>();
    let size = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i - x) / w;
      size++;
      if (x < (rowMin.get(y) ?? Infinity)) rowMin.set(y, x);
      if (x > (rowMax.get(y) ?? -Infinity)) rowMax.set(y, x);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (bin[j] && !label[j]) {
            label[j] = next;
            stack[sp++] = j;
          }
        }
      }
    }
    if (size < minSize) continue;
    const extremes: Pt[] = [];
    for (const [y, x] of rowMin) extremes.push({ x, y }, { x: rowMax.get(y)!, y });
    out.push({ size, extremes, bboxArea: (maxX - minX + 1) * (maxY - minY + 1) });
  }
  return out.sort((a, b) => b.bboxArea - a.bboxArea);
};

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull (Andrew's monotone chain), counter-clockwise in image coordinates' math sense. */
export const convexHull = (points: Pt[]): Pt[] => {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
};

/** Polygon area (shoelace, absolute). */
export const polygonArea = (p: Pt[]): number => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

/** Signed area of a quad in TL, TR, BR, BL order (positive = that order is clockwise on screen). */
const signedQuadArea = (q: Pt[]) => {
  let s = 0;
  for (let i = 0; i < 4; i++) s += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  return s / 2;
};

/** Sorts 4 points into TL, TR, BR, BL (by x+y and y−x). */
export const orderQuad = (pts: Pt[]): Quad => {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[3];
  const rest = pts.filter((p) => p !== tl && p !== br);
  const [tr, bl] = rest.length === 2 ? (rest[0].x - rest[0].y > rest[1].x - rest[1].y ? [rest[0], rest[1]] : [rest[1], rest[0]]) : [bySum[1], bySum[2]];
  return [tl, tr, br, bl];
};

/** True when the quad (TL, TR, BR, BL) is convex and turns the same way at every corner. */
export const isConvexQuad = (q: Quad): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (c === 0) return false;
    const s = Math.sign(c);
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
};

/** Interior angle at each corner, in degrees. */
export const quadAngles = (q: Quad): number[] =>
  q.map((p, i) => {
    const a = q[(i + 3) % 4];
    const b = q[(i + 1) % 4];
    const v1 = { x: a.x - p.x, y: a.y - p.y };
    const v2 = { x: b.x - p.x, y: b.y - p.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });

/**
 * Largest quadrilateral with corners on the hull: start from the extreme points (min/max of x+y and x−y),
 * then move one corner at a time to the hull point that maximises the area, until nothing improves.
 */
export const quadFromHull = (hull: Pt[]): Quad | null => {
  if (hull.length < 4) return null;
  const idx = [0, 0, 0, 0];
  hull.forEach((p, i) => {
    if (p.x + p.y < hull[idx[0]].x + hull[idx[0]].y) idx[0] = i;
    if (p.x - p.y > hull[idx[1]].x - hull[idx[1]].y) idx[1] = i;
    if (p.x + p.y > hull[idx[2]].x + hull[idx[2]].y) idx[2] = i;
    if (p.x - p.y < hull[idx[3]].x - hull[idx[3]].y) idx[3] = i;
  });
  const areaOf = (ix: number[]) => signedQuadArea(ix.map((i) => hull[i]));
  let best = areaOf(idx);
  for (let round = 0; round < 6; round++) {
    let improved = false;
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < hull.length; i++) {
        if (idx.includes(i)) continue;
        const trial = [...idx];
        trial[k] = i;
        const a = areaOf(trial);
        if (a > best + 1e-6) {
          best = a;
          idx[k] = i;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  const q = orderQuad(idx.map((i) => hull[i]));
  return isConvexQuad(q) ? q : null;
};

export const fullFrame = (w: number, h: number): Quad => [
  { x: 0, y: 0 },
  { x: w - 1, y: 0 },
  { x: w - 1, y: h - 1 },
  { x: 0, y: h - 1 },
];

export interface Detection {
  quad: Quad;
  /** false = no document outline found: the whole frame is returned. */
  found: boolean;
  /** Share of the image covered by the quad (0–1). */
  coverage: number;
}

/**
 * Finds the document outline in a (small, ~400 px) gray image. Candidates come from the edge map
 * (Sobel + Otsu, dilated) and from the bright-region mask (paper is usually lighter than the table);
 * a candidate is kept when its quad covers 12–97 % of the frame, fills most of its hull (really
 * four-sided) and has no extreme angles. The largest valid quad wins; otherwise the full frame.
 */
export const detectQuad = (gray: ArrayLike<number>, w: number, h: number): Detection => {
  const g = blur(gray, w, h);
  const mag = sobel(g, w, h);
  let maxMag = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > maxMag) maxMag = mag[i];
  const candidates: Pt[][] = [];
  if (maxMag > 0) {
    const t = Math.max(otsu(mag, maxMag), maxMag * 0.12);
    const edges = new Uint8Array(w * h);
    for (let i = 0; i < mag.length; i++) edges[i] = mag[i] > t ? 1 : 0;
    for (const c of components(dilate(edges, w, h), w, h, Math.round((w + h) / 4)).slice(0, 6)) candidates.push(c.extremes);
  }
  const bt = otsu(g, 255);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) bright[i] = g[i] > bt ? 1 : 0;
  for (const c of components(bright, w, h, Math.round((w * h) / 50)).slice(0, 3)) candidates.push(c.extremes);

  const frame = w * h;
  let best: Quad | null = null;
  let bestArea = 0;
  for (const pts of candidates) {
    const hull = convexHull(pts);
    if (hull.length < 4) continue;
    const q = quadFromHull(hull);
    if (!q) continue;
    const area = polygonArea(q);
    const cover = area / frame;
    if (cover < 0.12 || cover > 0.97) continue;
    if (area / (polygonArea(hull) || 1) < 0.85) continue;
    const angles = quadAngles(q);
    if (angles.some((a) => a < 40 || a > 140)) continue;
    if (area > bestArea) {
      best = q;
      bestArea = area;
    }
  }
  return best ? { quad: best, found: true, coverage: bestArea / frame } : { quad: fullFrame(w, h), found: false, coverage: 1 };
};

/** Detection on a full RGBA image: works on a copy scaled to `maxSide` and maps the corners back. */
export const detectDocument = (rgba: ArrayLike<number>, w: number, h: number, maxSide = 400): Detection => {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const sw = Math.max(8, Math.round(w * scale));
  const sh = Math.max(8, Math.round(h * scale));
  const gray = toGray(rgba, w, h);
  const small = scale < 1 ? resizeGray(gray, w, h, sw, sh) : gray;
  const d = detectQuad(small, sw, sh);
  const fx = w / sw;
  const fy = h / sh;
  return {
    ...d,
    quad: d.quad.map((p) => ({ x: Math.min(w - 1, Math.max(0, p.x * fx)), y: Math.min(h - 1, Math.max(0, p.y * fy)) })) as Quad,
  };
};

// ─── Homography ────────────────────────────────────────────────────────

/** Solves A·x = b (n×n, partial pivoting). Returns null for a singular system. */
const solve = (A: number[][], b: number[]): number[] | null => {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
};

/** 3×3 homography (row-major, h33 = 1) mapping each src corner to the matching dst corner. */
export const homography = (src: Quad, dst: Quad): number[] | null => {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
};

export const applyHomography = (H: number[], x: number, y: number): Pt => {
  const d = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d };
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Output size for a quad: aspect from the measured sides, snapped to A4 (√2) when within 15 %; the long
 * side is always `maxLong` (default 2000 px), so an A4 page has a 1414 px short side and passes the server
 * scan-quality check (short side ≥ 1000 px) even when the sheet filled only part of the photo.
 */
export const outputSize = (q: Quad, maxLong = 2000): { width: number; height: number } => {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]), 1);
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]), 1);
  let ratio = h / w;
  if (Math.abs(ratio / Math.SQRT2 - 1) < 0.15) ratio = Math.SQRT2;
  else if (Math.abs(ratio * Math.SQRT2 - 1) < 0.15) ratio = 1 / Math.SQRT2;
  const long = Math.round(maxLong);
  return ratio >= 1 ? { width: Math.round(long / ratio), height: long } : { width: long, height: Math.round(long * ratio) };
};

/** Perspective-corrects the quad of an RGBA image into an outW×outH rectangle (bilinear sampling). */
export const warpPerspective = (rgba: ArrayLike<number>, w: number, h: number, q: Quad, outW: number, outH: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const H = homography(
    [
      { x: 0, y: 0 },
      { x: outW - 1, y: 0 },
      { x: outW - 1, y: outH - 1 },
      { x: 0, y: outH - 1 },
    ],
    q,
  );
  if (!H) return out.fill(255);
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const d = H[6] * u + H[7] * v + H[8];
      let x = (H[0] * u + H[1] * v + H[2]) / d;
      let y = (H[3] * u + H[4] * v + H[5]) / d;
      x = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
      y = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
      const x0 = x | 0;
      const y0 = y | 0;
      const x1 = x0 + 1 < w ? x0 + 1 : x0;
      const y1 = y0 + 1 < h ? y0 + 1 : y0;
      const tx = x - x0;
      const ty = y - y0;
      const p00 = (y0 * w + x0) * 4;
      const p10 = (y0 * w + x1) * 4;
      const p01 = (y1 * w + x0) * 4;
      const p11 = (y1 * w + x1) * 4;
      const o = (v * outW + u) * 4;
      for (let c = 0; c < 3; c++) {
        const a = rgba[p00 + c] + (rgba[p10 + c] - rgba[p00 + c]) * tx;
        const b = rgba[p01 + c] + (rgba[p11 + c] - rgba[p01 + c]) * tx;
        out[o + c] = a + (b - a) * ty;
      }
      out[o + 3] = 255;
    }
  }
  return out;
};

/** Rotates an RGBA image by quarter turns clockwise (0–3). */
export const rotateRgba = (rgba: Uint8ClampedArray, w: number, h: number, turns: number): { data: Uint8ClampedArray; width: number; height: number } => {
  const t = ((turns % 4) + 4) % 4;
  if (!t) return { data: rgba, width: w, height: h };
  const nw = t % 2 ? h : w;
  const nh = t % 2 ? w : h;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = t === 1 ? h - 1 - y : t === 2 ? w - 1 - x : y;
      const ny = t === 1 ? x : t === 2 ? h - 1 - y : w - 1 - x;
      const s = (y * w + x) * 4;
      const d = (ny * nw + nx) * 4;
      out[d] = rgba[s];
      out[d + 1] = rgba[s + 1];
      out[d + 2] = rgba[s + 2];
      out[d + 3] = 255;
    }
  }
  return { data: out, width: nw, height: nh };
};

// ─── Enhancement ───────────────────────────────────────────────────────

/** Paper brightness per pixel: luminance heavily blurred at low resolution (shadows, uneven light). */
const background = (lum: Float32Array, w: number, h: number): ((x: number, y: number) => number) => {
  const scale = Math.min(1, 160 / Math.max(w, h));
  const sw = Math.max(4, Math.round(w * scale));
  const sh = Math.max(4, Math.round(h * scale));
  let small = resizeGray(lum, w, h, sw, sh);
  // A grey-scale closing (max then box blur) ignores the dark text strokes so the estimate follows the paper.
  const r = Math.max(2, Math.round(Math.max(sw, sh) / 30));
  const maxed = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let m = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(sh - 1, Math.max(0, y + dy));
        for (let dx = -r; dx <= r; dx++) {
          const v = small[yy * sw + Math.min(sw - 1, Math.max(0, x + dx))];
          if (v > m) m = v;
        }
      }
      maxed[y * sw + x] = m;
    }
  }
  small = boxBlur(maxed, sw, sh, r * 2);
  return (x, y) => {
    const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * (sw / w) - 0.5));
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * (sh / h) - 0.5));
    const x0 = fx | 0;
    const y0 = fy | 0;
    const x1 = Math.min(sw - 1, x0 + 1);
    const y1 = Math.min(sh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = small[y0 * sw + x0] * (1 - tx) + small[y0 * sw + x1] * tx;
    const b = small[y1 * sw + x0] * (1 - tx) + small[y1 * sw + x1] * tx;
    return a * (1 - ty) + b * ty;
  };
};

/** Low / high percentile of a channel (histogram), for contrast stretching. */
const percentiles = (data: Uint8ClampedArray, channel: number, lo: number, hi: number, step = 4): [number, number] => {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = channel; i < data.length; i += 4 * step) {
    hist[data[i]]++;
    n++;
  }
  let acc = 0;
  let a = 0;
  let b = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * lo) {
      a = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= n * (1 - hi)) {
      b = v;
      break;
    }
  }
  return b - a < 32 ? [0, 255] : [a, b];
};

/**
 * Enhancement modes (in place, returns the same buffer):
 *  - auto: shadow / uneven-light removal (divide by the paper brightness), then per-channel contrast
 *    stretch (doubles as white balance: the paper becomes neutral white);
 *  - gray: the same on the luminance;
 *  - bw: adaptive threshold (Bradley–Roth, local mean over ~1/16 of the page) on the flattened luminance;
 *  - original: untouched.
 */
export const enhance = (rgba: Uint8ClampedArray, w: number, h: number, mode: EnhanceMode): Uint8ClampedArray => {
  if (mode === 'original') return rgba;
  const lum = toGray(rgba, w, h);
  const bg = background(lum, w, h);
  const flat = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const f = 245 / Math.max(bg(x, y), 40);
      if (mode === 'auto') {
        const p = i * 4;
        rgba[p] = clamp255(rgba[p] * f);
        rgba[p + 1] = clamp255(rgba[p + 1] * f);
        rgba[p + 2] = clamp255(rgba[p + 2] * f);
      } else flat[i] = clamp255(lum[i] * f);
    }
  }
  if (mode === 'auto') {
    for (let c = 0; c < 3; c++) {
      const [a, b] = percentiles(rgba, c, 0.005, 0.98);
      const k = 255 / (b - a);
      for (let p = c; p < rgba.length; p += 4) rgba[p] = clamp255((rgba[p] - a) * k);
    }
    return rgba;
  }
  if (mode === 'gray') {
    const tmp = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < flat.length; i++) tmp[i * 4] = flat[i];
    const [a, b] = percentiles(tmp, 0, 0.005, 0.98);
    const k = 255 / (b - a);
    for (let i = 0; i < flat.length; i++) {
      const v = clamp255((flat[i] - a) * k);
      const p = i * 4;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
    return rgba;
  }
  // bw
  const ii = integral(flat, w, h);
  const W = w + 1;
  const r = Math.max(7, Math.round(Math.min(w, h) / 32));
  const t = 0.15;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const count = (y1 - y0) * (x1 - x0);
      const sum = ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0];
      const v = flat[y * w + x] * count <= sum * (1 - t) ? 0 : 255;
      const p = (y * w + x) * 4;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
};

/** Full page processing: perspective warp of the quad, enhancement, rotation. */
export const processPage = (
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  opts: { quad: Quad; mode: EnhanceMode; turns: number; maxLong?: number },
): { data: Uint8ClampedArray; width: number; height: number } => {
  const size = outputSize(opts.quad, opts.maxLong);
  const warped = warpPerspective(rgba, w, h, opts.quad, size.width, size.height);
  enhance(warped, size.width, size.height, opts.mode);
  return rotateRgba(warped, size.width, size.height, opts.turns);
};
