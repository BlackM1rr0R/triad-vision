import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

/** Vertical, service-specific step timeline; the duration badge sits at the top of the line. */
export const StepsTimeline = ({ steps, duration }: { steps: string[]; duration?: string }) => {
  const { t } = useTranslation();
  return (
    <div>
      {duration && (
        <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-100">
          <Clock className="size-4" /> {t('serviceDetail.steps.duration')}: <span className="text-navy-900">{duration}</span>
        </p>
      )}
      <ol className="relative">
        {/* the rail fills top-to-bottom once in view */}
        <motion.span
          aria-hidden
          className="absolute top-2 bottom-2 left-[1.0625rem] w-0.5 bg-gradient-to-b from-brand-500 to-brand-200"
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
            <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 font-display text-sm font-bold text-white ring-4 ring-white">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 rounded-xl border border-line bg-white p-4 transition hover:border-brand-300 hover:shadow-md">
              <p className="text-[11px] font-bold tracking-widest text-brand-600 uppercase">{t('serviceDetail.steps.step', { n: i + 1 })}</p>
              <p className="mt-1 text-sm leading-relaxed text-navy-900 sm:text-[0.95rem]">{s}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
};
