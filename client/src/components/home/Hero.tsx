import { useRef } from 'react';
import { RouteFlags } from '../ui/Flag';
import { HeroGlobeLite } from './HeroGlobeLite';
import { useTranslation } from 'react-i18next';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Building2, CheckCircle2, HardHat, MousePointer2, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { QuizCta } from '../publicAi/QuizCta';
import { sized, srcSet } from '@/lib/img';
import type { Audience } from '@/lib/audience';

const BG = 'https://images.unsplash.com/photo-1587330979470-3595ac045ab0?auto=format&fit=crop&w=1600&q=60';
const HANDSHAKE = 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=640&q=70';
const EASE = [0.22, 1, 0.36, 1] as const;
const CHOICES: { key: Audience; icon: LucideIcon }[] = [
  { key: 'worker', icon: HardHat },
  { key: 'employer', icon: Building2 },
];

export const Hero = ({ audience, onChoose }: { audience: Audience | null; onChoose: (a: Audience) => void }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '35%']);
  const globeY = useTransform(scrollYProgress, [0, 1], ['0%', '-18%']);
  const globeScale = useTransform(scrollYProgress, [0, 1], [1, 0.85]);
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', '40%']);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const bullets = t('hero.bullets', { returnObjects: true }) as string[];

  return (
    <section ref={ref} className="relative isolate min-h-[100svh] overflow-hidden bg-navy-950 text-white">
      {/* background layers */}
      <motion.div style={{ y: bgY }} className="absolute inset-0 -z-20 will-change-transform">
        <img src={sized(BG, 1600)} srcSet={srcSet(BG, [640, 960, 1280, 1600])} sizes="100vw" alt="" fetchPriority="high" decoding="async" className="size-full scale-110 object-cover opacity-30" />
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950 via-navy-950/85 to-navy-900/30" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-950 via-transparent to-navy-950/60" />
      <div className="absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />
      <motion.div
        className="absolute -top-40 -left-40 -z-10 size-[520px] rounded-full bg-[radial-gradient(closest-side,var(--color-brand-600),transparent)] opacity-30"
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* globe */}
      <motion.div
        style={{ y: globeY, scale: globeScale }}
        className="will-change-transform absolute top-[58%] right-[-45%] -z-10 aspect-square w-[140vw] -translate-y-1/2 opacity-35 sm:top-1/2 sm:right-[-25%] sm:w-[100vw] sm:opacity-50 lg:right-[-8%] lg:w-[62vw] lg:max-w-[980px] lg:-translate-y-[45%] lg:opacity-100"
      >
        <HeroGlobeLite />
      </motion.div>

      <div className="container-x relative flex min-h-[100svh] flex-col justify-center pt-28 pb-32 sm:pt-36 lg:pt-40 lg:pb-32">
        <motion.div style={{ y: textY, opacity: fade }} className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: EASE }}
            className="glass mb-5 inline-flex max-w-full items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-[0.65rem] font-bold tracking-[0.14em] uppercase sm:mb-6 sm:gap-3 sm:text-xs"
          >
            <span className="flex items-center rounded-full bg-white/10 px-2 py-1"><RouteFlags /></span>
            {t('hero.eyebrow')}
          </motion.div>

          <h1 className="font-display text-[2.15rem] leading-[1.06] font-extrabold text-balance sm:text-6xl xl:text-7xl">
            {[t('hero.title1'), t('hero.title2')].map((line, i) => (
              <span key={line} className="block overflow-hidden pb-2">
                <motion.span
                  className={i === 1 ? 'text-gradient block' : 'block'}
                  initial={{ y: '110%', rotate: 3 }}
                  animate={{ y: '0%', rotate: 0 }}
                  transition={{ delay: 0.45 + i * 0.12, duration: 1, ease: EASE }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8, ease: EASE }}
            className="mt-5 max-w-xl text-[0.95rem] leading-relaxed text-white/75 sm:mt-6 sm:text-lg"
          >
            {t('hero.subtitle')}
          </motion.p>

          {/* "Who are you?" — the choice is remembered (lib/audience) and the home page below shows only that audience. */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.8, ease: EASE }}
            className="mt-7 sm:mt-9"
          >
            <h2 id="hero-who" className="font-display text-base font-bold sm:text-lg">
              {t('siteNav.home.question')}
            </h2>
            <p className="mt-1 text-sm text-white/65">{t('siteNav.home.hint')}</p>
            <div role="group" aria-labelledby="hero-who" className="mt-4 grid gap-3 sm:grid-cols-2">
              {CHOICES.map(({ key, icon: ChoiceIcon }) => {
                const on = audience === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChoose(key)}
                    className={clsx(
                      'group flex items-center gap-4 rounded-2xl border p-4 text-left backdrop-blur-sm transition duration-300 sm:p-5',
                      on ? 'border-brand-400 bg-brand-600/30 shadow-lg shadow-brand-600/30' : 'border-white/20 bg-white/[0.06] hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/10',
                    )}
                  >
                    <span className={clsx('grid size-12 shrink-0 place-items-center rounded-xl transition', on ? 'bg-white text-brand-700' : 'bg-brand-600 text-white')}>
                      <ChoiceIcon className="size-6" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg leading-tight font-bold">{t(`siteNav.home.${key}.title`)}</span>
                      <span className="mt-1 block text-sm leading-snug text-white/70">{t(`siteNav.home.${key}.text`)}</span>
                    </span>
                    {on ? <CheckCircle2 className="size-5 shrink-0 text-brand-300" aria-hidden /> : <ArrowRight className="size-5 shrink-0 opacity-60 transition group-hover:translate-x-1 group-hover:opacity-100" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </motion.div>
          {audience !== 'employer' && <QuizCta className="mt-4" />}

          <motion.ul
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 1.1 } } }}
            className="mt-8 hidden gap-2.5 sm:mt-10 sm:grid sm:grid-cols-2 sm:gap-3"
          >
            {bullets.map((b) => (
              <motion.li
                key={b}
                variants={{ hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0, transition: { duration: 0.6 } } }}
                className="flex items-start gap-2.5 text-sm text-white/85"
              >
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-400" />
                {b}
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>

        {/* floating partner card */}
        <motion.div
          initial={{ opacity: 0, x: 60, rotate: 4 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ delay: 1.3, duration: 1, ease: EASE }}
          className="absolute right-8 bottom-36 hidden w-80 animate-float overflow-hidden rounded-2xl border border-white/15 bg-white/95 text-navy-900 shadow-2xl xl:block 2xl:right-16"
        >
          <img src={sized(HANDSHAKE, 320)} srcSet={srcSet(HANDSHAKE, [320, 640])} sizes="320px" width={320} height={144} alt="" loading="lazy" decoding="async" className="h-36 w-full object-cover" />
          <div className="p-5">
            <p className="font-display text-base leading-snug font-bold">{t('hero.cardTitle')}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t('hero.cardText')}</p>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="absolute bottom-28 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] font-semibold tracking-[0.3em] text-white/50 uppercase lg:flex"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <MousePointer2 className="size-4" />
        {t('hero.scroll')}
      </motion.div>
    </section>
  );
};
