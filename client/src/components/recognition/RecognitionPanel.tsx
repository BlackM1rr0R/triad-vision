import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarClock, ChevronDown, ExternalLink, FileUp, GraduationCap, Mail, Plus, Receipt, RefreshCw, StickyNote, Trash2 } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesRecognition } from '@/i18n/pagesRecognition';
import { Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime, toastError } from '@/components/admin/labels';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { TONE_CLASS } from '@/components/ui/status';
import {
  ADAPTATION_MEASURES,
  CHECK_KEYS,
  PROCEDURE_TYPES,
  RECOGNITION_STATUSES,
  STATUS_TONE,
  dayOf,
  daysLeft,
  euro,
  type CaseDoc,
  type CaseRecognition,
  type ChecklistItem,
  type ProcedureType,
  type RecognitionProcess,
} from './api';

registerCopy(pagesRecognition);

const key = (caseId: string) => ['case-recognition', caseId] as const;
const DEFICIT_STATUSES = ['DEFICIT_NOTICE', 'ADAPTATION', 'PARTIALLY_RECOGNISED'];

export const DeadlineChip = ({ at }: { at: string }) => {
  const { t } = useTranslation();
  const left = daysLeft(at);
  const tone = left < 0 ? 'danger' : left <= 7 ? 'warning' : 'neutral';
  return (
    <span className={clsx('badge whitespace-nowrap tabular-nums', TONE_CLASS[tone])}>
      <CalendarClock className="size-3" aria-hidden /> {fmtDate(at)} · {left < 0 ? t('recognition.deadline.overdue') : t('recognition.deadline.left', { count: left })}
    </span>
  );
};

/**
 * Admin case card (Sənədlər tab, #case-recognition): recognition procedures of the case — a ZAB statement,
 * a full recognition later … — with checklist (linked to the case's documents), status timeline and letters,
 * the deficit notice with the adaptation measure, the fee (+ invoice draft) and the next deadline.
 */
export const RecognitionPanel = ({ caseId, isAdmin }: { caseId: string; isAdmin: boolean }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: key(caseId), queryFn: async () => (await api.get<CaseRecognition>(`/admin/recognition/cases/${caseId}`)).data });
  const [adding, setAdding] = useState(false);
  const data = q.data;
  return (
    <Panel
      id="case-recognition"
      title={t('recognition.title')}
      icon={GraduationCap}
      bodyClassName="p-4 sm:p-5 space-y-4"
      actions={
        <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)} disabled={!data}>
          <Plus className="size-3.5" aria-hidden /> {t('recognition.add')}
        </button>
      }
    >
      <p className="text-xs text-muted">{t('recognition.hint')}</p>
      {data?.clientStatus && (
        <p className="text-xs text-ink/80">{t('recognition.clientStatus', { status: t(`recognition.userStatus.${data.clientStatus}`, { defaultValue: data.clientStatus }) })}</p>
      )}
      {!data ? null : data.processes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t('recognition.empty')}</p>
      ) : (
        <div className="space-y-3">
          {data.processes.map((p) => (
            <ProcessCard key={p.id} p={p} caseId={caseId} documents={data.documents} isAdmin={isAdmin} />
          ))}
        </div>
      )}
      {data && <AddDialog open={adding} onClose={() => setAdding(false)} caseId={caseId} data={data} />}
    </Panel>
  );
};

export default RecognitionPanel;

// ─── New process ─────────────────────────────────────────────────────

