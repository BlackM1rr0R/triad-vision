import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { TONE_CLASS } from '@/components/ui/status';
import { useStaffOptions } from '@/components/inline/CaseInlineCells';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/components/admin/labels';
import { PROCESSING_STAGES, STAGE_TONE, stageLabel, useMoveStage, type ProcessingStage, type ProcessingSummary } from './api';

/** "Schon geschrieben" etc. as a small badge; the local explanation as the tooltip. */
export const StageBadge = ({ stage, className }: { stage: ProcessingStage | null | undefined; className?: string }) => {
  const { t } = useTranslation();
  if (!stage) return <span className={clsx('text-xs text-muted', className)}>—</span>;
  return (
    <span className={clsx('badge whitespace-nowrap', TONE_CLASS[STAGE_TONE[stage]], className)} title={t(`caseProcessing.hints.${stage}`)}>
      {stageLabel(stage)}
    </span>
  );
};

/** List cell: the stage, who moved it and when, and the next assignee. */
export const StageCell = ({ p }: { p: ProcessingSummary | null | undefined }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!p?.stage) return <span className="text-xs text-muted">—</span>;
  const mine = !!p.assignee && p.assignee.id === user?.id;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StageBadge stage={p.stage} />
      {p.by && p.at && <span className="text-[11px] whitespace-nowrap text-muted">{t('caseProcessing.movedBy', { name: p.by.name, date: fmtDateTime(p.at) })}</span>}
      {p.assignee && (
        <span className={clsx('text-[11px] font-medium whitespace-nowrap', mine ? 'text-link' : 'text-ink/80')}>{t('caseProcessing.assignedTo', { name: p.assignee.name })}</span>
      )}
    </span>
  );
};

/** Change the stage (with the next assignee and a note). `initial` preselects the suggested next stage. */
export const MoveStageDialog = ({ caseId, open, onClose, current, initial }: { caseId: string; open: boolean; onClose: () => void; current: ProcessingStage | null; initial?: ProcessingStage }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const staff = useStaffOptions();
  const move = useMoveStage(caseId);
  const [stage, setStage] = useState<ProcessingStage>(initial ?? 'WRITTEN');
  const [assigneeId, setAssigneeId] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setStage(initial ?? (current === 'WRITTEN' ? 'DONE' : 'WRITTEN'));
    setAssigneeId('');
    setNote('');
  }, [open, initial, current]);
  const submit = () => move.mutate({ stage, assigneeId: assigneeId || null, note: note.trim() || null }, { onSuccess: onClose });
  return (
    <Modal
      open={open}
      onClose={() => !move.isPending && onClose()}
      title={t('caseProcessing.moveTitle')}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={move.isPending}>
            {t('caseProcessing.cancel')}
          </button>
          <button type="submit" form={`processing-move-${caseId}`} className="btn-primary btn-sm" disabled={move.isPending}>
            {move.isPending && <Spinner className="size-3.5" />} {t('caseProcessing.save')}
          </button>
        </div>
      }
    >
      <form
        id={`processing-move-${caseId}`}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset>
          <legend className="label">{t('caseProcessing.stage')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PROCESSING_STAGES.map((s) => (
              <label
                key={s}
                className={clsx(
                  'flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition',
                  stage === s ? 'border-primary bg-primary/[0.06] shadow-[inset_0_0_0_1px_var(--color-brand-600)]' : 'border-line hover:border-line-strong',
                )}
              >
                <input type="radio" name="stage" className="mt-1" checked={stage === s} onChange={() => setStage(s)} />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    {stageLabel(s)}
                    {current === s && <span className="ml-1 text-xs font-normal text-muted">✓</span>}
                  </span>
                  <span className="block text-xs text-muted">{t(`caseProcessing.hints.${s}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="label">{t('caseProcessing.assignee')}</span>
          <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{t('caseProcessing.assigneeNone')}</option>
            {(staff.data ?? [])
              .filter((s) => s.id !== user?.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {`${s.firstName} ${s.lastName}`.trim()}
                </option>
              ))}
          </select>
          <span className="mt-1 block text-xs text-muted">{t('caseProcessing.assigneeHint')}</span>
        </label>
        <label className="block">
          <span className="label">{t('caseProcessing.note')}</span>
          <textarea className="input min-h-20" maxLength={2000} placeholder={t('caseProcessing.notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {stage === 'REFUSED' && <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{t('caseProcessing.refusedNote')}</p>}
      </form>
    </Modal>
  );
};
