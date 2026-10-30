import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { GripVertical, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { NOTE_COLORS, type Note, type NoteColor, useWorkspaceInvalidate } from './api';
import { Card, Empty, IconButton, Skeleton, errorText } from './ui';
import { confirmDialog } from '@/components/ui/ConfirmHost';

/** Sticky-note tints: readable on both themes (text stays dark on the pastel). */
const TONE: Record<NoteColor, string> = {
  yellow: 'bg-amber-100 text-amber-950 border-amber-200',
  green: 'bg-emerald-100 text-emerald-950 border-emerald-200',
  blue: 'bg-sky-100 text-sky-950 border-sky-200',
  pink: 'bg-pink-100 text-pink-950 border-pink-200',
  purple: 'bg-violet-100 text-violet-950 border-violet-200',
};
const DOT: Record<NoteColor, string> = { yellow: 'bg-amber-400', green: 'bg-emerald-400', blue: 'bg-sky-400', pink: 'bg-pink-400', purple: 'bg-violet-400' };

const colorOf = (n: Note): NoteColor => (n.color && NOTE_COLORS.includes(n.color) ? n.color : 'yellow');

/** Edits are saved on blur (debounced while typing), so the board never needs a save button. */
const NoteCard = ({ note, onDragStart, onDragOver, onDrop, dragging }: { note: Note; onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void; dragging: boolean }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [title, setTitle] = useState(note.title ?? '');
  const [body, setBody] = useState(note.body);
  const timer = useRef<number>(0);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) {
      setTitle(note.title ?? '');
      setBody(note.body);
    }
  }, [note.title, note.body]);

  const save = async (patch: Partial<Pick<Note, 'title' | 'body' | 'color' | 'pinned'>>) => {
    try {
      await api.patch(`/workspace/notes/${note.id}`, patch);
      dirty.current = false;
      inv.notes();
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const queue = (next: { title: string; body: string }) => {
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save({ title: next.title.trim() || null, body: next.body }), 900);
  };
  const flush = () => {
    if (!dirty.current) return;
    window.clearTimeout(timer.current);
    void save({ title: title.trim() || null, body });
  };
  const remove = async () => {
    if ((note.body.trim() || note.title) && !(await confirmDialog({ title: note.title ? t('ui.confirmDlg.deleteTitle', { name: note.title }) : undefined, message: t('ws.common.confirmDelete'), confirmLabel: t('ui.confirmDlg.delete') }))) return;
    try {
      await api.delete(`/workspace/notes/${note.id}`);
      toast.success(t('ws.notes.deleted'));
      inv.notes();
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const color = colorOf(note);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={clsx('group flex flex-col rounded-xl border p-3 shadow-sm transition', TONE[color], dragging && 'opacity-40', note.pinned && 'ring-2 ring-brand-500/40')}
    >
      <div className="mb-1 flex items-center gap-1">
        <span className="cursor-grab text-current/40 active:cursor-grabbing" title={t('ws.notes.drag')} aria-hidden>
          <GripVertical className="size-4" />
        </span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            queue({ title: e.target.value, body });
          }}
          onBlur={flush}
          maxLength={120}
          placeholder={t('ws.notes.ph.title')}
          aria-label={t('ws.notes.ph.title')}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-current/40"
        />
        <div className="flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton icon={note.pinned ? PinOff : Pin} label={note.pinned ? t('ws.notes.unpin') : t('ws.notes.pin')} onClick={() => void save({ pinned: !note.pinned })} className="size-7 text-current hover:bg-black/10 hover:text-current" />
          <IconButton icon={Trash2} label={t('ws.common.delete')} onClick={() => void remove()} className="size-7 text-current hover:bg-black/10 hover:text-current" />
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          queue({ title, body: e.target.value });
        }}
        onBlur={flush}
        rows={4}
        maxLength={10000}
        placeholder={t('ws.notes.ph.body')}
        aria-label={t('ws.notes.ph.body')}
        className="min-h-20 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-current/40"
      />
      <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label={t('ws.notes.color')}>
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            title={t(`ws.notes.colors.${c}`)}
            onClick={() => void save({ color: c })}
            className={clsx('size-4 rounded-full border border-black/10 transition', DOT[c], c === color ? 'scale-110 ring-2 ring-current/40' : 'opacity-60 hover:opacity-100')}
          />
        ))}
      </div>
    </div>
  );
};

export const NotesBoard = ({ notes, loading }: { notes: Note[] | undefined; loading: boolean }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => setOrder(null), [notes]);
  const list = notes ? (order ? order.map((id) => notes.find((n) => n.id === id)!).filter(Boolean) : notes) : [];

  const add = async () => {
    if (adding) return;
    setAdding(true);
    try {
      await api.post('/workspace/notes', { body: '', color: NOTE_COLORS[(notes?.length ?? 0) % NOTE_COLORS.length] });
      inv.notes();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setAdding(false);
    }
  };

  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    const ids = (order ?? list.map((n) => n.id)).slice();
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setOrder(ids);
  };
  const onDrop = async () => {
    const ids = order;
    setDragId(null);
    if (!ids) return;
    try {
      // Pinned notes always sort first on the server; the request order is kept within each group.
      await api.post('/workspace/notes/reorder', { ids });
      inv.notes();
    } catch (err) {
      toast.error(errorText(err));
      setOrder(null);
    }
  };

  return (
    <Card
      icon={StickyNote}
      title={t('ws.notes.title')}
      actions={
        <button type="button" onClick={() => void add()} disabled={adding} className="btn-secondary btn-sm h-8 border border-line px-3">
          <Plus className="size-4" /> {t('ws.notes.add')}
        </button>
      }
    >
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : !list.length ? (
        <Empty icon={StickyNote}>{t('ws.notes.empty')}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((n) => (
            <NoteCard key={n.id} note={n} dragging={dragId === n.id} onDragStart={() => setDragId(n.id)} onDragOver={(e) => onDragOver(e, n.id)} onDrop={() => void onDrop()} />
          ))}
        </div>
      )}
    </Card>
  );
};
