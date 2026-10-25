import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import clsx from 'clsx';

/** Big tappable answer card used by the eligibility quiz. */
export const OptionCard = ({
  icon,
  label,
  description,
  selected,
  index,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  selected: boolean;
  index: number;
  onSelect: () => void;
}) => (
  <motion.button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay: 0.04 * index, ease: [0.22, 1, 0.36, 1] }}
    whileTap={{ scale: 0.98 }}
    className={clsx(
      'group relative flex w-full min-w-0 items-center gap-4 rounded-2xl border-2 p-4 text-left transition-[border-color,background-color,box-shadow] duration-300 sm:p-5',
      selected
        ? 'border-primary bg-card shadow-[var(--tv-shadow-raised)]'
        : 'border-line bg-card hover:border-line-strong hover:shadow-[var(--tv-shadow-card)]',
    )}
  >
    <span
      className={clsx(
        'grid size-12 shrink-0 place-items-center rounded-xl transition duration-300 [&>svg]:size-6',
        selected ? 'bg-primary text-primary-contrast' : 'chip-soft',
      )}
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-semibold break-words text-ink">{label}</span>
      {description && <span className="mt-0.5 block text-sm break-words text-muted">{description}</span>}
    </span>
    <span
      className={clsx(
        'grid size-6 shrink-0 place-items-center rounded-full border-2 transition duration-300',
        selected ? 'border-primary bg-primary text-primary-contrast' : 'border-line-strong text-transparent',
      )}
      aria-hidden
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
    <span className="pointer-events-none absolute top-2 right-3 hidden text-[10px] font-bold text-muted/60 lg:block">{index + 1}</span>
  </motion.button>
);
