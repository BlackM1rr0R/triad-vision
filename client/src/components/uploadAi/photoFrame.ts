/**
 * Geometry of the live biometric photo frame (PhotoCamera). Everything in millimetres of the 35 × 45 mm photo:
 * German / ICAO rule — head height (chin to crown) 32–36 mm (≈ 71–80 % of the height, the band the server check
 * lib/photoCheck HEAD_SIZE accepts), face centred, some background above the head.
 */

export const PHOTO_W_MM = 35;
export const PHOTO_H_MM = 45;
export const PHOTO_RATIO = PHOTO_W_MM / PHOTO_H_MM;

/** Guide lines: chin line, the crown band that gives a 32–36 mm head, the eye band, the face oval. */
export const FRAME = {
  chinY: 40,
  crownMinY: 40 - 36, // 36 mm head
  crownMaxY: 40 - 32, // 32 mm head
  eyesMinY: 18,
  eyesMaxY: 24,
  oval: { cx: PHOTO_W_MM / 2, cy: 23, rx: 11.5, ry: 17 },
} as const;

/** Pixel size the capture aims for: 35 × 45 mm at 600 dpi (the server's full-quality threshold). */
export const TARGET_PX = { width: 827, height: 1063 };

/** The centred 35:45 crop of a video frame (what `object-cover` shows in a 35:45 box). */
export const cropRect = (videoW: number, videoH: number, ratio = PHOTO_RATIO) => {
  if (videoW <= 0 || videoH <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  if (videoW / videoH > ratio) {
    const sw = Math.round(videoH * ratio);
    return { sx: Math.round((videoW - sw) / 2), sy: 0, sw, sh: videoH };
  }
  const sh = Math.round(videoW / ratio);
  return { sx: 0, sy: Math.round((videoH - sh) / 2), sw: videoW, sh };
};

/**
 * Output size: the crop at its own resolution, scaled down to about 2 × the 600 dpi target at most (smaller upload)
 * and never up (a low-resolution camera must show up in the server's RESOLUTION check, not be hidden).
 */
export const outputSize = (sw: number, sh: number) => {
  const scale = Math.min(1, (TARGET_PX.height * 2) / Math.max(1, sh));
  return { width: Math.round(sw * scale), height: Math.round(sh * scale) };
};

export type FaceHint = 'ok' | 'closer' | 'further' | 'center';

/**
 * Hint from a detected face box (browser FaceDetector, optional) in video pixels. The detector's box covers
 * brows to chin, not the hair, so it is about 55–65 % of the head height: a box of 42–68 % of the photo height
 * means the head is roughly in the 32–36 mm band.
 */
export const faceHint = (box: { x: number; y: number; width: number; height: number }, crop: { sx: number; sy: number; sw: number; sh: number }): FaceHint => {
  if (!crop.sw || !crop.sh) return 'center';
  const cx = (box.x + box.width / 2 - crop.sx) / crop.sw;
  const h = box.height / crop.sh;
  if (Math.abs(cx - 0.5) > 0.08) return 'center';
  if (h < 0.42) return 'closer';
  if (h > 0.68) return 'further';
  return 'ok';
};

/** "y mm" → percent of the photo height (SVG / CSS positions). */
export const pctY = (mm: number) => (mm / PHOTO_H_MM) * 100;
