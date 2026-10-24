import sharp from 'sharp';

/**
 * Synthetic colour "passport photos" for the biometric photo check tests: a plain wall, an oval head with hair,
 * eyes and mouth (fine texture so the sharpness check has edges), a neck and shoulders. Options make it blurred,
 * too dark, on a coloured or busy background, with a too small head, in the wrong format …
 */

export interface PhotoOpts {
  width?: number;
  height?: number;
  /** Background colour (RGB). */
  bg?: [number, number, number];
  /** Noise amplitude on the background in 24 px tiles (busy / textured wall). */
  bgNoise?: number;
  /** Horizontal brightness gradient across the background (shadow on the wall), 0–1. */
  bgGradient?: number;
  /** Head height (crown → chin) as a share of the image height. */
  head?: number;
  /** Crown position (share of the height). */
  top?: number;
  /** Horizontal centre of the head (share of the width). */
  centerX?: number;
  /** Multiplies every pixel (0.3 = very dark). */
  gain?: number;
  /** Box-blur radius (pixels, three passes). */
  blur?: number;
  seed?: number;
}

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

const blurRgb = (data: Uint8Array, w: number, h: number, r: number) => {
  let src = data;
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += src[(y * w + Math.min(w - 1, Math.max(0, x))) * 3 + c];
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * 3 + c] = acc / (2 * r + 1);
          acc += src[(y * w + Math.min(w - 1, x + r + 1)) * 3 + c] - src[(y * w + Math.max(0, x - r)) * 3 + c];
        }
      }
    }
    const out = new Uint8Array(w * h * 3);
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + c];
        for (let y = 0; y < h; y++) {
          out[(y * w + x) * 3 + c] = clamp(acc / (2 * r + 1));
          acc += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] - tmp[(Math.max(0, y - r) * w + x) * 3 + c];
        }
      }
    }
    src = out;
  }
  return src;
};

/** Raw RGB pixels of a synthetic passport photo. */
export const syntheticPhoto = (o: PhotoOpts = {}) => {
  const w = o.width ?? 827;
  const h = o.height ?? 1063;
  const bg = o.bg ?? [228, 228, 230];
  const head = o.head ?? 0.74;
  const top = o.top ?? 0.08;
  const cx = (o.centerX ?? 0.5) * w;
  const rand = rng(o.seed ?? 11);
  const data = new Uint8Array(w * h * 3);
  const tiles = new Map<number, number>();
  const tileNoise = (x: number, y: number) => {
    const k = Math.floor(y / 24) * 10_000 + Math.floor(x / 24);
    if (!tiles.has(k)) tiles.set(k, (rand() - 0.5) * 2 * (o.bgNoise ?? 0));
    return tiles.get(k)!;
  };
  const crownY = top * h;
  const chinY = crownY + head * h;
  const ry = (chinY - crownY) / 2;
  const rx = ry * 0.74;
  const cy = crownY + ry;
  const neckW = rx * 0.55;
  const shoulderY = Math.min(h - 1, chinY + h * 0.06);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const shade = 1 - (o.bgGradient ?? 0) * (x / w);
      let r = bg[0] * shade;
      let g = bg[1] * shade;
      let b = bg[2] * shade;
      if (o.bgNoise) {
        const n = tileNoise(x, y);
        r += n;
        g += n;
        b += n;
      }
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const inHead = dx * dx + dy * dy <= 1;
      if (inHead) {
        // skin with fine texture; hair on the upper third
        const t = (rand() - 0.5) * 30;
        if (y < crownY + ry * 0.45) [r, g, b] = [60 + t, 45 + t, 35 + t];
        else [r, g, b] = [205 + t, 165 + t, 140 + t];
        // eyes and mouth: dark strokes
        const ey = cy - ry * 0.05;
        if (Math.abs(y - ey) < ry * 0.035 && (Math.abs(x - (cx - rx * 0.4)) < rx * 0.18 || Math.abs(x - (cx + rx * 0.4)) < rx * 0.18)) [r, g, b] = [30, 25, 25];
        if (Math.abs(y - (cy + ry * 0.5)) < ry * 0.025 && Math.abs(x - cx) < rx * 0.3) [r, g, b] = [140, 60, 60];
        if (Math.abs(x - cx) < 2 && y > cy && y < cy + ry * 0.3) [r, g, b] = [150, 110, 95];
      } else if (y >= chinY - ry * 0.1 && y < shoulderY && Math.abs(x - cx) <= neckW) {
        const t = (rand() - 0.5) * 20;
        [r, g, b] = [195 + t, 155 + t, 130 + t];
      } else if (y >= shoulderY && Math.abs(x - cx) <= Math.min(w * 0.48, neckW + (y - shoulderY) * 3)) {
        const t = (rand() - 0.5) * 24;
        [r, g, b] = [40 + t, 50 + t, 80 + t];
      }
      const gain = o.gain ?? 1;
      data[i] = clamp(r * gain);
      data[i + 1] = clamp(g * gain);
      data[i + 2] = clamp(b * gain);
    }
  }
  return { data: o.blur ? blurRgb(data, w, h, o.blur) : data, width: w, height: h };
};

export const photoJpeg = async (o: PhotoOpts = {}) => {
  const p = syntheticPhoto(o);
  return sharp(Buffer.from(p.data), { raw: { width: p.width, height: p.height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
};

export const photoPng = async (o: PhotoOpts = {}) => {
  const p = syntheticPhoto(o);
  return sharp(Buffer.from(p.data), { raw: { width: p.width, height: p.height, channels: 3 } }).png().toBuffer();
};

export const photoWebp = async (o: PhotoOpts = {}) => {
  const p = syntheticPhoto(o);
  return sharp(Buffer.from(p.data), { raw: { width: p.width, height: p.height, channels: 3 } }).webp().toBuffer();
};
