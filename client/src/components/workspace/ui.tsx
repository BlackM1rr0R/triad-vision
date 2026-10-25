import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Modal as UiModal } from '@/components/ui/Modal';
import { IconButton as UiIconButton } from '@/components/ui/Button';
import { EmptyState as UiEmptyState } from '@/components/ui/EmptyState';
import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton';
import { TONE_CLASS } from '@/components/ui/status';
import i18n from '@/i18n';
import { errorCode } from '@/lib/api';

const t = (key: string, opts?: Record<string, unknown>): string => String(i18n.t(key, opts));

/** Shared building blocks of the workspace home / contacts / team pages (theme tokens only). */

export const fullName = (p: { firstName: string; lastName?: string | null } | null | undefined) => (p ? `${p.firstName} ${p.lastName ?? ''}`.trim() : '');
export const initialsOf = (p: { firstName: string; lastName?: string | null }) => `${p.firstName[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || '?';

const AVATAR_TONES = [
  'bg-primary/10 text-link',
  'bg-success-bg text-success-fg',
  'bg-warning-bg text-warning-fg',
  'bg-accent-bg text-accent-fg',
  'bg-info-bg text-info-fg',
  'bg-danger-bg text-danger-fg',
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
  <span className={clsx('inline-block size-2.5 rounded-full ring-2 ring-card', online ? 'bg-success' : 'bg-subtle', className)} aria-hidden />
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
  <section id={id} className={clsx('min-w-0 rounded-xl border border-line bg-card shadow-[var(--tv-shadow-card)]', className)}>
    {(title || actions) && (
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        {title && (
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            {Icon && <Icon className="size-4 shrink-0 text-link" aria-hidden />}
            {title}
          </h2>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className={clsx('p-4 sm:p-5', bodyClassName)}>{children}</div>
  </section>
);

/** Legacy workspace empty state (text as children): adapter over the design-system EmptyState. */
export const Empty = ({ icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) => (
  <UiEmptyState icon={icon} text={children} padding="none" className={clsx(!/(^|\s)py-/.test(className ?? '') && 'py-8', className)} />
);

/** Loading block: adapter over the design-system Skeleton (pass size classes; "rounded-full" for avatars). */
export const Skeleton = ({ className }: { className?: string }) => (
  <UiSkeleton rounded={className?.includes('rounded-full') ? 'full' : 'lg'} className={clsx(className?.replace(/(^|\s)rounded-full(?=\s|$)/, ' ').trim() || 'h-4 w-full')} />
);

/** Small label pill; colours come from the design-system tones (components/ui/status.ts). */
export const Chip = ({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'muted'; className?: string }) => (
  <span
    className={clsx(
      'badge whitespace-nowrap',
      {
        neutral: 'bg-sunken text-ink ring-1 ring-line',
        brand: TONE_CLASS.brand,
        success: TONE_CLASS.success,
        warn: TONE_CLASS.warning,
        danger: TONE_CLASS.danger,
        muted: 'bg-sunken text-muted',
      }[tone],
      className,
    )}
  >
    {children}
  </span>
);

// TODO(ui): Field wraps the control in a <label> (implicit association); move callers to components/ui/Field.
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
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-line accent-primary" />
    {label}
  </label>
);

/** Workspace modal (full screen on phones, top-aligned on desktop): adapter over the design-system Modal. */
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
}) => (
  <UiModal
    open={open}
    onClose={onClose}
    title={title}
    footer={footer}
    busy={busy}
    size={({ sm: 'sm', md: 'lg', lg: 'xl' } as const)[size]}
    mobile="full"
    align="top"
    zIndex={70}
    as={as}
    onSubmit={onSubmit}
    closeLabel={t('ws.common.close')}
  >
    {children}
  </UiModal>
);

/** Icon-only button (size-8): adapter over the design-system IconButton. */
export const IconButton = ({ icon, label, onClick, className, danger = false, disabled = false, type = 'button' }: { icon: LucideIcon; label: string; onClick?: () => void; className?: string; danger?: boolean; disabled?: boolean; type?: 'button' | 'submit' }) => (
  <UiIconButton icon={icon} label={label} onClick={onClick} className={className} variant={danger ? 'danger' : 'ghost'} size="sm" disabled={disabled} type={type} />
);

export const EMOJIS = ['😀', '😎', '🤔', '📞', '💻', '🏖️', '🤒', '🏠', '🍽️', '☕', '🚗', '✈️', '🎯', '🔥', '🙏', '🎉'];

export const SectionTitle = ({ children, className }: { children: ReactNode; className?: string }) => <h3 className={clsx('text-xs font-bold tracking-wide text-muted uppercase', className)}>{children}</h3>;
