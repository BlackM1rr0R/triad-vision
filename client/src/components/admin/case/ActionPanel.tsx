import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  FileSignature,
  Gavel,
  Hourglass,
  Info,
  Landmark,
  MessageSquareWarning,
  RotateCcw,
  Undo2,
  Zap,
} from 'lucide-react';
import { FINAL } from '@/lib/caseStatus';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail, CaseStatus, Requirement } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '../ConfirmDialog';
import { fmtDateTime, statusLabel, toLocalInput } from '../labels';
import { Panel } from '../ui';
import { SendContractForSignature } from '@/components/esign/CaseSignatures';
import { missingAccepted, useCaseAction, type ActionBody } from './shared';

type ActionKey = 'SEND_CONTRACT' | 'REQUEST_CHANGES' | 'CONFIRM_CONTRACT' | 'REJECT_SIGNATURE' | 'SCHEDULE' | 'MARK_LODGED' | 'DECIDE' | 'REOPEN';

const AVAILABLE: Record<CaseStatus, ActionKey[]> = {
  DOCUMENTS_PENDING: [],
  DOCUMENTS_REVIEW: ['SEND_CONTRACT', 'REQUEST_CHANGES'],
  CONTRACT_SENT: [],
  CONTRACT_SIGNED: ['CONFIRM_CONTRACT', 'REJECT_SIGNATURE'],
  EMBASSY_DOCUMENTS: [],
  EMBASSY_REVIEW: ['SCHEDULE', 'REQUEST_CHANGES'],
  APPOINTMENT_SCHEDULED: ['MARK_LODGED', 'SCHEDULE'],
  DECISION_PENDING: ['DECIDE'],
  APPROVED: [],
  REJECTED: ['REOPEN'],
  CANCELLED: ['REOPEN'],
};

const ACTION_ICON: Record<ActionKey, LucideIcon> = {
  SEND_CONTRACT: FileSignature,
  REQUEST_CHANGES: MessageSquareWarning,
  CONFIRM_CONTRACT: CheckCircle2,
  REJECT_SIGNATURE: Undo2,
  SCHEDULE: CalendarClock,
  MARK_LODGED: Landmark,
  DECIDE: Gavel,
  REOPEN: RotateCcw,
};

