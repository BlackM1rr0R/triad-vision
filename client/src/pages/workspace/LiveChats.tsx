import { useEffect, useRef, useState } from 'react';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowLeft, Bell, BellOff, Check, Headset, Link2, Send, Sparkles, UserPlus, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';
import { CallButton } from '@/components/calls/CallButton';
import { setSoundEnabled, soundEnabled } from '@/components/livechat/LiveChatAlerts';

registerCopy(pagesCalls);

type Status = 'WAITING' | 'ACTIVE' | 'CLOSED' | 'MISSED';
interface Row {
  id: string;
  status: Status;
  locale: string;
  visitorName: string | null;
  createdAt: string;
  acceptedAt: string | null;
  staff: { id: string; name: string } | null;
  last: string;
  unread: number;
}
interface Detail {
  id: string;
  status: Status;
  locale: string;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  pageUrl: string | null;
  reason: string | null;
  transcript: { role: string; content: string }[];
  staff: { id: string; name: string } | null;
  client: { id: string; firstName: string; lastName: string; email: string; phone: string | null } | null;
  inquiryId: string | null;
  createdAt: string;
  acceptDeadline: string;
  messages: { id: string; author: 'VISITOR' | 'STAFF' | 'SYSTEM'; staffName: string | null; body: string; createdAt: string }[];
}

const TONE: Record<Status, string> = toneClasses(STATUS_TONES.liveChat);

