import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useTranslation } from 'react-i18next';
import { Download, FileQuestion, Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { openPdf } from '@/components/pdfTools/pdfjs';
import { PageCanvas } from '@/components/pdfTools/PageCanvas';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const clampZoom = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;

export interface ViewState {
  zoom: number;
  rotation: number;
}

/** One PDF page; `load` must stay stable or PageCanvas re-renders the page on every render. */
const PdfPage = ({ pdf, n, width, rotation }: { pdf: PDFDocumentProxy; n: number; width: number; rotation: number }) => {
  const load = useCallback(() => pdf.getPage(n), [pdf, n]);
  return <PageCanvas load={load} width={width} rotation={rotation} lazy={n > 1} className="rounded bg-white shadow-[var(--tv-shadow-card)]" />;
};

const kindOf = (mime: string) => (mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'other');

/** pdf.js document of the current file (loaded once per file). */
const usePdf = (docId: string, enabled: boolean) => {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setPdf(null);
    setError(false);
    openPdf(fileUrl(docId))
      .then((p) => {
        loaded = p;
        if (cancelled) void p.destroy();
        else setPdf(p);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [docId, enabled]);
  return { pdf, error };
};

/**
 * Left side of the fast review: the uploaded scan. Images zoom (buttons, + / − / 0, Ctrl + wheel) and rotate
 * ([ / ]); PDFs are rendered page by page with pdf.js (lazy, sharp on HiDPI) and follow the same zoom / rotation.
 */
export const DocViewer = ({ doc, view, onView }: { doc: { id: string; mimeType: string; originalName: string }; view: ViewState; onView: (v: ViewState) => void }) => {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const kind = kindOf(doc.mimeType);
  const { pdf, error } = usePdf(doc.id, kind === 'pdf');
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => setImgLoaded(false), [doc.id]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, el.clientWidth - 48)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    onView({ ...view, zoom: clampZoom(view.zoom * (e.deltaY < 0 ? 1.1 : 0.9)) });
  };
  const sideways = view.rotation % 180 !== 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-sunken" data-tour="sp-review-viewer">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-card px-3 py-1.5">
        <p className="min-w-0 truncate text-xs text-muted" title={doc.originalName}>
          {doc.originalName}
        </p>
        <div className="flex shrink-0 items-center gap-0.5" role="toolbar" aria-label={t('sp.review.viewer')}>
          <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" onClick={() => onView({ ...view, zoom: clampZoom(view.zoom / 1.25) })} aria-label={t('sp.review.zoomOut')} title={`${t('sp.review.zoomOut')} (−)`}>
            <ZoomOut className="size-4" aria-hidden />
          </button>
          <span className="w-12 text-center text-[11px] text-muted tabular-nums">{Math.round(view.zoom * 100)}%</span>
          <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" onClick={() => onView({ ...view, zoom: clampZoom(view.zoom * 1.25) })} aria-label={t('sp.review.zoomIn')} title={`${t('sp.review.zoomIn')} (+)`}>
            <ZoomIn className="size-4" aria-hidden />
          </button>
          <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" onClick={() => onView({ ...view, zoom: 1 })} aria-label={t('sp.review.fit')} title={`${t('sp.review.fit')} (0)`}>
            <Maximize2 className="size-4" aria-hidden />
          </button>
          <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" onClick={() => onView({ ...view, rotation: (view.rotation + 270) % 360 })} aria-label={t('sp.review.rotateLeft')} title={`${t('sp.review.rotateLeft')} ([)`}>
            <RotateCcw className="size-4" aria-hidden />
          </button>
          <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" onClick={() => onView({ ...view, rotation: (view.rotation + 90) % 360 })} aria-label={t('sp.review.rotateRight')} title={`${t('sp.review.rotateRight')} (])`}>
            <RotateCw className="size-4" aria-hidden />
          </button>
          <a className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" href={fileUrl(doc.id, true)} aria-label={t('sp.review.download')} title={t('sp.review.download')}>
            <Download className="size-4" aria-hidden />
          </a>
        </div>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-auto p-6" onWheel={onWheel}>
        {kind === 'image' && (
          <div className="grid min-h-full place-items-center">
            {!imgLoaded && <Spinner className="size-6 text-muted" />}
            <img
              key={doc.id}
              src={fileUrl(doc.id)}
              alt={doc.originalName}
              onLoad={() => setImgLoaded(true)}
              draggable={false}
              className="max-w-none rounded bg-white shadow-[var(--tv-shadow-card)] transition-transform duration-150"
              style={{
                width: sideways ? undefined : width * view.zoom,
                height: sideways ? width * view.zoom : undefined,
                maxHeight: view.zoom === 1 && !sideways ? 'calc(100dvh - 12rem)' : undefined,
                objectFit: 'contain',
                transform: `rotate(${view.rotation}deg)`,
                display: imgLoaded ? undefined : 'none',
              }}
            />
          </div>
        )}
        {kind === 'pdf' &&
          (error ? (
            <p className="grid min-h-full place-items-center text-sm text-muted">{t('sp.review.pdfFailed')}</p>
          ) : !pdf ? (
            <div className="grid min-h-full place-items-center">
              <Spinner className="size-6 text-muted" />
            </div>
          ) : (
            <div className="mx-auto flex flex-col items-center gap-4">
              {Array.from({ length: pdf.numPages }, (_, i) => (
                <PdfPage key={`${doc.id}-${i}`} pdf={pdf} n={i + 1} width={Math.round(width * view.zoom)} rotation={view.rotation} />
              ))}
            </div>
          ))}
        {kind === 'other' && (
          <div className="grid min-h-full place-items-center text-center">
            <div>
              <FileQuestion className="mx-auto size-10 text-subtle" aria-hidden />
              <p className="mt-2 text-sm text-muted">{t('sp.review.noPreview')}</p>
              <a className="btn-secondary btn-sm mt-3 inline-flex" href={fileUrl(doc.id, true)}>
                <Download className="size-3.5" aria-hidden /> {t('sp.review.download')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
