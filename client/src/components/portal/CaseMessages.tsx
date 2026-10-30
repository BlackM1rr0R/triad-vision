import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MessageCircle, RotateCw, SendHorizontal, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { RealtimeBridge } from '@/lib/realtime';
import { registerCopy } from '@/i18n';
import { pagesMessaging } from '@/i18n/pagesMessaging';
import { ChannelBadge, LiveDot, ReadTicks, TypingIndicator } from '@/components/messaging/ThreadBits';
import { useThread } from '@/components/messaging/useThread';
import { useApiError } from './useApiError';
import { MessageBody, ShowOriginalsToggle, TranslationNote } from '@/components/messagingPlus/MessageBody';
import { VoiceRecorder } from '@/components/messagingPlus/VoiceRecorder';
import { EmptyInbox } from '@/components/illustrations';
import { translatableText, useMessageTranslations, useShowOriginals } from '@/components/messagingPlus/useTranslations';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';

registerCopy(pagesMessaging);
registerCopy(pagesClientPlus);

/** Suggested short answers (cplus.chat.q.*), shown after a team message while the box is empty. */
const QUICK_REPLIES = ['yes', 'tomorrow', 'call', 'thanks', 'no'] as const;

/**
 * Chat between the client and the case manager. Messages arrive in realtime (SSE), sends are
 * optimistic, staff messages are marked as read while the thread is on screen, and the parent's
 * case query is refreshed when something new comes in (polling stays as a fallback).
 */
