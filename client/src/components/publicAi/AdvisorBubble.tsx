import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { CalendarCheck, ClipboardCheck, Headset, MessageCircleQuestion, PhoneCall, RotateCcw, Send, Sparkles, UserPlus, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { AxiosError } from 'axios';
import { registerCopy } from '@/i18n';
import { pagesPublicAi } from '@/i18n/pagesPublicAi';
import { LeadForm, type ChatTurn } from './LeadForm';
import { VisitorLiveChat } from '@/components/livechat/VisitorLiveChat'; // AI → human handover ("Əməkdaşla danışın")
import { CallbackButton } from '@/components/calls/CallbackForm'; // "Mənə zəng edin"

registerCopy(pagesPublicAi);

const STORE_KEY = 'tv.advisor';

interface Stored {
  sessionId: string;
  messages: ChatTurn[];
  offerLead: boolean;
  turnsLeft: number | null;
}

const newSession = (): Stored => ({
  sessionId: (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, ''),
  messages: [],
  offerLead: false,
  turnsLeft: null,
});

const load = (): Stored => {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Stored;
      if (v && typeof v.sessionId === 'string' && Array.isArray(v.messages)) return v;
    }
  } catch {
    /* storage unavailable */
  }
  return newSession();
};

const save = (v: Stored) => {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

/**
 * Floating "ask our advisor" button + chat panel for visitors of the public site. Answers come from
 * POST /api/public-ai/chat (JSON); after a few answers or on intent it offers the free consultation,
 * registration and the contact form. Sits in the floating-actions stack of the site layout.
 */
export const AdvisorBubble = () => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const status = useQuery({
    queryKey: ['public-ai', 'status'],
    queryFn: async () => (await api.get<{ enabled: boolean; maxTurns: number }>('/public-ai/status')).data,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Stored>(load);
  const [input, setInput] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLead, setShowLead] = useState(false);
  // Live chat handover: offered when the AI is unsure / the visitor asks for a person; null = AI mode.
  const [offerHuman, setOfferHuman] = useState(false);
  const [human, setHuman] = useState<null | 'button' | 'ai_unsure' | 'asked' | 'ai_error'>(() => {
    try {
      return sessionStorage.getItem('tv.livechat') ? 'button' : null;
    } catch {
      return null;
    }
  });
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const inputId = useId();

  useEffect(() => save(state), [state]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length, busy, showLead, notice]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!status.data?.enabled) return null;

  const ask = async (text: string) => {
    const message = text.trim().slice(0, 600);
    if (!message || busy) return;
    setInput('');
    setNotice(null);
    const history = state.messages.slice(-12);
    setState((s) => ({ ...s, messages: [...s.messages, { role: 'user', content: message }] }));
    setBusy(true);
    try {
      const { data } = await api.post<{ reply: string; offerLead: boolean; offerHuman?: boolean; turnsLeft: number }>('/public-ai/chat', {
        sessionId: state.sessionId,
        message,
        history,
        lang,
        ...(honeypot ? { website: honeypot } : {}),
      });
      setState((s) => ({ ...s, messages: [...s.messages, { role: 'assistant', content: data.reply }], offerLead: s.offerLead || data.offerLead, turnsLeft: data.turnsLeft }));
      if (data.offerHuman) setOfferHuman(true);
    } catch (err) {
      const code = errorCode(err);
      const scope = err instanceof AxiosError ? (err.response?.data as { scope?: string } | undefined)?.scope : undefined;
      setNotice(
        code === 'TOO_MANY_REQUESTS' ? (scope === 'session' ? t('pai.bubble.limitSession') : t('pai.bubble.limitHour')) : code === 'PUBLIC_AI_BUSY' || code === 'PUBLIC_AI_DISABLED' ? t('pai.bubble.busy') : t('pai.bubble.error'),
      );
      if (code !== 'NETWORK' && code !== 'AI_UNAVAILABLE') setState((s) => ({ ...s, offerLead: true, ...(scope === 'session' ? { turnsLeft: 0 } : {}) }));
      setOfferHuman(true);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setState(newSession());
    setNotice(null);
    setShowLead(false);
  };

  const outOfTurns = state.turnsLeft === 0;

  return (
    <>
      <motion.button
        type="button"
        aria-label={t('pai.bubble.open')}
        aria-expanded={open}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 2.6, type: 'spring' }}
        whileHover={{ scale: 1.08 }}
        onClick={() => setOpen((o) => !o)}
        className="grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/30 hover:bg-brand-700"
      >
        {open ? <X className="size-6" aria-hidden /> : <MessageCircleQuestion className="size-7" aria-hidden />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed inset-0 z-[60] flex flex-col bg-card sm:inset-auto sm:right-24 sm:bottom-6 sm:h-[min(620px,calc(100dvh-7rem))] sm:w-[380px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl"
          >
            <header className="flex items-center gap-3 bg-navy-900 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white sm:pt-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="truncate text-sm font-bold">
                  {t('pai.bubble.title')}
                </h2>
                <p className="truncate text-[11px] text-white/70">{t('pai.bubble.subtitle')}</p>
              </div>
              {!human && (
                <button type="button" className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10" aria-label={t('livechat.talkToHuman')} title={t('livechat.talkToHuman')} onClick={() => setHuman('button')}>
                  <Headset className="size-4" aria-hidden />
                </button>
              )}
              {state.messages.length > 0 && !human && (
                <button type="button" className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10" aria-label={t('pai.bubble.restart')} title={t('pai.bubble.restart')} onClick={restart}>
                  <RotateCcw className="size-4" aria-hidden />
                </button>
              )}
              <button type="button" className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10" aria-label={t('pai.bubble.close')} onClick={() => setOpen(false)}>
                <X className="size-5" aria-hidden />
              </button>
            </header>

            {human ? (
              <VisitorLiveChat transcript={state.messages} lang={lang} reason={human} onBack={() => setHuman(null)} />
            ) : (
            <>
            <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface/60 p-3" aria-live="polite">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-sm text-ink shadow-sm">{t('pai.bubble.greeting')}</div>
              {state.messages.length === 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(['s1', 's2', 's3'] as const).map((k) => (
                    <button key={k} type="button" className="rounded-full border border-brand-200 bg-card px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50" onClick={() => void ask(t(`pai.bubble.${k}`))}>
                      {t(`pai.bubble.${k}`)}
                    </button>
                  ))}
                  <Link to="/uygunluq-testi" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-card px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                    <ClipboardCheck className="size-3.5" aria-hidden /> {t('pai.bubble.quiz')}
                  </Link>
                </div>
              )}
              {state.messages.map((m, i) => (
                <div
                  key={i}
                  className={clsx(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap shadow-sm',
                    m.role === 'user' ? 'ml-auto rounded-tr-sm bg-brand-600 text-white' : 'rounded-tl-sm bg-card text-ink',
                  )}
                >
                  {m.content}
                </div>
              ))}
              {busy && <div className="w-fit rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-xs text-muted shadow-sm">{t('pai.bubble.thinking')}</div>}
              {notice && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900" role="status">
                  {notice}
                </p>
              )}
              {state.offerLead && (
                <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5">
                  <Link to="/booking" onClick={() => setOpen(false)} className="btn-primary btn-sm w-full">
                    <CalendarCheck className="size-4" aria-hidden /> {t('pai.bubble.consult')}
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Link to="/register" onClick={() => setOpen(false)} className="btn-ghost btn-sm w-full bg-card">
                      <UserPlus className="size-4" aria-hidden /> {t('pai.bubble.register')}
                    </Link>
                    <button type="button" className="btn-ghost btn-sm w-full bg-card" onClick={() => setShowLead((v) => !v)}>
                      <PhoneCall className="size-4" aria-hidden /> {t('pai.bubble.leaveContact')}
                    </button>
                  </div>
                </div>
              )}
              {offerHuman && (
                <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
                  <p className="text-xs text-ink">{t('livechat.offerHuman')}</p>
                  <button type="button" className="btn-primary btn-sm w-full" onClick={() => setHuman(notice ? 'ai_error' : 'ai_unsure')}>
                    <Headset className="size-4" aria-hidden /> {t('livechat.talkToHuman')}
                  </button>
                </div>
              )}
              {state.offerLead && <CallbackButton source="advisor" className="btn-ghost btn-sm w-full bg-card" />}
              {showLead && <LeadForm compact source="advisor" transcript={state.messages} onCancel={() => setShowLead(false)} />}
            </div>

            <form
              className="border-t border-line bg-card p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>
              <div className="flex items-end gap-2">
                <label htmlFor={inputId} className="sr-only">
                  {t('pai.bubble.placeholder')}
                </label>
                <textarea
                  id={inputId}
                  ref={inputRef}
                  rows={1}
                  maxLength={600}
                  disabled={outOfTurns}
                  className="input max-h-28 min-h-11 flex-1 resize-none py-2.5 text-sm"
                  placeholder={t('pai.bubble.placeholder')}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void ask(input);
                    }
                  }}
                />
                <button type="submit" className="btn-primary grid size-11 shrink-0 place-items-center p-0" aria-label={t('pai.bubble.send')} disabled={busy || !input.trim() || outOfTurns}>
                  <Send className="size-4" aria-hidden />
                </button>
              </div>
              <p className="mt-1.5 flex justify-between gap-2 text-[10px] leading-snug text-muted">
                <span>{t('pai.bubble.disclaimer')}</span>
                {state.turnsLeft !== null && state.turnsLeft <= 5 && <span className="shrink-0 font-semibold">{t('pai.bubble.turnsLeft', { count: state.turnsLeft })}</span>}
              </p>
            </form>
            </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AdvisorBubble;
