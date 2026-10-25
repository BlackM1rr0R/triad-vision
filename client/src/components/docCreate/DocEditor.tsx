import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Redo2,
  SeparatorHorizontal,
  Table,
  Trash2,
  Underline,
  Undo2,
  X,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { driveError } from '@/components/drive/api';
import { useDriveLock } from '@/components/drive/collab/useDriveLock';
import { FinalBanner } from '@/components/drive/org/FinalBanner';
import type { DriveItem } from '@/components/drive/types';
import { createPdf, fetchLetterhead, fetchSource, isText, newId, updatePdf, type Align, type Block, type DocModel, type Run, type TableBlock, type TextBlock, type TextType } from './api';
import { getOffsets, insertText, normalize, runsLength, runsText, sliceRuns, toggleMark } from './richText';
import { RichBlock, type PendingSelection } from './RichBlock';
import { TableEditor } from './TableEditor';

export type DocEditorTarget = { mode: 'new'; parentId: string } | { mode: 'edit'; nodeId: string };

const TEXT_TYPES: { type: TextType; icon: LucideIcon }[] = [
  { type: 'p', icon: Pilcrow },
  { type: 'h1', icon: Heading1 },
  { type: 'h2', icon: Heading2 },
  { type: 'h3', icon: Heading3 },
  { type: 'ul', icon: List },
  { type: 'ol', icon: ListOrdered },
];

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const emptyText = (type: TextType = 'p'): TextBlock => ({ id: newId(), type, runs: [] });
const withIds = (blocks: Block[]) => blocks.map((b) => ({ ...b, id: b.id || newId() }) as Block);

const HISTORY = 100;

/** Toolbar button that keeps the text selection (mousedown does not steal the focus). */
const ToolBtn = ({ icon: Icon, label, onClick, active, disabled }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={clsx('grid size-8 shrink-0 place-items-center rounded-lg text-ink transition hover:bg-sunken disabled:opacity-35', active && 'bg-primary/[0.06] text-link dark:bg-white/10')}
  >
    <Icon className="size-4" />
  </button>
);

/**
 * Document editor of the team drive (full screen): a page with letterhead, date, title and blocks
 * (paragraphs, headings, bullet and numbered lists, tables, dividers, page breaks); "Save as PDF" renders it
 * on the server and stores it in the folder — later saves create new versions of the same file.
 */
