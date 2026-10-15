import i18n from '@/i18n';
import { errorCode, formatBytes } from '@/lib/api';
import type { Channel, Person } from './types';

export { formatBytes };

const t = (key: string, opts?: Record<string, unknown>): string => String(i18n.t(key, opts));

export const fullName = (p: Pick<Person, 'firstName' | 'lastName'> | null | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : '');
export const initials = (p: Pick<Person, 'firstName' | 'lastName'> | null | undefined) => (p ? `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase() || '?' : '?');

const TONES = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-pink-100 text-pink-800', 'bg-teal-100 text-teal-800', 'bg-sky-100 text-sky-800', 'bg-rose-100 text-rose-800'];
export const avatarTone = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

export const channelLabel = (c: Pick<Channel, 'kind' | 'name'>) => (c.kind === 'DM' ? (c.name ?? '') : `#${c.name ?? ''}`);

const LOCALE_TAG: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
export const localeTag = () => LOCALE_TAG[i18n.language?.slice(0, 2) ?? 'az'] ?? 'az-Latn-AZ';

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fmtTime = (iso: string) => new Intl.DateTimeFormat(localeTag(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** "Today", "Yesterday" or a full date for the day separators. */
export const fmtDayLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const key = dayKey(d);
  if (key === dayKey(now)) return t('chat.message.today');
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return t('chat.message.yesterday');
  return new Intl.DateTimeFormat(localeTag(), { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }).format(d);
};

/** Compact relative-ish time for the sidebar preview: "14:05" today, "Mon" this week, "16 Oct" otherwise. */
export const fmtShort = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return fmtTime(iso);
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return new Intl.DateTimeFormat(localeTag(), { weekday: 'short' }).format(d);
  return new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'short' }).format(d);
};

export const fmtDateTime = (iso: string) => new Intl.DateTimeFormat(localeTag(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export const errorText = (err: unknown) => {
  const code = errorCode(err);
  const key = `chat.errors.${code}`;
  return i18n.exists(key) ? t(key) : t('chat.errors.generic');
};

export const isImage = (mime: string) => /^image\/(png|jpeg|gif|webp|avif)$/.test(mime);
export const isPreviewable = (mime: string) => isImage(mime) || mime === 'application/pdf' || mime.startsWith('text/');

/** Common reactions for the picker. */
export const EMOJIS = ['👍', '👎', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀', '✅', '❌', '🙏', '👏', '💯', '🤔', '😅', '🚀', '⭐', '📌', '📅', '☕', '🤝', '💡', '🙌'];

/** Messages within this gap from the same author are grouped (no repeated avatar). */
export const GROUP_GAP_MS = 5 * 60 * 1000;

/** Grows a textarea to fit its content (up to a cap). */
export const autosize = (el: HTMLTextAreaElement | null, max = 240) => {
  if (!el) return;
  el.style.height = '0px';
  el.style.height = `${Math.min(max, el.scrollHeight)}px`;
};

export const messageLink = (channelId: string, messageId: string) => `${window.location.origin}/workspace/chat/${channelId}?message=${messageId}`;
