/**
 * Staff marks on a rejected scan (Document.reviewMarks; server: lib/review/marks.ts). Coordinates are relative to
 * the page (0–1, origin top left), `page` is 1-based (images: always 1). Sent with
 * POST /api/admin/cases/:id/documents/:docId/review { status: 'REJECTED', note, reviewMarks }.
 */
export interface ReviewMark {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
}

export const MAX_MARKS = 20;
export const MAX_MARK_NOTE = 300;
/** Smallest box kept after a drag (a click is not a mark). */
export const MIN_MARK = 0.01;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Marks of a document as delivered by the API (tolerant: anything malformed is dropped). */
export const marksOf = (doc: unknown): ReviewMark[] => {
  const raw = (doc as { reviewMarks?: unknown } | null)?.reviewMarks;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is ReviewMark => !!m && isNum(m.x) && isNum(m.y) && isNum(m.w) && isNum(m.h))
    .map((m) => ({ page: isNum(m.page) && m.page >= 1 ? Math.floor(m.page) : 1, x: m.x, y: m.y, w: m.w, h: m.h, note: typeof m.note === 'string' ? m.note : '' }));
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** A box from two drag points (any direction), clamped into the page; null when too small. */
export const boxFromPoints = (a: { x: number; y: number }, b: { x: number; y: number }, page: number): ReviewMark | null => {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  if (x2 - x1 < MIN_MARK || y2 - y1 < MIN_MARK) return null;
  return { page, x: r4(x1), y: r4(y1), w: r4(x2 - x1), h: r4(y2 - y1), note: '' };
};

/** Marks ready for the API: notes trimmed and capped, boxes inside the page. */
export const cleanMarks = (marks: ReviewMark[]): ReviewMark[] =>
  marks.slice(0, MAX_MARKS).map((m) => {
    const x = clamp01(m.x);
    const y = clamp01(m.y);
    return { page: Math.max(1, Math.floor(m.page)), x, y, w: Math.min(m.w, 1 - x), h: Math.min(m.h, 1 - y), note: m.note.trim().slice(0, MAX_MARK_NOTE) };
  });
