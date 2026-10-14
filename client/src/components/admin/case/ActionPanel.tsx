import { useEffect, useState, type ReactNode } from 'react';
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
import type { CaseDetail, CaseStatus, Requirement } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '../ConfirmDialog';
import { STATUS_LABEL, fmtDateTime, toLocalInput } from '../labels';
import { Panel } from '../ui';
import { ContractUpload } from './Contract';
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

const ACTION_META: Record<ActionKey, { label: string; icon: LucideIcon }> = {
  SEND_CONTRACT: { label: 'Müqaviləni göndər', icon: FileSignature },
  REQUEST_CHANGES: { label: 'Düzəliş tələb et', icon: MessageSquareWarning },
  CONFIRM_CONTRACT: { label: 'İmzanı təsdiqlə', icon: CheckCircle2 },
  REJECT_SIGNATURE: { label: 'İmzanı rədd et', icon: Undo2 },
  SCHEDULE: { label: 'Görüş təyin et', icon: CalendarClock },
  MARK_LODGED: { label: 'Səfirliyə təqdim edildi', icon: Landmark },
  DECIDE: { label: 'Qərarı qeyd et', icon: Gavel },
  REOPEN: { label: 'Yenidən aç', icon: RotateCcw },
};

/** What is going on right now, in one sentence. */
const SITUATION: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'Müştəri ilkin sənədləri yükləyir. Göndərdikdən sonra müraciət yoxlamaya düşəcək.',
  DOCUMENTS_REVIEW: 'Müştəri ilkin sənədləri göndərib. Hər sənədi yoxlayın, sonra müqaviləni göndərin və ya düzəliş tələb edin.',
  CONTRACT_SENT: 'Müqavilə müştəriyə göndərilib, elektron imza gözlənilir. Lazım olsa, “Müqavilə” bölməsindən yeni versiya yükləyə bilərsiniz.',
  CONTRACT_SIGNED: 'Müştəri müqaviləni imzalayıb. İmzalanmış faylı və imza məlumatlarını yoxlayın.',
  EMBASSY_DOCUMENTS: 'Müştəri səfirlik üçün sənədləri yükləyir.',
  EMBASSY_REVIEW: 'Səfirlik sənədləri göndərilib. Yoxlayın, sonra görüş təyin edin və ya düzəliş tələb edin.',
  APPOINTMENT_SCHEDULED: 'Səfirlik görüşü təyin edilib. Sənədlər təqdim edildikdən sonra qeyd edin.',
  DECISION_PENDING: 'Sənədlər səfirliyə təqdim edilib, səfirliyin qərarı gözlənilir.',
  APPROVED: 'Viza təsdiqlənib. Viza skanını “Müştəri üçün fayllar” bölməsindən yükləyə bilərsiniz.',
  REJECTED: 'Səfirlik imtina edib. Lazım olsa, müraciəti uyğun mərhələdən yenidən aça bilərsiniz.',
  CANCELLED: 'Müraciət ləğv edilib. Lazım olsa, yenidən aça bilərsiniz.',
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

