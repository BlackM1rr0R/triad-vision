import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import clsx from 'clsx';
import { Reveal } from '@/components/motion';

/** Typed access to structured (array/object) translation values. */
export const useCopy = () => {
  const { t } = useTranslation();
  return <T,>(key: string) => t(key, { returnObjects: true }) as T;
};

/**
 * Lightweight accordion (one item open at a time). Animates height with the CSS grid-rows trick,
 * so there is no layout measuring in JS.
 */
export const Accordion = ({ items, dark = false }: { items: { q: string; a: string }[]; dark?: boolean }) => {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div
            key={it.q}
            className={clsx(
              'rounded-2xl border transition-colors duration-300',
              dark ? (isOpen ? 'border-white/30 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03] hover:border-white/25') : isOpen ? 'border-line-strong bg-card shadow-[var(--tv-shadow-raised)]' : 'border-line bg-card shadow-[var(--tv-shadow-card)] hover:border-line-strong',
            )}
          >
            <h3>
              <button
                type="button"
                id={`${base}-h${i}`}
                aria-expanded={isOpen}
                aria-controls={`${base}-p${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left sm:px-6 sm:py-5"
              >
                <span className={clsx('font-display text-[0.95rem] font-semibold sm:text-base', dark ? 'text-white' : 'text-ink')}>{it.q}</span>
                <span
                  className={clsx(
                    'grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-300',
                    isOpen && 'rotate-45',
                    dark ? 'bg-white/10 text-white' : isOpen ? 'bg-primary text-primary-contrast' : 'bg-sunken text-ink',
                  )}
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </h3>
            <div
              id={`${base}-p${i}`}
              role="region"
              aria-labelledby={`${base}-h${i}`}
              className={clsx('grid transition-[grid-template-rows] duration-300 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
            >
              <div className="overflow-hidden">
                <p className={clsx('px-5 pb-5 text-sm leading-relaxed sm:px-6 sm:text-[0.95rem]', dark ? 'text-white/70' : 'text-muted')}>{it.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Small pills under the PageHero subtitle (light warm band). */
export const HeroChips = ({ items }: { items: ReactNode[] }) => (
  <ul className="mt-6 flex flex-wrap gap-2 sm:mt-8">
    {items.map((c, i) => (
      <li key={i} className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-semibold text-ink shadow-[var(--tv-shadow-card)] sm:text-sm">
        {c}
      </li>
    ))}
  </ul>
);

/** Card wrapper for charts: title, optional note, figure content. */
export const ChartCard = ({ title, note, children, className, dark = false }: { title: string; note?: string; children: ReactNode; className?: string; dark?: boolean }) => (
  <Reveal className={clsx('h-full', className)} y={24}>
    <figure className={clsx('flex h-full flex-col rounded-2xl p-5 sm:p-6', dark ? 'border border-white/10 bg-white/[0.04]' : 'card')}>
      {children}
      <figcaption className="mt-4">
        <span className={clsx('block font-display text-sm font-semibold', dark ? 'text-white' : 'text-ink')}>{title}</span>
        {note && <span className={clsx('mt-0.5 block text-xs', dark ? 'text-white/55' : 'text-muted')}>{note}</span>}
      </figcaption>
    </figure>
  </Reveal>
);
