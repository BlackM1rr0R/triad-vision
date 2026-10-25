import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, Mic, Phone, PhoneCall, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';
import { Modal } from './Modal';
import { CallLog } from './CallLog';
import { FINAL, OUTCOMES, callError, telHref, useCallsStatus, type Call, type CallOutcome, type CallTarget } from './api';

registerCopy(pagesCalls);

/**
 * "📞 Zəng et" next to a phone number (case page, users, inquiries, my-work rows, callback requests). With a
 * provider: click-to-call (staff phone rings first, then the client) with live status; without one: the
 * "Telefon provayderi qoşulmayıb" notice with setup steps, a tel: link and a manual log. After the call the
 * staff member picks an outcome and writes a note.
 */
export const CallButton = ({ target, phone, name, compact, className }: { target: CallTarget; phone?: string | null; name?: string; compact?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={clsx(
          'inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary/25 bg-primary/[0.06] px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-link transition hover:bg-primary/10',
          className,
        )}
        title={t('calls.call')}
      >
        <PhoneCall className="size-3.5" aria-hidden />
        {!compact && t('calls.call')}
      </button>
      {open && <CallDialog target={target} phone={phone ?? null} name={name ?? phone ?? ''} onClose={() => setOpen(false)} />}
    </>
  );
};

const OutcomeForm = ({ onSave, busy, initial }: { onSave: (o: CallOutcome, note: string) => void; busy: boolean; initial?: Call | null }) => {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<CallOutcome | null>(initial?.outcome ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (outcome) onSave(outcome, note);
      }}
    >
      <fieldset>
        <legend className="label">{t('calls.outcomeLabel')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={outcome === o}
              onClick={() => setOutcome(o)}
              className={clsx('min-h-10 rounded-lg border px-2 text-xs font-semibold transition', outcome === o ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink hover:border-line-strong')}
            >
              {t(`calls.outcome.${o}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="label">{t('calls.noteLabel')}</span>
        <textarea className="input min-h-20 text-sm" maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('calls.notePlaceholder')} />
      </label>
      <button type="submit" className="btn-primary btn-sm w-full" disabled={!outcome || busy}>
        {t('calls.saveOutcome')}
      </button>
    </form>
  );
};

const CallDialog = ({ target, phone, name, onClose }: { target: CallTarget; phone: string | null; name: string; onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const status = useCallsStatus();
  const [call, setCall] = useState<Call | null>(null);
  const [saved, setSaved] = useState(false);
  const lang = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as 'az';

  useRealtime('call.updated', (p) => {
    const c = p.call as Call | undefined;
    if (c && call && c.id === call.id) setCall(c);
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['calls', 'list'] });
  const start = useMutation({
    mutationFn: async () => (await api.post<{ call: Call }>('/calls', target)).data.call,
    onSuccess: (c) => {
      setCall(c);
      refresh();
    },
    onError: (err) => toast.error(callError(t, err)),
  });
  const save = useMutation({
    mutationFn: async ({ outcome, note }: { outcome: CallOutcome; note: string }) =>
      call
        ? (await api.patch<{ call: Call }>(`/calls/${call.id}`, { outcome, note })).data.call
        : (await api.post<{ call: Call }>('/calls/log', { target: phone && !Object.keys(target).length ? { phone } : target, outcome, note })).data.call,
    onSuccess: (c) => {
      setCall(c);
      setSaved(true);
      toast.success(t('calls.saved'));
      refresh();
      void qc.invalidateQueries({ queryKey: ['callbacks'] });
    },
    onError: (err) => toast.error(callError(t, err)),
  });

  const s = status.data;
  const ready = !!s?.configured && !!s.staffPhone;
  const live = call && !FINAL.includes(call.status) && call.provider !== 'manual';
  const filter = target.clientId ? { clientId: target.clientId } : target.caseId ? { caseId: target.caseId } : target.inquiryId ? { inquiryId: target.inquiryId } : null;

  return (
    <Modal open onClose={onClose} title={t('calls.callTitle', { name })} wide={!!filter}>
      <div className="space-y-4">
        {phone && (
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Phone className="size-4 text-link" aria-hidden /> {phone}
          </p>
        )}

        {status.isLoading && <p className="text-sm text-muted">…</p>}

        {s && !s.configured && (
          <div className="space-y-2 rounded-xl border border-warning-border bg-warning-bg p-3 text-xs text-warning-fg" role="status">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <AlertTriangle className="size-4" aria-hidden /> {t('calls.notConfigured')}
            </p>
            <p>{t('calls.notConfiguredHint')}</p>
            <p className="text-warning-fg/80">{t('calls.setupSteps')}</p>
            {s.canConfigure && (
              <Link to="/admin/calls?tab=settings" className="inline-flex items-center gap-1 font-semibold underline" onClick={onClose}>
                <Settings className="size-3.5" aria-hidden /> {t('calls.setupLink')}
              </Link>
            )}
          </div>
        )}
        {s?.configured && !s.staffPhone && (
          <p className="rounded-xl border border-warning-border bg-warning-bg p-3 text-xs text-warning-fg" role="status">
            {t('calls.staffPhoneMissing')}
          </p>
        )}

        {ready && !call && (
          <div className="space-y-2">
            <p className="text-xs text-muted">{t('calls.howItWorks', { phone: s!.staffPhone })}</p>
            {s!.recording && (
              <p className="flex items-start gap-1.5 rounded-lg bg-sunken p-2 text-xs text-muted">
                <Mic className="mt-0.5 size-3.5 shrink-0 text-danger-fg" aria-hidden /> {t('calls.recordingOn')} „{s!.recordingNotice[lang] ?? s!.recordingNotice.az}“
              </p>
            )}
            <button type="button" className="btn-primary w-full" disabled={start.isPending} onClick={() => start.mutate()}>
              <PhoneCall className="size-4" aria-hidden /> {start.isPending ? t('calls.calling') : t('calls.start')}
            </button>
          </div>
        )}

        {s && !ready && phone && (
          <a href={telHref(phone)} className="btn-secondary btn-sm w-full border border-line">
            <Phone className="size-4" aria-hidden /> {t('calls.dialOwn')}
          </a>
        )}

        {call && call.provider !== 'manual' && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-sunken px-3 py-2 text-sm" aria-live="polite">
            <span className="text-muted">{t('calls.statusLabel')}</span>
            <span className={clsx('font-semibold', live ? 'text-link' : 'text-ink')}>
              {live && <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-success" aria-hidden />}
              {t(`calls.status.${call.status}`)}
            </span>
          </div>
        )}

        {(!ready || call) && !saved && (
          <section>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{call ? t('calls.logTitle') : t('calls.logManual')}</h3>
            <OutcomeForm busy={save.isPending} initial={call} onSave={(outcome, note) => save.mutate({ outcome, note })} />
          </section>
        )}
        {saved && <p className="rounded-lg bg-success-bg p-2 text-center text-sm font-semibold text-success-fg">{t('calls.saved')}</p>}

        {filter && (
          <div className="border-t border-line pt-3">
            <CallLog {...filter} compact />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CallButton;
