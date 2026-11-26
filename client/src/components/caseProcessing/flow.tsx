import { useCallback, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { useStaffOptions } from '@/components/inline/CaseInlineCells';
import { errorMessage, toastError } from '@/components/admin/labels';
import { useAuth } from '@/lib/auth';
import { api, errorCode } from '@/lib/api';
import { DRIVE_DRAG_TYPE, draggingItems, endItemDrag } from '@/components/drive/dnd';
import type { DriveItem } from '@/components/drive/types';
import { returnToClient, reasonOf } from '@/components/drive/clientFolders/api';
import { canMoveStage, isProcessingStage, postClaim, postMove, processingKey, refreshProcessing, stageLabel, type ProcessingStage } from './api';

/**
 * The hand-over actions of the team workflow, shared by the documents section ("İş axını", client folder
 * strip, context menu, drag & drop onto a stage) and the board of the cases list:
 *
 *   (not in the workflow) → "Schon geschrieben-ə göndər" / "In Bearbeitung-a göndər" · Schon geschrieben →
 *   "Götür" (claim), "In Bearbeitung-a göndər" · In Bearbeitung → "Fertig-ə göndər", back to Schon geschrieben ·
 *   Fertig → "In Bearbeitung-a göndər" (reopen) · every stage → "Geri qaytar" (the documents go back to the client folder,
 *   the case leaves the workflow).
 *
 * Everything goes through the caseProcessing endpoints, so the case card, the board and the drive show the
 * same Case.processingStage.
 */

/** One case being moved: from a drive client folder, a board card or a row of the İş axını list. */
export interface FlowTarget {
  caseId: string;
  name: string;
  number?: string;
  stage: ProcessingStage | null;
  assigneeId: string | null;
  /** The case is closed (approved / rejected / cancelled): a closed case outside the workflow offers nothing. */
  closed?: boolean;
  /** The case has a partner (false = none; undefined = unknown, the server decides). Without one it cannot enter the workflow. */
  hasPartner?: boolean;
}

/** "Schon geschrieben" / "In Bearbeitung" for a case outside the workflow needs a partner first (server: 409 WORKFLOW_PARTNER_REQUIRED). */
export const needsPartner = (x: Pick<FlowTarget, 'stage' | 'hasPartner'>, action: FlowAction) => (action === 'send' || action === 'work') && !x.stage && x.hasPartner === false;

export type FlowKind = 'send' | 'work' | 'finish' | 'back' | 'return';
export type FlowAction = FlowKind | 'claim';

/** The stage a kind moves to; "return" (Geri qaytar) leaves the workflow, so it has none. */
export const KIND_STAGE: Record<Exclude<FlowKind, 'return'>, ProcessingStage> = { send: 'WRITTEN', work: 'IN_PROGRESS', finish: 'DONE', back: 'WRITTEN' };
export const STAGE_KIND: Record<ProcessingStage, FlowKind> = { WRITTEN: 'send', IN_PROGRESS: 'work', DONE: 'finish' };

/**
 * The buttons a stage offers — the way is Schon geschrieben → In Bearbeitung → Fertig, "Geri qaytar" from every
 * stage (the server enforces it). Nothing goes to In Bearbeitung by itself: an admin sends it there.
 */
export const flowActions = (stage: ProcessingStage | null, assigneeId: string | null, myId: string | undefined, closed = false): FlowAction[] => {
  if (!stage) return closed ? [] : ['send', 'work'];
  if (stage === 'WRITTEN') return [...(assigneeId !== myId ? (['claim'] as const) : []), 'work', 'return'];
  if (stage === 'IN_PROGRESS') return ['finish', 'back', 'return'];
  return ['work', 'return']; // Fertig: reopen
};

const CLOSED_STATUSES = new Set(['APPROVED', 'REJECTED', 'CANCELLED']);

/** A drive client folder as a flow target (null for anything else). */
export const targetOfItem = (i: DriveItem): FlowTarget | null => {
  if (i.kind !== 'FOLDER' || !i.caseId || !i.caseInfo) return null;
  const stage = i.caseInfo.processing?.stage;
  return {
    caseId: i.caseId,
    name: i.caseInfo.clientName,
    number: i.caseNumber,
    stage: isProcessingStage(stage) ? stage : null,
    assigneeId: i.caseInfo.processing?.assigneeId ?? null,
    closed: !!i.caseStatus && CLOSED_STATUSES.has(i.caseStatus),
    hasPartner: !!i.caseInfo.partner,
  };
};

// ─── Drag & drop (native HTML5, like the drive) ───────────────────────

/** Board cards and İş axını rows; drive client folders come with the drive's own drag type. */
export const CASE_DRAG_TYPE = 'application/x-triad-case';
let dragged: FlowTarget[] | null = null;

export const startCaseDrag = (e: DragEvent, targets: FlowTarget[]) => {
  dragged = targets;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(CASE_DRAG_TYPE, JSON.stringify(targets.map((x) => x.caseId)));
  e.dataTransfer.setData('text/plain', targets.map((x) => x.name).join('\n'));
};
export const endCaseDrag = () => {
  dragged = null;
};

/** What is being dragged, if it can go into the workflow (only client folders from the drive). */
const draggedTargets = (e: DragEvent): FlowTarget[] | null => {
  const types = Array.from(e.dataTransfer.types);
  if (types.includes(CASE_DRAG_TYPE)) return dragged?.length ? dragged : null;
  if (types.includes(DRIVE_DRAG_TYPE)) {
    const list = (draggingItems() ?? []).map(targetOfItem);
    return list.length && list.every(Boolean) ? (list as FlowTarget[]) : null;
  }
  return null;
};

/**
 * Makes an element (a stage in the drive sidebar, a board column) a drop target: dropped cases not yet in
 * `stage` go to `onDrop` (which asks for the note / next admin). `over` while something droppable hovers.
 */
export const useStageDrop = (stage: ProcessingStage, onDrop: (targets: FlowTarget[]) => void, enabled = true) => {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const accepts = useCallback((e: DragEvent) => (enabled ? draggedTargets(e) : null), [enabled]);
  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    },
    [accepts],
  );
  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    },
    [accepts],
  );
  const onDragLeave = useCallback(() => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }, []);
  const handleDrop = useCallback(
    (e: DragEvent) => {
      const targets = accepts(e);
      depth.current = 0;
      setOver(false);
      if (!targets) return;
      e.preventDefault();
      e.stopPropagation();
      endItemDrag();
      endCaseDrag();
      const moving = targets.filter((x) => x.stage !== stage && canMoveStage(x.stage, stage));
      if (moving.length) onDrop(moving);
    },
    [accepts, onDrop, stage],
  );
  return { over, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop: handleDrop } };
};

