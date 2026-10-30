import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';
import { ScanPage, scanKind } from './ScanPage';
import { boxFromPoints, MAX_MARK_NOTE, MAX_MARKS, type ReviewMark } from './marks';

registerCopy(pagesClientPlus);

/** Numbered red box of one mark (shared by the editor and the client view). */
export const MarkBox = ({ mark, n, active, onClick }: { mark: ReviewMark; n: number; active?: boolean; onClick?: () => void }) => (
  <div
    className={clsx('absolute rounded-sm border-2 border-red-600 bg-red-500/10', active && 'ring-2 ring-red-300 ring-offset-1', onClick && 'cursor-pointer')}
    style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.w * 100}%`, height: `${mark.h * 100}%` }}
    onPointerDown={onClick ? (e) => e.stopPropagation() : undefined}
    onClick={onClick}
    aria-hidden
  >
    <span className="absolute -top-2.5 -left-2.5 grid size-5 place-items-center rounded-full bg-red-600 text-[11px] leading-none font-bold text-white shadow">{n}</span>
  </div>
);

/** Page switcher for multi-page PDFs. */
export const PagePager = ({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) => {
  const { t } = useTranslation();
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted">
      <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('cplus.marks.prev')}>
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span className="tabular-nums" aria-live="polite">
        {t('cplus.marks.pages', { n: page, total })}
      </span>
      <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" disabled={page >= total} onClick={() => onChange(page + 1)} aria-label={t('cplus.marks.next')}>
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
};

/**
 * Reusable mark editor for rejecting a scan: drag rectangles over an image or a PDF page (pdf.js) and write a short
 * note per box. Controlled: `value` / `onChange` hold the marks (page-relative 0–1 coordinates, see ./marks.ts);
 * send them as `reviewMarks` with the reject request. Used by the case documents tab (admin/case/Requirements.tsx)
 * and meant for the fast review mode as well.
 *
 *   <MarkEditor src={fileUrl(doc.id)} mimeType={doc.mimeType} value={marks} onChange={setMarks} />
 *
 * Keyboard: notes are plain inputs; key presses inside the editor do not bubble to page-level shortcuts
 * (J / K / A / R of a review mode), so typing a note never accepts or rejects the document.
 * Unsupported file types (not image / PDF) render a short hint and nothing else.
 */
export const MarkEditor = ({
  src,
  mimeType,
  value,
  onChange,
  max = MAX_MARKS,
  className,
}: {
  src: string;
  mimeType: string;
  value: ReviewMark[];
  onChange: (marks: ReviewMark[]) => void;
  max?: number;
  className?: string;
}) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [draft, setDraft] = useState<ReviewMark | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const notesRef = useRef<(HTMLInputElement | null)[]>([]);

  if (scanKind(mimeType) === 'unsupported') return <p className={clsx('text-xs text-muted', className)}>{t('cplus.editor.unsupported')}</p>;

  const full = value.length >= max;
  const rel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (full || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = rel(e);
    setDraft(null);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setDraft(boxFromPoints(start.current, rel(e), page));
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const box = boxFromPoints(start.current, rel(e), page);
    start.current = null;
    setDraft(null);
    if (!box) return;
    const next = [...value, box];
    onChange(next);
    setActive(next.length - 1);
    // Focus the new note so the reviewer can type at once.
    window.setTimeout(() => notesRef.current[next.length - 1]?.focus(), 0);
  };
  const setNote = (i: number, note: string) => onChange(value.map((m, j) => (j === i ? { ...m, note } : m)));
  const remove = (i: number) => {
    onChange(value.filter((_, j) => j !== i));
    setActive(null);
  };

  return (
    <div className={clsx('space-y-3', className)} onKeyDown={(e) => e.stopPropagation()}>
      <p className="text-xs text-muted">{t('cplus.editor.hint')}</p>
      <ScanPage src={src} mimeType={mimeType} page={page} alt={t('cplus.editor.canvasLabel')} onPageCount={setPages}>
        <div
          className={clsx('absolute inset-0 touch-none', full ? 'cursor-not-allowed' : 'cursor-crosshair')}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            start.current = null;
            setDraft(null);
          }}
          aria-label={t('cplus.editor.canvasLabel')}
          role="application"
        >
          {value.map((m, i) => (m.page === page ? <MarkBox key={i} mark={m} n={i + 1} active={active === i} onClick={() => {
            setActive(i);
            notesRef.current[i]?.focus();
          }} /> : null))}
          {draft && <div className="absolute border-2 border-dashed border-red-600 bg-red-500/10" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} aria-hidden />}
        </div>
      </ScanPage>
      <PagePager page={page} total={pages} onChange={setPage} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {t('cplus.editor.count', { count: value.length })}
          {full && <> · {t('cplus.editor.max', { n: max })}</>}
        </span>
        {value.length > 0 && (
          <button type="button" className="font-semibold text-danger-fg hover:underline" onClick={() => onChange([])}>
            {t('cplus.editor.clear')}
          </button>
        )}
      </div>
      {value.length > 0 && (
        <ol className="space-y-1.5">
          {value.map((m, i) => (
            <li key={i} className={clsx('flex items-center gap-2 rounded-lg border px-2 py-1.5', active === i ? 'border-red-400 bg-danger-bg/40' : 'border-line bg-card')}>
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white"
                onClick={() => {
                  setPage(m.page);
                  setActive(i);
                }}
                aria-label={`${t('cplus.marks.mark', { n: i + 1 })} · ${t('cplus.marks.page', { n: m.page })}`}
              >
                {i + 1}
              </button>
              {pages > 1 && <span className="shrink-0 text-[11px] text-muted">{t('cplus.marks.page', { n: m.page })}</span>}
              <input
                ref={(el) => {
                  notesRef.current[i] = el;
                }}
                className="input min-h-9 flex-1 py-1 text-sm"
                value={m.note}
                maxLength={MAX_MARK_NOTE}
                placeholder={t('cplus.editor.notePh')}
                aria-label={t('cplus.marks.mark', { n: i + 1 })}
                onFocus={() => setActive(i)}
                onChange={(e) => setNote(i, e.target.value)}
              />
              <button type="button" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => remove(i)} aria-label={`${t('cplus.editor.remove')} ${i + 1}`}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default MarkEditor;
