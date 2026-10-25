import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

/** Vertical, service-specific step timeline; the duration badge sits at the top of the line. */
export const StepsTimeline = ({ steps, duration }: { steps: string[]; duration?: string }) => {
  const { t } = useTranslation();
  return (
    <div>
      {duration && (
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-sunken px-4 py-2 text-sm font-semibold text-muted">
          <Clock className="size-4" /> {t('serviceDetail.steps.duration')}: <span className="text-ink">{duration}</span>
        </p>
      )}
      <ol className="relative">
        {/* the rail fills top-to-bottom once in view */}
        <motion.span
          aria-hidden
          className="absolute top-2 bottom-2 left-[1.0625rem] w-0.5 bg-line-strong"
          style={{ originY: 0 }}
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        {steps.map((s, i) => (
          <motion.li
            key={s}
            className="relative flex gap-4 pb-6 last:pb-0 sm:gap-5"
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
          >
            <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-primary font-display text-sm font-semibold text-primary-contrast ring-4 ring-canvas">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 rounded-2xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)]">
              <p className="type-overline">{t('serviceDetail.steps.step', { n: i + 1 })}</p>
              <p className="mt-1 max-w-[68ch] leading-relaxed text-ink">{s}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
};
