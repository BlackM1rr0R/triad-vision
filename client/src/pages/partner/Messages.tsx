import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { MessagesSquare, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { portalError } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading, Section } from '@/components/partnerPortal/ui';

export interface PartnerMessage {
  id: string;
  from: 'PARTNER' | 'TEAM';
  author: string | null;
  text: string;
  at: string;
}

/** Messages between the partner (and its team) and the Triad Vision team (GET/POST /partner/messages). */
export default function PartnerMessagesPage() {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['partner-portal', 'messages'], queryFn: async () => (await api.get<{ items: PartnerMessage[] }>('/partner/messages')).data.items });
  const send = useMutation({
    mutationFn: async () => (await api.post('/partner/messages', { text: text.trim() })).data,
    onSuccess: async () => {
      setText('');
      toast.success(t('partnerAccess.messages.sent'));
      await qc.invalidateQueries({ queryKey: ['partner-portal', 'messages'] });
    },
    onError: (err) => toast.error(portalError(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) send.mutate();
  };

  return (
    <Section title={t('partnerAccess.messages.title')} icon={MessagesSquare}>
      <p className="mb-4 text-sm text-muted">{t('partnerAccess.messages.intro')}</p>
      <form onSubmit={submit} className="mb-5 space-y-2">
        <label className="sr-only" htmlFor="partner-message">
          {t('partnerAccess.messages.placeholder')}
        </label>
        <textarea id="partner-message" className="input min-h-24" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('partnerAccess.messages.placeholder')} />
        <button type="submit" className="btn-primary" disabled={send.isPending || !text.trim()}>
          {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {t('partnerAccess.messages.send')}
        </button>
      </form>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <ErrorRetry onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="text-sm text-muted">{t('partnerAccess.messages.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {q.data.map((m) => (
            <li key={m.id} className={clsx('max-w-[42rem] rounded-2xl px-4 py-3', m.from === 'TEAM' ? 'bg-sunken' : 'ml-auto bg-accent-bg')}>
              <p className="text-xs font-semibold text-muted">
                {m.from === 'TEAM' ? `${t('partnerAccess.messages.team')}${m.author ? ` · ${m.author}` : ''}` : (m.author ?? t('partnerAccess.messages.you'))} · {dateTime(m.at)}
              </p>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap text-ink">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
