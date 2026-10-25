import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import clsx from 'clsx';

/** Simple Q&A accordion for page-specific questions (only one open at a time). */
export const Accordion = ({ items, defaultOpen = 0 }: { items: { q: string; a: string }[]; defaultOpen?: number | null }) => {
  const id = useId();
  const [open, setOpen] = useState<number | null>(defaultOpen);
  return (
    <div className="space-y-3">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div
            key={f.q}
            className={clsx(
              'overflow-hidden rounded-2xl border bg-card transition-colors',
              isOpen ? 'border-line-strong shadow-[var(--tv-shadow-card)]' : 'border-line hover:border-line-strong',
            )}
          >
            <h3>
              <button
                type="button"
                id={`${id}-q${i}`}
                aria-expanded={isOpen}
                aria-controls={`${id}-a${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
              >
                <span className="text-base font-semibold text-ink">{f.q}</span>
                <span
                  className={clsx(
                    'grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-300',
                    isOpen ? 'rotate-45 bg-primary text-primary-contrast' : 'bg-sunken text-ink',
                  )}
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`${id}-a${i}`}
                  role="region"
                  aria-labelledby={`${id}-q${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="max-w-[70ch] px-5 pb-5 text-[0.95rem] leading-relaxed text-muted sm:px-6 sm:pb-6 sm:text-base">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
