import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, CopyPlus, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtRelative } from '@/components/admin/labels';
import { Skeleton } from '@/components/ui/Skeleton';
import { TONE_TEXT } from '@/components/ui/status';
import { STAGE_TONE, stageLabel, type ProcessingStage } from '@/components/caseProcessing/api';
import { ContextMenu, type MenuEntry, type MenuPosition } from '../ContextMenu';
import { driveError, driveKeys, fetchChildren, invalidateDrive } from '../api';
import { ItemIcon } from '../fileIcons';
import type { ToolAction } from '../Toolbar';
import { can, type BatchResult, type DriveAccess, type DriveItem } from '../types';
import { STAGE_ICON } from './icons';

/**
 * The stage folders of "İş axını" in the drive (server lib/drive/workflowFolders): Gemeinsame Dokumente /
 * Arbeitsablauf / Schon geschrieben · In Bearbeitung · Fertig · Ablehnung.
 *
 * - "İş axınına kopyala" (command bar, next to Yeni / Etiketlər / Köçür): copies the selected files and folders
 *   — recursively, with their folder structure — to Schon geschrieben, Fertig or Ablehnung.
 * - Inside a stage folder the selection can be sent on: Schon geschrieben → In Bearbeitung → Fertig / Ablehnung.
 *   Nothing lands in In Bearbeitung by itself.
 * - StageTree: the folder tree of one stage for the İş axını view (expand / collapse, open in the drive).
 */

const BASE = '/workspace/drive';
const folderHref = (id: string) => `${BASE}/f/${encodeURIComponent(id)}`;
const itemHref = (i: Pick<DriveItem, 'id' | 'kind' | 'parentId'>) =>
  i.kind === 'FOLDER' || !i.parentId ? folderHref(i.id) : `${folderHref(i.parentId)}?item=${encodeURIComponent(i.id)}`;

export const COPY_STAGES: ProcessingStage[] = ['WRITTEN', 'DONE', 'REFUSED'];
/** Where an item of a stage may be sent on (server SEND_NEXT). */
export const SEND_NEXT: Record<ProcessingStage, ProcessingStage[]> = { WRITTEN: ['IN_PROGRESS'], IN_PROGRESS: ['DONE', 'REFUSED'], DONE: [], REFUSED: [] };

export interface StageFolder {
  stage: ProcessingStage;
  id: string;
  name: string;
  myAccess: DriveAccess | null;
  count: number;
}
export interface WorkflowFolders {
  root: { id: string; name: string; myAccess: DriveAccess | null };
  stages: StageFolder[];
}

/** Under the drive key: every drive refresh (copy, move, upload…) refreshes the counts too. */
export const workflowFoldersKey = [...driveKeys.all, 'workflow-folders'] as const;
export const useWorkflowFolders = () =>
  useQuery({ queryKey: workflowFoldersKey, queryFn: async () => (await api.get<WorkflowFolders>('/drive/workflow/folders')).data, staleTime: 30_000 });

/** The stage a folder trail (breadcrumb ids, root first) lies in — the stage folder itself counts. */
export const stageOfTrail = (wf: WorkflowFolders | undefined, trail: string[] | undefined): StageFolder | null => {
  if (!wf || !trail?.length) return null;
  return wf.stages.find((s) => trail.includes(s.id)) ?? null;
};

const isWorkflowFolder = (wf: WorkflowFolders | undefined, id: string) => !!wf && (wf.root.id === id || wf.stages.some((s) => s.id === id));

