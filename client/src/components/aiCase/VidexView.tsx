import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, CheckCircle2, CircleDashed, ClipboardList, Copy, Download, FileQuestion, MessageCircleQuestion, PenLine, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { caseKey } from '@/components/admin/case/shared';
import { copyText, l10n, overviewKey, type ChecklistEntry, type FindingState, type Overview, type Run, type Section, type VidexField, type VidexResult } from './api';

const SECTIONS: Section[] = ['person', 'passport', 'contact', 'occupation', 'stay', 'employer', 'history'];
const CONF_STYLE = {
  high: 'bg-success-bg text-success-fg dark:bg-emerald-950/40 dark:text-emerald-300',
  medium: 'bg-warning-bg text-warning-fg dark:bg-amber-950/40 dark:text-amber-300',
  low: 'bg-danger-bg text-danger-fg dark:bg-red-950/40 dark:text-red-300',
};

/** Copy-friendly VIDEX data sheet: every field with source, confidence, copy and edit; gaps can be asked from the client. */
export const VidexView = ({ caseId, run, states }: { caseId: string; run: Run<VidexResult>; states: FindingState[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const r = run.result;
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const missingRequired = r.fields.filter((f) => f.required && !f.value);
  const shown = onlyMissing ? r.fields.filter((f) => !f.value) : r.fields;

  const setRun = (next: Run<VidexResult>) => qc.setQueryData<Overview>(overviewKey(caseId), (o) => (o ? { ...o, runs: { ...o.runs, VIDEX: next } } : o));
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

  const save = (f: VidexField) =>
    act(`save:${f.key}`, async () => {
      const res = await api.patch<{ run: Run<VidexResult> }>(`/admin/cases/${caseId}/ai/videx/${run.id}/fields`, { key: f.key, value: draft });
      setRun(res.data.run);
      setEditing(null);
      toast.success(t('aiCase.videx.saved'));
    });

  const ask = (keys: string[]) =>
    act('ask', async () => {
      await api.post(`/admin/cases/${caseId}/ai/videx/${run.id}/ask`, { keys });
      setSelected([]);
      toast.success(t('aiCase.videx.asked'));
      void qc.invalidateQueries({ queryKey: caseKey(caseId) });
    });

  const copy = async (v: string) => {
    if (await copyText(v)) toast.success(t('aiCase.actions.copied'));
  };

  const requestItem = (c: ChecklistEntry) =>
    act(`req:${c.key}`, async () => {
      const res = await api.post<{ states: FindingState[] }>(`/admin/cases/${caseId}/ai/findings/request-document`, { runId: run.id, checklistKey: c.key });
      setStates(res.data.states);
      toast.success(t('aiCase.actions.requested'));
      void qc.invalidateQueries({ queryKey: caseKey(caseId) });
    });

  const taskItem = (c: ChecklistEntry) =>
    act(`task:${c.key}`, async () => {
      const res = await api.post<{ task: { key: string } }>(`/admin/cases/${caseId}/ai/tasks`, { runId: run.id, target: 'checklist', key: c.key });
      toast.success(t('aiCase.actions.taskCreated', { key: res.data.task.key }));
    });

  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className={clsx('min-w-0 flex-1 text-sm font-semibold', missingRequired.length ? 'text-warning-fg dark:text-amber-300' : 'text-success-fg dark:text-emerald-300')}>
          {missingRequired.length ? t('aiCase.videx.missing', { count: missingRequired.length }) : t('aiCase.videx.complete')}
        </p>
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          {t('aiCase.videx.onlyMissing')}
        </label>
        {!!selected.length && (
          <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => void ask(selected)}>
            {busy === 'ask' ? <Spinner className="size-3.5" /> : <MessageCircleQuestion className="size-3.5" aria-hidden />} {t('aiCase.videx.askSelected', { count: selected.length })}
          </button>
        )}
        <a className="btn-secondary btn-sm" href={`/api/admin/cases/${caseId}/ai/videx/${run.id}/pdf`} download>
          <Download className="size-3.5" aria-hidden /> {t('aiCase.videx.pdf')}
        </a>
      </div>
      <p className="text-xs text-muted">{t('aiCase.videx.hint')}</p>

      {SECTIONS.map((s) => {
        const rows = shown.filter((f) => f.section === s);
        if (!rows.length) return null;
        return (
          <section key={s}>
            <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-ink uppercase">{t(`aiCase.videx.sections.${s}`)}</h4>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {rows.map((f) => (
                <li key={f.key} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2', !f.value && f.required && 'bg-warning-bg/70 dark:bg-amber-950/30')}>
                  <div className="w-full min-w-0 sm:w-56 sm:shrink-0">
                    <p className="text-sm font-medium text-ink">{l10n(f.label)}</p>
                    <p className="text-[11px] text-muted">
                      {f.label.de}
                      {f.required && !f.value ? ` · ${t('aiCase.videx.required')}` : ''}
                    </p>
                  </div>
                  {editing === f.key ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <input className="input min-w-0 flex-1" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save(f)} aria-label={l10n(f.label)} autoFocus />
                      <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => void save(f)} aria-label={t('aiCase.videx.save')}>
                        {busy === `save:${f.key}` ? <Spinner className="size-3.5" /> : <Check className="size-3.5" aria-hidden />}
                      </button>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(null)} aria-label={t('aiCase.actions.cancel')}>
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className={clsx('min-w-0 flex-1 font-mono text-sm break-words', f.value ? 'text-ink' : 'text-muted italic')}>{f.value || t('aiCase.videx.empty')}</p>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        {f.source && <span className="badge bg-sunken text-muted">{t(`aiCase.videx.sourceLabel.${f.source}`)}</span>}
                        {f.confidence && f.value && <span className={clsx('badge', CONF_STYLE[f.confidence])}>{t(`aiCase.videx.confidence.${f.confidence}`)}</span>}
                        {f.value && (
                          <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" onClick={() => void copy(f.value)} title={t('aiCase.actions.copy')} aria-label={`${t('aiCase.actions.copy')}: ${l10n(f.label)}`}>
                            <Copy className="size-3.5" aria-hidden />
                          </button>
                        )}
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"
                          onClick={() => {
                            setEditing(f.key);
                            setDraft(f.value);
                          }}
                          title={t('aiCase.videx.edit')}
                          aria-label={`${t('aiCase.videx.edit')}: ${l10n(f.label)}`}
                        >
                          <PenLine className="size-3.5" aria-hidden />
                        </button>
                        {!f.value && f.askClient && (
                          <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2 text-xs font-semibold text-ink">
                            <input type="checkbox" className="size-3.5 accent-primary" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} />
                            {t('aiCase.videx.ask')}
                          </label>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section>
        <h4 className="mb-1 text-xs font-semibold tracking-wide text-ink uppercase">{t('aiCase.videx.checklist')}</h4>
        <p className="mb-2 text-[11px] text-muted">{l10n(r.checklistNote)}</p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {r.checklist.map((c) => {
            const st = states.find((s) => s.kind === 'VIDEX' && s.key === `checklist:${c.key}`);
            return (
              <li key={c.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                {c.status === 'present' ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success-fg" aria-hidden />
                ) : (
                  <CircleDashed className={clsx('size-4 shrink-0', c.status === 'missing' ? 'text-warning-fg' : 'text-muted')} aria-hidden />
                )}
                <span className="min-w-0 flex-1 text-sm text-ink">{l10n(c.label)}</span>
                <span className="badge bg-sunken text-muted">{st ? t(`aiCase.state.${st.status}`) : t(`aiCase.videx.checklistStatus.${c.status}`)}</span>
                {c.status !== 'present' && !st && (
                  <span className="flex gap-1">
                    {c.requirementKey && (
                      <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void requestItem(c)}>
                        {busy === `req:${c.key}` ? <Spinner className="size-3.5" /> : <FileQuestion className="size-3.5" aria-hidden />} {t('aiCase.videx.requestDoc')}
                      </button>
                    )}
                    <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void taskItem(c)} aria-label={t('aiCase.actions.task')} title={t('aiCase.actions.task')}>
                      {busy === `task:${c.key}` ? <Spinner className="size-3.5" /> : <ClipboardList className="size-3.5" aria-hidden />}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};
