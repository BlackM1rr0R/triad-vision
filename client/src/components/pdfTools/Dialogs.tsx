import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { ItemIcon } from '@/components/drive/fileIcons';
import { can, type DriveItem } from '@/components/drive/types';
import FilePicker from './FilePicker';
import {
  compressFiles,
  formatSize,
  isPdfItem,
  mergeFiles,
  splitPdf,
  toastToolError,
  toolError,
  watermarkFiles,
  type BatchRow,
  type SaveAs,
  type WatermarkPosition,
} from './api';

/** One-shot PDF tool dialogs opened from the drive's context menu (lazy-loaded by usePdfTools). */

const field = 'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none';
const label = 'mb-1 block text-xs font-semibold text-muted';

export const SaveAsChoice = ({ value, onChange, canVersion }: { value: SaveAs; onChange: (v: SaveAs) => void; canVersion: boolean }) => {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className={label}>{t('pdfTools.common.saveAs')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['copy', 'version'] as SaveAs[]).map((v) => (
          <label
            key={v}
            className={clsx(
              'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              value === v ? 'border-brand-500 bg-brand-50 text-ink dark:bg-brand-500/10' : 'border-line text-ink',
              v === 'version' && !canVersion && 'cursor-not-allowed opacity-50',
            )}
          >
            <input type="radio" name="saveAs" checked={value === v} disabled={v === 'version' && !canVersion} onChange={() => onChange(v)} />
            {t(v === 'copy' ? 'pdfTools.common.asCopy' : 'pdfTools.common.asVersion')}
          </label>
        ))}
      </div>
    </fieldset>
  );
};

const FileList = ({ items }: { items: DriveItem[] }) => (
  <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface p-2">
    {items.map((i) => (
      <li key={i.id} className="flex items-center gap-2 text-sm text-ink">
        <ItemIcon item={i} className="size-4" />
        <span className="min-w-0 flex-1 truncate">{i.name}</span>
        {i.size != null && <span className="text-xs text-muted">{formatSize(i.size)}</span>}
      </li>
    ))}
  </ul>
);

const Footer = ({ busy, disabled, run, onClose }: { busy: boolean; disabled?: boolean; run: string; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <>
      <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={busy}>
        {t('pdfTools.common.cancel')}
      </button>
      <button type="submit" form="pdf-tool-form" className="btn-primary btn-sm" disabled={busy || disabled}>
        {busy && <Spinner className="size-3.5" />} {busy ? t('pdfTools.common.saving') : run}
      </button>
    </>
  );
};

const reportFailures = (rows: BatchRow[]) => {
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) toast.error(toolError(bad[0].error ?? 'UNKNOWN'));
};

// ─── compress ────────────────────────────────────────────────────────

