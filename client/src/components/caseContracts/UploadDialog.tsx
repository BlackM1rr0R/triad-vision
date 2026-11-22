import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, FileUp, Send, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { PageCanvas } from '@/components/pdfTools/PageCanvas';
import { loadPdfjs } from '@/components/pdfTools/pdfjs';
import { ccError, type PdfInspect, type Placement, type Step } from './api';

/**
 * Case contracts V2 (server lib/caseContracts + lib/esign/placements): staff upload their OWN PDF(s) that already
 * contain empty signature places and say where the signatures go —
 *   - PDF with form fields (AcroForm signature / text fields): pick for each field whether it is the client's or
 *     Triad Vision's;
 *   - otherwise (or additionally): draw the boxes on the rendered page (press + drag).
 * Boxes are sent in PDF points (bottom-left origin). Əmək müqaviləsi: one PDF, client + Triad Vision places;
 * İş müqaviləsi: 1–10 PDFs, client places only.
 */

type Role = Placement['role'];
const MAX_FILES = 10;
const PREVIEW_WIDTH = 520;

interface Item {
  key: string;
  file: File;
  info: PdfInspect;
  pdf: PDFDocumentProxy;
  /** field name → role ('' = not used) */
  fields: Record<string, Role | ''>;
  boxes: Placement[];
}

const ROLE_TONE: Record<Role, string> = {
  CANDIDATE: 'border-link bg-primary/15 text-link',
  STAFF: 'border-warning-fg bg-warning-bg/70 text-warning-fg',
};

/** The placements of one file: mapped fields + drawn boxes. */
export const placementsOf = (it: Pick<Item, 'info' | 'fields' | 'boxes'>): Placement[] => [
  ...it.info.fields.flatMap((f) => {
    const role = it.fields[f.name];
    return role ? [{ role, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, field: f.name }] : [];
  }),
  ...it.boxes,
];

/** Converts a box drawn on the preview (CSS px from the top-left) to PDF points (bottom-left origin). */
export const toPdfBox = (px: { left: number; top: number; width: number; height: number }, scale: number, page: { width: number; height: number; x: number; y: number }) => ({
  x: page.x + px.left / scale,
  y: page.y + page.height - (px.top + px.height) / scale,
  w: px.width / scale,
  h: px.height / scale,
});

const PagePreview = ({ it, page, drawRole, onAdd, onRemove }: { it: Item; page: number; drawRole: Role; onAdd: (b: Placement) => void; onRemove: (i: number) => void }) => {
  const { t } = useTranslation();
  const [scale, setScale] = useState(0);
  const [rotated, setRotated] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const info = it.info.pages[page - 1];
  const load = useCallback(async () => {
    const p = await it.pdf.getPage(page);
    setRotated(p.rotate % 360 !== 0);
    return p;
  }, [it.pdf, page]);
  const pos = (e: ReactPointerEvent) => {
    const r = overlay.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  };
  const cssBox = (b: { x: number; y: number; w: number; h: number }) => ({
    left: (b.x - info.x) * scale,
    top: (info.y + info.height - b.y - b.h) * scale,
    width: b.w * scale,
    height: b.h * scale,
  });
  const fieldBoxes = it.info.fields.filter((f) => f.page === page);
  return (
    <div className="grid gap-2">
      {rotated && <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-fg">{t('caseContracts.v2.dialog.rotated')}</p>}
      <div className="mx-auto overflow-auto rounded-lg border border-line bg-sunken p-2" style={{ maxWidth: PREVIEW_WIDTH + 20 }}>
        <PageCanvas load={load} width={PREVIEW_WIDTH} lazy={false} onScale={(s) => setScale(s)}>
          {scale > 0 && (
            <div
              ref={overlay}
              className={clsx('absolute inset-0', !rotated && 'cursor-crosshair')}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                if (rotated || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
                const p = pos(e);
                overlay.current!.setPointerCapture(e.pointerId);
                setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              }}
              onPointerMove={(e) => drag && setDrag({ ...drag, x1: pos(e).x, y1: pos(e).y })}
              onPointerUp={() => {
                if (!drag) return;
                const left = Math.min(drag.x0, drag.x1);
                const top = Math.min(drag.y0, drag.y1);
                const width = Math.abs(drag.x1 - drag.x0);
                const height = Math.abs(drag.y1 - drag.y0);
                setDrag(null);
                if (width < 12 || height < 8) return;
                onAdd({ role: drawRole, page, ...toPdfBox({ left, top, width, height }, scale, info) });
              }}
            >
              {fieldBoxes.map((f) => {
                const role = it.fields[f.name];
                return (
                  <div
                    key={`f-${f.name}-${f.x}-${f.y}`}
                    className={clsx('pointer-events-none absolute rounded border-2 border-dashed text-[10px] font-semibold', role ? ROLE_TONE[role] : 'border-muted/60 text-muted')}
                    style={cssBox(f)}
                    title={f.name}
                  >
                    <span className="px-0.5">{role ? t(`caseContracts.v2.dialog.role${role}`) : f.name}</span>
                  </div>
                );
              })}
              {it.boxes.map((b, i) =>
                b.page === page ? (
                  <div key={`b-${i}`} className={clsx('absolute rounded border-2 text-[10px] font-semibold', ROLE_TONE[b.role])} style={cssBox(b)}>
                    <span className="px-0.5">{t(`caseContracts.v2.dialog.role${b.role}`)}</span>
                    <button
                      type="button"
                      className="absolute -top-2.5 -right-2.5 grid size-5 place-items-center rounded-full bg-card text-danger-fg shadow"
                      aria-label={t('caseContracts.v2.dialog.removeBox')}
                      onClick={() => onRemove(i)}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </div>
                ) : null,
              )}
              {drag && (
                <div
                  className={clsx('pointer-events-none absolute rounded border-2', ROLE_TONE[drawRole])}
                  style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }}
                />
              )}
            </div>
          )}
        </PageCanvas>
      </div>
      <p className="text-center text-xs text-muted">{t('caseContracts.v2.dialog.drawHint')}</p>
    </div>
  );
};

