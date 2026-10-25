import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { Spinner } from '@/components/ui/Spinner';
import { pageSize, renderPage } from './pdfjs';

/**
 * A pdf.js page rendered into a canvas `width` CSS pixels wide (sharp on HiDPI), rendered only once it
 * scrolls into view. `children` is laid over the page (same size) — used for redaction boxes and stamps;
 * `onScale` reports CSS pixels per PDF point.
 */
export const PageCanvas = ({
  load,
  width,
  rotation = 0,
  lazy = true,
  onScale,
  children,
  className,
}: {
  load: () => Promise<PDFPageProxy>;
  width: number;
  rotation?: number;
  lazy?: boolean;
  onScale?: (pxPerPt: number, size: { width: number; height: number }) => void;
  children?: ReactNode;
  className?: string;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [height, setHeight] = useState(Math.round(width * 1.414));
  const [busy, setBusy] = useState(true);
  const onScaleRef = useRef(onScale);
  onScaleRef.current = onScale;

  useEffect(() => {
    if (visible || !box.current) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: '400px' });
    io.observe(box.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setBusy(true);
    (async () => {
      const page = await load();
      if (cancelled) return;
      const size = pageSize(page, rotation);
      const css = width / size.width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      setHeight(Math.round(size.height * css));
      onScaleRef.current?.(css, size);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const tmp = await renderPage(page, css * ratio, rotation);
      if (cancelled) return;
      canvas.width = tmp.width;
      canvas.height = tmp.height;
      canvas.getContext('2d')?.drawImage(tmp, 0, 0);
      setBusy(false);
    })().catch(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [visible, load, width, rotation]);

  return (
    <div ref={box} className={className} style={{ width, height, position: 'relative' }}>
      <canvas ref={canvasRef} className="block bg-card shadow-[var(--tv-shadow-card)]" style={{ width, height }} />
      {busy && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Spinner className="size-4" />
        </div>
      )}
      {children}
    </div>
  );
};

export default PageCanvas;