/** Copy / send with toasts, the stage menu of the command bar and the actions for the selection. */
export const useStageFolders = ({ onOpen }: { onOpen: (href: string) => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const wf = useWorkflowFolders();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ at: MenuPosition; items: DriveItem[] } | null>(null);

  const run = async (kind: 'copy' | 'send', items: Pick<DriveItem, 'id'>[], stage: ProcessingStage) => {
    if (!items.length || busy) return;
    setBusy(true);
    const pending = kind === 'copy' ? toast.loading(t('driveProcessing.folders.copying')) : undefined;
    try {
      const r = (await api.post<{ results: BatchResult[]; folderId: string }>(`/drive/workflow/${kind}`, { ids: items.map((i) => i.id), stage })).data;
      const ok = r.results.filter((x) => x.ok);
      const failed = r.results.filter((x) => !x.ok);
      if (ok.length) {
        toast.success(t(kind === 'copy' ? 'driveProcessing.folders.copied' : 'driveProcessing.folders.sent', { stage: stageLabel(stage), count: ok.length }), {
          id: pending,
          action: { label: t('driveProcessing.folders.open'), onClick: () => onOpen(folderHref(r.folderId)) },
        });
      } else if (pending) toast.dismiss(pending);
      if (failed.length) toast.error(t('driveProcessing.folders.partial', { failed: failed.length, reason: driveError(failed[0]!.error) }));
    } catch (err) {
      if (pending) toast.dismiss(pending);
      toast.error(driveError(err));
    } finally {
      setBusy(false);
      void invalidateDrive(qc);
    }
  };

  /** Selected items that can be copied: DOWNLOAD (files) / EXPORT (folders), not the workflow folders themselves. */
  const copyable = (list: DriveItem[]) =>
    list.length > 0 && list.every((i) => can(i.myAccess, i.kind === 'FILE' ? 'DOWNLOAD' : 'EXPORT') && !isWorkflowFolder(wf.data, i.id));

  const copyEntries = (list: DriveItem[]): MenuEntry[] =>
    COPY_STAGES.map((s) => ({ id: `wf-copy-${s}`, label: stageLabel(s), hint: t(`driveProcessing.folders.copyHint.${s}`), icon: STAGE_ICON[s], onSelect: () => void run('copy', list, s) }));

  /** "İş axınına kopyala ▾" in the command bar (shown while something copyable is selected). */
  const copyButton = (list: DriveItem[]): ReactNode =>
    copyable(list) ? (
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ at: { x: r.left, y: r.bottom + 4 }, items: list });
        }}
        aria-haspopup="menu"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink/80 hover:bg-sunken hover:text-ink disabled:opacity-50 dark:hover:bg-white/5"
        title={t('driveProcessing.folders.copyButton')}
      >
        <CopyPlus className="size-[18px]" aria-hidden />
        <span className="hidden lg:inline">{t('driveProcessing.folders.copyButton')}</span>
        <ChevronDown className="size-3.5 opacity-70" aria-hidden />
      </button>
    ) : null;

  /** The stage the current folder lies in (from its breadcrumb). */
  const stageOf = (trail: string[] | undefined) => stageOfTrail(wf.data, trail);

  const sendable = (list: DriveItem[], trail: string[] | undefined) => {
    const st = stageOf(trail);
    if (!st || !list.length || list.some((i) => isWorkflowFolder(wf.data, i.id) || !can(i.myAccess, 'EDIT'))) return null;
    return st;
  };

  const toolActions = (list: DriveItem[], trail: string[] | undefined): ToolAction[] => {
    const st = sendable(list, trail);
    if (!st) return [];
    return SEND_NEXT[st.stage].map((to) => ({
      id: `wf-send-${to}`,
      icon: STAGE_ICON[to],
      label: t(`driveProcessing.folders.sendTo.${to}`),
      onClick: () => void run('send', list, to),
      primary: true,
      danger: to === 'REFUSED',
    }));
  };

  const menuEntries = (list: DriveItem[] | null, trail: string[] | undefined): MenuEntry[] => {
    if (!list?.length) return [];
    const out: MenuEntry[] = [];
    const st = sendable(list, trail);
    if (st && SEND_NEXT[st.stage].length) {
      out.push(
        { kind: 'heading', id: 'wf-send-h', label: t('driveProcessing.folders.inStage', { stage: stageLabel(st.stage) }) },
        ...SEND_NEXT[st.stage].map(
          (to): MenuEntry => ({ id: `wf-send-${to}`, label: t(`driveProcessing.folders.sendTo.${to}`), icon: STAGE_ICON[to], danger: to === 'REFUSED', onSelect: () => void run('send', list, to) }),
        ),
      );
    }
    if (copyable(list)) out.push({ kind: 'heading', id: 'wf-copy-h', label: t('driveProcessing.folders.copyButton') }, ...copyEntries(list));
    return out.length ? [{ kind: 'separator', id: 'wf-s' }, ...out] : [];
  };

  /** Strip under the header while a stage folder (or a folder inside one) is open. */
  const stageBar = (trail: string[] | undefined): ReactNode => {
    const st = stageOf(trail);
    if (!st) return null;
    const Icon = STAGE_ICON[st.stage];
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface/60 px-3 py-2 text-xs sm:px-4">
        <Icon className={clsx('size-4 shrink-0', TONE_TEXT[STAGE_TONE[st.stage]])} aria-hidden />
        <a
          href={`${BASE}/workflow/${st.stage}`}
          onClick={(e) => {
            e.preventDefault();
            onOpen(`${BASE}/workflow/${st.stage}`);
          }}
          className="font-semibold text-ink hover:text-link hover:underline"
        >
          {t('driveProcessing.folders.inStage', { stage: stageLabel(st.stage) })}
        </a>
        <span className="text-muted">{t(`driveProcessing.folders.stageBar.${st.stage}`)}</span>
      </div>
    );
  };

  const dialogs = (
    <ContextMenu
      open={!!menu}
      at={menu?.at ?? null}
      label={t('driveProcessing.folders.copyMenu')}
      items={menu ? [{ kind: 'heading', id: 'h', label: t('driveProcessing.folders.copyMenu') }, ...copyEntries(menu.items)] : []}
      onClose={() => setMenu(null)}
    />
  );

  return { wf: wf.data, busy, run, copyButton, toolActions, menuEntries, stageBar, dialogs };
};

// ─── Folder tree of one stage (İş axını view) ─────────────────────────

const byKindAndName = (a: DriveItem, b: DriveItem) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'FOLDER' ? -1 : 1);

