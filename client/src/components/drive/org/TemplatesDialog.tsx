import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { FolderTree, Plus, Trash2, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { invalidateDrive, toastDriveError } from '../api';
import { fetchTemplates, l10nText, orgKeys, type FolderTemplate } from './api';
import { confirmDialog } from '@/components/ui/ConfirmHost';

const VISA_TYPE_DE: Record<string, string> = {
  WORK: 'Arbeitsvisum',
  AUSBILDUNG: 'Ausbildung',
  WEITERBILDUNG: 'Weiterbildung',
  JOB_SEEKER: 'Jobsuche (Chancenkarte)',
  STUDY: 'Studienvisum',
  FAMILY: 'Familiennachzug',
  TOURIST: 'Besuchervisum',
};

type Draft = { id: string | null; name: string; visaType: string; visaCategoryId: string; folders: string; active: boolean };
const toDraft = (t: FolderTemplate | null): Draft => ({
  id: t?.id ?? null,
  name: t?.name ?? '',
  visaType: t?.visaType ?? '',
  visaCategoryId: t?.visaCategoryId ?? '',
  folders: (t?.folders ?? []).join('\n'),
  active: t?.active ?? true,
});

/**
 * "Qovluq şablonları" (admins): the sub-folders every new client folder gets — per visa type, optionally per
 * category (category > visa type > default). Folder names are German; "a/b" nests. "Apply to existing
 * client folders" only adds what is missing.
 */
export default function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: orgKeys.templates, queryFn: fetchTemplates });
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (!draft && q.data?.items.length) setDraft(toDraft(q.data.items[0]));
  }, [q.data, draft]);
  const refresh = () => void qc.invalidateQueries({ queryKey: orgKeys.templates });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { name: d.name.trim(), visaType: d.visaType || null, visaCategoryId: d.visaCategoryId || null, active: d.active, folders: d.folders.split('\n').map((l) => l.trim()).filter(Boolean) };
      return d.id
        ? (await api.patch<{ item: FolderTemplate }>(`/drive/folder-templates/${encodeURIComponent(d.id)}`, body)).data.item
        : (await api.post<{ item: FolderTemplate }>('/drive/folder-templates', body)).data.item;
    },
    onSuccess: (item) => {
      toast.success(t('driveOrg.templates.saved'));
      setDraft(toDraft(item));
      refresh();
    },
    onError: toastDriveError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/drive/folder-templates/${encodeURIComponent(id)}`),
    onSuccess: () => {
      setDraft(null);
      refresh();
    },
    onError: toastDriveError,
  });
  const apply = useMutation({
    mutationFn: async () => (await api.post<{ folders: number; created: number }>('/drive/folder-templates/apply-existing', {})).data,
    onSuccess: (r) => {
      toast.success(t('driveOrg.templates.applied', { folders: r.folders, created: r.created }));
      void invalidateDrive(qc);
    },
    onError: toastDriveError,
  });

  const items = q.data?.items ?? [];
  const cats = q.data?.categories ?? [];
  const label = (tpl: FolderTemplate) => {
    const cat = cats.find((c) => c.id === tpl.visaCategoryId);
    if (cat) return `${cat.visaLabel} · ${l10nText(cat.title, i18n.language)}`;
    return tpl.visaType ? (VISA_TYPE_DE[tpl.visaType] ?? tpl.visaType) : t('driveOrg.templates.default');
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('driveOrg.templates.title')}
      description={t('driveOrg.templates.intro')}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary btn-sm mr-auto border border-line"
            disabled={apply.isPending}
            onClick={async () => (await confirmDialog({ message: t('driveOrg.templates.applyConfirm'), tone: 'primary', confirmLabel: t('ui.confirmDlg.apply') })) && apply.mutate()}
          >
            {apply.isPending ? <Spinner className="size-4" /> : <Wand2 className="size-4" />} {t('driveOrg.templates.applyExisting')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={onClose}>
            {t('driveOrg.common.done')}
          </button>
        </>
      }
    >
      {q.isLoading ? (
        <Spinner className="size-5" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
          <div>
            <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
              {items.map((tpl) => (
                <li key={tpl.id}>
                  <button
                    type="button"
                    onClick={() => setDraft(toDraft(tpl))}
                    className={clsx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', draft?.id === tpl.id ? 'bg-primary/[0.06] text-ink dark:bg-brand-500/15 dark:text-brand-200' : 'hover:bg-sunken')}
                  >
                    <FolderTree className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block truncate font-medium', !tpl.active && 'text-muted line-through')}>{tpl.name}</span>
                      <span className="block truncate text-[11px] text-muted">{label(tpl)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-secondary btn-sm mt-2 w-full border border-line" onClick={() => setDraft(toDraft(null))}>
              <Plus className="size-4" /> {t('driveOrg.templates.new')}
            </button>
          </div>
          {draft && (
            <form
              className="space-y-3 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
            >
              <label className="block">
                <span className="mb-1 block font-semibold text-ink">{t('driveOrg.templates.name')}</span>
                <input className="input" required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-semibold text-ink">{t('driveOrg.templates.visaType')}</span>
                  <select className="input" value={draft.visaType} onChange={(e) => setDraft({ ...draft, visaType: e.target.value })}>
                    <option value="">{t('driveOrg.templates.anyType')}</option>
                    {(q.data?.visaTypes ?? []).map((v) => (
                      <option key={v} value={v}>
                        {VISA_TYPE_DE[v] ?? v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-semibold text-ink">{t('driveOrg.templates.category')}</span>
                  <select className="input" value={draft.visaCategoryId} onChange={(e) => setDraft({ ...draft, visaCategoryId: e.target.value })}>
                    <option value="">{t('driveOrg.templates.anyCategory')}</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.visaLabel} · {l10nText(c.title, i18n.language)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block font-semibold text-ink">{t('driveOrg.templates.folders')}</span>
                <textarea className="input min-h-40 font-mono text-[13px]" value={draft.folders} onChange={(e) => setDraft({ ...draft, folders: e.target.value })} spellCheck={false} />
                <span className="mt-1 block text-xs text-muted">{t('driveOrg.templates.foldersHint')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-primary" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                {t('driveOrg.templates.active')}
              </label>
              <div className="flex items-center gap-2">
                <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || !draft.name.trim()}>
                  {t('driveOrg.common.save')}
                </button>
                {draft.id && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm text-danger-fg"
                    disabled={remove.isPending}
                    onClick={async () => (await confirmDialog({ message: t('driveOrg.templates.deleteConfirm', { name: draft.name }), confirmLabel: t('ui.confirmDlg.delete') })) && remove.mutate(draft.id!)}
                  >
                    <Trash2 className="size-4" /> {t('driveOrg.common.delete')}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