/** Workspace → "Canlı söhbətlər": queue of visitor chats handed over by the AI advisor, accept and chat live. */
export default function LiveChats() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selected = params.get('chat');
  const [sound, setSound] = useState(soundEnabled);
  const queue = useQuery({
    queryKey: ['livechat', 'queue'],
    queryFn: async () => (await api.get<{ me: string; chats: Row[] }>('/livechat/staff/queue')).data,
    refetchInterval: 30_000,
  });
  const rows = queue.data?.chats ?? [];
  const groups: [string, Row[]][] = [
    [t('livechat.staff.waiting'), rows.filter((r) => r.status === 'WAITING')],
    [t('livechat.staff.active'), rows.filter((r) => r.status === 'ACTIVE')],
    [t('livechat.staff.closedList'), rows.filter((r) => r.status === 'CLOSED' || r.status === 'MISSED')],
  ];
  const select = (id: string | null) => setParams(id ? { chat: id } : {}, { replace: true });

  return (
    <div className="flex h-full min-h-0 bg-sunken">
      <aside className={clsx('flex w-full min-w-0 flex-col border-r border-line bg-card md:w-80 md:shrink-0', selected && 'hidden md:flex')}>
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Headset className="size-5 text-link" aria-hidden />
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{t('livechat.staff.title')}</h1>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken"
            aria-pressed={sound}
            title={sound ? t('livechat.staff.soundOn') : t('livechat.staff.soundOff')}
            aria-label={sound ? t('livechat.staff.soundOn') : t('livechat.staff.soundOff')}
            onClick={() => {
              setSoundEnabled(!sound);
              setSound(!sound);
            }}
          >
            {sound ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!rows.length && !queue.isLoading && <p className="p-4 text-sm text-muted">{t('livechat.staff.none')}</p>}
          {groups.map(([label, list]) =>
            list.length ? (
              <section key={label}>
                <h2 className="px-4 pt-3 pb-1 text-[11px] font-bold tracking-wide text-muted uppercase">{label}</h2>
                <ul>
                  {list.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => select(r.id)} className={clsx('flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition hover:bg-sunken', selected === r.id && 'bg-primary/[0.06]')}>
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.visitorName ?? t('livechat.staff.visitor')}</span>
                          <span className="text-[10px] font-semibold text-muted uppercase">{r.locale}</span>
                          <span className={clsx('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', TONE[r.status])}>{t(`livechat.staff.status.${r.status}`)}</span>
                        </span>
                        <span className="truncate text-xs text-muted">{r.last || '—'}</span>
                        {r.staff && <span className="truncate text-[11px] text-muted">{r.staff.name}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      </aside>
      <main className={clsx('min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden md:flex')}>
        {selected ? <ChatPane id={selected} me={queue.data?.me ?? ''} onBack={() => select(null)} /> : <p className="m-auto text-sm text-muted">{t('livechat.staff.empty')}</p>}
      </main>
    </div>
  );
}

const ChatPane = ({ id, me, onBack }: { id: string; me: string; onBack: () => void }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [clientId, setClientId] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ['livechat', 'chat', id],
    queryFn: async () => (await api.get<{ chat: Detail }>(`/livechat/staff/${id}`)).data.chat,
    refetchInterval: 15_000,
  });
  const chat = q.data;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat?.messages.length]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['livechat'] });
  const act = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: Record<string, unknown> }) => (await api.post(`/livechat/staff/${id}/${path}`, body ?? {})).data,
    onSuccess: (_d, v) => {
      refresh();
      if (v.path === 'messages') setInput('');
      if (v.path === 'lead') toast.success(t('livechat.staff.leadCreated'));
      if (v.path === 'link') toast.success(t('livechat.staff.linked'));
    },
    onError: (err) => toast.error(errorCode(err) === 'LIVECHAT_TAKEN' ? t('livechat.staff.taken') : t('calls.error')),
  });
  if (!chat) return <p className="m-auto text-sm text-muted">…</p>;
  const mine = chat.staff?.id === me;
  const name = chat.visitorName ?? t('livechat.staff.visitor');
  const time = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2.5">
        <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken md:hidden" onClick={onBack} aria-label={t('calls.close')}>
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{name}</p>
          <p className="truncate text-[11px] text-muted">
            {[chat.locale.toUpperCase(), chat.visitorEmail, chat.visitorPhone, chat.pageUrl ? `${t('livechat.staff.page')}: ${chat.pageUrl}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        {chat.status === 'WAITING' && (
          <button type="button" className="btn-primary btn-sm" disabled={act.isPending} onClick={() => act.mutate({ path: 'accept' })}>
            <Check className="size-4" aria-hidden /> {t('livechat.staff.accept')}
          </button>
        )}
        {chat.visitorPhone && <CallButton target={{ liveChatId: chat.id }} phone={chat.visitorPhone} name={name} compact />}
        {!chat.inquiryId && !chat.client && (
          <button type="button" className="btn-secondary btn-sm border border-line" disabled={act.isPending || !chat.visitorName} onClick={() => act.mutate({ path: 'lead' })}>
            <UserPlus className="size-4" aria-hidden /> {t('livechat.staff.toLead')}
          </button>
        )}
        {chat.inquiryId && (
          <Link to="/admin/inquiries" className="text-xs font-semibold text-link underline">
            {t('livechat.staff.leadCreated')}
          </Link>
        )}
        {(chat.status === 'ACTIVE' || chat.status === 'WAITING') && (mine || chat.status === 'WAITING') && (
          <button type="button" className="btn-secondary btn-sm border border-line text-danger-fg" disabled={act.isPending} onClick={() => act.mutate({ path: 'close' })}>
            <X className="size-4" aria-hidden /> {t('livechat.staff.close')}
          </button>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {chat.transcript.length > 0 && (
          <details className="rounded-xl border border-line bg-card p-3 text-sm" open={chat.status === 'WAITING'}>
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-link">
              <Sparkles className="size-3.5" aria-hidden /> {t('livechat.staff.aiTranscript')} ({chat.transcript.length})
            </summary>
            <div className="mt-2 space-y-1.5">
              {chat.transcript.map((m, i) => (
                <p key={i} className={clsx('rounded-lg px-2 py-1 text-xs whitespace-pre-wrap', m.role === 'user' ? 'bg-primary/[0.06] text-ink' : 'bg-sunken text-muted')}>
                  <span className="font-semibold">{m.role === 'user' ? name : 'AI'}:</span> {m.content}
                </p>
              ))}
            </div>
          </details>
        )}
        {chat.messages.map((m) =>
          m.author === 'SYSTEM' ? (
            <p key={m.id} className="text-center text-[11px] text-muted">
              {m.body}
            </p>
          ) : (
            <div key={m.id} className={clsx('max-w-[80%] rounded-xl px-3 py-2 text-sm break-words whitespace-pre-wrap shadow-[var(--tv-shadow-card)]', m.author === 'STAFF' ? 'ml-auto rounded-tr-sm bg-primary text-primary-contrast' : 'rounded-tl-sm bg-card text-ink')}>
              {m.body}
              <span className={clsx('mt-0.5 block text-right text-[10px]', m.author === 'STAFF' ? 'text-primary-contrast/70' : 'text-muted')}>
                {m.staffName ? `${m.staffName} · ` : ''}
                {time(m.createdAt)}
              </span>
            </div>
          ),
        )}
      </div>

      {!chat.client && (
        <form
          className="flex items-center gap-2 border-t border-line bg-card px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (clientId.trim()) act.mutate({ path: 'link', body: { clientId: clientId.trim() } });
          }}
        >
          <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
          <input className="input min-h-9 flex-1 py-1.5 text-xs" maxLength={40} placeholder={t('livechat.staff.linkPlaceholder')} aria-label={t('livechat.staff.link')} value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <button type="submit" className="btn-secondary btn-sm border border-line" disabled={!clientId.trim() || act.isPending}>
            {t('livechat.staff.link')}
          </button>
        </form>
      )}
      {chat.client && (
        <p className="border-t border-line bg-card px-3 py-2 text-xs text-muted">
          {t('livechat.staff.linked')}: <span className="font-semibold text-ink">{`${chat.client.firstName} ${chat.client.lastName}`}</span> · {chat.client.email}
        </p>
      )}

      {chat.status === 'ACTIVE' && mine && (
        <form
          className="flex items-end gap-2 border-t border-line bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) act.mutate({ path: 'messages', body: { body: input.trim() } });
          }}
        >
          <textarea
            rows={2}
            maxLength={2000}
            className="input min-h-10 sm:min-h-9 flex-1 resize-none text-sm"
            placeholder={t('livechat.placeholder')}
            aria-label={t('livechat.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) act.mutate({ path: 'messages', body: { body: input.trim() } });
              }
            }}
          />
          <button type="submit" className="btn-primary grid size-11 shrink-0 place-items-center p-0" aria-label={t('livechat.send')} disabled={act.isPending || !input.trim()}>
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      )}
    </>
  );
};
