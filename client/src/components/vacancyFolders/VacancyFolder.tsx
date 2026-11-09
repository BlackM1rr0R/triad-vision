import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FolderPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { FolderField, FolderLine, toastFolderError, type FolderInfo } from './FolderPicker';

/** Folder choice of a NEW vacancy: a new folder (default in "Stellenangebote"), an existing one, or none for now. */
export interface NewFolderChoice {
  mode: 'new' | 'existing' | 'none';
  folder: FolderInfo | null;
  parent: FolderInfo | null;
  name: string;
}
export const initialFolderChoice = (): NewFolderChoice => ({ mode: 'new', folder: null, parent: null, name: '' });

/** Request fields for POST /admin/vacancies. */
export const folderPayload = (c: NewFolderChoice) =>
  c.mode === 'new'
    ? { newFolder: { parentId: c.parent?.id ?? null, ...(c.name.trim() ? { name: c.name.trim() } : {}) } }
    : c.mode === 'existing' && c.folder
      ? { driveFolderId: c.folder.id }
      : {};

export const NewVacancyFolder = ({ value, onChange }: { value: NewFolderChoice; onChange: (v: NewFolderChoice) => void }) => {
  const { t } = useTranslation();
  const set = (patch: Partial<NewFolderChoice>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="space-y-3 rounded-xl border border-dashed border-primary/25 bg-primary/[0.04] p-4">
      <legend className="px-1 text-sm font-bold text-ink">{t('vacFolders.folder')}</legend>
      <p className="text-xs text-muted">{t('vacFolders.vacancyHint')}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {(['new', 'existing', 'none'] as const).map((m) => (
          <label key={m} className="inline-flex items-center gap-2 font-semibold text-ink">
            <input type="radio" name="vf-mode" className="size-4 accent-primary" checked={value.mode === m} onChange={() => set({ mode: m })} />
            {t(m === 'new' ? 'vacFolders.modeNew' : m === 'existing' ? 'vacFolders.modeExisting' : 'vacFolders.modeNone')}
          </label>
        ))}
      </div>
      {value.mode === 'new' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="vf-name">
              {t('vacFolders.newName')}
            </label>
            <input id="vf-name" className="input" maxLength={200} value={value.name} placeholder={t('vacFolders.newNameAuto')} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <span className="label">{t('vacFolders.newParent')}</span>
            <FolderField value={value.parent} onChange={(f) => set({ parent: f })} empty={t('vacFolders.defaultParent')} clearLabel={t('vacFolders.app.reset')} compact />
          </div>
        </div>
      )}
      {value.mode === 'existing' && <FolderField value={value.folder} onChange={(f) => set({ folder: f })} />}
    </fieldset>
  );
};

/** The folder of an existing vacancy: shown, changed, created or unlinked right away. */
export const VacancyFolderPanel = ({ vacancyId, folder, onSaved }: { vacancyId: string; folder: FolderInfo | null; onSaved: () => void }) => {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: async (body: { driveFolderId?: string | null; newFolder?: Record<string, never> }) => (await api.put<{ folder: FolderInfo | null }>(`/admin/vacancies/${vacancyId}/folder`, body)).data,
    onSuccess: () => {
      toast.success(t('vacFolders.saved'));
      onSaved();
    },
    onError: toastFolderError,
  });
  return (
    <div className="space-y-2">
      <FolderField
        value={folder}
        busy={m.isPending}
        onChange={(f) => m.mutate({ driveFolderId: f?.id ?? null })}
        clearLabel={t('vacFolders.unlink')}
        extra={
          !folder && (
            <button type="button" className="btn-secondary btn-sm" disabled={m.isPending} onClick={() => m.mutate({ newFolder: {} })}>
              <FolderPlus className="size-3.5" aria-hidden /> {t('vacFolders.createDefault')}
            </button>
          )
        }
      />
      <p className="text-xs text-muted">{t('vacFolders.vacancyHint')}</p>
    </div>
  );
};

/** One application: the applicant's folder and the staff override of where it is collected. */
export const ApplicationFolder = ({
  applicationId,
  folder,
  targetFolder,
  vacancyHasFolder,
  onSaved,
}: {
  applicationId: string;
  folder: FolderInfo | null;
  targetFolder: FolderInfo | null;
  vacancyHasFolder: boolean;
  onSaved: () => void;
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const m = useMutation({
    mutationFn: async (folderId: string | null) => (await api.put(`/admin/vacancies/applications/${applicationId}/folder`, { folderId })).data,
    onSuccess: () => {
      toast.success(t('vacFolders.saved'));
      setEditing(false);
      onSaved();
    },
    onError: toastFolderError,
  });
  return (
    <div className="mt-2 space-y-1.5 rounded-md bg-sunken px-2.5 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-muted">{t('vacFolders.app.folder')}:</span>
        <FolderLine folder={folder} compact empty={vacancyHasFolder || targetFolder ? t('vacFolders.pending') : t('vacFolders.app.noVacancyFolder')}>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing((e) => !e)}>
            {t('vacFolders.app.target')}
          </button>
        </FolderLine>
      </div>
      {editing && (
        <FolderField
          compact
          value={targetFolder}
          busy={m.isPending}
          empty={t('vacFolders.app.vacancyDefault')}
          clearLabel={t('vacFolders.app.reset')}
          onChange={(f) => m.mutate(f?.id ?? null)}
        />
      )}
    </div>
  );
};
