import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, CheckCheck, Clock, MessageCircle, Smartphone } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesMessaging } from '@/i18n/pagesMessaging';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';
import type { ThreadMessage } from './useThread';

registerCopy(pagesMessaging);
registerCopy(pagesClientPlus);

const readTime = (iso: string, lng: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(lng, sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
};

/**
 * WhatsApp-style delivery ticks for the sender's own messages: clock (sending), one tick (sent), two blue ticks (read).
 * Read: the time is in the tooltip / screen-reader label ("Oxundu · 14:32"); `withTime` also prints it (the latest
 * read message of a thread).
 */
export const ReadTicks = ({ m, onDark, withTime }: { m: ThreadMessage; onDark?: boolean; withTime?: boolean }) => {
  const { t, i18n } = useTranslation();
  if (m.failed) {
    return (
      <span className="inline-flex items-center text-red-200" title={t('messaging.chat.failed')} aria-label={t('messaging.chat.failed')}>
        <AlertCircle className="size-3.5" aria-hidden />
      </span>
    );
  }
  if (m.pending) {
    return (
      <span className={clsx('inline-flex items-center', onDark ? 'text-white/60' : 'text-muted')} title={t('messaging.chat.sending')} aria-label={t('messaging.chat.sending')}>
        <Clock className="size-3" aria-hidden />
      </span>
    );
  }
  if (m.readAt) {
    const label = t('cplus.chat.readAt', { time: readTime(m.readAt, i18n.resolvedLanguage ?? 'az') });
    return (
      <span className={clsx('inline-flex items-center gap-1', onDark ? 'text-sky-300' : 'text-sky-600 dark:text-sky-300')} title={label} aria-label={label}>
        <CheckCheck className="size-3.5" aria-hidden />
        {withTime && <span aria-hidden>{label}</span>}
      </span>
    );
  }
  return (
    <span className={clsx('inline-flex items-center', onDark ? 'text-white/70' : 'text-muted')} title={t('messaging.chat.sent')} aria-label={t('messaging.chat.sent')}>
      <Check className="size-3.5" aria-hidden />
    </span>
  );
};

/** Small badge for messages that arrived through WhatsApp / SMS. */
export const ChannelBadge = ({ channel, onDark }: { channel?: string; onDark?: boolean }) => {
  const { t } = useTranslation();
  if (!channel || channel === 'app') return null;
  const Icon = channel === 'whatsapp' ? MessageCircle : Smartphone;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold',
        channel === 'whatsapp' ? (onDark ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800') : onDark ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700',
      )}
    >
      <Icon className="size-2.5" aria-hidden />
      {channel === 'whatsapp' ? t('messaging.chat.viaWhatsapp') : t('messaging.chat.viaSms')}
    </span>
  );
};

/** "Name is typing…" with three bouncing dots; renders nothing when nobody types. */
export const TypingIndicator = ({ name }: { name: string | null }) => {
  const { t } = useTranslation();
  if (!name) return null;
  return (
    <p className="flex items-center gap-2 px-1 text-xs text-muted" aria-live="polite">
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      {t('messaging.chat.typing', { name })}
    </p>
  );
};

/** Tiny green/grey dot showing whether the realtime stream is connected. */
export const LiveDot = ({ connected }: { connected: boolean }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[11px]', connected ? 'text-emerald-700' : 'text-muted')} title={connected ? t('messaging.chat.live') : t('messaging.chat.offline')}>
      <span className={clsx('size-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden />
      <span className="sr-only sm:not-sr-only">{connected ? t('messaging.chat.live') : t('messaging.chat.offline')}</span>
    </span>
  );
};
