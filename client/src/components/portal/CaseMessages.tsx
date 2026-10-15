import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MessageCircle, SendHorizontal, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { RealtimeBridge } from '@/lib/realtime';
import { registerCopy } from '@/i18n';
import { pagesMessaging } from '@/i18n/pagesMessaging';
import { Spinner } from '@/components/ui/Spinner';
import { ChannelBadge, LiveDot, ReadTicks, TypingIndicator } from '@/components/messaging/ThreadBits';
import { useThread } from '@/components/messaging/useThread';
import { useApiError } from './useApiError';

registerCopy(pagesMessaging);

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
  const [sending, setSending] = useState(false);
  const meId = user?.id ?? '';

  const thread = useThread({ caseId: data.id, base: '/cases', initial: data.messages, meId, onNewMessage: () => void onChanged() });
  const { messages, typingName } = thread;
  const count = messages.length;
  const lastId = messages[count - 1]?.id;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [count, lastId, typingName]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending || !user) return;
    setSending(true);
    setBody('');
    try {
      await thread.send(text, { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role });
      void onChanged();
    } catch (err) {
      setBody(text);
      onError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="messages" className="card flex scroll-mt-28 flex-col overflow-hidden lg:scroll-mt-36" aria-labelledby="messages-title">
      <RealtimeBridge />
      <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
          <MessageCircle className="size-4.5" aria-hidden />
        </span>
        <h3 id="messages-title" className="min-w-0 flex-1 text-base font-bold text-navy-900">
          {t('portal.messages.title')}
        </h3>
        <LiveDot connected={thread.connected} />
      </div>

      <div
        ref={(el) => {
          scrollRef.current = el;
          thread.listRef(el);
        }}
        className="max-h-[min(26rem,60vh)] min-h-40 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface/50 px-4 py-4 sm:px-5"
        aria-live="polite"
      >
        {count === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{t('portal.messages.empty')}</p>
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
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-line shadow-sm',
                      mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md border border-line bg-white text-navy-900',
                      m.pending && 'opacity-70',
                      m.failed && 'bg-red-600',
                    )}
                  >
                    {m.body}
                  </div>
                  <span className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted">
                    <time dateTime={m.createdAt}>{dateTime(m.createdAt)}</time>
                    {mine && <ReadTicks m={m} />}
                    {m.failed && (
                      <button type="button" className="inline-flex items-center gap-0.5 text-red-700 hover:underline" onClick={() => thread.dismissFailed(m.id)}>
                        <X className="size-3" aria-hidden /> {t('messaging.chat.failed')}
                      </button>
                    )}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <TypingIndicator name={typingName} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
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
              void send();
            }
          }}
        />
        <button type="submit" className="btn-primary size-11 shrink-0 p-0" disabled={!body.trim() || sending} aria-label={t('common.send')}>
          {sending ? <Spinner className="size-4" /> : <SendHorizontal className="size-4.5" aria-hidden />}
        </button>
      </form>
    </section>
  );
};

export default CaseMessages;
