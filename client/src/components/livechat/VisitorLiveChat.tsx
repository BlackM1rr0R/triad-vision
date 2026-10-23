import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeft, Headset, Send, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';
import { CallbackForm } from '@/components/calls/CallbackForm';

registerCopy(pagesCalls);

/**
 * Visitor side of the AI → human handover, inside the advisor bubble. Starts a live chat with the AI
 * transcript (POST /api/livechat), listens on its own SSE stream (signed visitor token, no login) and falls
 * back to polling. Offline / nobody accepted within 2 minutes → contact details (callback request).
 */

interface Msg {
  id: string;
  author: 'VISITOR' | 'STAFF' | 'SYSTEM';
  staffName: string | null;
  body: string;
  createdAt: string;
}
interface ChatView {
  id: string;
  status: 'WAITING' | 'ACTIVE' | 'CLOSED' | 'MISSED';
  staffName: string | null;
  acceptDeadline: string;
  messages: Msg[];
}

const STORE = 'tv.livechat';
const loadStored = (): { id: string; token: string } | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE) ?? 'null') as { id: string; token: string } | null;
    return v && typeof v.id === 'string' && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
};
const saveStored = (v: { id: string; token: string } | null) => {
  try {
    if (v) sessionStorage.setItem(STORE, JSON.stringify(v));
    else sessionStorage.removeItem(STORE);
  } catch {
    /* storage unavailable */
  }
};

