import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { PlaneTakeoff, X } from 'lucide-react';
import { useMotionOK } from '@/components/motion';
import { lockScroll } from '@/components/ui/overlay';
import { registerCopy } from '@/i18n';
import { pagesFirstWeeks } from '@/i18n/pagesFirstWeeks';

registerCopy(pagesFirstWeeks);

/** German flag colours (black, red, gold). */
const FLAG = ['#111111', '#dd0000', '#ffce00'] as const;

/**
 * Full-screen "visa granted" moment, shown once per case before the next-steps dialog: flag-coloured bands, a plane
 * flying across and "Uğurlar, <city> sizi gözləyir!" (generic text without a known city). The confetti burst is
 * fired by the caller (celebrate.ts). With reduced motion everything is static. Escape or the buttons close it.
 */
export function VisaGrantedSplash({ city, onClose }: { city: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const motionOK = useMotionOK();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const unlock = lockScroll();
    return () => {
      unlock();
      before?.focus?.();
    };
  }, []);
  if (typeof document === 'undefined') return null;
  const headline = city ? t('fw.celebrate.headline', { city }) : t('fw.celebrate.headlineNoCity');
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={headline}
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-[10000] flex flex-col overflow-hidden bg-slate-950 text-white outline-none"
    >
      <div className="absolute inset-0 flex flex-col" aria-hidden>
        {FLAG.map((c, i) => (
          <motion.div
            key={c}
            className="flex-1 origin-left opacity-90"
            style={{ backgroundColor: c }}
            initial={motionOK ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={{ delay: i * 0.18, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      {motionOK && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-[18%] left-0 text-white drop-shadow-lg"
          initial={{ x: '-15vw', y: 60, rotate: -8 }}
          animate={{ x: '110vw', y: -40, rotate: 0 }}
          transition={{ duration: 4.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.2 }}
        >
          <PlaneTakeoff className="size-14 sm:size-20" />
        </motion.div>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('fw.celebrate.close')}
        className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-black/40 hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <X className="size-5" aria-hidden />
      </button>
      <div className="relative z-10 m-auto flex max-w-xl flex-col items-center px-6 text-center">
        <motion.h2
          className="rounded-2xl bg-black/55 px-5 py-4 font-display text-3xl leading-tight font-extrabold backdrop-blur-sm sm:text-5xl"
          initial={motionOK ? { opacity: 0, y: 24, scale: 0.96 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: motionOK ? 0.5 : 0, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {headline}
        </motion.h2>
        <p className="mt-4 rounded-xl bg-black/55 px-4 py-2 text-base font-semibold sm:text-lg">{t('fw.celebrate.sub')}</p>
        <button type="button" onClick={onClose} data-autofocus className="mt-8 min-h-12 rounded-full bg-white px-8 text-base font-bold text-slate-900 hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          {t('fw.celebrate.next')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