export const CaseMessages = ({ data, onChanged }: { data: CaseDetail; onChanged: () => Promise<unknown> }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const { user } = useAuth();
  const onError = useApiError();
  const inputId = useId();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [body, setBody] = useState('');
  // Quick replies: one tap = one message (a double tap before the re-render would send it twice).
  const quickBusy = useRef(false);
  const [quickSending, setQuickSending] = useState(false);
  const meId = user?.id ?? '';

  const thread = useThread({ caseId: data.id, base: '/cases', initial: data.messages, meId, onNewMessage: () => void onChanged() });
  const { messages, typingName } = thread;
  const count = messages.length;
  const lastId = messages[count - 1]?.id;
  const last = messages[count - 1];
  // "Oxundu · 14:32" under the newest own message the team has read.
  const lastReadMineId = [...messages].reverse().find((m) => (m.author.id === meId || (!meId && m.author.role === 'CLIENT')) && m.readAt)?.id;
  const showQuick = !!last && last.author.id !== meId && last.author.role !== 'CLIENT' && !body.trim();
  // Messaging plus: messages in the reader's language (translated on demand, cached on the server).
  const prefs = useShowOriginals();
  const tx = useMessageTranslations({
    scope: 'case',
    id: data.id,
    items: messages.filter((m) => !m.pending && !m.failed).map((m) => ({ id: m.id, text: translatableText(m), lang: m.lang ?? m.voice?.transcriptLang })),
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [count, lastId, typingName]);

  // Optimistic: the message appears at once (faded, clock icon) and the box is free for the next one;
  // the server's copy replaces it, a failed send stays in the thread with "resend" / "discard".
  const send = () => {
    const text = body.trim();
    if (!text || !user) return;
    setBody('');
    thread
      .send(text, { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role })
      .then(() => void onChanged())
      .catch(onError);
  };

  const retry = (id: string) => {
    thread
      .retry(id)
      .then((ok) => ok && void onChanged())
      .catch(onError);
  };

  return (
    <section id="messages" className="card flex scroll-mt-28 flex-col overflow-hidden lg:scroll-mt-36" aria-labelledby="messages-title">
      <RealtimeBridge />
      <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-peach">
          <MessageCircle className="size-5" aria-hidden />
        </span>
        <h3 id="messages-title" className="type-card-title min-w-0 flex-1">
          {t('portal.messages.title')}
        </h3>
        <LiveDot connected={thread.connected} />
      </div>

      <div
        ref={(el) => {
          scrollRef.current = el;
          thread.listRef(el);
        }}
        className="max-h-[min(26rem,60vh)] min-h-40 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-sunken px-4 py-4 sm:px-5"
        aria-live="polite"
      >
        {count === 0 ? (
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <EmptyInbox className="w-32" />
            <p className="mt-3 text-sm text-muted">{t('portal.messages.empty')}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => {
              const mine = m.author.id === meId || (!meId && m.author.role === 'CLIENT');
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={clsx('flex flex-col', mine ? 'items-end' : 'items-start')}
                >
                  <span className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-muted">
                    {mine ? t('portal.messages.you') : t('portal.messages.team')}
                    <ChannelBadge channel={m.channel} />
                  </span>
                  <div
                    className={clsx(
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-line',
                      mine ? 'rounded-br-md bg-primary text-primary-contrast' : 'rounded-bl-md border border-line bg-card text-ink',
                      m.pending && 'opacity-70',
                      m.failed && 'bg-danger',
                    )}
                  >
                    <MessageBody m={m} tx={tx} onDark={mine} />
                  </div>
                  <span className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted">
                    <time dateTime={m.createdAt}>{dateTime(m.createdAt)}</time>
                    {mine && <ReadTicks m={m} withTime={m.id === lastReadMineId} />}
                    {m.failed && (
                      <>
                        <span className="text-danger-fg" role="alert">{t('messaging.chat.failed')}</span>
                        <button type="button" className="inline-flex items-center gap-0.5 font-semibold text-link hover:underline" onClick={() => retry(m.id)}>
                          <RotateCw className="size-3" aria-hidden /> {t('messaging.chat.retry')}
                        </button>
                        <button type="button" className="inline-flex items-center gap-0.5 text-muted hover:underline" onClick={() => thread.dismissFailed(m.id)}>
                          <X className="size-3" aria-hidden /> {t('messaging.chat.dismiss')}
                        </button>
                      </>
                    )}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <TypingIndicator name={typingName} />
        <TranslationNote tx={tx} />
      </div>
      <div className="border-t border-line px-4 pt-2">
        <ShowOriginalsToggle tx={tx} setter={prefs.set} />
      </div>

      {showQuick && (
        <div className="flex gap-2 overflow-x-auto border-t border-line px-3 pt-2.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('cplus.chat.quick')}>
          {QUICK_REPLIES.map((k) => (
            <button
              key={k}
              type="button"
              className="min-h-9 shrink-0 rounded-full border border-line bg-card px-3 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:border-primary hover:bg-sunken disabled:opacity-60"
              disabled={quickSending}
              onClick={() => {
                if (!user || quickBusy.current) return;
                quickBusy.current = true;
                setQuickSending(true);
                thread
                  .send(t(`cplus.chat.q.${k}`), { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role })
                  .then(() => void onChanged())
                  .catch(onError)
                  .finally(() => {
                    quickBusy.current = false;
                    setQuickSending(false);
                  });
              }}
            >
              {t(`cplus.chat.q.${k}`)}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t('portal.messages.placeholder')}
        </label>
        <textarea
          id={inputId}
          className="input max-h-40 min-h-11 resize-y"
          rows={2}
          maxLength={4000}
          placeholder={t('portal.messages.placeholder')}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (e.target.value.trim()) thread.notifyTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <VoiceRecorder
          uploadUrl={`/messaging-plus/cases/${data.id}/voice`}
          onSent={(d) => {
            const m = (d as { message?: Parameters<typeof thread.upsert>[0] }).message;
            if (m) thread.upsert(m);
            void onChanged();
          }}
        />
        <button type="submit" className="btn-primary size-11 shrink-0 p-0" disabled={!body.trim()} aria-label={t('common.send')}>
          <SendHorizontal className="size-4.5" aria-hidden />
        </button>
      </form>
    </section>
  );
};

export default CaseMessages;