const TreeChildren = ({ folderId, depth, stage, onNavigate, onSend }: { folderId: string; depth: number; stage: ProcessingStage; onNavigate: (href: string) => void; onSend: (item: DriveItem, to: ProcessingStage) => void }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: driveKeys.children(folderId), queryFn: () => fetchChildren(folderId) });
  if (q.isLoading)
    return (
      <div className="space-y-1.5 py-1.5" style={{ paddingLeft: `${depth * 1.25 + 0.75}rem` }} aria-busy="true">
        <Skeleton className="h-7 w-2/3" rounded="lg" />
      </div>
    );
  if (q.isError) return <p className="px-4 py-2 text-xs text-danger-fg">{driveError(q.error)}</p>;
  const items = [...(q.data?.items ?? [])].sort(byKindAndName);
  if (!items.length && depth === 0)
    return <p className="px-4 py-6 text-center text-sm text-muted">{stage === 'IN_PROGRESS' ? t('driveProcessing.folders.emptyInProgress') : t('driveProcessing.folders.empty')}</p>;
  return (
    <ul role={depth === 0 ? 'tree' : 'group'} aria-label={depth === 0 ? t('driveProcessing.folders.title') : undefined}>
      {items.map((i) => (
        <TreeRow key={i.id} item={i} depth={depth} stage={stage} onNavigate={onNavigate} onSend={onSend} />
      ))}
      {q.data?.truncated && <li className="px-4 py-1 text-xs text-muted">{t('driveProcessing.folders.more')}</li>}
    </ul>
  );
};

const TreeRow = ({ item, depth, stage, onNavigate, onSend }: { item: DriveItem; depth: number; stage: ProcessingStage; onNavigate: (href: string) => void; onSend: (item: DriveItem, to: ProcessingStage) => void }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const folder = item.kind === 'FOLDER';
  const href = itemHref(item);
  const next = can(item.myAccess, 'EDIT') ? SEND_NEXT[stage] : [];
  return (
    <li role="treeitem" aria-expanded={folder ? open : undefined} aria-selected={false}>
      <div className="group flex items-center gap-1.5 py-1 pr-3 hover:bg-sunken sm:pr-4" style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}>
        {folder ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="grid size-6 shrink-0 place-items-center rounded text-muted hover:bg-card hover:text-ink"
            aria-label={open ? t('driveProcessing.folders.collapse') : t('driveProcessing.folders.expand')}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden />
        )}
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(href);
          }}
          className="flex min-w-0 flex-1 items-center gap-2"
          title={t('driveProcessing.folders.openInDrive')}
        >
          <ItemIcon item={item} open={open} className="size-[18px] shrink-0" />
          <span className="truncate text-sm font-medium text-ink group-hover:text-link">{item.name}</span>
          {folder && item.childCount !== undefined && <span className="shrink-0 text-[11px] text-muted tabular-nums">{t('driveProcessing.folders.items', { count: item.childCount })}</span>}
          <span className="ml-auto hidden shrink-0 text-[11px] text-muted sm:inline">{fmtRelative(item.updatedAt)}</span>
        </a>
        {next.map((to) => {
          const Icon = STAGE_ICON[to];
          const label = t(`driveProcessing.folders.sendTo.${to}`);
          return depth === 0 ? (
            <button key={to} type="button" onClick={() => onSend(item, to)} className={clsx('btn-sm shrink-0', to === 'REFUSED' ? 'btn-secondary text-danger-fg' : 'btn-secondary')} title={label}>
              <Icon className="size-3.5" aria-hidden /> <span className="hidden md:inline">{label}</span>
            </button>
          ) : (
            <button
              key={to}
              type="button"
              onClick={() => onSend(item, to)}
              className={clsx('grid size-7 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100 hover:bg-card focus:opacity-100', to === 'REFUSED' ? 'text-danger-fg' : 'text-link')}
              title={label}
              aria-label={`${item.name} — ${label}`}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>
      {folder && open && <TreeChildren folderId={item.id} depth={depth + 1} stage={stage} onNavigate={onNavigate} onSend={onSend} />}
    </li>
  );
};

/** The folder tree of one stage folder: folders expand in place, everything opens in the drive. */
export const StageTree = ({ folder, onNavigate, onSend }: { folder: StageFolder; onNavigate: (href: string) => void; onSend: (item: DriveItem, to: ProcessingStage) => void }) => {
  const { t } = useTranslation();
  return (
    <section aria-label={t('driveProcessing.folders.title')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-3 pb-1.5 sm:px-4">
        <h2 className="text-xs font-bold tracking-wider text-muted uppercase">{t('driveProcessing.folders.title')}</h2>
        <span className="text-xs text-muted">{t('driveProcessing.folders.hint')}</span>
        <a
          href={folderHref(folder.id)}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(folderHref(folder.id));
          }}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden /> {t('driveProcessing.folders.openInDrive')}
        </a>
      </div>
      <TreeChildren folderId={folder.id} depth={0} stage={folder.stage} onNavigate={onNavigate} onSend={onSend} />
    </section>
  );
};
