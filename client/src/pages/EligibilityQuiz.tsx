import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  BookOpenCheck,
  Briefcase,
  CalendarCheck,
  Car,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Heart,
  Languages,
  RotateCcw,
  Send,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { trackLead } from '@/lib/leadVisitor';
import { registerCopy, toContentLocale } from '@/i18n';
import { pagesPublicAi } from '@/i18n/pagesPublicAi';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { OptionCard } from '@/components/quiz/OptionCard';
import { LeadForm } from '@/components/publicAi/LeadForm';

registerCopy(pagesPublicAi);

/** Mirrors server/src/lib/publicAi/eligibility.ts. */
const OPTIONS = {
  age: ['u18', '18_25', '26_35', '36_45', '46p'],
  profession: ['driver', 'care', 'construction', 'technical', 'hospitality', 'it', 'logistics', 'other', 'none'],
  experience: ['none', 'lt2', '2_5', '5p'],
  education: ['school', 'vocational', 'university'],
  german: ['none', 'A1', 'A2', 'B1', 'B2'],
  licence: ['none', 'B', 'C', 'CE', 'D'],
  family: ['single', 'married', 'married_kids', 'family_in_de'],
  goal: ['work', 'ausbildung', 'study', 'family'],
} as const;
type Question = keyof typeof OPTIONS;
type Answers = Partial<Record<Question, string>>;

/** 7 steps; profession and experience share one. */
const STEPS: Question[][] = [['age'], ['profession', 'experience'], ['education'], ['german'], ['licence'], ['family'], ['goal']];
const ICONS: Record<Question, ReactNode> = {
  age: <User />,
  profession: <Briefcase />,
  experience: <BookOpenCheck />,
  education: <GraduationCap />,
  german: <Languages />,
  licence: <Car />,
  family: <Heart />,
  goal: <Baby />,
};

type Missing = { code: string; [k: string]: string | number };
interface PathResult {
  key: string;
  score: number;
  fit: 'high' | 'medium' | 'low';
  reasons: string[];
  missing: Missing[];
  minWeeks: number;
  maxWeeks: number;
  visa: { slug: string; label: string; title: string } | null;
}

const FIT_CLASS = { high: 'bg-success-bg text-success-fg', medium: 'bg-warning-bg text-warning-fg', low: 'bg-sunken text-muted' } as const;

