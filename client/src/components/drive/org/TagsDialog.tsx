import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, Minus, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { invalidateDrive, reportBatch, toastDriveError } from '../api';
import type { DriveItem } from '../types';
import { TAG_COLORS, TAG_DOT, TAG_TONE, applyTags, fetchTags, orgKeys, type Tag } from './api';
import { confirmDialog } from '@/components/ui/ConfirmHost';

const ColorPicker = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('driveOrg.tags.color')}>
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          title={t(`drive.colors.${c}`)}
          onClick={() => onChange(c)}
          className={clsx('size-5 rounded-full ring-offset-2 ring-offset-card', TAG_DOT[c], value === c && 'ring-2 ring-focus')}
        />
      ))}
    </div>
  );
};

/**
 * Tags of the selection ("Etiketlər"): tick / untick for one or many items (a dash = only some have it).
 * Admins also create, rename, recolour and delete tags here (`manage`).
 */
export default function TagsDialog({ items, manage, onClose }: { items: DriveItem[]; manage?: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tags = useQuery({ queryKey: orgKeys.tags, queryFn: fetchTags, staleTime: 60_000 });
  const list = tags.data?.tags ?? [];
  const canManage = !!tags.data?.canManage;
  const initial = useMemo(() => {
    const m = new Map<string, 'all' | 'some' | 'none'>();
    for (const tag of list) {
      const n = items.filter((i) => i.tags?.some((x) => x.id === tag.id)).length;
      m.set(tag.id, n === 0 ? 'none' : n === items.length ? 'all' : 'some');
    }
    return m;
  }, [list, items]);
  const [state, setState] = useState<Map<string, 'all' | 'some' | 'none'>>(new Map());
  useEffect(() => setState(new Map(initial)), [initial]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('amber');
  const [edit, setEdit] = useState<Record<string, { name: string; color: string }>>({});

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: orgKeys.tags });
    void invalidateDrive(qc);
  };
  const save = useMutation({
    mutationFn: async () => {
      const add = [...state].filter(([id, v]) => v === 'all' && initial.get(id) !== 'all').map(([id]) => id);
      const remove = [...state].filter(([id, v]) => v === 'none' && initial.get(id) !== 'none').map(([id]) => id);
      if (!add.length && !remove.length) return null;
      return applyTags(items.map((i) => i.id), add, remove);
    },
    onSuccess: (r) => {
      if (r) reportBatch(r.results, 'driveOrg.tags.applied');
      refresh();
      onClose();
    },
    onError: toastDriveError,
  });
  const create = useMutation({
    mutationFn: async () => (await api.post<{ tag: Tag }>('/drive/tags', { name: newName.trim(), color: newColor })).data.tag,
    onSuccess: (tag) => {
      setNewName('');
      if (items.length) setState((s) => new Map(s).set(tag.id, 'all'));
      toast.success(t('driveOrg.tags.created'));
      refresh();
    },
    onError: toastDriveError,
  });
  const update = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => api.patch(`/drive/tags/${encodeURIComponent(id)}`, { name, color }),
    onSuccess: (_r, v) => {
      setEdit((e) => {
        const next = { ...e };
        delete next[v.id];
        return next;
      });
      refresh();
    },
    onError: toastDriveError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/drive/tags/${encodeURIComponent(id)}`),
    onSuccess: refresh,
    onError: toastDriveError,
  });

  const toggle = (id: string) => setState((s) => new Map(s).set(id, s.get(id) === 'all' ? 'none' : 'all'));
  const managing = manage && canManage;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={managing ? t('driveOrg.tags.manageTitle') : t('driveOrg.tags.title', { count: items.length })}
      footer={
        managing ? (
          <button type="button" className="btn-primary btn-sm" onClick={onClose}>
            {t('driveOrg.common.done')}
          </button>
        ) : (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
              {t('driveOrg.common.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {t('driveOrg.common.save')}
            </button>
          </>
        )
      }
    >
      <ul className="space-y-1">
        {list.map((tag) =>
          managing ? (
            <li key={tag.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1.5">
              {edit[tag.id] ? (
                <>
                  <input
                    className="input !h-8 min-w-0 flex-1 !py-0 text-sm"
                    value={edit[tag.id].name}
                    maxLength={60}
                    onChange={(e) => setEdit((x) => ({ ...x, [tag.id]: { ...x[tag.id], name: e.target.value } }))}
                    aria-label={t('driveOrg.tags.name')}
                  />
                  <ColorPicker value={edit[tag.id].color} onChange={(c) => setEdit((x) => ({ ...x, [tag.id]: { ...x[tag.id], color: c } }))} />
                  <button type="button" className="btn-primary btn-sm" disabled={!edit[tag.id].name.trim() || update.isPending} onClick={() => update.mutate({ id: tag.id, ...edit[tag.id], name: edit[tag.id].name.trim() })}>
                    {t('driveOrg.common.save')}
                  </button>
                </>
              ) : (
                <>
                  <span className={clsx('rounded px-1.5 py-0.5 text-xs font-semibold', TAG_TONE[tag.color])}>{tag.name}</span>
                  <span className="flex-1" />
                  <button type="button" className="text-xs font-semibold text-link hover:underline dark:text-brand-300" onClick={() => setEdit((x) => ({ ...x, [tag.id]: { name: tag.name, color: tag.color } }))}>
                    {t('driveOrg.common.edit')}
                  </button>
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-danger-fg"
                    aria-label={t('driveOrg.common.delete')}
                    onClick={async () => (await confirmDialog({ message: t('driveOrg.tags.deleteConfirm', { name: tag.name }), confirmLabel: t('ui.confirmDlg.delete') })) && remove.mutate(tag.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </li>
          ) : (
            <li key={tag.id}>
              <button type="button" onClick={() => toggle(tag.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sunken" aria-pressed={state.get(tag.id) === 'all'}>
                <span className={clsx('grid size-4 shrink-0 place-items-center rounded border', state.get(tag.id) === 'none' ? 'border-line' : 'border-primary bg-primary text-primary-contrast')}>
                  {state.get(tag.id) === 'all' ? <Check className="size-3" /> : state.get(tag.id) === 'some' ? <Minus className="size-3" /> : null}
                </span>
                <span className={clsx('rounded px-1.5 py-0.5 text-xs font-semibold', TAG_TONE[tag.color])}>{tag.name}</span>
              </button>
            </li>
          ),
        )}
        {!list.length && !tags.isLoading && <li className="text-sm text-muted">{t('driveOrg.tags.none')}</li>}
      </ul>
      {canManage && (
        <form
          className="mt-3 space-y-2 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate();
          }}
        >
          <p className="text-xs font-semibold text-muted">{t('driveOrg.tags.newTag')}</p>
          <div className="flex items-center gap-2">
            <input className="input !h-8 min-w-0 flex-1 !py-0 text-sm" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder={t('driveOrg.tags.name')} aria-label={t('driveOrg.tags.name')} />
            <button type="submit" className="btn-secondary btn-sm" disabled={!newName.trim() || create.isPending}>
              <Plus className="size-4" /> {t('driveOrg.common.add')}
            </button>
          </div>
          <ColorPicker value={newColor} onChange={setNewColor} />
        </form>
      )}
    </Modal>
  );
}
