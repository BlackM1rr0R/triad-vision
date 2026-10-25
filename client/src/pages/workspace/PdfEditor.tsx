import { Suspense, lazy, useCallback, useEffect, useRef, useState, type MouseEvent as RMouseEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { AlertTriangle, ArrowLeft, CopyPlus, FilePlus2, Lock, RotateCcw, RotateCw, Save, Scissors, SquareSplitHorizontal, Trash2, Undo2 } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pdfToolsCopy } from '@/i18n/pagesPdfTools';
import { errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { contentUrl, invalidateDrive } from '@/components/drive/api';
import type { DriveItem } from '@/components/drive/types';
import PageCanvas from '@/components/pdfTools/PageCanvas';
import { openPdf } from '@/components/pdfTools/pdfjs';
import { applyOps, editorHref, fetchInfo, isPdfItem, pdfToolKeys, splitPdf, toastToolError, type PageOp, type SavedResponse } from '@/components/pdfTools/api';

registerCopy(pdfToolsCopy);

const FilePicker = lazy(() => import('@/components/pdfTools/FilePicker'));
const SplitDialog = lazy(() => import('@/components/pdfTools/Dialogs').then((m) => ({ default: m.SplitDialog })));
const RedactView = lazy(() => import('@/components/pdfTools/RedactView'));
const StampView = lazy(() => import('@/components/pdfTools/StampView'));

/** One page of the working copy: a page of the file, or a page inserted from another drive file. */
type Entry = { key: string; rotation: number } & ({ type: 'orig'; index: number } | { type: 'insert'; nodeId: string; name: string; kind: 'pdf' | 'image'; srcIndex: number });

type Mode = 'pages' | 'redact' | 'stamp';

const THUMB = 150;

const initial = (n: number): Entry[] => Array.from({ length: n }, (_, i) => ({ key: `o${i}`, type: 'orig', index: i, rotation: 0 }));

/**
 * Turns the working copy into the server's operations: rotate (original pages) → delete → insert (all
 * inserted pages appended, consecutive pages of one source in one op) → reorder → rotate (inserted pages).
 */
const toOps = (entries: Entry[], originalCount: number): PageOp[] => {
  const ops: PageOp[] = [];
  const byAngle = new Map<number, number[]>();
  for (const e of entries) if (e.type === 'orig' && e.rotation % 360) byAngle.set(e.rotation % 360, [...(byAngle.get(e.rotation % 360) ?? []), e.index]);
  for (const [angle, pages] of byAngle) ops.push({ type: 'rotate', pages, angle });
  const kept = new Set(entries.filter((e) => e.type === 'orig').map((e) => (e as { index: number }).index));
  const deleted = Array.from({ length: originalCount }, (_, i) => i).filter((i) => !kept.has(i));
  if (deleted.length) ops.push({ type: 'delete', pages: deleted });
  // After the delete the original pages are in their original order.
  const list: string[] = entries.filter((e) => e.type === 'orig').sort((a, b) => (a as { index: number }).index - (b as { index: number }).index).map((e) => e.key);
  const inserted = entries.filter((e): e is Extract<Entry, { type: 'insert' }> => e.type === 'insert');
  for (let i = 0; i < inserted.length; ) {
    const first = inserted[i];
    const group = [first];
    while (i + group.length < inserted.length && inserted[i + group.length].nodeId === first.nodeId && first.kind === 'pdf') group.push(inserted[i + group.length]);
    ops.push(first.kind === 'image' ? { type: 'insert', at: list.length, sourceNodeId: first.nodeId } : { type: 'insert', at: list.length, sourceNodeId: first.nodeId, pages: group.map((g) => g.srcIndex) });
    list.push(...group.map((g) => g.key));
    i += group.length;
  }
  const order = entries.map((e) => list.indexOf(e.key));
  if (order.some((v, i) => v !== i)) ops.push({ type: 'reorder', order });
  const insertRot = new Map<number, number[]>();
  entries.forEach((e, i) => {
    if (e.type === 'insert' && e.rotation % 360) insertRot.set(e.rotation % 360, [...(insertRot.get(e.rotation % 360) ?? []), i]);
  });
  for (const [angle, pages] of insertRot) ops.push({ type: 'rotate', pages, angle });
  return ops;
};

export default function PdfEditor() {
  const { t } = useTranslation();
  const { nodeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mode: Mode = params.get('mode') === 'redact' ? 'redact' : params.get('mode') === 'stamp' ? 'stamp' : 'pages';

  const info = useQuery({ queryKey: pdfToolKeys.info(nodeId), queryFn: () => fetchInfo(nodeId), retry: false });
  usePageTitle(info.data?.name ?? t('pdfTools.menu.editor'));
  const version = info.data?.version;

  // The file itself, opened with pdf.js (reloaded when the version changes).
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docError, setDocError] = useState(false);
  useEffect(() => {
    if (!version) return;
    let gone = false;
    let opened: PDFDocumentProxy | null = null;
    setDoc(null);
    setDocError(false);
    openPdf(`${contentUrl(nodeId)}${contentUrl(nodeId).includes('?') ? '&' : '?'}v=${version}`)
      .then((d) => {
        opened = d;
        if (gone) void d.destroy();
        else setDoc(d);
      })
      .catch(() => !gone && setDocError(true));
    return () => {
      gone = true;
      void opened?.destroy();
    };
  }, [nodeId, version]);

  // Working copy + undo history.
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<Entry[][]>([]);
  useEffect(() => {
    if (doc) {
      setEntries(initial(doc.numPages));
      setHistory([]);
      setSelected(new Set());
    }
  }, [doc]);
  const change = (next: Entry[]) => {
    setHistory((h) => [...h.slice(-49), entries]);
    setEntries(next);
  };
  const dirty = history.length > 0;

  // Other PDFs (inserted pages): opened once each.
  const others = useRef(new Map<string, Promise<PDFDocumentProxy>>());
  useEffect(() => {
    const map = others.current;
    return () => {
      for (const p of map.values()) void p.then((d) => d.destroy()).catch(() => undefined);
      map.clear();
    };
  }, []);
  const otherDoc = (id: string) => {
    let p = others.current.get(id);
    if (!p) {
      p = openPdf(contentUrl(id));
      others.current.set(id, p);
    }
    return p;
  };
  const loaders = useRef(new Map<string, () => Promise<PDFPageProxy>>());
  const loaderOf = useCallback(
    (e: Entry) => {
      const k = e.type === 'orig' ? `o${e.index}` : `${e.nodeId}:${e.srcIndex}`;
      let l = loaders.current.get(k);
      if (!l) {
        l = e.type === 'orig' ? () => doc!.getPage(e.index + 1) : async () => (await otherDoc(e.nodeId)).getPage(e.srcIndex + 1);
        loaders.current.set(k, l);
      }
      return l;
    },
    [doc],
  );
  useEffect(() => loaders.current.clear(), [doc]);

  // Selection.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const click = (key: string, e: RMouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const a = entries.findIndex((x) => x.key === anchor.current);
      const b = entries.findIndex((x) => x.key === key);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(new Set(entries.slice(lo, hi + 1).map((x) => x.key)));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      });
    } else setSelected(new Set([key]));
    anchor.current = key;
  };
  const sel = entries.filter((e) => selected.has(e.key));

  const rotate = (d: number) => change(entries.map((e) => (selected.has(e.key) ? { ...e, rotation: (((e.rotation + d) % 360) + 360) % 360 } : e)));
  const remove = () => {
    if (sel.length >= entries.length) return toast.error(t('pdfTools.errors.NO_PAGES_LEFT'));
    change(entries.filter((e) => !selected.has(e.key)));
    setSelected(new Set());
  };

  // Drag & drop reorder.
  const dragKeys = useRef<string[]>([]);
  const [dropAt, setDropAt] = useState<{ key: string; after: boolean } | null>(null);
  const drop = () => {
    const keys = dragKeys.current;
    const target = dropAt;
    setDropAt(null);
    if (!keys.length || !target || keys.includes(target.key)) return;
    const moving = entries.filter((e) => keys.includes(e.key));
    const rest = entries.filter((e) => !keys.includes(e.key));
    const at = rest.findIndex((e) => e.key === target.key) + (target.after ? 1 : 0);
    change([...rest.slice(0, at), ...moving, ...rest.slice(at)]);
  };

  // Insert from another file.
  const [picking, setPicking] = useState(false);
  const insert = async (items: DriveItem[]) => {
    setPicking(false);
    const lastSel = entries.reduce((acc, e, i) => (selected.has(e.key) ? i : acc), -1);
    const at = lastSel >= 0 ? lastSel + 1 : entries.length;
    const added: Entry[] = [];
    try {
      for (const it of items) {
        if (isPdfItem(it)) {
          const d = await otherDoc(it.id);
          for (let i = 0; i < d.numPages; i++) added.push({ key: `i${Date.now()}-${it.id}-${i}-${added.length}`, type: 'insert', nodeId: it.id, name: it.name, kind: 'pdf', srcIndex: i, rotation: 0 });
        } else added.push({ key: `i${Date.now()}-${it.id}-${added.length}`, type: 'insert', nodeId: it.id, name: it.name, kind: 'image', srcIndex: 0, rotation: 0 });
      }
    } catch {
      toast.error(t('pdfTools.editor.failed'));
      return;
    }
    change([...entries.slice(0, at), ...added, ...entries.slice(at)]);
    setSelected(new Set(added.map((a) => a.key)));
  };

  // Save.
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const afterSave = (r: SavedResponse) => {
    void invalidateDrive(qc);
    if (r.created) {
      toast.success(t('pdfTools.editor.savedCopy', { name: r.item.name }), { action: { label: t('pdfTools.common.openFile'), onClick: () => navigate(editorHref(r.item.id)) } });
    } else toast.success(t('pdfTools.editor.saved', { version: r.version }));
    void qc.invalidateQueries({ queryKey: pdfToolKeys.info(nodeId) });
  };
  const save = async (saveAs: 'version' | 'copy') => {
    if (!info.data || !doc) return;
    const ops = toOps(entries, doc.numPages);
    if (!ops.length) return;
    setSaving(true);
    try {
      const r = await applyOps(nodeId, { baseVersion: info.data.version, ops, saveAs });
      afterSave(r);
      if (r.created) {
        setEntries(initial(doc.numPages));
        setHistory([]);
      }
    } catch (err) {
      if (errorCode(err) === 'VERSION_CONFLICT') setConflict(true);
      else toastToolError(err);
    } finally {
      setSaving(false);
    }
  };
  const onSavedTool = (r: SavedResponse) => {
    if (!r.created) setConflict(false);
    afterSave(r);
  };

  const [extracting, setExtracting] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const extract = async () => {
    setExtracting(true);
    try {
      const items = await splitPdf({ nodeId, mode: 'selected', pages: sel.map((e) => (e as { index: number }).index) });
      void invalidateDrive(qc);
      toast.success(t('pdfTools.split.done', { count: items.length }), { action: { label: t('pdfTools.common.openFile'), onClick: () => navigate(editorHref(items[0].id)) } });
    } catch (err) {
      toastToolError(err);
    } finally {
      setExtracting(false);
    }
  };

  // Leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Keyboard: Delete, Ctrl+A, Ctrl+Z.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e: KeyboardEvent) => {
    if (mode !== 'pages' || (e.target as HTMLElement)?.closest('input, textarea, select, [role=dialog]')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length && info.data?.canEdit) {
      e.preventDefault();
      remove();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(entries.map((x) => x.key)));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && history.length) {
      e.preventDefault();
      undo();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const undo = () => {
    setEntries(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const setMode = (m: Mode) => {
    // TODO(ui): ConfirmDialog
    if (dirty && m !== 'pages' && !window.confirm(t('pdfTools.editor.leaveUnsaved'))) return;
    if (dirty && m !== 'pages' && doc) {
      setEntries(initial(doc.numPages));
      setHistory([]);
    }
    setParams(m === 'pages' ? {} : { mode: m }, { replace: true });
  };

  const backHref = info.data?.parentId ? `/workspace/drive/f/${encodeURIComponent(info.data.parentId)}` : '/workspace/drive';
  const editable = !!info.data?.canEdit;
  const canCopy = !!info.data?.canDownload;
  const onlyOriginalSelected = sel.length > 0 && sel.every((e) => e.type === 'orig');

  if (info.isLoading || (!doc && !docError && !info.isError)) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> {t('pdfTools.editor.loading')}
        </div>
      </div>
    );
  }
  if (info.isError || docError || !info.data || !doc) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 text-warning-fg" size={36} />
          <p className="mb-5 text-sm text-muted">{info.isError ? (info.error ? t(`pdfTools.errors.${errorCode(info.error)}`, { defaultValue: t('pdfTools.editor.failed') }) : '') : t('pdfTools.editor.failed')}</p>
          <Link to="/workspace/drive" className="btn-primary btn-sm">
            <ArrowLeft size={15} /> {t('pdfTools.editor.back')}
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: 'pages', label: t('pdfTools.editor.tabPages') },
    { id: 'redact', label: t('pdfTools.editor.tabRedact') },
    { id: 'stamp', label: t('pdfTools.editor.tabStamp') },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-sunken text-ink">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-card px-4 py-2.5">
        <Link
          to={backHref}
          onClick={(e) => {
            // TODO(ui): ConfirmDialog
            if (dirty && !window.confirm(t('pdfTools.editor.leaveUnsaved'))) e.preventDefault();
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-sunken hover:text-ink"
        >
          <ArrowLeft className="size-4" /> {t('pdfTools.editor.back')}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">
          {info.data.name} <span className="text-xs font-normal text-muted">v{info.data.version}</span>
        </h1>
        <nav className="flex rounded-lg border border-line p-0.5" role="tablist">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={mode === tb.id}
              onClick={() => setMode(tb.id)}
              className={clsx('rounded-md px-3 py-1 text-sm font-medium', mode === tb.id ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')}
            >
              {tb.label}
            </button>
          ))}
        </nav>
      </header>

      {info.data.final && (
        <div className="flex items-center gap-2 border-b border-warning-border bg-warning-bg px-4 py-2 text-sm text-warning-fg dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Lock className="size-4" /> {t('pdfTools.editor.final')}
        </div>
      )}
      {!info.data.final && !editable && <div className="border-b border-line bg-card px-4 py-2 text-sm text-muted">{t('pdfTools.editor.readOnly')}</div>}
      {conflict && (
        <div className="flex items-center gap-3 border-b border-danger-border bg-danger-bg px-4 py-2 text-sm text-danger-fg dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <AlertTriangle className="size-4" /> {t('pdfTools.editor.conflict')}
          <button
            type="button"
            className="btn-secondary btn-sm ml-auto border border-line"
            onClick={() => {
              setConflict(false);
              void info.refetch();
            }}
          >
            {t('pdfTools.editor.reload')}
          </button>
        </div>
      )}

      {mode === 'pages' ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-card px-4 py-2">
            <span className="mr-2 text-sm text-muted">
              {t('pdfTools.editor.pages', { count: entries.length })}
              {sel.length > 0 && ` · ${t('pdfTools.editor.selected', { count: sel.length })}`}
            </span>
            <ToolButton icon={RotateCcw} label={t('pdfTools.editor.rotateLeft')} disabled={!sel.length || !canCopy} onClick={() => rotate(-90)} />
            <ToolButton icon={RotateCw} label={t('pdfTools.editor.rotateRight')} disabled={!sel.length || !canCopy} onClick={() => rotate(90)} />
            <ToolButton icon={Trash2} label={t('pdfTools.editor.delete')} disabled={!sel.length || !canCopy} onClick={remove} />
            <ToolButton icon={FilePlus2} label={t('pdfTools.editor.insert')} title={t('pdfTools.editor.insertHint')} disabled={!canCopy} onClick={() => setPicking(true)} />
            <span className="mx-1 h-5 w-px bg-line" />
            <ToolButton icon={Scissors} label={t('pdfTools.editor.extract')} disabled={!onlyOriginalSelected || dirty || extracting || !canCopy} onClick={() => void extract()} />
            <ToolButton icon={SquareSplitHorizontal} label={t('pdfTools.editor.splitMore')} disabled={dirty || !canCopy} onClick={() => setSplitOpen(true)} />
            <div className="ml-auto flex items-center gap-2">
              {dirty && <span className="text-xs text-warning-fg dark:text-amber-300">{t('pdfTools.editor.unsaved', { count: history.length })}</span>}
              <ToolButton icon={Undo2} label={t('pdfTools.editor.undo')} disabled={!dirty || saving} onClick={undo} />
              <button type="button" className="btn-secondary btn-sm" disabled={!dirty || saving || !canCopy} onClick={() => void save('copy')}>
                <CopyPlus className="size-4" /> {t('pdfTools.editor.saveCopy')}
              </button>
              <button type="button" className="btn-primary btn-sm" disabled={!dirty || saving || !editable} onClick={() => void save('version')}>
                {saving ? <Spinner className="size-3.5" /> : <Save className="size-4" />} {t('pdfTools.editor.save')}
              </button>
            </div>
          </div>
          <p className="px-4 pt-3 text-xs text-muted">{t('pdfTools.editor.dragHint')}</p>
          <div
            className="min-h-0 flex-1 overflow-y-auto p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(new Set());
            }}
          >
            <ul className="flex flex-wrap gap-4">
              {entries.map((e, i) => {
                const on = selected.has(e.key);
                const marker = dropAt?.key === e.key;
                return (
                  <li
                    key={e.key}
                    draggable={canCopy}
                    onDragStart={(ev) => {
                      dragKeys.current = selected.has(e.key) ? entries.filter((x) => selected.has(x.key)).map((x) => x.key) : [e.key];
                      ev.dataTransfer.effectAllowed = 'move';
                      ev.dataTransfer.setData('text/plain', e.key);
                    }}
                    onDragOver={(ev) => {
                      if (!dragKeys.current.length) return;
                      ev.preventDefault();
                      const r = ev.currentTarget.getBoundingClientRect();
                      const after = ev.clientX > r.left + r.width / 2;
                      if (dropAt?.key !== e.key || dropAt.after !== after) setDropAt({ key: e.key, after });
                    }}
                    onDragLeave={() => setDropAt((d) => (d?.key === e.key ? null : d))}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      drop();
                    }}
                    onDragEnd={() => {
                      dragKeys.current = [];
                      setDropAt(null);
                    }}
                    onClick={(ev) => click(e.key, ev)}
                    className={clsx(
                      'relative cursor-pointer rounded-lg border-2 bg-card p-2 select-none',
                      on ? 'border-primary ring-2 ring-focus/30' : 'border-transparent hover:border-line',
                      marker && (dropAt!.after ? 'after:absolute after:inset-y-1 after:-right-3 after:w-1 after:rounded after:bg-primary' : 'before:absolute before:inset-y-1 before:-left-3 before:w-1 before:rounded before:bg-primary'),
                    )}
                  >
                    {e.type === 'insert' && e.kind === 'image' ? (
                      <div className="grid place-items-center bg-card" style={{ width: THUMB, height: THUMB * 1.414 }}>
                        <img src={contentUrl(e.nodeId)} alt="" className="max-h-full max-w-full object-contain transition-transform" style={{ transform: `rotate(${e.rotation}deg)` }} draggable={false} />
                      </div>
                    ) : (
                      <PageCanvas load={loaderOf(e)} width={THUMB} rotation={e.rotation} />
                    )}
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-ink">{i + 1}</span>
                      {e.type === 'insert' && <span className="truncate rounded bg-primary/[0.06] px-1.5 text-[10px] text-link dark:bg-brand-500/15 dark:text-brand-200" title={e.name}>+ {e.name}</span>}
                      {e.rotation !== 0 && <span className="text-[10px] text-muted">{e.rotation}°</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : (
        <Suspense
          fallback={
            <div className="grid flex-1 place-items-center">
              <Spinner />
            </div>
          }
        >
          {mode === 'redact' ? <RedactView doc={doc} info={info.data} onSaved={onSavedTool} /> : info.data.final ? <div className="p-6 text-sm text-muted">{t('pdfTools.errors.FILE_FINAL')}</div> : <StampView doc={doc} info={info.data} onSaved={onSavedTool} />}
        </Suspense>
      )}

      <Suspense fallback={null}>
        {picking && <FilePicker open startId={info.data.parentId} multiple onClose={() => setPicking(false)} onPick={(items) => void insert(items)} />}
        {splitOpen && (
          <SplitDialog
            item={{ id: nodeId, name: info.data.name, kind: 'FILE', mimeType: 'application/pdf', size: info.data.size } as DriveItem}
            onClose={() => setSplitOpen(false)}
            onDone={() => void invalidateDrive(qc)}
          />
        )}
      </Suspense>
    </div>
  );
}

const ToolButton = ({ icon: Icon, label, title, disabled, onClick }: { icon: typeof Save; label: string; title?: string; disabled?: boolean; onClick: () => void }) => (
  <button type="button" title={title ?? label} disabled={disabled} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink hover:bg-sunken disabled:opacity-40 disabled:hover:bg-transparent">
    <Icon className="size-4" /> <span className="hidden lg:inline">{label}</span>
  </button>
);
