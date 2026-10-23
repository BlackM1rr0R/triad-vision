import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Check, Info, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { errorBody, fieldLabel, formatValue, revertErrorMessage, type HistoryEntity, type HistoryItem } from './shared';

export type RevertTarget =
  | { kind: 'one'; item: HistoryItem }
  | { kind: 'group'; requestId: string; items: HistoryItem[]; scope?: { entity?: HistoryEntity; entityId?: string } };

interface Plan {
  changeId: string;
  field: string;
  current: unknown;
  target: unknown;
  via?: 'REQUEST_CHANGES' | 'REJECT_SIGNATURE' | 'REOPEN' | 'CANCEL';
  forced: boolean;
}
interface OneResult {
  ok: boolean;
  plan: Plan;
  revertChangeId: string | null;
}
interface GroupRow {
  changeId: string;
  field: string;
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
  plan?: Plan;
}
interface GroupResult {
  results: GroupRow[];
  reverted: number;
  failed: number;
}

/** Values in the dialog: the change row knows the kind and the names of the old / new ids. */
const fmtFor = (item: HistoryItem | undefined) => (v: unknown) => {
  if (!item) return v === null || v === undefined ? '—' : String(v);
  const label = v === item.oldValue ? item.oldLabel : v === item.newValue ? item.newLabel : null;
  return formatValue(item, v, label);
};

/**
 * Confirmation for one revert or a whole request. Opens with a dry run, so the dialog shows exactly what will
 * happen (or why it cannot: changed since → "revert anyway", status → workflow rule) before anything is written.
 */
export const RevertDialog = ({ target, onClose, onDone }: { target: RevertTarget | null; onClose: () => void; onDone?: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [force, setForce] = useState(false);
  useEffect(() => {
    setNote('');
    setForce(false);
  }, [target]);

  const url = !target ? '' : target.kind === 'one' ? `/admin/history/${target.item.id}/revert` : `/admin/history/requests/${encodeURIComponent(target.requestId)}/revert`;
  const scope = target?.kind === 'group' ? target.scope ?? {} : {};
  const byId = new Map((target?.kind === 'group' ? target.items : target ? [target.item] : []).map((i) => [i.id, i]));

  const dry = useQuery({
    queryKey: ['admin-history-dry', url, scope],
    queryFn: async () => (await api.post<OneResult | GroupResult>(url, { dryRun: true, ...scope })).data,
    enabled: !!target,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });

  const run = useMutation({
    mutationFn: async (opts: { force: boolean }) =>
      (await api.post<OneResult | GroupResult>(url, { force: opts.force || undefined, note: note.trim() || undefined, ...scope })).data,
    onSuccess: (res) => {
      if ('results' in res) {
        if (res.failed && res.reverted) toast.warning(t('history.revert.groupPartial', { ok: res.reverted, failed: res.failed }));
        else toast.success(t('history.revert.groupDone', { ok: res.reverted }));
      } else toast.success(t('history.revert.done'));
      void qc.invalidateQueries({ queryKey: ['admin-history'] });
      void qc.invalidateQueries({ queryKey: ['admin-case'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'companies'] });
      onDone?.();
      onClose();
    },
    onError: (err) => {
      const body = errorBody(err);
      const item = target?.kind === 'one' ? target.item : undefined;
      if (body.error === 'NOTHING_REVERTED') toast.error(t('history.revert.groupNone'));
      else toast.error(revertErrorMessage(body.error, body, fmtFor(item)));
    },
  });

  if (!target) return null;
  const item = target.kind === 'one' ? target.item : undefined;
  const fmt = fmtFor(item);
  const dryErr = dry.error ? errorBody(dry.error) : null;
  const canForceOne = !!dryErr && dryErr.error === 'CHANGED_SINCE' && dryErr.canForce === true;
  const one = dry.data && !('results' in dry.data) ? dry.data : null;
  const group = dry.data && 'results' in dry.data ? dry.data : null;
  const groupForceable = !!group?.results.some((r) => r.error === 'CHANGED_SINCE' && r.details?.canForce === true);
  const groupOk = (group?.results.filter((r) => r.ok).length ?? 0) > 0;
  const needsNote = one?.plan.via ?? group?.results.find((r) => r.ok && r.plan?.via)?.plan?.via;

  const confirmDisabled = run.isPending || dry.isLoading || (target.kind === 'one' ? !one && !canForceOne : !groupOk && !(groupForceable && force));

  return (
    <Modal
      open
      onClose={() => !run.isPending && onClose()}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <RotateCcw className="size-4 text-brand-600" aria-hidden />
          {target.kind === 'one' ? t('history.revert.title') : t('history.revert.groupTitle')}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={run.isPending}>
            {t('admin.common.cancel')}
          </button>
          <button
            type="button"
            data-autofocus
            className={canForceOne || (force && groupForceable) ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
            disabled={confirmDisabled}
            onClick={() => run.mutate({ force: canForceOne || force })}
          >
            {run.isPending && <Spinner className="size-3.5" />}
            {canForceOne ? t('history.revert.anyway') : t('history.revert.confirm')}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-ink/80">
        {dry.isLoading && (
          <p className="flex items-center gap-2 text-muted">
            <Spinner className="size-3.5" /> {t('history.revert.checking')}
          </p>
        )}

        {item && (
          <div className="rounded-lg border border-line bg-surface/60 px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{fieldLabel(item.field)}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 break-words">
              <span className="text-ink/60 line-through decoration-ink/30">{formatValue(item, item.newValue, item.newLabel)}</span>
              <ArrowRight className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="font-semibold text-navy-900">{formatValue(item, item.oldValue, item.oldLabel)}</span>
            </p>
          </div>
        )}

        {one && (
          <p>{t('history.revert.willSet', { current: fmt(one.plan.current), target: fmt(one.plan.target) })}</p>
        )}

        {dryErr && (
          <p className={canForceOne ? 'flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900' : 'flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800'} role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{revertErrorMessage(dryErr.error, dryErr, fmt)}</span>
          </p>
        )}

        {group && (
          <div>
            <p className="mb-2 font-semibold text-navy-900">{t('history.revert.groupList')}</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {group.results.map((r) => {
                const it = byId.get(r.changeId);
                const f = fmtFor(it);
                return (
                  <li key={r.changeId} className="flex items-start gap-2 px-3 py-2">
                    {r.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
                    <span className="min-w-0 break-words">
                      <span className="font-medium text-navy-900">{fieldLabel(r.field)}</span>
                      {r.ok && r.plan ? (
                        <span className="text-ink/70"> : {f(r.plan.current)} → {f(r.plan.target)}</span>
                      ) : (
                        <span className="block text-xs text-ink/70">{revertErrorMessage(r.error, r.details ?? {}, f)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {groupForceable && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={force} onChange={(e) => setForce(e.target.checked)} />
                <span>{t('history.revert.forceLabel')}</span>
              </label>
            )}
          </div>
        )}

        {needsNote && (
          <div className="space-y-2">
            <p className="flex gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <span>{t(`history.revert.via.${needsNote}`)}</span>
            </p>
            <div>
              <label className="label" htmlFor={noteId}>
                {t('history.revert.note')}
              </label>
              <textarea id={noteId} className="input min-h-20" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
              <p className="mt-1 text-xs text-muted">{t('history.revert.noteHint')}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