export const CompressDialog = ({ items, toPdf: forcePdf = false, onClose, onDone }: { items: DriveItem[]; toPdf?: boolean; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [target, setTarget] = useState<'email' | 'portal2mb' | 'custom'>('portal2mb');
  const [mb, setMb] = useState('1');
  const [toPdf, setToPdf] = useState(forcePdf);
  const canVersion = items.every((i) => can(i.myAccess, 'EDIT'));
  const [saveAs, setSaveAs] = useState<SaveAs>('copy');
  const hasImages = items.some((i) => !isPdfItem(i));
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const m = useMutation({
    mutationFn: () => compressFiles({ ids: items.map((i) => i.id), target, maxBytes: target === 'custom' ? Math.round(Number(mb) * 1024 * 1024) : undefined, saveAs, toPdf: hasImages && toPdf }),
    onSuccess: (r) => {
      setRows(r.results);
      reportFailures(r.results);
      onDone();
    },
    onError: toastToolError,
  });
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? '';
  return (
    <Modal
      open
      onClose={() => !m.isPending && onClose()}
      title={t('pdfTools.compress.title')}
      description={t('pdfTools.compress.hint')}
      footer={
        rows ? (
          <button type="button" className="btn-primary btn-sm" onClick={onClose}>
            {t('pdfTools.common.close')}
          </button>
        ) : (
          <Footer busy={m.isPending} run={t('pdfTools.compress.run')} onClose={onClose} disabled={target === 'custom' && !(Number(mb) > 0.05)} />
        )
      }
    >
      {rows ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={clsx('rounded-lg border px-3 py-2 text-sm', r.ok ? 'border-line text-ink' : 'border-red-300 text-red-700')}>
              {!r.ok ? (
                <>
                  {nameOf(r.id)}: {toolError(r.error ?? 'UNKNOWN')}
                </>
              ) : r.unchanged ? (
                t('pdfTools.compress.unchanged', { name: nameOf(r.id) })
              ) : (
                <>
                  <div className="font-medium">{t('pdfTools.compress.result', { name: r.name ?? nameOf(r.id), before: formatSize(r.before ?? 0), after: formatSize(r.after ?? 0) })}</div>
                  <div className={clsx('text-xs', r.reached ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>
                    {r.reached ? t('pdfTools.compress.reached') : t('pdfTools.compress.notReached')}
                    {saveAs === 'version' && r.savedAs === 'copy' && ` · ${t('pdfTools.compress.formatCopy')}`}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <form
          id="pdf-tool-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <FileList items={items} />
          <fieldset>
            <legend className={label}>{t('pdfTools.compress.target')}</legend>
            <div className="grid gap-2">
              {(
                [
                  ['portal2mb', 'portal'],
                  ['email', 'email'],
                  ['custom', 'custom'],
                ] as const
              ).map(([v, k]) => (
                <label key={v} className="flex items-center gap-2 text-sm text-ink">
                  <input type="radio" name="target" checked={target === v} onChange={() => setTarget(v)} />
                  {t(`pdfTools.compress.${k}`)}
                  {v === 'custom' && target === 'custom' && (
                    <input type="number" min={0.1} max={50} step={0.1} value={mb} onChange={(e) => setMb(e.target.value)} className={clsx(field, 'ml-2 w-24 py-1')} aria-label={t('pdfTools.compress.customMb')} />
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          {hasImages && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={toPdf} onChange={(e) => setToPdf(e.target.checked)} />
              {t('pdfTools.compress.toPdf')}
            </label>
          )}
          <SaveAsChoice value={saveAs} onChange={setSaveAs} canVersion={canVersion} />
        </form>
      )}
    </Modal>
  );
};

// ─── watermark ───────────────────────────────────────────────────────

const PRESETS = ['KOPIE', 'Nur für Triad Vision', 'ENTWURF'];

export const WatermarkDialog = ({ items, onClose, onDone }: { items: DriveItem[]; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [text, setText] = useState(PRESETS[0]);
  const [position, setPosition] = useState<WatermarkPosition>('diagonal');
  const [opacity, setOpacity] = useState(25);
  const [size, setSize] = useState(60);
  const [color, setColor] = useState('#c0392b');
  const [pagesMode, setPagesMode] = useState<'all' | 'ranges'>('all');
  const [ranges, setRanges] = useState('');
  const canVersion = items.every((i) => can(i.myAccess, 'EDIT'));
  const [saveAs, setSaveAs] = useState<SaveAs>('copy');
  const m = useMutation({
    mutationFn: () => watermarkFiles({ ids: items.map((i) => i.id), text, position, opacity: opacity / 100, size, color, pages: pagesMode === 'all' ? 'all' : ranges, saveAs }),
    onSuccess: (r) => {
      const ok = r.results.filter((x) => x.ok).length;
      if (ok) toast.success(t('pdfTools.watermark.done', { count: ok }));
      reportFailures(r.results);
      onDone();
      onClose();
    },
    onError: toastToolError,
  });
  return (
    <Modal open onClose={() => !m.isPending && onClose()} title={t('pdfTools.watermark.title')} footer={<Footer busy={m.isPending} disabled={!text.trim() || (pagesMode === 'ranges' && !ranges.trim())} run={t('pdfTools.watermark.run')} onClose={onClose} />}>
      <form
        id="pdf-tool-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <FileList items={items} />
        <div>
          <span className={label}>{t('pdfTools.watermark.presets')}</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setText(p)} className={clsx('rounded-full border px-3 py-1 text-xs font-semibold', text === p ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10' : 'border-line text-ink hover:bg-surface')}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className={label}>{t('pdfTools.watermark.text')}</span>
          <input className={field} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder={t('pdfTools.watermark.custom')} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>{t('pdfTools.watermark.position')}</span>
            <select className={field} value={position} onChange={(e) => setPosition(e.target.value as WatermarkPosition)}>
              {(['diagonal', 'footer', 'header'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`pdfTools.watermark.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>{t('pdfTools.watermark.color')}</span>
            <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-line bg-card" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>
              {t('pdfTools.watermark.opacity')} · {opacity}%
            </span>
            <input type="range" min={5} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full" />
          </label>
          <label className="block">
            <span className={label}>
              {t('pdfTools.watermark.size')} · {size} pt
            </span>
            <input type="range" min={8} max={160} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full" />
          </label>
        </div>
        <fieldset>
          <legend className={label}>{t('pdfTools.watermark.pages')}</legend>
          <div className="flex flex-wrap items-center gap-4 text-sm text-ink">
            <label className="flex items-center gap-2">
              <input type="radio" checked={pagesMode === 'all'} onChange={() => setPagesMode('all')} /> {t('pdfTools.watermark.allPages')}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={pagesMode === 'ranges'} onChange={() => setPagesMode('ranges')} /> {t('pdfTools.watermark.someRanges')}
            </label>
            {pagesMode === 'ranges' && <input className={clsx(field, 'w-40 py-1')} value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder={t('pdfTools.watermark.rangesHint')} />}
          </div>
        </fieldset>
        <SaveAsChoice value={saveAs} onChange={setSaveAs} canVersion={canVersion} />
      </form>
    </Modal>
  );
};

// ─── split ───────────────────────────────────────────────────────────

export const SplitDialog = ({ item, onClose, onDone }: { item: DriveItem; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'each' | 'ranges'>('ranges');
  const [ranges, setRanges] = useState('');
  const m = useMutation({
    mutationFn: () => splitPdf({ nodeId: item.id, mode, ranges: mode === 'ranges' ? ranges : undefined }),
    onSuccess: (list) => {
      toast.success(t('pdfTools.split.done', { count: list.length }));
      onDone();
      onClose();
    },
    onError: toastToolError,
  });
  return (
    <Modal open onClose={() => !m.isPending && onClose()} title={t('pdfTools.split.title')} footer={<Footer busy={m.isPending} disabled={mode === 'ranges' && !ranges.trim()} run={t('pdfTools.split.run')} onClose={onClose} />}>
      <form
        id="pdf-tool-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <FileList items={[item]} />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="radio" checked={mode === 'ranges'} onChange={() => setMode('ranges')} /> {t('pdfTools.split.ranges')}
        </label>
        {mode === 'ranges' && (
          <div className="ml-6">
            <input className={field} value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder={t('pdfTools.split.rangesPlaceholder')} data-autofocus />
            <p className="mt-1 text-xs text-muted">{t('pdfTools.split.rangesHint')}</p>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="radio" checked={mode === 'each'} onChange={() => setMode('each')} /> {t('pdfTools.split.each')}
        </label>
      </form>
    </Modal>
  );
};

// ─── merge ───────────────────────────────────────────────────────────

export const MergeDialog = ({ items, onClose, onDone }: { items: DriveItem[]; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [list, setList] = useState(items);
  const [name, setName] = useState(() => `${(items[0]?.name ?? 'Dokument').replace(/\.[^.]+$/, '')} (birləşdirilmiş)`);
  const [picking, setPicking] = useState(false);
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const next = [...l];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x);
      return next;
    });
  const m = useMutation({
    mutationFn: () => mergeFiles({ ids: list.map((i) => i.id), name, parentId: items[0]?.parentId ?? undefined }),
    onSuccess: (item) => {
      toast.success(t('pdfTools.merge.done', { name: item.name }));
      onDone();
      onClose();
    },
    onError: toastToolError,
  });
  return (
    <Modal open onClose={() => !m.isPending && onClose()} size="lg" title={t('pdfTools.merge.title')} description={t('pdfTools.merge.hint')} footer={<Footer busy={m.isPending} disabled={list.length < 2 || !name.trim()} run={t('pdfTools.merge.run')} onClose={onClose} />}>
      <form
        id="pdf-tool-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <ol className="space-y-1.5">
          {list.map((it, i) => (
            <li key={it.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
              <span className="w-5 text-right text-xs font-semibold text-muted">{i + 1}.</span>
              <ItemIcon item={it} className="size-4" />
              <span className="min-w-0 flex-1 truncate text-ink">{it.name}</span>
              <button type="button" className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title={t('pdfTools.merge.up')} aria-label={t('pdfTools.merge.up')}>
                <ArrowUp className="size-4" />
              </button>
              <button type="button" className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30" disabled={i === list.length - 1} onClick={() => move(i, 1)} title={t('pdfTools.merge.down')} aria-label={t('pdfTools.merge.down')}>
                <ArrowDown className="size-4" />
              </button>
              <button type="button" className="rounded p-1 text-muted hover:bg-surface hover:text-red-600" onClick={() => setList((l) => l.filter((x) => x.id !== it.id))} title={t('pdfTools.merge.remove')} aria-label={t('pdfTools.merge.remove')}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
        {list.length < 2 && <p className="text-xs text-amber-700">{t('pdfTools.merge.needTwo')}</p>}
        <button type="button" className="btn-white btn-sm border border-line" onClick={() => setPicking(true)}>
          <Plus className="size-4" /> {t('pdfTools.merge.add')}
        </button>
        <label className="block">
          <span className={label}>{t('pdfTools.common.name')}</span>
          <input className={field} value={name} maxLength={180} onChange={(e) => setName(e.target.value)} />
        </label>
      </form>
      <FilePicker
        open={picking}
        multiple
        startId={items[0]?.parentId}
        exclude={list.map((i) => i.id)}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          setList((l) => [...l, ...picked]);
          setPicking(false);
        }}
      />
    </Modal>
  );
};
