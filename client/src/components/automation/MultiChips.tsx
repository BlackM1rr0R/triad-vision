import clsx from 'clsx';

/** Multi-select as toggle chips. Empty = "any" when `anyLabel` is given. */
export const MultiChips = <T extends string>({ options, value, onChange, label, anyLabel }: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void; label: (v: T) => string; anyLabel?: string }) => (
  <div className="flex flex-wrap gap-1.5">
    {anyLabel && (
      <button type="button" onClick={() => onChange([])} aria-pressed={value.length === 0} className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', value.length === 0 ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400')}>
        {anyLabel}
      </button>
    )}
    {options.map((o) => {
      const on = value.includes(o);
      return (
        <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400')}>
          {label(o)}
        </button>
      );
    })}
  </div>
);

