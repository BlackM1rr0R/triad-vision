import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, Building2, Check, ExternalLink, FileSignature, FileUp, Mail, Rocket, Send, XCircle } from 'lucide-react';
import { api, fileUrl, formatBytes } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesRecognition } from '@/i18n/pagesRecognition';
import { Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime, toastError } from '@/components/admin/labels';
import { Modal } from '@/components/ui/Modal';
import { TONE_CLASS } from '@/components/ui/status';
import { ACCEL_CHANNELS, dayOf, euro, todayIso, type AcceleratedProcedure, type CaseAccelerated, type CaseDoc } from './api';
import { DeadlineChip } from './RecognitionPanel';

registerCopy(pagesRecognition);

const key = (caseId: string) => ['case-accelerated', caseId] as const;
const MAX_MAIL_BYTES = 18 * 1024 * 1024;

/**
 * Admin case card (Sənədlər tab, #case-81a): the accelerated skilled-worker procedure (§ 81a AufenthG) as a
 * guided stepper — each step says what has to happen next and offers the action (Vollmacht by e-signature,
 * uploads, the submission e-mail, fee, pre-approval → embassy deadlines) — plus deadlines and the
 * correspondence log with the authority / embassy.
 */
export const AcceleratedPanel = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key(caseId), queryFn: async () => (await api.get<CaseAccelerated>(`/admin/accelerated/cases/${caseId}`)).data });
  const [authority, setAuthority] = useState('');
  const [authorityEmail, setAuthorityEmail] = useState('');
  const start = useMutation({
    mutationFn: async () => api.post(`/admin/accelerated/cases/${caseId}`, { authority: authority.trim() || null, authorityEmail: authorityEmail.trim() || null }),
    onSuccess: () => (toast.success(t('accel.started')), qc.invalidateQueries({ queryKey: key(caseId) })),
    onError: (e) => toastError(e),
  });
  const d = q.data;
  if (!d) return null;
  return (
    <Panel id="case-81a" title={t('accel.title')} icon={Rocket} bodyClassName="p-4 sm:p-5 space-y-4">
      <p className="text-xs text-muted">{t('accel.hint')}</p>
      {d.company && (
        <p className="flex items-center gap-1.5 text-xs text-ink/80">
          <Building2 className="size-3.5 text-muted" aria-hidden /> {t('accel.company')}: <span className="font-semibold">{d.company.name}</span>
        </p>
      )}
      {!d.procedure ? (
        !d.canStart ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">{t('accel.needCompany')}</p>
        ) : (
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate();
            }}
          >
            <label className="block">
              <span className="label">{t('accel.fields.authority')}</span>
              <input className="input" value={authority} maxLength={200} onChange={(e) => setAuthority(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">{t('accel.fields.authorityEmail')}</span>
              <input type="email" className="input" value={authorityEmail} maxLength={190} onChange={(e) => setAuthorityEmail(e.target.value)} />
            </label>
            <button type="submit" className="btn-primary btn-sm" disabled={start.isPending}>
              <Rocket className="size-3.5" aria-hidden /> {t('accel.start')}
            </button>
          </form>
        )
      ) : (
        <Procedure d={d} p={d.procedure} caseId={caseId} />
      )}
    </Panel>
  );
};

export default AcceleratedPanel;

