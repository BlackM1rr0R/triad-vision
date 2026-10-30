import { motion } from 'framer-motion';
import { Counter } from '../motion';
import { Icon } from '../ui/Icon';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { Skeleton } from '../ui/Skeleton';

/** Key figures in one calm card right under the hero (Direction B). */
const CHIPS = ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach', 'chip-soft'];
// One column per figure on wide screens, so 4 figures never leave an empty tile in a 5-column card.
const LG_COLS = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5'];
const MD_COLS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-2', 'md:grid-cols-3'];
export const StatsBar = () => {
  const { data } = useSiteContent();
  const { tr } = useL10n();
  // Placeholder tiles in the same card / grid, so the bar does not pop in over the hero edge.
  if (!data)
    return (
      <div className="container-x relative z-10" aria-hidden>
        <div className="card grid grid-cols-2 gap-px overflow-hidden bg-line md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`flex min-w-0 flex-col items-start gap-3 bg-card p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-6 ${i === 4 ? 'col-span-2 md:col-span-1' : ''}`}>
              <Skeleton rounded="xl" className="size-10 shrink-0 sm:size-12" />
              <div className="w-full min-w-0 space-y-2">
                <Skeleton className="h-7 w-16 sm:h-8" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="container-x relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`card grid grid-cols-2 gap-px overflow-hidden bg-line ${MD_COLS[Math.min(data.stats.length, 5)]} ${LG_COLS[Math.min(data.stats.length, 5)]} [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1`}
      >
        {data.stats.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className="flex min-w-0 flex-col items-start gap-3 bg-card p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-6"
          >
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl sm:size-12 ${CHIPS[i % CHIPS.length]}`}>
              <Icon name={s.icon} className="size-6" strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <Counter to={s.value} prefix={s.prefix} suffix={s.suffix} className="font-display text-2xl font-semibold text-ink sm:text-3xl num" />
              <p className="text-xs leading-snug text-muted sm:text-sm">{tr(s.label)}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};
