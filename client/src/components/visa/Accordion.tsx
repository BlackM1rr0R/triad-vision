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
              'overflow-hidden rounded-2xl border bg-white transition-colors',
              isOpen ? 'border-brand-400 shadow-lg shadow-brand-600/10' : 'border-line hover:border-brand-200',
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
                <span className="font-display text-[0.95rem] font-bold text-navy-900 sm:text-base">{f.q}</span>
                <span
                  className={clsx(
                    'grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-300',
                    isOpen ? 'rotate-45 bg-brand-600 text-white' : 'bg-brand-50 text-brand-700',
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
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6 sm:pb-6 sm:text-[0.95rem]">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
