import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { FileText, Folder, HelpCircle, Search, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { fmtRelative } from '@/components/admin/labels';
import { ErrorBlock } from '@/components/admin/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { TONE_CLASS, TONE_TEXT } from '@/components/ui/status';
import { PROCESSING_STAGES, STAGE_TONE, stageLabel, useProcessingFolders, type ProcessingFolder, type ProcessingStage, type StageCounts } from '@/components/caseProcessing/api';
import { endCaseDrag, flowActions, startCaseDrag, useStageDrop, type FlowAction, type FlowTarget } from '@/components/caseProcessing/flow';
import { ACTION_ICON, STAGE_ICON } from './icons';
import { WorkflowHelp } from './Help';

const BASE = '/workspace/drive';
const folderHref = (id: string) => `${BASE}/f/${encodeURIComponent(id)}`;
const workflowHref = (stage: ProcessingStage, mine: boolean) => `${BASE}/workflow/${stage}${mine ? '?mine=1' : ''}`;

const targetOf = (f: ProcessingFolder): FlowTarget => ({ caseId: f.caseId, name: f.clientName, number: f.number, stage: f.processing.stage, assigneeId: f.processing.assignee?.id ?? null });

/** A stage tab: opens the stage, and accepts dropped rows (and drive client folders). */
const StageTab = ({
  stage,
  active,
  count,
  mine,
  onNavigate,
  onDropTargets,
}: {
  stage: ProcessingStage;
  active: boolean;
  count: number | undefined;
  mine: boolean;
  onNavigate: (href: string) => void;
  onDropTargets: (stage: ProcessingStage, targets: FlowTarget[]) => void;
}) => {
  const drop = useStageDrop(stage, (targets) => onDropTargets(stage, targets));
  const Icon = STAGE_ICON[stage];
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      {...drop.handlers}
      onClick={() => onNavigate(workflowHref(stage, mine))}
      className={clsx(
        'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition sm:min-h-9',
        active ? 'border-primary bg-primary/[0.06] text-ink shadow-[inset_0_0_0_1px_var(--color-brand-600)]' : 'border-line bg-card text-ink/80 hover:border-line-strong',
        drop.over && 'ring-2 ring-focus',
      )}
    >
      <Icon className={clsx('size-4', TONE_TEXT[STAGE_TONE[stage]])} aria-hidden />
      {stageLabel(stage)}
      <span className="text-xs font-semibold text-muted tabular-nums">{count ?? '…'}</span>
    </button>
  );
};

