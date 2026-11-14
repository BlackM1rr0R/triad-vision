import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeft, Check, CheckCheck, ChevronDown, Clock, Headset, MoonStar, RotateCw, Send, Sparkles, UserRound, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { tempId } from '@/lib/optimistic';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';
import { pagesLiveChatPlus } from '@/i18n/pagesLiveChatPlus';
import { CallbackForm } from '@/components/calls/CallbackForm';

registerCopy(pagesCalls);
registerCopy(pagesLiveChatPlus);

/**
 * Visitor side of the AI → human handover, inside the advisor bubble. Starts a live chat with the AI
 * transcript (POST /api/livechat), listens on its own SSE stream (signed visitor token, no login) and falls
 * back to polling. Nobody online / outside office hours → an offline chat: it waits in the staff queue, the AI
 * advisor answers meanwhile (server lib/livechat/offlineAi.ts) and the first colleague back takes over here.
 * Online but nobody accepted within 2 minutes → contact details (callback request).
 *
 * Storage: only the chat id + its visitor token in sessionStorage (`tv.livechat`, this tab, strictly necessary
 * to keep the conversation across page changes) — no cookie, nothing that needs consent.
 */

interface Msg {
  id: string;
  author: 'VISITOR' | 'STAFF' | 'SYSTEM' | 'AI';
  staffName: string | null;
  body: string;
  createdAt: string;
}
interface ChatView {
  id: string;
  status: 'WAITING' | 'ACTIVE' | 'CLOSED' | 'MISSED';
  staffName: string | null;
  offline?: boolean;
  acceptDeadline: string | null;
  messages: Msg[];
}
interface Availability {
  available: boolean;
  officeOpen: boolean;
  nextOpen?: string | null;
}
type Session = { id: string; token: string };

export const LIVECHAT_STORE = 'tv.livechat';
export const loadLiveChatSession = (): Session | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(LIVECHAT_STORE) ?? 'null') as Session | null;
    return v && typeof v.id === 'string' && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
};
const saveStored = (v: Session | null) => {
  try {
    if (v) sessionStorage.setItem(LIVECHAT_STORE, JSON.stringify(v));
    else sessionStorage.removeItem(LIVECHAT_STORE);
  } catch {
    /* storage unavailable */
  }
};

const eventsUrl = (s: Session) => `/api/livechat/${s.id}/events?token=${encodeURIComponent(s.token)}`;

/**
 * Unread replies (staff / AI) while the advisor panel is closed: a light SSE listener on the stored chat.
 * `listen` false (panel open, or no chat) resets the count.
 */