const Procedure = ({ d, p, caseId }: { d: CaseAccelerated; p: AcceleratedProcedure; caseId: string }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key(caseId) });
    void qc.invalidateQueries({ queryKey: ['my-work'] });
  };
  const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'az' ? 'az-Latn-AZ' : 'de-DE';
  const step = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.post(`/admin/accelerated/${p.id}/step`, body),
    onSuccess: () => (toast.success(t('accel.action.done')), refresh()),
    onError: (e) => toastError(e),
  });
  const vollmacht = useMutation({
    mutationFn: async () => api.post(`/admin/accelerated/${p.id}/vollmacht`),
    onSuccess: () => (toast.success(t('accel.action.vollmachtSent')), refresh()),
    onError: (e) => toastError(e),
  });
  const [composing, setComposing] = useState(false);
  const [date, setDate] = useState('');
  const [appointment, setAppointment] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const withDate = (action: string, extra: Record<string, unknown> = {}) => step.mutate({ action, ...(date ? { date } : {}), ...extra });

  // Required action of the current step.
  const current = p.status;
  let action: ReactNode = null;
  if (!p.final) {
    switch (current) {
      case 'PREPARING':
        action = (
          <div className="flex flex-wrap items-center gap-2">
            {p.vollmacht && p.vollmacht.status === 'SENT' ? (
              <span className="badge bg-warning-bg text-warning-fg">
                <FileSignature className="size-3" aria-hidden /> {t('accel.action.vollmachtPending')} · {fmtDate(p.vollmacht.sentAt)}
              </span>
            ) : (
              <button type="button" className="btn-primary btn-sm" disabled={vollmacht.isPending} onClick={() => vollmacht.mutate()}>
                <FileSignature className="size-3.5" aria-hidden /> {t('accel.action.sendVollmacht')}
              </button>
            )}
            <UploadButton procedureId={p.id} kind="POWER_OF_ATTORNEY" label={t('accel.action.uploadVollmacht')} date={date} onDone={refresh} />
          </div>
        );
        break;
      case 'POWER_OF_ATTORNEY':
        action = <UploadButton procedureId={p.id} kind="AGREEMENT" label={t('accel.action.uploadAgreement')} date={date} onDone={refresh} primary />;
        break;
      case 'AGREEMENT_SIGNED':
        action = (
          <button type="button" className="btn-primary btn-sm" onClick={() => setComposing(true)}>
            <Mail className="size-3.5" aria-hidden /> {t('accel.action.compose')}
          </button>
        );
        break;
      case 'SUBMITTED':
        action = <StepButton label={t('accel.action.feeRequested')} onClick={() => withDate('FEE_REQUESTED')} busy={step.isPending} />;
        break;
      case 'FEE_REQUESTED':
        action = <StepButton label={t('accel.action.feePaid')} onClick={() => withDate('FEE_PAID')} busy={step.isPending} />;
        break;
      case 'FEE_PAID':
        action = <StepButton label={t('accel.action.inReview')} onClick={() => withDate('IN_REVIEW')} busy={step.isPending} />;
        break;
      case 'IN_REVIEW':
        action = <UploadButton procedureId={p.id} kind="PRE_APPROVAL" label={t('accel.action.uploadPreApproval')} date={date} onDone={refresh} primary />;
        break;
      case 'PRE_APPROVAL':
        action = (
          <div className="space-y-2">
            {p.appointmentDeadline && <p className="rounded-lg bg-primary/[0.06] px-3 py-2 text-xs text-link">{t('accel.action.notifyEmbassyPrompt', { date: fmtDate(p.appointmentDeadline) })}</p>}
            <StepButton label={t('accel.action.notifyEmbassy')} onClick={() => withDate('EMBASSY_NOTIFIED')} busy={step.isPending} />
          </div>
        );
        break;
      case 'SENT_TO_EMBASSY':
        action = (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="label">{t('accel.status.APPOINTMENT_BOOKED')}</span>
              <input type="datetime-local" className="input" value={appointment} onChange={(e) => setAppointment(e.target.value)} />
            </label>
            <button type="button" className="btn-primary btn-sm" disabled={!appointment || step.isPending} onClick={() => step.mutate({ action: 'APPOINTMENT', appointmentAt: new Date(appointment).toISOString() })}>
              <Check className="size-3.5" aria-hidden /> {t('accel.action.setAppointment')}
            </button>
          </div>
        );
        break;
      case 'APPOINTMENT_BOOKED':
        action = (
          <div className="flex flex-wrap gap-2">
            <StepButton label={t('accel.action.visaDecided')} onClick={() => withDate('DECIDED', { outcome: 'VISA_DECIDED' })} busy={step.isPending} />
            <button type="button" className="btn-secondary btn-sm text-danger-fg" disabled={step.isPending} onClick={() => withDate('DECIDED', { outcome: 'REJECTED' })}>
              <XCircle className="size-3.5" aria-hidden /> {t('accel.action.rejected')}
            </button>
          </div>
        );
        break;
      default:
        break;
    }
  }

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {p.steps.map((s, i) => (
          <li
            key={s.status}
            className={clsx(
              'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
              s.current && !p.final ? 'border-line-strong bg-primary/[0.06] font-semibold text-link' : s.done ? 'border-line bg-surface/60 text-ink/80' : 'border-dashed border-line text-muted',
            )}
            aria-current={s.current ? 'step' : undefined}
          >
            <span className={clsx('grid size-5 shrink-0 place-items-center rounded-full text-[10px] tabular-nums', s.done ? 'bg-primary text-primary-contrast' : 'bg-sunken text-muted')}>{s.done ? <Check className="size-3" aria-hidden /> : i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{t(`accel.status.${s.status}`)}</span>
            {s.at && <span className="shrink-0 text-[10px] text-muted tabular-nums">{fmtDate(s.at)}</span>}
          </li>
        ))}
      </ol>
      {(p.status === 'REJECTED' || p.status === 'CANCELLED') && <p className={clsx('badge', TONE_CLASS.danger)}>{t(`accel.status.${p.status}`)}</p>}

      {/* Current step: what to do */}
      {!p.final && (
        <div className="rounded-xl border border-primary/25 bg-card p-3">
          <p className="text-sm font-semibold text-ink">{t(`accel.status.${p.status}`)}</p>
          <p className="mt-0.5 text-xs text-ink/80">{t(`accel.todo.${p.status}`, { defaultValue: '' })}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {action}
            {current !== 'SENT_TO_EMBASSY' && (
              <label className="block">
                <span className="label">{t('accel.fields.date')}</span>
                <input type="date" className="input py-1 text-xs" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
              </label>
            )}
          </div>
          {p.employerTodos.length > 0 && (
            <ul className="mt-3 space-y-1">
              {p.employerTodos.map((todo) => (
                <li key={todo} className="flex items-center gap-1.5 text-xs text-warning-fg">
                  <Building2 className="size-3.5" aria-hidden /> {t(`accel.employerTodo.${todo}`)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 border-t border-line pt-2">
            {cancelling ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (cancelReason.trim().length >= 3) step.mutate({ action: 'CANCEL', reason: cancelReason.trim() }, { onSuccess: () => setCancelling(false) });
                }}
              >
                <input className="input min-w-0 flex-1 py-1 text-xs" placeholder={t('accel.action.cancelReason')} value={cancelReason} maxLength={2000} onChange={(e) => setCancelReason(e.target.value)} />
                <button type="submit" className="btn-secondary btn-sm text-danger-fg" disabled={cancelReason.trim().length < 3 || step.isPending}>
                  {t('accel.action.cancel')}
                </button>
              </form>
            ) : (
              <button type="button" className="btn-secondary btn-sm text-xs text-muted" onClick={() => setCancelling(true)}>
                <XCircle className="size-3.5" aria-hidden /> {t('accel.action.cancel')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Details p={p} caseId={caseId} locale={locale} />
        <section>
          <h4 className="mb-2 text-sm font-semibold text-ink">{t('accel.deadlines.title')}</h4>
          {p.deadlines.length === 0 ? (
            <p className="text-xs text-muted">{t('accel.deadlines.none')}</p>
          ) : (
            <ul className="space-y-1.5">
              {p.deadlines.map((dl) => (
                <li key={`${dl.kind}-${dl.at}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface/60 px-3 py-2 text-sm">
                  <span>{t(`accel.deadlines.kind.${dl.kind}`)}</span>
                  <DeadlineChip at={dl.at} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Correspondence d={d} p={p} caseId={caseId} />
      {composing && <SubmissionDialog procedureId={p.id} documents={d.documents} onClose={() => setComposing(false)} onSent={refresh} />}
    </div>
  );
};

const StepButton = ({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) => (
  <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={onClick}>
    <Check className="size-3.5" aria-hidden /> {label}
  </button>
);

const UploadButton = ({ procedureId, kind, label, date, onDone, primary }: { procedureId: string; kind: string; label: string; date: string; onDone: () => void; primary?: boolean }) => {
  const { t } = useTranslation();
  const [inputKey, setInputKey] = useState(0);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      if (date) form.append('date', date);
      return api.post(`/admin/accelerated/${procedureId}/documents`, form);
    },
    onSuccess: () => (toast.success(t('accel.action.done')), setInputKey((k) => k + 1), onDone()),
    onError: (e) => toastError(e),
  });
  return (
    <label className={clsx(primary ? 'btn-primary' : 'btn-secondary', 'btn-sm cursor-pointer', upload.isPending && 'pointer-events-none opacity-60')}>
      <FileUp className="size-3.5" aria-hidden /> {label}
      <input key={inputKey} type="file" className="sr-only" accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
    </label>
  );
};

const Details = ({ p, caseId, locale }: { p: AcceleratedProcedure; caseId: string; locale: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const init = () => ({ authority: p.authority ?? '', authorityEmail: p.authorityEmail ?? '', reference: p.reference ?? '', fee: p.feeCents != null ? String(p.feeCents / 100) : '', note: p.note ?? '' });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(f) !== JSON.stringify(init());
  const save = useMutation({
    mutationFn: async () =>
      api.patch(`/admin/accelerated/${p.id}`, {
        authority: f.authority.trim() || null,
        authorityEmail: f.authorityEmail.trim() || null,
        reference: f.reference.trim() || null,
        feeCents: f.fee.trim() ? Math.round(Number(f.fee.replace(',', '.')) * 100) : null,
        note: f.note.trim() || null,
      }),
    onSuccess: () => (toast.success(t('accel.saved')), qc.invalidateQueries({ queryKey: key(caseId) })),
    onError: (e) => toastError(e),
  });
  const feeInvalid = f.fee.trim() !== '' && !Number.isFinite(Number(f.fee.replace(',', '.')));
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !feeInvalid) save.mutate();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t('accel.fields.authority')}</span>
          <input className="input" value={f.authority} maxLength={200} onChange={(e) => setF({ ...f, authority: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">{t('accel.fields.authorityEmail')}</span>
          <input type="email" className="input" value={f.authorityEmail} maxLength={190} onChange={(e) => setF({ ...f, authorityEmail: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">{t('accel.fields.reference')}</span>
          <input className="input" value={f.reference} maxLength={120} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">
            {t('accel.fields.fee')} <span className="text-muted">({euro(p.feeCents, locale)})</span>
          </span>
          <input className={clsx('input tabular-nums', feeInvalid && 'border-danger')} inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
        </label>
      </div>
      <label className="block">
        <span className="label">{t('accel.fields.note')}</span>
        <textarea className="input min-h-14" value={f.note} maxLength={5000} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </label>
      <button type="submit" className="btn-secondary btn-sm" disabled={!dirty || feeInvalid || save.isPending}>
        {t('admin.common.save')}
      </button>
    </form>
  );
};

// ─── Correspondence ──────────────────────────────────────────────────

const Correspondence = ({ d, p, caseId }: { d: CaseAccelerated; p: AcceleratedProcedure; caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key(caseId) });
    void qc.invalidateQueries({ queryKey: ['my-work'] });
  };
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [channel, setChannel] = useState<(typeof ACCEL_CHANNELS)[number]>('LETTER');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const reset = () => {
    setSubject('');
    setBody('');
    setDueAt('');
    setFile(null);
    setInputKey((k) => k + 1);
  };
  const add = useMutation({
    mutationFn: async () => {
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('kind', direction === 'IN' ? 'LETTER_IN' : 'LETTER_OUT');
        form.append('channel', channel);
        if (subject.trim()) form.append('subject', subject.trim());
        if (dueAt) form.append('dueAt', dueAt);
        return api.post(`/admin/accelerated/${p.id}/documents`, form);
      }
      return api.post(`/admin/accelerated/${p.id}/messages`, { direction, channel, subject: subject.trim() || null, body: body.trim() || null, dueAt: dueAt || null });
    },
    onSuccess: () => (toast.success(t('accel.messages.added')), reset(), refresh()),
    onError: (e) => toastError(e),
  });
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">{t('accel.messages.title')}</h4>
      <form
        className="grid gap-2 rounded-xl border border-dashed border-line p-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (subject.trim() || body.trim() || file) add.mutate();
        }}
      >
        <select className="input py-1 text-xs" aria-label="direction" value={direction} onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}>
          {(['IN', 'OUT'] as const).map((x) => (
            <option key={x} value={x}>
              {t(`accel.messages.direction.${x}`)}
            </option>
          ))}
        </select>
        <select className="input py-1 text-xs" aria-label="channel" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
          {ACCEL_CHANNELS.map((x) => (
            <option key={x} value={x}>
              {t(`accel.messages.channel.${x}`)}
            </option>
          ))}
        </select>
        <input className="input py-1 text-xs sm:col-span-2" placeholder={t('accel.messages.subject')} value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} />
        {!file && <textarea className="input min-h-14 text-xs sm:col-span-4" placeholder={t('accel.messages.body')} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)} />}
        <label className="block sm:col-span-2">
          <span className="label">{t('accel.messages.file')}</span>
          <input key={inputKey} type="file" className="text-xs" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="block">
          <span className="label">{t('accel.messages.dueAt')}</span>
          <input type="date" className="input py-1 text-xs" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn-secondary btn-sm w-full" disabled={add.isPending || (!subject.trim() && !body.trim() && !file)}>
            {t('accel.messages.add')}
          </button>
        </div>
      </form>
      {d.messages.length === 0 ? (
        <p className="text-xs text-muted">{t('accel.messages.none')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {d.messages.map((m) => (
            <li key={m.id} className="flex gap-3 px-3 py-2.5 text-sm">
              <span className={clsx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', m.direction === 'IN' ? 'bg-info-bg text-info-fg' : 'bg-primary/10 text-link')} title={t(`accel.messages.direction.${m.direction}`)}>
                {m.direction === 'IN' ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words text-ink">{m.subject || t(`accel.messages.direction.${m.direction}`)}</p>
                {m.body && <p className="mt-0.5 line-clamp-3 text-xs break-words whitespace-pre-line text-muted">{m.body}</p>}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                  <span>{t(`accel.messages.channel.${m.channel}`)}</span>
                  <span>{fmtDateTime(m.at)}</span>
                  {m.actor && <span>{m.actor}</span>}
                  {m.dueAt && <span className="font-semibold text-warning-fg">{t('accel.messages.due', { date: fmtDate(m.dueAt) })}</span>}
                  {m.documentId && (
                    <a href={fileUrl(m.documentId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-link hover:underline">
                      <ExternalLink className="size-3" aria-hidden /> PDF
                    </a>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ─── Submission e-mail ───────────────────────────────────────────────

interface Draft {
  to: string;
  subject: string;
  body: string;
  documentIds: string[];
}

const SubmissionDialog = ({ procedureId, documents, onClose, onSent }: { procedureId: string; documents: CaseDoc[]; onClose: () => void; onSent: () => void }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['accelerated-submission', procedureId], queryFn: async () => (await api.get<{ draft: Draft }>(`/admin/accelerated/${procedureId}/submission`)).data.draft, staleTime: Infinity });
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (q.data && !draft) setDraft(q.data);
  }, [q.data, draft]);
  const send = useMutation({
    mutationFn: async () => api.post(`/admin/accelerated/${procedureId}/submission`, draft),
    onSuccess: () => (toast.success(t('accel.submission.sent')), onSent(), onClose()),
    onError: (e) => toastError(e),
  });
  const bytes = draft ? documents.filter((x) => draft.documentIds.includes(x.id)).reduce((a, x) => a + (x.size ?? 0), 0) : 0;
  const tooLarge = bytes > MAX_MAIL_BYTES;
  const valid = !!draft && /\S+@\S+\.\S+/.test(draft.to) && draft.subject.trim().length >= 3 && draft.body.trim().length >= 10 && !tooLarge;
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      mobile="full"
      title={t('accel.submission.title')}
      busy={send.isPending}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || send.isPending} onClick={() => send.mutate()}>
            <Send className="size-3.5" aria-hidden /> {t('accel.submission.send')}
          </button>
        </>
      }
    >
      {!draft ? (
        <p className="text-sm text-muted">{t('admin.common.loading')}</p>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="label">{t('accel.submission.to')}</span>
            <input type="email" className="input" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">{t('accel.submission.subject')}</span>
            <input className="input" value={draft.subject} maxLength={300} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">{t('accel.submission.body')}</span>
            <textarea className="input min-h-64 font-mono text-xs" value={draft.body} maxLength={20000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <fieldset>
            <legend className="label">
              {t('accel.submission.attachments')} <span className={clsx('tabular-nums', tooLarge ? 'text-danger-fg' : 'text-muted')}>({formatBytes(bytes)})</span>
            </legend>
            {tooLarge && <p className="text-xs text-danger-fg">{t('accel.submission.tooLarge')}</p>}
            <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {documents.map((x) => (
                <li key={x.id}>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draft.documentIds.includes(x.id)}
                      onChange={(e) => setDraft({ ...draft, documentIds: e.target.checked ? [...draft.documentIds, x.id] : draft.documentIds.filter((id) => id !== x.id) })}
                    />
                    <span className="min-w-0 flex-1 truncate">{x.name}</span>
                    <span className="text-muted tabular-nums">{x.size != null ? formatBytes(x.size) : ''}</span>
                    <span className="text-muted">{dayOf(x.createdAt)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </div>
      )}
    </Modal>
  );
};
