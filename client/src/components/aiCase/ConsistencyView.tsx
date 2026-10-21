import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertOctagon, AlertTriangle, Check, CheckCircle2, ClipboardList, FileQuestion, Info, PenLine, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { toastError } from '@/components/admin/labels';
import { caseKey } from '@/components/admin/case/shared';
import { fmtDay, l10n, overviewKey, SEVERITY_STYLE, type ConsistencyResult, type Finding, type FindingState, type FindingStatus, type Overview, type Run, type Severity } from './api';

const ICON: Record<Severity, typeof Info> = { BLOCKER: AlertOctagon, WARNING: AlertTriangle, INFO: Info };
const DATE_FIELDS = ['birthDate', 'passportExpiry'];

/** Checklist card of a consistency run: one row per finding with its one-click actions. */
export const ConsistencyView = ({ caseId, run, states }: { caseId: string; run: Run<ConsistencyResult>; states: FindingState[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const r = run.result;
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Finding | null>(null);

  const stateOf = (key: string) => states.find((s) => s.kind === 'CONSISTENCY' && s.key === key);
  const open = r.findings.filter((f) => !stateOf(f.key));
  const done = r.findings.filter((f) => stateOf(f.key));
  const count = (s: Severity) => open.filter((f) => f.severity === s).length;

  const setStates = (next: FindingState[]) => qc.setQueryData<Overview>(overviewKey(caseId), (o) => (o ? { ...o, states: next } : o));

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (f: Finding, status: FindingStatus | null) =>
    act(`${f.key}:state`, async () => {
      const res = await api.put<{ states: FindingState[] }>(`/admin/cases/${caseId}/ai/findings/state`, { kind: 'CONSISTENCY', key: f.key, status });
      setStates(res.data.states);
    });

  const apply = (f: Finding) =>
    act(`${f.key}:apply`, async () => {
      const res = await api.post<{ states: FindingState[] }>(`/admin/cases/${caseId}/ai/findings/apply`, { runId: run.id, key: f.key });
      setStates(res.data.states);
      setConfirm(null);
      toast.success(t('aiCase.actions.applied'));
      void qc.invalidateQueries({ queryKey: caseKey(caseId) });
    });

  const request = (f: Finding) =>
    act(`${f.key}:request`, async () => {
      const res = await api.post<{ states: FindingState[] }>(`/admin/cases/${caseId}/ai/findings/request-document`, { runId: run.id, key: f.key });
      setStates(res.data.states);
      toast.success(t('aiCase.actions.requested'));
      void qc.invalidateQueries({ queryKey: caseKey(caseId) });
    });

  const task = (f: Finding) =>
    act(`${f.key}:task`, async () => {
      const res = await api.post<{ task: { key: string } }>(`/admin/cases/${caseId}/ai/tasks`, { runId: run.id, target: 'finding', key: f.key });
      toast.success(t('aiCase.actions.taskCreated', { key: res.data.task.key }));
    });

  const showValue = (f: Finding) => (f.suggestedFix?.field && DATE_FIELDS.includes(f.suggestedFix.field) ? fmtDay(f.suggestedFix.value) : (f.suggestedFix?.value ?? ''));

  const Row = ({ f }: { f: Finding }) => {
    const st = stateOf(f.key);
    const I = ICON[f.severity];
    const fix = f.suggestedFix;
    return (
      <li className={clsx('rounded-lg border px-3.5 py-3', st ? 'border-line bg-surface/60 opacity-75' : SEVERITY_STYLE[f.severity])}>
        <div className="flex items-start gap-2.5">
          {st ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <I className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tracking-wide uppercase opacity-80">
              <span>{t(`aiCase.severity.${f.severity}`)}</span>
              <span aria-hidden>·</span>
              <span>{t(`aiCase.source.${f.source}`)}</span>
              {st && <span className="badge bg-navy-900 text-white normal-case">{t(`aiCase.state.${st.status}`)}</span>}
            </p>
            <p className="mt-1 text-sm font-medium break-words text-ink">{l10n(f.message)}</p>
            {!!f.evidence.length && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-ink/80">
                {f.evidence.map((e, i) => (
                  <li key={i} className="flex min-w-0 gap-1.5">
                    <span className="shrink-0 font-semibold">{e.documentId ? e.documentName : t('aiCase.consistency.profile')}:</span>
                    <span className="min-w-0 break-words">{e.value}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {st ? (
                <button type="button" className="btn-white btn-sm border border-line" disabled={!!busy} onClick={() => void setStatus(f, null)}>
                  {busy === `${f.key}:state` ? <Spinner className="size-3.5" /> : <RotateCcw className="size-3.5" aria-hidden />} {t('aiCase.actions.reopen')}
                </button>
              ) : (
                <>
                  {fix?.kind === 'PROFILE_FIELD' && fix.field && (
                    <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => setConfirm(f)}>
                      <PenLine className="size-3.5" aria-hidden /> {t('aiCase.actions.apply')}: {showValue(f)}
                    </button>
                  )}
                  {fix?.kind === 'REQUEST_DOCUMENT' && (
                    <button type="button" className="btn-white btn-sm border border-line" disabled={!!busy} onClick={() => void request(f)}>
                      {busy === `${f.key}:request` ? <Spinner className="size-3.5" /> : <FileQuestion className="size-3.5" aria-hidden />} {t('aiCase.actions.request')}
                    </button>
                  )}
                  <button type="button" className="btn-white btn-sm border border-line" disabled={!!busy} onClick={() => void task(f)}>
                    {busy === `${f.key}:task` ? <Spinner className="size-3.5" /> : <ClipboardList className="size-3.5" aria-hidden />} {t('aiCase.actions.task')}
                  </button>
                  <button type="button" className="btn-white btn-sm border border-line" disabled={!!busy} onClick={() => void setStatus(f, 'OK')}>
                    {busy === `${f.key}:state` ? <Spinner className="size-3.5" /> : <Check className="size-3.5" aria-hidden />} {t('aiCase.actions.ok')}
                  </button>
                  {f.severity !== 'BLOCKER' && (
                    <button type="button" className="btn-white btn-sm border border-line" disabled={!!busy} onClick={() => void setStatus(f, 'IGNORED')}>
                      <X className="size-3.5" aria-hidden /> {t('aiCase.actions.ignore')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-navy-900">{t('aiCase.consistency.summary', { blockers: count('BLOCKER'), warnings: count('WARNING'), infos: count('INFO') })}</span>
        <span>{t('aiCase.consistency.plannedEntry', { date: fmtDay(r.plannedEntry.date), source: t(`aiCase.consistency.entrySource.${r.plannedEntry.source}`) })}</span>
        {r.ai.status === 'done' && <span>{t('aiCase.consistency.docsRead', { count: r.documentsRead, files: r.filesSent })}</span>}
      </div>
      {r.purged && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">{t('aiCase.consistency.purged')}</p>}
      {!open.length ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden /> {t('aiCase.consistency.none')}
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((f) => (
            <Row key={f.key} f={f} />
          ))}
        </ul>
      )}
      {!!done.length && (
        <div>
          <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setShowDone((v) => !v)}>
            {showDone ? t('aiCase.consistency.hideDone') : t('aiCase.consistency.showDone', { count: done.length })}
          </button>
          {showDone && (
            <ul className="mt-2 space-y-2">
              {done.map((f) => (
                <Row key={f.key} f={f} />
              ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && void apply(confirm)}
        tone="primary"
        loading={!!busy}
        title={t('aiCase.actions.applyTitle')}
        confirmLabel={t('aiCase.actions.apply')}
        message={confirm ? t('aiCase.actions.applyBody', { field: t(`aiCase.fields.${confirm.suggestedFix?.field ?? ''}`, { defaultValue: confirm.suggestedFix?.field }), value: showValue(confirm) }) : ''}
      />
    </div>
  );
};