export const useLiveChatUnread = (listen: boolean) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!listen) {
      setCount(0);
      return;
    }
    const s = loadLiveChatSession();
    if (!s || typeof EventSource === 'undefined') return;
    const es = new EventSource(eventsUrl(s));
    es.addEventListener('livechat.message', (e) => {
      try {
        const m = (JSON.parse((e as MessageEvent<string>).data) as { message: Msg }).message;
        if (m.author === 'STAFF' || m.author === 'AI') setCount((n) => n + 1);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('livechat.status', (e) => {
      try {
        const p = JSON.parse((e as MessageEvent<string>).data) as { status: string };
        if (p.status === 'CLOSED' || p.status === 'MISSED') es.close();
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, [listen]);
  return count;
};

const timeOf = (iso: string, lng: string) => {
  try {
    return new Intl.DateTimeFormat(lng === 'az' ? 'az-Latn-AZ' : lng, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
};
const dayOf = (iso: string) => new Date(iso).toDateString();

const TypingDots = () => (
  <span className="inline-flex items-center gap-1" aria-hidden>
    {[0, 150, 300].map((d) => (
      <span key={d} className="size-1.5 rounded-full bg-muted motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
    ))}
  </span>
);

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
  const { t, i18n } = useTranslation();
  const uiLang = i18n.resolvedLanguage ?? lang;
  const [session, setSession] = useState(loadLiveChatSession);
  const [chat, setChat] = useState<ChatView | null>(null);
  const [offline, setOffline] = useState(false);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showCallback, setShowCallback] = useState(false);
  const [typing, setTyping] = useState<{ who: 'STAFF' | 'AI'; name?: string } | null>(null);
  // Optimistic outbox: visitor messages shown at once, removed when the server's copy arrives.
  const [outbox, setOutbox] = useState<{ id: string; body: string; failed: boolean }[]>([]);
  const [now, setNow] = useState(Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const lastPing = useRef(0);

  const merge = useCallback(
    (m: Msg) => {
      setChat((c) => (c && !c.messages.some((x) => x.id === m.id) ? { ...c, messages: [...c.messages, m] } : c));
      if (m.author === 'STAFF' || m.author === 'AI') setTyping(null);
    },
    [],
  );

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
        .get<Availability>('/livechat/availability')
        .then(({ data }) => !cancelled && setAvail(data))
        .catch(() => !cancelled && setAvail({ available: false, officeOpen: false }));
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
    const es = typeof EventSource !== 'undefined' ? new EventSource(eventsUrl(session)) : null;
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
          // Also on (re)connect: picks up messages sent while the stream was not open yet (e.g. a fast AI answer).
          void refresh();
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('livechat.typing', (e) => {
        try {
          const p = JSON.parse((e as MessageEvent<string>).data) as { who: 'STAFF' | 'AI'; name?: string; on: boolean };
          window.clearTimeout(typingTimer.current);
          if (!p.on) {
            setTyping(null);
            return;
          }
          setTyping({ who: p.who, name: p.name });
          // Staff pings while typing; the indicator fades when the pings stop. The AI sends on/off itself.
          typingTimer.current = window.setTimeout(() => setTyping(null), p.who === 'AI' ? 30_000 : 5000);
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
      window.clearTimeout(typingTimer.current);
    };
  }, [session, status, merge]);

  // Countdown while waiting for an online colleague; past the deadline ask the server (it marks the chat as missed).
  const deadline = chat?.acceptDeadline ?? null;
  useEffect(() => {
    if (status !== 'WAITING' || !deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status, deadline]);
  const left = deadline ? Math.max(0, Math.round((Date.parse(deadline) - now) / 1000)) : 0;
  useEffect(() => {
    if (status === 'WAITING' && deadline && left === 0 && session) {
      const id = window.setTimeout(() => {
        void api.get<{ chat: ChatView }>(`/livechat/${session.id}`, { headers: { 'x-livechat-token': session.token } }).then(({ data }) => setChat(data.chat));
      }, 1500);
      return () => window.clearTimeout(id);
    }
  }, [status, deadline, left, session]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat?.messages.length, outbox.length, status, typing, showContact]);

  const start = async (asOffline: boolean) => {
    setBusy(true);
    try {
      const message = question.trim().slice(0, 2000);
      const { data } = await api.post<{ token: string; chat: ChatView }>('/livechat', {
        lang,
        transcript: transcript.slice(-24).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
        reason,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(asOffline ? { offline: true, ...(message ? { message } : {}) } : {}),
        pageUrl: window.location.pathname.slice(0, 300),
      });
      const s = { id: data.chat.id, token: data.token };
      saveStored(s);
      setSession(s);
      setChat(data.chat);
      setQuestion('');
      if (asOffline && message) setTyping({ who: 'AI' });
    } catch (err) {
      if (errorCode(err) === 'LIVECHAT_OFFLINE' || errorCode(err) === 'TOO_MANY_REQUESTS') setOffline(true);
      setAvail((a) => ({ officeOpen: false, ...a, available: false }));
    } finally {
      setBusy(false);
    }
  };

  const post = (id: string, body: string) => {
    if (!session) return;
    api
      .post<{ message: Msg }>(`/livechat/${session.id}/messages`, { body }, { headers: { 'x-livechat-token': session.token } })
      .then(({ data }) => {
        merge(data.message);
        setOutbox((o) => o.filter((m) => m.id !== id));
        if (chat?.offline && chat.status === 'WAITING') setTyping({ who: 'AI' });
      })
      .catch(() => setOutbox((o) => o.map((m) => (m.id === id ? { ...m, failed: true } : m))));
  };

  const send = () => {
    const body = input.trim();
    if (!body || !session) return;
    setInput('');
    const id = tempId();
    setOutbox((o) => [...o, { id, body, failed: false }]);
    post(id, body);
  };

  const retry = (id: string) => {
    const m = outbox.find((x) => x.id === id);
    if (!m) return;
    setOutbox((o) => o.map((x) => (x.id === id ? { ...x, failed: false } : x)));
    post(id, m.body);
  };

  // "Visitor is typing" for the colleague (at most every 3 s, only in an accepted chat).
  const pingTyping = () => {
    if (!session || status !== 'ACTIVE' || Date.now() - lastPing.current < 3000) return;
    lastPing.current = Date.now();
    void api.post(`/livechat/${session.id}/typing`, {}, { headers: { 'x-livechat-token': session.token } }).catch(() => undefined);
  };

  const end = async () => {
    if (session) await api.post(`/livechat/${session.id}/close`, {}, { headers: { 'x-livechat-token': session.token } }).catch(() => undefined);
    saveStored(null);
    setSession(null);
    setChat(null);
    onBack();
  };

  const live = status === 'WAITING' || status === 'ACTIVE';
  const header = (
    <div className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
      <button
        type="button"
        className="grid size-10 place-items-center rounded-lg text-muted hover:bg-sunken disabled:opacity-40"
        aria-label={t('livechat.backToAi')}
        title={t('livechat.backToAi')}
        onClick={chat && live ? undefined : end}
        disabled={!!chat && live}
      >
        <ArrowLeft className="size-4" aria-hidden />
      </button>
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full chip-soft">
        {status === 'ACTIVE' ? <UserRound className="size-4" aria-hidden /> : chat?.offline ? <MoonStar className="size-4" aria-hidden /> : <Headset className="size-4" aria-hidden />}
        <span
          className={clsx('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card', status === 'ACTIVE' ? 'bg-success' : chat?.offline || avail?.available === false ? 'bg-subtle' : 'bg-warning')}
          aria-hidden
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-ink">{status === 'ACTIVE' && chat?.staffName ? t('livechat.connected', { name: chat.staffName }) : t('livechat.talkToHuman')}</p>
        <p className="truncate text-[11px] text-muted" aria-live="polite">
          {typing ? (typing.who === 'AI' ? t('lcx.aiTyping') : typing.name ? t('lcx.typing', { name: typing.name }) : t('lcx.staffTyping')) : chat?.offline && status === 'WAITING' ? t('lcx.offlineTitle') : ''}
        </p>
      </div>
      {chat && live && (
        <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-danger-fg hover:bg-danger-bg" onClick={() => void end()}>
          <X className="size-3.5" aria-hidden /> {t('livechat.end')}
        </button>
      )}
    </div>
  );

  // No chat yet: availability check → start, or the offline handover.
  if (!chat) {
    const isOffline = avail?.available === false || offline;
    const back = avail?.nextOpen ? new Intl.DateTimeFormat(uiLang === 'az' ? 'az-Latn-AZ' : uiLang, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(avail.nextOpen)) : null;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas p-3">
          {avail === null && !offline && (
            <p className="flex items-center gap-2 text-xs text-muted" role="status">
              <TypingDots /> <span className="sr-only">…</span>
            </p>
          )}
          {avail?.available && !offline && (
            <form
              className="space-y-2 rounded-2xl border border-line bg-card p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void start(false);
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
          {isOffline && (
            <>
              <form
                className="space-y-2.5 rounded-2xl border border-line bg-card p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void start(true);
                }}
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <MoonStar className="size-4 text-muted" aria-hidden /> {t('lcx.offlineTitle')}
                </p>
                {back && <p className="text-xs text-muted">{t('lcx.offlineBack', { when: back })}</p>}
                <p className="text-xs leading-relaxed text-ink">{t('lcx.offlineText')}</p>
                <label className="block">
                  <span className="label">{t('livechat.yourName')}</span>
                  <input className="input" maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="block">
                  <span className="label">{t('lcx.question')}</span>
                  <textarea className="input min-h-20 resize-y text-sm" maxLength={2000} rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
                </label>
                <button type="submit" className="btn-primary btn-sm w-full" disabled={busy || !question.trim()}>
                  <Send className="size-4" aria-hidden /> {t('lcx.startOffline')}
                </button>
              </form>
              <div className="rounded-2xl border border-line bg-card">
                <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-xs font-semibold text-ink" aria-expanded={showCallback} onClick={() => setShowCallback((v) => !v)}>
                  {t('lcx.orCallback')} <ChevronDown className={clsx('size-4 transition-transform motion-reduce:transition-none', showCallback && 'rotate-180')} aria-hidden />
                </button>
                {showCallback && (
                  <div className="border-t border-line p-3">
                    <CallbackForm source="advisor" compact />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const visible = chat.messages;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain bg-canvas px-3 py-3" aria-live="polite">
        {chat.offline && status === 'WAITING' && (
          <div className="mb-2 rounded-xl border border-line bg-card p-2.5 text-[11px] leading-relaxed text-ink" role="status">
            <p className="flex items-start gap-1.5">
              <MoonStar className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden /> {t('lcx.offlineBanner')}
            </p>
            {!showContact && (
              <button type="button" className="mt-1.5 min-h-8 font-semibold text-link hover:underline" onClick={() => setShowContact(true)}>
                {t('lcx.leaveContact')}
              </button>
            )}
          </div>
        )}
        {visible.map((m, i) => {
          const prev = visible[i - 1];
          const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt);
          const grouped = !newDay && prev && prev.author === m.author && prev.staffName === m.staffName;
          const day = newDay ? (
            <p className="my-2 text-center">
              <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[10px] font-semibold text-muted">
                {new Intl.DateTimeFormat(uiLang === 'az' ? 'az-Latn-AZ' : uiLang, { day: 'numeric', month: 'short' }).format(new Date(m.createdAt))}
              </span>
            </p>
          ) : null;
          if (m.author === 'SYSTEM')
            return (
              <div key={m.id}>
                {day}
                <p className="my-1.5 text-center text-[11px] text-muted">{m.body}</p>
              </div>
            );
          const mine = m.author === 'VISITOR';
          return (
            <div key={m.id} className={clsx(!grouped && 'pt-1.5')}>
              {day}
              <div
                className={clsx(
                  'relative w-fit max-w-[85%] rounded-2xl px-3 pt-1.5 pb-1 text-sm break-words whitespace-pre-wrap shadow-sm',
                  mine ? 'ml-auto bg-primary text-primary-contrast' : m.author === 'AI' ? 'border border-line bg-sunken text-ink' : 'border border-line bg-card text-ink',
                  !grouped && (mine ? 'rounded-tr-md' : 'rounded-tl-md'),
                )}
              >
                {!mine && !grouped && (
                  <span className={clsx('mb-0.5 flex items-center gap-1 text-[10px] font-bold', m.author === 'AI' ? 'text-highlight-fg' : 'text-link')}>
                    {m.author === 'AI' ? <Sparkles className="size-3" aria-hidden /> : null}
                    {m.author === 'AI' ? t('lcx.ai') : m.staffName}
                  </span>
                )}
                {m.body}
                <span className={clsx('float-right mt-1 ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[10px] tabular-nums', mine ? 'text-primary-contrast/75' : 'text-muted')}>
                  {timeOf(m.createdAt, uiLang)}
                  {mine && (status === 'ACTIVE' ? <CheckCheck className="size-3" aria-label={t('lcx.sent')} /> : <Check className="size-3" aria-label={t('lcx.sent')} />)}
                </span>
              </div>
            </div>
          );
        })}
        {outbox.map((m) => (
          <div key={m.id} className="ml-auto flex max-w-[85%] flex-col items-end pt-1.5">
            <div className={clsx('rounded-2xl rounded-tr-md px-3 py-1.5 text-sm break-words whitespace-pre-wrap text-white shadow-sm', m.failed ? 'bg-danger' : 'bg-primary opacity-70')}>{m.body}</div>
            {m.failed ? (
              <span className="mt-0.5 flex items-center gap-1.5 text-[10px]">
                <span className="text-danger-fg" role="alert">
                  {t('livechat.msgFailed')}
                </span>
                <button type="button" className="inline-flex min-h-8 items-center gap-0.5 font-semibold text-link hover:underline" onClick={() => retry(m.id)}>
                  <RotateCw className="size-3" aria-hidden /> {t('livechat.msgRetry')}
                </button>
                <button type="button" className="inline-flex min-h-8 items-center text-muted" aria-label={t('common.delete')} onClick={() => setOutbox((o) => o.filter((x) => x.id !== m.id))}>
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ) : (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted">
                <Clock className="size-3" aria-hidden /> {t('livechat.msgSending')}
              </span>
            )}
          </div>
        ))}
        {typing && live && (
          <div className="pt-1.5">
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md border border-line bg-card px-3 py-2.5 shadow-sm">
              <TypingDots />
              <span className="sr-only">{typing.who === 'AI' ? t('lcx.aiTyping') : t('lcx.staffTyping')}</span>
            </div>
          </div>
        )}
        {status === 'WAITING' && !chat.offline && (
          <p className="mt-2 rounded-xl border border-line bg-card p-2.5 text-xs text-ink" role="status">
            <span className="mr-1.5 inline-block size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden />
            {t('livechat.connecting')} <span className="font-semibold tabular-nums">{t('livechat.waitingLeft', { sec: left })}</span>
          </p>
        )}
        {status === 'MISSED' && session && <MissedContact session={session} />}
        {showContact && chat.offline && status === 'WAITING' && session && <MissedContact session={session} intro={t('lcx.leaveContact')} keepSession />}
        {status === 'CLOSED' && (
          <div className="space-y-2 pt-2 text-center">
            <p className="text-xs text-muted">{t('livechat.closed')}</p>
            <button type="button" className="btn-ghost btn-sm border border-line bg-card" onClick={() => void end()}>
              {t('livechat.backToAi')}
            </button>
          </div>
        )}
      </div>
      {live && (
        <form
          className="border-t border-line bg-card p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="lc-input">
              {t('livechat.placeholder')}
            </label>
            <textarea
              id="lc-input"
              rows={1}
              maxLength={2000}
              className="input max-h-28 min-h-11 flex-1 resize-none rounded-3xl py-2.5 text-sm"
              placeholder={t('livechat.placeholder')}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (e.target.value.trim()) pingTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="submit" className="btn-primary grid size-11 shrink-0 place-items-center rounded-full p-0" aria-label={t('livechat.send')} disabled={!input.trim()}>
              <Send className="size-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1 px-1 text-[10px] leading-snug text-muted">{t('lcx.attachHint')}</p>
        </form>
      )}
    </div>
  );
};

/** Contact details (with a phone + "call me" → callback request, otherwise an inquiry): missed chats, offline chats. */
const MissedContact = ({ session, intro, keepSession = false }: { session: Session; intro?: string; keepSession?: boolean }) => {
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
      <p className="mt-2 rounded-xl border border-success-border bg-success-bg p-2.5 text-xs font-semibold text-success-fg" role="status">
        {done}
      </p>
    );
  return (
    <form
      className="mt-2 space-y-2 rounded-2xl border border-line bg-card p-3"
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
          if (!keepSession) saveStored(null);
        } catch {
          setError(true);
        }
      }}
    >
      <p className="text-xs text-ink">{intro ?? t('livechat.missed')}</p>
      <input className="input" required minLength={2} maxLength={120} autoComplete="name" placeholder={t('callback.name')} aria-label={t('callback.name')} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder={t('callback.phone')} aria-label={t('callback.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input className="input" type="email" autoComplete="email" maxLength={200} placeholder={t('livechat.email')} aria-label={t('livechat.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
      {phone.trim() && (
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" className="size-4" checked={callMe} onChange={(e) => setCallMe(e.target.checked)} /> {t('livechat.callMe')}
        </label>
      )}
      <label className="flex items-start gap-2 text-[11px] text-muted">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0" required checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('callback.consent')}
      </label>
      {error && (
        <p className="text-xs text-danger-fg" role="alert">
          {t('callback.error')}
        </p>
      )}
      <button type="submit" className="btn-primary btn-sm w-full" disabled={!consent || !name.trim() || (!phone.trim() && !email.trim())}>
        {t('callback.submit')}
      </button>
    </form>
  );
};

export default VisitorLiveChat;
