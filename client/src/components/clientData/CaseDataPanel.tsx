import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, Bell, Check, CheckCircle2, ClipboardList, Eye, Paperclip, RotateCcw, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail, L10n } from '@/lib/types';
import { Drawer } from '@/components/admin/Drawer';
import { EmptyState, LoadingBlock, Panel } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { fmtDate, fmtDateTime, toastError } from '@/components/admin/labels';
import { caseKey } from '@/components/admin/case/shared';
import { nextStepKey, packageKey } from '@/components/caseNext/api';
import { caseFormsKey, confirmKey, CONFIRM_TONE, fetchConfirmation, type ConfirmationView, type FormStatus, type StaffForm } from './api';
import { FormRenderer } from './FormRenderer';
import { confirmDialog } from '@/components/ui/ConfirmHost';

const FORM_TONE: Record<FormStatus, string> = toneClasses(STATUS_TONES.form);

interface FormsData {
  forms: StaffForm[];
  templates: { id: string; key: string | null; title: L10n; description: L10n | null; fields: number }[];
}

// ─── Data confirmation ─────────────────────────────────────────────

const ConfirmationSection = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: confirmKey(caseId), queryFn: () => fetchConfirmation(caseId) });
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<ConfirmationView['preview'] | null>(null);

  const refresh = (v?: ConfirmationView) => {
    if (v) qc.setQueryData(confirmKey(caseId), v);
    void qc.invalidateQueries({ queryKey: nextStepKey(caseId) });
    void qc.invalidateQueries({ queryKey: packageKey(caseId) });
    void qc.invalidateQueries({ queryKey: caseKey(caseId) });
  };
  const run = async (key: string, fn: () => Promise<ConfirmationView>, ok?: string) => {
    setBusy(key);
    try {
      refresh(await fn());
      if (ok) toast.success(ok);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !data) return <LoadingBlock className="min-h-24" />;
  const { state, confirmation: conf } = data;
  const canAsk = state.state !== 'PENDING';
  const ask = () => run('ask', async () => (await api.post<ConfirmationView>(`/admin/cases/${caseId}/data-confirmation`, {})).data, t('clientData.admin.confirm.asked'));
  const decide = (key: string, decision: 'ACCEPT' | 'REJECT') =>
    run(`decide:${key}`, async () => (await api.post<ConfirmationView>(`/admin/cases/${caseId}/data-confirmation/${conf!.id}/decide`, { decisions: [{ key, decision }] })).data);
  const openCorrections = conf?.items.filter((i) => i.answer && !i.answer.ok && !i.decision) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="size-4 text-link" aria-hidden /> {t('clientData.admin.confirm.title')}
          <span className={clsx('badge', CONFIRM_TONE[state.state])}>{t(`clientData.confirmStatus.${state.state}`)}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {canAsk && (
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={async () => setPreview((await fetchConfirmation(caseId, true)).preview ?? [])}>
              <Eye className="size-3.5" aria-hidden /> {t('clientData.admin.confirm.preview')}
            </button>
          )}
          {canAsk && (
            <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => void ask()}>
              {busy === 'ask' ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {state.state === 'NONE' ? t('clientData.admin.confirm.ask') : t('clientData.admin.confirm.askAgain')}
            </button>
          )}
          {state.state === 'PENDING' && conf && (
            <>
              <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void run('remind', async () => (await api.post<ConfirmationView>(`/admin/cases/${caseId}/data-confirmation/${conf.id}/remind`, {})).data, t('clientData.admin.reminded'))}>
                <Bell className="size-3.5" aria-hidden /> {t('clientData.admin.remind')}
              </button>
              <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={async () => (await confirmDialog({ message: t('ui.confirmDlg.cancelRequest'), confirmLabel: t('ui.confirmDlg.yesCancel') })) && void run('cancel', async () => (await api.delete<ConfirmationView>(`/admin/cases/${caseId}/data-confirmation/${conf.id}`)).data)}>
                <X className="size-3.5" aria-hidden /> {t('clientData.common.cancel')}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-muted">
        {t(`clientData.admin.confirm.hint.${state.state}`, { date: state.confirmedAt ? fmtDateTime(state.confirmedAt) : state.requestedAt ? fmtDateTime(state.requestedAt) : '' })}
        {state.state === 'STALE' && state.changedKeys.length > 0 && ` (${state.changedKeys.join(', ')})`}
      </p>

      {conf && conf.status !== 'PENDING' && (
        <>
          {conf.submittedAt && (
            <p className="text-[11px] text-muted">{t('clientData.admin.confirm.evidence', { date: fmtDateTime(conf.submittedAt), ip: conf.submitIp ?? '—' })}</p>
          )}
          {openCorrections.length > 0 && <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-fg dark:bg-amber-950/40 dark:text-amber-200">{t('clientData.admin.confirm.corrections', { count: openCorrections.length })}</p>}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="bg-sunken text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('clientData.admin.confirm.field')}</th>
                  <th className="px-3 py-2 font-semibold">{t('clientData.admin.confirm.sent')}</th>
                  <th className="px-3 py-2 font-semibold">{t('clientData.admin.confirm.client')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {conf.items.map((i) => (
                  <tr key={i.key} className={clsx(i.answer && !i.answer.ok && !i.decision && 'bg-warning-bg/50 dark:bg-amber-950/20')}>
                    <td className="px-3 py-2 align-top text-ink/80">{tr(i.label)}</td>
                    <td className="px-3 py-2 align-top font-mono break-all text-ink">{i.value || '—'}</td>
                    <td className="px-3 py-2 align-top">
                      {!i.answer ? (
                        <span className="text-muted">—</span>
                      ) : i.answer.ok ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-success-fg dark:text-emerald-300">
                          <CheckCircle2 className="size-3.5" aria-hidden /> {t('clientData.admin.confirm.ok')}
                        </span>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="font-mono font-semibold break-all text-warning-fg dark:text-amber-300">
                            <ArrowRight className="mr-1 inline size-3" aria-hidden />
                            {i.answer.correction.value}
                          </p>
                          {i.answer.proof && (
                            <a href={fileUrl(i.answer.proof.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                              <Paperclip className="size-3" aria-hidden /> {t('clientData.admin.confirm.proof')}
                            </a>
                          )}
                          {i.decision ? (
                            <p className={clsx('font-semibold', i.decision.decision === 'ACCEPTED' ? 'text-success-fg dark:text-emerald-300' : 'text-danger-fg dark:text-red-300')}>
                              {t(`clientData.admin.confirm.${i.decision.decision === 'ACCEPTED' ? 'accepted' : 'rejected'}`)} · {fmtDateTime(i.decision.at)}
                            </p>
                          ) : (
                            conf.status === 'SUBMITTED' && (
                              <div className="flex flex-wrap gap-1.5">
                                <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => void decide(i.key, 'ACCEPT')} title={i.profileTarget ? t('clientData.admin.confirm.acceptHint') : undefined}>
                                  {busy === `decide:${i.key}` ? <Spinner className="size-3" /> : <Check className="size-3" aria-hidden />} {t('clientData.admin.confirm.accept')}
                                </button>
                                <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void decide(i.key, 'REJECT')}>
                                  <X className="size-3" aria-hidden /> {t('clientData.admin.confirm.reject')}
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Drawer open={!!preview} onClose={() => setPreview(null)} title={t('clientData.admin.confirm.preview')}>
        <p className="mb-3 text-xs text-muted">{t('clientData.admin.confirm.previewHint')}</p>
        <dl className="divide-y divide-line rounded-lg border border-line">
          {(preview ?? []).map((f) => (
            <div key={f.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <dt className="text-xs text-muted">{tr(f.label)}</dt>
              <dd className={clsx('font-mono text-sm break-all', f.value ? 'text-ink' : 'text-warning-fg')}>{f.value || t('clientData.admin.confirm.empty')}</dd>
            </div>
          ))}
        </dl>
      </Drawer>
    </div>
  );
};

// ─── Questionnaires ────────────────────────────────────────────────

const FormReviewDrawer = ({ caseId, formId, onClose }: { caseId: string; formId: string | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-case-form', caseId, formId],
    queryFn: async () => (await api.get<{ form: StaffForm }>(`/admin/cases/${caseId}/forms/${formId}`)).data.form,
    enabled: !!formId,
    staleTime: 0,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [reopenNote, setReopenNote] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  useEffect(() => {
    if (data) setSelected(new Set(data.diff.filter((d) => d.changed).map((d) => d.target)));
  }, [data]);

  const after = (f: StaffForm) => {
    qc.setQueryData(['admin-case-form', caseId, formId], f);
    void qc.invalidateQueries({ queryKey: caseFormsKey(caseId) });
    void qc.invalidateQueries({ queryKey: caseKey(caseId) });
    void qc.invalidateQueries({ queryKey: confirmKey(caseId) });
  };

  const apply = async () => {
    setBusy('apply');
    try {
      const res = (await api.post<{ form: StaffForm; applied: unknown[] }>(`/admin/cases/${caseId}/forms/${formId}/apply`, { targets: [...selected] })).data;
      after(res.form);
      toast.success(t('clientData.admin.applied', { count: res.applied.length }));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };
  const reopen = async () => {
    setBusy('reopen');
    try {
      after((await api.post<{ form: StaffForm }>(`/admin/cases/${caseId}/forms/${formId}/reopen`, { note: reopenNote || null })).data.form);
      toast.success(t('clientData.admin.reopened'));
      setReopenOpen(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const changed = data?.diff.filter((d) => d.changed) ?? [];
  const reviewable = data && (data.status === 'SUBMITTED' || data.status === 'APPLIED');
  const footer = reviewable ? (
    <>
      <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => setReopenOpen((v) => !v)}>
        <RotateCcw className="size-3.5" aria-hidden /> {t('clientData.admin.reopen')}
      </button>
      <button type="button" className="btn-primary btn-sm" disabled={!!busy || !selected.size} onClick={() => void apply()}>
        {busy === 'apply' ? <Spinner className="size-3.5" /> : <Check className="size-3.5" aria-hidden />} {t('clientData.admin.apply', { count: selected.size })}
      </button>
    </>
  ) : undefined;

  return (
    <Drawer open={!!formId} onClose={onClose} title={data ? tr(data.title) : t('clientData.admin.review')} footer={footer}>
      {isLoading || !data ? (
        <LoadingBlock className="min-h-[20vh]" />
      ) : (
        <div className="space-y-5">
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span className={clsx('badge', FORM_TONE[data.status])}>{t(`clientData.status.${data.status}`)}</span>
            <span>{t('clientData.admin.sentAt', { date: fmtDateTime(data.sentAt) })}</span>
            {data.submittedAt && <span>{t('clientData.admin.submittedAt', { date: fmtDateTime(data.submittedAt) })}</span>}
            {data.appliedAt && <span>{t('clientData.admin.appliedAt', { date: fmtDateTime(data.appliedAt) })}</span>}
          </p>
          {reopenOpen && (
            <div className="space-y-2 rounded-lg border border-line p-3">
              <label className="block text-xs font-semibold text-ink/80">
                {t('clientData.admin.reopenNote')}
                <textarea className="input mt-1 w-full" rows={2} maxLength={1000} value={reopenNote} onChange={(e) => setReopenNote(e.target.value)} />
              </label>
              <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => void reopen()}>
                {busy === 'reopen' ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('clientData.admin.reopenSend')}
              </button>
            </div>
          )}
          {reviewable && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">{t('clientData.admin.diffTitle')}</h3>
              {!data.diff.length ? (
                <p className="text-xs text-muted">{t('clientData.admin.noMapped')}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[30rem] text-left text-xs">
                    <thead className="bg-sunken text-muted">
                      <tr>
                        <th className="w-8 px-2 py-2" />
                        <th className="px-2 py-2 font-semibold">{t('clientData.admin.target')}</th>
                        <th className="px-2 py-2 font-semibold">{t('clientData.admin.current')}</th>
                        <th className="px-2 py-2 font-semibold">{t('clientData.admin.new')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.diff.map((d) => (
                        <tr key={d.target} className={clsx(!d.changed && 'opacity-60')}>
                          <td className="px-2 py-2 align-top">
                            <input
                              type="checkbox"
                              className="size-4"
                              disabled={!d.changed}
                              checked={selected.has(d.target)}
                              aria-label={tr(d.targetLabel)}
                              onChange={(e) => setSelected((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(d.target);
                                else n.delete(d.target);
                                return n;
                              })}
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <span className="font-semibold text-ink">{tr(d.targetLabel)}</span>
                            <span className="block text-[10px] text-muted">{d.target}</span>
                          </td>
                          <td className="px-2 py-2 align-top break-words text-muted">{d.before.value || '—'}</td>
                          <td className="px-2 py-2 align-top break-words font-semibold text-ink">{d.after.value}{!d.changed && <span className="ml-1 font-normal text-muted">({t('clientData.admin.unchanged')})</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {changed.length === 0 && data.diff.length > 0 && <p className="mt-2 text-xs text-muted">{t('clientData.admin.nothingToApply')}</p>}
            </section>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t('clientData.admin.answers')}</h3>
            <div className="rounded-lg border border-line p-3">
              <FormRenderer fields={data.fields} answers={data.answers} readOnly caseId={caseId} fileNames={data.files} />
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
};

const FormsSection = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: caseFormsKey(caseId), queryFn: async () => (await api.get<FormsData>(`/admin/cases/${caseId}/forms`)).data });
  const [templateId, setTemplateId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: caseFormsKey(caseId) });
  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !data) return <LoadingBlock className="min-h-24" />;
  const forms = data.forms.filter((f) => f.status !== 'CANCELLED');

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ClipboardList className="size-4 text-link" aria-hidden /> {t('clientData.admin.forms')}
      </h3>
      <div className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-xs font-semibold text-ink/80">
          {t('clientData.admin.chooseTemplate')}
          <select className="input mt-1 w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t('clientData.common.choose')}</option>
            {data.templates.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tr(tp.title)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-ink/80">
          {t('clientData.admin.noteForClient')}
          <input className="input mt-1 w-full" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={!templateId || !!busy}
          onClick={() =>
            void act(
              'send',
              async () => {
                await api.post(`/admin/cases/${caseId}/forms`, { templateId, note: note || null });
                setTemplateId('');
                setNote('');
              },
              t('clientData.admin.sent'),
            )
          }
        >
          {busy === 'send' ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('clientData.admin.send')}
        </button>
      </div>
      {!forms.length ? (
        <EmptyState icon={ClipboardList} title={t('clientData.admin.noForms')} />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {forms.map((f) => {
            const open = f.status === 'SENT' || f.status === 'DRAFT';
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold break-words text-ink">{tr(f.title)}</p>
                  <p className="text-[11px] text-muted">
                    {t('clientData.admin.sentAt', { date: fmtDate(f.sentAt) })}
                    {f.submittedAt && ` · ${t('clientData.admin.submittedAt', { date: fmtDate(f.submittedAt) })}`}
                    {f.reminders > 0 && ` · ${t('clientData.admin.reminders', { count: f.reminders })}`}
                  </p>
                </div>
                <span className={clsx('badge', FORM_TONE[f.status])}>{t(`clientData.status.${f.status}`)}</span>
                <div className="flex gap-1.5">
                  <button type="button" className={clsx('btn-sm', f.status === 'SUBMITTED' ? 'btn-primary' : 'btn-secondary')} onClick={() => setReview(f.id)}>
                    <Eye className="size-3.5" aria-hidden /> {f.status === 'SUBMITTED' ? t('clientData.admin.review') : t('clientData.admin.view')}
                  </button>
                  {open && (
                    <button type="button" className="btn-secondary btn-sm" disabled={!!busy} aria-label={t('clientData.admin.remind')} title={t('clientData.admin.remind')} onClick={() => void act(`remind:${f.id}`, () => api.post(`/admin/cases/${caseId}/forms/${f.id}/remind`, {}), t('clientData.admin.reminded'))}>
                      {busy === `remind:${f.id}` ? <Spinner className="size-3.5" /> : <Bell className="size-3.5" aria-hidden />}
                    </button>
                  )}
                  {f.status !== 'APPLIED' &&
                    (cancel === f.id ? (
                      <button type="button" className="btn-sm rounded-md bg-danger px-2.5 text-white hover:bg-danger/90" disabled={!!busy} onClick={() => void act(`cancel:${f.id}`, () => api.delete(`/admin/cases/${caseId}/forms/${f.id}`)).then(() => setCancel(null))}>
                        <Trash2 className="size-3.5" aria-hidden /> {t('clientData.admin.cancelConfirm')}
                      </button>
                    ) : (
                      <button type="button" className="btn-secondary btn-sm" aria-label={t('clientData.admin.cancelForm')} title={t('clientData.admin.cancelForm')} onClick={() => setCancel(f.id)}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormReviewDrawer caseId={caseId} formId={review} onClose={() => setReview(null)} />
    </div>
  );
};

/** Admin case page: "Client data" — data confirmation before the embassy + smart questionnaires. */
export default function CaseDataPanel({ c }: { c: CaseDetail }) {
  const { t } = useTranslation();
  return (
    <Panel id="case-data" className="scroll-mt-24" title={t('clientData.admin.panelTitle')} icon={ShieldCheck}>
      <div className="space-y-6">
        <ConfirmationSection caseId={c.id} />
        <FormsSection caseId={c.id} />
      </div>
    </Panel>
  );
}