export default function DocEditor({ target, folderName, onClose, onSaved }: { target: DocEditorTarget; folderName?: string; onClose: () => void; onSaved: (item: DriveItem, created: boolean) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [letterhead, setLetterhead] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>(() => [emptyText()]);
  const [nodeId, setNodeId] = useState<string | null>(target.mode === 'edit' ? target.nodeId : null);
  // Edit lock while the document is open (released on close / tab close; colleagues see "… is editing").
  const lock = useDriveLock(nodeId);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [renderKeys, setRenderKeys] = useState<Record<string, number>>({});
  const pending = useRef<PendingSelection | null>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // ── history (own undo stack: the DOM is re-rendered from the model, so the browser's would break) ──
  const history = useRef<{ stack: Block[][]; index: number; typingTimer: number | null }>({ stack: [blocks], index: 0, typingTimer: null });
  const snapshot = useCallback((next: Block[]) => {
    const h = history.current;
    h.stack = [...h.stack.slice(0, h.index + 1), next].slice(-HISTORY);
    h.index = h.stack.length - 1;
  }, []);
  const rerenderAll = (list: Block[]) => setRenderKeys((k) => Object.fromEntries(list.map((b) => [b.id, (k[b.id] ?? 0) + 1])));
  const undo = (dir: -1 | 1) => {
    const h = history.current;
    if (h.typingTimer) {
      window.clearTimeout(h.typingTimer);
      h.typingTimer = null;
      if (dir === -1) snapshot(blocksRef.current);
    }
    const i = h.index + dir;
    if (i < 0 || i >= h.stack.length) return;
    h.index = i;
    const list = h.stack[i];
    setBlocks(list);
    rerenderAll(list);
    setDirty(true);
  };

  /** Structural change: new blocks, history entry, optional DOM re-render of some blocks. */
  const commit = useCallback(
    (next: Block[], rerender: string[] = []) => {
      setBlocks(next);
      snapshot(next);
      setDirty(true);
      if (rerender.length) setRenderKeys((k) => ({ ...k, ...Object.fromEntries(rerender.map((id) => [id, (k[id] ?? 0) + 1])) }));
    },
    [snapshot],
  );

  // ── loading an existing document ──
  const source = useQuery({ queryKey: ['drive', 'docSource', nodeId], queryFn: () => fetchSource(nodeId!), enabled: target.mode === 'edit', staleTime: Infinity, gcTime: 0, retry: false });
  const loaded = useRef(false);
  useEffect(() => {
    if (!source.data || loaded.current) return;
    loaded.current = true;
    const d = source.data.doc;
    setName(source.data.name);
    setTitle(d.title);
    setLetterhead(d.letterhead);
    setDate(d.date ?? null);
    const list = withIds(d.blocks.length ? d.blocks : [emptyText()]);
    setBlocks(list);
    history.current = { stack: [list], index: 0, typingTimer: null };
    rerenderAll(list);
    setVersion(source.data.version);
  }, [source.data]);
  useEffect(() => {
    if (source.error) {
      toast.error(driveError(source.error));
      onClose();
    }
  }, [source.error, onClose]);

  const lh = useQuery({ queryKey: ['drive', 'letterhead'], queryFn: fetchLetterhead, enabled: letterhead, staleTime: 5 * 60_000 });

  // ── block helpers ──
  const register = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  }, []);
  const focusBlock = (id: string, at: 'start' | 'end' | number) => {
    const b = blocksRef.current.find((x) => x.id === id);
    if (!b || !isText(b)) return;
    const pos = at === 'start' ? 0 : at === 'end' ? runsLength(b.runs) : at;
    pending.current = { id, start: pos, end: pos };
    setRenderKeys((k) => ({ ...k, [id]: (k[id] ?? 0) + 1 }));
  };

  const onRuns = useCallback(
    (id: string, runs: Run[]) => {
      const list = blocksRef.current;
      const i = list.findIndex((b) => b.id === id);
      const b = list[i];
      if (!b || !isText(b)) return;
      // Markdown-like shortcuts at the start of a paragraph: "# ", "## ", "### ", "- ", "1. ".
      if (b.type === 'p') {
        const text = runsText(runs);
        const m = /^(#{1,3}|[-*•]|1[.)])\s/.exec(text);
        if (m) {
          const type: TextType = m[1].startsWith('#') ? (`h${m[1].length}` as TextType) : m[1].startsWith('1') ? 'ol' : 'ul';
          const next = list.map((x) => (x.id === id ? { ...b, type, runs: sliceRuns(runs, m[0].length) } : x));
          pending.current = { id, start: 0, end: 0 };
          commit(next, [id]);
          return;
        }
      }
      const next = list.map((x) => (x.id === id ? { ...b, runs } : x));
      setBlocks(next);
      setDirty(true);
      // Typing: one history entry per pause.
      const h = history.current;
      if (h.typingTimer) window.clearTimeout(h.typingTimer);
      h.typingTimer = window.setTimeout(() => {
        h.typingTimer = null;
        snapshot(blocksRef.current);
      }, 700);
    },
    [commit, snapshot],
  );

  const toggle = (mark: 'b' | 'i' | 'u') => {
    const id = focusId;
    const el = id ? els.current.get(id) : null;
    const b = blocksRef.current.find((x) => x.id === id);
    if (!id || !el || !b || !isText(b)) return;
    const off = getOffsets(el);
    if (!off || off.end <= off.start) return;
    const runs = toggleMark(b.runs, off.start, off.end, mark);
    pending.current = { id, start: off.start, end: off.end };
    commit(
      blocksRef.current.map((x) => (x.id === id ? { ...b, runs } : x)),
      [id],
    );
  };

  const setType = (type: TextType) => {
    const id = focusId;
    const b = blocksRef.current.find((x) => x.id === id);
    if (!id || !b || !isText(b)) return;
    const el = els.current.get(id);
    const off = el ? getOffsets(el) : null;
    pending.current = { id, start: off?.start ?? runsLength(b.runs), end: off?.end ?? runsLength(b.runs) };
    commit(
      blocksRef.current.map((x) => (x.id === id ? { ...b, type } : x)),
      [id],
    );
  };

  const setAlign = (align: Align) => {
    const id = focusId;
    const b = blocksRef.current.find((x) => x.id === id);
    if (!id || !b || !isText(b)) return;
    commit(blocksRef.current.map((x) => (x.id === id ? { ...b, align: align === 'left' ? undefined : align } : x)));
  };

  const insertAfterFocus = (nb: Block) => {
    const list = blocksRef.current;
    const i = focusId ? list.findIndex((b) => b.id === focusId) : list.length - 1;
    const at = i < 0 ? list.length : i + 1;
    // A rule or table is followed by an empty paragraph so writing can go on below it.
    const extra: Block[] = isText(nb) ? [] : list[at] && isText(list[at]) ? [] : [emptyText()];
    const next = [...list.slice(0, at), nb, ...extra, ...list.slice(at)];
    if (isText(nb)) pending.current = { id: nb.id, start: 0, end: 0 };
    commit(next);
    setFocusId(nb.id);
  };

  const move = (id: string, dir: -1 | 1) => {
    const list = [...blocksRef.current];
    const i = list.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit(list, [list[i].id, list[j].id]);
  };

  const remove = (id: string) => {
    const list = blocksRef.current;
    const i = list.findIndex((b) => b.id === id);
    const next = list.filter((b) => b.id !== id);
    const safe = next.length ? next : [emptyText()];
    commit(safe, safe === next ? [] : [safe[0].id]);
    const neighbour = safe[Math.max(0, i - 1)];
    if (neighbour && isText(neighbour)) focusBlock(neighbour.id, 'end');
    setFocusId(neighbour?.id ?? null);
  };

  // ── keyboard inside a text block ──
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, id: string, el: HTMLDivElement) => {
      const list = blocksRef.current;
      const i = list.findIndex((b) => b.id === id);
      const b = list[i];
      if (!b || !isText(b)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const off = getOffsets(el);
        if (!off || off.end <= off.start) return;
        const mark = e.key.toLowerCase() as 'b' | 'i' | 'u';
        pending.current = { id, start: off.start, end: off.end };
        commit(
          list.map((x) => (x.id === id ? { ...b, runs: toggleMark(b.runs, off.start, off.end, mark) } : x)),
          [id],
        );
        return;
      }
      if (mod && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        undo(e.key.toLowerCase() === 'y' || e.shiftKey ? 1 : -1);
        return;
      }
      const off = getOffsets(el);
      if (!off) return;
      const len = runsLength(b.runs);
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        pending.current = { id, start: off.start + 1, end: off.start + 1 };
        commit(
          list.map((x) => (x.id === id ? { ...b, runs: insertText(b.runs, off.start, off.end, '\n') } : x)),
          [id],
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const isList = b.type === 'ul' || b.type === 'ol';
        if (isList && len === 0) {
          // Enter on an empty list item ends the list.
          pending.current = { id, start: 0, end: 0 };
          commit(
            list.map((x) => (x.id === id ? { ...b, type: 'p' as const } : x)),
            [id],
          );
          return;
        }
        const left = sliceRuns(b.runs, 0, off.start);
        const right = sliceRuns(b.runs, off.end);
        const nb: TextBlock = { id: newId(), type: isList ? b.type : 'p', runs: right, ...(b.align && !isList && b.type === 'p' ? { align: b.align } : {}) };
        pending.current = { id: nb.id, start: 0, end: 0 };
        commit([...list.slice(0, i), { ...b, runs: left }, nb, ...list.slice(i + 1)], [id]);
        setFocusId(nb.id);
        return;
      }
      if (e.key === 'Backspace' && off.start === 0 && off.end === 0) {
        if (b.type !== 'p') {
          e.preventDefault();
          pending.current = { id, start: 0, end: 0 };
          commit(
            list.map((x) => (x.id === id ? { ...b, type: 'p' as const } : x)),
            [id],
          );
          return;
        }
        const prev = list[i - 1];
        if (!prev) return;
        e.preventDefault();
        if (isText(prev)) {
          const at = runsLength(prev.runs);
          pending.current = { id: prev.id, start: at, end: at };
          commit(
            list.flatMap((x) => (x.id === id ? [] : x.id === prev.id ? [{ ...prev, runs: normalize([...prev.runs, ...b.runs]) }] : [x])),
            [prev.id],
          );
          setFocusId(prev.id);
        } else {
          // A divider, page break or table right before: remove the empty paragraph, or the divider.
          if (len === 0 && prev.type === 'table') remove(id);
          else if (prev.type !== 'table') commit(list.filter((x) => x.id !== prev.id));
        }
        return;
      }
      if (e.key === 'Delete' && off.start === len && off.end === len) {
        const next = list[i + 1];
        if (next && isText(next)) {
          e.preventDefault();
          pending.current = { id, start: len, end: len };
          commit(
            list.flatMap((x) => (x.id === next.id ? [] : x.id === id ? [{ ...b, runs: normalize([...b.runs, ...next.runs]) }] : [x])),
            [id],
          );
        }
        return;
      }
      if (e.key === 'ArrowUp' && off.start === 0) {
        const prev = [...list.slice(0, i)].reverse().find(isText);
        if (prev) {
          e.preventDefault();
          focusBlock(prev.id, 'end');
        }
        return;
      }
      if (e.key === 'ArrowDown' && off.end === len) {
        const next = list.slice(i + 1).find(isText);
        if (next) {
          e.preventDefault();
          focusBlock(next.id, 'start');
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit],
  );

  // ── paste: plain text only; blank lines start new paragraphs ──
  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>, id: string, el: HTMLDivElement) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
      if (!text) return;
      const list = blocksRef.current;
      const i = list.findIndex((b) => b.id === id);
      const b = list[i];
      if (!b || !isText(b)) return;
      const off = getOffsets(el) ?? { start: runsLength(b.runs), end: runsLength(b.runs) };
      const parts = text.split(/\n{2,}/).map((p) => p.replace(/^\n+|\n+$/g, ''));
      if (parts.length === 1) {
        pending.current = { id, start: off.start + parts[0].length, end: off.start + parts[0].length };
        commit(
          list.map((x) => (x.id === id ? { ...b, runs: insertText(b.runs, off.start, off.end, parts[0]) } : x)),
          [id],
        );
        return;
      }
      const head: TextBlock = { ...b, runs: normalize([...sliceRuns(b.runs, 0, off.start), { t: parts[0] }]) };
      const middle: TextBlock[] = parts.slice(1, -1).map((p) => ({ id: newId(), type: 'p', runs: p ? [{ t: p }] : [] }));
      const lastText = parts[parts.length - 1];
      const tail: TextBlock = { id: newId(), type: b.type === 'ul' || b.type === 'ol' ? b.type : 'p', runs: normalize([{ t: lastText }, ...sliceRuns(b.runs, off.end)]) };
      pending.current = { id: tail.id, start: lastText.length, end: lastText.length };
      commit([...list.slice(0, i), head, ...middle, tail, ...list.slice(i + 1)], [id]);
      setFocusId(tail.id);
    },
    [commit],
  );

  const onTable = useCallback((id: string, nb: TableBlock) => commit(blocksRef.current.map((x) => (x.id === id ? nb : x))), [commit]);

  // ── save ──
  const fileName = name.trim() || title.trim() || t('docCreate.editor.untitled');
  const model = (): DocModel => ({
    title: title.trim(),
    letterhead,
    date: date?.trim() || null,
    blocks: blocksRef.current.map((b) => (isText(b) ? { ...b, runs: normalize(b.runs) } : b)),
  });
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!nodeId) {
        if (target.mode !== 'new') return;
        const item = await createPdf({ ...model(), parentId: target.parentId, name: fileName });
        setNodeId(item.id);
        setName(item.name);
        setVersion(item.version);
        toast.success(t('docCreate.editor.created'));
        onSaved(item, true);
      } else {
        const r = await updatePdf(nodeId, { ...model(), baseVersion: version });
        setVersion(r.version);
        toast.success(t('docCreate.editor.updated'));
        onSaved(r.item, false);
      }
      setDirty(false);
    } catch (err) {
      toast.error(driveError(err));
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    // TODO(ui): ConfirmDialog
    if (dirty && !window.confirm(t('docCreate.editor.discard'))) return;
    onClose();
  };

  // Ctrl+S saves; the page behind does not scroll while the editor is open.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const listNumbers = useMemo(() => {
    const out: Record<string, number> = {};
    let n = 0;
    for (const b of blocks) {
      n = b.type === 'ol' ? n + 1 : 0;
      out[b.id] = n;
    }
    return out;
  }, [blocks]);

  const focused = blocks.find((b) => b.id === focusId);
  const focusedText = focused && isText(focused) ? focused : null;
  const loading = target.mode === 'edit' && !source.data;

  const sep = <span className="mx-1 h-6 w-px shrink-0 bg-line" />;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-sunken" role="dialog" aria-modal="true" aria-label={t(target.mode === 'new' && !nodeId ? 'docCreate.editor.newTitle' : 'docCreate.editor.editTitle')}>
      {/* Header: name, letterhead, date, save */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2 sm:px-4">
        <button type="button" onClick={close} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('docCreate.editor.close')} title={t('docCreate.editor.close')}>
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t(target.mode === 'new' && !nodeId ? 'docCreate.editor.newTitle' : 'docCreate.editor.editTitle')}
            {folderName ? ` · ${folderName}` : ''}
            {version > 0 ? ` · v${version}` : ''}
          </p>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            disabled={!!nodeId}
            placeholder={`${fileName.replace(/\.pdf$/i, '')}.pdf`}
            aria-label={t('docCreate.editor.fileName')}
            maxLength={180}
            className="w-full min-w-0 truncate bg-transparent text-base font-bold text-ink outline-none placeholder:text-muted disabled:opacity-100"
          />
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink" title={t('docCreate.editor.letterheadHint')}>
          <input type="checkbox" className="size-4 accent-primary" checked={letterhead} onChange={(e) => (setLetterhead(e.target.checked), setDirty(true))} />
          {t('docCreate.editor.letterhead')}
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink">
          <input type="checkbox" className="size-4 accent-primary" checked={date !== null} onChange={(e) => (setDate(e.target.checked ? today() : null), setDirty(true))} />
          {t('docCreate.editor.date')}
          {date !== null && <input value={date} onChange={(e) => (setDate(e.target.value), setDirty(true))} maxLength={60} className="w-24 border-b border-line bg-transparent text-xs outline-none" aria-label={t('docCreate.editor.date')} />}
        </label>
        <button type="button" onClick={() => void save()} disabled={saving || loading} className="btn-primary btn-sm">
          {saving && <Spinner className="size-3.5" />} {saving ? t('docCreate.editor.saving') : t('docCreate.editor.save')}
        </button>
      </header>
      {nodeId && <FinalBanner nodeId={nodeId} />}
      {(lock.status === 'other' || lock.status === 'error') && (
        <div role="status" className="flex shrink-0 items-center gap-2 border-b border-warning-border bg-warning-bg px-4 py-2 text-xs text-warning-fg dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="min-w-0 flex-1">{lock.status === 'other' ? t('driveCollab.lock.bannerOther', { name: lock.lockedBy.name }) : t('driveCollab.lock.bannerError')}</span>
          <button type="button" onClick={lock.retry} className="shrink-0 font-semibold underline">
            {t('driveCollab.lock.retry')}
          </button>
        </div>
      )}

      {/* Formatting toolbar */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-card px-2 py-1.5 sm:px-4" role="toolbar" aria-label={t('docCreate.editor.blockType')}>
        <ToolBtn icon={Undo2} label={t('docCreate.editor.undo')} onClick={() => undo(-1)} />
        <ToolBtn icon={Redo2} label={t('docCreate.editor.redo')} onClick={() => undo(1)} />
        {sep}
        {TEXT_TYPES.map(({ type, icon }) => (
          <ToolBtn key={type} icon={icon} label={t(`docCreate.editor.blocks.${type}`)} active={focusedText?.type === type} disabled={!focusedText} onClick={() => setType(type)} />
        ))}
        {sep}
        <ToolBtn icon={Bold} label={t('docCreate.editor.bold')} disabled={!focusedText} onClick={() => toggle('b')} />
        <ToolBtn icon={Italic} label={t('docCreate.editor.italic')} disabled={!focusedText} onClick={() => toggle('i')} />
        <ToolBtn icon={Underline} label={t('docCreate.editor.underline')} disabled={!focusedText} onClick={() => toggle('u')} />
        {sep}
        <ToolBtn icon={AlignLeft} label={t('docCreate.editor.alignLeft')} disabled={!focusedText} active={!!focusedText && !focusedText.align} onClick={() => setAlign('left')} />
        <ToolBtn icon={AlignCenter} label={t('docCreate.editor.alignCenter')} disabled={!focusedText} active={focusedText?.align === 'center'} onClick={() => setAlign('center')} />
        <ToolBtn icon={AlignRight} label={t('docCreate.editor.alignRight')} disabled={!focusedText} active={focusedText?.align === 'right'} onClick={() => setAlign('right')} />
        {sep}
        <ToolBtn icon={Table} label={t('docCreate.editor.blocks.table')} onClick={() => insertAfterFocus({ id: newId(), type: 'table', header: true, rows: [['', '', ''], ['', '', '']] })} />
        <ToolBtn icon={Minus} label={t('docCreate.editor.blocks.hr')} onClick={() => insertAfterFocus({ id: newId(), type: 'hr' })} />
        <ToolBtn icon={SeparatorHorizontal} label={t('docCreate.editor.blocks.pagebreak')} onClick={() => insertAfterFocus({ id: newId(), type: 'pagebreak' })} />
        {focused && (
          <>
            {sep}
            <ToolBtn icon={ArrowUp} label={t('docCreate.editor.moveUp')} onClick={() => move(focused.id, -1)} disabled={blocks[0]?.id === focused.id} />
            <ToolBtn icon={ArrowDown} label={t('docCreate.editor.moveDown')} onClick={() => move(focused.id, 1)} disabled={blocks[blocks.length - 1]?.id === focused.id} />
            <ToolBtn icon={Trash2} label={t('docCreate.editor.remove')} onClick={() => remove(focused.id)} />
          </>
        )}
      </div>

      {/* Page */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-6 sm:px-6">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-muted">
            <span className="inline-flex items-center gap-2">
              <Spinner className="size-4" /> {t('docCreate.editor.loading')}
            </span>
          </div>
        ) : (
          <article className="mx-auto w-full max-w-[52rem] rounded-xl border border-line bg-card px-5 py-8 shadow-[var(--tv-shadow-card)] sm:px-14 sm:py-12">
            {letterhead && (
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-3">
                <div>
                  <p className="text-lg font-bold text-ink dark:text-brand-300">{lh.data?.name ?? 'Triad Vision'}</p>
                  {lh.data?.lines.map((l) => (
                    <p key={l} className="text-xs text-muted">
                      {l}
                    </p>
                  ))}
                </div>
                <div className="text-right text-xs text-muted">
                  {lh.data?.contact.map((c) => (
                    <p key={c}>{c}</p>
                  ))}
                </div>
              </div>
            )}
            {date !== null && <p className="mb-4 text-right text-sm text-ink">{date}</p>}
            <input
              value={title}
              onChange={(e) => (setTitle(e.target.value), setDirty(true))}
              placeholder={t('docCreate.editor.docTitle')}
              aria-label={t('docCreate.editor.docTitle')}
              maxLength={300}
              className="w-full bg-transparent text-[26px] leading-tight font-bold text-ink outline-none placeholder:text-subtle dark:text-brand-300"
            />
            {title.trim() && <div className="mt-2 mb-5 border-b border-line" />}
            {!title.trim() && <div className="mb-4" />}
            <div className="space-y-2">
              {blocks.map((b) => (
                <div
                  key={b.id}
                  className={clsx('-mx-3 rounded-lg px-3 py-0.5 transition-colors', focusId === b.id && !isText(b) && 'bg-primary/[0.04] ring-1 ring-focus dark:bg-white/5')}
                  onMouseDown={() => !isText(b) && setFocusId(b.id)}
                >
                  {isText(b) ? (
                    <RichBlock
                      block={b}
                      renderKey={renderKeys[b.id] ?? 0}
                      listNumber={listNumbers[b.id] ?? 0}
                      placeholder={t(b.type.startsWith('h') ? 'docCreate.editor.placeholder.h' : b.type === 'p' ? 'docCreate.editor.placeholder.p' : 'docCreate.editor.placeholder.li')}
                      pending={pending}
                      register={register}
                      onRuns={onRuns}
                      onKeyDown={onKeyDown}
                      onPaste={onPaste}
                      onFocus={setFocusId}
                    />
                  ) : b.type === 'table' ? (
                    <TableEditor block={b} onChange={onTable} onFocus={setFocusId} />
                  ) : b.type === 'hr' ? (
                    <button type="button" className="block w-full py-2" onClick={() => setFocusId(b.id)} aria-label={t('docCreate.editor.blocks.hr')}>
                      <hr className="border-line" />
                    </button>
                  ) : (
                    <button type="button" className="flex w-full items-center gap-2 py-2 text-[11px] font-semibold tracking-wide text-muted uppercase" onClick={() => setFocusId(b.id)}>
                      <span className="h-px flex-1 border-t border-dashed border-line" /> {t('docCreate.editor.pageBreakLabel')} <span className="h-px flex-1 border-t border-dashed border-line" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-lg py-6 text-left text-sm text-transparent hover:text-muted"
              onClick={() => {
                const last = blocks[blocks.length - 1];
                if (last && isText(last) && runsLength(last.runs) === 0) focusBlock(last.id, 'start');
                else {
                  const nb = emptyText();
                  pending.current = { id: nb.id, start: 0, end: 0 };
                  commit([...blocksRef.current, nb]);
                }
              }}
            >
              + {t('docCreate.editor.addBlock')}
            </button>
          </article>
        )}
        <p className="mx-auto mt-3 max-w-[52rem] px-1 text-center text-xs text-muted">{t('docCreate.editor.hint')}</p>
      </div>
    </div>,
    document.body,
  );
}
