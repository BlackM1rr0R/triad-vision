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
        ? 'border-brand-600 bg-brand-50 shadow-[0_14px_40px_-18px_rgba(21,101,232,0.6)]'
        : 'border-line bg-white hover:border-brand-400 hover:bg-brand-50/40 hover:shadow-[0_14px_40px_-22px_rgba(11,31,68,0.35)]',
    )}
  >
    <span
      className={clsx(
        'grid size-12 shrink-0 place-items-center rounded-xl transition duration-300 [&>svg]:size-6',
        selected ? 'bg-brand-600 text-white' : 'bg-surface text-navy-900 group-hover:bg-brand-100 group-hover:text-brand-700',
      )}
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-semibold break-words text-navy-900">{label}</span>
      {description && <span className="mt-0.5 block text-sm break-words text-muted">{description}</span>}
    </span>
    <span
      className={clsx(
        'grid size-6 shrink-0 place-items-center rounded-full border-2 transition duration-300',
        selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-line text-transparent',
      )}
      aria-hidden
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
    <span className="pointer-events-none absolute top-2 right-3 hidden text-[10px] font-bold text-muted/60 lg:block">{index + 1}</span>
  </motion.button>
);
