import { RouteFlags } from '../ui/Flag';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Handshake as HandshakeIcon } from 'lucide-react';
import clsx from 'clsx';
import { QuizCta } from '../publicAi/QuizCta';
import { Employer, Traveller, Worker } from '../illustrations';
import type { Audience } from '@/lib/audience';

const EASE = [0.22, 1, 0.36, 1] as const;
const CHOICES: { key: Audience; Art: typeof Worker }[] = [
  { key: 'worker', Art: Worker },
  { key: 'employer', Art: Employer },
];
/** Entrance: opacity + a short slide, once; MotionConfig turns it off for reduced motion. */
const enter = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.6, ease: EASE },
});
/**
 * Headline and subtitle (the largest text above the fold, i.e. the LCP element) only slide: an element that
 * starts at opacity 0 does not count as painted until the fade reveals it, which pushed LCP back by the
 * delay plus the fade. Visible from the first frame, same movement.
 */
const rise = (delay: number) => ({
  initial: { y: 14 },
  animate: { y: 0 },
  transition: { delay, duration: 0.6, ease: EASE },
});

/**
 * Home hero (Direction B): warm canvas, serif headline, the traveller illustration, and the
 * "Who are you?" choice. The choice is remembered (lib/audience) and the page below shows only that audience.
 */
export const Hero = ({ audience, onChoose }: { audience: Audience | null; onChoose: (a: Audience) => void }) => {
  const { t } = useTranslation();
  const bullets = t('hero.bullets', { returnObjects: true }) as string[];

  return (
    <section className="relative isolate overflow-hidden bg-canvas pt-24 pb-12 sm:pt-28 sm:pb-16 lg:pt-40 lg:pb-20">
      <div className="container-x">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
          <div className="min-w-0">
            <motion.p
              {...enter(0.05)}
              className="mb-5 inline-flex max-w-full items-center gap-2.5 rounded-full border border-line bg-card py-1.5 pr-4 pl-2 text-xs font-semibold text-muted shadow-[var(--tv-shadow-card)] sm:mb-6 sm:text-sm"
            >
              <RouteFlags />
              <span className="min-w-0 truncate">{t('hero.eyebrow')}</span>
            </motion.p>

            <motion.h1 {...rise(0.12)} className="font-display text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-balance break-words hyphens-auto text-ink sm:text-[3.25rem] sm:leading-[1.08] xl:text-[3.75rem]">
              <span className="block">{t('hero.title1')}</span>
              <span className="block text-highlight-fg">{t('hero.title2')}</span>
            </motion.h1>

            <motion.p {...rise(0.2)} className="mt-5 max-w-[56ch] text-base leading-relaxed text-muted sm:mt-6 sm:text-lg">
              {t('hero.subtitle')}
            </motion.p>

            {audience !== 'employer' && (
              <motion.div {...enter(0.28)}>
                <QuizCta className="mt-5 text-ink" />
              </motion.div>
            )}

            <motion.ul {...enter(0.34)} className="mt-6 hidden gap-x-6 gap-y-2.5 sm:grid sm:grid-cols-2">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-ink">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-highlight-fg" aria-hidden />
                  {b}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* illustration + one quiet "partner" note (decorative drawing; the note is real text) */}
          <motion.div {...enter(0.18)} className="relative mx-auto w-full max-w-[22rem] sm:max-w-[26rem] lg:max-w-none">
            <Traveller animated className="w-full" />
            <div className="absolute right-0 bottom-2 hidden max-w-[16rem] rounded-2xl border border-line bg-card p-4 shadow-[var(--tv-shadow-raised)] xl:block">
              <p className="flex items-center gap-2 text-sm leading-snug font-semibold text-ink">
                <span className="chip-sage grid size-8 shrink-0 place-items-center rounded-lg">
                  <HandshakeIcon className="size-4" aria-hidden />
                </span>
                {t('hero.cardTitle')}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{t('hero.cardText')}</p>
            </div>
          </motion.div>
        </div>

        {/* "Who are you?" */}
        <motion.div {...enter(0.4)} className="mt-10 sm:mt-14">
          <h2 id="hero-who" className="type-subsection text-ink">
            {t('siteNav.home.question')}
          </h2>
          <p className="mt-1 text-sm text-muted sm:text-base">{t('siteNav.home.hint')}</p>
          <div role="group" aria-labelledby="hero-who" className="mt-5 grid gap-4 md:grid-cols-2">
            {CHOICES.map(({ key, Art }) => {
              const on = audience === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChoose(key)}
                  className={clsx(
                    'group flex min-h-[8.5rem] items-center gap-4 rounded-3xl border bg-card p-5 text-left shadow-[var(--tv-shadow-card)] transition-[border-color,box-shadow] duration-200 sm:gap-5 sm:p-6',
                    on ? 'border-primary ring-2 ring-primary/25' : 'border-line hover:border-line-strong hover:shadow-[var(--tv-shadow-raised)]',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg leading-tight font-semibold text-ink sm:text-xl">{t(`siteNav.home.${key}.title`)}</span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-muted">{t(`siteNav.home.${key}.text`)}</span>
                    <span className={clsx('mt-3 inline-flex items-center gap-1.5 text-sm font-semibold', on ? 'text-ink' : 'text-link')}>
                      {on ? <CheckCircle2 className="size-5 text-highlight-fg" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
                    </span>
                  </span>
                  <Art className="w-24 shrink-0 sm:w-28" />
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
