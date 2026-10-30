import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ClipboardPen } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/components/admin/labels';
import { TONE_CLASS } from '@/components/ui/status';
import { useProcessing } from '@/components/caseProcessing/api';
import { StageBadge } from '@/components/caseProcessing/parts';
import { flowActions, type FlowAction, type FlowTarget } from '@/components/caseProcessing/flow';
import type { DriveItem } from '../types';
import { ACTION_ICON } from './icons';

/**
 * Strip under the header of an open client folder: the team workflow stage, who sent it and when, who works
 * on it ("Sən işləyirsən" / "X işləyir" / nobody took it yet), the last note and the buttons of the stage.
 * Reads the same query as the case card (GET /admin/cases/:id/processing), so both always agree.
 */
export const ProcessingFolderBar = ({ target, folder, onAct }: { target: FlowTarget; folder: DriveItem; onAct: (a: FlowAction, target: FlowTarget) => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const q = useProcessing(target.caseId);
  const p = q.data;
  const stage = p ? p.stage : target.stage;
  const assignee = p ? p.assignee : null;
  const assigneeId = p ? (p.assignee?.id ?? null) : target.assigneeId;
  const mine = !!assigneeId && assigneeId === user?.id;
  // The freshest state decides the buttons (the drive listing may be a few seconds old).
  const live: FlowTarget = { ...target, stage, assigneeId };
  const actions = flowActions(stage, assigneeId, user?.id);
  if (!stage && !actions.length) return null;
  const note = p?.history.find((h) => h.note)?.note;

  return (
    <div
      className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface/60 px-3 py-2 text-xs sm:px-4', mine && 'shadow-[inset_3px_0_0_var(--color-brand-600)]')}
      aria-label={t('driveProcessing.group')}
      data-folder={folder.id}
    >
      <ClipboardPen className="size-4 shrink-0 text-link" aria-hidden />
      <span className="font-semibold text-ink">{t('driveProcessing.group')}</span>
      <StageBadge stage={stage} />
      {p?.by && p.at && <span className="text-muted">{t('driveProcessing.sentBy', { name: p.by.name, date: fmtDateTime(p.at) })}</span>}
      {stage === 'WRITTEN' || assigneeId ? (
        <span className={clsx('badge', mine ? TONE_CLASS.info : assigneeId ? TONE_CLASS.warning : TONE_CLASS.neutral)}>
          {mine ? t('driveProcessing.you') : assigneeId ? t('driveProcessing.working', { name: assignee?.name ?? '…' }) : t('driveProcessing.unclaimed')}
        </span>
      ) : null}
      {note && (
        <span className="max-w-[28rem] truncate text-ink/80" title={note}>
          “{note}”
        </span>
      )}
      {actions.length > 0 && (
        <div className="ml-auto flex flex-wrap gap-1.5">
          {actions.map((a, i) => {
            const Icon = ACTION_ICON[a];
            return (
              <button
                key={a}
                type="button"
                onClick={() => onAct(a, live)}
                className={clsx('btn-sm', a === 'refuse' ? 'btn-secondary text-danger-fg' : i === 0 ? 'btn-primary' : 'btn-secondary')}
              >
                <Icon className="size-3.5" aria-hidden /> {t(`driveProcessing.actions.${a}`)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
