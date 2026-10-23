import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { toastDriveError } from '../api';
import { WORKFLOW_STAGES, type StaffPerson, type WorkflowStage } from '../types';
import { TAG_TONE, fetchTags, orgKeys, type SmartFolder, type SmartQuery } from './api';
import { STAGE_TONE } from './SmallDialogs';

const TYPES = ['pdf', 'image', 'word', 'excel', 'presentation', 'archive', 'text', 'folder'] as const;

const toggle = <T,>(list: T[] | undefined, v: T) => {
  const l = list ?? [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
};

/**
 * Save the current search / filter as a smart folder ("Ağıllı qovluq"), private or shared with the team, or
 * edit one. Words match names and tag names; tags / stages / words combine with "all" or "any".
 */
export default function SmartFolderDialog({
  initial,
  folder,
  canShare,
  existing,
  onClose,
  onSaved,
}: {
  initial?: SmartQuery;
  /** The folder the explorer shows ("only below this folder"). */
  folder?: { id: string; name: string } | null;
  canShare: boolean;
  existing?: SmartFolder | null;
  onClose: () => void;
  onSaved: (f: SmartFolder) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? '');
  const [shared, setShared] = useState(existing?.shared ?? false);
  const [query, setQuery] = useState<SmartQuery>(existing?.query ?? initial ?? {});
  const [words, setWords] = useState((existing?.query.words ?? initial?.words ?? []).join(', '));
  const tags = useQuery({ queryKey: orgKeys.tags, queryFn: fetchTags, staleTime: 60_000 });
  const people = useQuery({ queryKey: ['drive', 'people', ''], queryFn: async () => (await api.get<{ people: StaffPerson[] }>('/drive/people')).data.people, staleTime: 300_000 });

  const save = useMutation({
    mutationFn: async () => {
      const q: SmartQuery = { ...query, words: words.split(',').map((w) => w.trim()).filter(Boolean) };
      for (const k of Object.keys(q) as (keyof SmartQuery)[]) {
        const v = q[k];
        if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete q[k];
      }
      const body = { name: name.trim(), shared, query: q };
      return existing
        ? (await api.patch<{ item: SmartFolder }>(`/drive/smart-folders/${encodeURIComponent(existing.id)}`, body)).data.item
        : (await api.post<{ item: SmartFolder }>('/drive/smart-folders', body)).data.item;
    },
    onSuccess: (f) => {
      toast.success(t('driveOrg.smart.saved'));
      void qc.invalidateQueries({ queryKey: orgKeys.smart });
      onSaved(f);
    },
    onError: toastDriveError,
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/drive/smart-folders/${encodeURIComponent(existing!.id)}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.smart });
      onClose();
    },
    onError: toastDriveError,
  });

  const chip = (on: boolean) => clsx('rounded-full border px-2 py-0.5 text-xs font-semibold', on ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'border-line text-muted hover:text-ink');

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={existing ? t('driveOrg.smart.editTitle') : t('driveOrg.smart.saveTitle')}
      footer={
        <>
          {existing?.canEdit && (
            <button type="button" className="btn-white btn-sm mr-auto border border-line text-danger" onClick={() => window.confirm(t('driveOrg.smart.deleteConfirm', { name: existing.name })) && remove.mutate()}>
              <Trash2 className="size-4" /> {t('driveOrg.common.delete')}
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('driveOrg.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
            {t('driveOrg.common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-semibold text-ink">{t('driveOrg.smart.name')}</span>
          <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t('driveOrg.smart.namePlaceholder')} data-autofocus />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-ink">{t('driveOrg.smart.words')}</span>
          <input className="input" value={words} onChange={(e) => setWords(e.target.value)} placeholder="Pasport, Reisepass" />
          <span className="mt-1 block text-xs text-muted">{t('driveOrg.smart.wordsHint')}</span>
        </label>
        <div>
          <span className="mb-1 block font-semibold text-ink">{t('driveOrg.smart.tags')}</span>
          <div className="flex flex-wrap gap-1">
            {(tags.data?.tags ?? []).map((tg) => (
              <button key={tg.id} type="button" onClick={() => setQuery((q) => ({ ...q, tagIds: toggle(q.tagIds, tg.id) }))} className={clsx('rounded px-1.5 py-0.5 text-xs font-semibold ring-offset-1', TAG_TONE[tg.color], query.tagIds?.includes(tg.id) ? 'ring-2 ring-brand-500' : 'opacity-60')} aria-pressed={!!query.tagIds?.includes(tg.id)}>
                {tg.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block font-semibold text-ink">{t('driveOrg.smart.stages')}</span>
          <div className="flex flex-wrap gap-1">
            {WORKFLOW_STAGES.map((s: WorkflowStage) => (
              <button key={s} type="button" onClick={() => setQuery((q) => ({ ...q, stages: toggle(q.stages, s) }))} className={clsx('rounded px-1.5 py-0.5 text-xs font-semibold ring-offset-1', STAGE_TONE[s], query.stages?.includes(s) ? 'ring-2 ring-brand-500' : 'opacity-60')} aria-pressed={!!query.stages?.includes(s)}>
                {t(`driveOrg.stage.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t('driveOrg.smart.match')}
          <select className="input !w-auto !py-1 !text-xs" value={query.match ?? 'all'} onChange={(e) => setQuery((q) => ({ ...q, match: e.target.value as 'all' | 'any' }))}>
            <option value="all">{t('driveOrg.smart.matchAll')}</option>
            <option value="any">{t('driveOrg.smart.matchAny')}</option>
          </select>
        </label>
        <div>
          <span className="mb-1 block font-semibold text-ink">{t('driveOrg.smart.types')}</span>
          <div className="flex flex-wrap gap-1">
            {TYPES.map((k) => (
              <button key={k} type="button" className={chip(!!query.types?.includes(k))} onClick={() => setQuery((q) => ({ ...q, types: toggle(q.types, k) }))} aria-pressed={!!query.types?.includes(k)}>
                {t(`drive.types.${k}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-semibold text-ink">{t('driveOrg.smart.within')}</span>
            <select className="input" value={query.uploadedWithinDays ?? ''} onChange={(e) => setQuery((q) => ({ ...q, uploadedWithinDays: e.target.value ? Number(e.target.value) : undefined }))}>
              <option value="">{t('driveOrg.smart.anyTime')}</option>
              {[1, 7, 30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  {t('driveOrg.smart.days', { count: d })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-ink">{t('driveOrg.smart.uploadedBy')}</span>
            <select className="input" value={query.uploadedById ?? ''} onChange={(e) => setQuery((q) => ({ ...q, uploadedById: e.target.value || undefined }))}>
              <option value="">{t('driveOrg.board.anyone')}</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.firstName} ${p.lastName}`.trim()}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(folder || query.folderId) && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-brand-600" checked={!!query.folderId} onChange={(e) => setQuery((q) => ({ ...q, folderId: e.target.checked ? (folder?.id ?? q.folderId) : undefined }))} />
            {t('driveOrg.smart.onlyBelow', { name: folder?.name ?? '…' })}
          </label>
        )}
        <label className={clsx('flex items-center gap-2', !canShare && 'opacity-60')}>
          <input type="checkbox" className="size-4 accent-brand-600" checked={shared} disabled={!canShare} onChange={(e) => setShared(e.target.checked)} />
          {t('driveOrg.smart.shared')}
        </label>
      </div>
    </Modal>
  );
}
