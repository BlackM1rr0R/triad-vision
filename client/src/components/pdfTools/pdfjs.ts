import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/**
 * pdf.js, loaded on demand only (never part of the main bundle): the library and its worker come in when
 * the PDF editor first renders a page.
 */
type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | null = null;

export const loadPdfjs = () =>
  (lib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })).catch((err) => {
    lib = null;
    throw err;
  });

/** Opens a PDF from a URL (cookies included). */
export const openPdf = async (url: string): Promise<PDFDocumentProxy> => {
  const pdfjs = await loadPdfjs();
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());
  return pdfjs.getDocument({ data, isEvalSupported: false }).promise;
};

/**
 * Renders a page into a canvas at `scale` (1 = 72 dpi) with an extra page `rotation` (on top of the page's own).
 * Returns the canvas; the caller decides where to put it.
 */
export const renderPage = async (page: PDFPageProxy, scale: number, extraRotation = 0, canvas = document.createElement('canvas')) => {
  const viewport = page.getViewport({ scale, rotation: (page.rotate + extraRotation) % 360 });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
};

/** Size of a page as displayed (points, rotation applied). */
export const pageSize = (page: PDFPageProxy, extraRotation = 0) => {
  const v = page.getViewport({ scale: 1, rotation: (page.rotate + extraRotation) % 360 });
  return { width: v.width, height: v.height };
};