const AddDialog = ({ open, onClose, caseId, data }: { open: boolean; onClose: () => void; caseId: string; data: CaseRecognition }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [type, setType] = useState<ProcedureType>('ZAB_STATEMENT');
  const [profession, setProfession] = useState(data.case.profession);
  const [regulated, setRegulated] = useState(false);
  const [authority, setAuthority] = useState('');
  const [federalState, setFederalState] = useState('');
  useEffect(() => setRegulated(type === 'FULL_RECOGNITION' || type === 'PARTIAL_RECOGNITION'), [type]);
  const create = useMutation({
    mutationFn: async () => api.post(`/admin/recognition/cases/${caseId}`, { procedureType: type, profession: profession.trim(), regulated, authority: authority.trim() || null, federalState: federalState.trim() || null }),
    onSuccess: () => {
      toast.success(t('recognition.created'));
      void qc.invalidateQueries({ queryKey: key(caseId) });
      onClose();
    },
    onError: (e) => toastError(e),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('recognition.addTitle')}
      as="form"
      busy={create.isPending}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (profession.trim().length >= 2) create.mutate();
      }}
      footer={
        <>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={create.isPending || profession.trim().length < 2}>
            {t('recognition.create')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">{t('recognition.fields.procedureType')}</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ProcedureType)}>
            {PROCEDURE_TYPES.map((p) => (
              <option key={p} value={p}>
                {t(`recognition.procedure.${p}`)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted">{t(`recognition.procedureHint.${type}`)}</span>
        </label>
        <label className="block">
          <span className="label">{t('recognition.fields.profession')}</span>
          <input className="input" value={profession} maxLength={160} onChange={(e) => setProfession(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={regulated} onChange={(e) => setRegulated(e.target.checked)} /> {t('recognition.fields.regulated')}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('recognition.fields.authority')}</span>
            <input className="input" value={authority} maxLength={200} placeholder={data.defaults.authority[type] ?? ''} onChange={(e) => setAuthority(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('recognition.fields.federalState')}</span>
            <input className="input" value={federalState} maxLength={40} onChange={(e) => setFederalState(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  );
};

// ─── One process ─────────────────────────────────────────────────────

type Form = {
  profession: string;
  regulated: boolean;
  authority: string;
  federalState: string;
  reference: string;
  submittedAt: string;
  fee: string;
  feePaidAt: string;
  decisionAt: string;
  deficitNotes: string;
  adaptationMeasure: string;
  adaptationUntil: string;
  nextDeadline: string;
  nextDeadlineNote: string;
  note: string;
};

const formOf = (p: RecognitionProcess): Form => ({
  profession: p.profession,
  regulated: p.regulated,
  authority: p.authority ?? '',
  federalState: p.federalState ?? '',
  reference: p.reference ?? '',
  submittedAt: dayOf(p.submittedAt),
  fee: p.feeCents != null ? String(p.feeCents / 100) : '',
  feePaidAt: dayOf(p.feePaidAt),
  decisionAt: dayOf(p.decisionAt),
  deficitNotes: p.deficitNotes ?? '',
  adaptationMeasure: p.adaptationMeasure ?? '',
  adaptationUntil: dayOf(p.adaptationUntil),
  nextDeadline: dayOf(p.nextDeadline),
  nextDeadlineNote: p.nextDeadlineNote ?? '',
  note: p.note ?? '',
});

const payloadOf = (f: Form) => ({
  profession: f.profession.trim(),
  regulated: f.regulated,
  authority: f.authority.trim() || null,
  federalState: f.federalState.trim() || null,
  reference: f.reference.trim() || null,
  submittedAt: f.submittedAt || null,
  feeCents: f.fee.trim() ? Math.round(Number(f.fee.replace(',', '.')) * 100) : null,
  feePaidAt: f.feePaidAt || null,
  decisionAt: f.decisionAt || null,
  deficitNotes: f.deficitNotes.trim() || null,
  adaptationMeasure: f.adaptationMeasure || null,
  adaptationUntil: f.adaptationUntil || null,
  nextDeadline: f.nextDeadline || null,
  nextDeadlineNote: f.nextDeadlineNote.trim() || null,
  note: f.note.trim() || null,
});

const ProcessCard = ({ p, caseId, documents, isAdmin }: { p: RecognitionProcess; caseId: string; documents: CaseDoc[]; isAdmin: boolean }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: key(caseId) });
  const [open, setOpen] = useState(!p.final);
  const [form, setForm] = useState<Form>(() => formOf(p));
  useEffect(() => setForm(formOf(p)), [p]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(payloadOf(form)) !== JSON.stringify(payloadOf(formOf(p)));
  const feeInvalid = form.fee.trim() !== '' && !Number.isFinite(Number(form.fee.replace(',', '.')));

  const save = useMutation({
    mutationFn: async () => api.patch(`/admin/recognition/${p.id}`, payloadOf(form)),
    onSuccess: () => (toast.success(t('recognition.saved')), refresh()),
    onError: (e) => toastError(e),
  });
  const [status, setStatus] = useState<string>(p.status);
  const [statusNote, setStatusNote] = useState('');
  const [statusDate, setStatusDate] = useState('');
  useEffect(() => setStatus(p.status), [p.status]);
  const changeStatus = useMutation({
    mutationFn: async () => api.post(`/admin/recognition/${p.id}/status`, { status, note: statusNote.trim() || null, ...(statusDate ? { date: statusDate } : {}) }),
    onSuccess: () => {
      toast.success(t('recognition.statusSaved'));
      setStatusNote('');
      setStatusDate('');
      void refresh();
      void qc.invalidateQueries({ queryKey: ['my-work'] });
    },
    onError: (e) => toastError(e),
  });
  const invoice = useMutation({
    mutationFn: async () => api.post(`/admin/recognition/${p.id}/fee-invoice`),
    onSuccess: () => {
      toast.success(t('recognition.fee.invoiceCreated'));
      void refresh();
      void qc.invalidateQueries({ queryKey: ['case-billing'] });
    },
    onError: (e) => toastError(e),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation({
    mutationFn: async () => api.delete(`/admin/recognition/${p.id}`),
    onSuccess: () => (toast.success(t('recognition.deleted')), setConfirmDelete(false), refresh()),
    onError: (e) => toastError(e),
  });
  const showDeficit = DEFICIT_STATUSES.includes(p.status) || !!p.deficitNotes || !!p.adaptationMeasure;
  const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'az' ? 'az-Latn-AZ' : 'de-DE';

  return (
    <article className="rounded-2xl border border-line bg-card">
      <button type="button" className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronDown className={clsx('size-4 shrink-0 text-muted transition-transform', open ? 'rotate-0' : '-rotate-90')} aria-hidden />
        <span className="font-semibold text-navy-900">{t(`recognition.procedure.${p.procedureType}`)}</span>
        <span className={clsx('badge', TONE_CLASS[STATUS_TONE[p.status]])}>{t(`recognition.status.${p.status}`)}</span>
        <span className="min-w-0 truncate text-xs text-muted">{[p.profession, p.authority, p.reference].filter(Boolean).join(' · ')}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="badge bg-surface text-muted tabular-nums">{t('recognition.checklist.progress', p.progress)}</span>
          {p.deadline && <DeadlineChip at={p.deadline.at} />}
        </span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-line px-4 py-4">
          {/* Status */}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,9rem)_minmax(0,1fr)_auto] sm:items-end">
            <label className="block">
              <span className="label">{t('recognition.statusChange')}</span>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {RECOGNITION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`recognition.status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">{t('recognition.statusDate')}</span>
              <input type="date" className="input" value={statusDate} onChange={(e) => setStatusDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">{t('recognition.statusNote')}</span>
              <input className="input" value={statusNote} maxLength={2000} onChange={(e) => setStatusNote(e.target.value)} />
            </label>
            <button type="button" className="btn-primary btn-sm" disabled={status === p.status || changeStatus.isPending} onClick={() => changeStatus.mutate()}>
              {t('admin.common.save')}
            </button>
          </div>

          {/* Fields */}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty && !feeInvalid) save.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('recognition.fields.profession')}>
                <input className="input" value={form.profession} maxLength={160} onChange={(e) => set('profession', e.target.value)} />
              </Field>
              <Field label={t('recognition.fields.authority')}>
                <input className="input" value={form.authority} maxLength={200} onChange={(e) => set('authority', e.target.value)} />
              </Field>
              <Field label={t('recognition.fields.federalState')}>
                <input className="input" value={form.federalState} maxLength={40} onChange={(e) => set('federalState', e.target.value)} />
              </Field>
              <Field label={t('recognition.fields.reference')}>
                <input className="input" value={form.reference} maxLength={120} onChange={(e) => set('reference', e.target.value)} />
              </Field>
              <Field label={t('recognition.fields.submittedAt')}>
                <input type="date" className="input" value={form.submittedAt} onChange={(e) => set('submittedAt', e.target.value)} />
              </Field>
              <Field label={t('recognition.fields.decisionAt')}>
                <input type="date" className="input" value={form.decisionAt} onChange={(e) => set('decisionAt', e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.regulated} onChange={(e) => set('regulated', e.target.checked)} /> {t('recognition.fields.regulated')}
            </label>

            {/* Deadline */}
            <fieldset className="rounded-xl bg-surface/60 p-3">
              <legend className="px-1 text-xs font-semibold text-navy-900">{t('recognition.deadline.title')}</legend>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                <Field label={t('recognition.fields.nextDeadline')}>
                  <input type="date" className="input" value={form.nextDeadline} onChange={(e) => set('nextDeadline', e.target.value)} />
                </Field>
                <Field label={t('recognition.fields.nextDeadlineNote')}>
                  <input className="input" value={form.nextDeadlineNote} maxLength={300} onChange={(e) => set('nextDeadlineNote', e.target.value)} />
                </Field>
              </div>
            </fieldset>

            {/* Deficit notice */}
            {showDeficit && (
              <fieldset className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <legend className="px-1 text-xs font-semibold text-amber-800">{t('recognition.deficit.title')}</legend>
                <p className="mb-2 text-[11px] text-amber-800/80">{t('recognition.deficit.hint')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('recognition.fields.deficitNotes')} className="sm:col-span-2">
                    <textarea className="input min-h-20" value={form.deficitNotes} maxLength={8000} onChange={(e) => set('deficitNotes', e.target.value)} />
                  </Field>
                  <Field label={t('recognition.fields.adaptationMeasure')}>
                    <select className="input" value={form.adaptationMeasure} onChange={(e) => set('adaptationMeasure', e.target.value)}>
                      <option value="">—</option>
                      {ADAPTATION_MEASURES.map((m) => (
                        <option key={m} value={m}>
                          {t(`recognition.measure.${m}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('recognition.fields.adaptationUntil')}>
                    <input type="date" className="input" value={form.adaptationUntil} onChange={(e) => set('adaptationUntil', e.target.value)} />
                  </Field>
                </div>
              </fieldset>
            )}

            {/* Fee */}
            <fieldset className="rounded-xl bg-surface/60 p-3">
              <legend className="px-1 text-xs font-semibold text-navy-900">{t('recognition.fee.title')}</legend>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,10rem)_1fr] sm:items-end">
                <Field label={t('recognition.fields.fee')}>
                  <input className={clsx('input tabular-nums', feeInvalid && 'border-danger')} inputMode="decimal" value={form.fee} onChange={(e) => set('fee', e.target.value)} />
                </Field>
                <Field label={t('recognition.fields.feePaidAt')}>
                  <input type="date" className="input" value={form.feePaidAt} onChange={(e) => set('feePaidAt', e.target.value)} />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  {p.invoice ? (
                    <span className="badge bg-brand-100 text-brand-700">
                      <Receipt className="size-3" aria-hidden /> {t('recognition.fee.invoiceLinked', { status: p.invoice.status })} · {euro(p.invoice.grossCents, locale)}
                    </span>
                  ) : (
                    <button type="button" className="btn-ghost btn-sm" disabled={!p.feeCents || invoice.isPending || dirty} onClick={() => invoice.mutate()}>
                      <Receipt className="size-3.5" aria-hidden /> {t('recognition.fee.invoice')}
                    </button>
                  )}
                </div>
              </div>
            </fieldset>

            <Field label={t('recognition.fields.note')}>
              <textarea className="input min-h-16" value={form.note} maxLength={5000} onChange={(e) => set('note', e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn-primary btn-sm" disabled={!dirty || feeInvalid || save.isPending || form.profession.trim().length < 2}>
                {t('admin.common.save')}
              </button>
              {dirty && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setForm(formOf(p))}>
                  {t('admin.common.cancel')}
                </button>
              )}
              {isAdmin && (
                <button type="button" className="btn-ghost btn-sm ml-auto text-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" aria-hidden /> {t('admin.common.delete')}
                </button>
              )}
            </div>
          </form>

          <Checklist p={p} caseId={caseId} documents={documents} />
          <Timeline p={p} caseId={caseId} />
        </div>
      )}
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => remove.mutate()} title={t('recognition.deleteConfirm')} danger loading={remove.isPending} />
    </article>
  );
};

