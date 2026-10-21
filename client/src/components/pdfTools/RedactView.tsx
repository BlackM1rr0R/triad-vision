import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, EyeOff, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import PageViewer from './PageViewer';
import { pageSize, renderPage } from './pdfjs';
import { redactPdf, toastToolError, type PdfInfo, type SavedResponse } from './api';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Target resolution of flattened pages; very large pages are capped so no side exceeds MAX_PX. */
const DPI = 200;
const MAX_PX = 5000;

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'));

/**
 * True redaction in the browser: boxes are drawn over pages; on apply each affected page is rendered at
 * ~200 dpi, the boxes are painted black into the pixels and only those images go to the server, which
 * replaces the pages (their text and objects are removed from the file). Saved as a copy by default.
 */
export const RedactView = ({ doc, info, onSaved }: { doc: PDFDocumentProxy; info: PdfInfo; onSaved: (r: SavedResponse) => void }) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [boxes, setBoxes] = useState<Record<number, Box[]>>({});
  const [draft, setDraft] = useState<Box | null>(null);
  const [asVersion, setAsVersion] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const total = Object.values(boxes).reduce((a, b) => a + b.length, 0);
  const pagesWith = Object.keys(boxes).filter((k) => boxes[Number(k)]?.length).map(Number);

  const apply = async () => {
    setBusy(true);
    try {
      const pages: { index: number; png: Blob }[] = [];
      for (const i of pagesWith.sort((a, b) => a - b)) {
        const p = await doc.getPage(i + 1);
        const size = pageSize(p);
        const s = Math.min(DPI / 72, MAX_PX / Math.max(size.width, size.height));
        const canvas = await renderPage(p, s);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000000';
        for (const b of boxes[i]) ctx.fillRect(Math.floor(b.x * s), Math.floor(b.y * s), Math.ceil(b.w * s) + 1, Math.ceil(b.h * s) + 1);
        pages.push({ index: i, png: await toBlob(canvas) });
        canvas.width = 0;
        canvas.height = 0;
      }
      const r = await redactPdf({ nodeId: info.id, baseVersion: info.version, saveAs: asVersion ? 'version' : 'copy' }, pages);
      setBoxes({});
      onSaved(r);
    } catch (err) {
      toastToolError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-card px-4 py-2 text-sm">
        <p className="text-muted">{t('pdfTools.redact.hint')}</p>
        <span className="ml-auto font-medium text-ink">{t('pdfTools.redact.boxes', { count: total, pages: pagesWith.length })}</span>
        <button type="button" className="btn-white btn-sm border border-line" disabled={!boxes[page]?.length || busy} onClick={() => setBoxes((b) => ({ ...b, [page]: [] }))}>
          <Trash2 className="size-4" /> {t('pdfTools.redact.clear')}
        </button>
        {info.canEdit && (
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={asVersion} onChange={(e) => setAsVersion(e.target.checked)} /> {t('pdfTools.redact.saveVersion')}
          </label>
        )}
        <button type="button" className="btn-primary btn-sm" disabled={!total || busy || !info.canDownload} onClick={() => void apply()}>
          {busy ? <Spinner className="size-3.5" /> : <EyeOff className="size-4" />} {busy ? t('pdfTools.redact.working') : t('pdfTools.redact.apply')}
        </button>
      </div>
      <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('pdfTools.redact.warn')}
      </div>
      <PageViewer
        doc={doc}
        page={page}
        onPage={setPage}
        badge={(i) => (boxes[i]?.length ? <span className="absolute top-1 right-1 rounded-full bg-black px-1.5 text-[10px] font-bold text-white">{boxes[i].length}</span> : null)}
        overlay={({ scale, size }) => {
          const pt = (e: RPointerEvent<HTMLDivElement>) => {
            const r = e.currentTarget.getBoundingClientRect();
            return { x: Math.max(0, Math.min(size.width, (e.clientX - r.left) / scale)), y: Math.max(0, Math.min(size.height, (e.clientY - r.top) / scale)) };
          };
          const list = boxes[page] ?? [];
          return (
            <div
              className="absolute inset-0 cursor-crosshair touch-none"
              onPointerDown={(e) => {
                if (e.button !== 0 || busy) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                start.current = pt(e);
                setDraft({ ...start.current, w: 0, h: 0 });
              }}
              onPointerMove={(e) => {
                if (!start.current) return;
                const p = pt(e);
                const s = start.current;
                setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
              }}
              onPointerUp={() => {
                const d = draft;
                start.current = null;
                setDraft(null);
                if (d && d.w > 3 && d.h > 3) setBoxes((b) => ({ ...b, [page]: [...(b[page] ?? []), d] }));
              }}
            >
              {list.map((b, i) => (
                <div
                  key={i}
                  className="absolute bg-black/85 ring-1 ring-red-500"
                  style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={() => setBoxes((all) => ({ ...all, [page]: (all[page] ?? []).filter((_, j) => j !== i) }))}
                />
              ))}
              {draft && <div className="absolute border-2 border-red-500 bg-black/50" style={{ left: draft.x * scale, top: draft.y * scale, width: draft.w * scale, height: draft.h * scale }} />}
            </div>
          );
        }}
      />
    </div>
  );
};

export default RedactView;
