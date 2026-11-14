import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ExternalLink, Mic, Send } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseMessage } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { fmtRelative, toastError } from '@/components/admin/labels';
import { BottomSheet } from './BottomSheet';

type Msg = CaseMessage & { voice?: unknown };

/** Messages shown above the composer. */
const RECENT = 5;

/**
 * Phone reply sheet: the last messages of the case and a composer that writes to the client
 * (POST /admin/cases/:id/messages — the same endpoint as the case page's communication tab).
 */
export const ReplySheet = ({ open, onClose, caseId, number, clientName }: { open: boolean; onClose: () => void; caseId: string | null; number?: string; clientName?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  useEffect(() => {
    if (!open) setBody('');
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-case-messages', caseId],
    queryFn: async () => (await api.get<{ messages: Msg[] }>(`/admin/cases/${caseId}/messages`)).data.messages,
    enabled: open && !!caseId,
    staleTime: 10_000,
  });
  const send = useMutation({
    mutationFn: async () => (await api.post(`/admin/cases/${caseId}/messages`, { body: body.trim() })).data,
    onSuccess: () => {
      toast.success(t('smob.reply.sent'));
      void qc.invalidateQueries({ queryKey: ['admin-case-messages', caseId] });
      void qc.invalidateQueries({ queryKey: ['admin-inbox'] });
      void qc.invalidateQueries({ queryKey: ['admin-case', caseId] });
      void qc.invalidateQueries({ queryKey: ['admin-cases'] });
      onClose();
    },
    onError: (err) => toastError(err),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (body.trim() && !send.isPending) send.mutate();
  };
  const recent = (data ?? []).slice(-RECENT);
  const formId = `reply-${caseId ?? 'none'}`;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      busy={send.isPending}
      title={t('smob.reply.title')}
      subtitle={[number, clientName].filter(Boolean).join(' · ')}
      footer={
        <>
          {caseId && (
            <Link to={`/admin/cases/${caseId}?tab=communication`} onClick={onClose} className="btn-secondary min-h-12 flex-1 justify-center">
              <ExternalLink className="size-4" aria-hidden /> {t('smob.reply.openCase')}
            </Link>
          )}
          <button type="submit" form={formId} className="btn-primary min-h-12 flex-1 justify-center" disabled={!body.trim() || send.isPending}>
            {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {t('smob.reply.send')}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-4">
        <section aria-label={t('smob.reply.recent')}>
          <p className="type-overline mb-2">{t('smob.reply.recent')}</p>
          {isLoading ? (
            <div className="grid place-items-center py-6 text-muted">
              <Spinner className="size-5" />
            </div>
          ) : recent.length === 0 ? (
            <p className="py-3 text-sm text-muted">{t('smob.reply.none')}</p>
          ) : (
            <ol className="space-y-2">
              {recent.map((m) => {
                const mine = m.author.role !== 'CLIENT';
                return (
                  <li key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div className={clsx('max-w-[85%] rounded-2xl px-3 py-2 text-sm', mine ? 'bg-info-bg text-ink' : 'bg-sunken text-ink')}>
                      <p className="text-[11px] font-semibold text-muted">
                        {mine ? t('smob.reply.you') : `${m.author.firstName} ${m.author.lastName}`.trim()} · {fmtRelative(m.createdAt)}
                      </p>
                      {m.body ? (
                        <p className="mt-0.5 break-words whitespace-pre-line">{m.body}</p>
                      ) : m.voice ? (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-muted">
                          <Mic className="size-3.5" aria-hidden /> {t('smob.reply.voice')}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <form id={formId} onSubmit={submit}>
          <label className="sr-only" htmlFor={`${formId}-body`}>
            {t('smob.reply.placeholder')}
          </label>
          <textarea
            id={`${formId}-body`}
            data-autofocus
            className="input min-h-28 w-full text-base"
            maxLength={4000}
            placeholder={t('smob.reply.placeholder')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </form>
      </div>
    </BottomSheet>
  );
};
