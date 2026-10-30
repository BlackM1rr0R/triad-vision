import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { openPdf, renderPage } from '@/components/pdfTools/pdfjs';

/**
 * One page of a scan (image or PDF page rendered with pdf.js) at the container's width, with `children` laid over
 * it at the same size — the review marks use percentages of this box (page-relative 0–1 coordinates), so the
 * staff editor and the client view line up whatever the screen size. pdf.js is loaded on demand only.
 */

export type ScanKind = 'image' | 'pdf' | 'unsupported';
export const scanKind = (mimeType: string | null | undefined): ScanKind =>
  mimeType?.startsWith('image/') && mimeType !== 'image/heic' && mimeType !== 'image/heif' ? 'image' : mimeType === 'application/pdf' ? 'pdf' : 'unsupported';

// One open document per URL while the page lives (editor and viewer may show the same file).
const docs = new Map<string, Promise<PDFDocumentProxy>>();
const pdfOf = (src: string) => {
  let p = docs.get(src);
  if (!p) {
    p = openPdf(src);
    p.catch(() => docs.delete(src));
    docs.set(src, p);
    if (docs.size > 12) docs.delete(docs.keys().next().value!);
  }
  return p;
};

/** Target pixel width of a rendered PDF page (sharp enough for a phone zoom, light enough for many pages). */
const RENDER_WIDTH = 1200;

export const ScanPage = ({
  src,
  mimeType,
  page = 1,
  alt,
  onPageCount,
  children,
  className,
}: {
  src: string;
  mimeType: string;
  page?: number;
  alt: string;
  onPageCount?: (n: number) => void;
  children?: ReactNode;
  className?: string;
}) => {
  const { t } = useTranslation();
  const kind = scanKind(mimeType);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const countRef = useRef(onPageCount);
  countRef.current = onPageCount;

  useEffect(() => {
    if (kind !== 'pdf') return;
    let cancelled = false;
    setState('loading');
    (async () => {
      const doc = await pdfOf(src);
      if (cancelled) return;
      countRef.current?.(doc.numPages);
      const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
      const v = p.getViewport({ scale: 1, rotation: p.rotate });
      const tmp = await renderPage(p, RENDER_WIDTH / v.width);
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = tmp.width;
      canvas.height = tmp.height;
      canvas.getContext('2d')?.drawImage(tmp, 0, 0);
      setState('ready');
    })().catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [kind, src, page]);

  useEffect(() => {
    if (kind === 'image') countRef.current?.(1);
  }, [kind, src]);

  if (kind === 'unsupported') return null;
  return (
    <div className={className}>
      <div className="relative w-full overflow-hidden rounded-lg border border-line bg-card select-none">
        {kind === 'image' ? (
          <img src={src} alt={alt} className="block h-auto w-full" draggable={false} onLoad={() => setState('ready')} onError={() => setState('error')} />
        ) : (
          <canvas ref={canvasRef} className="block h-auto w-full" role="img" aria-label={alt} />
        )}
        {state === 'loading' && (
          <div className="absolute inset-0 grid min-h-32 place-items-center bg-card/60" role="status">
            <Spinner className="size-5" />
            <span className="sr-only">{t('cplus.marks.loading')}</span>
          </div>
        )}
        {state === 'error' ? (
          <p className="flex min-h-24 items-center justify-center gap-2 p-4 text-sm text-muted" role="alert">
            <AlertTriangle className="size-4 text-warning" aria-hidden /> {t('cplus.marks.error')}
          </p>
        ) : (
          <div className="absolute inset-0">{children}</div>
        )}
      </div>
    </div>
  );
};