const Row = ({ f, onNavigate, onAct }: { f: ProcessingFolder; onNavigate: (href: string) => void; onAct: (a: FlowAction, x: FlowTarget) => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const x = targetOf(f);
  const actions = flowActions(f.processing.stage, x.assigneeId, user?.id);
  const mine = !!x.assigneeId && x.assigneeId === user?.id;
  const href = folderHref(f.folderId);
  return (
    <li
      draggable
      onDragStart={(e) => startCaseDrag(e, [x])}
      onDragEnd={endCaseDrag}
      className={clsx('group flex flex-col gap-2 px-3 py-2.5 transition hover:bg-sunken sm:flex-row sm:items-center sm:px-4', mine && 'shadow-[inset_3px_0_0_var(--color-brand-600)]')}
    >
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onNavigate(href);
        }}
        className="flex min-w-0 flex-1 items-start gap-3"
        title={t('driveProcessing.openFolder')}
      >
        <Folder className="mt-0.5 size-5 shrink-0 text-accent-fg" strokeWidth={1.7} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold text-ink group-hover:text-link">{f.clientName}</span>
            <span className="code-id text-[11px] font-medium text-link">{f.number}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {f.visaCategory ? tr(f.visaCategory.title) : t(`refPartners.visa.types.${f.visaType}`, { defaultValue: f.visaType })}
            {f.partner && ` · ${f.partner.name}`}
            {' · '}
            <FileText className="inline size-3 align-[-1px]" aria-hidden /> {t('driveProcessing.files', { count: f.fileCount })}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {f.processing.by && f.processing.at && <span className="text-muted">{t('driveProcessing.sentBy', { name: f.processing.by.name, date: fmtRelative(f.processing.at) })}</span>}
            {(f.processing.stage === 'WRITTEN' || f.processing.assignee) && (
              <span className={clsx('badge', mine ? TONE_CLASS.info : f.processing.assignee ? TONE_CLASS.warning : TONE_CLASS.neutral)}>
                {mine ? t('driveProcessing.you') : f.processing.assignee ? t('driveProcessing.takenBy', { name: f.processing.assignee.name }) : t('driveProcessing.unclaimed')}
              </span>
            )}
          </span>
          {f.lastNote && (
            <span className="mt-1 line-clamp-2 block rounded bg-sunken px-2 py-1 text-[11px] text-ink/80" title={f.lastNote}>
              “{f.lastNote}”
            </span>
          )}
        </span>
      </a>
      {actions.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 pl-8 sm:pl-0">
          {actions.map((a, i) => {
            const Icon = ACTION_ICON[a];
            const label = t(`driveProcessing.actions.${a}`);
            return i === 0 ? (
              <button key={a} type="button" className={clsx('btn-sm', a === 'refuse' ? 'btn-secondary text-danger-fg' : 'btn-primary')} onClick={() => onAct(a, x)}>
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            ) : (
              <button key={a} type="button" className={clsx('btn-secondary btn-sm !px-2', a === 'refuse' && 'text-danger-fg')} onClick={() => onAct(a, x)} title={label} aria-label={label}>
                <Icon className="size-3.5" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
};

/**
 * "İş axını → <stage>" in the documents section: the client folders in that team workflow stage, with
 * client, case number, visa kind, who sent it and when, who took it, the document count and the stage
 * buttons. Rows can be dragged onto another stage tab (or the stages in the sidebar).
 */
export const WorkflowView = ({
  stage,
  mine,
  onNavigate,
  onAct,
  onDropTargets,
}: {
  stage: ProcessingStage;
  mine: boolean;
  onNavigate: (href: string) => void;
  onAct: (a: FlowAction, x: FlowTarget) => void;
  onDropTargets: (stage: ProcessingStage, targets: FlowTarget[]) => void;
}) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(input.trim()), 300);
    return () => window.clearTimeout(id);
  }, [input]);
  const q = useProcessingFolders({ stage, mine, search });
  const counts: StageCounts | undefined = q.data?.counts;
  const items = q.data?.stage === stage ? q.data.items : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-line px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-bold text-ink">{t('driveProcessing.group')}</h1>
          {!!q.data?.waitingForMe && (
            <span className={clsx('badge', TONE_CLASS.info)}>{t('driveProcessing.waitingForMe', { count: q.data.waitingForMe })}</span>
          )}
          <button
            type="button"
            onClick={() => setHelp((h) => !h)}
            aria-expanded={help}
            className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline"
          >
            <HelpCircle className="size-3.5" aria-hidden /> {t('driveProcessing.helpToggle')}
          </button>
          <label className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" className="input !py-1.5 !pl-8 !text-sm" placeholder={t('driveProcessing.searchPh')} aria-label={t('driveProcessing.searchPh')} value={input} onChange={(e) => setInput(e.target.value)} />
          </label>
        </div>
        {help && <WorkflowHelp className="text-xs" />}
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t('driveProcessing.group')}>
          {PROCESSING_STAGES.map((s) => (
            <StageTab key={s} stage={s} active={s === stage} count={counts?.[s]} mine={mine} onNavigate={onNavigate} onDropTargets={onDropTargets} />
          ))}
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => onNavigate(workflowHref(stage, !mine))}
            className={clsx(
              'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition sm:ml-auto sm:min-h-9',
              mine ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink/80 hover:border-line-strong',
            )}
          >
            <UserCheck className="size-4" aria-hidden /> {t('driveProcessing.mine')}
          </button>
        </div>
        {stage === 'IN_PROGRESS' && q.data && <p className="text-xs text-muted">{t('driveProcessing.inProgressScope', { days: q.data.recentDays })}</p>}
      </div>
      <div className={clsx('min-h-0 flex-1 overflow-y-auto', q.isFetching && 'opacity-70')}>
        {q.isLoading ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" rounded="lg" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">{mine ? t('driveProcessing.emptyMine') : t('driveProcessing.empty')}</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {items.map((f) => (
                <Row key={f.caseId} f={f} onNavigate={onNavigate} onAct={onAct} />
              ))}
            </ul>
            {q.data && q.data.total > items.length && <p className="px-4 py-3 text-center text-xs text-muted">{t('driveProcessing.limited', { shown: items.length, total: q.data.total })}</p>}
          </>
        )}
      </div>
    </div>
  );
};
