import { useState } from 'react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, GripVertical, Plus, X } from 'lucide-react';
import type { ChecklistItem, TaskDetail } from './types';
import { taskKeys, useTaskActions } from './api';
import { ProgressBar } from './bits';
import { errorText } from './utils';

/** Checklist with progress, optimistic toggles, inline editing and drag-to-reorder. */
export const Checklist = ({ taskRef, items, canEdit }: { taskRef: string; items: ChecklistItem[]; canEdit: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const actions = useTaskActions();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const done = items.filter((i) => i.done).length;

  const setLocal = (next: ChecklistItem[]) => qc.setQueryData<TaskDetail>(taskKeys.detail(taskRef), (old) => (old ? { ...old, checklist: next } : old));
  const run = async (optimistic: ChecklistItem[] | null, call: () => Promise<unknown>) => {
    const before = items;
    if (optimistic) setLocal(optimistic);
    try {
      await call();
    } catch (err) {
      setLocal(before);
      toast.error(errorText(err));
    }
  };

  const add = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    await run([...items, { id: `tmp-${Date.now()}`, text: value, done: false, sortOrder: items.length }], () => actions.checklistAdd(taskRef, value));
  };

  const saveEdit = async () => {
    if (!editing) return;
    const value = editing.text.trim();
    const id = editing.id;
    setEditing(null);
    const item = items.find((i) => i.id === id);
    if (!value || !item || item.text === value) return;
    await run(items.map((i) => (i.id === id ? { ...i, text: value } : i)), () => actions.checklistUpdate(taskRef, id, { text: value }));
  };

  const drop = async (targetId: string) => {
    const from = items.findIndex((i) => i.id === dragId);
    const to = items.findIndex((i) => i.id === targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    await run(next, () => actions.checklistOrder(taskRef, next.map((i) => i.id)));
  };

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <ProgressBar done={done} total={items.length} className="flex-1" />
          <span className="text-xs font-semibold text-muted tabular-nums">{t('tasks.panel.progress', { done, total: items.length })}</span>
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li
            key={item.id}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (overId !== item.id) setOverId(item.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              void drop(item.id);
            }}
            className={clsx('group flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface', overId === item.id && dragId !== item.id && 'ring-2 ring-brand-400', dragId === item.id && 'opacity-40')}
          >
            {canEdit && (
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', item.id);
                  setDragId(item.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                className="hidden cursor-grab text-muted/60 group-hover:block active:cursor-grabbing"
                aria-hidden
              >
                <GripVertical className="size-3.5" />
              </span>
            )}
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              disabled={!canEdit || item.id.startsWith('tmp-')}
              onClick={() => void run(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)), () => actions.checklistUpdate(taskRef, item.id, { done: !item.done }))}
              className={clsx(
                'grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors disabled:cursor-default',
                item.done ? 'border-success bg-success text-white' : 'border-line bg-field hover:border-brand-500',
              )}
              aria-label={item.text}
            >
              {item.done && <Check className="size-3.5" strokeWidth={3} />}
            </button>
            {editing?.id === item.id ? (
              <input
                autoFocus
                value={editing.text}
                maxLength={300}
                onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                onBlur={() => void saveEdit()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveEdit();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditing(null);
                  }
                }}
                className="input min-w-0 flex-1 py-1"
              />
            ) : (
              <span
                onClick={() => canEdit && !item.id.startsWith('tmp-') && setEditing({ id: item.id, text: item.text })}
                className={clsx('min-w-0 flex-1 py-0.5 text-sm break-words', item.done ? 'text-muted line-through decoration-1' : 'text-ink', canEdit && 'cursor-text')}
              >
                {item.text}
              </span>
            )}
            {canEdit && !item.id.startsWith('tmp-') && (
              <button
                type="button"
                onClick={() => void run(items.filter((i) => i.id !== item.id), () => actions.checklistDelete(taskRef, item.id))}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted opacity-100 transition hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                aria-label={`${t('tasks.actions.remove')}: ${item.text}`}
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!items.length && <p className="mb-2 text-sm text-muted">{t('tasks.empty.checklist')}</p>}
      {canEdit && (
        <div className="mt-2 flex items-center gap-2">
          <Plus className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            value={text}
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
            placeholder={t('tasks.ph.checklist')}
            aria-label={t('tasks.ph.checklist')}
            className="input py-2"
          />
        </div>
      )}
    </div>
  );
};
