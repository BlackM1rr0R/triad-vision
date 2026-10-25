import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Ban,
  BookOpenCheck,
  Briefcase,
  Car,
  Clock,
  CornerDownLeft,
  GraduationCap,
  History,
  Languages,
  MessageCircleOff,
  MessagesSquare,
  School,
  Sprout,
  Sun,
  TrendingUp,
  Trophy,
  Truck,
  User,
  UserCheck,
  UserRound,
  Users,
  Container,
  Wrench,
} from 'lucide-react';
import { Reveal } from '@/components/motion';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { OptionCard } from '@/components/quiz/OptionCard';
import { QuizResult } from '@/components/quiz/QuizResult';
import { useQuizState } from '@/components/quiz/useQuizState';
import { FIELD_SLUGS, OPTIONS, isComplete, scoreQuiz, type QuestionId } from '@/components/quiz/scoring';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';

const EASE = [0.22, 1, 0.36, 1] as const;

const OPTION_ICONS: Record<Exclude<QuestionId, 'field'>, Record<string, ReactNode>> = {
  education: { school: <School />, vocational: <Wrench />, university: <GraduationCap /> },
  experience: { exp0: <Sprout />, exp1: <TrendingUp />, exp3: <Award />, exp5: <Trophy /> },
  german: { none: <MessageCircleOff />, a1a2: <Languages />, b1: <MessagesSquare />, b2: <BookOpenCheck /> },
  age: { a18: <User />, a26: <UserRound />, a36: <UserCheck />, a46: <Users /> },
  licence: { B: <Car />, C: <Truck />, CE: <Container />, none: <Ban /> },
  goal: { work: <Briefcase />, study: <GraduationCap />, seasonal: <Sun /> },
};

const slide = {
  enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -60, opacity: 0 }),
};