const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={clsx('block min-w-0', className)}>
    <span className="label">{label}</span>
    {children}
  </label>
);

// ─── Checklist ───────────────────────────────────────────────────────

const Checklist = ({ p, caseId, documents }: { p: RecognitionProcess; caseId: string; documents: CaseDoc[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (items: ChecklistItem[]) => api.put(`/admin/recognition/${p.id}/checklist`, { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(caseId) }),
    onError: (e) => toastError(e),
  });
  const relink = useMutation({
    mutationFn: async () => api.post(`/admin/recognition/${p.id}/checklist/relink`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(caseId) }),
    onError: (e) => toastError(e),
  });
  const update = (k: string, patch: Partial<ChecklistItem>) => save.mutate(p.checklist.map((i) => (i.key === k ? { ...i, ...patch } : i)));
  const missing = CHECK_KEYS.filter((k) => !p.checklist.some((i) => i.key === k));
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-navy-900">
          {t('recognition.checklist.title')} <span className="ml-1 text-xs font-normal text-muted tabular-nums">{t('recognition.checklist.progress', p.progress)}</span>
        </h4>
        <button type="button" className="btn-ghost btn-sm" onClick={() => relink.mutate()} disabled={relink.isPending}>
          <RefreshCw className="size-3.5" aria-hidden /> {t('recognition.checklist.relink')}
        </button>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {p.checklist.map((i) => (
          <li key={i.key} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-center">
            <label className="flex min-w-0 items-center gap-2">
              <input type="checkbox" checked={i.done} disabled={save.isPending} onChange={(e) => update(i.key, { done: e.target.checked })} />
              <span className={clsx('min-w-0', i.done && 'text-muted line-through')}>{t(`recognition.check.${i.key}`)}</span>
              {i.optional && <span className="badge bg-surface text-muted">{t('recognition.checklist.optional')}</span>}
              {i.client && <span className="badge bg-info-bg text-info-fg">{t('recognition.checklist.client')}</span>}
            </label>
            <select aria-label={t('recognition.checklist.linkDoc')} className="input py-1 text-xs" value={i.documentId ?? ''} disabled={save.isPending} onChange={(e) => update(i.key, { documentId: e.target.value || null, ...(e.target.value ? { done: true } : {}) })}>
              <option value="">{t('recognition.checklist.noDoc')}</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {i.documentId ? (
              <a href={fileUrl(i.documentId)} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg text-brand-600 hover:bg-brand-50" title={t('recognition.checklist.openDoc')} aria-label={t('recognition.checklist.openDoc')}>
                <ExternalLink className="size-4" aria-hidden />
              </a>
            ) : (
              <span className="hidden size-8 sm:block" />
            )}
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {missing.map((k) => (
            <button key={k} type="button" className="btn-ghost btn-sm text-xs" onClick={() => save.mutate([...p.checklist, { key: k, done: false, documentId: null, optional: true, client: false }])}>
              <Plus className="size-3" aria-hidden /> {t(`recognition.check.${k}`)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

// ─── Timeline + letters ──────────────────────────────────────────────

const EVENT_ICON = { STATUS: GraduationCap, NOTE: StickyNote, DOCUMENT: FileUp, LETTER_IN: Mail, LETTER_OUT: Mail, DEADLINE: CalendarClock } as const;

const Timeline = ({ p, caseId }: { p: RecognitionProcess; caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: key(caseId) });
  const [note, setNote] = useState('');
  const addNote = useMutation({
    mutationFn: async () => api.post(`/admin/recognition/${p.id}/events`, { type: 'NOTE', note: note.trim() }),
    onSuccess: () => (setNote(''), refresh()),
    onError: (e) => toastError(e),
  });
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<'LETTER_IN' | 'LETTER_OUT' | 'DOCUMENT'>('LETTER_IN');
  const [letterNote, setLetterNote] = useState('');
  const [at, setAt] = useState('');
  const [tick, setTick] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('file', file!);
      form.append('type', type);
      if (letterNote.trim()) form.append('note', letterNote.trim());
      if (at) form.append('at', at);
      if (tick) form.append('checkKey', tick);
      return api.post(`/admin/recognition/${p.id}/letters`, form);
    },
    onSuccess: () => {
      toast.success(t('recognition.events.uploaded'));
      setFile(null);
      setLetterNote('');
      setAt('');
      setTick('');
      setInputKey((k) => k + 1);
      void refresh();
    },
    onError: (e) => toastError(e),
  });
  const statusLabel = (s: string | null) => (s ? t(`recognition.status.${s}`, { defaultValue: s }) : '');
  const events = useMemo(() => p.events, [p.events]);
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-navy-900">{t('recognition.events.title')}</h4>
      <div className="grid gap-3 lg:grid-cols-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) addNote.mutate();
          }}
        >
          <input className="input min-w-0 flex-1" value={note} maxLength={4000} placeholder={t('recognition.events.notePh')} aria-label={t('recognition.events.addNote')} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="btn-secondary btn-sm" disabled={!note.trim() || addNote.isPending}>
            <StickyNote className="size-3.5" aria-hidden /> {t('recognition.events.addNote')}
          </button>
        </form>
        <form
          className="grid gap-2 rounded-xl border border-dashed border-line p-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (file) upload.mutate();
          }}
        >
          <input key={inputKey} type="file" className="text-xs sm:col-span-2" aria-label={t('recognition.events.file')} accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <select className="input py-1 text-xs" aria-label={t('recognition.events.type')} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {(['LETTER_IN', 'LETTER_OUT', 'DOCUMENT'] as const).map((x) => (
              <option key={x} value={x}>
                {t(`recognition.events.types.${x}`)}
              </option>
            ))}
          </select>
          <input type="date" className="input py-1 text-xs" aria-label={t('recognition.events.date')} value={at} onChange={(e) => setAt(e.target.value)} />
          <input className="input py-1 text-xs" placeholder={t('recognition.statusNote')} value={letterNote} maxLength={2000} onChange={(e) => setLetterNote(e.target.value)} />
          <select className="input py-1 text-xs" aria-label={t('recognition.events.tickItem')} value={tick} onChange={(e) => setTick(e.target.value)}>
            <option value="">{t('recognition.events.tickItem')}: —</option>
            {p.checklist.map((i) => (
              <option key={i.key} value={i.key}>
                {t(`recognition.check.${i.key}`)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary btn-sm sm:col-span-2" disabled={!file || upload.isPending}>
            <FileUp className="size-3.5" aria-hidden /> {t('recognition.events.upload')}
          </button>
        </form>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-muted">{t('recognition.events.none')}</p>
      ) : (
        <ol className="relative ml-2 space-y-3 border-l border-line pl-5">
          {events.map((e) => {
            const Icon = EVENT_ICON[e.type] ?? StickyNote;
            return (
              <li key={e.id} className="relative">
                <span className="absolute top-0.5 -left-[29px] grid size-4 place-items-center rounded-full bg-card text-brand-600 ring-4 ring-card">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <p className="text-sm text-ink">
                  <span className="font-medium">{t(`recognition.events.types.${e.type}`)}</span>
                  {e.type === 'STATUS' && e.toStatus && <span>: {[statusLabel(e.fromStatus), statusLabel(e.toStatus)].filter(Boolean).join(' → ')}</span>}
                  {e.note && <span className="text-ink/80"> — {e.note}</span>}
                  {e.documentId && (
                    <a href={fileUrl(e.documentId)} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-xs text-brand-600 hover:underline">
                      <ExternalLink className="size-3" aria-hidden /> PDF
                    </a>
                  )}
                </p>
                <p className="text-[11px] text-muted">{[fmtDateTime(e.at), e.actor].filter(Boolean).join(' · ')}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