const PathCard = ({ p, best }: { p: PathResult; best: boolean }) => {
  const { t } = useTranslation();
  const level = (v: string | number) => (v === 'none' ? t('pai.levelNone') : String(v));
  return (
    <article className={clsx('rounded-2xl border p-4 sm:p-5', best ? 'border-primary bg-card shadow-[var(--tv-shadow-raised)] ring-1 ring-primary' : 'border-line bg-card shadow-[var(--tv-shadow-card)]')}>
      <div className="flex flex-wrap items-center gap-2">
        {best && <span className="badge bg-primary text-primary-contrast">{t('pai.quiz.best')}</span>}
        <span className={clsx('badge', FIT_CLASS[p.fit])}>{t(`pai.quiz.fit.${p.fit}`)}</span>
        <span className="text-xs font-semibold text-muted tabular-nums">{p.score}/100</span>
      </div>
      <h3 className="mt-2 font-display text-lg font-semibold text-ink">{t(`pai.paths.${p.key}.title`)}</h3>
      <p className="mt-1 text-sm text-muted">{t(`pai.paths.${p.key}.desc`)}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sunken px-2.5 py-1 text-xs font-semibold text-ink" title={t('pai.quiz.durationHint')}>
        <Clock className="size-3.5 text-muted" aria-hidden /> {t('pai.quiz.duration', { min: p.minWeeks, max: p.maxWeeks })}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {p.reasons.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">{t('pai.quiz.why')}</p>
            <ul className="mt-1 space-y-1 text-sm text-ink">
              {p.reasons.map((r) => (
                <li key={r} className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden /> {t(`pai.reasons.${r}`)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.missing.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">{t('pai.quiz.missing')}</p>
            <ul className="mt-1 space-y-1 text-sm text-ink">
              {p.missing.map((m, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden />
                  {t(`pai.gaps.${m.code}`, { ...m, from: m.from !== undefined ? level(m.from) : undefined })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {p.visa && (
        <Link to={`/visas/${p.visa.slug}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
          {t('pai.quiz.visaLink')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </article>
  );
};

/** /uygunluq-testi — public eligibility quiz with deterministic scoring and an optional AI explanation. */
export default function EligibilityQuiz() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('pai.quiz.title'));
  const lang = toContentLocale(i18n.resolvedLanguage); // tr / uk: English answers
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Answers>({});
  const [paths, setPaths] = useState<PathResult[] | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [busy, setBusy] = useState<false | 'result' | 'explain'>(false);
  const [error, setError] = useState(false);
  const [showLead, setShowLead] = useState(false);

  const fetchResult = async (explain: boolean) => {
    setBusy(explain ? 'explain' : 'result');
    setError(false);
    try {
      const { data } = await api.post<{ paths: PathResult[]; explanation: string | null }>('/public-ai/eligibility', { answers, lang, explain });
      setPaths(data.paths);
      if (explain) setExplanation(data.explanation ?? '');
      // lead scoring (analytics consent only): quiz finished with the best path's fit
      else if (data.paths[0]) trackLead('quiz_done', { fit: data.paths[0].fit });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const current = step >= 0 ? STEPS[step] : [];
  const complete = current.every((q) => answers[q]);
  const last = step === STEPS.length - 1;

  const pick = (q: Question, value: string) => {
    const next = { ...answers, [q]: value };
    setAnswers(next);
    // Single-question steps advance by themselves (not the last one: that shows the result button).
    if (current.length === 1 && !last) window.setTimeout(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 250);
  };

  const restart = () => {
    setAnswers({});
    setPaths(null);
    setExplanation(null);
    setShowLead(false);
    setStep(0);
  };

  const progress = paths ? 100 : step < 0 ? 0 : Math.round((step / STEPS.length) * 100);

  return (
    <>
      <section className="hero-warm border-b border-line pt-28 pb-16 sm:pt-36">
        <div className="container-x text-center">
          <span className="eyebrow">
            <ClipboardCheck className="size-4" aria-hidden /> {t('pai.quiz.cta')}
          </span>
          <h1 className="type-hero mx-auto mt-3 max-w-3xl text-ink">{t('pai.quiz.title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted sm:text-lg">{t('pai.quiz.subtitle')}</p>
        </div>
      </section>

      <section className="relative pb-20">
        <div className="container-x">
          <div className={clsx('relative mx-auto -mt-10 overflow-hidden rounded-3xl border border-line bg-card shadow-[var(--tv-shadow-raised)]', paths ? 'max-w-5xl' : 'max-w-3xl')}>
            <div className="h-1.5 bg-sunken">
              <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="p-5 sm:p-8">
              {paths ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="type-subsection text-ink">{t('pai.quiz.resultTitle')}</h2>
                      {paths[0] && <p className="mt-1 text-sm text-muted">{t('pai.quiz.summary', { path: t(`pai.paths.${paths[0].key}.title`) })}</p>}
                    </div>
                    <button type="button" className="btn-ghost btn-sm" onClick={restart}>
                      <RotateCcw className="size-4" aria-hidden /> {t('pai.quiz.again')}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {paths.map((p, i) => (
                      <PathCard key={p.key} p={p} best={i === 0} />
                    ))}
                  </div>

                  {explanation ? (
                    <div className="rounded-2xl border border-line bg-sunken p-4">
                      <p className="flex items-center gap-2 text-sm font-bold text-ink">
                        <Sparkles className="size-4 text-highlight-fg" aria-hidden /> {t('pai.quiz.explanation')}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-ink/90">{explanation}</p>
                    </div>
                  ) : explanation === null ? (
                    <button type="button" className="btn-ghost btn-sm" disabled={!!busy} onClick={() => void fetchResult(true)}>
                      {busy === 'explain' ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden />} {t('pai.quiz.explain')}
                    </button>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link to="/booking" className="btn-primary">
                      <CalendarCheck className="size-4" aria-hidden /> {t('pai.quiz.consult')}
                    </Link>
                    <Link to="/register" className="btn-ghost">
                      <UserPlus className="size-4" aria-hidden /> {t('pai.quiz.register')}
                    </Link>
                    <button type="button" className="btn-ghost" onClick={() => setShowLead((v) => !v)}>
                      <Send className="size-4" aria-hidden /> {t('pai.quiz.send')}
                    </button>
                  </div>
                  {showLead && <LeadForm source="quiz" answers={answers as Record<string, string>} onCancel={() => setShowLead(false)} />}
                  <p className="text-xs text-muted">{t('pai.quiz.disclaimer')}</p>
                </div>
              ) : step < 0 ? (
                <div className="py-6 text-center">
                  <p className="mx-auto max-w-lg text-sm text-muted">{t('pai.quiz.subtitle')}</p>
                  <button type="button" className="btn-primary mt-6" onClick={() => setStep(0)}>
                    {t('pai.quiz.start')} <ArrowRight className="size-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <div>
                  <p className="type-overline text-muted">{t('pai.quiz.step', { n: step + 1, total: STEPS.length })}</p>
                  {current.map((q) => (
                    <fieldset key={q} className="mt-4">
                      <legend className="font-display text-lg font-semibold text-ink sm:text-xl">{t(`pai.quiz.q.${q}`)}</legend>
                      <div role="radiogroup" className={clsx('mt-3 grid gap-2.5', OPTIONS[q].length > 5 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                        {OPTIONS[q].map((value, i) => (
                          <OptionCard key={value} icon={ICONS[q]} label={t(`pai.quiz.o.${q}.${value}`)} selected={answers[q] === value} index={i} onSelect={() => pick(q, value)} />
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  {error && (
                    <p className="mt-4 text-sm font-medium text-danger-fg" role="alert">
                      {t('pai.bubble.error')}
                    </p>
                  )}
                  <div className="mt-6 flex justify-between gap-3">
                    <button type="button" className="btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
                      <ArrowLeft className="size-4" aria-hidden /> {t('pai.quiz.back')}
                    </button>
                    {last ? (
                      <button type="button" className="btn-primary" disabled={!complete || !!busy} onClick={() => void fetchResult(false)}>
                        {busy === 'result' && <Spinner className="size-4" />} {t('pai.quiz.result')} <ArrowRight className="size-4" aria-hidden />
                      </button>
                    ) : (
                      <button type="button" className="btn-primary" disabled={!complete} onClick={() => setStep((s) => s + 1)}>
                        {t('pai.quiz.next')} <ArrowRight className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
