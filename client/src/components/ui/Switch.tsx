import { useId, type ReactNode } from 'react';
import clsx from 'clsx';

export type SwitchProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Accessible name. Shown next to the switch when `showLabel` (default: only aria-label + title). */
  label: string;
  /** Render the label visibly on the right (and an optional hint under it). */
  showLabel?: boolean;
  hint?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * On/off switch (role="switch"). The hit area is at least 40 px tall even when the track is small.
 *
 *   <Switch checked={on} onChange={setOn} label="E-mail notifications" />
 *   <Switch checked={on} onChange={setOn} label="Compact tables" showLabel hint="Smaller rows in admin lists" />
 */
export const Switch = ({ checked, onChange, label, showLabel = false, hint, disabled, size = 'md', className }: SwitchProps) => {
  const hintId = useId();
  const sm = size === 'sm';
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      aria-describedby={hint ? hintId : undefined}
      title={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        // ::after widens the hit area without changing the visual size
        "relative inline-flex shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] disabled:cursor-not-allowed disabled:opacity-50",
        sm ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'bg-brand-600' : 'bg-subtle',
        !showLabel && className,
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'inline-block rounded-full bg-white shadow-[0_1px_2px_rgba(11,31,68,0.3)] transition-transform',
          sm ? 'size-3' : 'size-4',
          checked ? (sm ? 'translate-x-3.5' : 'translate-x-4.5') : 'translate-x-0.5',
        )}
      />
      {showLabel && <span className="sr-only">{label}</span>}
    </button>
  );
  if (!showLabel) return button;
  return (
    <label className={clsx('flex cursor-pointer items-start gap-3 text-sm text-ink', disabled && 'cursor-not-allowed opacity-60', className)}>
      <span className="mt-0.5 inline-flex">{button}</span>
      <span className="min-w-0" aria-hidden>
        {label}
        {hint && (
          <span id={hintId} className="mt-0.5 block text-xs text-muted">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
};
