import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Lock, LockOpen } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { invalidateDrive, reportBatch, toastDriveError } from '../api';
import { WORKFLOW_STAGES, type DriveItem, type WorkflowStage } from '../types';
import { markFinal, setStage, unmarkFinal, type DuplicateRef } from './api';

export const STAGE_TONE: Record<WorkflowStage, string> = toneClasses(STATUS_TONES.driveStage);

/** Workflow column for the selected files (keyboard-friendly alternative to dragging cards). */
export const StageDialog = ({ items, onClose }: { items: DriveItem[]; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const current = items.length === 1 ? (items[0].workflowStage ?? null) : null;
  const [stage, setValue] = useState<WorkflowStage | null>(current ?? 'INCOMING');
  const save = useMutation({
    mutationFn: () => setStage(items.map((i) => i.id), stage),
    onSuccess: (r) => {
      reportBatch(r.results, 'driveOrg.stage.moved');
      void invalidateDrive(qc);
      onClose();
    },
    onError: toastDriveError,
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('driveOrg.stage.dialogTitle', { count: items.length })}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('driveOrg.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {t('driveOrg.common.save')}
          </button>
        </>
      }
    >
      <div role="radiogroup" className="space-y-1">
        {[...WORKFLOW_STAGES, null].map((s) => (
          <label key={s ?? 'none'} className={clsx('flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface', stage === s && 'bg-surface')}>
            <input type="radio" name="stage" className="accent-brand-600" checked={stage === s} onChange={() => setValue(s)} />
            {s ? <span className={clsx('rounded px-1.5 py-0.5 text-xs font-semibold', STAGE_TONE[s])}>{t(`driveOrg.stage.${s}`)}</span> : <span className="text-sm text-muted">{t('driveOrg.stage.none')}</span>}
          </label>
        ))}
      </div>
    </Modal>
  );
};

/** "Final kimi işarələ" (everyone with edit) or lifting it (super admins, with a reason). */
export const FinalDialog = ({ items, mode, onClose }: { items: DriveItem[]; mode: 'set' | 'unset'; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: () => (mode === 'set' ? markFinal(items.map((i) => i.id)) : unmarkFinal(items.map((i) => i.id), reason.trim())),
    onSuccess: (results) => {
      reportBatch(results, mode === 'set' ? 'driveOrg.final.marked' : 'driveOrg.final.unmarked');
      void invalidateDrive(qc);
      onClose();
    },
    onError: toastDriveError,
  });
  const folders = items.some((i) => i.kind === 'FOLDER');
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={mode === 'set' ? t('driveOrg.final.setTitle', { count: items.length }) : t('driveOrg.final.unsetTitle', { count: items.length })}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('driveOrg.common.cancel')}
          </button>
          <button type="button" className={mode === 'set' ? 'btn-primary btn-sm' : 'btn-danger btn-sm'} disabled={run.isPending || (mode === 'unset' && reason.trim().length < 3)} onClick={() => run.mutate()}>
            {mode === 'set' ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
            {mode === 'set' ? t('driveOrg.final.set') : t('driveOrg.final.unset')}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">{mode === 'set' ? t('driveOrg.final.setBody') : t('driveOrg.final.unsetBody')}</p>
      {mode === 'set' && folders && <p className="mt-2 text-sm text-muted">{t('driveOrg.final.folderHint')}</p>}
      <ul className="mt-2 max-h-32 overflow-y-auto text-sm font-medium text-ink">
        {items.slice(0, 20).map((i) => (
          <li key={i.id} className="truncate">
            • {i.name}
          </li>
        ))}
      </ul>
      {mode === 'unset' && (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-semibold text-ink">{t('driveOrg.final.reason')}</span>
          <textarea className="input min-h-20" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t('driveOrg.final.reasonHint')} />
        </label>
      )}
    </Modal>
  );
};

/**
 * After an upload whose content already exists elsewhere: "Bu fayl artıq «Erstdokumente» qovluğunda var" —
 * keep it anyway, delete the upload, or go to the existing file. Never blocks on its own.
 */
export const DuplicateDialog = ({
  upload,
  duplicates,
  onClose,
  onDeleteUpload,
  onOpenExisting,
}: {
  upload: DriveItem;
  duplicates: DuplicateRef[];
  onClose: () => void;
  onDeleteUpload: () => Promise<void>;
  onOpenExisting: (d: DuplicateRef) => void;
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const first = duplicates[0];
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('driveOrg.duplicates.uploadTitle')}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary btn-sm text-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDeleteUpload();
                toast.success(t('driveOrg.duplicates.uploadDeleted'));
                onClose();
              } catch (err) {
                toastDriveError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('driveOrg.duplicates.deleteUpload')}
          </button>
          <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => onOpenExisting(first)}>
            {t('driveOrg.duplicates.goExisting')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={onClose}>
            {t('driveOrg.duplicates.keep')}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink">{t('driveOrg.duplicates.uploadBody', { name: upload.name, folder: first?.folderName ?? '—' })}</p>
      <ul className="mt-3 space-y-1.5">
        {duplicates.map((d) => (
          <li key={d.id} className="rounded-lg border border-line px-2.5 py-1.5 text-xs">
            <span className="block truncate font-semibold text-ink">{d.name}</span>
            <span className="block truncate text-muted" title={d.path}>
              {d.path}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
};