const MissingHint = ({ missing, what }: { missing: Requirement[]; what: string }) =>
  missing.length === 0 ? (
    <Hint tone="ok">Bütün mütləq sənədlər qəbul edilib.</Hint>
  ) : (
    <Hint>
      <p className="font-semibold">
        {what} üçün bütün mütləq sənədlər qəbul edilməlidir — {missing.length} sənəd qalıb:
      </p>
      <ul className="mt-1 list-disc pl-4">
        {missing.map((r) => (
          <li key={r.id}>{r.title.az}</li>
        ))}
      </ul>
    </Hint>
  );

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

  const renderForm = (key: ActionKey) => {
    switch (key) {
      case 'SEND_CONTRACT':
        return (
          <div className="space-y-3">
            <p className="text-sm text-ink/80">
              Müqavilənin PDF faylını yükləyin. Fayl dərhal müştəriyə imza üçün göndəriləcək və status “{STATUS_LABEL.CONTRACT_SENT}” olacaq.
            </p>
            <MissingHint missing={missingInitial} what="Müqavilə göndərmək" />
            <ContractUpload c={c} label="PDF yüklə və göndər" disabled={missingInitial.length > 0} />
          </div>
        );

      case 'REQUEST_CHANGES':
        return (
          <div className="space-y-3">
            <Field label="Müştəriyə qeyd (nəyi düzəltməlidir)" htmlFor="ap-note" hint="Ən azı 3 simvol. Müştəri bu mətni bildirişdə görəcək.">
              <textarea
                id="ap-note"
                className="input"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Məs.: Pasportun bütün səhifələrini bir PDF faylında yenidən yükləyin."
              />
            </Field>
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={!noteOk || busy}
              onClick={() =>
                setConfirm({
                  title: 'Düzəliş tələb edilsin?',
                  message: `Müraciət “${STATUS_LABEL[c.status === 'EMBASSY_REVIEW' ? 'EMBASSY_DOCUMENTS' : 'DOCUMENTS_PENDING']}” statusuna qaytarılacaq və müştəriyə bildiriş göndəriləcək.`,
                  confirmLabel: 'Düzəliş tələb et',
                  tone: 'danger',
                  body: { action: 'REQUEST_CHANGES', note: note.trim() },
                })
              }
            >
              <MessageSquareWarning className="size-3.5" /> Düzəliş tələb et
            </button>
          </div>
        );

      case 'CONFIRM_CONTRACT':
        return (
          <div className="space-y-3">
            <p className="text-sm text-ink/80">
              İmzalanmış müqaviləni və imza məlumatlarını yoxladınızsa, təsdiqləyin. Müştəridən səfirlik sənədləri tələb ediləcək.
            </p>
            {!c.contract?.signedFile && <Hint>İmzalanmış fayl tapılmadı — təsdiqləməzdən əvvəl “Müqavilə” bölməsini yoxlayın.</Hint>}
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => run({ action: 'CONFIRM_CONTRACT' })}>
              {busy ? <Spinner className="size-3.5" /> : <CheckCircle2 className="size-3.5" />} İmzanı təsdiqlə
            </button>
          </div>
        );

      case 'REJECT_SIGNATURE':
        return (
          <div className="space-y-3">
            <Field label="Səbəb (müştəriyə göstəriləcək)" htmlFor="ap-sig" hint="Ən azı 3 simvol.">
              <textarea
                id="ap-sig"
                className="input"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Məs.: Ad və soyad pasportdakı kimi yazılmalıdır."
              />
            </Field>
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={!noteOk || busy}
              onClick={() =>
                setConfirm({
                  title: 'İmza rədd edilsin?',
                  message: 'İmza məlumatları silinəcək və müştəridən müqaviləni yenidən imzalaması istəniləcək.',
                  confirmLabel: 'İmzanı rədd et',
                  tone: 'danger',
                  body: { action: 'REJECT_SIGNATURE', note: note.trim() },
                })
              }
            >
              <Undo2 className="size-3.5" /> İmzanı rədd et
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
                Hazırkı görüş: <strong>{fmtDateTime(c.appointmentAt)}</strong>, {c.appointmentPlace}
              </Hint>
            )}
            {!resched && <MissingHint missing={missingEmbassy} what="Görüş təyin etmək" />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tarix və saat" htmlFor="ap-at">
                <input id="ap-at" type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
              </Field>
              <Field label="Yer" htmlFor="ap-place">
                <input
                  id="ap-place"
                  className="input"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Məs.: Almaniya səfirliyi, Bakı, Nizami küç. 15"
                />
              </Field>
            </div>
            <Field label="Müştəriyə qeyd (istəyə bağlı)" htmlFor="ap-anote">
              <textarea
                id="ap-anote"
                className="input"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Məs.: Bütün sənədlərin əsli ilə gəlin."
              />
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
              {resched ? 'Görüş vaxtını yenilə' : 'Görüş təyin et'}
            </button>
          </div>
        );
      }

      case 'MARK_LODGED':
        return (
          <div className="space-y-3">
            <p className="text-sm text-ink/80">
              Müştəri görüşə gedib sənədləri səfirliyə təqdim etdisə, qeyd edin. Status “{STATUS_LABEL.DECISION_PENDING}” olacaq.
            </p>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: 'Sənədlər təqdim edildi?',
                  message: 'Müraciət qərar gözləmə mərhələsinə keçəcək. Bundan sonra görüş vaxtını dəyişmək mümkün olmayacaq.',
                  confirmLabel: 'Təsdiqlə',
                  tone: 'primary',
                  body: { action: 'MARK_LODGED' },
                })
              }
            >
              <Landmark className="size-3.5" /> Səfirliyə təqdim edildi
            </button>
          </div>
        );

      case 'DECIDE': {
        const reasonOk = decision === 'APPROVED' || reason.trim().length > 0;
        const datesOk = !validFrom || !validTo || validFrom <= validTo;
        return (
          <div className="space-y-3">
            <fieldset>
              <legend className="label">Səfirliyin qərarı</legend>
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
                    {d === 'APPROVED' ? 'Viza təsdiqləndi' : 'İmtina edildi'}
                  </label>
                ))}
              </div>
            </fieldset>
            {decision === 'APPROVED' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Viza etibarlıdır (başlanğıc)" htmlFor="ap-vf">
                  <input id="ap-vf" type="date" className="input" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </Field>
                <Field label="Viza etibarlıdır (son)" htmlFor="ap-vt">
                  <input id="ap-vt" type="date" className="input" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
                </Field>
              </div>
            )}
            {!datesOk && <Hint>Bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz.</Hint>}
            <Field
              label={decision === 'REJECTED' ? 'İmtina səbəbi (mütləq)' : 'Qeyd (istəyə bağlı)'}
              htmlFor="ap-reason"
              hint={decision === 'REJECTED' ? 'Səbəb müştəriyə göstəriləcək.' : undefined}
            >
              <textarea id="ap-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <button
              type="button"
              className={decision === 'APPROVED' ? 'btn-primary btn-sm' : 'btn-danger btn-sm'}
              disabled={!reasonOk || !datesOk || busy}
              onClick={() =>
                setConfirm({
                  title: decision === 'APPROVED' ? 'Viza təsdiqi qeyd edilsin?' : 'İmtina qeyd edilsin?',
                  message:
                    decision === 'APPROVED'
                      ? 'Müraciət “Təsdiqləndi” statusu ilə bağlanacaq və müştəriyə bildiriş göndəriləcək.'
                      : 'Müraciət “İmtina” statusu ilə bağlanacaq və müştəriyə səbəb göndəriləcək.',
                  confirmLabel: 'Qərarı qeyd et',
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
              <Gavel className="size-3.5" /> Qərarı qeyd et
            </button>
          </div>
        );
      }

      case 'REOPEN':
        return (
          <div className="space-y-3">
            <fieldset>
              <legend className="label">Hansı mərhələdən davam etsin?</legend>
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
                    {STATUS_LABEL[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Müştəriyə qeyd (istəyə bağlı)" htmlFor="ap-reopen">
              <textarea id="ap-reopen" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: 'Müraciət yenidən açılsın?',
                  message: `Status “${STATUS_LABEL[reopenTo]}” olacaq. Müştərinin başqa aktiv müraciəti varsa, server bunu rədd edəcək.`,
                  confirmLabel: 'Yenidən aç',
                  tone: 'primary',
                  body: { action: 'REOPEN', to: reopenTo, note: note.trim() || undefined },
                })
              }
            >
              <RotateCcw className="size-3.5" /> Yenidən aç
            </button>
          </div>
        );
    }
  };

  return (
    <Panel title="Növbəti addım" icon={Zap} className="border-brand-400/50 ring-1 ring-brand-500/10">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-surface px-3 py-2.5 text-sm text-ink/85">
          {actions.length === 0 && !isFinal ? (
            <Hourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          )}
          <p>{SITUATION[c.status]}</p>
        </div>

        {c.staffNote && !isFinal && (
          <p className="rounded-lg border border-line px-3 py-2 text-xs text-muted">
            <span className="font-semibold text-ink/80">Son qeyd müştəriyə:</span> {c.staffNote}
          </p>
        )}

        {actions.length > 1 && (
          <div role="tablist" aria-label="Mümkün əməliyyatlar" className="flex flex-wrap gap-2">
            {actions.map((a) => {
              const M = ACTION_META[a];
              return (
                <button
                  key={a}
                  type="button"
                  role="tab"
                  aria-selected={selected === a}
                  onClick={() => setSelected(a)}
                  className={clsx(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition lg:min-h-9',
                    selected === a ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400',
                  )}
                >
                  <M.icon className="size-3.5" aria-hidden />
                  {a === 'SCHEDULE' && c.status === 'APPOINTMENT_SCHEDULED' ? 'Vaxtı dəyiş' : M.label}
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
                <Ban className="size-3.5" /> Müraciəti ləğv et
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
                <label htmlFor="ap-cancel" className="label text-red-800">
                  Ləğv səbəbi (müştəriyə göstəriləcək)
                </label>
                <textarea id="ap-cancel" className="input" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    disabled={cancelReason.trim().length < 3 || busy}
                    onClick={() =>
                      setConfirm({
                        title: 'Müraciət ləğv edilsin?',
                        message: 'Müraciət bağlanacaq və müştəriyə bildiriş göndəriləcək. Sonradan yenidən açmaq mümkündür.',
                        confirmLabel: 'Ləğv et',
                        tone: 'danger',
                        body: { action: 'CANCEL', reason: cancelReason.trim() },
                      })
                    }
                  >
                    <Ban className="size-3.5" /> Ləğv et
                  </button>
                  <button type="button" className="btn-white btn-sm border border-line" onClick={() => setShowCancel(false)}>
                    Bağla
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
