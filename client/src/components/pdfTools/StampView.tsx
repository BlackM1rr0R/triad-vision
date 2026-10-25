import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { PenLine, Stamp, Trash2, Upload } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { contentUrl } from '@/components/drive/api';
import type { DriveItem } from '@/components/drive/types';
import PageViewer from './PageViewer';
import SignatureDialog from './SignatureDialog';
import { SaveAsChoice } from './Dialogs';
import { addStamp, fetchStamps, pdfToolKeys, stampPdf, toastToolError, type PdfInfo, type SaveAs, type SavedResponse } from './api';

interface Placed {
  key: string;
  page: number;
  /** Points, origin top-left of the page as displayed. */
  x: number;
  y: number;
  w: number;
  h: number;
  imageNodeId: string;
}

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const readAsDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

/** Natural size of an image (for the aspect ratio of a newly placed stamp). */
const naturalSize = (url: string) =>
  new Promise<{ w: number; h: number }>((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => res({ w: 2, h: 1 });
    img.src = url;
  });

/** Stamp & signature placement: pick from the library (Vorlagen), click on the page, drag / resize, apply. */
export const StampView = ({ doc, info, onSaved }: { doc: PDFDocumentProxy; info: PdfInfo; onSaved: (r: SavedResponse) => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<DriveItem | null>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [withDate, setWithDate] = useState(false);
  const [dateText, setDateText] = useState(today);
  const [saveAs, setSaveAs] = useState<SaveAs>(info.canEdit ? 'version' : 'copy');
  const [drawing, setDrawing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ key: string; mode: 'move' | 'resize'; sx: number; sy: number; orig: Placed } | null>(null);

  const lib = useQuery({ queryKey: pdfToolKeys.stamps, queryFn: fetchStamps });
  const add = useMutation({
    mutationFn: ({ name, data }: { name: string; data: string }) => addStamp(name, data),
    onSuccess: (item) => {
      toast.success(t('pdfTools.stamp.added', { name: item.name }));
      void qc.invalidateQueries({ queryKey: pdfToolKeys.stamps });
      setActive(item);
      setDrawing(false);
    },
    onError: toastToolError,
  });
  const apply = useMutation({
    mutationFn: () =>
      stampPdf({
        nodeId: info.id,
        baseVersion: info.version,
        saveAs,
        items: placed.map((p) => ({ page: p.page, x: p.x, y: p.y, width: p.w, height: p.h, imageNodeId: p.imageNodeId, dateText: withDate && dateText.trim() ? dateText.trim() : undefined })),
      }),
    onSuccess: (r) => {
      setPlaced([]);
      onSaved(r);
    },
    onError: toastToolError,
  });

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    if (f.type !== 'image/png' && !/\.png$/i.test(f.name)) {
      toast.error(t('pdfTools.stamp.pngOnly'));
      return;
    }
    add.mutate({ name: f.name.replace(/\.png$/i, ''), data: await readAsDataUrl(f) });
  };

  const onPage = placed.filter((p) => p.page === page);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-card px-4 py-2 text-sm">
          <p className="text-muted">{t('pdfTools.stamp.hint')}</p>
          <span className="ml-auto font-medium text-ink">{t('pdfTools.stamp.placed', { count: placed.length })}</span>
          <button type="button" className="btn-primary btn-sm" disabled={!placed.length || apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? <Spinner className="size-3.5" /> : <Stamp className="size-4" />} {t('pdfTools.stamp.apply')}
          </button>
        </div>
        <PageViewer
          doc={doc}
          page={page}
          onPage={setPage}
          badge={(i) => {
            const n = placed.filter((p) => p.page === i).length;
            return n ? <span className="absolute top-1 right-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-contrast">{n}</span> : null;
          }}
          overlay={({ scale, size }) => {
            const move = (e: RPointerEvent) => {
              const d = drag.current;
              if (!d) return;
              const dx = (e.clientX - d.sx) / scale;
              const dy = (e.clientY - d.sy) / scale;
              setPlaced((list) =>
                list.map((p) => {
                  if (p.key !== d.key) return p;
                  if (d.mode === 'move') return { ...p, x: Math.max(0, Math.min(size.width - p.w, d.orig.x + dx)), y: Math.max(0, Math.min(size.height - p.h, d.orig.y + dy)) };
                  const ratio = d.orig.h / d.orig.w;
                  const w = Math.max(20, Math.min(size.width - p.x, d.orig.w + dx, (size.height - p.y) / ratio));
                  return { ...p, w, h: w * ratio };
                }),
              );
            };
            return (
              <div
                className={clsx('absolute inset-0 touch-none', active ? 'cursor-copy' : 'cursor-default')}
                onPointerMove={move}
                onPointerUp={() => (drag.current = null)}
                onPointerDown={async (e) => {
                  if (!active || e.button !== 0) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const cx = (e.clientX - r.left) / scale;
                  const cy = (e.clientY - r.top) / scale;
                  const nat = await naturalSize(contentUrl(active.id));
                  const w = Math.min(140, size.width * 0.5);
                  const h = (w * nat.h) / nat.w;
                  setPlaced((list) => [
                    ...list,
                    { key: `${Date.now()}-${list.length}`, page, w, h, x: Math.max(0, Math.min(size.width - w, cx - w / 2)), y: Math.max(0, Math.min(size.height - h, cy - h / 2)), imageNodeId: active.id },
                  ]);
                }}
              >
                {onPage.map((p) => (
                  <div
                    key={p.key}
                    className="group absolute cursor-move ring-1 ring-focus/70 hover:ring-2"
                    style={{ left: p.x * scale, top: p.y * scale, width: p.w * scale, height: p.h * scale }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                      drag.current = { key: p.key, mode: 'move', sx: e.clientX, sy: e.clientY, orig: p };
                    }}
                  >
                    <img src={contentUrl(p.imageNodeId)} alt="" draggable={false} className="pointer-events-none size-full object-fill select-none" />
                    {withDate && dateText.trim() && (
                      <span className="pointer-events-none absolute top-full left-0 mt-0.5 text-[10px] whitespace-nowrap text-ink" style={{ fontSize: Math.max(7, Math.min(12, p.h * 0.16)) * scale }}>
                        {dateText}
                      </span>
                    )}
                    <button
                      type="button"
                      className="absolute -top-3 -right-3 hidden rounded-full bg-danger p-1 text-white shadow-[var(--tv-shadow-card)] group-hover:block"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setPlaced((list) => list.filter((x) => x.key !== p.key))}
                      aria-label={t('pdfTools.stamp.remove')}
                    >
                      <Trash2 className="size-3" />
                    </button>
                    <span
                      className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border border-white bg-primary"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.currentTarget.parentElement?.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                        drag.current = { key: p.key, mode: 'resize', sx: e.clientX, sy: e.clientY, orig: p };
                      }}
                    />
                  </div>
                ))}
              </div>
            );
          }}
        />
      </div>
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-card p-4">
        <h2 className="text-sm font-bold text-ink">{t('pdfTools.stamp.library')}</h2>
        {lib.isLoading ? (
          <Spinner />
        ) : !lib.data?.folderId ? (
          <p className="text-xs text-muted">{t('pdfTools.stamp.noAccess')}</p>
        ) : (
          <>
            {lib.data.items.length === 0 && <p className="text-xs text-muted">{t('pdfTools.stamp.noStamps')}</p>}
            <div className="grid grid-cols-2 gap-2">
              {lib.data.items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.name}
                  onClick={() => setActive(active?.id === s.id ? null : s)}
                  className={clsx('rounded-lg border bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px] p-2', active?.id === s.id ? 'border-primary ring-2 ring-focus' : 'border-line hover:border-line-strong')}
                >
                  <img src={contentUrl(s.id)} alt={s.name} className="mx-auto h-14 w-full object-contain" />
                  <span className="mt-1 block truncate text-[11px] text-ink">{s.name.replace(/\.(png|jpe?g)$/i, '')}</span>
                </button>
              ))}
            </div>
            {lib.data.canAdd && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary btn-sm" disabled={add.isPending} onClick={() => fileInput.current?.click()}>
                  <Upload className="size-4" /> {t('pdfTools.stamp.upload')}
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setDrawing(true)}>
                  <PenLine className="size-4" /> {t('pdfTools.stamp.draw')}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(e) => {
                    void onUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </>
        )}
        <div className="space-y-2 border-t border-line pt-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={withDate} onChange={(e) => setWithDate(e.target.checked)} /> {t('pdfTools.stamp.date')}
          </label>
          {withDate && (
            <input className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink" value={dateText} maxLength={60} onChange={(e) => setDateText(e.target.value)} />
          )}
        </div>
        <SaveAsChoice value={saveAs} onChange={setSaveAs} canVersion={info.canEdit} />
      </aside>
      {drawing && <SignatureDialog busy={add.isPending} onClose={() => setDrawing(false)} onSave={(name, data) => add.mutate({ name, data })} />}
    </div>
  );
};

export default StampView;