// ─── Dialogs ──────────────────────────────────────────────────────────

const useStaffName = () => {
  const staff = useStaffOptions();
  return (id: string | null | undefined) => {
    const s = id ? staff.data?.find((x) => x.id === id) : undefined;
    return s ? `${s.firstName} ${s.lastName}`.trim() : '—';
  };
};

/**
 * Send / finish / send back / return (Geri qaytar) one or more cases: the next admin (send, back), an optional note
 * and a soft warning when a colleague works on one of them.
 */
export const FlowDialog = ({ targets, kind, origin, onClose }: { targets: FlowTarget[]; kind: FlowKind; origin: 'case' | 'drive'; onClose: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const staff = useStaffOptions();
  const nameOf = useStaffName();
  const [assigneeId, setAssigneeId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [missingNote, setMissingNote] = useState(false);
  /** Cases still to move: after a partial failure only the failed ones stay (with their error). */
  const [items, setItems] = useState(targets);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const isReturn = kind === 'return';
  const stage = isReturn ? null : KIND_STAGE[kind];
  const needNote = false;
  const withAssignee = kind === 'send' || kind === 'back' || kind === 'work';
  const others = items.filter((x) => x.assigneeId && x.assigneeId !== user?.id);
  const formId = `flow-${kind}`;

  const submit = async () => {
    if (needNote && !note.trim()) {
      setMissingNote(true);
      return;
    }
    setBusy(true);
    if (isReturn) {
      try {
        const r = await returnToClient(items.map((x) => x.caseId), note.trim() || null);
        const bad = r.results.filter((x) => !x.ok);
        const ok = r.results.length - bad.length;
        if (ok) refreshProcessing(qc);
        if (!bad.length) {
          toast.success(t('driveProcessing.toasts.returned', { count: ok }));
          onClose();
        } else {
          if (ok) toast.warning(t('driveProcessing.toasts.returnPartial', { ok, total: items.length }));
          else toast.error(reasonOf(bad[0]!.error));
          setItems((cur) => cur.filter((x) => bad.some((b) => b.caseId === x.caseId)));
          setFailures(Object.fromEntries(bad.map((b) => [b.caseId, reasonOf(b.error)])));
        }
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    // Every case is tried (one refused move must not stop the rest); the failed ones stay in the dialog.
    let ok = 0;
    const failed: Record<string, string> = {};
    for (const x of items) {
      try {
        const view = await postMove(x.caseId, { stage: stage!, assigneeId: withAssignee ? assigneeId || null : null, note: note.trim() || null, origin });
        qc.setQueryData(processingKey(x.caseId), view);
        ok++;
      } catch (e) {
        failed[x.caseId] = errorMessage(e);
      }
    }
    setBusy(false);
    if (ok) refreshProcessing(qc);
    const failedCount = Object.keys(failed).length;
    if (!failedCount) {
      toast.success(t('driveProcessing.toasts.moved', { count: ok, stage: stageLabel(stage!) }));
      onClose();
      return;
    }
    if (ok) toast.warning(t('driveProcessing.toasts.partial', { ok, total: items.length, stage: stageLabel(stage!) }));
    else if (failedCount === 1) toast.error(Object.values(failed)[0]);
    else toast.error(t('driveProcessing.toasts.partial', { ok, total: items.length, stage: stageLabel(stage!) }));
    setItems((cur) => cur.filter((x) => failed[x.caseId]));
    setFailures(failed);
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={t(`driveProcessing.dialog.${kind}Title`)}
      description={items.length === 1 ? `${items[0].name}${items[0].number ? ` · ${items[0].number}` : ''}` : t('driveProcessing.dialog.folders', { count: items.length })}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('driveProcessing.dialog.cancel')}
          </button>
          <button type="submit" form={formId} className={isReturn ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} disabled={busy}>
            {busy && <Spinner className="size-3.5" />} {t(isReturn ? 'driveProcessing.dialog.returnConfirm' : 'driveProcessing.dialog.send')}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {Object.keys(failures).length > 0 && (
          <div className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger-fg" role="alert">
            <p className="font-medium">{t('driveProcessing.toasts.failedTitle')}</p>
            <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
              {items.map((x) => (
                <li key={x.caseId}>
                  <span className="font-medium">{x.name}</span>
                  {x.number && <span> · {x.number}</span>} — {failures[x.caseId]}
                </li>
              ))}
            </ul>
          </div>
        )}
        {items.length > 1 && !Object.keys(failures).length && (
          <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-lg bg-sunken px-3 py-2 text-xs text-ink/80">
            {items.map((x) => (
              <li key={x.caseId} className="truncate">
                {x.name} {x.number && <span className="text-muted">· {x.number}</span>}
              </li>
            ))}
          </ul>
        )}
        {others.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-fg" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t('driveProcessing.dialog.warnOther', { name: [...new Set(others.map((x) => nameOf(x.assigneeId)))].join(', ') })}
          </p>
        )}
        {withAssignee && (
          <label className="block">
            <span className="label">{t(kind === 'back' ? 'driveProcessing.dialog.backTo' : 'driveProcessing.dialog.nextAdmin')}</span>
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">{t('driveProcessing.dialog.nobody')}</option>
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
        )}
        <label className="block">
          <span className="label">{needNote ? t('driveProcessing.dialog.note') : t('driveProcessing.dialog.noteOptional')}</span>
          <textarea
            className="input min-h-20"
            maxLength={2000}
            required={needNote}
            aria-invalid={missingNote || undefined}
            placeholder={t('driveProcessing.dialog.notePh')}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (e.target.value.trim()) setMissingNote(false);
            }}
          />
          {missingNote && <span className="mt-1 block text-xs text-danger-fg">{t('driveProcessing.dialog.noteRequired')}</span>}
        </label>
        {isReturn && <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{t('driveProcessing.dialog.returnNote')}</p>}
      </form>
    </Modal>
  );
};

