/**
 * Pure page-list logic of the document scanner (reorder, delete, limits, PDF name). The native work
 * (camera, rotate, resize, upload) lives in scanner.ts / scanUpload.ts; this file is unit tested.
 */

/** Same limit as the server (POST /cases/:id/documents/scan). */
export const SCAN_MAX_PAGES = 20;

export interface PageList<T> {
  pages: T[];
  current: number;
}

const clamp = (i: number, length: number) => Math.max(0, Math.min(i, length - 1));

/** Adds a page at the end and selects it; unchanged once the limit is reached. */
export const addPage = <T>(list: PageList<T>, page: T, max = SCAN_MAX_PAGES): PageList<T> =>
  list.pages.length >= max ? list : { pages: [...list.pages, page], current: list.pages.length };

/** Replaces the page at `index` (retake). */
export const replacePage = <T>(list: PageList<T>, index: number, page: T): PageList<T> => ({
  pages: list.pages.map((p, i) => (i === index ? page : p)),
  current: list.current,
});

/** Removes the page at `index`; the selection stays on the neighbour. */
export const removePage = <T>(list: PageList<T>, index: number): PageList<T> => {
  if (index < 0 || index >= list.pages.length) return list;
  const pages = list.pages.filter((_, i) => i !== index);
  if (!pages.length) return { pages, current: 0 };
  const current = list.current > index ? list.current - 1 : list.current === index ? Math.min(index, pages.length - 1) : list.current;
  return { pages, current: clamp(current, pages.length) };
};

/** Moves the page at `from` by `delta` positions (−1 = earlier, +1 = later); the moved page stays selected. */
export const movePage = <T>(list: PageList<T>, from: number, delta: number): PageList<T> => {
  const to = from + delta;
  if (from < 0 || from >= list.pages.length || to < 0 || to >= list.pages.length || delta === 0) return list;
  const pages = [...list.pages];
  const [moved] = pages.splice(from, 1);
  pages.splice(to, 0, moved);
  return { pages, current: to };
};

export const canMove = (length: number, index: number, delta: number) => index + delta >= 0 && index + delta < length;

/** File name of the generated PDF: the requirement title (safe characters) or "scan-YYYY-MM-DD". */
export const scanPdfName = (title: string | null | undefined, now = new Date()) => {
  const base = (title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return base || `scan-${now.toISOString().slice(0, 10)}`;
};

/** Overall progress: rendering the pages counts for the first 30 %, the upload for the rest. */
export const overallProgress = (phase: 'render' | 'upload', done: number, total: number) => {
  if (total <= 0) return 0;
  const f = Math.max(0, Math.min(1, done / total));
  return phase === 'render' ? f * 0.3 : 0.3 + f * 0.7;
};