export default function Eligibility() {
  const { t } = useTranslation();
  usePageTitle(t('quiz.title'));
  const { tr } = useL10n();
  const { data, isLoading } = useSiteContent();
  const q = useQuizState();
  const [showRestored, setShowRestored] = useState(q.restored);
  const cardRef = useRef<HTMLDivElement>(null);
  const advanceTimer = useRef<number | undefined>(undefined);

  const visas = useMemo(() => {
    const list = data?.visaCategories ?? [];
    // Known quiz categories first (in the defined order), then anything else the CMS has.
    const rank = (slug: string) => {
      const i = (FIELD_SLUGS as readonly string[]).indexOf(slug);
      return i === -1 ? 100 : i;
    };
    return [...list].sort((a, b) => rank(a.slug) - rank(b.slug) || a.sortOrder - b.sortOrder);
  }, [data]);

  const finished = q.done && isComplete(q.answers);
  const result = useMemo(
    () => (finished && visas.length ? scoreQuiz(q.answers, visas.map((v) => v.slug)) : null),
    [finished, q.answers, visas],
  );

  const currentValue = q.answers[q.current];
  const canNext = currentValue !== undefined;
  const total = q.steps.length;
  const progress = finished ? 100 : Math.round((q.step / total) * 100);

  useEffect(() => {
    if (!showRestored) return;
    const id = window.setTimeout(() => setShowRestored(false), 4000);
    return () => window.clearTimeout(id);
  }, [showRestored]);

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  // Bring the card into view on step changes (mostly useful on phones).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = cardRef.current;
    if (el && el.getBoundingClientRect().top < 80) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [q.step, finished]);

  const options: { value: string; label: string; description?: string; icon: ReactNode }[] =
    q.current === 'field'
      ? visas.map((v) => ({ value: v.slug, label: tr(v.title), description: v.visaLabel, icon: <Icon name={v.icon} /> }))
      : OPTIONS[q.current].map((value) => ({
          value,
          label: t(`quiz.options.${q.current}.${value}`),
          description:
            q.current === 'licence'
              ? t(`quiz.options.licenceDesc.${value}`)
              : q.current === 'goal'
                ? t(`quiz.options.goalDesc.${value}`)
                : undefined,
          icon: OPTION_ICONS[q.current as Exclude<QuestionId, 'field'>][value],
        }));

  const select = (value: string) => {
    const changed = q.answers[q.current] !== value;
    q.answer(q.current, value);
    window.clearTimeout(advanceTimer.current);
    // Auto-advance after a short pause so the selection animation is visible; re-picking the same answer advances at once.
    if (changed) advanceTimer.current = window.setTimeout(() => q.goNext(), 380);
    else q.goNext();
  };

  // Keyboard: Enter = next, digits = pick option.
  useEffect(() => {
    if (finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (document.querySelector('[data-search-palette-open]')) return;
      // A focused button handles Enter itself (option cards select/advance, nav buttons click).
      if (e.key === 'Enter' && canNext && !target?.closest('button, a')) {
        e.preventDefault();
        window.clearTimeout(advanceTimer.current);
        q.goNext();
      } else if (/^[1-9]$/.test(e.key)) {
        const opt = options[Number(e.key) - 1];
        if (opt) select(opt.value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const restart = () => {
    window.clearTimeout(advanceTimer.current);
    q.reset();
  };

  return (
    <>
      {/* ── Hero band ── */}
      <section className="hero-warm border-b border-line pt-28 pb-12 sm:pt-36 lg:pt-44">
        <div className="container-x pb-12 text-center">
          <Reveal y={16}>
            <span className="eyebrow">
              <Trophy className="size-4" />
              {t('quiz.eyebrow')}
            </span>
            <h1 className="type-hero mx-auto mt-3 max-w-3xl text-ink">
              {t('quiz.title')}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted sm:text-lg">{t('quiz.subtitle')}</p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-ink">
              <Clock className="size-3.5" />
              {t('quiz.duration')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Wizard card ── */}
      <section className="relative pb-20 lg:pb-28">
        <div className="container-x">
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className={`relative mx-auto -mt-12 scroll-mt-24 overflow-hidden rounded-3xl border border-line bg-card shadow-[var(--tv-shadow-raised)] ${finished ? 'max-w-6xl' : 'max-w-4xl'}`}
          >
            {/* Progress */}
            <div className="h-1.5 bg-sunken">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: EASE }}
              />
            </div>

            <div className="p-5 sm:p-8 lg:p-10">
              <AnimatePresence>
                {showRestored && !finished && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 flex items-center gap-2 overflow-hidden text-xs font-medium text-muted"
                  >
                    <History className="size-4 shrink-0" />
                    {t('quiz.restored')}
                  </motion.p>
                )}
              </AnimatePresence>

              {isLoading || !data ? (
                <div className="grid min-h-[320px] place-items-center text-primary">
                  <span className="flex flex-col items-center gap-3 text-sm text-muted">
                    <Spinner className="size-8 border-[3px] text-primary" />
                    {t('quiz.loading')}
                  </span>
                </div>
              ) : (
                <AnimatePresence mode="wait" custom={q.direction} initial={false}>
                  {finished && result ? (
                    <motion.div
                      key="result"
                      custom={q.direction}
                      variants={slide}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.45, ease: EASE }}
                    >
                      <QuizResult result={result} visas={visas} onRestart={restart} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={q.current}
                      custom={q.direction}
                      variants={slide}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.4, ease: EASE }}
                    >
                      <p className="type-overline text-highlight-fg">
                        {t('quiz.stepOf', { current: q.step + 1, total })}
                      </p>
                      <h2 id="quiz-question" className="mt-2 font-display text-2xl leading-tight font-semibold break-words text-ink sm:text-3xl">
                        {t(`quiz.questions.${q.current}.title`)}
                      </h2>
                      <p className="mt-2 text-muted">{t(`quiz.questions.${q.current}.hint`)}</p>

                      <div role="radiogroup" aria-labelledby="quiz-question" className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                        {options.map((o, i) => (
                          <OptionCard
                            key={o.value}
                            index={i}
                            icon={o.icon}
                            label={o.label}
                            description={o.description}
                            selected={currentValue === o.value}
                            onSelect={() => select(o.value)}
                          />
                        ))}
                      </div>

                      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
                        <button
                          type="button"
                          onClick={q.goBack}
                          disabled={q.step === 0}
                          className="btn-secondary disabled:pointer-events-none disabled:opacity-40"
                        >
                          <ArrowLeft className="size-4" />
                          {t('quiz.back')}
                        </button>
                        <span className="hidden items-center gap-1.5 text-xs text-muted md:inline-flex">
                          <CornerDownLeft className="size-3.5" />
                          {t('quiz.enterHint')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            window.clearTimeout(advanceTimer.current);
                            q.goNext();
                          }}
                          disabled={!canNext}
                          className="btn-primary disabled:pointer-events-none disabled:opacity-40"
                        >
                          {q.step === total - 1 ? t('quiz.seeResult') : t('quiz.next')}
                          <ArrowRight className="size-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
