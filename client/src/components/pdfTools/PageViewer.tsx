import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PageCanvas from './PageCanvas';

/**
 * One page at a time, big, with a strip of small pages on the left (redaction and stamps). `overlay` is drawn
 * over the big page and receives the scale (CSS px per PDF point) and the page size in points (as displayed).
 */
export const PageViewer = ({
  doc,
  page,
  onPage,
  badge,
  overlay,
}: {
  doc: PDFDocumentProxy;
  page: number;
  onPage: (i: number) => void;
  badge?: (i: number) => ReactNode;
  overlay: (args: { scale: number; size: { width: number; height: number } }) => ReactNode;
}) => {
  const { t } = useTranslation();
  const main = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [view, setView] = useState<{ scale: number; size: { width: number; height: number } } | null>(null);
  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(260, Math.min(980, el.clientWidth - 32))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const loaders = useMemo(() => Array.from({ length: doc.numPages }, (_, i) => () => doc.getPage(i + 1)), [doc]);
  const load = useCallback((): Promise<PDFPageProxy> => loaders[page](), [loaders, page]);
  useEffect(() => setView(null), [page]);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-32 shrink-0 space-y-3 overflow-y-auto border-r border-line bg-sunken p-3 md:block">
        {loaders.map((l, i) => (
          <button key={i} type="button" onClick={() => onPage(i)} className={clsx('relative block rounded-md p-1 text-center', i === page ? 'bg-primary/10 ring-2 ring-focus dark:bg-brand-500/20' : 'hover:bg-card')}>
            <PageCanvas load={l} width={88} />
            <span className="mt-1 block text-[11px] text-muted">{i + 1}</span>
            {badge?.(i)}
          </button>
        ))}
      </aside>
      <div ref={main} className="min-w-0 flex-1 overflow-auto bg-surface/60 p-4">
        <div className="mb-3 flex items-center justify-center gap-2 text-sm text-ink">
          <button type="button" className="rounded p-1 hover:bg-card disabled:opacity-30" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label={t('pdfTools.editor.prev')}>
            <ChevronLeft className="size-5" />
          </button>
          <span>{t('pdfTools.editor.page', { n: `${page + 1} / ${doc.numPages}` })}</span>
          <button type="button" className="rounded p-1 hover:bg-card disabled:opacity-30" disabled={page >= doc.numPages - 1} onClick={() => onPage(page + 1)} aria-label={t('pdfTools.editor.next')}>
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="mx-auto" style={{ width }}>
          <PageCanvas key={page} load={load} width={width} lazy={false} onScale={(scale, size) => setView({ scale, size })}>
            {view && overlay(view)}
          </PageCanvas>
        </div>
      </div>
    </div>
  );
};

export default PageViewer;
