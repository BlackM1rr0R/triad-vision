import { useId } from 'react';

/** Small dependency-free bar chart (12 months). Values are listed in a visually hidden table for screen readers. */
export const MiniBars = ({
  bars,
  format = (v) => String(v),
  label,
  color = 'bg-primary',
}: {
  bars: { key: string; label: string; value: number }[];
  format?: (v: number) => string;
  label: string;
  color?: string;
}) => {
  const id = useId();
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <figure aria-labelledby={id} className="min-w-0">
      <figcaption id={id} className="mb-3 text-sm font-semibold text-ink">
        {label}
      </figcaption>
      <div className="flex h-36 items-end gap-1 pt-5 sm:gap-1.5" aria-hidden>
        {bars.map((b) => (
          <div key={b.key} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
            <div
              className={`relative w-full rounded-t ${b.value > 0 ? color : 'bg-line'}`}
              style={{ height: `${b.value > 0 ? Math.max(4, (b.value / max) * 100) : 2}%` }}
            >
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded bg-ink px-1.5 py-0.5 text-[10px] whitespace-nowrap text-canvas opacity-0 transition group-hover:opacity-100">
                {format(b.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-1.5" aria-hidden>
        {bars.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted">
            {(bars.length - 1 - i) % 2 === 0 ? b.label : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td>{format(b.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