const Hint = ({ tone = 'warning', children }: { tone?: 'warning' | 'info' | 'ok'; children: ReactNode }) => (
  <div
    className={clsx(
      'flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
      tone === 'warning' && 'bg-amber-50 text-amber-900',
      tone === 'info' && 'bg-brand-50 text-brand-700',
      tone === 'ok' && 'bg-emerald-50 text-emerald-800',
    )}
  >
    {tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
    <div>{children}</div>
  </div>
);

const MissingHint = ({ missing, what }: { missing: Requirement[]; what: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return missing.length === 0 ? (
    <Hint tone="ok">{t('admin.case.action.allAccepted')}</Hint>
  ) : (
    <Hint>
      <p className="font-semibold">{t('admin.case.action.missing', { what, count: missing.length })}</p>
      <ul className="mt-1 list-disc pl-4">
        {missing.map((r) => (
          <li key={r.id}>{tr(r.title)}</li>
        ))}
      </ul>
    </Hint>
  );
};

const Field = ({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) => (
  <div>
    <label htmlFor={htmlFor} className="label">
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
  </div>
);

interface PendingConfirm {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone: 'danger' | 'primary';
  body: ActionBody;
}

export const ActionPanel = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const actions = AVAILABLE[c.status];
  const [selected, setSelected] = useState<ActionKey | null>(actions[0] ?? null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const mutation = useCaseAction(c.id);

  // form state
  const [note, setNote] = useState('');
  const [at, setAt] = useState('');
  const [place, setPlace] = useState('');
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reason, setReason] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [reopenTo, setReopenTo] = useState<'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS'>('EMBASSY_DOCUMENTS');
  const [cancelReason, setCancelReason] = useState('');

  // Reset forms whenever the status changes (an action succeeded or someone else moved the case).
  useEffect(() => {
    setSelected(AVAILABLE[c.status][0] ?? null);
    setNote('');
    setAt(toLocalInput(c.appointmentAt));
    setPlace(c.appointmentPlace ?? '');
    setReason('');
    setValidFrom('');
    setValidTo('');
    setCancelReason('');
    setShowCancel(false);
  }, [c.status, c.appointmentAt, c.appointmentPlace]);

  useEffect(() => setNote(''), [selected]);

  const run = (body: ActionBody) =>
    mutation.mutate(body, {
      onSuccess: () => setConfirm(null),
    });

  const missingInitial = missingAccepted(c, 'INITIAL');
  const missingEmbassy = missingAccepted(c, 'EMBASSY');
  const noteOk = note.trim().length >= 3;
  const busy = mutation.isPending;
  const isFinal = FINAL.includes(c.status);
  const a = (key: string, opts?: Record<string, unknown>) => t(`admin.case.action.${key}`, opts);

  const renderForm = (key: ActionKey) => {
    switch (key) {
      case 'SEND_CONTRACT':
        return (
          <div className="space-y-3">
            <p className="text-sm text-ink/80">{a('sendContractText', { status: statusLabel('CONTRACT_SENT') })}</p>
            <MissingHint missing={missingInitial} what={a('sendContractWhat')} />
            <SendContractForSignature caseId={c.id} disabled={missingInitial.length > 0} />
          </div>
        );

      case 'REQUEST_CHANGES':
        return (
          <div className="space-y-3">
            <Field label={a('noteLabel')} htmlFor="ap-note" hint={a('noteHint')}>
              <textarea id="ap-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={a('notePlaceholder')} />
            </Field>
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={!noteOk || busy}
              onClick={() =>
                setConfirm({
                  title: a('requestChangesTitle'),
                  message: a('requestChangesMsg', { status: statusLabel(c.status === 'EMBASSY_REVIEW' ? 'EMBASSY_DOCUMENTS' : 'DOCUMENTS_PENDING') }),
                  confirmLabel: a('label.REQUEST_CHANGES'),
                  tone: 'danger',
                  body: { action: 'REQUEST_CHANGES', note: note.trim() },
                })
              }
            >
              <MessageSquareWarning className="size-3.5" /> {a('label.REQUEST_CHANGES')}
            </button>
          </div>
        );

      case 'CONFIRM_CONTRACT':
        return (
          <div className="space-y-3">
            <p className="text-sm text-ink/80">{a('confirmText')}</p>
            {!c.contract?.signedFile && <Hint>{a('noSignedFile')}</Hint>}
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => run({ action: 'CONFIRM_CONTRACT' })}>
              {busy ? <Spinner className="size-3.5" /> : <CheckCircle2 className="size-3.5" />} {a('label.CONFIRM_CONTRACT')}
            </button>
          </div>
        );

      case 'REJECT_SIGNATURE':
        return (
          <div className="space-y-3">
            <Field label={a('reasonLabel')} htmlFor="ap-sig" hint={a('min3')}>
              <textarea id="ap-sig" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={a('sigPlaceholder')} />
            </Field>
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={!noteOk || busy}
              onClick={() =>
                setConfirm({
                  title: a('rejectSigTitle'),
                  message: a('rejectSigMsg'),
                  confirmLabel: a('label.REJECT_SIGNATURE'),
                  tone: 'danger',
                  body: { action: 'REJECT_SIGNATURE', note: note.trim() },
                })
              }
            >
              <Undo2 className="size-3.5" /> {a('label.REJECT_SIGNATURE')}
            </button>
          </div>
        );

      case 'SCHEDULE': {
        const resched = c.status === 'APPOINTMENT_SCHEDULED';
        const ok = !!at && place.trim().length >= 3 && !Number.isNaN(new Date(at).getTime());
        return (
          <div className="space-y-3">
            {resched && c.appointmentAt && (
              <Hint tone="info">
                {a('currentAppointment')} <strong>{fmtDateTime(c.appointmentAt)}</strong>, {c.appointmentPlace}
              </Hint>
            )}
            {!resched && <MissingHint missing={missingEmbassy} what={a('scheduleWhat')} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={a('dateTime')} htmlFor="ap-at">
                <input id="ap-at" type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
              </Field>
              <Field label={a('place')} htmlFor="ap-place">
                <input id="ap-place" className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={a('placePlaceholder')} />
              </Field>
            </div>
            <Field label={a('noteOptional')} htmlFor="ap-anote">
              <textarea id="ap-anote" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={a('appointmentNotePlaceholder')} />
            </Field>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={!ok || busy || (!resched && missingEmbassy.length > 0)}
              onClick={() =>
                run({
                  action: 'SCHEDULE_APPOINTMENT',
                  at: new Date(at).toISOString(),
                  place: place.trim(),
                  note: note.trim() || undefined,
                })
              }
            >
              {busy ? <Spinner className="size-3.5" /> : <CalendarClock className="size-3.5" />}
              {resched ? a('reschedule') : a('label.SCHEDULE')}
            </button>
          </div>
        );
      }

      case 'MARK_LODGED':
        return (
          <div className="space-y-3">
            <p className="text-sm text-ink/80">{a('lodgedText', { status: statusLabel('DECISION_PENDING') })}</p>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: a('lodgedTitle'),
                  message: a('lodgedMsg'),
                  confirmLabel: t('admin.common.confirm'),
                  tone: 'primary',
                  body: { action: 'MARK_LODGED' },
                })
              }
            >
              <Landmark className="size-3.5" /> {a('label.MARK_LODGED')}
            </button>
          </div>
        );

      case 'DECIDE': {
        const reasonOk = decision === 'APPROVED' || reason.trim().length > 0;
        const datesOk = !validFrom || !validTo || validFrom <= validTo;
        return (
          <div className="space-y-3">
            <fieldset>
              <legend className="label">{a('decision')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['APPROVED', 'REJECTED'] as const).map((d) => (
                  <label
                    key={d}
                    className={clsx(
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
                      decision === d
                        ? d === 'APPROVED'
                          ? 'border-success bg-emerald-50 text-emerald-800'
                          : 'border-danger bg-red-50 text-red-700'
                        : 'border-line text-ink/70 hover:border-brand-400',
                    )}
                  >
                    <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} className="accent-current" />
                    {d === 'APPROVED' ? a('approved') : a('rejected')}
                  </label>
                ))}
              </div>
            </fieldset>
            {decision === 'APPROVED' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={a('validFrom')} htmlFor="ap-vf">
                  <input id="ap-vf" type="date" className="input" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </Field>
                <Field label={a('validTo')} htmlFor="ap-vt">
                  <input id="ap-vt" type="date" className="input" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
                </Field>
              </div>
            )}
            {!datesOk && <Hint>{a('datesInvalid')}</Hint>}
            <Field label={decision === 'REJECTED' ? a('rejectReasonRequired') : a('noteOptionalShort')} htmlFor="ap-reason" hint={decision === 'REJECTED' ? a('reasonShown') : undefined}>
              <textarea id="ap-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <button
              type="button"
              className={decision === 'APPROVED' ? 'btn-primary btn-sm' : 'btn-danger btn-sm'}
              disabled={!reasonOk || !datesOk || busy}
              onClick={() =>
                setConfirm({
                  title: decision === 'APPROVED' ? a('approveTitle') : a('rejectTitle'),
                  message: decision === 'APPROVED' ? a('approveMsg') : a('rejectMsg'),
                  confirmLabel: a('label.DECIDE'),
                  tone: decision === 'APPROVED' ? 'primary' : 'danger',
                  body: {
                    action: 'DECIDE',
                    decision,
                    reason: reason.trim() || undefined,
                    validFrom: decision === 'APPROVED' && validFrom ? new Date(`${validFrom}T00:00:00`).toISOString() : undefined,
                    validTo: decision === 'APPROVED' && validTo ? new Date(`${validTo}T00:00:00`).toISOString() : undefined,
                  },
                })
              }
            >
              <Gavel className="size-3.5" /> {a('label.DECIDE')}
            </button>
          </div>
        );
      }

      case 'REOPEN':
        return (
          <div className="space-y-3">
            <fieldset>
              <legend className="label">{a('reopenFrom')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS'] as const).map((s) => (
                  <label
                    key={s}
                    className={clsx(
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition',
                      reopenTo === s ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-line text-ink/75 hover:border-brand-400',
                    )}
                  >
                    <input type="radio" name="reopen" value={s} checked={reopenTo === s} onChange={() => setReopenTo(s)} />
                    {statusLabel(s)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={a('noteOptional')} htmlFor="ap-reopen">
              <textarea id="ap-reopen" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: a('reopenTitle'),
                  message: a('reopenMsg', { status: statusLabel(reopenTo) }),
                  confirmLabel: a('label.REOPEN'),
                  tone: 'primary',
                  body: { action: 'REOPEN', to: reopenTo, note: note.trim() || undefined },
                })
              }
            >
              <RotateCcw className="size-3.5" /> {a('label.REOPEN')}
            </button>
          </div>
        );
    }
  };

  return (
    <Panel title={a('nextStep')} icon={Zap} className="border-brand-400/50 ring-1 ring-brand-500/10">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-surface px-3 py-2.5 text-sm text-ink/85">
          {actions.length === 0 && !isFinal ? (
            <Hourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          )}
          <p>{a(`situation.${c.status}`)}</p>
        </div>

        {c.staffNote && !isFinal && (
          <p className="rounded-lg border border-line px-3 py-2 text-xs text-muted">
            <span className="font-semibold text-ink/80">{a('lastNote')}</span> {c.staffNote}
          </p>
        )}

        {actions.length > 1 && (
          <div role="tablist" aria-label={a('actionsAria')} className="flex flex-wrap gap-2">
            {actions.map((k) => {
              const Icon = ACTION_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={selected === k}
                  onClick={() => setSelected(k)}
                  className={clsx(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition lg:min-h-9',
                    selected === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {k === 'SCHEDULE' && c.status === 'APPOINTMENT_SCHEDULED' ? a('changeTime') : a(`label.${k}`)}
                </button>
              );
            })}
          </div>
        )}

        {selected && actions.includes(selected) && <div>{renderForm(selected)}</div>}

        {!isFinal && (
          <div className="border-t border-line pt-4">
            {!showCancel ? (
              <button
                type="button"
                className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-danger"
                onClick={() => setShowCancel(true)}
              >
                <Ban className="size-3.5" /> {a('cancelCase')}
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
                <label htmlFor="ap-cancel" className="label text-red-800">
                  {a('cancelReasonLabel')}
                </label>
                <textarea id="ap-cancel" className="input" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    disabled={cancelReason.trim().length < 3 || busy}
                    onClick={() =>
                      setConfirm({
                        title: a('cancelTitle'),
                        message: a('cancelMsg'),
                        confirmLabel: a('cancelBtn'),
                        tone: 'danger',
                        body: { action: 'CANCEL', reason: cancelReason.trim() },
                      })
                    }
                  >
                    <Ban className="size-3.5" /> {a('cancelBtn')}
                  </button>
                  <button type="button" className="btn-white btn-sm border border-line" onClick={() => setShowCancel(false)}>
                    {t('admin.common.close')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && run(confirm.body)}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        loading={busy}
      />
    </Panel>
  );
};
