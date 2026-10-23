import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { statusTone, TONE_BORDER, TONE_CLASS, TONE_SOLID, type BadgeTone, type StatusDomain } from './status';

export type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  /** Leading dot in the current colour. */
  dot?: boolean;
  icon?: LucideIcon;
  /** Thin border in the tone colour (for badges on tinted surfaces). */
  outline?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
};

/**
 * Small label pill. Use <StatusPill> for domain statuses so the colour comes from status.ts.
 *
 *   <Badge tone="brand">Admin</Badge>
 */
export const Badge = ({ tone = 'neutral', children, dot, icon: Icon, outline, size = 'md', className, title }: BadgeProps) => (
  <span
    title={title}
    className={clsx(
      'badge whitespace-nowrap',
      size === 'sm' && 'px-1.5 py-px text-[10px]',
      TONE_CLASS[tone],
      outline && ['border', TONE_BORDER[tone]],
      className,
    )}
  >
    {dot && <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden />}
    {Icon && <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />}
    {children}
  </span>
);

export type StatusPillProps = Omit<BadgeProps, 'tone' | 'children'> & {
  /** Vocabulary in status.ts (case, document, task, invoice …). */
  domain: StatusDomain;
  status: string | null | undefined;
  /** Visible text (translated label). Defaults to the raw status. */
  label?: ReactNode;
};

/**
 * Domain status pill; the tone is looked up in the central vocabulary.
 *
 *   <StatusPill domain="document" status={doc.status} label={t(`portal.docs.status.${doc.status}`)} />
 */
export const StatusPill = ({ domain, status, label, dot = true, ...rest }: StatusPillProps) => (
  <Badge tone={statusTone(domain, status)} dot={dot} {...rest}>
    {label ?? status ?? '—'}
  </Badge>
);

/** Solid status dot (lists, legends). */
export const StatusDot = ({ tone = 'neutral', className, label }: { tone?: BadgeTone; className?: string; label?: string }) => (
  <span
    className={clsx('inline-block size-2 shrink-0 rounded-full', TONE_SOLID[tone], className)}
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
  />
);
