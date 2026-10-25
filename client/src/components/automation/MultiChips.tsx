import clsx from 'clsx';

/** Multi-select as toggle chips. Empty = "any" when `anyLabel` is given. */
export const MultiChips = <T extends string>({ options, value, onChange, label, anyLabel }: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void; label: (v: T) => string; anyLabel?: string }) => (
  <div className="flex flex-wrap gap-1.5">
    {anyLabel && (
      <button type="button" onClick={() => onChange([])} aria-pressed={value.length === 0} className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', value.length === 0 ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-muted hover:border-line-strong')}>
        {anyLabel}
      </button>
    )}
    {options.map((o) => {
      const on = value.includes(o);
      return (
        <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', on ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-muted hover:border-line-strong')}>
          {label(o)}
        </button>
      );
    })}
  </div>
);

