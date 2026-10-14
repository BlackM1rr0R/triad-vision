import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MessageCircle, SendHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { useApiError } from './useApiError';

/** Chat between the client and the case manager. */
export const CaseMessages = ({ data, onChanged }: { data: CaseDetail; onChanged: () => Promise<unknown> }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const onError = useApiError();
  const inputId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const count = data.messages.length;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [count]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.post(`/cases/${data.id}/messages`, { body: text });
      setBody('');
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="messages" className="card flex scroll-mt-28 flex-col overflow-hidden lg:scroll-mt-36" aria-labelledby="messages-title">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
          <MessageCircle className="size-4.5" aria-hidden />
        </span>
        <h3 id="messages-title" className="text-base font-bold text-navy-900">
          {t('portal.messages.title')}
        </h3>
      </div>

      <div ref={listRef} className="max-h-[min(26rem,60vh)] min-h-40 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface/50 px-4 py-4 sm:px-5" aria-live="polite">
        {count === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{t('portal.messages.empty')}</p>
        ) : (
          <AnimatePresence initial={false}>
            {data.messages.map((m) => {
              const mine = m.author.role === 'CLIENT';
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={clsx('flex flex-col', mine ? 'items-end' : 'items-start')}
                >
                  <span className="mb-1 px-1 text-[11px] font-semibold text-muted">
                    {mine ? t('portal.messages.you') : t('portal.messages.team')}
                  </span>
                  <div
                    className={clsx(
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-line shadow-sm',
                      mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md border border-line bg-white text-navy-900',
                    )}
                  >
                    {m.body}
                  </div>
                  <time className="mt-1 px-1 text-[10px] text-muted" dateTime={m.createdAt}>
                    {dateTime(m.createdAt)}
                  </time>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
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
          onChange={(e) => setBody(e.target.value)}
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
