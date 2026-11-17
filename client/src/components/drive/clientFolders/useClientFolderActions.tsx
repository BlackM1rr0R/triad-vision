import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowDownWideNarrow, Filter, Handshake, PenLine, SendHorizontal, UserMinus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PROCESSING_STAGES, STAGE_TONE, stageLabel, type ProcessingStage } from '@/components/caseProcessing/api';
import { TONE_CLASS } from '@/components/ui/status';
import type { MenuEntry } from '../ContextMenu';
import type { ToolAction } from '../Toolbar';
import type { DriveItem } from '../types';
import { targetOf, targetsOf, type BulkResponse, type FolderTarget } from './api';
import { BulkStageDialog, PartnerPickerDialog, RemovePartnerDialog, ResultDialog, SendReadyDialog } from './Dialogs';

/**
 * Client folder actions in the documents section without opening the folder (the owner's "workflow" request):
 *
 *  - context menu / "⋯" button / long-press of one or several client folders: "Partnyor təyin et", "Partnyoru dəyiş",
 *    "Partnyorluqdan çıxart" (confirmation), "Schon geschrieben kimi işarələ" (several folders), "Müştəriyə göndər"
 *    (Fertig folders; re-send asks first) — and the same as toolbar actions of a selection;
 *  - the status filter bar above the listing (Schon geschrieben · In Bearbeitung · Fertig · Ablehnung · not in the
 *    workflow, counts) and "sort by status";
 *  - the result summary of every bulk action (n succeeded / failures with the reason).
 *
 * Drive.tsx only wires the pieces in. Permissions are the server's (partners:edit, cases:edit, documents:edit +
 * case scope per case); the menu greys out what the own permission matrix (GET /admin/me/permissions) refuses.
 */

type StageFilter = ProcessingStage | 'NONE';
type DialogState = { kind: 'partner' | 'remove' | 'stage' | 'send'; targets: FolderTarget[] } | null;

/** Order of the "sort by status" view: the open work first. */
const STAGE_ORDER: Record<string, number> = { WRITTEN: 0, IN_PROGRESS: 1, DONE: 2, REFUSED: 3, NONE: 4 };
const stageKey = (i: DriveItem) => (i.kind === 'FOLDER' && i.caseId ? (i.caseInfo?.processing?.stage ?? 'NONE') : null);

const usePerms = () => {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['admin-perms', user?.id ?? 'anon'],
    queryFn: async () => (await api.get<{ matrix: Record<string, string[]>; superAdmin: boolean }>('/admin/me/permissions')).data,
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });
  // Unknown (loading / failed) = allowed: the server decides anyway.
  return (area: string, action: string) => !q.data || q.data.superAdmin || (q.data.matrix[area] ?? []).includes(action);
};