export const VisitorLiveChat = ({
  transcript,
  lang,
  reason,
  onBack,
}: {
  transcript: { role: 'user' | 'assistant'; content: string }[];
  lang: string;
  reason: 'button' | 'ai_unsure' | 'asked' | 'ai_error';
  onBack: () => void;
}) => {
  const { t } = useTranslation();
  const [session, setSession] = useState(loadStored);
  const [chat, setChat] = useState<ChatView | null>(null);
  const [offline, setOffline] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const listRef = useRef<HTMLDivElement>(null);

  const merge = useCallback((m: Msg) => setChat((c) => (c && !c.messages.some((x) => x.id === m.id) ? { ...c, messages: [...c.messages, m] } : c)), []);

  // Resume a stored chat, or check availability.
  useEffect(() => {
    let cancelled = false;
    if (session) {
      api
        .get<{ chat: ChatView }>(`/livechat/${session.id}`, { headers: { 'x-livechat-token': session.token } })
        .then(({ data }) => !cancelled && setChat(data.chat))
        .catch(() => {
          saveStored(null);
          if (!cancelled) setSession(null);
        });
    } else {
      api
        .get<{ available: boolean }>('/livechat/availability')
        .then(({ data }) => !cancelled && setAvailable(data.available))
        .catch(() => !cancelled && setAvailable(false));
    }
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Live updates: SSE, polling as a fallback.
  const status = chat?.status;
  useEffect(() => {
    if (!session || !status || status === 'CLOSED' || status === 'MISSED') return;
    let poll = 0;
    const refresh = () =>
      api
        .get<{ chat: ChatView }>(`/livechat/${session.id}`, { headers: { 'x-livechat-token': session.token } })
        .then(({ data }) => setChat(data.chat))
        .catch(() => undefined);
    const es = typeof EventSource !== 'undefined' ? new EventSource(`/api/livechat/${session.id}/events?token=${encodeURIComponent(session.token)}`) : null;
    if (es) {
      es.addEventListener('livechat.message', (e) => {
        try {
          merge((JSON.parse((e as MessageEvent<string>).data) as { message: Msg }).message);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('livechat.status', (e) => {
        try {
          const p = JSON.parse((e as MessageEvent<string>).data) as { status: ChatView['status']; staffName?: string };
          setChat((c) => (c ? { ...c, status: p.status, staffName: p.staffName ?? c.staffName } : c));
          if (p.status !== 'WAITING') void refresh();
        } catch {
          /* ignore */
        }
      });
      es.onerror = () => {
        if (!poll) poll = window.setInterval(refresh, 5000);
      };
    } else poll = window.setInterval(refresh, 5000);
    return () => {
      es?.close();
      if (poll) window.clearInterval(poll);
    };
  }, [session, status, merge]);

  // Countdown while waiting; past the deadline ask the server (it marks the chat as missed).
  useEffect(() => {
    if (status !== 'WAITING') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status]);
  const left = chat ? Math.max(0, Math.round((Date.parse(chat.acceptDeadline) - now) / 1000)) : 0;
  useEffect(() => {
    if (status === 'WAITING' && left === 0 && session) {
      const id = window.setTimeout(() => {
        void api.get<{ chat: ChatView }>(`/livechat/${session.id}`, { headers: { 'x-livechat-token': session.token } }).then(({ data }) => setChat(data.chat));
      }, 1500);
      return () => window.clearTimeout(id);
    }
  }, [status, left, session]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat?.messages.length, status]);

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post<{ token: string; chat: ChatView }>('/livechat', {
        lang,
        transcript: transcript.slice(-24).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
        reason,
        ...(name.trim() ? { name: name.trim() } : {}),
        pageUrl: window.location.pathname.slice(0, 300),
      });
      const s = { id: data.chat.id, token: data.token };
      saveStored(s);
      setSession(s);
      setChat(data.chat);
    } catch (err) {
      if (errorCode(err) === 'LIVECHAT_OFFLINE' || errorCode(err) === 'TOO_MANY_REQUESTS') setOffline(true);
      setAvailable(false);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const body = input.trim();
    if (!body || !session || busy) return;
    setInput('');
    setBusy(true);
    try {
      const { data } = await api.post<{ message: Msg }>(`/livechat/${session.id}/messages`, { body }, { headers: { 'x-livechat-token': session.token } });
      merge(data.message);
    } catch {
      setInput(body);
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (session) await api.post(`/livechat/${session.id}/close`, {}, { headers: { 'x-livechat-token': session.token } }).catch(() => undefined);
    saveStored(null);
    setSession(null);
    setChat(null);
    onBack();
  };

  const header = (
    <div className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
      <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface" aria-label={t('livechat.backToAi')} title={t('livechat.backToAi')} onClick={chat && (status === 'WAITING' || status === 'ACTIVE') ? undefined : end} disabled={!!chat && (status === 'WAITING' || status === 'ACTIVE')}>
        <ArrowLeft className="size-4" aria-hidden />
      </button>
      <Headset className="size-4 text-brand-600" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
        {status === 'ACTIVE' && chat?.staffName ? t('livechat.connected', { name: chat.staffName }) : t('livechat.talkToHuman')}
      </p>
      {chat && (status === 'WAITING' || status === 'ACTIVE') && (
        <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={() => void end()}>
          <X className="size-3.5" aria-hidden /> {t('livechat.end')}
        </button>
      )}
    </div>
  );

  // No chat yet: availability check → start, or offline contact form.
  if (!chat) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface/60 p-3">
          {available === null && <p className="text-xs text-muted">…</p>}
          {available && !offline && (
            <form
              className="space-y-2 rounded-xl border border-line bg-card p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void start();
              }}
            >
              <label className="block">
                <span className="label">{t('livechat.yourName')}</span>
                <input className="input" maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <button type="submit" className="btn-primary btn-sm w-full" disabled={busy}>
                <Headset className="size-4" aria-hidden /> {t('livechat.start')}
              </button>
            </form>
          )}
          {(available === false || offline) && (
            <>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900" role="status">
                {t('livechat.offline')}
              </p>
              <div className="rounded-xl border border-line bg-card p-3">
                <CallbackForm source="advisor" compact />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-surface/60 p-3" aria-live="polite">
        {chat.messages.map((m) =>
          m.author === 'SYSTEM' ? (
            <p key={m.id} className="text-center text-[11px] text-muted">
              {m.body}
            </p>
          ) : (
            <div key={m.id} className={clsx('max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap shadow-sm', m.author === 'VISITOR' ? 'ml-auto rounded-tr-sm bg-brand-600 text-white' : 'rounded-tl-sm bg-card text-ink')}>
              {m.author === 'STAFF' && m.staffName && <span className="mb-0.5 block text-[10px] font-bold text-brand-700">{m.staffName}</span>}
              {m.body}
            </div>
          ),
        )}
        {status === 'WAITING' && (
          <p className="rounded-xl border border-brand-200 bg-brand-50/70 p-2.5 text-xs text-ink" role="status">
            <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-brand-600" aria-hidden />
            {t('livechat.connecting')} <span className="font-semibold tabular-nums">{t('livechat.waitingLeft', { sec: left })}</span>
          </p>
        )}
        {status === 'MISSED' && session && <MissedContact session={session} />}
        {status === 'CLOSED' && (
          <div className="space-y-2 text-center">
            <p className="text-xs text-muted">{t('livechat.closed')}</p>
            <button type="button" className="btn-ghost btn-sm border border-line bg-card" onClick={() => void end()}>
              {t('livechat.backToAi')}
            </button>
          </div>
        )}
      </div>
      {(status === 'WAITING' || status === 'ACTIVE') && (
        <form
          className="flex items-end gap-2 border-t border-line bg-card p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="lc-input">
            {t('livechat.placeholder')}
          </label>
          <textarea
            id="lc-input"
            rows={1}
            maxLength={2000}
            className="input max-h-28 min-h-11 flex-1 resize-none py-2.5 text-sm"
            placeholder={t('livechat.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="submit" className="btn-primary grid size-11 shrink-0 place-items-center p-0" aria-label={t('livechat.send')} disabled={busy || !input.trim()}>
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      )}
    </div>
  );
};

/** Nobody accepted: contact details (with a phone + "call me" → callback request, otherwise an inquiry). */
const MissedContact = ({ session }: { session: { id: string; token: string } }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [callMe, setCallMe] = useState(true);
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState(false);
  if (done)
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-900" role="status">
        {done}
      </p>
    );
  return (
    <form
      className="space-y-2 rounded-xl border border-line bg-card p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(false);
        try {
          const { data } = await api.post<{ confirmation?: string }>(
            `/livechat/${session.id}/contact`,
            { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}), ...(phone.trim() && callMe ? { window: 'asap' } : {}), consent: true },
            { headers: { 'x-livechat-token': session.token } },
          );
          setDone(data.confirmation ?? t('livechat.sent'));
          saveStored(null);
        } catch {
          setError(true);
        }
      }}
    >
      <p className="text-xs text-ink">{t('livechat.missed')}</p>
      <input className="input" required minLength={2} maxLength={120} placeholder={t('callback.name')} aria-label={t('callback.name')} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" type="tel" inputMode="tel" maxLength={30} placeholder={t('callback.phone')} aria-label={t('callback.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input className="input" type="email" maxLength={200} placeholder={t('livechat.email')} aria-label={t('livechat.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
      {phone.trim() && (
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" className="size-4" checked={callMe} onChange={(e) => setCallMe(e.target.checked)} /> {t('livechat.callMe')}
        </label>
      )}
      <label className="flex items-start gap-2 text-[11px] text-muted">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0" required checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('callback.consent')}
      </label>
      {error && <p className="text-xs text-red-700">{t('callback.error')}</p>}
      <button type="submit" className="btn-primary btn-sm w-full" disabled={!consent || !name.trim() || (!phone.trim() && !email.trim())}>
        {t('callback.submit')}
      </button>
    </form>
  );
};

export default VisitorLiveChat;
