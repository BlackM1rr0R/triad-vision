import { forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  // the legacy global classes stay the single source of these looks (index.css)
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-ghost',
  ghost: 'btn-quiet',
  danger: 'btn-danger',
  link: 'inline-flex items-center gap-1.5 rounded font-semibold text-brand-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'px-6 py-3.5 text-base',
};
const LINK_SIZE: Record<ButtonSize, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
const ICON_SIZE: Record<ButtonSize, string> = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' };

/** Class string of a button look, for <Link> / <a> elements that should look like buttons. */
export const buttonClass = ({ variant = 'primary', size = 'md', block = false, className }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) =>
  // btn-press: tactile press / hover feedback (index.css; off for reduced motion)
  clsx(VARIANT[variant], variant === 'link' ? LINK_SIZE[size] : ['btn-press', SIZE[size]], block && 'w-full', className);

const renderIcon = (icon: LucideIcon | ReactNode | undefined, size: ButtonSize) => {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in icon)) {
    const I = icon as LucideIcon;
    return <I className={clsx(ICON_SIZE[size], 'shrink-0')} aria-hidden />;
  }
  return icon as ReactNode;
};

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  /** Leading icon (a lucide component or an element). Replaced by the spinner while loading. */
  icon?: LucideIcon | ReactNode;
  /** Trailing icon. */
  iconRight?: LucideIcon | ReactNode;
  /** Full width. */
  block?: boolean;
  children?: ReactNode;
};

/**
 * The one button. `type` defaults to "button" (not "submit").
 *
 *   <Button onClick={save} loading={m.isPending}>Save</Button>
 *   <Button variant="secondary" size="sm" icon={Plus}>Add</Button>
 *   <Button variant="danger" type="submit">Delete</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, iconRight, block, className, disabled, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    >
      {loading ? <Spinner className={ICON_SIZE[size]} /> : renderIcon(icon, size)}
      {children}
      {renderIcon(iconRight, size)}
    </button>
  );
});

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';

const ICON_VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'text-muted hover:bg-surface hover:text-ink',
  secondary: 'border border-line bg-card text-ink hover:bg-surface',
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  danger: 'text-muted hover:bg-danger-bg hover:text-danger-fg',
};
const ICON_BOX: Record<ButtonSize, string> = { sm: 'size-8', md: 'size-10', lg: 'size-11' };

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  /** Lucide component or element. */
  icon: LucideIcon | ReactNode;
  /** Required accessible name; also shown as the native tooltip unless `title` is given or `tooltip={false}`. */
  label: string;
  variant?: IconButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Show `label` as the native title tooltip (default true). */
  tooltip?: boolean;
  /** Legacy alias for variant="danger". */
  danger?: boolean;
};

/** Square icon-only button with a required `label` (aria-label). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant, size = 'md', loading = false, tooltip = true, danger, className, disabled, type = 'button', title, ...rest },
  ref,
) {
  const v: IconButtonVariant = variant ?? (danger ? 'danger' : 'ghost');
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? (tooltip ? label : undefined)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'btn-press inline-grid shrink-0 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50',
        ICON_BOX[size],
        ICON_VARIANT[v],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className={ICON_SIZE[size === 'sm' ? 'md' : size]} /> : renderIcon(icon, size === 'sm' ? 'md' : size)}
    </button>
  );
});