export const UploadDialog = ({ caseId, step, replacesId, onClose, onDone }: { caseId: string; step: Step; replacesId?: string | null; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [page, setPage] = useState(1);
  const [drawRole, setDrawRole] = useState<Role>('CANDIDATE');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const single = step === 'LABOUR' || !!replacesId;
  const roles: Role[] = step === 'LABOUR' ? ['CANDIDATE', 'STAFF'] : ['CANDIDATE'];

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list].slice(0, single ? 1 : Math.max(0, MAX_FILES - items.length));
    setLoading(true);
    try {
      const pdfjs = await loadPdfjs();
      const added: Item[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const info = (await api.post<PdfInspect>('/admin/case-contracts/inspect', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
        // Fields are suggested by type: signature fields to the client (staff change it), text fields unused.
        const fields = Object.fromEntries(info.fields.map((f) => [f.name, f.type === 'signature' && roles.length === 1 ? 'CANDIDATE' : ''])) as Record<string, Role | ''>;
        added.push({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, info, pdf, fields, boxes: [] });
      }
      setItems((prev) => (single ? added : [...prev, ...added]));
      setActive(single ? 0 : items.length);
      setPage(1);
    } catch (err) {
      toast.error(ccError(t, err));
    } finally {
      setLoading(false);
      if (input.current) input.current.value = '';
    }
  };

  const update = (i: number, f: (it: Item) => Item) => setItems((prev) => prev.map((x, j) => (j === i ? f(x) : x)));
  const it = items[active];
  const problems = useMemo(
    () =>
      items.map((x) => {
        const p = placementsOf(x);
        if (!p.some((b) => b.role === 'CANDIDATE')) return 'needClient';
        if (step === 'LABOUR' && !p.some((b) => b.role === 'STAFF')) return 'needTriad';
        return null;
      }),
    [items, step],
  );
  const ready = items.length > 0 && problems.every((p) => !p);

  const send = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      for (const x of items) fd.append('files', x.file);
      fd.append('meta', JSON.stringify({ step, placements: items.map(placementsOf), message: message.trim() || null, replacesId: replacesId ?? null }));
      return (await api.post(`/admin/case-contracts/cases/${caseId}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },
    onSuccess: () => {
      toast.success(t('caseContracts.v2.dialog.sent'));
      onDone();
    },
    onError: (err) => toast.error(ccError(t, err)),
  });

  const counts = it ? placementsOf(it).reduce((m, b) => ({ ...m, [b.role]: (m[b.role] ?? 0) + 1 }), {} as Record<Role, number>) : null;

  return (
    <Modal
      open
      onClose={() => !send.isPending && onClose()}
      size="lg"
      title={t(`caseContracts.v2.dialog.title${step}`)}
      description={t(step === 'LABOUR' ? 'caseContracts.v2.labourInfo' : 'caseContracts.v2.workInfo')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={send.isPending}>
            {t('caseContracts.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!ready || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('caseContracts.v2.dialog.send')}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {items.map((x, i) => (
            <span key={x.key} className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs', i === active ? 'border-link bg-primary/10 text-link' : 'border-line text-ink', problems[i] && 'border-warning-fg')}>
              <button
                type="button"
                className="max-w-48 truncate font-semibold"
                onClick={() => {
                  setActive(i);
                  setPage(1);
                }}
              >
                {x.file.name}
              </button>
              <button
                type="button"
                aria-label={t('caseContracts.v2.dialog.remove')}
                onClick={() => {
                  setItems((prev) => prev.filter((_, j) => j !== i));
                  setActive(0);
                  setPage(1);
                }}
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          {(single ? items.length === 0 : items.length < MAX_FILES) && (
            <label className="btn-secondary btn-sm cursor-pointer">
              {loading ? <Spinner className="size-3.5" /> : <FileUp className="size-3.5" aria-hidden />} {t('caseContracts.v2.dialog.pick')}
              <input ref={input} type="file" accept="application/pdf,.pdf" multiple={!single} className="sr-only" disabled={loading} onChange={(e) => void addFiles(e.target.files)} />
            </label>
          )}
        </div>

        {it && (
          <>
            {it.info.fields.length > 0 ? (
              <fieldset className="grid gap-2 rounded-lg border border-line p-3">
                <legend className="px-1 text-xs text-muted">{t('caseContracts.v2.dialog.fieldsFound', { count: it.info.fields.length })}</legend>
                {it.info.fields.map((f) => (
                  <label key={`${f.name}-${f.page}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={f.name}>
                      {f.name} · {t('caseContracts.v2.dialog.page', { n: f.page, total: it.info.pageCount })}
                    </span>
                    <select
                      className="input w-auto py-1 text-sm"
                      value={it.fields[f.name] ?? ''}
                      onChange={(e) => {
                        update(active, (x) => ({ ...x, fields: { ...x.fields, [f.name]: e.target.value as Role | '' } }));
                        setPage(f.page);
                      }}
                    >
                      <option value="">{t('caseContracts.v2.dialog.fieldNone')}</option>
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {t(`caseContracts.v2.dialog.role${r}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="rounded-lg bg-primary/[0.06] px-3 py-2 text-xs text-link">{t('caseContracts.v2.dialog.noFields')}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t('caseContracts.v2.dialog.drawAs')}</span>
              <div className="inline-flex rounded-lg border border-line p-0.5" role="group">
                {roles.map((r) => (
                  <button key={r} type="button" aria-pressed={drawRole === r} className={clsx('rounded-md px-3 py-1 text-xs font-semibold', drawRole === r ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')} onClick={() => setDrawRole(r)}>
                    {t(`caseContracts.v2.dialog.role${r}`)}
                  </button>
                ))}
              </div>
              <span className="ml-auto inline-flex items-center gap-1 text-xs">
                <button type="button" className="btn-ghost btn-sm" disabled={page <= 1} aria-label={t('caseContracts.v2.dialog.prev')} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                {t('caseContracts.v2.dialog.page', { n: page, total: it.info.pageCount })}
                <button type="button" className="btn-ghost btn-sm" disabled={page >= it.info.pageCount} aria-label={t('caseContracts.v2.dialog.next')} onClick={() => setPage((p) => Math.min(it.info.pageCount, p + 1))}>
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </span>
            </div>

            <PagePreview
              key={`${it.key}-${page}`}
              it={it}
              page={page}
              drawRole={drawRole}
              onAdd={(b) => update(active, (x) => ({ ...x, boxes: [...x.boxes, b] }))}
              onRemove={(i) => update(active, (x) => ({ ...x, boxes: x.boxes.filter((_, j) => j !== i) }))}
            />
            <p className={clsx('text-xs', problems[active] ? 'text-warning-fg' : 'text-success-fg')}>
              {problems[active] ? t(`caseContracts.v2.dialog.${problems[active]}`) : t('caseContracts.v2.dialog.boxes', { client: counts?.CANDIDATE ?? 0, triad: counts?.STAFF ?? 0 })}
            </p>
          </>
        )}

        <div>
          <label htmlFor="cc-v2-message" className="label">
            {t('caseContracts.v2.dialog.message')}
          </label>
          <textarea id="cc-v2-message" className="input" rows={2} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
};

export default UploadDialog;
