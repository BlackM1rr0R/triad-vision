import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ListPlus, Mic, PhoneIncoming, PhoneOutgoing, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { callError, fmtDuration, useCalls, type Call } from './api';

registerCopy(pagesCalls);

const STATUS_TONE: Record<string, string> = toneClasses(STATUS_TONES.call);

const fullName = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : '');

/** One call: status, outcome, note, transcript → AI summary → follow-up tasks, recording player. */
const CallRow = ({ call }: { call: Call }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState(call.transcript ?? '');
  const [created, setCreated] = useState<Set<number>>(new Set());
  const refresh = () => void qc.invalidateQueries({ queryKey: ['calls', 'list'] });
  const saveTranscript = useMutation({
    mutationFn: async () => (await api.patch(`/calls/${call.id}`, { transcript })).data,
    onSuccess: () => {
      refresh();
      toast.success(t('calls.saved'));
    },
    onError: (e) => toast.error(callError(t, e)),
  });
  const summarize = useMutation({
    mutationFn: async () => (await api.post(`/calls/${call.id}/summarize`)).data,
    onSuccess: refresh,
    onError: (e) => toast.error(callError(t, e)),
  });
  const task = useMutation({
    mutationFn: async ({ i }: { i: number }) => (await api.post(`/calls/${call.id}/tasks`, call.followUps[i])).data,
    onSuccess: (_d, v) => {
      setCreated((s) => new Set(s).add(v.i));
      toast.success(t('calls.log.taskCreated'));
    },
    onError: (e) => toast.error(callError(t, e)),
  });
  const Icon = call.direction === 'INBOUND' ? PhoneIncoming : PhoneOutgoing;
  const other = call.direction === 'INBOUND' ? call.from : call.to;
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Icon className="size-4 text-brand-600" aria-label={t(`calls.direction.${call.direction}`)} />
        <span className="font-semibold text-ink">{new Date(call.startedAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span className="text-muted">{other}</span>
        <span className={clsx('rounded-full px-2 py-0.5 font-semibold', STATUS_TONE[call.status])}>{t(`calls.status.${call.status}`)}</span>
        {call.outcome && <span className="rounded-full border border-line px-2 py-0.5 font-semibold text-ink">{t(`calls.outcome.${call.outcome}`)}</span>}
        {call.durationSec !== null && call.durationSec > 0 && <span className="text-muted tabular-nums">{fmtDuration(t, call.durationSec)}</span>}
        {call.provider === 'manual' && <span className="text-muted">· {t('calls.log.manual')}</span>}
        {call.staff && <span className="text-muted">· {t('calls.log.by', { name: fullName(call.staff) })}</span>}
      </div>
      {call.note && <p className="text-sm whitespace-pre-wrap text-ink">{call.note}</p>}
      {call.hasRecording && (
        <div className="flex items-center gap-2">
          <Mic className="size-4 text-red-600" aria-label={t('calls.log.recording')} />
          <audio controls preload="none" src={`/api/calls/${call.id}/recording`} className="h-8 w-full max-w-xs" />
        </div>
      )}
      {call.summary && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-2.5 text-sm">
          <p className="mb-1 flex items-center gap-1 text-xs font-bold text-brand-700">
            <Sparkles className="size-3.5" aria-hidden /> {t('calls.log.summary')}
          </p>
          <p className="text-ink">{call.summary}</p>
          {call.followUps.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-xs font-semibold text-muted">{t('calls.log.followUps')}</p>
              {call.followUps.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-2 py-1.5">
                  <span className="min-w-0 flex-1 text-xs text-ink">{f.title}</span>
                  <button type="button" className="btn-ghost btn-sm border border-line" disabled={created.has(i) || task.isPending} onClick={() => task.mutate({ i })}>
                    <ListPlus className="size-3.5" aria-hidden /> {created.has(i) ? t('calls.log.taskCreated') : t('calls.log.createTask')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript}>
          {call.transcript ? t('calls.log.transcript') : t('calls.log.addTranscript')}
        </button>
        {call.transcript && (
          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-60" disabled={summarize.isPending} onClick={() => summarize.mutate()}>
            <Sparkles className="size-3.5" aria-hidden /> {summarize.isPending ? t('calls.log.summarizing') : t('calls.log.summarize')}
          </button>
        )}
      </div>
      {showTranscript && (
        <div className="space-y-2">
          <textarea className="input min-h-28 text-xs" maxLength={60000} value={transcript} placeholder={t('calls.log.transcriptPlaceholder')} onChange={(e) => setTranscript(e.target.value)} aria-label={t('calls.log.transcript')} />
          <button type="button" className="btn-ghost btn-sm border border-line" disabled={saveTranscript.isPending || transcript === (call.transcript ?? '')} onClick={() => saveTranscript.mutate()}>
            {t('calls.log.saveTranscript')}
          </button>
        </div>
      )}
    </li>
  );
};

/** Call log of a client / case / inquiry (case page, call dialog) or of the current staff member. */
export const CallLog = ({ clientId, caseId, inquiryId, mine, compact }: { clientId?: string; caseId?: string; inquiryId?: string; mine?: boolean; compact?: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const calls = useCalls({ clientId, caseId, inquiryId, mine });
  useRealtime('call.updated', () => void qc.invalidateQueries({ queryKey: ['calls', 'list'] }));
  const rows = calls.data ?? [];
  return (
    <div>
      {!compact && <span className="sr-only">{t('calls.log.title')}</span>}
      {calls.isLoading ? <p className="text-sm text-muted">…</p> : rows.length === 0 ? <p className="text-sm text-muted">{t('calls.log.empty')}</p> : null}
      <ul className="divide-y divide-line">
        {(compact ? rows.slice(0, 5) : rows).map((c) => (
          <CallRow key={c.id} call={c} />
        ))}
      </ul>
    </div>
  );
};

export default CallLog;
