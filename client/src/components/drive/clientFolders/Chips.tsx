import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Handshake, SendHorizontal, UserRound } from 'lucide-react';
import { STAGE_TONE, stageLabel } from '@/components/caseProcessing/api';
import { useStaffOptions } from '@/components/inline/CaseInlineCells';
import { TONE_CLASS } from '@/components/ui/status';
import { fmtDateTime } from '@/components/admin/labels';
import { useAuth } from '@/lib/auth';
import type { DriveItem } from '../types';
import { targetOf } from './api';

/**
 * Status chips of a client folder tile / row, readable without opening the folder: the team workflow stage
 * (Schon geschrieben · In Bearbeitung · Fertig · Ablehnung, coloured like everywhere else) with who works on it,
 * the partner, and "Müştəriyə göndərilib" once the Fertig documents went to the client.
 */
export const ClientFolderChips = ({ item, compact, className }: { item: DriveItem; compact?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const staff = useStaffOptions();
  const x = targetOf(item);
  if (!x) return null;
  const assignee = x.assigneeId ? staff.data?.find((s) => s.id === x.assigneeId) : undefined;
  const assigneeName = x.assigneeId === user?.id ? t('driveProcessing.you') : assignee ? `${assignee.firstName} ${assignee.lastName}`.trim() : null;
  const chip = 'inline-flex max-w-full shrink-0 items-center gap-1 truncate rounded px-1.5 py-px text-[10px] font-semibold';
  return (
    <span className={clsx('flex max-w-full flex-wrap items-center gap-1', compact ? 'justify-center' : '', className)}>
      {x.stage && (
        <span className={clsx(chip, TONE_CLASS[STAGE_TONE[x.stage]])} title={assigneeName ? `${stageLabel(x.stage)} · ${t('clientFolders.stage.working', { name: assigneeName })}` : stageLabel(x.stage)}>
          <span className="truncate">{stageLabel(x.stage)}</span>
          {assigneeName && !compact && (
            <span className="inline-flex items-center gap-0.5 font-medium opacity-80">
              · <UserRound className="size-2.5" aria-hidden /> {assigneeName}
            </span>
          )}
        </span>
      )}
      {x.partner && (
        <span className={clsx(chip, 'bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200')} title={x.partner.name}>
          <Handshake className="size-2.5 shrink-0" aria-hidden />
          <span className="truncate">{x.partner.name}</span>
        </span>
      )}
      {x.readySentAt && (
        <span className={clsx(chip, TONE_CLASS.success)} title={t('clientFolders.send.sentAt', { date: fmtDateTime(x.readySentAt) })}>
          <SendHorizontal className="size-2.5 shrink-0" aria-hidden />
          {compact ? <span className="sr-only">{t('clientFolders.send.sentChip')}</span> : <span className="truncate">{t('clientFolders.send.sentChip')}</span>}
        </span>
      )}
    </span>
  );
};
