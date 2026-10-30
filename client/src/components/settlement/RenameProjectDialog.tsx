import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { Modal } from './Modal';

/** Rename a sheet (project) of the ledger: PATCH /admin/settlements/projects { from, to } (ADMIN+, audited). */
export const RenameProjectDialog = ({ name, onClose, onRenamed }: { name: string; onClose: () => void; onRenamed: (to: string) => void }) => {
  const { t } = useTranslation();
  const [to, setTo] = useState(name);
  const [busy, setBusy] = useState(false);
  const next = to.trim();
  const save = async () => {
    if (!next || next === name) return;
    setBusy(true);
    try {
      const { data } = await api.patch<{ renamed: number }>('/admin/settlements/projects', { from: name, to: next });
      toast.success(t('settlement.rename.done', { count: data.renamed, to: next }));
      onRenamed(next);
      onClose();
    } catch (err) {
      toast.error(errorCode(err) === 'PROJECT_NOT_FOUND' ? t('settlement.rename.notFound') : t('settlement.errors.generic'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('settlement.rename.title', { name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={busy || !next || next === name} onClick={() => void save()}>
            {t('settlement.rename.save')}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="block text-sm font-medium text-ink">
          {t('settlement.rename.label')}
          <input className="input mt-1" value={to} maxLength={80} autoFocus onChange={(e) => setTo(e.target.value)} />
        </label>
        <p className="mt-2 text-xs text-muted">{t('settlement.rename.hint')}</p>
      </form>
    </Modal>
  );
};