export const useClientFolderActions = () => {
  const { t } = useTranslation();
  const can = usePerms();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [result, setResult] = useState<BulkResponse | null>(null);
  const [filter, setFilter] = useState<StageFilter[]>([]);
  const [byStage, setByStage] = useState(false);

  const open = useCallback((kind: NonNullable<DialogState>['kind'], targets: FolderTarget[]) => targets.length && setDialog({ kind, targets }), []);
  /** Failures (or several folders) show the summary; a clean single action only toasts. */
  const onResult = useCallback((r: BulkResponse) => {
    if (r.summary.failed || r.summary.total > 1) setResult(r);
  }, []);

  const noPerm = t('clientFolders.errors.NO_PERMISSION');

  /** Context-menu entries for client folders (one or several; ignored when the list holds anything else). */
  const menuEntries = (list: DriveItem[] | null): MenuEntry[] => {
    if (!list?.length) return [];
    const targets = targetsOf(list);
    if (targets.length !== list.length) return [];
    const withPartner = targets.filter((x) => x.partner);
    const done = targets.filter((x) => x.stage === 'DONE');
    const partnerOk = can('partners', 'edit');
    const out: MenuEntry[] = [
      { kind: 'separator', id: 'cf-s' },
      { kind: 'heading', id: 'cf-h', label: targets.length > 1 ? t('driveProcessing.dialog.folders', { count: targets.length }) : t('clientFolders.heading') },
      withPartner.length
        ? { id: 'cf-change', label: t('clientFolders.partner.change'), icon: Handshake, hint: targets.length === 1 ? withPartner[0].partner!.name : undefined, disabled: !partnerOk, title: partnerOk ? undefined : noPerm, onSelect: () => open('partner', targets) }
        : { id: 'cf-assign', label: t('clientFolders.partner.assign'), icon: Handshake, disabled: !partnerOk, title: partnerOk ? undefined : noPerm, onSelect: () => open('partner', targets) },
    ];
    if (withPartner.length) out.push({ id: 'cf-remove', label: t('clientFolders.partner.remove'), icon: UserMinus, danger: true, disabled: !partnerOk, title: partnerOk ? undefined : noPerm, onSelect: () => open('remove', withPartner) });
    // One folder: "Schon geschrieben-ə göndər" is already in the İş axını entries (components/drive/processing).
    if (targets.length > 1) {
      const ok = can('cases', 'edit');
      out.push({ id: 'cf-written', label: t('clientFolders.stage.markWritten'), icon: PenLine, disabled: !ok, title: ok ? undefined : noPerm, onSelect: () => open('stage', targets) });
    }
    if (done.length) {
      const ok = can('documents', 'edit');
      const again = done.every((x) => x.readySentAt);
      out.push({
        id: 'cf-send',
        label: t(again ? 'clientFolders.send.resendAction' : 'clientFolders.send.action'),
        icon: SendHorizontal,
        hint: done.length < targets.length ? `${done.length} / ${targets.length} · Fertig` : undefined,
        disabled: !ok,
        title: ok ? undefined : noPerm,
        onSelect: () => open('send', done),
      });
    }
    return out;
  };

  /** Toolbar buttons of a selection of client folders (the menu has the rest). */
  const toolActions = (list: DriveItem[]): ToolAction[] => {
    const targets = targetsOf(list);
    if (!targets.length || targets.length !== list.length) return [];
    const out: ToolAction[] = [];
    const done = targets.filter((x) => x.stage === 'DONE');
    if (done.length && can('documents', 'edit')) out.push({ id: 'cf-send', icon: SendHorizontal, label: t('clientFolders.send.action'), onClick: () => open('send', done), primary: true });
    if (targets.length > 1 && can('cases', 'edit')) out.push({ id: 'cf-written', icon: PenLine, label: t('clientFolders.stage.markWritten'), onClick: () => open('stage', targets), primary: true });
    if (can('partners', 'edit')) {
      const any = targets.some((x) => x.partner);
      out.push({ id: 'cf-partner', icon: Handshake, label: t(any ? 'clientFolders.partner.change' : 'clientFolders.partner.assign'), onClick: () => open('partner', targets), primary: targets.length > 1 });
    }
    return out;
  };

  /** Status filter + sort, applied after the drive's own sort (only client folders carry a stage). */
  const filterItems = useCallback(
    (items: DriveItem[]) => {
      let out = items;
      if (filter.length) out = out.filter((i) => {
        const k = stageKey(i);
        return k !== null && filter.includes(k as StageFilter);
      });
      if (byStage) {
        out = [...out].sort((a, b) => {
          const ka = stageKey(a);
          const kb = stageKey(b);
          if (ka === null || kb === null) return ka === kb ? 0 : ka === null ? 1 : -1;
          return STAGE_ORDER[ka] - STAGE_ORDER[kb];
        });
      }
      return out;
    },
    [filter, byStage],
  );

  /** Bar above the listing when it holds client folders: one chip per status (with counts) + sort by status. */
  const filterBar = (items: DriveItem[]): ReactNode => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const k = stageKey(i);
      if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    if (!counts.size) return null;
    const chips: StageFilter[] = [...PROCESSING_STAGES, 'NONE'];
    return (
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line/70 px-3 py-1.5 text-xs sm:px-4" role="group" aria-label={t('clientFolders.filter.label')}>
        <Filter className="size-3.5 shrink-0 text-muted" aria-hidden />
        <span className="shrink-0 text-muted">{t('clientFolders.filter.label')}</span>
        {chips
          .filter((s) => counts.get(s) || filter.includes(s))
          .map((s) => {
            const on = filter.includes(s);
            const tone = s === 'NONE' ? 'bg-neutral-bg text-neutral-fg' : TONE_CLASS[STAGE_TONE[s]];
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter((f) => (on ? f.filter((x) => x !== s) : [...f, s]))}
                className={clsx('shrink-0 rounded-full px-2 py-0.5 font-semibold transition', tone, on ? 'ring-2 ring-focus' : 'opacity-75 hover:opacity-100')}
              >
                {s === 'NONE' ? t('clientFolders.filter.none') : stageLabel(s)} <span className="opacity-70 tabular-nums">{counts.get(s) ?? 0}</span>
              </button>
            );
          })}
        <button
          type="button"
          aria-pressed={byStage}
          onClick={() => setByStage((v) => !v)}
          className={clsx('ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium', byStage ? 'bg-primary/10 text-ink' : 'text-muted hover:text-ink')}
          title={t('clientFolders.filter.sort')}
        >
          <ArrowDownWideNarrow className="size-3.5" aria-hidden /> <span className="hidden sm:inline">{t('clientFolders.filter.sort')}</span>
        </button>
        {(filter.length > 0 || byStage) && (
          <button
            type="button"
            onClick={() => {
              setFilter([]);
              setByStage(false);
            }}
            className="inline-flex shrink-0 items-center gap-1 text-muted hover:text-ink"
          >
            <X className="size-3.5" aria-hidden /> {t('clientFolders.filter.clear')}
          </button>
        )}
      </div>
    );
  };

  const dialogs = useMemo(
    () => (
      <>
        {dialog?.kind === 'partner' && <PartnerPickerDialog targets={dialog.targets} onClose={() => setDialog(null)} onResult={onResult} />}
        {dialog?.kind === 'remove' && <RemovePartnerDialog targets={dialog.targets} onClose={() => setDialog(null)} onResult={onResult} />}
        {dialog?.kind === 'stage' && <BulkStageDialog targets={dialog.targets} onClose={() => setDialog(null)} onResult={onResult} />}
        {dialog?.kind === 'send' && <SendReadyDialog targets={dialog.targets} onClose={() => setDialog(null)} onResult={onResult} />}
        {result && <ResultDialog result={result} onClose={() => setResult(null)} />}
      </>
    ),
    [dialog, result, onResult],
  );

  return { menuEntries, toolActions, filterItems, filterBar, dialogs, isClientFolder: (i: DriveItem) => !!targetOf(i) };
};