/**
 * "Götür" with the soft warning: a case a colleague already took asks first ("X işləyir — özümə götür?")
 * and is then taken over (force). Returns `claim(target)` and the confirm dialog to render.
 */
export const useClaimFlow = (origin: 'case' | 'drive') => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const nameOf = useStaffName();
  const [ask, setAsk] = useState<FlowTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (x: FlowTarget, force: boolean) => {
    setBusy(true);
    try {
      const r = await postClaim(x.caseId, { force, origin });
      qc.setQueryData(processingKey(x.caseId), r.processing);
      toast.success(t(r.claimed ? 'driveProcessing.toasts.claimed' : 'driveProcessing.toasts.already'));
      refreshProcessing(qc);
      setAsk(null);
    } catch (e) {
      // The list was a few seconds old and a colleague took it meanwhile: ask (with their name) instead.
      if (!force && errorCode(e) === 'PROCESSING_CLAIMED_BY_OTHER') {
        const view = await api.get<{ processing: { assignee: { id: string } | null } }>(`/admin/cases/${x.caseId}/processing`).then((r) => r.data.processing).catch(() => null);
        refreshProcessing(qc);
        setAsk({ ...x, assigneeId: view?.assignee?.id ?? x.assigneeId });
      } else toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const claim = (x: FlowTarget) => (x.assigneeId && x.assigneeId !== user?.id ? setAsk(x) : void run(x, false));
  const dialog = (
    <ConfirmDialog
      open={!!ask}
      onClose={() => !busy && setAsk(null)}
      onConfirm={() => ask && void run(ask, true)}
      title={t('driveProcessing.actions.claim')}
      message={ask ? t('driveProcessing.dialog.warnOther', { name: nameOf(ask.assigneeId) }) : ''}
      confirmLabel={t('driveProcessing.dialog.takeOver')}
      cancelLabel={t('driveProcessing.dialog.cancel')}
      tone="primary"
      busy={busy}
    />
  );
  return { claim, dialog, busy };
};

/** State for "which FlowDialog is open" + the claim flow, for components offering the actions. */
export const useFlowActions = (origin: 'case' | 'drive') => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<{ kind: FlowKind; targets: FlowTarget[] } | null>(null);
  const claimFlow = useClaimFlow(origin);
  const act = (action: FlowAction, targets: FlowTarget[]) => {
    if (!targets.length) return;
    if (action === 'claim') claimFlow.claim(targets[0]);
    else if (targets.some((x) => needsPartner(x, action))) toast.error(t('driveProcessing.partnerFirst'));
    else setOpen({ kind: action, targets: action === 'return' ? targets.filter((x) => x.stage) : targets.filter((x) => x.stage !== KIND_STAGE[action]) });
  };
  const dialogs = (
    <>
      {open && open.targets.length > 0 && <FlowDialog targets={open.targets} kind={open.kind} origin={origin} onClose={() => setOpen(null)} />}
      {claimFlow.dialog}
    </>
  );
  return { act, dialogs, busy: claimFlow.busy };
};
