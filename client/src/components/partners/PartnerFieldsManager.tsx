import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n from '@/i18n';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { PARTNER_FIELD_TYPES, PARTNER_FIELDS_KEY, PARTNERS_KEY, partnerError, usePartnerFields, type PartnerFieldDef, type PartnerFieldType } from './api';

/**
 * ADMIN+: the extra fields every partner form shows (label, type, options for select lists), in order.
 * Deleting a field removes its values from every partner (the server does that).
 */

interface Draft {
  label: string;
  type: PartnerFieldType;
  options: string;
}

const draftOf = (d?: PartnerFieldDef): Draft => ({ label: d?.label ?? '', type: d?.type ?? 'TEXT', options: d?.options.join(', ') ?? '' });
const optionsOf = (s: string) => [...new Set(s.split(',').map((o) => o.trim()).filter(Boolean))];
const toBody = (d: Draft) => ({ label: d.label.trim(), type: d.type, ...(d.type === 'SELECT' ? { options: optionsOf(d.options) } : {}) });
const draftValid = (d: Draft) => !!d.label.trim() && (d.type !== 'SELECT' || optionsOf(d.options).length > 0);

const onFieldError = (err: unknown) => {
  const code = errorCode(err);
  if (code && i18n.exists(`partnerForm.errors.${code}`)) toast.error(i18n.t(`partnerForm.errors.${code}`));
  else partnerError(err);
};

const DraftInputs = ({ draft, onChange, idPrefix }: { draft: Draft; onChange: (d: Draft) => void; idPrefix: string }) => {
  const { t } = useTranslation();
  return (
    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
      <div>
        <label htmlFor={`${idPrefix}-label`} className="sr-only">
          {t('partnerForm.manager.label')}
        </label>
        <input id={`${idPrefix}-label`} className="input" maxLength={80} placeholder={t('partnerForm.manager.label')} value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-type`} className="sr-only">
          {t('partnerForm.manager.type')}
        </label>
        <select id={`${idPrefix}-type`} className="input" value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value as PartnerFieldType })}>
          {PARTNER_FIELD_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`partnerForm.manager.types.${ty}`)}
            </option>
          ))}
        </select>
      </div>
      {draft.type === 'SELECT' && (
        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-options`} className="text-xs font-semibold text-muted">
            {t('partnerForm.manager.options')}
          </label>
          <input id={`${idPrefix}-options`} className="input" placeholder={t('partnerForm.manager.optionsPh')} value={draft.options} onChange={(e) => onChange({ ...draft, options: e.target.value })} />
        </div>
      )}
    </div>
  );
};

const FieldRow = ({ def, first, last, onMove, onDelete }: { def: PartnerFieldDef; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void; onDelete: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const id = useId();
  const [draft, setDraft] = useState(() => draftOf(def));
  useEffect(() => setDraft(draftOf(def)), [def]);
  const dirty = JSON.stringify(toBody(draft)) !== JSON.stringify(toBody(draftOf(def)));
  const save = useMutation({
    mutationFn: async () => api.patch(`/admin/partners/fields/${def.id}`, toBody(draft)),
    onSuccess: async () => {
      toast.success(t('partnerForm.manager.saved'));
      await qc.invalidateQueries({ queryKey: PARTNER_FIELDS_KEY });
    },
    onError: onFieldError,
  });
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-start">
      <DraftInputs draft={draft} onChange={setDraft} idPrefix={id} />
      <div className="flex shrink-0 gap-1">
        <button type="button" className="btn-primary btn-sm" disabled={!dirty || !draftValid(draft) || save.isPending} onClick={() => save.mutate()} title={t('partnerForm.manager.save')}>
          {save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" aria-hidden />}
          <span className="sr-only">{t('partnerForm.manager.save')}</span>
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={first} onClick={() => onMove(-1)} aria-label={t('partnerForm.manager.moveUp')} title={t('partnerForm.manager.moveUp')}>
          <ArrowUp className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={last} onClick={() => onMove(1)} aria-label={t('partnerForm.manager.moveDown')} title={t('partnerForm.manager.moveDown')}>
          <ArrowDown className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={onDelete} aria-label={t('partnerForm.manager.delete')} title={t('partnerForm.manager.delete')}>
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
};

export const PartnerFieldsManager = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fields = usePartnerFields(open);
  const newId = useId();
  const [draft, setDraft] = useState<Draft>(draftOf());
  const [deleting, setDeleting] = useState<PartnerFieldDef | null>(null);
  useEffect(() => {
    if (open) setDraft(draftOf());
  }, [open]);
  // Values of a changed / deleted field show up on the partner cards too.
  const refresh = () => qc.invalidateQueries({ queryKey: PARTNERS_KEY });
  const add = useMutation({
    mutationFn: async () => api.post('/admin/partners/fields', toBody(draft)),
    onSuccess: async () => {
      toast.success(t('partnerForm.manager.added'));
      setDraft(draftOf());
      await qc.invalidateQueries({ queryKey: PARTNER_FIELDS_KEY });
    },
    onError: onFieldError,
  });
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.put('/admin/partners/fields/order', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARTNER_FIELDS_KEY }),
    onError: onFieldError,
  });
  const remove = useMutation({
    mutationFn: async (d: PartnerFieldDef) => api.delete(`/admin/partners/fields/${d.id}`),
    onSuccess: async () => {
      toast.success(t('partnerForm.manager.deleted'));
      setDeleting(null);
      await refresh();
    },
    onError: onFieldError,
  });
  const list = fields.data ?? [];
  const move = (i: number, dir: -1 | 1) => {
    const ids = list.map((d) => d.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    reorder.mutate(ids);
  };
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={t('partnerForm.manager.title')}
        description={t('partnerForm.manager.subtitle')}
        footer={
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('partnerForm.manager.close')}
          </button>
        }
      >
        {fields.isLoading ? (
          <div className="grid place-items-center py-6">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t('partnerForm.manager.empty')}</p>
        ) : (
          <ul className="space-y-2" aria-busy={reorder.isPending || undefined}>
            {list.map((d, i) => (
              <FieldRow key={d.id} def={d} first={i === 0} last={i === list.length - 1} onMove={(dir) => move(i, dir)} onDelete={() => setDeleting(d)} />
            ))}
          </ul>
        )}
        <form
          className="mt-4 flex flex-col gap-2 rounded-xl border border-dashed border-line p-3 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            if (draftValid(draft) && !add.isPending) add.mutate();
          }}
          aria-label={t('partnerForm.manager.newField')}
        >
          <DraftInputs draft={draft} onChange={setDraft} idPrefix={newId} />
          <button type="submit" className="btn-primary btn-sm shrink-0" disabled={!draftValid(draft) || add.isPending}>
            {add.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" aria-hidden />} {t('partnerForm.manager.add')}
          </button>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        title={t('partnerForm.manager.delete')}
        message={t('partnerForm.manager.deleteConfirm', { label: deleting?.label ?? '' })}
        confirmLabel={t('partnerForm.manager.delete')}
      />
    </>
  );
};
