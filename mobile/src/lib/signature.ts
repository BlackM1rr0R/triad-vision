/** Pure helpers for the finger signature pad: points → smooth SVG path data. */
export interface Point {
  x: number;
  y: number;
}
export type Stroke = Point[];

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * Smooth path through the points using quadratic curves between midpoints
 * (classic "midpoint smoothing": each sample is a control point, the curve passes
 * through the midpoints between samples). A single tap becomes a tiny dot.
 */
export const strokeToPath = (points: Stroke): string => {
  if (points.length === 0) return '';
  const [first] = points;
  if (points.length === 1) return `M${r(first.x)} ${r(first.y)}L${r(first.x + 0.1)} ${r(first.y + 0.1)}`;
  if (points.length === 2) return `M${r(first.x)} ${r(first.y)}L${r(points[1].x)} ${r(points[1].y)}`;

  let d = `M${r(first.x)} ${r(first.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    d += `Q${r(p.x)} ${r(p.y)} ${r(mx)} ${r(my)}`;
  }
  const last = points[points.length - 1];
  d += `L${r(last.x)} ${r(last.y)}`;
  return d;
};

export const strokeLength = (points: Stroke) => {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
};

/** A signature needs some actual ink — a stray tap is not a signature. */
export const isSignatureEmpty = (strokes: Stroke[], minLength = 40) =>
  strokes.reduce((sum, s) => sum + strokeLength(s), 0) < minLength;

/** Standalone SVG document for the strokes (used for previews/tests; the server receives a PNG). */
export const strokesToSvg = (
  strokes: Stroke[],
  { width, height, color = '#0b1f44', strokeWidth = 2.6 }: { width: number; height: number; color?: string; strokeWidth?: number },
) => {
  const paths = strokes
    .filter((s) => s.length > 0)
    .map((s) => `<path d="${strokeToPath(s)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}</svg>`;
};

/** Drop samples closer than `minDistance` to the previous one (keeps paths light while drawing). */
export const appendPoint = (stroke: Stroke, p: Point, minDistance = 1.5): Stroke => {
  const last = stroke[stroke.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDistance) return stroke;
  return [...stroke, p];
};
