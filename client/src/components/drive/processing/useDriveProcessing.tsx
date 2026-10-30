import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { HelpCircle, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { STAGE_TONE, PROCESSING_STAGES, isProcessingStage, stageLabel, useProcessingFolders, type ProcessingStage } from '@/components/caseProcessing/api';
import { STAGE_KIND, flowActions, targetOfItem, useFlowActions, useStageDrop, type FlowAction, type FlowTarget } from '@/components/caseProcessing/flow';
import { TONE_TEXT } from '@/components/ui/status';
import type { MenuEntry } from '../ContextMenu';
import type { ToolAction } from '../Toolbar';
import type { DriveItem, DriveLocation } from '../types';
import { ProcessingFolderBar } from './FolderBar';
import { WorkflowView } from './WorkflowView';
import { ACTION_ICON, STAGE_ICON } from './icons';
import { WorkflowHelp } from './Help';

const BASE = '/workspace/drive';
export const workflowHref = (stage: ProcessingStage, mine = false) => `${BASE}/workflow/${stage}${mine ? '?mine=1' : ''}`;

/** Stages a client folder can be dropped on in the sidebar (In Bearbeitung = "Geri qaytar" goes through the menu). */
const DROP_STAGES: ProcessingStage[] = ['WRITTEN', 'DONE', 'REFUSED'];

/** Parses /workspace/drive/workflow/<STAGE>[?mine=1]. */
export const parseWorkflow = (rest: string[], params: URLSearchParams): DriveLocation => ({
  kind: 'workflow',
  stage: isProcessingStage(rest[0]) ? rest[0] : 'WRITTEN',
  mine: params.get('mine') === '1',
});

const StageLink = ({
  stage,
  count,
  active,
  onOpen,
  onDropTargets,
}: {
  stage: ProcessingStage;
  count: number | undefined;
  active: boolean;
  onOpen: (href: string) => void;
  onDropTargets: (stage: ProcessingStage, targets: FlowTarget[]) => void;
}) => {
  const { t } = useTranslation();
  const droppable = DROP_STAGES.includes(stage);
  const drop = useStageDrop(stage, (targets) => onDropTargets(stage, targets), droppable);
  const Icon = STAGE_ICON[stage];
  const href = workflowHref(stage);
  return (
    <li>
      <a
        href={href}
        {...drop.handlers}
        onClick={(e) => {
          e.preventDefault();
          onOpen(href);
        }}
        title={droppable ? `${t(`caseProcessing.hints.${stage}`)} — ${t('driveProcessing.drop.hint')}` : t(`caseProcessing.hints.${stage}`)}
        className={clsx(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
          active ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-primary/[0.06] dark:hover:bg-white/5',
          drop.over && 'bg-primary/[0.06] ring-2 ring-focus ring-inset',
        )}
      >
        <Icon className={clsx('size-[18px] shrink-0', active ? 'text-primary-contrast' : TONE_TEXT[STAGE_TONE[stage]])} strokeWidth={1.7} />
        <span className="min-w-0 flex-1 truncate">{stageLabel(stage)}</span>
        {count !== undefined && <span className={clsx('text-xs tabular-nums', active ? 'text-primary-contrast/85' : 'text-muted')}>{count}</span>}
      </a>
    </li>
  );
};

interface Options {
  loc: DriveLocation;
  onNavigate: (href: string) => void;
}

/**
 * Team workflow of client folders in the documents section ("İş axını"): the sidebar group with the four
 * stages (counts, drop targets), the list view of one stage, the stage strip of an open client folder and
 * the context-menu / toolbar actions. Drive.tsx only wires the pieces in.
 */
export const useDriveProcessing = ({ loc, onNavigate }: Options) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const myId = user?.id;
  const flow = useFlowActions('drive');
  const [helpOpen, setHelpOpen] = useState(false);
  // Counts for the sidebar (and "waiting for me"); the view below shares the cache when it shows WRITTEN.
  const summary = useProcessingFolders({ stage: 'WRITTEN' });
  const counts = summary.data?.counts;
  const waiting = summary.data?.waitingForMe ?? 0;
  const activeStage = loc.kind === 'workflow' ? loc.stage : null;
  const activeMine = loc.kind === 'workflow' && loc.mine;

  const onDropTargets = useCallback((stage: ProcessingStage, targets: FlowTarget[]) => flow.act(STAGE_KIND[stage], targets), [flow]);

  const sidebar: ReactNode = (
    <section>
      <div className="flex items-center px-2.5 pb-1.5">
        <h2 className="flex-1 text-[11px] font-bold tracking-wider text-muted uppercase">{t('driveProcessing.group')}</h2>
        <button
          type="button"
          onClick={() => setHelpOpen((o) => !o)}
          aria-expanded={helpOpen}
          className="grid size-6 place-items-center rounded-md text-muted hover:bg-primary/[0.06] hover:text-ink dark:hover:bg-primary-contrast/10"
          title={t('driveProcessing.helpToggle')}
          aria-label={t('driveProcessing.helpToggle')}
        >
          <HelpCircle className="size-3.5" />
        </button>
      </div>
      {helpOpen && <WorkflowHelp className="mx-1 mb-2" />}
      <ul className="space-y-0.5">
        <li>
          <a
            href={workflowHref('WRITTEN', true)}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(workflowHref((activeStage as ProcessingStage | null) ?? 'WRITTEN', true));
            }}
            className={clsx(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
              activeMine ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-primary/[0.06] dark:hover:bg-white/5',
            )}
          >
            <UserCheck className={clsx('size-[18px] shrink-0', activeMine ? 'text-primary-contrast' : 'text-link')} strokeWidth={1.7} />
            <span className="min-w-0 flex-1 truncate">{t('driveProcessing.mine')}</span>
            {waiting > 0 && <span className={clsx('rounded-full px-1.5 text-[11px] font-bold tabular-nums', activeMine ? 'bg-primary-contrast/20' : 'bg-primary text-primary-contrast')}>{waiting}</span>}
          </a>
        </li>
        {PROCESSING_STAGES.map((s) => (
          <StageLink key={s} stage={s} count={counts?.[s]} active={activeStage === s && !activeMine} onOpen={onNavigate} onDropTargets={onDropTargets} />
        ))}
      </ul>
    </section>
  );

  // ── actions on a client folder ──
  const actionLabel = (a: FlowAction) => t(`driveProcessing.actions.${a}`);
  const actionsOf = (x: FlowTarget) => flowActions(x.stage, x.assigneeId, myId);

  const menuEntries = (list: DriveItem[] | null): MenuEntry[] => {
    if (!list || list.length !== 1) return [];
    const x = targetOfItem(list[0]);
    if (!x || !x.stage) return [];
    const acts = actionsOf(x);
    if (!acts.length) return [];
    return [
      { kind: 'separator', id: 'proc-s' },
      { kind: 'heading', id: 'proc-h', label: `${t('driveProcessing.group')} · ${stageLabel(x.stage)}` },
      ...acts.map((a): MenuEntry => ({ id: `proc-${a}`, label: actionLabel(a), icon: ACTION_ICON[a], danger: a === 'refuse', onSelect: () => flow.act(a, [x]) })),
    ];
  };

  const toolActions = (list: DriveItem[]): ToolAction[] => {
    if (list.length !== 1) return [];
    const x = targetOfItem(list[0]);
    if (!x) return [];
    const [first] = actionsOf(x);
    return first ? [{ id: `proc-${first}`, icon: ACTION_ICON[first], label: actionLabel(first), onClick: () => flow.act(first, [x]), primary: true, danger: first === 'refuse' }] : [];
  };

  /** Stage strip under the header of an open client folder. */
  const folderBar = (folder: DriveItem | null | undefined): ReactNode => {
    const x = folder ? targetOfItem(folder) : null;
    return x ? <ProcessingFolderBar target={x} folder={folder!} onAct={(a, live) => flow.act(a, [live])} /> : null;
  };

  const view: ReactNode =
    loc.kind === 'workflow' ? (
      <WorkflowView stage={loc.stage as ProcessingStage} mine={loc.mine} onNavigate={onNavigate} onAct={(a, x) => flow.act(a, [x])} onDropTargets={onDropTargets} />
    ) : null;

  const viewTitle = loc.kind === 'workflow' ? `${t('driveProcessing.group')} · ${loc.mine ? t('driveProcessing.mine') : stageLabel(loc.stage as ProcessingStage)}` : null;

  return { sidebar, menuEntries, toolActions, folderBar, view, viewTitle, dialogs: flow.dialogs };
};
