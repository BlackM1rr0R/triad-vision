import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import i18n from '@/i18n';
import { errorCode } from '@/lib/api';

const t = (key: string, opts?: Record<string, unknown>): string => String(i18n.t(key, opts));

/** Shared building blocks of the workspace home / contacts / team pages (theme tokens only). */

export const fullName = (p: { firstName: string; lastName?: string | null } | null | undefined) => (p ? `${p.firstName} ${p.lastName ?? ''}`.trim() : '');
export const initialsOf = (p: { firstName: string; lastName?: string | null }) => `${p.firstName[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || '?';

const AVATAR_TONES = [
  'bg-brand-100 text-brand-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-700',
];
export const avatarTone = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

export const Avatar = ({ id, person, size = 'md', className }: { id: string; person: { firstName: string; lastName?: string | null }; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) => (
  <span
    className={clsx(
      'inline-grid shrink-0 place-items-center rounded-full font-bold select-none',
      avatarTone(id),
      { sm: 'size-7 text-[0.65rem]', md: 'size-9 text-xs', lg: 'size-12 text-sm', xl: 'size-16 text-lg' }[size],
      className,
    )}
    aria-hidden
  >
    {initialsOf(person)}
  </span>
);

export const PresenceDot = ({ online, className }: { online: boolean; className?: string }) => (
  <span className={clsx('inline-block size-2.5 rounded-full ring-2 ring-card', online ? 'bg-success' : 'bg-slate-400', className)} aria-hidden />
);

/** Error code → translated message (ws.errors.*), else the generic failure text. */
export const errorText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`ws.errors.${code}`) ? t(`ws.errors.${code}`) : t('ws.common.failed');
};

// ─── Dates ─────────────────────────────────────────────────────────────

const LOCALE: Record<string, string> = { az: 'az-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const loc = () => LOCALE[i18n.language?.slice(0, 2) ?? 'az'] ?? 'en-GB';

export const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat(loc(), { day: '2-digit', month: 'short', year: 'numeric', ...opts }).format(new Date(iso));
/** Leave spans are stored as UTC calendar days: print the UTC date, not the local one. */
export const fmtUtcDay = (iso: string) => new Intl.DateTimeFormat(loc(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
export const fmtDateTime = (iso: string) => new Intl.DateTimeFormat(loc(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtTime = (iso: string) => new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const relativeTime = (iso: string | null, now = Date.now()) => {
  if (!iso) return t('ws.presence.never');
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return t('ws.presence.justNow');
  if (min < 60) return t('ws.presence.minutesAgo', { count: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('ws.presence.hoursAgo', { count: h });
  return t('ws.presence.daysAgo', { count: Math.round(h / 24) });
};

/** 'YYYY-MM-DD' of a Date in local time (for <input type="date">). */
export const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** UTC day key of an ISO timestamp (leave spans). */
export const utcDayKey = (iso: string) => iso.slice(0, 10);

// ─── Layout bits ───────────────────────────────────────────────────────

export const Card = ({ title, icon: Icon, actions, children, className, bodyClassName, id }: { title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) => (
  <section id={id} className={clsx('min-w-0 rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(11,31,68,0.05)]', className)}>
    {(title || actions) && (
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        {title && (
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            {Icon && <Icon className="size-4 shrink-0 text-brand-600" aria-hidden />}
            {title}
          </h2>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className={clsx('p-4 sm:p-5', bodyClassName)}>{children}</div>
  </section>
);

export const Empty = ({ icon: Icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) => (
  <div className={clsx('flex flex-col items-center justify-center px-4 py-8 text-center text-sm text-muted', className)}>
    {Icon && (
      <span className="mb-2 grid size-10 place-items-center rounded-full bg-surface text-muted">
        <Icon className="size-5" aria-hidden />
      </span>
    )}
    <p className="max-w-sm">{children}</p>
  </div>
);

export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('animate-pulse rounded-lg bg-surface', className)} aria-hidden />;

export const Chip = ({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'muted'; className?: string }) => (
  <span
    className={clsx(
      'badge whitespace-nowrap',
      {
        neutral: 'bg-surface text-ink ring-1 ring-line',
        brand: 'bg-brand-100 text-brand-700',
        success: 'bg-emerald-100 text-emerald-800',
        warn: 'bg-amber-100 text-amber-800',
        danger: 'bg-red-100 text-red-700',
        muted: 'bg-surface text-muted',
      }[tone],
      className,
    )}
  >
    {children}
  </span>
);

export const Field = ({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) => (
  <label className={clsx('block', className)}>
    <span className="label">
      {label}
      {hint && <span className="ml-1 font-normal text-muted">({hint})</span>}
    </span>
    {children}
  </label>
);

export const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) => (
  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-line accent-brand-600" />
    {label}
  </label>
);

/** Modal dialog in a portal; closes on Escape and backdrop click (unless busy). */
export const Modal = ({
  open,
  onClose,
  title,
  children,
  footer,
  busy = false,
  size = 'md',
  as = 'div',
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  size?: 'sm' | 'md' | 'lg';
  as?: 'div' | 'form';
  onSubmit?: (e: React.FormEvent) => void;
}) => {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);
  if (typeof document === 'undefined') return null;
  const Panel = as === 'form' ? motion.form : motion.div;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-start sm:p-6 sm:pt-[8vh]">
          <motion.div className="absolute inset-0 bg-navy-950/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !busy && onClose()} aria-hidden />
          <Panel
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={clsx(
              'relative flex max-h-full w-full flex-col overflow-hidden bg-card shadow-2xl sm:max-h-[84vh] sm:rounded-2xl sm:border sm:border-line',
              { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-4xl' }[size],
            )}
          >
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
              <h2 id={titleId} className="font-display text-base font-bold text-ink">
                {title}
              </h2>
              <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('ws.common.close')}>
                <X className="size-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
            {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 sm:px-6">{footer}</footer>}
          </Panel>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export const IconButton = ({ icon: Icon, label, onClick, className, danger = false, disabled = false, type = 'button' }: { icon: LucideIcon; label: string; onClick?: () => void; className?: string; danger?: boolean; disabled?: boolean; type?: 'button' | 'submit' }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className={clsx('grid size-8 place-items-center rounded-lg transition disabled:opacity-50', danger ? 'text-muted hover:bg-red-50 hover:text-red-600' : 'text-muted hover:bg-surface hover:text-ink', className)}
  >
    <Icon className="size-4" />
  </button>
);

export const EMOJIS = ['😀', '😎', '🤔', '📞', '💻', '🏖️', '🤒', '🏠', '🍽️', '☕', '🚗', '✈️', '🎯', '🔥', '🙏', '🎉'];

export const SectionTitle = ({ children, className }: { children: ReactNode; className?: string }) => <h3 className={clsx('text-xs font-bold tracking-wide text-muted uppercase', className)}>{children}</h3>;
